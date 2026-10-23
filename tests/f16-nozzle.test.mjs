import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import { createF100Nozzle, updateF100Nozzle, nozzleTarget } from '../src/visual/F16Propulsion.js';

for (const radius of [0.35, 0.45, 0.6]) {
  const nozzle = createF100Nozzle(radius), rig = nozzle.userData.nozzle;
  const flaps = [...rig.petals, ...rig.inner.children];
  const geometry = flaps.map(p => Array.from(p.geometry.attributes.position.array));
  const roots = flaps.map(p => p.userData.flap.hinge.clone());
  const pose = ab => {
    updateF100Nozzle(nozzle, { engineSpool: 1, afterburner: ab }, 0);
    nozzle.updateMatrixWorld(true);
    return rig.exitRadius;
  };
  const dry = pose(0), closed = flaps.map(p => p.matrix.toArray());
  for (let i = 0; i <= 100; i++) {
    assert.equal(nozzleTarget({ engineSpool: i / 100, afterburner: 0 }), 0,
      'spooling up never produces an open-close-open cycle');
  }
  let previous = dry;
  for (let i = 0; i <= 100; i++) {
    const aperture = pose(i / 100);
    assert.ok(aperture >= previous, 'aperture grows through the entire AB range');
    previous = aperture;
    for (let j = 0; j < flaps.length; j++) {
      const mesh = flaps[j];
      assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), geometry[j],
        'animation never rewrites curved feather vertices');
      assert.ok(mesh.visible && mesh.scale.equals(new T.Vector3(1, 1, 1)));
      assert.ok(Math.abs(mesh.matrix.determinant() - 1) < 1e-10,
        'every feather uses a rigid transform');
      assert.ok(new T.Vector3().applyMatrix4(mesh.matrix).distanceTo(roots[j]) < 1e-10,
        'hinge remains fixed');
    }
    for (const mesh of rig.petals) {
      const tip = new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 62)
        .applyMatrix4(mesh.matrix);
      assert.ok(Math.abs(Math.hypot(tip.x, tip.y) - rig.exitRadius) < 1e-7);
      assert.ok(Math.abs(tip.z - rig.exitZ) < 1e-7,
        'exhaust dimensions follow the real feather lips');
    }
  }
  assert.ok(previous > dry * 1.35, 'full AB visibly opens the nozzle');
  const p = rig.petals[0].geometry.attributes.position;
  const root = new T.Vector3().fromBufferAttribute(p, 2);
  const tip = new T.Vector3().fromBufferAttribute(p, 62);
  const middle = new T.Vector3().fromBufferAttribute(p, 32);
  assert.ok(middle.distanceTo(root.clone().lerp(tip, 0.5)) > radius * 0.09,
    'feather has a bowed longitudinal profile');
  for (const target of [0, 1, 0.3, 0]) {
    let before = rig.exitRadius;
    for (let i = 0; i < 120; i++) {
      updateF100Nozzle(nozzle, { afterburner: target }, 1 / 60);
      const destination = radius * (0.67 + 0.31 * nozzleTarget({ afterburner: target }));
      assert.ok(Math.abs(rig.exitRadius - destination) <= Math.abs(before - destination) + 1e-12,
        'opening and closing approach their target without reversal or overshoot');
      before = rig.exitRadius;
    }
  }
  pose(0);
  assert.deepEqual(flaps.map(p => p.matrix.toArray()), closed,
    'repeated opening and closing restores the original shape and pose');
  nozzle.traverse(mesh => { if (mesh.isMesh) mesh.geometry.dispose(); });
}
console.log('PASS: F-16 curved rigid feathers; dry spool sweep; 303 AB poses; fixed hinges; real exit dimensions; monotonic animation and reversible closure');
