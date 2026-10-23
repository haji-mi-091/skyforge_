/**
 * International Standard Atmosphere (ISA), 0–32 km.
 * Everything in SI units. The model is intentionally compact but uses the
 * proper layer lapse rates, so thrust, lift and Mach all vary believably.
 */
const R = 287.05287;          // J/(kg K)
const G0 = 9.80665;           // m/s^2
const GAMMA = 1.4;
const RHO0 = 1.225;
const P0 = 101325;
const T0 = 288.15;

// base altitude (m), base temperature (K), lapse rate (K/m)
const LAYERS = [
  [0, T0, -0.0065],
  [11000, 216.65, 0],
  [20000, 216.65, 0.001],
  [32000, 228.65, 0.0028],
];

const pressureAtBase = [P0];
for (let i = 1; i < LAYERS.length; i++) {
  const [h0, t0, lapse] = LAYERS[i - 1];
  const dh = LAYERS[i][0] - h0;
  const t1 = t0 + lapse * dh;
  const p1 =
    Math.abs(lapse) < 1e-9
      ? pressureAtBase[i - 1] * Math.exp((-G0 * dh) / (R * t0))
      : pressureAtBase[i - 1] * Math.pow(t1 / t0, -G0 / (R * lapse));
  pressureAtBase.push(p1);
}

const cache = new Map();

export function getAtmosphere(altitude) {
  const h = Math.max(-500, Math.min(48000, altitude));
  const key = Math.round(h / 10) * 10;
  const hit = cache.get(key);
  if (hit) return hit;

  const a = Math.max(-500, key);
  let idx = 0;
  for (let i = 0; i < LAYERS.length; i++) if (a >= LAYERS[i][0]) idx = i;
  const [h0, t0, lapse] = LAYERS[idx];
  const dh = a - h0;
  const temperature = t0 + lapse * dh;
  const pressure = pressureAtBase[idx] *
    (Math.abs(lapse) < 1e-9
      ? Math.exp((-G0 * dh) / (R * t0))
      : Math.pow(temperature / t0, -G0 / (R * lapse)));
  const density = pressure / (R * temperature);
  const speedOfSound = Math.sqrt(GAMMA * R * temperature);
  const result = {
    altitude: a,
    temperature,
    pressure,
    density,
    densityRatio: density / RHO0,
    pressureRatio: pressure / P0,
    speedOfSound,
    mach1: speedOfSound,
  };
  cache.set(key, result);
  return result;
}

/** Dynamic pressure from true airspeed and air density. */
export function dynamicPressure(tas, density) {
  return 0.5 * density * tas * tas;
}

/**
 * Calibrated airspeed from true airspeed & altitude.
 * Uses the compressible impact-pressure relation, which is what a real
 * air-data computer displays (and what War Thunder labels IAS).
 */
export function calibratedAirspeed(tas, altitude) {
  const qc = dynamicPressure(tas, getAtmosphere(altitude).density);
  const a0 = Math.sqrt(GAMMA * R * T0);
  return a0 * Math.sqrt(5 * (Math.pow(qc / P0 + 1, 2 / 7) - 1));
}

export const ISA = { R, G0, GAMMA, RHO0, P0, T0 };
