/**
 * Headless flight-model validation. Run with:
 *   node tests/flight.test.mjs
 *
 * These are engineering smoke tests, not certification: they catch sign errors,
 * unstable FBW loops, broken energy behaviour and NaNs before the browser does.
 */
import { F16A } from '../src/data/aircraft.js';
import { FlightModel } from '../src/sim/FlightModel.js';
import { RAD } from '../src/sim/math.js';

const STEP = 1 / 120;
const systems = { flaps: 0, gear: 0, airbrake: 0, stores: 1 };
let failures = 0;

function assert(cond, msg, extra = '') {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${msg}${extra ? `  (${extra})` : ''}`);
  } else {
    console.log(`  ok    ${msg}`);
  }
}

function fmt(n, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d) : 'NaN';
}

function run(seconds, controller, setup = {}, sampleEvery = 5) {
  const fm = new FlightModel(F16A);
  fm.reset({ y: 3000, speed: 250, throttle: 0.86, ...setup });
  const startMass = fm.mass;
  const history = [];
  let nextSample = 0;
  for (let t = 0; t < seconds; t += STEP) {
    const inputs = controller(fm, t);
    fm.step(STEP, inputs, systems);
    if (t >= nextSample) {
      history.push({
        t: fm.time,
        alt: fm.position.y,
        tas: fm.tas,
        ias: fm.iasKmh,
        mach: fm.mach,
        aoa: fm.aoaDeg,
        g: fm.normalLoad,
        pitch: fm.pitch,
        bank: fm.bank,
        heading: fm.heading,
        vs: fm.verticalSpeed,
        thrust: fm.engineThrust,
        drag: fm.dragN,
        fuel: fm.fuel,
        q: fm.rates.q,
        p: fm.rates.p,
        r: fm.rates.r,
        elev: fm.control.surfaces.elevator,
      });
      nextSample += sampleEvery;
    }
  }
  return { fm, history, startMass };
}

console.log('\n=== 1. Level-flight stability, 3 km, 250 m/s, MIL ===');
{
  const { fm, history } = run(40, (m) => ({
    pitch: 0, roll: 0, yaw: 0, throttle: 0.86,
  }));
  const last = history.at(-1);
  for (const h of history.filter((_, i) => i % 2 === 0)) {
    console.log(
      `  t=${fmt(h.t, 0).padStart(2)}s  alt=${fmt(h.alt, 0).padStart(5)}m  ` +
      `IAS=${fmt(h.ias, 0).padStart(4)}  M=${fmt(h.mach, 2)}  a=${fmt(h.aoa, 1).padStart(5)}°  ` +
      `G=${fmt(h.g, 2)}  pitch=${fmt(h.pitch, 1).padStart(5)}°  VS=${fmt(h.vs, 1).padStart(5)}  ` +
      `q=${fmt(h.q, 3)}  elev=${fmt(h.elev, 3)}`);
  }
  assert(Number.isFinite(last.alt) && Number.isFinite(last.tas), 'state remains finite');
  assert(Math.abs(last.vs) < 25, 'roughly holds altitude', `VS=${fmt(last.vs)} m/s`);
  assert(last.g > 0.6 && last.g < 1.8, 'holds approximately 1 g', `G=${fmt(last.g, 2)}`);
}

console.log('\n=== 2. Full-afterburner acceleration at 11 km ===');
{
  const { fm, history } = run(150, () => ({
    pitch: 0, roll: 0, yaw: 0, throttle: 1.1,
  }), { y: 11000, speed: 400, throttle: 1.1 });
  for (const h of history.filter((_, i) => i % 4 === 0)) {
    console.log(
      `  t=${fmt(h.t, 0).padStart(3)}s  alt=${fmt(h.alt, 0).padStart(6)}m  ` +
      `TAS=${fmt(h.tas, 0).padStart(4)}m/s  M=${fmt(h.mach, 2)}  ` +
      `thrust=${fmt(h.thrust / 1000, 1).padStart(5)}kN  drag=${fmt(h.drag / 1000, 1).padStart(5)}kN  ` +
      `aoa=${fmt(h.aoa, 1)}°  VS=${fmt(h.vs, 1)}`);
  }
  const last = history.at(-1);
  assert(last.mach > 1.75, 'reaches supersonic speed at altitude', `M=${fmt(last.mach, 2)}`);
  assert(last.alt > 9000, 'does not dive out of the test', `alt=${fmt(last.alt, 0)} m`);
}

console.log('\n=== 3. 9 g pull from 300 m/s, sea level ===');
{
  const { fm, history } = run(12, (m, t) => ({
    pitch: t > 0.5 && t < 8 ? 1 : 0, roll: 0, yaw: 0, throttle: 1.1,
  }), { y: 500, speed: 300, throttle: 1.1 });
  let maxG = 0;
  let maxRate = 0;
  for (const h of history) {
    maxG = Math.max(maxG, h.g);
    maxRate = Math.max(maxRate, Math.sqrt(h.tas > 0 ? h.g * h.g - 1 : 0) * 9.80665 / h.tas * RAD);
  }
  for (const h of history.filter((_, i) => i % 1 === 0)) {
    console.log(
      `  t=${fmt(h.t, 0).padStart(2)}s  IAS=${fmt(h.ias, 0).padStart(4)}  ` +
      `a=${fmt(h.aoa, 1).padStart(5)}°  G=${fmt(h.g, 2).padStart(5)}  ` +
      `pitch=${fmt(h.pitch, 1).padStart(5)}°  q=${fmt(h.q, 2)}  elev=${fmt(h.elev, 3)}`);
  }
  assert(maxG > 7.0, 'achieves high load factor', `maxG=${fmt(maxG, 2)}`);
  assert(maxG < 10.2, 'respects 9 g structural command', `maxG=${fmt(maxG, 2)}`);
  assert(fm.aoaDeg < 30, 'does not depart past the AoA limit', `AoA=${fmt(fm.aoaDeg)}°`);
}

console.log('\n=== 4. Roll-rate response ===');
{
  const { fm, history } = run(6, (m, t) => ({
    pitch: 0, roll: t > 0.5 && t < 3 ? 1 : 0, yaw: 0, throttle: 1.1,
  }), { y: 3000, speed: 250, throttle: 1.1 }, 0.1);
  const peak = Math.max(...history.map((h) => Math.abs(h.p))) * RAD;
  for (const h of history.filter((_, i) => i % 5 === 0)) {
    console.log(`  t=${fmt(h.t, 1)}s  p=${fmt(h.p, 2)} rad/s  bank=${fmt(h.bank, 0)}°`);
  }
  // Public F-16A figures are in the ~270°/s class (WT Wiki's summary table does
  // not list roll rate). This catches an accidental return to the old 227°/s
  // capped behaviour while still bounding the FBW command.
  assert(peak > 240, 'roll rate matches the F-16A ~270°/s class', `peak=${fmt(peak, 0)}°/s`);
  assert(peak < 330, 'roll rate stays within the commanded limit', `peak=${fmt(peak, 0)}°/s`);
}

console.log('\n=== 5. Fuel burn and mass ===');
{
  const { fm, startMass } = run(30, () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 1.1 }),
    { y: 3000, speed: 250, throttle: 1.1 });
  console.log(`  fuel=${fmt(fm.fuel, 1)} kg  mass=${fmt(fm.mass, 0)} kg  ` +
    `thrust=${fmt(fm.engineThrust / 1000, 1)} kN`);
  assert(fm.fuel < F16A.systems.maxFuel, 'fuel is consumed');
  assert(fm.mass < startMass, 'mass follows fuel burn', `${fmt(fm.mass, 0)} < ${fmt(startMass, 0)}`);
}

console.log(`\n${failures === 0 ? 'PASS' : `${failures} FAILURE(S)`}`);
process.exitCode = failures === 0 ? 0 : 1;
