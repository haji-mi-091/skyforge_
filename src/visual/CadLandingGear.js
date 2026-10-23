import * as THREE from '../../vendor/three.module.js';
import {prepareNoseGearBay,NOSE_BAY} from './F16Intake.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);
export const gearPhase = (start, end, value) => {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
};
export const gearDoorClosure = (retraction) => gearPhase(0.80, 1, retraction);

// Subtract only the actual bay volume, splitting boundary triangles rather
// than dropping whole faces. The CAD's old shallow roof is not a wheel well.
export function cutGearBay(mesh, box) {
  const original = mesh.geometry;
  const pos = original.attributes.position, normal = original.attributes.normal;
  const points = Array.from(pos.array), normals = Array.from(normal.array);
  const indices = [], old = original.index;
  const count = old ? old.count : pos.count;
  const read = (i) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i),
    n: new THREE.Vector3().fromBufferAttribute(normal, i) });
  const clip = (poly, axis, value, sign) => {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = sign * (a.p[axis] - value), db = sign * (b.p[axis] - value);
      if (da >= 0) result.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        result.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize() });
      }
    }
    return result;
  };
  const append = (poly) => {
    if (poly.length < 3) return;
    const offset = points.length / 3;
    for (const v of poly) { points.push(...v.p.toArray()); normals.push(...v.n.toArray()); }
    for (let k = 1; k < poly.length - 1; k++) indices.push(offset, offset + k, offset + k + 1);
  };
  const planes = ['x', 'y', 'z'].flatMap(axis => [
    [axis, box.min[axis], 1], [axis, box.max[axis], -1],
  ]);
  for (let k = 0; k < count; k += 3) {
    const ids = [0, 1, 2].map(i => old ? old.getX(k + i) : k + i);
    const poly = ids.map(read);
    const bounds = new THREE.Box3().setFromPoints(poly.map(v => v.p));
    if (!bounds.intersectsBox(box)) { indices.push(...ids); continue; }
    let inside = poly;
    for (const [axis, value, sign] of planes) {
      append(clip(inside, axis, value, -sign));
      inside = clip(inside, axis, value, sign);
      if (!inside.length) break;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  mesh.geometry = geometry;
}

function cylinder(parent, radius, material, length = 1) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function segment(mesh, a, b) {
  const direction = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(Y, direction.clone().normalize());
  mesh.scale.y = direction.length();
}
function telescope(parent, count, stageLength, outerRadius, step, metal, paint) {
  const stages = Array.from({ length: count }, (_, i) => {
    const mesh = cylinder(parent, outerRadius - i * step, i < 2 ? paint : metal, stageLength);
    const collar = cylinder(parent, outerRadius - i * step + 0.004, metal, 0.018);
    return { mesh, collar };
  });
  return { stages, stageLength, length: 0, a: V(0, 0, 0), b: V(0, 0, 0) };
}
function setTelescope(rig, a, b) {
  const direction = b.clone().sub(a), length = direction.length();
  const axis = direction.normalize();
  rig.length = length; rig.a.copy(a); rig.b.copy(b);
  const spacing = (length - rig.stageLength) / (rig.stages.length - 1);
  for (let i = 0; i < rig.stages.length; i++) {
    const { mesh, collar } = rig.stages[i];
    mesh.position.copy(a).addScaledVector(axis, i * spacing + rig.stageLength * 0.5);
    mesh.quaternion.setFromUnitVectors(Y, axis);
    collar.position.copy(a).addScaledVector(axis, i * spacing + rig.stageLength - 0.012);
    collar.quaternion.copy(mesh.quaternion);
  }
}
function fork(parent, offset, height, material) {
  const group = new THREE.Group(); parent.add(group);
  const bottom = V(offset, 0, 0), top = V(offset, height, 0);
  segment(cylinder(group, 0.018, material), bottom, top);
  segment(cylinder(group, 0.022, material), V(0, 0, 0), bottom);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), material);
  joint.position.copy(top); group.add(joint);
  return { group, top };
}

