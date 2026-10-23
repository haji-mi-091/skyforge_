/**
 * Fly-by-wire control law.
 *
 * Stick inputs are interpreted as body-rate / load-factor commands. A
 * computed-torque inner loop inverts the aerodynamic moment model, so the jet
 * feels crisp and consistent at 200 kt or Mach 2 without hiding the physics:
 * the control surfaces still have authority, rate and deflection limits.
 *
 *   pitch : G command with AoA / load-factor envelope protection
 *   roll  : roll-rate command
 *   yaw   : sideslip-nulling damper + optional pilot rudder
 */
import { clamp, moveTowards, smoothstep } from './math.js';

const G0 = 9.80665;

function steadyTurnRate(loadFactor, speed) {
  if (speed < 1) return 0;
  const sign = Math.sign(loadFactor) || 1;
  const n = Math.abs(loadFactor);
  if (n <= 1) return 0;
  return sign * (G0 / speed) * Math.sqrt(n * n - 1);
}

export class ControlSystem {
  constructor(config, aero) {
    this.config = config;
    this.aero = aero;
    this.surfaces = {
      elevator: 0,
      aileron: 0,
      rudder: 0,
      flaps: 0,
      gear: 0,
      airbrake: 0,
      stores: 1,
    };
    this.commands = { pitch: 0, roll: 0, yaw: 0 };
    this.feedback = { qCmd: 0, pCmd: 0, nCmd: 1, alphaLimit: 0, flapTrimElevator: 0 };
    this._prevN = 1;
    this.disabled = false;
  }

  reset() {
    this.surfaces.elevator = 0;
    this.surfaces.aileron = 0;
    this.surfaces.rudder = 0;
    this.commands.pitch = this.commands.roll = this.commands.yaw = 0;
    this._prevN = 1;
    Object.assign(this.feedback, { qCmd: 0, pCmd: 0, nCmd: 1, flapTrimElevator: 0 });
  }

