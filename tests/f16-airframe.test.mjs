import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
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
  cleanF16Cad,
  prepareF16SkinGeometry,
  buildF16ControlSurfaces,
  f16SurfaceTargets,
  buildF16Cockpit,
} from '../src/visual/F16Airframe.js';
import {
  F16_STATIONS,
  F16_STATION_STORES,
  normalizeF16Loadout,
} from '../src/data/f16Stations.js';
import { createF16Mount, storeDimensions } from '../src/visual/F16Stores.js';
import { updateHydraulicGear } from '../src/visual/CadLandingGear.js';
const meshList = (object) => {
  const a = [];
  object.traverse((o) => {
    if (o.isMesh && o.visible) a.push(o);
  });
  return a;
};
const pack = (meshes) =>
  meshes.flatMap((m) =>
    triangles(m).map((tri) => ({ tri, box: bounds(tri), name: m.name })),
  );
const fail = [],
  check = (mesh, t, label) => {
    const hit = intersections(mesh, t, 1);
    if (hit.length) fail.push({ label, ...hit[0] });
  };
cleanF16Cad(nodes);
for (const n of nodes)
  if (/missile|propeller/i.test(n.name)) n.parent?.remove(n);
prepareF16SkinGeometry(nodes);
const surfaces = buildF16ControlSurfaces(
  cad,
  nodes,
  new THREE.MeshBasicMaterial(),
);
const interior = buildF16Cockpit(cad, nodes);
assert.equal(surfaces.filter((s) => s.kind === 'leading').length, 2);
assert.equal(surfaces.filter((s) => s.kind === 'trailing').length, 2);
jet.cadStabilizers = [];
jet._buildSymmetricStabilizers(cad, nodes, (n) =>
  n.name.toLowerCase().replace(/_/g, ' '),
);
update(0);
const fixed = nodes.filter(
  (n) =>
    n.visible &&
    n.parent &&
    !/tyre|shock|shoc|cc(?:51|53|61|62)$/.test(n.name.toLowerCase()),
);
const bodyTree = tree(pack(fixed));
const canopyTree = tree(pack([nodes.find((n) => /canopi/i.test(n.name))]));
cad.updateMatrixWorld(true);
for (const m of meshList(interior)) check(m, canopyTree, 'cockpit vs canopy');
for (let i = 0; i <= 100; i++)
  for (const stab of jet.cadStabilizers) {
    jet._setCadHingeAngle(stab, ((-25 + i * 0.5) * Math.PI) / 180);
    cad.updateMatrixWorld(true);
    for (const part of stab.parts)
      check(part.mesh, bodyTree, 'stabilator vs body');
  }

for (const s of surfaces)
  for (let i = 0; i <= 60; i++) {
    const deg =
      s.kind === 'leading'
        ? -2 + (i * 27) / 60
        : s.kind === 'trailing'
          ? -21.5 + (i * 46.5) / 60
          : -20 + (i * 40) / 60;
    jet._setCadHingeAngle(
      s,
      ((deg * Math.PI) / 180) *
        (s.kind === 'leading' ? -s.side : s.kind === 'trailing' ? s.side : 1),
    );
    cad.updateMatrixWorld(true);
    check(s.parts[0].mesh, bodyTree, `${s.kind} ${s.side} vs body at ${deg}`);
  }
const all = [];
for (const spec of F16_STATIONS)
  for (const id of F16_STATION_STORES[spec.id]) {
    const m = createF16Mount(spec, id);
    m.group.position.y -= 0.55;
    m.adapter.position.y -= 0.55;
    cad.add(m.group, m.adapter);
    cad.updateMatrixWorld(true);
    const meshes = meshList(m.group),
      adapterMeshes = meshList(m.adapter),
      collider = tree(pack([...meshes, ...adapterMeshes]));
    for (const mesh of meshes)
      check(mesh, bodyTree, `${spec.id}/${id} vs body`);
    for (const s of surfaces)
      if (s.kind !== 'rudder')
        for (let i = 0; i <= 30; i++) {
          const deg =
            s.kind === 'leading' ? -2 + (i * 27) / 30 : -21.5 + (i * 46.5) / 30;
          jet._setCadHingeAngle(
            s,
            ((deg * Math.PI) / 180) * (s.kind === 'leading' ? -s.side : s.side),
          );
          cad.updateMatrixWorld(true);
          check(
            s.parts[0].mesh,
            collider,
            `${s.kind} ${s.side} vs ${spec.id}/${id} at ${deg}`,
          );
        }
    all.push({ ...m, meshes, adapterMeshes, collider, spec });
    cad.remove(m.group, m.adapter);
  }
