/**
 * Headless screenshot driver for the gear-door verification harness.
 *
 *   node tools/shoot.mjs <outDir> <label>:<query> [<label>:<query> ...]
 *
 * Example:
 *   node tools/shoot.mjs shots/after "gear-up:nose-below&gear=0" \
 *     "gear-down:nose-below&gear=1"
 *
 * Prints the harness's own bounding-box report for every shot so the numbers
 * land next to the image in the transcript.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { withBrowser } from './cdp.mjs';

const HARNESS = 'http://127.0.0.1:4173/tools/gear-preview.html';
const outDir = resolve(process.argv[2] || 'shots');
const shots = process.argv.slice(3).map((spec) => {
  const i = spec.indexOf(':');
  return { label: spec.slice(0, i), query: spec.slice(i + 1) };
});
if (!shots.length) throw new Error('no shots requested');

await mkdir(outDir, { recursive: true });

await withBrowser(async (api) => {
  for (const { label, query } of shots) {
    const view = await api.open(`${HARNESS}?${query}`);
    try {
      const file = join(outDir, `${label}.png`);
      await writeFile(file, await view.screenshot());
      const info = await view.info();
      console.log(`\n=== ${label} -> ${file}`);
      console.log(view.ready ? 'ready: yes' : 'ready: NO (timeout)');
      if (info?.text) console.log(info.text);
      if (view.page.problems.length) {
        console.log('page errors:');
        for (const problem of view.page.problems) console.log(`  ${problem}`);
      }
    } finally {
      await view.close();
    }
  }
});