  /**
   * @param {object} air - live air data from FlightModel, including normalLoad.
   * @param {object} inputs - { pitch, roll, yaw } normalised [-1, 1].
   * @param {object} systems - { flaps, gear, airbrake, stores } 0..1.
   * @param {number} dt
   */
  update(air, inputs, systems, dt) {
    const cfg = this.config;
    const a = cfg.aero;
    const S = cfg.geometry.wingArea;
    const c = cfg.geometry.chord;
    const b = cfg.geometry.wingspan;
    const mass = air.mass;
    const weight = mass * G0;
    const q = air.dynamicPressure;
    const V = air.safeSpeed;

    this.commands.pitch = clamp(inputs.pitch || 0, -1, 1);
    this.commands.roll = clamp(inputs.roll || 0, -1, 1);
    this.commands.yaw = clamp(inputs.yaw || 0, -1, 1);

    // Physical system positions are owned here so the aero solver gets one
    // coherent snapshot every physics tick.
    this.surfaces.flaps = systems.flaps;
    this.surfaces.gear = systems.gear;
    this.surfaces.airbrake = systems.airbrake;
    this.surfaces.stores = systems.stores;

    // Flap trim cancels the real flap moment below; it is not a persistent
    // positive-G command. Releasing the stick keeps the same 1-G reference.
    const nCmdRaw = 1 + this.commands.pitch *
      (this.commands.pitch >= 0
        ? (cfg.limits.gPositive - 1)
        : (1 - cfg.limits.gNegative));

    // Available lift at the AoA limit, plus the structural limit.
    const clAtLimit = this.aero.estimateLiftCoefficient(
      cfg.limits.alphaLimit, air.mach, systems.flaps);
    const clAtNegLimit = this.aero.estimateLiftCoefficient(
      cfg.limits.alphaNegative, air.mach, systems.flaps);
    const nLimitHigh = Math.max(1, (q * S * clAtLimit) / weight);
    const nLimitLow = Math.min(-1, (q * S * clAtNegLimit) / weight);
    let nCmd = clamp(nCmdRaw,
      Math.max(cfg.limits.gNegative, nLimitLow),
      Math.min(cfg.limits.gPositive, nLimitHigh));
    // Keep a small margin below the actual stall boundary.
    nCmd = clamp(nCmd, cfg.limits.gNegative, cfg.limits.gPositive);

    const n = Number.isFinite(air.normalLoad) ? air.normalLoad : 1;
    const prevN = Number.isFinite(this._prevN) ? this._prevN : n;
    const nDot = clamp((n - prevN) / Math.max(dt, 1e-4), -20, 20);
    this._prevN = n;
    const turnRate = steadyTurnRate(nCmd, V);
    // Load-factor error springs the nose toward the commanded G; the nDot
    // term damps that spring so releasing the stick settles instead of
    // oscillating around the trim load factor.
    let qCmd = turnRate + (nCmd - n) * 0.28 - nDot * 0.12;
    qCmd = clamp(qCmd, -0.8, 0.8);

    // Hard AoA guards override the G command near the envelope edge.
    const alphaGuard = (cfg.limits.alphaLimit - air.alpha) * 9;
    const negAlphaGuard = (cfg.limits.alphaNegative - air.alpha) * 9;
    if (qCmd > alphaGuard) qCmd = alphaGuard;
    if (qCmd < negAlphaGuard) qCmd = negAlphaGuard;
    qCmd = clamp(qCmd, -0.8, 0.8);

    // --- Pitch: computed-torque rate loop --------------------------------
    const pitchDyn = Math.max(1, q * S * c);
    const qdotCmd = clamp((qCmd - air.rates.q) * 5.0, -2.6, 2.6);
    const cmFlaps=this.aero.flapPitchMoment(systems.flaps);
    const cmBase = this.aero.pitchBaseCoefficient(air, this.surfaces)-cmFlaps;
    const flapTrimElevator=-cmFlaps/a.cmElevator;
    let elevator = ((qdotCmd * cfg.inertia.pitch) / pitchDyn - cmBase) /
      a.cmElevator+flapTrimElevator;
    elevator = clamp(elevator, -a.elevatorMax, a.elevatorMax);

    // --- Roll: rate command ---------------------------------------------
    const rollAuthority = 1 - 0.20 * smoothstep(1.2, 2.0, air.mach);
    const highAlpha = smoothstep(
      cfg.limits.alphaLimit * 0.65, cfg.limits.alphaLimit, Math.abs(air.alpha));
    // ~270°/s at combat speed, matching the public F-16A roll figures rather
    // than a made-up game value. The aileron actuator and authority limits still
    // decide whether the jet can actually reach the command.
    const pCmd = this.commands.roll * (cfg.control?.rollRate??4.9) * rollAuthority * (1 - 0.45 * highAlpha);
    const rollDyn = Math.max(1, q * S * b);
    const pdotCmd = clamp((pCmd - air.rates.p) * 9, -26, 26);
    const clBase = this.aero.rollBaseCoefficient(air, this.surfaces);
    let aileron = ((pdotCmd * cfg.inertia.roll) / rollDyn - clBase) /
      a.clAileron;
    aileron = clamp(aileron, -a.aileronMax, a.aileronMax);

    // --- Yaw: beta damper and pilot rudder ------------------------------
    const rCmd = this.commands.yaw * 0.55 + air.beta * 1.35;
    const yawDyn = Math.max(1, q * S * b);
    const rdotCmd = clamp((clamp(rCmd, -0.6, 0.6) - air.rates.r) * 5.5, -2.2, 2.2);
    const cnBase = this.aero.yawBaseCoefficient(air, this.surfaces);
    let rudder = ((rdotCmd * cfg.inertia.yaw) / yawDyn - cnBase) /
      a.cnRudder;
    rudder = clamp(rudder, -a.rudderMax, a.rudderMax);

    // Hydraulic actuators have finite rate and travel.
    this.surfaces.elevator = moveTowards(
      this.surfaces.elevator, elevator, a.elevatorRate * dt);
    this.surfaces.aileron = moveTowards(
      this.surfaces.aileron, aileron, a.aileronRate * dt);
    this.surfaces.rudder = moveTowards(
      this.surfaces.rudder, rudder, a.rudderRate * dt);

    this.feedback.qCmd = qCmd;
    this.feedback.pCmd = pCmd;
    this.feedback.nCmd = nCmd;
    this.feedback.alphaLimit = cfg.limits.alphaLimit;
    this.feedback.flapTrimElevator = flapTrimElevator;

    return this.surfaces;
  }

  /** Direct surface control, used for ground steering and failure tests. */
  setDirect(elevator, aileron, rudder, dt) {
    const a = this.config.aero;
    this.surfaces.elevator = moveTowards(
      this.surfaces.elevator, clamp(elevator, -a.elevatorMax, a.elevatorMax),
      a.elevatorRate * dt);
    this.surfaces.aileron = moveTowards(
      this.surfaces.aileron, clamp(aileron, -a.aileronMax, a.aileronMax),
      a.aileronRate * dt);
    this.surfaces.rudder = moveTowards(
      this.surfaces.rudder, clamp(rudder, -a.rudderMax, a.rudderMax),
      a.rudderRate * dt);
    return this.surfaces;
  }
}