// Every legal cross-station store pairing, not just the default loadout.
for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i],
      b = all[j];
    if (a.station === b.station) continue;
    for (const mesh of a.meshes)
      check(
        mesh,
        b.collider,
        `${a.station}/${a.storeId} vs ${b.station}/${b.storeId}`,
      );
  }
// All unique stores, adapters and bay doors against the gear's complete sweep.
const storeTree = tree(
  all.flatMap((m) => pack([...m.meshes, ...m.adapterMeshes])),
);
for (let i = 0; i <= 160; i++) {
  update(i / 160);
  for (const r of rigs)
    for (const m of [r.wheel, ...meshList(r.group)]) {
      check(m, storeTree, `gear ${r.kind}/${r.side} at ${i / 160}`);
      check(m, bodyTree, 'gear vs modified body');
    }
  for (const d of jet.cadGearDoors)
    for (const part of d.parts)
      check(part.mesh, storeTree, `door ${d.kind}/${d.side} at ${i / 160}`);
}
// The visual schedule responds to AoA, aerodynamic loading and roll; high-speed
// flap protection and angular rate limiting are separate from aerodynamic forces.
const f = {
  aoaDeg: 0,
  tas: 0,
  iasKmh: 0,
  mach: 0,
  air: { pressure: 101325, dynamicPressure: 0 },
  control: { surfaces: { aileron: 0 } },
};
const low = f16SurfaceTargets(f, { flaps: 1 });
assert.ok(Math.abs(low.left - (20 * Math.PI) / 180) < 1e-9);
f.aoaDeg = 20;
assert.ok(f16SurfaceTargets(f, {}).leading > low.leading);
f.iasKmh = 800;
assert.equal(f16SurfaceTargets(f, { flaps: 1 }).left, 0);
f.control.surfaces.aileron = 0.4;
const roll = f16SurfaceTargets(f, {});
assert.ok(roll.left > 0 && roll.right < 0);
// Tire circumference / direction, airborne spin-down and stationary contact.
for (const r of rigs) {
  r.wheelAngle = 0;
  r.wheelSpeed = 0;
  const flight = {
    orientation: new THREE.Quaternion(),
    velocity: new THREE.Vector3(0, 0, -15),
  };
  updateHydraulicGear(r, 0, { flight, dt: 0.1, onGround: true });
  assert.ok(
    Math.abs(r.wheelAngle - ((-1.5 / r.radius) % (Math.PI * 2))) < 1e-9,
  );
  const speed = r.wheelSpeed;
  updateHydraulicGear(r, 0, { flight, dt: 0.1, onGround: false });
  assert.ok(Math.abs(r.wheelSpeed) < Math.abs(speed));
  flight.velocity.set(0, 0, 0);
  updateHydraulicGear(r, 0, { flight, dt: 0.1, onGround: true });
  assert.ok(Math.abs(r.wheelSpeed) < 1e-12);
}
assert.equal(normalizeF16Loadout({ ctr: 'fuel370' }).ctr, 'fuel300');
assert.equal(normalizeF16Loadout({ ctr: 'litening' }).pr, 'litening');
assert.equal(normalizeF16Loadout({ lo: 'mk84' }).lo, null);
if (fail.length) console.log(JSON.stringify(fail.slice(0, 25), null, 2));
assert.equal(fail.length, 0, `${fail.length} interference samples`);
console.log(
  `PASS: 4 wing surfaces + rudder, 305 angular poses; ${all.length} legal station/store fits and all cross-station pairs; 161 gear/door poses against every store and adapter; flap schedule and tire rolling`,
);
