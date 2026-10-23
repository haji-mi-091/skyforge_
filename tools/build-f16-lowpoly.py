#!/usr/bin/env python3
"""Build a low-poly indexed GLB from the SolidWorks F-16 component STLs.

This keeps the high-detail STL/GLB as a backup and writes the game LOD to
assets/models/f16/f16_cad_low.glb. Materials and node names stay separated so
the landing gear, canopy and missiles can be animated/hidden later.

Requires: pip install fast-simplification trimesh
"""
from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

import numpy as np
import trimesh
import fast_simplification

TARGET_LENGTH_M = 15.06
TARGET_RATIO = 0.20
MIN_FACES_TO_SIMPLIFY = 1200


def material_for(name: str) -> str:
    n = name.lower()
    if "canopi" in n or "canopy" in n:
        return "canopy"
    if "tyre" in n or "wheel" in n:
        return "tire"
    if "missile" in n:
        return "missile"
    if "shock" in n or "shoc" in n:
        return "metal"
    if "propeller" in n:
        return "propeller"
    return "body"


def add_view(buffer: bytearray, payload: bytes, target: int | None) -> tuple[int, int]:
    while len(buffer) % 4:
        buffer.append(0)
    offset = len(buffer)
    buffer.extend(payload)
    return offset, offset + len(payload)


def vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    out = np.zeros_like(vertices, dtype=np.float64)
    tri = vertices[faces]
    face_n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    for k in range(3):
        np.add.at(out, faces[:, k], face_n)
    lens = np.linalg.norm(out, axis=1, keepdims=True)
    return (out / np.maximum(lens, 1e-10)).astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default=r"D:\F 16\export")
    parser.add_argument("--out", default=str(
        Path(__file__).resolve().parents[1] /
        "assets" / "models" / "f16" / "f16_cad_low.glb"))
    parser.add_argument("--high", default=str(
        Path(__file__).resolve().parents[1] /
        "assets" / "models" / "f16" / "f16_cad_high.glb"))
    args = parser.parse_args()
    src = Path(args.src)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    files = sorted({p.resolve() for p in src.iterdir()
                    if p.is_file() and p.suffix.lower() == ".stl"})
    if not files:
        raise SystemExit(f"No STL files in {src}")

    loaded = []
    for p in files:
        mesh = trimesh.load(p, force="mesh", process=True)
        if mesh.vertices.shape[0] == 0 or mesh.faces.shape[0] == 0:
            continue
        if "body_2" in p.stem.lower():
            # Body_2 contains the wing/fin/control-surface solids. Keep the
            # disconnected solids as real movable CAD parts instead of
            # inventing separate panels.
            for index, part in enumerate(mesh.split(only_watertight=False)):
                if len(part.faces) >= 20:
                    loaded.append((f"{p.stem}_cc{index:02d}", part))
        else:
            loaded.append((p.stem, mesh))
    bounds = np.concatenate([m.vertices for _, m in loaded], axis=0)
    lo = bounds.min(axis=0)
    hi = bounds.max(axis=0)
    center = (lo + hi) * 0.5
    scale = TARGET_LENGTH_M / max(1e-6, float(hi[2] - lo[2]))

    materials = [
        {"name": "body", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.20, 0.22, 0.21, 1.0],
            "metallicFactor": 0.32, "roughnessFactor": 0.60}},
        {"name": "canopy", "alphaMode": "BLEND", "doubleSided": True,
         "pbrMetallicRoughness": {
             "baseColorFactor": [0.20, 0.43, 0.55, 0.42],
             "metallicFactor": 0.05, "roughnessFactor": 0.16}},
        {"name": "tire", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.018, 0.018, 0.018, 1.0],
            "metallicFactor": 0.0, "roughnessFactor": 0.92}},
        {"name": "missile", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.73, 0.73, 0.68, 1.0],
            "metallicFactor": 0.10, "roughnessFactor": 0.48}},
        {"name": "metal", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.24, 0.26, 0.25, 1.0],
            "metallicFactor": 0.78, "roughnessFactor": 0.38}},
        {"name": "propeller", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.07, 0.07, 0.07, 1.0],
            "metallicFactor": 0.40, "roughnessFactor": 0.52}},
    ]
    material_index = {m["name"]: i for i, m in enumerate(materials)}

    binary = bytearray()
    views = []
    accessors = []
    meshes = []
    nodes = []
    total_tris = 0
    for name, mesh in loaded:
        v = np.asarray(mesh.vertices, dtype=np.float32)
        f = np.asarray(mesh.faces, dtype=np.int32)
        # The main Body_2 solid contains the intake lip and duct. Aggressive
        # quadric decimation collapsed that thin, high-curvature surface into
        # jagged shards. Keep the original topology for this one solid; the
        # smaller detached surfaces still get the low-poly treatment.
        preserve_body = "cc52" in name.lower()
        if len(f) >= MIN_FACES_TO_SIMPLIFY and not preserve_body:
            reduction = 1.0 - TARGET_RATIO
            v2, f2 = fast_simplification.simplify(
                v, f, target_reduction=reduction)
            v = np.asarray(v2, dtype=np.float32)
            f = np.asarray(f2, dtype=np.int32)
        # CAD nose is +Z; rotate 180 degrees so game-forward is -Z.
        p = (v.astype(np.float64) - center) * scale
        p[:, 0] *= -1.0
        p[:, 2] *= -1.0
        p = p.astype(np.float32)
        n = vertex_normals(p, f)
        indices = np.ascontiguousarray(f.reshape(-1), dtype=np.uint32)
        pos_bytes = p.tobytes()
        norm_bytes = n.tobytes()
        idx_bytes = indices.tobytes()
        pos_off, pos_end = add_view(binary, pos_bytes, 34962)
        norm_off, norm_end = add_view(binary, norm_bytes, 34962)
        idx_off, idx_end = add_view(binary, idx_bytes, 34963)
        views += [
            {"buffer": 0, "byteOffset": pos_off,
             "byteLength": pos_end - pos_off, "target": 34962},
            {"buffer": 0, "byteOffset": norm_off,
             "byteLength": norm_end - norm_off, "target": 34962},
            {"buffer": 0, "byteOffset": idx_off,
             "byteLength": idx_end - idx_off, "target": 34963},
        ]
        accessors += [
            {"bufferView": len(views) - 3, "componentType": 5126,
             "count": len(p), "type": "VEC3",
             "min": p.min(axis=0).tolist(),
             "max": p.max(axis=0).tolist()},
            {"bufferView": len(views) - 2, "componentType": 5126,
             "count": len(n), "type": "VEC3"},
            {"bufferView": len(views) - 1, "componentType": 5125,
             "count": len(indices), "type": "SCALAR"},
        ]
        meshes.append({"name": name, "primitives": [{
            "attributes": {"POSITION": len(accessors) - 3,
                           "NORMAL": len(accessors) - 2},
            "indices": len(accessors) - 1,
            "material": material_index[material_for(name)],
            "mode": 4,
        }]})
        nodes.append({"name": name, "mesh": len(meshes) - 1})
        total_tris += len(f)

    gltf = {
        "asset": {"version": "2.0",
                  "generator": "Skyforge F-16 low-poly STL converter"},
        "scene": 0,
        "scenes": [{"name": "F-16CM Block 52", "nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
        "extras": {
            "source": "SolidWorks Body Assy.SLDASM",
            "lod": "low",
            "targetLengthM": TARGET_LENGTH_M,
            "triangles": total_tris,
            "coordinateSystem": "+Y up, -Z forward, metres",
        },
    }
    while len(binary) % 4:
        binary.append(0)
    gltf["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bytes(binary)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with out.open("wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        fh.write(json_bytes)
        fh.write(struct.pack("<I4s", len(bin_bytes), b"BIN\0"))
        fh.write(bin_bytes)
    high = Path(args.high)
    summary = {
        "output": str(out),
        "high": str(high),
        "parts": len(loaded),
        "triangles": total_tris,
        "bytes": out.stat().st_size,
        "scale": float(scale),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
