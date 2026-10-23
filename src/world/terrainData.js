/**
 * Shared analytic terrain definition. The rendered mesh, tree scatter, ground
 * collision, camera and AI terrain avoidance all sample these exact functions,
 * so there is no mismatch between what you see and what the physics hits.
 */
import { Noise2D } from './noise.js';

export const MAP_SIZE = 60000;
export const MAP_HALF = MAP_SIZE / 2;
export const SEA_LEVEL = 0;
export const BOUNDARY_RADIUS = 28500;

export const AIRBASE = Object.freeze({
  x: -3200,
  z: 2200,
  elevation: 240,
  heading: 0,
  runwayLength: 2800,
  runwayWidth: 46,
  // The graded airfield is an elongated oval aligned with the runway, not a
  // giant circular pad. This keeps the surrounding valley readable.
  flatCx: -3100,
  flatCz: 2200,
  flatRx: 650,
  flatRz: 1780,
  flatBlend: 2.6,
  startZ: 3540,
  startX: -3200,
});

const noise = new Noise2D(20240711);
const coastNoise = new Noise2D(1117);
const detailNoise = new Noise2D(99173);

function naturalHeight(x, z) {
  const warpX = noise.fbm(x * 0.000045 + 12.3, z * 0.000045 - 4.8, 3) * 2600;
  const warpZ = noise.fbm(x * 0.000045 - 7.2, z * 0.000045 + 8.9, 3) * 2600;
  const rx = x + warpX;
  const rz = z + warpZ;
  const cx = coastNoise.fbm(x * 0.000075 + 3.1, z * 0.000075 - 1.7, 4) * 0.5 + 0.5;
  const islandRadius = 9800 + (cx - 0.5) * 4300;
  const radial = Math.sqrt(rx * rx + rz * rz) / islandRadius;
  const islandShape = 1 - Math.min(1, Math.max(0, (radial - 0.63) / 0.42));
  const shaped = islandShape * islandShape * (3 - 2 * islandShape);

  const base = noise.fbm(x * 0.00016 - 3.4, z * 0.00016 + 6.7, 5);
  const ridge = noise.ridged(x * 0.00012 + 14.0, z * 0.00012 - 21.0, 5);
  const mountainMask = Math.max(0, shaped - 0.12) / 0.88;
  const mountains = 2250 * Math.pow(ridge, 1.75) *
    Math.pow(mountainMask, 1.35) * (0.78 + 0.22 * base);
  const hills = 360 * (0.5 + 0.5 * base) * shaped;
  const detail = detailNoise.fbm(x * 0.00125, z * 0.00125, 4) * 14 * shaped;
  return -78 + shaped * 120 + hills + mountains + detail;
}

function flattenAirbase(h, x, z) {
  const dx = (x - AIRBASE.flatCx) / AIRBASE.flatRx;
  const dz = (z - AIRBASE.flatCz) / AIRBASE.flatRz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= 1 + AIRBASE.flatBlend) return h;
  if (d <= 1) return AIRBASE.elevation;
  const t = (d - 1) / AIRBASE.flatBlend;
  const s = t * t * (3 - 2 * t);
  return AIRBASE.elevation + (h - AIRBASE.elevation) * s;
}

export function terrainHeight(x, z) {
  return flattenAirbase(naturalHeight(x, z), x, z);
}

export function terrainSlope(x, z, step = 12) {
  const hL = terrainHeight(x - step, z);
  const hR = terrainHeight(x + step, z);
  const hD = terrainHeight(x, z - step);
  const hU = terrainHeight(x, z + step);
  const dx = (hR - hL) / (2 * step);
  const dz = (hU - hD) / (2 * step);
  return Math.sqrt(dx * dx + dz * dz);
}

export function isOnRunway(x, z, margin = 0) {
  return Math.abs(x - AIRBASE.x) <= AIRBASE.runwayWidth / 2 + margin &&
    Math.abs(z - AIRBASE.z) <= AIRBASE.runwayLength / 2 + margin;
}

export function isOnAirbase(x, z, margin = 0) {
  const dx = (x - AIRBASE.flatCx) / (AIRBASE.flatRx + margin);
  const dz = (z - AIRBASE.flatCz) / (AIRBASE.flatRz + margin);
  return dx * dx + dz * dz <= 1;
}

/** Ground height for wheels / collisions; asphalt sits just above the mesh. */
export function groundHeight(x, z) {
  return isOnRunway(x, z, 2) ? AIRBASE.elevation + 0.12 : terrainHeight(x, z);
}

export function getSpawnPoints() {
  return {
    runway: {
      x: AIRBASE.startX,
      y: AIRBASE.elevation + 2.05,
      z: AIRBASE.startZ,
      heading: 0,
      speed: 0,
    },
    air: {
      // Instant air start: south of the island, nose north toward the enemy
      // half. Runway and test spawns keep their dedicated positions.
      x: AIRBASE.x,
      y: 3200,
      z: AIRBASE.z + 12000,
      heading: 0,
      speed: 235,
    },
    test: {
      x: 9200,
      y: 4400,
      z: 2200,
      heading: 270,
      speed: 260,
    },
  };
}
