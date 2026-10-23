import * as THREE from '../../vendor/three.module.js';
import {
  splitCadVolume,
  boxPlanes,
  halfSpace,
  smoothCadSkin,
} from './CadGeometry.js';
const D = Math.PI / 180,
  V = (x, y, z) => new THREE.Vector3(x, y, z);
function rig(cad, geometry, material, kind, side, hinge, axis) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `f16-${kind}-${side}`;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  cad.add(mesh);
  return {
    kind,
    side,
    hinge,
    axis: axis.normalize(),
    parts: [{ mesh, baseMatrix: new THREE.Matrix4() }],
    angle: 0,
    target: 0,
  };
}
export function cleanF16Cad(nodes) {
  const removed = [];
  for (const node of nodes) {
    const match = /cc(\d+)$/.exec(node.name);
    const id = match ? Number(match[1]) : -1;
    // Duplicate nozzle petals, unused cockpit construction blocks and rack beams.
    if (
      (id >= 0 && id <= 10) ||
      id === 60 ||
      [
        12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32, 33,
        34, 35, 36, 54, 55, 56, 57, 58, 59, 63, 64, 65, 66, 67, 68,
      ].includes(id)
    ) {
      node.parent?.remove(node);
      removed.push(node.name);
    }
  }
  return removed;
}
export function prepareF16SkinGeometry(nodes) {
  for (const node of nodes) {
    if (!node.parent || !node.geometry) continue;
    if (/cc52$/.test(node.name)) {
      if(!node.userData.f16SkinPrepared)node.geometry = smoothCadSkin(node.geometry);
    }
    else if (/canopi|rear stabilizer|cc11$/.test(node.name.toLowerCase()))
      node.geometry = smoothCadSkin(node.geometry, {
        limit: 0.0012,
        passes: 2,
        protectBays: false,
      });
  }
}

// Rebuild shading after all CAD cuts. Exact-position neighbours smooth only
// within 45 degrees, so the two sides of a thin edge never cancel each other.
// Positions, triangle order/winding and all non-normal attributes are copied.
export function rebuildF16SkinNormals(geometry) {
  const position = geometry.attributes.position,
    index = geometry.index,
    count = index ? index.count : position.count,
    faceCount = count / 3,
    normals = new Float64Array(faceCount * 3),
    areas = new Float64Array(faceCount),
    adjacent = new Map(),
    keys = [],
    creaseCos = Math.cos(Math.PI / 4),
    a = V(), b = V(), c = V(), normal = V();
  const vertex = (i) => index ? index.getX(i) : i;
  const key = (i) => keys[i] ??= `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
  for (let face = 0; face < faceCount; face++) {
    const ids = [vertex(face * 3), vertex(face * 3 + 1), vertex(face * 3 + 2)];
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]).sub(a);
    c.fromBufferAttribute(position, ids[2]).sub(a);
    normal.crossVectors(b, c);
    areas[face] = normal.length();
    normal.normalize().toArray(normals, face * 3);
    for (const k of new Set(ids.map(key))) {
      if (!adjacent.has(k)) adjacent.set(k, []);
      adjacent.get(k).push(face);
    }
  }
  const attributes = Object.entries(geometry.attributes).filter(([name]) => name !== 'normal'),
    values = new Map(attributes.map(([name]) => [name, []])),
    outputNormals = [], outputIndex = [], groups = new Map(), sharedNormals = new Map();
  for (let face = 0; face < faceCount; face++) {
    const faceNormal = a.fromArray(normals, face * 3);
    for (let corner = 0; corner < 3; corner++) {
      const id = vertex(face * 3 + corner), k = key(id),
        neighbours = adjacent.get(k).filter((other) =>
          faceNormal.dot(b.fromArray(normals, other * 3)) >= creaseCos),
        signature = neighbours.join(','), normalKey = `${k}|${signature}`;
      if (!sharedNormals.has(normalKey)) {
        normal.set(0, 0, 0);
        for (const other of neighbours)
          normal.addScaledVector(b.fromArray(normals, other * 3), areas[other]);
        if (!normal.lengthSq() && geometry.attributes.normal)
          normal.fromBufferAttribute(geometry.attributes.normal, id);
        sharedNormals.set(normalKey, normal.normalize().toArray());
      }
      const groupKey = `${id}|${signature}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, outputNormals.length / 3);
        outputNormals.push(...sharedNormals.get(normalKey));
        for (const [name, attribute] of attributes) {
          const out = values.get(name);
          for (let k = 0; k < attribute.itemSize; k++)
            out.push(attribute.array[id * attribute.itemSize + k]);
        }
      }
      outputIndex.push(groups.get(groupKey));
    }
  }
  const output = geometry.clone();
  for (const [name, attribute] of attributes)
    output.setAttribute(name, new THREE.BufferAttribute(
      new attribute.array.constructor(values.get(name)), attribute.itemSize, attribute.normalized,
    ));
  output.setAttribute('normal', new THREE.Float32BufferAttribute(outputNormals, 3));
  output.setIndex(outputIndex);
  return output;
}

