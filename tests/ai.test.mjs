import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import { Aircraft } from '../src/sim/Aircraft.js';
import { MIG29 } from '../src/data/aircraft.js';
import { AIPilot } from '../src/sim/AIPilot.js';
import { enemyWaveSpawns } from '../src/sim/enemySpawns.js';
import {
  groundHeight,
  isOnRunway,
  isOnAirbase,
  BOUNDARY_RADIUS,
} from '../src/world/terrainData.js';
import { mulberry32 } from '../src/world/noise.js';

const world = {
  groundHeight,
  isRunway: isOnRunway,
  isAirbase: isOnAirbase,
  bounds: BOUNDARY_RADIUS,
};
const random = mulberry32(20261020),
  originalRandom = Math.random;
Math.random = random;
const quadrants = [0, 0, 0, 0];
for (let wave = 0; wave < 200; wave++) {
  const playerPosition = new T.Vector3(-3200, 300, 2200);
  const spawns = enemyWaveSpawns({
    mode: 'runway',
    world,
    playerPosition,
    random,
  });
  assert.equal(spawns.length, 5);
  for (let i = 0; i < spawns.length; i++) {
    const p = spawns[i],
      radius = Math.hypot(p.x, p.z);
    assert.ok(
      radius >= world.bounds - 5600 - 1e-6 &&
        radius <= world.bounds - 3400 + 1e-6,
      'runway enemies on inset perimeter',
    );
    assert.ok(
      p.y - groundHeight(p.x, p.z) >= 1600,
      'safe spawn terrain clearance',
    );
    const toward = playerPosition.clone().sub(new T.Vector3(p.x, p.y, p.z));
    toward.y = 0;
    toward.normalize();
    assert.ok(
      toward.dot(
        new T.Vector3(
          Math.sin((p.heading * Math.PI) / 180),
          0,
          -Math.cos((p.heading * Math.PI) / 180),
        ),
      ) > 0.999999,
      'spawn faces player',
    );
    assert.ok(
      spawns.slice(0, i).every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 3500),
      'spawn spacing',
    );
    quadrants[(p.x >= 0 ? 1 : 0) + (p.z >= 0 ? 2 : 0)]++;
  }
}
assert.ok(
  quadrants.every((n) => n > 150),
  'all four sides represented over seeded waves',
);
assert.ok(
  enemyWaveSpawns({
    mode: 'instant',
    world,
    playerPosition: new T.Vector3(0, 3000, 0),
    random,
  }).every((p) => p.z <= -5000),
  'other modes retain northern opening',
);
assert.ok(
  enemyWaveSpawns({
    mode: 'runway',
    world,
    playerPosition: new T.Vector3(),
    random: () => 0.5,
  }).every((p, i, a) =>
    a.slice(0, i).every((q) => Math.hypot(p.x - q.x, p.z - q.z) > 3500),
  ),
  'bounded retry handles repeated random values',
);

