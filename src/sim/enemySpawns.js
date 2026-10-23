import { clamp, RAD } from './math.js';

/** Spawn inside the playable circular boundary, with room for an inbound turn. */
export function enemyWaveSpawns({
  mode,
  world,
  playerPosition,
  count = 5,
  random = Math.random,
}) {
  const spawns = [];
  const limit = Math.max(8000, world.bounds - 1800);
  for (let i = 0; i < count; i++) {
    let x, z;
    if (mode === 'runway') {
      const innerInset = Math.min(3400, world.bounds * 0.14);
      const band = Math.min(2200, world.bounds * 0.09);
      for (let attempt = 0; attempt < 64; attempt++) {
        const angle =
          attempt < 24
            ? random() * Math.PI * 2
            : i * 2.399963229728653 + (attempt - 24) * 0.55;
        const radius = world.bounds - innerInset - random() * band;
        x = Math.sin(angle) * radius;
        z = Math.cos(angle) * radius;
        if (spawns.every((p) => Math.hypot(p.x - x, p.z - z) > 3500)) break;
      }
    } else {
      // Preserve the northern opening for the other combat modes.
      const lane = (i - (count - 1) * 0.5) * 5600;
      x = clamp(lane + (random() - 0.5) * 2400, -limit * 0.72, limit * 0.72);
      z = clamp(-7000 - random() * 13000, -limit, -5000);
    }
    const dx = playerPosition.x - x,
      dz = playerPosition.z - z;
    const distance = Math.hypot(dx, dz) || 1;
    let terrain = world.groundHeight(x, z);
    // Include the first few kilometres of the inbound route, so spawning over
    // a valley does not point a new aircraft straight into the next ridge.
    for (const along of [700, 1400, 2400]) {
      terrain = Math.max(
        terrain,
        world.groundHeight(
          x + (dx / distance) * along,
          z + (dz / distance) * along,
        ),
      );
    }
    const y = Math.max(
      terrain + 1600,
      clamp(playerPosition.y + 350 + (random() - 0.3) * 1100, 1600, 8000),
    );
    spawns.push({
      x,
      y,
      z,
      heading: Math.atan2(dx, -dz) * RAD,
      speed: 245 + random() * 30,
      throttle: 1.05,
    });
  }
  return spawns;
}
