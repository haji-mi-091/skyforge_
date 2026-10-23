import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {
  cad,
  nodes,
  jet,
  rigs,
  update,
  triangles,
  bounds,
  tree,
  intersections,
} from './helpers/cad-gear-fixture.mjs';
import {
  buildF16Intake,
  NOSE_BAY,
  noseBayRoof,
} from '../src/visual/F16Intake.js';
import {
  buildF16Cockpit,
  cleanF16Cad,
  prepareF16SkinGeometry,
  buildF16ControlSurfaces,
} from '../src/visual/F16Airframe.js';
import { buildF16Canopy, updateF16Canopy } from '../src/visual/F16Canopy.js';
import {
  createF100Nozzle,
  updateF100Nozzle,
} from '../src/visual/F16Propulsion.js';
const meshes = (o) => {
  const a = [];
  o.traverse((n) => {
    if (n.isMesh && n.visible) a.push(n);
  });
  return a;
};
const pack = (ms) =>
  ms.flatMap((m) =>
    triangles(m).map((tri) => ({ tri, box: bounds(tri), name: m.name })),
  );
cleanF16Cad(nodes);
for (const n of nodes)
  if (/missile|propeller/i.test(n.name)) n.parent?.remove(n);
prepareF16SkinGeometry(nodes);
buildF16ControlSurfaces(cad, nodes, new T.MeshStandardMaterial());
const interior = buildF16Cockpit(cad, nodes),
  canopy = buildF16Canopy(cad, nodes, new T.MeshStandardMaterial());
const intakeBody = nodes.find((n) => /cc52$/.test(n.name)),
  referenceShell = new T.Mesh(
    intakeBody.geometry.clone(),
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
  );
intakeBody.material = new T.MeshStandardMaterial({roughness:.78,metalness:.1,map:new T.DataTexture(new Uint8Array([230,230,230,255]),1,1)});
const intake = buildF16Intake(cad, nodes);
update(0);
// The old inlet loft escaped through the narrow connection to the fuselage.
// Sample the actual triangle interiors, independently of the fitting algorithm.
let containmentSamples = 0,
  exteriorRays = 0;
const shellRay = new T.Raycaster(),
  points = new Map();
for (const tri of triangles(intake.userData.liner)) {
  for (const p of [
    ...tri,
    tri[0].clone().add(tri[1]).multiplyScalar(0.5),
    tri[1].clone().add(tri[2]).multiplyScalar(0.5),
    tri[2].clone().add(tri[0]).multiplyScalar(0.5),
    tri[0]
      .clone()
      .add(tri[1])
      .add(tri[2])
      .multiplyScalar(1 / 3),
  ]) {
    if (p.z > -1.31) continue;
    points.set(
      p
        .toArray()
        .map((x) => x.toFixed(5))
        .join(','),
      p,
    );
  }
}
for (const p of points.values()) {
  shellRay.set(new T.Vector3(-4, p.y, p.z), new T.Vector3(1, 0, 0));
  const hits = shellRay.intersectObject(referenceShell, false);
  assert.ok(hits.length >= 2, 'reference external section exists');
  const lo = hits[0].point.x,
    hi = hits.at(-1).point.x;
  assert.ok(
    p.x > lo + 0.001 && p.x < hi - 0.001,
    'inlet liner lies inside actual CAD shell: ' +
      JSON.stringify({ point: p.toArray(), lo, hi }),
  );
  containmentSamples++;
}
const liveShell = new T.Mesh(intakeBody.geometry, referenceShell.material);
for (const side of [-1, 1])
  for (let j = 0; j <= 30; j++)
    for (let i = 0; i <= 15; i++) {
      shellRay.set(
        new T.Vector3(side * 2, -1.42 + i * 0.045, -2.82 + j * 0.05),
        new T.Vector3(-side, 0, 0),
      );
      const before = shellRay.intersectObject(referenceShell, false)[0],
        after = shellRay.intersectObject(liveShell, false)[0];
      assert.equal(!!before, !!after, 'external inlet skin stays closed');
      if (before) {
        assert.ok(
          Math.abs(before.distance - after.distance) < 1e-5,
          'original external inlet surface retained',
        );
        exteriorRays++;
      }
    }
assert.equal(
  intake.userData.liner.material.map,
  intakeBody.material.map,
  'same weathering map as airframe',
);
assert.equal(
  intake.userData.liner.material.roughness,
  intakeBody.material.roughness,
  'same airframe roughness',
);
console.log(
  'PASS: ' +
    containmentSamples +
    ' inner-wall samples inside CAD envelope; ' +
    exteriorRays +
    ' unchanged exterior rays; shared airframe skin',
);
const enclosure = [...meshes(intake), ...meshes(cad.userData.noseBay)],
  enclosureTree = tree(pack(enclosure)),
  nose = rigs[0],
  fail = [];
