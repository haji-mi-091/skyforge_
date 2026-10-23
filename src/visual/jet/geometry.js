/**
 * Small procedural airframe geometry toolkit. Kept independent of any specific
 * aircraft so the F-16 and the MiG-29 share the same construction primitives.
 */
import * as THREE from '../../../vendor/three.module.js';

/** Loft a smooth fuselage through elliptical cross-sections. */
export function loftFuselage(sections, segments = 22, uvRepeat = 1,
  { capStart = true, capEnd = true, cutout = null } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringCount = sections.length;
  const zMin = sections[0].z;
  const zMax = sections[ringCount - 1].z;

  for (let s = 0; s < ringCount; s++) {
    const sec = sections[s];
    const roundness = sec.roundness ?? 0.92;
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      const x = (sec.width ?? 0.1) * Math.sign(cx) * Math.pow(Math.abs(cx), roundness);
      let y = (sec.height ?? 0.1) * Math.sign(sy) * Math.pow(Math.abs(sy), roundness);
      // Flatten the belly slightly, as on most fighters.
      if (y < 0) y *= 0.88;
      positions.push(x + (sec.xOffset ?? 0), y + (sec.y ?? 0), sec.z);
      uvs.push(j / segments, ((sec.z - zMin) / Math.max(0.001, zMax - zMin)) * uvRepeat);
    }
  }
  for (let s = 0; s < ringCount - 1; s++) {
    const zMid = (sections[s].z + sections[s + 1].z) * 0.5;
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      const a = s * segments + j;
      const b = s * segments + j2;
      const c = (s + 1) * segments + j2;
      const d = (s + 1) * segments + j;
      if (cutout) {
        let remove = false;
        if (cutout.ellipse) {
          const { cx = 0, cz, rx, rz, minY = 0.15 } = cutout.ellipse;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          for (const idx of [a, b, c, d]) {
            sx += positions[idx * 3];
            sy += positions[idx * 3 + 1];
            sz += positions[idx * 3 + 2];
          }
          sx /= 4;
          sy /= 4;
          sz /= 4;
          const nx = (sx - cx) / rx;
          const nz = (sz - cz) / rz;
          remove = sy > minY && nx * nx + nz * nz < 1;
        } else {
          const angle = ((j + 0.5) / segments) * Math.PI * 2;
          const diff = Math.abs(
            ((angle - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          remove = zMid > cutout.zMin && zMid < cutout.zMax &&
            diff < (cutout.halfAngle ?? 0.78);
        }
        if (remove) continue;
      }
      indices.push(a, b, c, a, c, d);
    }
  }

  // End caps. Intake cowls keep the front open so the dark duct is visible.
  const first = sections[0];
  const last = sections[ringCount - 1];
  if (capStart) {
    const startCenter = positions.length / 3;
    positions.push(first.xOffset ?? 0, first.y ?? 0, first.z);
    uvs.push(0.5, 0);
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      indices.push(startCenter, j2, j);
    }
  }
  if (capEnd) {
    const endCenter = positions.length / 3;
    positions.push(last.xOffset ?? 0, last.y ?? 0, last.z);
    uvs.push(0.5, uvRepeat);
    const lastRing = (ringCount - 1) * segments;
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      indices.push(endCenter, lastRing + j, lastRing + j2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build a horizontal airfoil wing from spanwise sections.
 * Each section: { x, y, zLE, zTE, thickness (t/c), camber? }
 */
export function buildWing(sections, { chordSegments = 7, closeTip = true } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const spanMin = sections[0].x;
  const spanMax = sections[sections.length - 1].x;
  const ringSize = (chordSegments + 1) * 2;
  const chord = (sec) => sec.zTE - sec.zLE;

  function sectionRing(sec) {
    const c = chord(sec);
    const camber = sec.camber ?? 0;
    const ring = [];
    // Leading edge point.
    ring.push({ t: 0, y: sec.y + camber * 0.25, z: sec.zLE });
    // Upper surface.
    for (let i = 0; i < chordSegments; i++) {
      const t = 0.02 + (i / chordSegments) * 0.96;
      const yt = 5 * sec.thickness * c * (
        0.2969 * Math.sqrt(Math.max(0, t)) - 0.1260 * t -
        0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t);
      ring.push({ t, y: sec.y + camber * (t - t * t) + yt, z: sec.zLE + c * t });
    }
    // Trailing edge.
    ring.push({ t: 1, y: sec.y, z: sec.zTE });
    // Lower surface, back to the leading edge.
    for (let i = chordSegments - 1; i >= 0; i--) {
      const t = 0.02 + (i / chordSegments) * 0.96;
      const yt = 5 * sec.thickness * c * (
        0.2969 * Math.sqrt(Math.max(0, t)) - 0.1260 * t -
        0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t);
      ring.push({ t, y: sec.y + camber * (t - t * t) - yt, z: sec.zLE + c * t });
    }
    return ring;
  }

  const rings = sections.map(sectionRing);
  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const spanU = (sec.x - spanMin) / Math.max(0.001, spanMax - spanMin);
    for (let j = 0; j < ringSize; j++) {
      const p = rings[s][j];
      positions.push(sec.x, p.y, p.z);
      uvs.push(p.t * 2.1, spanU * 2.8);
    }
  }
  for (let s = 0; s < sections.length - 1; s++) {
    for (let j = 0; j < ringSize; j++) {
      const j2 = (j + 1) % ringSize;
      const a = s * ringSize + j;
      const b = s * ringSize + j2;
      const c = (s + 1) * ringSize + j2;
      const d = (s + 1) * ringSize + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  if (closeTip) {
    for (const end of [0, sections.length - 1]) {
      const base = end * ringSize;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let j = 0; j < ringSize; j++) {
        cx += positions[(base + j) * 3];
        cy += positions[(base + j) * 3 + 1];
        cz += positions[(base + j) * 3 + 2];
      }
      const centerIndex = positions.length / 3;
      positions.push(cx / ringSize, cy / ringSize, cz / ringSize);
      uvs.push(0.5, end === 0 ? 0 : 1);
      for (let j = 0; j < ringSize; j++) {
        const j2 = (j + 1) % ringSize;
        if (end === 0) indices.push(centerIndex, base + j, base + j2);
        else indices.push(centerIndex, base + j2, base + j);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Vertical fin using the same airfoil idea, lofted along Y. */
export function buildFin(sections, { chordSegments = 6 } = {}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringSize = (chordSegments + 1) * 2;
  const yMin = sections[0].y;
  const yMax = sections[sections.length - 1].y;

  function ringFor(sec) {
    const c = sec.zTE - sec.zLE;
    const ring = [];
    ring.push({ t: 0, x: 0, z: sec.zLE });
    for (let i = 0; i < chordSegments; i++) {
      const t = 0.02 + (i / chordSegments) * 0.96;
      const xt = 5 * sec.thickness * c * (
        0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t +
        0.2843 * t * t * t - 0.1015 * t * t * t * t);
      ring.push({ t, x: xt, z: sec.zLE + c * t });
    }
    ring.push({ t: 1, x: 0, z: sec.zTE });
    for (let i = chordSegments - 1; i >= 0; i--) {
      const t = 0.02 + (i / chordSegments) * 0.96;
      const xt = 5 * sec.thickness * c * (
        0.2969 * Math.sqrt(t) - 0.1260 * t - 0.3516 * t * t +
        0.2843 * t * t * t - 0.1015 * t * t * t * t);
      ring.push({ t, x: -xt, z: sec.zLE + c * t });
    }
    return ring;
  }
  const rings = sections.map(ringFor);
  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const v = (sec.y - yMin) / Math.max(0.001, yMax - yMin);
    for (let j = 0; j < ringSize; j++) {
      const p = rings[s][j];
      positions.push(p.x, sec.y, p.z);
      uvs.push(p.t * 2, v * 2);
    }
  }
  for (let s = 0; s < sections.length - 1; s++) {
    for (let j = 0; j < ringSize; j++) {
      const j2 = (j + 1) % ringSize;
      const a = s * ringSize + j;
      const b = s * ringSize + j2;
      const c = (s + 1) * ringSize + j2;
      const d = (s + 1) * ringSize + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  for (const end of [0, sections.length - 1]) {
    const base = end * ringSize;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let j = 0; j < ringSize; j++) {
      cx += positions[(base + j) * 3];
      cy += positions[(base + j) * 3 + 1];
      cz += positions[(base + j) * 3 + 2];
    }
    const idx = positions.length / 3;
    positions.push(cx / ringSize, cy / ringSize, cz / ringSize);
    uvs.push(0.5, end === 0 ? 0 : 1);
    for (let j = 0; j < ringSize; j++) {
      const j2 = (j + 1) % ringSize;
      if (end === 0) indices.push(idx, base + j2, base + j);
      else indices.push(idx, base + j, base + j2);
    }
  }
  // The fin's parametric winding faces inward; flip it once before normals.
  for (let i = 0; i < indices.length; i += 3) {
    const t = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = t;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Thin tapered control surface whose hinge is at local z = 0. */
export function buildControlPlate(xInner, xOuter, chord, thickness, taper = 0.75) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const xin = xInner;
  const xout = xOuter;
  const cIn = chord;
  const cOut = chord * taper;
  // top surface
  positions.push(
    xin, thickness / 2, 0,
    xout, thickness / 2, 0,
    xout, thickness / 2, cOut,
    xin, thickness / 2, cIn,
    // bottom
    xin, -thickness / 2, 0,
    xout, -thickness / 2, 0,
    xout, -thickness / 2, cOut,
    xin, -thickness / 2, cIn,
    // leading edge
    xin, 0, 0,
    xout, 0, 0,
    // trailing edge
    xin, 0, cIn,
    xout, 0, cOut,
  );
  uvs.push(0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1,
    0, 0.5, 1, 0.5, 0, 0.5, 1, 0.5);
  indices.push(
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 9, 8, 0, 1, 9,
    8, 5, 4, 8, 9, 5,
    3, 11, 2, 3, 10, 11,
    10, 6, 7, 10, 11, 6,
    0, 10, 3, 0, 8, 10,
    8, 6, 10, 8, 4, 6,
    1, 2, 11, 1, 11, 9,
    9, 11, 7, 9, 7, 5,
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Build a flat, slightly thick planform plate from [x,z] points. */
export function buildPlanform(points, thickness = 0.06) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    positions.push(points[i][0], thickness / 2, points[i][1]);
    uvs.push(i / n, 1);
  }
  for (let i = 0; i < n; i++) {
    positions.push(points[i][0], -thickness / 2, points[i][1]);
    uvs.push(i / n, 0);
  }
  // outlines / sides
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, n + i, j, n + j, n + i);
  }
  // top and bottom triangulation (fan; planforms are convex enough)
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1);
    indices.push(n, n + i + 1, n + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function mirrorGeometryX(geometry) {
  const g = geometry.clone();
  g.scale(-1, 1, 1);
  const index = g.getIndex();
  if (index) {
    const arr = index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Rounded-rectangle intake lip. The outer and inner superellipses are the exact
 * first ring of the cowl/duct, so the lip cannot float away from the cowl.
 */
export function buildIntakeLipGeometry({
  outerWidth, outerHeight, innerWidth, innerHeight,
  depth = 0.1, roundness = 0.62, segments = 48,
}) {
  const outline = (width, height, path) => {
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const cx = Math.cos(a);
      const sy = Math.sin(a);
      const x = width * Math.sign(cx) * Math.pow(Math.abs(cx), roundness);
      const y = height * Math.sign(sy) * Math.pow(Math.abs(sy), roundness);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
  };
  const shape = new THREE.Shape();
  outline(outerWidth, outerHeight, shape);
  const hole = new THREE.Path();
  outline(innerWidth, innerHeight, hole);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.014,
    bevelThickness: 0.014,
    bevelSegments: 2,
    curveSegments: 4,
  });
  // Extrude grows toward +Z; put the finished front face at local z = 0.
  geo.translate(0, 0, -depth);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Bubble canopy shell. In side view it is a long circular-arc segment; the
 * front/rear cross-sections are a 270° arc of a small ellipse (the bottom
 * quarter is the open sill). Coordinates are local: Z=0 at the canopy centre,
 * Y=0 at the cockpit sill plane.
 */
export function buildBubbleCanopy({
  frontZ, rearZ, rimY, rimTilt = 0, halfWidth, halfHeight,
  baseScale = 0.10, peakFraction = 0.40, sillOffset = 0,
  lengthSegments = 40, arcSegments = 44,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const zc = (frontZ + rearZ) * 0.5;
  const halfLength = (rearZ - frontZ) * 0.5;
  const peakZ = frontZ + (rearZ - frontZ) * peakFraction;
  const frontRun = Math.max(1e-4, peakZ - frontZ);
  const rearRun = Math.max(1e-4, rearZ - peakZ);
  const thetaStart = -Math.PI / 4;
  const thetaLength = Math.PI * 1.5;
  for (let i = 0; i <= lengthSegments; i++) {
    const u = i / lengthSegments;
    const zRel = -halfLength + 2 * halfLength * u;
    const z = frontZ + (rearZ - frontZ) * u;
    // Parabolic side envelope: finite slope at both ends, so the windscreen
    // can sit at ~30° instead of dropping vertically at the nose.
    const endT = z <= peakZ
      ? (z - frontZ) / frontRun
      : (rearZ - z) / rearRun;
    const arch = Math.max(0, 1 - (1 - endT) * (1 - endT));
    const a = halfWidth * (baseScale + (1 - baseScale) * arch);
    const b = halfHeight * (baseScale + (1 - baseScale) * arch);
    const sillY = (rimY + sillOffset) * Math.cos(rimTilt) -
      zRel * Math.sin(rimTilt);
    const yc = sillY + b * Math.SQRT1_2;
    for (let j = 0; j <= arcSegments; j++) {
      const theta = thetaStart + (j / arcSegments) * thetaLength;
      positions.push(
        Math.cos(theta) * a,
        yc + Math.sin(theta) * b,
        zRel);
      uvs.push(u, j / arcSegments);
    }
  }
  const row = arcSegments + 1;
  for (let i = 0; i < lengthSegments; i++) {
    for (let j = 0; j < arcSegments; j++) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geometry: geo, zc, thetaStart, thetaLength };
}

/** Simple segmented convergent nozzle petals, open at the rear. */
export function buildNozzlePetals({
  segments = 14, radiusFront = 0.56, radiusRear = 0.46,
  zFront = 0.0, zRear = 0.62, gap = 0.1,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    const a0 = i * step + step * gap;
    const a1 = (i + 1) * step - step * gap;
    const base = positions.length / 3;
    for (const [a, r, z] of [
      [a0, radiusFront, zFront], [a1, radiusFront, zFront],
      [a1, radiusRear, zRear], [a0, radiusRear, zRear],
    ]) {
      positions.push(Math.cos(a) * r, Math.sin(a) * r, z);
      uvs.push(i / segments, z === zFront ? 0 : 1);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function makeCylinderBetween(a, b, radius, material, segments = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, segments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}