export function buildHydraulicGear(cad, nodes, normName) {
  const metal = new THREE.MeshStandardMaterial({ color: 0xbcc6cc, metalness: 0.85, roughness: 0.24 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x8d989a, metalness: 0.38, roughness: 0.48 });
  const rigs = [];
  const specs = [
    { kind: 'front', side: 0, re: /front tyre/ },
    { kind: 'main', side: -1, re: /wheel and tyre.*left/ },
    { kind: 'main', side: 1, re: /wheel and tyre-(?!.*left)/ },
  ];
  for (const node of nodes) {
    if (/shock|shoc breaker/.test(normName(node)) || /cc(?:3[7-9]|4\d|50)$/.test(node.name)) {
      node.parent?.remove(node);
    }
  }
  const body = nodes.find(n => /cc52$/.test(n.name));
  if (body) {
    prepareNoseGearBay(cad, body);
  }
  for (const spec of specs) {
    const node = nodes.find(n => spec.re.test(normName(n)));
    if (!node) continue;
    node.updateMatrix();
    const wheel = node.clone(); wheel.name += '-hydraulic-wheel';
    wheel.matrixAutoUpdate = false; wheel.matrix.copy(node.matrix);
    cad.add(wheel); node.visible = false;
    node.geometry.computeBoundingBox();
    const center = node.geometry.boundingBox.clone().applyMatrix4(node.matrix).getCenter(new THREE.Vector3());
    const group = new THREE.Group(); group.name = `hydraulic-${spec.kind}-${spec.side}`; cad.add(group);
    const front = spec.kind === 'front';
    const target = front ? NOSE_BAY.wheelTarget.clone() : V(0.0075 + spec.side * 0.5025, -0.72, center.z);
    const anchor = front ? V(center.x, -1.40, -2.33) : V(target.x - spec.side * 0.04, -0.20, center.z - 0.30);
    const knuckle = fork(group, front ? -0.125 : -spec.side * 0.15, front ? 0.245 : 0.42, paint);
    const upper = front ? telescope(group, 5, 0.28, 0.062, 0.009, metal, paint)
      : telescope(group, 6, 0.30, 0.062, 0.008, metal, paint);
    const lower = front ? telescope(group, 3, 0.16, 0.021, 0.004, metal, paint)
      : telescope(group, 4, 0.17, 0.040, 0.007, metal, paint);
    const rig = { ...spec, wheel, center, target, anchor, group, fork: knuckle, upper, lower,
      parts: [{ mesh: wheel, baseMatrix: node.matrix.clone() }], wheelCenter: center.clone(),
      radius:(node.geometry.boundingBox.max.y-node.geometry.boundingBox.min.y)/2, wheelAngle:0, wheelSpeed:0, alignment: 0, lift: 0 };
    // Valve and balance marks make the otherwise rotationally symmetric CAD
    // sidewalls readable while taxiing. They inherit the tire's spin only.
    const tireBox=node.geometry.boundingBox;
    const ink=new THREE.MeshStandardMaterial({color:0x8c8876,roughness:.9});
    for(const x of[tireBox.min.x-.001,tireBox.max.x+.001]){
      const mark=new THREE.Mesh(new THREE.BoxGeometry(.002,.012,.035),ink);
      mark.position.set(x,center.y+rig.radius*.82,center.z);wheel.add(mark);
    }
    rigs.push(rig);
    if (!front && body) {
      // Leave the outer skin and upper fuselage intact; this box cuts the
      // shallow CAD backplate and the interfering ribs inside the wheel well.
      const x0 = spec.side > 0 ? 0.330 : -0.630;
      const x1 = spec.side > 0 ? 0.645 : -0.315;
      rig.bay = new THREE.Box3(V(x0, -1.50, 1.00), V(x1, -0.30, 1.80));
      cutGearBay(body, rig.bay);
    }
    updateHydraulicGear(rig, 0);
  }
  return rigs;
}

export function updateHydraulicGear(rig, retraction, motion) {
  if (motion) {
    const {flight,dt=0,onGround=false}=motion;
    const forward=V(0,0,-1).applyQuaternion(flight.orientation || new THREE.Quaternion());
    const speed=flight.velocity?.dot(forward) || 0;
    if (onGround && retraction<.015) rig.wheelSpeed=-speed/rig.radius;
    else rig.wheelSpeed*=Math.exp(-Math.max(0,dt)*.65);
    rig.wheelAngle=(rig.wheelAngle+rig.wheelSpeed*Math.max(0,dt))%(Math.PI*2);
  }
  const align = gearPhase(0.04, 0.30, retraction);
  const lift = gearPhase(0.30, 0.76, retraction);
  rig.alignment = align; rig.lift = lift;
  const front = rig.kind === 'front';
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0);
  const center = rig.center.clone();
  center.x = THREE.MathUtils.lerp(center.x, rig.target.x, align);
  center.z = THREE.MathUtils.lerp(center.z, rig.target.z, align);
  center.y = THREE.MathUtils.lerp(center.y, rig.target.y, lift);
  rig.wheelCenter.copy(center);
  const matrix = new THREE.Matrix4().makeTranslation(...center.toArray());
  matrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
  matrix.multiply(new THREE.Matrix4().makeRotationX(rig.wheelAngle || 0));
  matrix.multiply(new THREE.Matrix4().makeTranslation(...rig.center.clone().negate().toArray()));
  rig.wheel.matrix.copy(matrix).multiply(rig.parts[0].baseMatrix);
  rig.wheel.matrixWorldNeedsUpdate = true;
  rig.fork.group.position.copy(center); rig.fork.group.quaternion.copy(q);
  const attachment = rig.fork.top.clone().applyQuaternion(q).add(center);
  if (front) {
    // Keep the nose tire vertical. The retract cylinder folds aft below the
    // duct floor, with its knee beside the wheel and inside the separate well.
    const knee = rig.fork.top.clone().add(V(0, 0, -.18-.18*align)).applyQuaternion(q).add(center);
    setTelescope(rig.upper, rig.anchor, knee);
    setTelescope(rig.lower, knee, attachment);
  } else {
    const knee = V(rig.target.x + rig.side * 0.02 * lift,
      THREE.MathUtils.lerp(-1.62, -0.25, lift), rig.center.z);
    setTelescope(rig.upper, rig.anchor, knee);
    setTelescope(rig.lower, knee, attachment);
  }
}

