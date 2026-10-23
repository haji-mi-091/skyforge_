/**
 * In-game nose-gear-door verification.
 *
 * Boots the real game with ?autostart=instant&aircraft=f16cm-block52, forces the
 * gear to a given state, and re-points the camera to look up at the nose gear
 * bay from below. This checks the doors in the shipping renderer (terrain, HUD,
 * shadows) instead of only in the isolated harness.
 *
 *   node tools/game-doors.mjs <outDir> <label>:<gear> [...]
 *
 * Static harness geometry is covered by tools/check-doors.mjs.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { withBrowser } from './cdp.mjs';

const GAME = 'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52';
const outDir = resolve(process.argv[2] || 'shots/game');
const shots = process.argv.slice(3).map((spec) => {
  const i = spec.indexOf(':');
  return { label: spec.slice(0, i), gear: Number(spec.slice(i + 1)) };
});
if (!shots.length) throw new Error('no shots requested');
await mkdir(outDir, { recursive: true });

const BOOT_TIMEOUT_MS = 120000;

// Installs a belly camera that tracks the live player jet, then reports the
// door box. Safe to call repeatedly: the camera is only installed once.
const SETUP = (gear) => `
(() => {
  const game = window.__SKYFORGE__;
  if (!game || !game.player || !game.playerJet) return { state: 'booting' };
  const jet = game.playerJet;
  if (!jet.cadGroup || !jet.cadGearDoors?.length) return { state: 'cad-loading' };
  const systems = game.player.systems;
  systems.gearTarget = ${gear};
  systems.gear = ${gear};
  jet._updateCadRig(game.player.flight, systems);
  jet.group.updateMatrixWorld(true);

  const front = jet.cadGearDoors.filter((d) => d.kind === 'front');
  const box = { min: { x: 1e9, y: 1e9, z: 1e9 }, max: { x: -1e9, y: -1e9, z: -1e9 } };
  for (const door of front) {
    const mesh = door.parts[0].mesh;
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    for (const axis of ['x', 'y', 'z']) {
      box.min[axis] = Math.min(box.min[axis], b.min[axis]);
      box.max[axis] = Math.max(box.max[axis], b.max[axis]);
    }
  }
  const world = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
  const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.5);

  const cam = game.engine.camera;
  const localCentre = jet.group.worldToLocal(
    new jet.group.position.constructor(world.x, world.y, world.z));
  const state = { localCentre, span };
  window.__DOOR_CAM__ = state;

  game._updateCamera = () => {
    const m = jet.group.matrixWorld.elements;
    // Airframe axes in world space (CAD frame: -Z forward, +Y up, +X right).
    const up = { x: m[4], y: m[5], z: m[6] };
    const forward = { x: -m[8], y: -m[9], z: -m[10] };
    const c = state.localCentre.clone().applyMatrix4(jet.group.matrixWorld);
    const d = state.span * 1.75;
    cam.position.set(c.x - up.x * d, c.y - up.y * d, c.z - up.z * d);
    cam.up.set(forward.x, forward.y, forward.z);
    cam.lookAt(c.x, c.y, c.z);
  };
  game._updateCamera();
  return {
    state: 'ok',
    gear: systems.gear,
    span: +span.toFixed(3),
    door: {
      x: [+box.min.x.toFixed(3), +box.max.x.toFixed(3)],
      y: [+box.min.y.toFixed(3), +box.max.y.toFixed(3)],
      z: [+box.min.z.toFixed(3), +box.max.z.toFixed(3)],
    },
  };
})()`;

await withBrowser(async (api) => {
  for (const { label, gear } of shots) {
    const view = await api.open(GAME);
    try {
      const started = Date.now();
      let result = null;
      while (Date.now() - started < BOOT_TIMEOUT_MS) {
        result = await view.page.evaluate(SETUP(gear));
        if (result && result.state === 'ok') break;
        await new Promise((r) => setTimeout(r, 400));
      }
      await new Promise((r) => setTimeout(r, 1200));
      // Re-apply the gear state: the aircraft's own systems update() may have
      // moved gearTarget since the first call.
      result = await view.page.evaluate(SETUP(gear));
      await new Promise((r) => setTimeout(r, 500));
      const file = join(outDir, `${label}.png`);
      await writeFile(file, await view.screenshot());
      console.log(`\n=== ${label} -> ${file}`);
      console.log(JSON.stringify(result));
      if (view.page.problems.length) {
        console.log('page errors:');
        for (const problem of view.page.problems) console.log(`  ${problem}`);
      }
    } finally {
      await view.close();
    }
  }
});