export function buildF16ControlSurfaces(cad, nodes, material) {
  const body = nodes.find((n) => /cc52$/.test(n.name)),
    surfaces = [];
  if (!body) return surfaces;
  for (const side of [-1, 1]) {
    const min = side > 0 ? 1.45 : -4.55,
      max = side > 0 ? 4.55 : -1.45;
    const planes = boxPlanes(V(min, -0.88, -1.5), V(max, -0.4, 3.4));
    planes.push(halfSpace(V(0.75 * side, 0, -1), -0.89 - 0.018));
    const geo = splitCadVolume(body, planes);
    // A narrow relieved hinge pocket and end clearances allow both skin faces
    // to rotate without sweeping through the fixed wing.
    const clearance = boxPlanes(
      V(min - 0.045, -0.88, -1.5),
      V(max + 0.045, -0.4, 3.4),
    );
    clearance.push(halfSpace(V(0.75 * side, 0, -1), -0.89 + 0.032));
    splitCadVolume(body, clearance);
    const x = side * 1.45,
      z = 0.75 * 1.45 - 0.89;
    surfaces.push(
      rig(
        cad,
        geo,
        material,
        'leading',
        side,
        V(x, -0.704, z),
        V(side, 0, 0.75),
      ),
    );
  }
  for (const side of [-1, 1]) {
    const node = nodes.find((n) =>
      new RegExp(`cc${side > 0 ? 30 : 31}$`).test(n.name),
    );
    if (!node) continue;
    node.geometry.computeBoundingBox();
    const box = node.geometry.boundingBox,
      inner = side > 0 ? box.min.x : box.max.x;
    // Actual CAD flaperon front edges are swept, not parallel to the X axis.
    const slope = 0.341708,
      intercept = 1.6505;
    const trimmed = splitCadVolume(node, [
      halfSpace(V(-slope * side, 0, 1), -intercept - 0.028),
    ]);
    node.parent?.remove(node);
    const min = side > 0 ? 1.7 : -4.18,
      max = side > 0 ? 4.18 : -1.7;
    const pocket = boxPlanes(V(min, -0.88, 1.8), V(max, -0.4, 3.5));
    pocket.push(halfSpace(V(-slope * side, 0, 1), -intercept + 0.032));
    splitCadVolume(body, pocket);
    surfaces.push(
      rig(
        cad,
        trimmed,
        material,
        'trailing',
        side,
        V(inner, -0.694, slope * Math.abs(inner) + intercept),
        V(side, 0, slope),
      ),
    );
  }
  // Open the welded export end-cap inside the engine casing. The visible
  // F100 pipe and flame holders sit in front of a recessed dark backplate.
  const pipe = [halfSpace(V(0, 0, 1), -4.5), halfSpace(V(0, 0, -1), 7.6)];
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12,
      c = Math.cos(a),
      s = Math.sin(a);
    pipe.push(halfSpace(V(-c, -s, 0), 0.48 + c * 0.0075 - s * 0.595));
  }
  splitCadVolume(body, pipe);
  // The export also welds fixed stabilator-root stubs into the fuselage.
  // Relieve those stubs; the all-moving tail must rotate beside a closed root.
  for (const side of [-1, 1])
    splitCadVolume(
      body,
      boxPlanes(
        V(side < 0 ? -3.2 : 1.09, -1.15, 4.7),
        V(side < 0 ? -1.09 : 3.2, -0.25, 7.4),
      ),
    );
  const rudder = nodes.find((n) => /cc11$/.test(n.name));
  if (rudder) {
    const planes = boxPlanes(V(-0.3, 0.79, 5.4), V(0.3, 2.35, 7.6));
    planes.push(halfSpace(V(0, -0.75, 1), -5.163 - 0.028));
    const geo = splitCadVolume(rudder, planes);
    rudder.parent?.remove(rudder);
    const pocket = boxPlanes(V(-0.3, 0.755, 5.4), V(0.3, 2.36, 7.6));
    pocket.push(halfSpace(V(0, -0.75, 1), -5.163 + 0.035));
    splitCadVolume(body, pocket);
    surfaces.push(
      rig(
        cad,
        geo,
        material,
        'rudder',
        0,
        V(0.0075, 0.728, 5.71),
        V(0, 1, 0.75),
      ),
    );
  }

  return surfaces;
}
export function f16SurfaceTargets(flight, systems) {
  const air = flight.air || flight,
    s = flight.control?.surfaces || {};
  const alpha = Number.isFinite(flight.aoaDeg)
    ? flight.aoaDeg
    : (air.alpha || 0) / D;
  const pressure = air.pressure || 101325,
    q = air.dynamicPressure ?? 0.5 * 1.225 * (flight.tas || 0) ** 2;
  const mach = flight.mach ?? air.mach ?? 0;
  // Public F-16 research-model LEF schedule, constrained to the visual travel
  // of the C-model. Not a replacement for the aerodynamic control solver.
  const leading = THREE.MathUtils.clamp(
    1.38 * alpha - (9.05 * q) / pressure + 1.45,
    -2,
    25,
  );
  const speed = flight.iasKmh ?? (flight.tas || 0) * 3.6;
  const flapGain = 1 - THREE.MathUtils.smoothstep(speed, 440, 685);
  const symmetric = 20 * (systems.flaps || 0) * flapGain;
  const roll =
    THREE.MathUtils.clamp((s.aileron || 0) / 0.4, -1, 1) *
    21.5 *
    (1 - 0.45 * THREE.MathUtils.smoothstep(mach, 0.9, 1.6));
  return {
    leading: leading * D,
    left: THREE.MathUtils.clamp(symmetric + roll, -21.5, 25) * D,
    right: THREE.MathUtils.clamp(symmetric - roll, -21.5, 25) * D,
    rudder: -(s.rudder || 0),
  };
}
export function updateF16Surfaces(surfaces, flight, systems, dt, setAngle) {
  const target = f16SurfaceTargets(flight, systems);
  for (const surface of surfaces) {
    let angle;
    if (surface.kind === 'leading') angle = -surface.side * target.leading;
    else if (surface.kind === 'trailing')
      angle = surface.side * (surface.side < 0 ? target.left : target.right);
    else angle = target.rudder;
    const rate = (surface.kind === 'leading' ? 25 : 80) * D * Math.max(0, dt);
    surface.target = angle;
    surface.angle = THREE.MathUtils.clamp(
      angle,
      surface.angle - rate,
      surface.angle + rate,
    );
    setAngle(surface, surface.angle);
  }
}

