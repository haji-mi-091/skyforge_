#!/usr/bin/env python3
"""Convert the exported SolidWorks F-16 STL parts into one game-ready GLB.

Source:
  D:\\F 16\\export\\*.STL
  (the SolidWorks assembly SaveAs exports one STL per component, already in
   assembly coordinates)

Output:
  skyforge/assets/models/f16/f16_cad.glb

Coordinate convention in the GLB:
  +Y = up, -Z = nose/forward. STL is centred and scaled to a 15.06 m
  overall length, then rotated 180 degrees around Y.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
from pathlib import Path

import numpy as np

TARGET_LENGTH_M = 15.06


def read_stl(path: Path) -> np.ndarray:
    data = path.read_bytes()
    if len(data) < 84:
        raise ValueError(f"STL too short: {path}")
    count = struct.unpack_from("<I", data, 80)[0]
    expected = 84 + count * 50
    if expected <= len(data) and data[:5].lower() != b"solid":
        rec = np.frombuffer(data, dtype=np.uint8, count=count * 50,
                            offset=84).reshape(-1, 50)
        # 12 float32 values: normal xyz + 3 vertices xyz.
        values = rec[:, 12:48].copy().view("<f4").reshape(-1, 3, 3)
        return values.astype(np.float32)
    # ASCII fallback
    verts = []
    for line in data.decode("ascii", "ignore").splitlines():
        bits = line.split()
        if len(bits) == 4 and bits[0].lower() == "vertex":
            verts.append([float(bits[1]), float(bits[2]), float(bits[3])])
    if len(verts) % 3:
        raise ValueError(f"Malformed ASCII STL: {path}")
    return np.asarray(verts, dtype=np.float32).reshape(-1, 3, 3)


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


def add_buffer(buffer: bytearray, payload: bytes, target: int | None) -> int:
    while len(buffer) % 4:
        buffer.append(0)
    offset = len(buffer)
    buffer.extend(payload)
    return offset, offset + len(payload)


def align4(n: int) -> int:
    return (n + 3) & ~3


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default=r"D:\F 16\export")
    parser.add_argument("--out", default=str(
        Path(__file__).resolve().parents[1] /
        "assets" / "models" / "f16" / "f16_cad.glb"))
    args = parser.parse_args()
    src = Path(args.src)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    files = sorted({p.resolve() for p in src.iterdir()
                    if p.is_file() and p.suffix.lower() == ".stl"})
    if not files:
        raise SystemExit(f"No STL files in {src}")

    parts = []
    all_vertices = []
    for path in files:
        triangles = read_stl(path)
        if len(triangles) == 0:
            continue
        parts.append((path.stem, triangles))
        all_vertices.append(triangles.reshape(-1, 3))
    vertices = np.concatenate(all_vertices, axis=0)
    lo = vertices.min(axis=0)
    hi = vertices.max(axis=0)
    span = np.maximum(hi - lo, 1e-6)
    scale = TARGET_LENGTH_M / span[2]
    center = (lo + hi) * 0.5

    materials = [
        {"name": "body", "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": [0.34, 0.37, 0.36, 1.0],
            "metallicFactor": 0.28, "roughnessFactor": 0.62}},
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
    buffer_views = []
    accessors = []
    meshes = []
    nodes = []
    total_triangles = 0
    for name, triangles in parts:
        # CAD nose is +Z; game-forward is -Z, so rotate 180 degrees around Y.
        p = (triangles - center) * scale
        p[:, :, 0] *= -1.0
        p[:, :, 2] *= -1.0
        # Per-face normals from the triangle winding.
        e1 = p[:, 1] - p[:, 0]
        e2 = p[:, 2] - p[:, 0]
        n = np.cross(e1, e2)
        length = np.linalg.norm(n, axis=1, keepdims=True)
        n = n / np.maximum(length, 1e-8)
        positions = np.ascontiguousarray(p.reshape(-1, 3), dtype=np.float32)
        normals = np.ascontiguousarray(
            np.repeat(n, 3, axis=0), dtype=np.float32)
        pos_bytes = positions.tobytes()
        norm_bytes = normals.tobytes()
        pos_offset, pos_end = add_buffer(binary, pos_bytes, 34962)
        norm_offset, norm_end = add_buffer(binary, norm_bytes, 34962)
        buffer_views.append({"buffer": 0, "byteOffset": pos_offset,
                             "byteLength": pos_end - pos_offset,
                             "target": 34962})
        buffer_views.append({"buffer": 0, "byteOffset": norm_offset,
                             "byteLength": norm_end - norm_offset,
                             "target": 34962})
        pmin = positions.min(axis=0).tolist()
        pmax = positions.max(axis=0).tolist()
        accessors.append({"bufferView": len(buffer_views) - 2,
                          "componentType": 5126, "count": len(positions),
                          "type": "VEC3", "min": pmin, "max": pmax})
        accessors.append({"bufferView": len(buffer_views) - 1,
                          "componentType": 5126, "count": len(normals),
                          "type": "VEC3"})
        # Name the material bucket using the component's original filename.
        part_material = material_for(name)
        meshes.append({"name": name, "primitives": [{
            "attributes": {"POSITION": len(accessors) - 2,
                           "NORMAL": len(accessors) - 1},
            "material": material_index[part_material],
            "mode": 4,
        }]})
        nodes.append({"name": name, "mesh": len(meshes) - 1})
        total_triangles += len(triangles)

    gltf = {
        "asset": {"version": "2.0", "generator": "Skyforge CAD STL converter"},
        "scene": 0,
        "scenes": [{"name": "F-16 CAD", "nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(binary)}],
        "extras": {
            "source": "SolidWorks Body Assy.SLDASM",
            "targetLengthM": TARGET_LENGTH_M,
            "coordinateSystem": "+Y up, -Z forward, metres",
        },
    }
    while len(binary) % 4:
        binary.append(0)
    gltf["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * (align4(len(json_bytes)) - len(json_bytes))
    bin_bytes = bytes(binary)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with out.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(json_bytes), b"JSON"))
        f.write(json_bytes)
        f.write(struct.pack("<I4s", len(bin_bytes), b"BIN\0"))
        f.write(bin_bytes)
    print(json.dumps({
        "output": str(out),
        "bytes": out.stat().st_size,
        "parts": len(parts),
        "triangles": total_triangles,
        "sourceBounds": {"min": [float(x) for x in lo],
                          "max": [float(x) for x in hi]},
        "scale": float(scale),
    }, indent=2))


if __name__ == "__main__":
    main()
