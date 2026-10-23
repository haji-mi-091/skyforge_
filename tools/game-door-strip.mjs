/**
 * Nose-gear-door filmstrip from the shipped game.
 *
 * Opens the real game, parks a belly camera under the nose, then steps the
 * gear through 1 -> 0 (retraction) and screenshots each step, printing the
 * gear value and the nose-door bounding box the model actually produced.
 *
 *   node tools/game-door-strip.mjs [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { withBrowser } from './cdp.mjs';

const GAME = 'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52';
const outDir = resolve(process.argv[2] || 'shots/strip');
await mkdir(outDir, { recursive: true });

const STEPS = [1, 0.75, 0.5, 0.25, 0];

const PROBE = `
(() => {
  const game = window.__SKYFORGE__;
  if (!game || !game.player || !game.playerJet) return { state: 'booting' };
  const jet = game.playerJet;
  if (!jet.cadGroup || !jet.cadGearDoors?.length) return { state: 'cad-loading' };
  jet.group.updateMatrixWorld(true);
  const doors = jet.cadGearDoors.filter((d) => d.kind === 'front');
  // The two doors rotate in opposite directions; report the magnitude.
  const angle = doors.reduce((m, d) => Math.max(m, Math.abs(d.angle ?? 0)), 0);
  const box = { min: { x: 1e9, y: 1e9, z: 1e9 }, max: { x: -1e9, y: -1e9, z: -1e9 } };
  for (const door of doors) {
    for (const part of door.parts) {
      const mesh = part.mesh;
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      for (const axis of ['x', 'y', 'z']) {
        box.min[axis] = Math.min(box.min[axis], b.min[axis]);
        box.max[axis] = Math.max(box.max[axis], b.max[axis]);
      }
    }
  }
  return {
    state: 'ok',
    gear: +game.player.systems.gear.toFixed(3),
    doorAngle: +(angle * 180 / Math.PI).toFixed(1),
    drawn: doors.some((d) => d.parts.some((p) => p.mesh.visible)),
    door: {
      x: +(box.max.x - box.min.x).toFixed(3),
      y: +(box.max.y - box.min.y).toFixed(3),
    },
  };
})()`;

const SET = `
(() => {
  const game = window.__SKYFORGE__;
  const jet = game.playerJet;
  const doors = jet.cadGearDoors.filter((d) => d.kind === 'front');
  const cam = game.engine.camera;
  game._updateCamera = () => {
    const box = { min: { x: 1e9, y: 1e9, z: 1e9 }, max: { x: -1e9, y: -1e9, z: -1e9 } };
    for (const door of doors) {
  
    for (const part of door.parts) {
        const mesh = part.mesh;
        mesh.geometry.computeBoundingBox();
        const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        for (const axis of ['x', 'y', 'z']) {
          box.min[axis] = Math.min(box.min[axis], b.min[axis]);
          box.max[axis] = Math.max(box.max[axis], b.max[axis]);
        }
      }
    }
    const c = new jet.group.position.constructor(
      (box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2,
      (box.min.z + box.max.z) / 2);
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.5);
    const m = jet.group.matrixWorld.elements;
    const up = { x: m[4], y: m[5], z: m[6] };
    const forward = { x: -m[8], y: -m[9], z: -m[10] };
    const d = span * 1.8;
    cam.position.set(c.x - up.x * d, c.y - up.y * d, c.z - up.z * d);
    cam.up.set(forward.x, forward.y, forward.z);
    cam.lookAt(c.x, c.y, c.z);
  };
  return true;
})()`;

const FORCE = (gear) => `
(() => {
  const game = window.__SKYFORGE__;
  game.player.systems.gear = ${gear};
  game.player.systems.gearTarget = ${gear};
  game.playerJet._updateCadRig(game.player.flight, game.player.systems);
  game.playerJet.group.updateMatrixWorld(true);
  game._updateCamera();
  return game.player.systems.gear;
})()`;

await withBrowser(async (api) => {
  const view = await api.open(GAME);
  try {
    const started = Date.now();
    while (Date.now() - started < 120000) {
      const probe = await view.page.evaluate(PROBE);
      if (probe && probe.state === 'ok') break;
      await new Promise((r) => setTimeout(r, 400));
    }
    await view.page.evaluate(SET);

    for (const gear of STEPS) {
      await view.page.evaluate(FORCE(gear));
      await new Promise((r) => setTimeout(r, 900));
      const probe = await view.page.evaluate(PROBE);
      const file = join(outDir, `gear-${String(Math.round(gear * 100)).padStart(3, '0')}.png`);
      await writeFile(file, await view.screenshot());
      console.log(`gear=${String(probe.gear).padEnd(5)} `
        + `doorAngle=${String(probe.doorAngle).padStart(6)}deg  `
        + `front box ${probe.door.x} x ${probe.door.y}`);
    }
    if (view.page.problems.length) {
      console.log('page errors:');
      for (const problem of view.page.problems) console.log(`  ${problem}`);
    }
  } finally {
    await view.close();
  }
});
