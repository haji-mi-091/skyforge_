/**
 * Drive a real gear retraction/extension cycle in the shipping game and log
 * the door geometry against `systems.gear` at each step.
 *
 *   node tools/game-gear-cycle.mjs [outDir]
 *
 * The point is to remove every assumption: same page, same update loop, same
 * chase camera the player sees, gear driven through the game's own systems
 * object rather than a harness.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { withBrowser } from './cdp.mjs';

const GAME = 'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52';
const outDir = resolve(process.argv[2] || 'shots/cycle');
await mkdir(outDir, { recursive: true });

const BOOT_TIMEOUT_MS = 120000;

// Reads the live state. Never writes the gear values: the game drives them.
const PROBE = `
(() => {
  const game = window.__SKYFORGE__;
  if (!game || !game.player || !game.playerJet) return { state: 'booting' };
  const jet = game.playerJet;
  if (!jet.cadGroup || !jet.cadGearDoors?.length) return { state: 'cad-loading' };
  const systems = game.player.systems;
  jet.group.updateMatrixWorld(true);
  const boxOf = (kind) => {
    const box = { min: { x: 1e9, y: 1e9, z: 1e9 }, max: { x: -1e9, y: -1e9, z: -1e9 } };
    for (const door of jet.cadGearDoors) {
      if (door.kind !== kind) continue;
      for (const part of door.parts) {
        const mesh = part.mesh;
        if (!mesh.visible) continue;
        mesh.geometry.computeBoundingBox();
        const b = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
        for (const axis of ['x', 'y', 'z']) {
          box.min[axis] = Math.min(box.min[axis], b.min[axis]);
          box.max[axis] = Math.max(box.max[axis], b.max[axis]);
        }
      }
    }
    return {
      size: {
        x: +(box.max.x - box.min.x).toFixed(3),
        y: +(box.max.y - box.min.y).toFixed(3),
        z: +(box.max.z - box.min.z).toFixed(3),
      },
      yMin: +box.min.y.toFixed(3),
      yMax: +box.max.y.toFixed(3),
      visible: jet.cadGearDoors.filter((d) => d.kind === kind)
        .every((d) => d.parts.every((p) => p.mesh.visible)),
      angle: +jet.cadGearDoors.filter((d) => d.kind === kind)
        .map((d) => d.lastAngle ?? NaN)[0],
    };
  };
  return {
    state: 'ok',
    gear: +systems.gear.toFixed(3),
    gearTarget: +systems.gearTarget.toFixed(3),
    front: boxOf('front'),
    main: boxOf('main'),
  };
})()`;

const SET_TARGET = (target) => `
(() => {
  const game = window.__SKYFORGE__;
  game.player.systems.gearTarget = ${target};
  return game.player.systems.gearTarget;
})()`;

await withBrowser(async (api) => {
  const view = await api.open(GAME);
  try {
    const started = Date.now();
    while (Date.now() - started < BOOT_TIMEOUT_MS) {
      const probe = await view.page.evaluate(PROBE);
      if (probe && probe.state === 'ok') break;
      await new Promise((r) => setTimeout(r, 400));
    }

    const samples = [];
    const snap = async (label, file) => {
      const probe = await view.page.evaluate(PROBE);
      samples.push({ label, ...probe });
      if (file) await writeFile(join(outDir, file), await view.screenshot());
      console.log(`${label.padEnd(22)} gear=${probe.gear} target=${probe.gearTarget} `
        + `front size=${probe.front.size.x}x${probe.front.size.y} `
        + `y[${probe.front.yMin},${probe.front.yMax}] visible=${probe.front.visible}`);
    };

    // Start airborne with the gear up (autostart=instant).
    await snap('start (expect up)', 'start.png');

    console.log('\n--- command gear DOWN, sample while it runs ---');
    await view.page.evaluate(SET_TARGET(1));
    for (let i = 1; i <= 8; i++) {
      await new Promise((r) => setTimeout(r, 350));
      const probe = await view.page.evaluate(PROBE);
      console.log(`  t+${(i * 0.35).toFixed(2)}s gear=${probe.gear} `
        + `frontSize=${probe.front.size.x}x${probe.front.size.y} `
        + `y[${probe.front.yMin},${probe.front.yMax}]`);
      if (i === 8) samples.push({ label: 'down settled', ...probe });
    }
    await snap('gear down', 'gear-down.png');

    console.log('\n--- command gear UP, sample while it runs ---');
    await view.page.evaluate(SET_TARGET(0));
    for (let i = 1; i <= 8; i++) {
      await new Promise((r) => setTimeout(r, 350));
      const probe = await view.page.evaluate(PROBE);
      console.log(`  t+${(i * 0.35).toFixed(2)}s gear=${probe.gear} `
        + `frontSize=${probe.front.size.x}x${probe.front.size.y} `
        + `y[${probe.front.yMin},${probe.front.yMax}]`);
    }
    await snap('gear up', 'gear-up.png');

    console.log('\n--- summary ---');
    for (const sample of samples) {
      if (sample.state !== 'ok') continue;
      console.log(`${sample.label.padEnd(22)} gear=${String(sample.gear).padEnd(5)} `
        + `front door ${sample.front.size.x} x ${sample.front.size.y} `
        + `y[${sample.front.yMin},${sample.front.yMax}]`);
    }
    if (view.page.problems.length) {
      console.log('page errors:');
      for (const problem of view.page.problems) console.log(`  ${problem}`);
    }
  } finally {
    await view.close();
  }
});
