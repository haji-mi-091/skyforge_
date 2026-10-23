import * as THREE from '../../vendor/three.module.js';
import { splitCadVolume, boxPlanes, halfSpace } from './CadGeometry.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function beam(parent, r, material, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 16), material);
  m.name = name;
  parent.add(m);
  return m;
}
function between(m, a, b) {
  const d = b.clone().sub(a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  m.scale.y = d.length();
}
/** Rear-hinged main canopy; the aft transparency remains fixed on the spine. */
export function buildF16Canopy(cad, nodes, skin) {
  const canopy = nodes.find((n) => /canopi/i.test(n.name)),
    body = nodes.find((n) => /cc52$/.test(n.name));
  if (!canopy || !body) return null;
  const movingGlass = splitCadVolume(canopy, [halfSpace(V(0, 0, -1), -2.105)], {
    cap: false,
  });
  splitCadVolume(canopy, [halfSpace(V(0, 0, -1), -2.09)], { cap: false });
  canopy.name = 'fixed aft canopy transparency';
  const frameGeometry = splitCadVolume(
    body,
    boxPlanes(V(-0.423, -0.119, -4.62), V(0.438, 0.6, -2.105)),
    { cap: false },
  );
  splitCadVolume(
    body,
    boxPlanes(V(-0.428, -0.125, -4.625), V(0.443, 0.61, -2.09)),
    { cap: false },
  );
  const pivot = V(0.0075, 0.4, -2.075),
    group = new THREE.Group();
  group.name = 'F16 rear-hinged canopy';
  group.position.copy(pivot);
  cad.add(group);
  const glass = new THREE.Mesh(movingGlass, canopy.material);
  glass.name = 'moving main canopy transparency';
  glass.position.copy(pivot).negate();
  glass.renderOrder = 3;
  group.add(glass);
  const frame = new THREE.Mesh(frameGeometry, skin);
  frame.name = 'moving canopy frame';
  frame.position.copy(pivot).negate();
  group.add(frame);
  const dark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x3e494d).convertSRGBToLinear(),
    roughness: 0.69,
    metalness: 0.3,
  });
  const rimPoints = [];
  for (let i = 0; i <= 32; i++) {
    const t = (i / 32) * Math.PI;
    rimPoints.push(
      V(0.0075 + 0.274 * Math.cos(t), -0.09 + 0.45 * Math.sin(t), -2.11).sub(
        pivot,
      ),
    );
  }
  const rearBow = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(rimPoints),
      40,
      0.014,
      8,
      false,
    ),
    dark,
  );
  rearBow.name = 'moving rear canopy bow';
  group.add(rearBow);
  const seal = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(
        rimPoints.map((v) => v.clone().add(V(0, 0, 0.023))),
      ),
      40,
      0.009,
      8,
      false,
    ),
    dark,
  );
  seal.name = 'canopy aft seal';
  cad.add(seal);
  seal.position.copy(pivot);
  const metal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x9fa7a9).convertSRGBToLinear(),
    roughness: 0.31,
    metalness: 0.85,
  });
  const actuatorGroup = new THREE.Group();
  actuatorGroup.name = 'canopy electromechanical actuator';
  cad.add(actuatorGroup);
  const barrel = beam(actuatorGroup, 0.022, dark, 'canopy actuator housing'),
    rod = beam(actuatorGroup, 0.01, metal, 'canopy actuator rod');
  const rig = {
    group,
    glass,
    frame,
    fixed: canopy,
    pivot,
    angle: 0,
    barrel,
    rod,
    anchor: V(-0.24, -0.22, -1.99),
    joint: V(-0.24, -0.09, -2.54),
    actuatorGroup,
  };
  updateF16Canopy(rig, 0);
  return rig;
}
export function updateF16Canopy(rig, amount) {
  if (!rig) return;
  const t = THREE.MathUtils.clamp(amount, 0, 1),
    ease = t * t * (3 - 2 * t);
  rig.angle = (ease * 48 * Math.PI) / 180;
  rig.group.rotation.x = rig.angle;
  const joint = rig.joint
      .clone()
      .sub(rig.pivot)
      .applyAxisAngle(V(1, 0, 0), rig.angle)
      .add(rig.pivot),
    dir = joint.clone().sub(rig.anchor).normalize();
  between(
    rig.barrel,
    rig.anchor,
    rig.anchor.clone().addScaledVector(dir, 0.28),
  );
  between(rig.rod, rig.anchor.clone().addScaledVector(dir, 0.22), joint);
  rig.actuatorLength = joint.distanceTo(rig.anchor);
}