const results = [];
function simulate(
  name,
  pose,
  {
    seconds = 180,
    skill = 0.52,
    passive = false,
    land = world,
    moving = false,
    evade = false,
  } = {},
) {
  const ac = new Aircraft(MIG29);
  ac.reset({ ...pose, throttle: 1.05 });
  const ai = new AIPilot(ac, { skill, passive });
  const target = new Aircraft(MIG29);
  target.reset({
    x: -3200,
    z: 2200,
    y: groundHeight(-3200, 2200) + 80,
    speed: 200,
    heading: 0,
  });
  let minAgl = Infinity,
    minSpeed = Infinity,
    maxIas = 0,
    closest = Infinity,
    missiles = 0,
    recoveries = 0,
    lastRecovery = false;
  const dt = 1 / 120;
  for (let t = 0; t < seconds && ac.alive; t += dt) {
    if (moving) {
      const phase = (t * 210) / 4200;
      target.flight.position.set(
        4200 * Math.cos(phase),
        2800 + 500 * Math.sin(phase * 0.65),
        4200 * Math.sin(phase),
      );
      target.flight.velocity.set(
        -210 * Math.sin(phase),
        ((500 * 0.65 * 210) / 4200) * Math.cos(phase * 0.65),
        210 * Math.cos(phase),
      );
      target.flight.tas = target.flight.velocity.length();
    }
    const threats =
      evade && t < 60
        ? [
            {
              alive: true,
              target: ac,
              position: ac.flight.position
                .clone()
                .add(new T.Vector3(2000, 300, 1800)),
            },
          ]
        : [];
    const inputs = ai.update(dt, target, land, threats);
    ac.update(dt, inputs, land);
    assert.ok(
      Object.values(inputs).every(Number.isFinite),
      'finite pilot commands',
    );
    assert.ok(Math.abs(inputs.roll) <= 1 && Math.abs(inputs.pitch) <= 1);
    const agl =
      ac.flight.position.y -
      land.groundHeight(ac.flight.position.x, ac.flight.position.z);
    minAgl = Math.min(minAgl, agl);
    minSpeed = Math.min(minSpeed, ac.flight.tas);
    maxIas = Math.max(maxIas, ac.flight.iasKmh);
    closest = Math.min(
      closest,
      ac.flight.position.distanceTo(target.flight.position),
    );
    if (ai.requestMissile) missiles++;
    if (ai.recovering && !lastRecovery) recoveries++;
    lastRecovery = ai.recovering;
  }
  const result = {
    name,
    alive: ac.alive,
    health: ac.health,
    minAgl,
    minSpeed,
    maxIas,
    closest,
    missiles,
    recoveries,
  };
  results.push(result);
  assert.ok(ac.alive, JSON.stringify(result));
  assert.ok(minAgl > 350, 'terrain clearance: ' + JSON.stringify(result));
  assert.ok(
    ac.health > 95,
    'no structural self-destruction: ' + JSON.stringify(result),
  );
  if (moving && !passive && !evade) {
    assert.ok(
      closest < 2200,
      'still pursues target: ' + JSON.stringify(result),
    );
    assert.ok(
      missiles > 0,
      'retains weapon opportunities: ' + JSON.stringify(result),
    );
  }
}
simulate('low target pursuit', {
  x: 0,
  z: -7000,
  y: 2000,
  heading: 0,
  speed: 260,
});
simulate('low energy', { x: -3200, z: 0, y: 1400, heading: 180, speed: 150 });
simulate('banked dive', {
  x: 0,
  z: 0,
  y: 1800,
  heading: 0,
  pitch: -30,
  roll: 65,
  speed: 290,
});
simulate('inverted descent', {
  x: 0,
  z: 0,
  y: 2200,
  heading: 0,
  pitch: -15,
  roll: 155,
  speed: 260,
});
simulate(
  'training patrol',
  { x: 0, z: -7000, y: 1800, heading: 90, speed: 240 },
  { passive: true },
);
simulate(
  'missile evasion',
  { x: 2000, z: 2000, y: 2500, heading: 0, speed: 270 },
  { evade: true },
);
for (const [i, skill] of [0.3, 0.52, 0.9].entries())
  simulate(
    'moving target skill ' + skill,
    {
      x: -9000 + i * 9000,
      z: -9000,
      y: 3000,
      heading: 135 - i * 50,
      speed: 260,
    },
    { moving: true, seconds: 300, skill },
  );
const ridge = {
  ...world,
  groundHeight: (x, z) => 2400 * Math.exp(-(((z + 8000) / 900) ** 2)),
  isRunway: () => false,
  isAirbase: () => false,
};
simulate(
  'terrain ahead ridge',
  { x: 0, z: -5000, y: 2600, heading: 0, speed: 290 },
  { land: ridge, seconds: 120 },
);
Math.random = originalRandom;
await writeFile(
  'work/ai-check.json',
  JSON.stringify({ quadrants, results }, null, 2),
);
console.log(
  'PASS: 1000 runway spawns, four-side distribution, spacing and terrain clearance; other-mode compatibility; 10 flight scenarios including three five-minute moving-target fights, low energy, dive, inverted recovery, missile evasion, ridge and patrol',
);
console.table(
  results.map((r) => ({
    scenario: r.name,
    minAGL: Math.round(r.minAgl),
    health: Math.round(r.health),
    nearest: Math.round(r.closest),
    launches: r.missiles,
  })),
);
