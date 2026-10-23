import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { withBrowser } from './cdp.mjs';
const output = resolve(process.argv[2] || 'shots/hydraulic-animation');
await mkdir(output, { recursive: true });
await withBrowser(async api => {
  const pages = [];
  try {
    for (const view of ['door-front-below', 'main-right']) {
      const page = await api.open(`http://127.0.0.1:4173/tools/gear-preview.html?gear=1&view=${view}&hud=0`);
      if (!page.ready || page.page.problems.length) throw new Error(page.page.problems.join('; ') || 'preview timeout');
      pages.push(page);
    }
    for (let frame = 0; frame <= 40; frame++) {
      const gear = 1 - frame / 40;
      for (let view = 0; view < pages.length; view++) {
        await pages[view].page.evaluate(`window.__GEAR_PREVIEW__.setGear(${gear})`);
        await writeFile(join(output, `${view}-${String(frame).padStart(3,'0')}.png`), await pages[view].screenshot());
      }
    }
    console.log(`Recorded 41 poses, nose + main wheels: ${output}`);
  } finally {
    for (const page of pages) await page.close();
  }
}, { width: 640, height: 480 });
