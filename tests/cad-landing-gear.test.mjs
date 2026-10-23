/** Exact CAD + procedural geometry checks; no browser/server required. */
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { rigs, jet, nodes, update, triangles, bounds, tree, intersections } from './helpers/cad-gear-fixture.mjs';

assert.equal(rigs.length, 3, 'three hydraulic gear assemblies');
update(0);
const region = new THREE.Box3(new THREE.Vector3(-1.5,-2.8,-2.8), new THREE.Vector3(1.5,0.1,2.1));
const fixed = [];
for (const mesh of nodes) {
  if (!mesh.parent || !mesh.visible || /tyre|shock|shoc|cc(?:51|53|61|62)$/.test(mesh.name.toLowerCase())) continue;
  for (const tri of triangles(mesh)) {
    const box = bounds(tri);
    if (box.intersectsBox(region)) fixed.push({ tri, box, name: mesh.name });
  }
}
const bodyTree = tree(fixed);
const failures = [];
const originalPositions = rigs.map(r => Array.from(r.wheel.geometry.attributes.position.array));
const recordHit = (mesh, collider, label, progress) => {
  const hits = intersections(mesh, collider, 1);
  if (hits.length) failures.push({ progress, label, ...hits[0] });
};
for (let i = 0; i <= 400; i++) {
  const progress = i / 400;
  update(progress);
  const doorTriangles = [];
  for (const door of jet.cadGearDoors) {
    if (progress <= 0.8) assert.equal(Math.abs(door.angle), 0, 'doors held open during wheel travel');
    for (const part of [...door.parts, ...(door.hingeArms || [])]) {
      for (const tri of triangles(part.mesh)) doorTriangles.push({ tri, box: bounds(tri), name: `${door.kind} door ${door.side}` });
    }
  }
  const doorTree = tree(doorTriangles);
  for (const rig of rigs) {
    const label = `${rig.kind} ${rig.side}`;
    const meshes = [rig.wheel];
    rig.group.traverse(mesh => { if (mesh.isMesh) meshes.push(mesh); });
    for (const mesh of meshes) {
      recordHit(mesh, bodyTree, `${label} vs body`, progress);
      recordHit(mesh, doorTree, `${label} vs doors`, progress);
    }
    const tyre = tree(triangles(rig.wheel).map(tri => ({ tri, box: bounds(tri), name: 'own tyre' })));
    for (const actuator of [rig.upper, rig.lower]) {
      assert.ok(actuator.length >= actuator.stageLength - 1e-8, 'sleeve never compresses shorter than its housing');
      assert.ok(actuator.length < actuator.stages.length * actuator.stageLength - 0.004 * (actuator.stages.length - 1), 'all telescoping stages retain overlap');
      for (const stage of actuator.stages) {
        recordHit(stage.mesh, tyre, `${label} sleeve vs tyre`, progress);
        recordHit(stage.collar, tyre, `${label} collar vs tyre`, progress);
      }
    }
    const scale = new THREE.Vector3().setFromMatrixScale(rig.wheel.matrix);
    assert.ok(scale.distanceTo(new THREE.Vector3(1,1,1)) < 1e-10, 'tyre never shrinks or deforms');
    assert.ok(rig.wheel.visible && rig.group.visible, 'gear remains rendered, including fully stowed');
    if (progress >= 0.76) assert.ok(rig.wheelCenter.distanceTo(rig.target) < 1e-9, 'all wheels stowed before door closure');
  }
}
assert.deepEqual(rigs.map(r => Array.from(r.wheel.geometry.attributes.position.array)), originalPositions, 'original tyre meshes retained');
// Mid-cycle reversals are history-independent and restore exactly the same pose.
update(0.53);
const snapshot = () => rigs.map(r => [r.wheel.matrix.toArray(), ...r.upper.stages.map(s => s.mesh.position.toArray())]);
const pose = snapshot();
update(0.18); update(0.91); update(0.53);
assert.deepEqual(snapshot(), pose, 'reversing gear restores the same continuous pose');
assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 8), null, 2));
console.log(`PASS: 401 poses; ${fixed.length} body triangles; no gear/body, gear/door or actuator/tyre intersections; rigid tyres, hydraulic overlap, staged doors, reversals`);
