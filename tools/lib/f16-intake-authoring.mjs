// Offline intake fitting only. Never imported by the game.
import * as THREE from '../../vendor/three.module.js';
import {splitCadVolume,halfSpace} from '../../src/visual/CadGeometry.js';
import {noseBayRoof} from '../../src/visual/F16Intake.js';
const V=(x,y,z)=>new THREE.Vector3(x,y,z),CX=.0075;
// Smooth inward rise behind the inlet lip, above the independent nose well.
export const INTAKE_SECTIONS = [
  { z: -2.68, y: -1.08, rx: 0.55, ry: 0.329, topRy: 0.079 },
  { z: -2.48, y: -1.04, rx: 0.555, ry: 0.245, topRy: 0.12 },
  ...[-2.38, -2.2, -2.04, -1.98, -1.31].map((z) => ({
    z,
    y: noseBayRoof(z) + 0.02 + 0.225,
    rx: 0.565,
    ry: 0.225,
  })),
  { z: -0.75, y: -0.5, rx: 0.58, ry: 0.37 },
  { z: 0.15, y: -0.49, rx: 0.56, ry: 0.485 },
  { z: 1.4, y: -0.54, rx: 0.53, ry: 0.515 },
];

// Work against the actual CAD cross-section, including its narrow connection
// between the inlet fairing and fuselage. An ellipse alone bridges that recess.
function sectionSegments(geometry, z) {
  const p = geometry.attributes.position,
    idx = geometry.index,
    segments = [];
  for (let i = 0; i < (idx ? idx.count : p.count); i += 3) {
    const v = [0, 1, 2].map((k) =>
      V().fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k),
    );
    if (v.every((a) => a.z < z) || v.every((a) => a.z > z)) continue;
    const hits = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k],
        b = v[(k + 1) % 3];
      if (Math.abs(a.z - b.z) < 1e-9) continue;
      const t = (z - a.z) / (b.z - a.z);
      if (t >= 0 && t <= 1) hits.push(a.clone().lerp(b, t));
    }
    if (hits.length === 2 && hits[0].distanceToSquared(hits[1]) > 1e-16)
      segments.push(hits);
  }
  return segments;
}
function chord(segments, y) {
  const xs = [];
  for (const [a, b] of segments) {
    if (Math.abs(a.y - b.y) < 1e-9) continue;
    const t = (y - a.y) / (b.y - a.y);
    if (t >= 0 && t <= 1) xs.push(a.x + (b.x - a.x) * t);
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}
function mouthPoint(segments, t, z) {
  const origin = V(CX, -1.2, z),
    d = V(Math.cos(t), Math.sin(t), 0);
  let best = Infinity;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  for (const [a, b] of segments) {
    const e = b.clone().sub(a),
      rel = a.clone().sub(origin),
      den = cross(d, e);
    if (Math.abs(den) < 1e-10) continue;
    const along = cross(rel, e) / den,
      u = cross(rel, d) / den;
    if (along > 1e-6 && u >= -1e-7 && u <= 1 + 1e-7)
      best = Math.min(best, along);
  }
  if (!Number.isFinite(best))
    throw new Error('Missing CAD inlet lip cross-section');
  return origin.addScaledVector(d, best - 0.0005);
}
export function fittedSections(body) {
  const sections = [];
  for (let i = 0; i < INTAKE_SECTIONS.length; i++) {
    const a = INTAKE_SECTIONS[i],
      b = INTAKE_SECTIONS[i + 1];
    sections.push({ ...a });
    if (!b) break;
    const count = a.z < -1.98 ? Math.ceil((b.z - a.z) / 0.045) : 1;
    for (let k = 1; k < count; k++) {
      const f = k / count;
      sections.push({
        z: THREE.MathUtils.lerp(a.z, b.z, f),
        y: THREE.MathUtils.lerp(a.y, b.y, f),
        rx: THREE.MathUtils.lerp(a.rx, b.rx, f),
        ry: THREE.MathUtils.lerp(a.ry, b.ry, f),
        topRy: THREE.MathUtils.lerp(a.topRy ?? a.ry, b.topRy ?? b.ry, f),
      });
    }
  }
  for (const s of sections) {
    const segments = sectionSegments(body.geometry, s.z);

    // Preserve 25 mm of material at the outer shell, rather than cutting
    // through it to accommodate an oversized inner tube.
    for (let i = 0; i < 256; i++) {
      const t = (i * Math.PI) / 128,
        c = Math.cos(t),
        y = s.y + (Math.sin(t) > 0 ? (s.topRy ?? s.ry) : s.ry) * Math.sin(t);
      if (Math.abs(c) < 1e-6) continue;
      const range = chord(segments, y);
      if (!range) continue;
      const half = Math.min(CX - range[0], range[1] - CX) - 0.025;
      s.rx = Math.min(s.rx, Math.max(0.05, half) / Math.abs(c));
    }
    if (s.z <= -2.48) {
      const blend = THREE.MathUtils.smoothstep(s.z, -2.68, -2.48);
      s.outline = Array.from({ length: 64 }, (_, i) => {
        const t = (i * Math.PI) / 32,
          lip = mouthPoint(segments, t, s.z),
          target = crossPoint(s, t);
        return lip.lerp(target, blend);
      });
    }
  }
  return sections;
}
function crossPoint(s, t, scale = 1) {
  if (s.outline) {
    const index = ((((t / (Math.PI * 2)) * 64) % 64) + 64) % 64,
      i = Math.floor(index),
      p = s.outline[i].clone().lerp(s.outline[(i + 1) % 64], index - i);
    p.x = CX + (p.x - CX) * scale;
    p.y = -1.2 + (p.y + 1.2) * scale;
    return p;
  }
  return V(
    CX + s.rx * scale * Math.cos(t),
    s.y + (Math.sin(t) > 0 ? (s.topRy ?? s.ry) : s.ry) * scale * Math.sin(t),
    s.z,
  );
}

/** Remove only faces seen from inside the old channel. The exterior skin and
 * original lip are retained, including their normals, weathering and seams. */
export function replaceInnerWall(body, start, end) {
  const g = body.geometry,
    p = g.attributes.position,
    n = g.attributes.normal,
    idx = g.index;
  const view = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const ray = new THREE.Raycaster(),
    keep = [],
    inner = [];
  for (let i = 0; i < (idx ? idx.count : p.count); i += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k)),
      v = ids.map((k) => V().fromBufferAttribute(p, k));
    const center = v[0]
      .clone()
      .add(v[1])
      .add(v[2])
      .multiplyScalar(1 / 3);
    const normal = v[1]
        .clone()
        .sub(v[0])
        .cross(v[2].clone().sub(v[0]))
        .normalize(),
      origin = V(CX, -1.2, center.z),
      toward = origin.clone().sub(center);
    let inside = false;
    if (
      center.z > start - 0.3 &&
      center.z < end + 0.3 &&
      center.y < -0.88 &&
      Math.abs(center.x - CX) < 0.65 &&
      normal.dot(toward) > 0.01
    ) {
      ray.set(origin, toward.clone().negate().normalize());
      const hit = ray.intersectObject(view, false)[0];
      inside = !!hit && Math.abs(hit.distance - toward.length()) < 0.0001;
    }
    (inside ? inner : keep).push(...ids);
  }
  const oldInside = new THREE.BufferGeometry();
  oldInside.setAttribute('position', p);
  oldInside.setAttribute('normal', n);
  oldInside.setIndex(inner);
  const holder = new THREE.Mesh(oldInside);
  splitCadVolume(
    holder,
    [halfSpace(V(0, 0, 1), -start), halfSpace(V(0, 0, -1), end)],
    { cap: false },
  );
  const outside = holder.geometry,
    base = p.count,
    positions = [...p.array, ...outside.attributes.position.array],
    normals = [...n.array, ...outside.attributes.normal.array];
  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex([
    ...keep,
    ...Array.from(outside.index.array, (i) => i + base),
  ]);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  body.geometry = merged;
  view.material.dispose();
  return {
    retainedExteriorTriangles: keep.length / 3,
    replacedInteriorTriangles: inner.length / 3,
  };
}

export function linerGeometry(sections, N = 32) {
  const pos = [],
    uv = [],
    idx = [];
  for (let j = 0; j < sections.length; j++)
    for (let i = 0; i <= N; i++) {
      const p = crossPoint(sections[j], (i / N) * Math.PI * 2);
      pos.push(...p.toArray());
      uv.push(i / N, j / (sections.length - 1));
    }
  for (let j = 0; j < sections.length - 1; j++)
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i,
        b = a + N + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
