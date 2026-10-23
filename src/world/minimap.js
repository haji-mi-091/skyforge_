/**
 * Static north-up terrain map used by the HUD minimap. The high-resolution
 * world mesh is far too detailed for a 170 px scope; this bakes the coastline,
 * relief and runway into a small canvas once during world construction.
 */
import {
  MAP_SIZE, AIRBASE, SEA_LEVEL, terrainHeight,
} from './terrainData.js';

export function createMinimapCanvas(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size * MAP_SIZE - MAP_SIZE * 0.5;
      const z = (py + 0.5) / size * MAP_SIZE - MAP_SIZE * 0.5;
      const h = terrainHeight(x, z);
      let r;
      let g;
      let b;
      if (h < SEA_LEVEL) {
        const depth = Math.min(1, (-h + 10) / 160);
        r = 16 - depth * 7;
        g = 43 - depth * 17;
        b = 62 - depth * 24;
      } else {
        const height = h - SEA_LEVEL;
        const t = Math.min(1, height / 1550);
        r = 70 + t * 88;
        g = 91 + t * 42;
        b = 57 + t * 35;
        // Low, lush belt around the coast.
        if (height < 210) {
          r -= 13;
          g += 13;
          b -= 6;
        }
        if (height > 1220) {
          const snow = Math.min(1, (height - 1220) / 380);
          r += snow * 85;
          g += snow * 82;
          b += snow * 78;
        }
        // A cheap deterministic forest stipple.
        const n = Math.sin(x * 0.018) * Math.cos(z * 0.014) +
          Math.sin((x + z) * 0.007);
        if (n > 0.55 && height < 1000) {
          r -= 12;
          g -= 2;
          b -= 8;
        }
      }
      const i = (py * size + px) * 4;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Airbase runway and apron.
  const toPx = (v) => (v + MAP_SIZE * 0.5) / MAP_SIZE * size;
  const x = toPx(AIRBASE.x);
  const z1 = toPx(AIRBASE.z - AIRBASE.runwayLength * 0.5);
  const z2 = toPx(AIRBASE.z + AIRBASE.runwayLength * 0.5);
  ctx.strokeStyle = 'rgba(225,226,211,.82)';
  ctx.lineWidth = Math.max(1, size / 300);
  ctx.beginPath();
  ctx.moveTo(x, z1);
  ctx.lineTo(x, z2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(225,226,211,.35)';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.012, z1);
  ctx.lineTo(x - size * 0.012, z2);
  ctx.moveTo(x + size * 0.012, z1);
  ctx.lineTo(x + size * 0.012, z2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(220,221,202,.35)';
  ctx.fillRect(x + size * 0.015, (z1 + z2) * 0.5 - size * 0.02,
    size * 0.045, size * 0.04);
  return canvas;
}