export function buildF16Cockpit(cad, nodes) {
  const body = nodes.find((n) => /cc52$/.test(n.name));
  // Remove the export's solid white placeholder from inside the canopy.
  splitCadVolume(body, boxPlanes(V(-0.335, -0.12, -4.3), V(0.35, 0.55, -1.84)));
  const interior = new THREE.Group();
  interior.name = 'cad-cockpit';
  cad.add(interior);
  const dark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x20292b).convertSRGBToLinear(),
      roughness: 0.85,
    }),
    fabric = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x505644).convertSRGBToLinear(),
      roughness: 0.94,
    }),
    belt = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xaaa892).convertSRGBToLinear(),
      roughness: 0.9,
    });
  const box = (w, h, d, x, y, z, m = dark) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    interior.add(mesh);
    return mesh;
  };
  box(0.62, 0.035, 2.23, 0.007, -0.11, -3.0);
  box(0.43, 0.3, 0.4, 0.007, 0.04, -2.94, fabric);
  const seat = box(0.43, 0.61, 0.12, 0.007, 0.17, -2.68, dark);
  seat.rotation.x = -0.22;
  box(0.27, 0.16, 0.13, 0.007, 0.47, -2.59, dark);
  for (const side of [-1, 1]) {
    box(0.06, 0.46, 0.035, 0.007 + side * 0.14, 0.16, -2.77, belt);
    box(0.11, 0.16, 1.13, side * 0.25, -0.005, -3.34);
  }
  const panel = box(0.53, 0.25, 0.12, 0.007, 0.09, -3.89);
  panel.rotation.x = 0.18;
  const screen = new THREE.MeshStandardMaterial({
    color: 0x17352f,
    emissive: 0x102b21,
    emissiveIntensity: 0.14,
    roughness: 0.32,
  });
  for (const x of [-0.16, 0.17]) box(0.12, 0.12, 0.006, x, 0.11, -3.82, screen);
  interior.scale.set(0.78, 0.68, 0.84);
  interior.position.set(0.002, -0.03, -0.48);
  const canopy = nodes.find((n) => /canopi/i.test(n.name));
  if (canopy)
    canopy.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x828579).convertSRGBToLinear(),
      roughness: 0.16,
      metalness: 0.2,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  return interior;
}
export function trimF16Stabilator(geometry) {
  const holder = new THREE.Mesh(geometry);
  return splitCadVolume(holder, [halfSpace(V(1, 0, 0), -1.135)]);
}