// Main doors use a small swinging hinge arm to clear the tyre sidewall. The
// arm retracts before the panel seals against the original closed bay rim.
export function mainDoorClearance(door, closure) {
  if (door.kind !== 'main') return;
  const angle = (1 - closure) * Math.PI / 4;
  const offset = V(door.side * 0.25 * Math.sin(angle), 0.25 * (1 - Math.cos(angle)), 0);
  const translation = new THREE.Matrix4().makeTranslation(...offset.toArray());
  for (const part of door.parts) {
    part.mesh.matrix.premultiply(translation);
    part.mesh.matrixWorldNeedsUpdate = true;
  }
  if (door.hingeArms) {
    for (const { mesh, z } of door.hingeArms) {
      const a = door.hinge.clone(); a.y += 0.25; a.z = z;
      const b = door.hinge.clone().add(offset); b.z = z;
      segment(mesh, a, b);
    }
  }
}
export function addMainDoorHingeArms(cad, door, material) {
  if (door.kind !== 'main') return;
  door.hingeArms = [1.0, 1.82].map(z => ({ mesh: cylinder(cad, 0.012, material), z }));
}

// Broaden the main panel along its width to cover the deepened well and the
// inboard fork, retaining the CAD hinge, length, skin material and curvature.
export function widenMainDoor(node, hinge, axis) {
  const a = axis, s = 1.16, d = 1 - s;
  const stretch = new THREE.Matrix4().set(
    s + d*a.x*a.x, d*a.x*a.y, d*a.x*a.z, 0,
    d*a.y*a.x, s + d*a.y*a.y, d*a.y*a.z, 0,
    d*a.z*a.x, d*a.z*a.y, s + d*a.z*a.z, 0,
    0, 0, 0, 1);
  const transform = node.matrix.clone().invert()
    .multiply(new THREE.Matrix4().makeTranslation(...hinge.toArray()))
    .multiply(stretch)
    .multiply(new THREE.Matrix4().makeTranslation(...hinge.clone().negate().toArray()))
    .multiply(node.matrix);
  node.geometry = node.geometry.clone().applyMatrix4(transform);
}


export function addMainDoorSeal(cad, door, material) {
  if (door.kind !== 'main') return;
  // A shallow raised rim seals the original CAD panel to the skin around the
  // deeper well. It travels with the door, so it never blocks the wheel path.
  const sign = door.side, mirror = x => sign > 0 ? x : 0.015 - x;
  const inner = mirror(0.335), outer = mirror(0.645);
  const positions = [];
  const quad = (a,b,c,d) => positions.push(...a,...b,...c,...a,...c,...d);
  for (const [x, bottom, top] of [[inner,-1.44,-1.33],[outer,-1.13,-0.94]]) {
    quad([x,bottom,0.99],[x,bottom,1.82],[x,top,1.82],[x,top,0.99]);
  }
  for (const z of [0.99,1.82]) {
    quad([inner,-1.44,z],[outer,-1.13,z],[outer,-0.94,z],[inner,-1.33,z]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry,material);
  mesh.name = `main-gear-door-seal-${sign}`; mesh.castShadow = true;
  const h = door.hinge;
  const baseMatrix = new THREE.Matrix4().makeTranslation(h.x,h.y,h.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(door.axis,-sign*door.closeAngle))
    .multiply(new THREE.Matrix4().makeTranslation(-h.x,-h.y,-h.z)).invert();
  mesh.matrixAutoUpdate = false; mesh.matrix.copy(baseMatrix); cad.add(mesh);
  door.parts.push({mesh,baseMatrix});
}





