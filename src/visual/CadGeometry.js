import * as THREE from '../../vendor/three.module.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const halfSpace = (normal, constant) => ({ normal, constant });
const distance = (v, p) => v.p.dot(p.normal) + p.constant;
function clip(poly, plane, sign = 1) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      da = sign * distance(a, plane),
      db = sign * distance(b, plane);
    if (da >= -1e-9) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({
        p: a.p.clone().lerp(b.p, t),
        n: a.n.clone().lerp(b.n, t).normalize(),
      });
    }
  }
  return out;
}
function hull2D(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [],
    hi = [];
  for (const p of pts) {
    while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), p) <= 1e-10) lo.pop();
    lo.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (hi.length > 1 && cross(hi.at(-2), hi.at(-1), p) <= 1e-10) hi.pop();
    hi.push(p);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function capPolygons(vertices, planes) {
  return planes.map((plane) => {
    const normal = plane.normal.clone().normalize();
    const u = V(0, 1, 0).cross(normal);
    if (u.length() < 0.1) u.set(1, 0, 0).cross(normal);
    u.normalize();
    const w = normal.clone().cross(u);
    const unique = new Map();
    for (const p of vertices) {
      if (Math.abs(p.dot(plane.normal) + plane.constant) > 1e-5) continue;
      if (!planes.every((q) => p.dot(q.normal) + q.constant >= -1e-5)) continue;
      const key = p
        .toArray()
        .map((a) => Math.round(a * 1e6))
        .join(',');
      unique.set(key, { x: p.dot(u), y: p.dot(w), p });
    }
    return { normal, poly: hull2D([...unique.values()]).map((a) => a.p) };
  });
}
/** Closed, physically detached control surfaces, split from the actual CAD skin. */
export function splitCadVolume(mesh, planes, { cap = true } = {}) {
  const geo = mesh.geometry,
    pos = geo.attributes.position,
    norm = geo.attributes.normal,
    idx = geo.index;
  const outsideP = Array.from(pos.array),
    outsideN = Array.from(norm.array),
    outsideI = [],
    insideP = [],
    insideN = [];
  const append = (poly, positions, normals, indices = null) => {
    if (poly.length < 3) return;
    const base = positions.length / 3;
    if (indices) {
      for (const v of poly) {
        positions.push(...v.p.toArray());
        normals.push(...v.n.toArray());
      }
      for (let i = 1; i < poly.length - 1; i++)
        indices.push(base, base + i, base + i + 1);
    } else {
      for (let i = 1; i < poly.length - 1; i++)
        for (const v of [poly[0], poly[i], poly[i + 1]]) {
          positions.push(...v.p.toArray());
          normals.push(...v.n.toArray());
        }
    }
  };
  for (let i = 0; i < (idx ? idx.count : pos.count); i += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k));
    const poly = ids.map((k) => ({
      p: new THREE.Vector3().fromBufferAttribute(pos, k),
      n: new THREE.Vector3().fromBufferAttribute(norm, k),
    }));
    if (planes.some((p) => poly.every((v) => distance(v, p) < -1e-8))) {
      outsideI.push(...ids);
      continue;
    }
    let remaining = poly;
    for (const plane of planes) {
      append(clip(remaining, plane, -1), outsideP, outsideN, outsideI);
      remaining = clip(remaining, plane);
      if (!remaining.length) break;
    }
    append(remaining, insideP, insideN);
  }
  const insideVertices = [];
  for (let i = 0; i < insideP.length; i += 3)
    insideVertices.push(V(insideP[i], insideP[i + 1], insideP[i + 2]));
  for (const { normal, poly } of cap
    ? capPolygons(insideVertices, planes)
    : []) {
    if (poly.length < 3) continue;
    // hull is CCW around the inward plane normal. Inside cap faces outward.
    append(
      [...poly].reverse().map((p) => ({ p, n: normal.clone().negate() })),
      insideP,
      insideN,
    );
    append(
      poly.map((p) => ({ p, n: normal })),
      outsideP,
      outsideN,
      outsideI,
    );
  }
  const make = (p, n, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    if (i) g.setIndex(i);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  };
  mesh.geometry = make(outsideP, outsideN, outsideI);
  return make(insideP, insideN);
}
export function boxPlanes(min, max) {
  return [
    halfSpace(V(1, 0, 0), -min.x),
    halfSpace(V(-1, 0, 0), max.x),
    halfSpace(V(0, 1, 0), -min.y),
    halfSpace(V(0, -1, 0), max.y),
    halfSpace(V(0, 0, 1), -min.z),
    halfSpace(V(0, 0, -1), max.z),
  ];
}

/** Small feature-protected Taubin pass; never changes gear bays or hard edges. */
export function smoothCadSkin(
  geometry,
  { limit = 0.0025, passes = 2, protectBays = true } = {},
) {
  const geo = geometry.clone(),
    pos = geo.attributes.position,
    idx = geo.index;
  if (!idx) return geo;
  const original = Float64Array.from(pos.array),
    values = Float64Array.from(pos.array),
    neighbors = Array.from({ length: pos.count }, () => new Set()),
    faces = Array.from({ length: pos.count }, () => []),
    edgeCount = new Map();
  for (let i = 0; i < idx.count; i += 3) {
    const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    const a = new THREE.Vector3().fromBufferAttribute(pos, ids[0]);
    const b = new THREE.Vector3().fromBufferAttribute(pos, ids[1]),
      c = new THREE.Vector3().fromBufferAttribute(pos, ids[2]);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    for (let j = 0; j < 3; j++) {
      const x = ids[j],
        y = ids[(j + 1) % 3];
      neighbors[x].add(y);
      neighbors[y].add(x);
      faces[x].push(n);
      const key = x < y ? `${x},${y}` : `${y},${x}`;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  const fixed = new Uint8Array(pos.count);
  for (const [key, count] of edgeCount) {
    if (count !== 2) for (const i of key.split(',').map(Number)) fixed[i] = 1;
  }
  for (let i = 0; i < pos.count; i++) {
    const x = original[i * 3],
      y = original[i * 3 + 1],
      z = original[i * 3 + 2];
    if (protectBays && Math.abs(x) < 1.6 && y < -0.25 && z > -2.8 && z < 2.2)
      fixed[i] = 1;
    if (faces[i].some((n) => faces[i][0].dot(n) < 0.57)) fixed[i] = 1;
  }
  for (let pass = 0; pass < passes; pass++)
    for (const rate of [0.18, -0.185]) {
      const next = values.slice();
      for (let i = 0; i < pos.count; i++) {
        if (fixed[i] || neighbors[i].size < 3) continue;
        for (let a = 0; a < 3; a++) {
          let average = 0;
          for (const j of neighbors[i]) average += values[j * 3 + a];
          const candidate =
            values[i * 3 + a] +
            rate * (average / neighbors[i].size - values[i * 3 + a]);
          next[i * 3 + a] = THREE.MathUtils.clamp(
            candidate,
            original[i * 3 + a] - limit,
            original[i * 3 + a] + limit,
          );
        }
      }
      values.set(next);
    }
  pos.array.set(values);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}
