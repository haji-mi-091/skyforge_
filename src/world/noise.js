/** Deterministic 2-D value noise and fBm, seeded per world. */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class Noise2D {
  constructor(seed = 1337) {
    this.seed = seed | 0;
  }

  value(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = fade(x - x0);
    const fy = fade(y - y0);
    const a = hash2(x0, y0, this.seed);
    const b = hash2(x0 + 1, y0, this.seed);
    const c = hash2(x0, y0 + 1, this.seed);
    const d = hash2(x0 + 1, y0 + 1, this.seed);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return (top + (bottom - top) * fy) * 2 - 1;
  }

  fbm(x, y, octaves = 5, lacunarity = 2.02, gain = 0.5) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.value(x, y) * amp;
      norm += amp;
      x = x * lacunarity + 17.3;
      y = y * lacunarity - 9.7;
      amp *= gain;
    }
    return sum / norm;
  }

  ridged(x, y, octaves = 5) {
    let sum = 0;
    let amp = 0.55;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.value(x, y));
      sum += n * n * amp;
      norm += amp;
      x = x * 2.03 + 31.1;
      y = y * 2.03 - 11.4;
      amp *= 0.5;
    }
    return sum / norm;
  }
}

/** Small seeded PRNG for scatter placement. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