for (let i = 0; i <= 400; i++) {
  update(i / 400);
  for (const m of [
    nose.wheel,
    ...meshes(nose.group),
    ...jet.cadGearDoors.flatMap((d) => [
      ...d.parts.map((p) => p.mesh),
      ...(d.hingeArms || []).map((a) => a.mesh),
    ]),
  ]) {
    const h = intersections(m, enclosureTree, 1);
    if (h.length) fail.push({ pose: i / 400, mesh: m.name, ...h[0] });
  }
  const axis = new T.Vector3(1, 0, 0).transformDirection(
    nose.wheel.matrixWorld,
  );
  assert.ok(
    axis.dot(new T.Vector3(1, 0, 0)) > 0.999999,
    'nose tire remains vertical rather than rolled flat into inlet',
  );
}
update(1);
for (const tri of triangles(nose.wheel))
  for (const p of tri) {
    assert.ok(
      p.y < noseBayRoof(p.z) - 0.005,
      'stowed tire below sealed duct floor',
    );
    assert.ok(
      p.x > NOSE_BAY.min.x &&
        p.x < NOSE_BAY.max.x &&
        p.z > NOSE_BAY.min.z &&
        p.z < NOSE_BAY.max.z,
      'stowed tire within actual well',
    );
  }
// Rays enter the mouth, rather than looking beneath it at deployed wheels.
// Every ray that would reach the nose tire must encounter a fixed wall first.
let rays = 0;
const ray = new T.Raycaster();
for (let i = 0; i <= 40; i++) {
  update(i / 40);
  for (const x of [-0.08, 0, 0.08])
    for (const y of [-1.34, -1.25, -1.16, -1.07]) {
      ray.set(new T.Vector3(x, y, -3.02), new T.Vector3(0, 0, 1));
      const tire = ray.intersectObject(nose.wheel, false);
      if (!tire.length) continue;
      const wall = ray.intersectObjects(enclosure, false);
      assert.ok(
        wall.length && wall[0].distance < tire[0].distance - 0.002,
        'wheel never visible through inlet mouth',
      );
      rays++;
    }
}
assert.ok(rays > 0, 'occlusion test exercises actual wheel-directed rays');
const fixed = [
    ...nodes.filter(
      (n) =>
        n.parent &&
        n.visible &&
        !/tyre|shock|shoc|cc(?:51|53|61|62)$/.test(n.name.toLowerCase()),
    ),
    ...meshes(interior),
  ],
  body = tree(pack(fixed));
const fixedMatrix = canopy.fixed.matrix.clone();
const snapshots = [];
for (let i = 0; i <= 200; i++) {
  updateF16Canopy(canopy, i / 200);
  cad.updateMatrixWorld(true);
  for (const m of meshes(canopy.group)) {
    const h = intersections(m, body, 1);
    if (h.length) fail.push({ canopy: i / 200, mesh: m.name, ...h[0] });
  }
  assert.ok(
    canopy.actuatorLength > 0.28,
    'electric actuator retains positive extension',
  );
  if (i === 100) snapshots.push(canopy.group.matrix.toArray());
}
updateF16Canopy(canopy, 0.1);
updateF16Canopy(canopy, 0.5);
cad.updateMatrixWorld(true);
assert.deepEqual(
  canopy.group.matrix.toArray(),
  snapshots[0],
  'canopy reversal has no jump',
);
assert.deepEqual(
  canopy.fixed.matrix.toArray(),
  fixedMatrix.toArray(),
  'aft transparency never moves',
);
const nozzle = createF100Nozzle(0.45),
  rig = nozzle.userData.nozzle,
  front = rig.petals.map((p) =>
    Array.from(p.geometry.attributes.position.array).slice(0, 6),
  );
const at = (f) => {
  updateF100Nozzle(nozzle, f, 0);
  return rig.exitRadius;
};
const idle = at({ engineSpool: 0.5, afterburner: 0 }),
  mil = at({ engineSpool: 1, afterburner: 0 }),
  ab = at({ engineSpool: 1, afterburner: 1 });
assert.ok(
  idle === mil && ab > mil * 1.35,
  'dry nozzle stays contracted and opens with augmentation',
);
for (const amount of [0, 0.2, 0.6, 1, 0.4, 0]) {
  for (let i = 0; i < 100; i++) {
    const before = rig.opening;
    updateF100Nozzle(nozzle, { engineSpool: 1, afterburner: amount }, 0.01);
    assert.ok(
      Math.abs(rig.opening - before) < 0.06,
      'rate-smoothed nozzle transition',
    );
    for (const p of rig.petals) {
      const v = p.geometry.attributes.position;
      const a = new T.Vector3().fromBufferAttribute(v, 2),
        b = new T.Vector3().fromBufferAttribute(v, 62);
      assert.ok(
        Math.abs(a.distanceTo(b) - 0.72) < 0.001,
        'nozzle flaps maintain length',
      );
      assert.ok(Array.from(v.array).every(Number.isFinite));
    }
  }
}
assert.deepEqual(
  rig.petals.map((p) =>
    Array.from(p.geometry.attributes.position.array).slice(0, 6),
  ),
  front,
  'nozzle root ring never moves or scales',
);
assert.equal(fail.length, 0, JSON.stringify(fail.slice(0, 10), null, 2));
console.log(
  `PASS: 401 nose-gear poses vs sealed well and inlet; ${rays} inlet-to-wheel rays occluded; 201 canopy poses and reversal; fixed aft glass; variable-area nozzle and rigid flap roots`,
);
