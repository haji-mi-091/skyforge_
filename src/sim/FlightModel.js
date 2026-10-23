/**
 * Six-degree-of-freedom flight model: rigid-body translation and rotation,
 * atmosphere, turbojet with afterburner, fuel burn, FBW and actuator dynamics.
 * Rendering never touches this class except by reading its public state.
 */
import * as THREE from '../../vendor/three.module.js';
import { getAtmosphere, calibratedAirspeed } from './Atmosphere.js';
import { Aerodynamics } from './Aerodynamics.js';
import { ControlSystem } from './ControlSystem.js';
import {
  clamp, damp, RAD, basisFromQuaternion, worldToBody, bodyToWorld,
  integrateOrientation, quaternionFromAttitude,
} from './math.js';

const G0 = 9.80665;
const _forceWorld = new THREE.Vector3();
const _thrustBody = new THREE.Vector3();
const _omegaWorld = new THREE.Vector3();
const _velBody = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const qFromAttitude = quaternionFromAttitude;

export class FlightModel {
  constructor(config) {
    this.config = config;
    this.aero = new Aerodynamics(config);
    this.control = new ControlSystem(config, this.aero);
    this.basis = {};
    this.air = {
      velocityBody: new THREE.Vector3(),
      rates: { p: 0, q: 0, r: 0 },
      density: 1.225, alpha: 0, beta: 0, mach: 0, safeSpeed: 0,
      dynamicPressure: 0, agl: 1000, time: 0, mass: 10000, normalLoad: 1,
    };
    this.events = [];
    this.reset();
  }

  reset(opts = {}) {
    const cfg = this.config;
    this.position = new THREE.Vector3(
      opts.x ?? 0, opts.y ?? 3500, opts.z ?? 0);
    this.orientation = qFromAttitude(
      opts.heading ?? 0, opts.pitch ?? 0, opts.roll ?? 0);
    this.velocity = new THREE.Vector3(0, 0, -(opts.speed ?? 220))
      .applyQuaternion(this.orientation);
    this.rates = { p: 0, q: 0, r: 0 };
    this.acceleration = new THREE.Vector3();
    this.fuel = opts.fuel ?? cfg.systems.maxFuel;
    this.ammoMass = cfg.mass.ammo;
    this.storesMass = cfg.mass.stores;
    this.mass = cfg.mass.empty + (cfg.mass.engine || 0) +
      this.fuel + this.ammoMass + this.storesMass;
    this.throttle = opts.throttle ?? 0.86;
    this.engineSpool = opts.spool ?? this.throttle;
    this.engineThrust = 0;
    this.afterburner = 0;
    this.fuelFlow = 0;
    this.fuelEndurance = 0;
    this.time = 0;
    this.normalLoad = 1;
    this.alpha = 0;
    this.beta = 0;
    this.mach = 0;
    this.iasKmh = 0;
    this.tas = 0;
    this.verticalSpeed = 0;
    this.density = 1.225;
    this.crashed = false;
    this.onGround = false;
    this.groundNormal = null;
    this._lastDiagnostics = null;
    this.prevPosition = this.prevPosition || new THREE.Vector3();
    this.prevOrientation = this.prevOrientation || new THREE.Quaternion();
    this.prevVelocity = this.prevVelocity || new THREE.Vector3();
    this._storePreviousPose();
    this.control.reset();
    this.control.surfaces.flaps = opts.flaps ?? 0;
    this.control.surfaces.gear = opts.gear ?? 0;
    this.events.length = 0;
    this.updateAirData();
    const f = this.basis.forward;
    const right = this.basis.right;
    const up = this.basis.up;
    this.pitch = Math.asin(clamp(f.y, -1, 1)) * RAD;
    this.heading = (Math.atan2(f.x, -f.z) * RAD + 360) % 360;
    this.bank = Math.atan2(-right.y, up.y) * RAD;
    this.verticalSpeed = this.velocity.y;
    this.turnRate = 0;
    this.specificExcessPower = 0;
    this.aoaDeg = 0;
    this.betaDeg = 0;
    this.gLoad = 1;
    this.dragN = 0;
    this.liftN = 0;
    this.buffet = 0;
    this.groundEffect = 0;
    this.diagnostics = null;
  }

  /**
   * @param {number} dt fixed physics step
   * @param {object} inputs { pitch, roll, yaw, throttle, trim }
   * @param {object} systems { flaps, gear, airbrake, stores }
   */
  step(dt, inputs, systems) {
    if (this.crashed) return;
    this._storePreviousPose();
    const cfg = this.config;
    this.time += dt;

    basisFromQuaternion(this.orientation, this.basis);
    this.updateAirData();
    this._updateEngine(dt, inputs.throttle ?? this.throttle);
    this.air.mass = this.mass;

    // FBW uses the previous tick's normal load; this is a 120 Hz loop.
    const surfaces = this.control.update(this.air, inputs, systems, dt);

    const aero = this.aero.compute(this.air, surfaces);
    this._lastDiagnostics = aero.diagnostics;

    // Body force: aero + thrust (x forward). Convert to world, add gravity.
    _thrustBody.set(this.engineThrust, 0, 0);
    const totalBody = _tmp.copy(aero.forceBody).add(_thrustBody);
    bodyToWorld(totalBody, this.basis, _forceWorld);
    _forceWorld.y -= this.mass * G0;
    this.acceleration.copy(_forceWorld).multiplyScalar(1 / this.mass);

    this.velocity.addScaledVector(this.acceleration, dt);
    this.position.addScaledVector(this.velocity, dt);

    // Euler rigid-body equations in the body frame (x fwd, y right, z down).
    const L = aero.momentBody.x;
    const M = aero.momentBody.y;
    const N = aero.momentBody.z;
    const Ix = cfg.inertia.roll;
    const Iy = cfg.inertia.pitch;
    const Iz = cfg.inertia.yaw;
    const p = this.rates.p;
    const q = this.rates.q;
    const r = this.rates.r;
    const pdot = (L + (Iy - Iz) * q * r) / Ix;
    const qdot = (M + (Iz - Ix) * r * p) / Iy;
    const rdot = (N + (Ix - Iy) * p * q) / Iz;
    this.rates.p = clamp(p + pdot * dt, -12, 12);
    this.rates.q = clamp(q + qdot * dt, -12, 12);
    this.rates.r = clamp(r + rdot * dt, -12, 12);

    _omegaWorld.copy(this.basis.forward).multiplyScalar(this.rates.p)
      .addScaledVector(this.basis.right, this.rates.q)
      .addScaledVector(this.basis.down, this.rates.r);
    integrateOrientation(this.orientation, _omegaWorld, dt);

    // Normal load (specific force along the aircraft's up axis).
    this.normalLoad = clamp(
      -(aero.forceBody.z + _thrustBody.z) / (this.mass * G0), -8, 16);

    this._updateDerived(aero);
  }

  /**
   * Engine, fuel and control-surface update for the ground roll. Aircraft owns
   * the wheel/steering model; this keeps the propulsion model in one place.
   */
  advanceGround(dt, throttleTarget, systems, inputs = {}) {
    this._storePreviousPose();
    this.time += dt;
    basisFromQuaternion(this.orientation, this.basis);
    this.updateAirData();
    this._updateEngine(dt, throttleTarget);
    this.air.mass = this.mass;
    this.control.surfaces.flaps = systems.flaps;
    this.control.surfaces.gear = systems.gear;
    this.control.surfaces.airbrake = systems.airbrake;
    this.control.surfaces.stores = systems.stores;
    const flapTrim=-this.aero.flapPitchMoment(systems.flaps)/this.config.aero.cmElevator;
    this.control.feedback.flapTrimElevator=flapTrim;
    this.control.setDirect(
      (inputs.pitch || 0) * 0.18 + flapTrim + (inputs.groundPitchAssist||0),
      (inputs.roll || 0) * 0.12,
      (inputs.yaw || 0) * 0.1,
      dt);
    this.normalLoad = 1;
    return this.engineThrust;
  }

  _storePreviousPose() {
    if (!this.prevPosition) return;
    this.prevPosition.copy(this.position);
    this.prevOrientation.copy(this.orientation);
    this.prevVelocity.copy(this.velocity);
  }

  /**
   * Interpolated pose for rendering. The physics stays at a fixed 120 Hz while
   * displays commonly run at 60–165 Hz; without this the camera can move on a
   * frame where the model does not, producing visible body jitter/ghosting.
   */
  getRenderPose(alpha, position, orientation, velocity) {
    const t = clamp(alpha, 0, 1);
    if (!this.prevPosition) {
      position.copy(this.position);
      orientation.copy(this.orientation);
      velocity.copy(this.velocity);
      return;
    }
    position.lerpVectors(this.prevPosition, this.position, t);
    velocity.lerpVectors(this.prevVelocity, this.velocity, t);
    orientation.copy(this.prevOrientation).slerp(this.orientation, t);
  }

  /** Refresh HUD readouts after the ground model snaps orientation/velocity. */
  refreshGroundReadouts() {
    basisFromQuaternion(this.orientation, this.basis);
    this.updateAirData();
    const f = this.basis.forward;
    const right = this.basis.right;
    const up = this.basis.up;
    this.pitch = Math.asin(clamp(f.y, -1, 1)) * RAD;
    this.heading = (Math.atan2(f.x, -f.z) * RAD + 360) % 360;
    this.bank = Math.atan2(-right.y, up.y) * RAD;
    this.verticalSpeed = 0;
    this.normalLoad = 1;
    this.gLoad = 1;
    this.aoaDeg = this.alpha * RAD;
    this.betaDeg = this.beta * RAD;
    this.turnRate = 0;
    this.specificExcessPower = 0;
    this.buffet = 0;
  }

  updateAirData() {
    basisFromQuaternion(this.orientation, this.basis);
    worldToBody(this.velocity, this.basis, _velBody);
    const V = this.velocity.length();
    const u = _velBody.x;
    const v = _velBody.y;
    const w = _velBody.z;
    const atm = getAtmosphere(this.position.y);
    const alpha = V > 1 ? Math.atan2(w, Math.max(u, 1e-3)) : 0;
    const beta = V > 1 ? Math.atan2(v, Math.max(Math.sqrt(u * u + w * w), 1e-3)) : 0;
    this.air.velocityBody.copy(_velBody);
    this.air.rates.p = this.rates.p;
    this.air.rates.q = this.rates.q;
    this.air.rates.r = this.rates.r;
    this.air.density = atm.density;
    this.air.alpha = V > 1 ? alpha : 0;
    this.air.beta = V > 1 ? beta : 0;
    this.air.mach = V / atm.speedOfSound;
    this.air.safeSpeed = Math.max(V, 1);
    this.air.dynamicPressure = 0.5 * atm.density * V * V;
    this.air.time = this.time;
    this.air.mass = this.mass;
    this.air.normalLoad = this.normalLoad;
    this.air.speedOfSound = atm.speedOfSound;
    this.air.temperature = atm.temperature;
    this.air.pressure = atm.pressure;
    this.air.densityRatio = atm.densityRatio;
    this.air.altitude = this.position.y;
    this.density = atm.density;
    this.tas = V;
    this.alpha = this.air.alpha;
    this.beta = this.air.beta;
    this.mach = this.air.mach;
    this.iasKmh = calibratedAirspeed(V, this.position.y) * 3.6;
  }

  _updateEngine(dt, throttleTarget) {
    const eng = this.config.engine;
    this.throttle = clamp(throttleTarget, 0, 1.1);
    const target = this.throttle;
    const rate = target > this.engineSpool ? 1 / eng.spoolUp : 1 / eng.spoolDown;
    this.engineSpool += clamp(target - this.engineSpool, -rate * dt, rate * dt);
    this.engineSpool = clamp(this.engineSpool, 0, 1.1);

    const spool = this.engineSpool;
    const dryLevel = clamp(spool, 0, 1);
    const abThreshold=eng.abThreshold??.965;
    const abTarget = clamp((spool - abThreshold) / (1.1-abThreshold), 0, 1);
    this.afterburner = damp(this.afterburner, abTarget, 1 / eng.abSpool, dt);
    if (this.fuel <= 0) {
      this.afterburner = 0;
    }
    const sigma = Math.pow(this.density / 1.225, eng.densityExponent);
    const ram = Math.max(0.55, 1 + eng.ramFactor * this.mach);
    const highMach = 1 - eng.highMachLoss * Math.max(0, this.mach - 1.2);
    const dry = eng.dryThrust * sigma * ram * highMach * dryLevel;
    const ab = (eng.afterburnerThrust - eng.dryThrust) * sigma * ram * highMach *
      this.afterburner;
    this.engineThrust = this.fuel > 0 ? dry + ab : 0;
    // engine.ceilingFade (m): optional thrust decay scale above the service ceiling.
    const ceilingFade=this.config.engine.ceilingFade;
    if(ceilingFade&&this.position.y>this.config.limits.ceiling)this.engineThrust*=Math.exp(-(this.position.y-this.config.limits.ceiling)/ceilingFade);

    const ff = eng.idleFlow +
      dryLevel * Math.max(0, eng.fuelFlowDry - eng.idleFlow) +
      this.afterburner * Math.max(0, eng.fuelFlowAB - eng.fuelFlowDry);
    this.fuelFlow = this.fuel > 0 ? ff : 0;
    this.fuelEndurance = this.fuelFlow > 0 ? this.fuel / this.fuelFlow : 0;
    this.fuel = Math.max(0, this.fuel - ff * dt);
    this.mass = this.config.mass.empty +
      (this.config.mass.engine || 0) + this.fuel +
      this.ammoMass + this.storesMass;
  }

  _updateDerived(aero) {
    const f = this.basis.forward;
    const up = this.basis.up;
    const right = this.basis.right;
    const weight = this.mass * G0;
    const n = this.normalLoad;
    this.verticalSpeed = this.velocity.y;
    this.pitch = Math.asin(clamp(f.y, -1, 1)) * RAD;
    this.heading = (Math.atan2(f.x, -f.z) * RAD + 360) % 360;
    this.bank = Math.atan2(-right.y, up.y) * RAD;
    this.turnRate = this.tas > 20
      ? (G0 * Math.sqrt(Math.max(0, n * n - 1)) / this.tas) * RAD : 0;
    this.specificExcessPower = ((this.engineThrust - aero.diagnostics.drag) *
      this.tas) / weight;
    this.aoaDeg = this.alpha * RAD;
    this.betaDeg = this.beta * RAD;
    this.gLoad = n;
    this.dragN = aero.diagnostics.drag;
    this.liftN = aero.diagnostics.lift;
    this.buffet = aero.diagnostics.buffet;
    this.groundEffect = aero.diagnostics.groundEffect;
    this.diagnostics = {
      ...this.air,
      ...this._lastDiagnostics,
      tas: this.tas,
      iasKmh: this.iasKmh,
      verticalSpeed: this.verticalSpeed,
      heading: this.heading,
      pitch: this.pitch,
      bank: this.bank,
      turnRate: this.turnRate,
      specificExcessPower: this.specificExcessPower,
      gLoad: n,
      thrust: this.engineThrust,
      fuel: this.fuel,
      mass: this.mass,
      afterburner: this.afterburner,
      engineSpool: this.engineSpool,
      throttle: this.throttle,
      surfaces: this.control.surfaces,
      feedback: this.control.feedback,
      time: this.time,
      drag: aero.diagnostics.drag,
    };
  }

  /** Apply a collision impulse from the environment (ground, debris, blast). */
  applyImpulse(worldImpulse, worldPoint = null) {
    this.velocity.addScaledVector(worldImpulse, 1 / this.mass);
    if (worldPoint) {
      const arm = _tmp.copy(worldPoint).sub(this.position);
      const torqueWorld = new THREE.Vector3().crossVectors(arm, worldImpulse);
      const torqueBody = worldToBody(torqueWorld, this.basis);
      const Ix = this.config.inertia.roll;
      const Iy = this.config.inertia.pitch;
      const Iz = this.config.inertia.yaw;
      this.rates.p += torqueBody.x / Ix;
      this.rates.q += torqueBody.y / Iy;
      this.rates.r += torqueBody.z / Iz;
    }
  }

  get state() {
    return {
      position: this.position,
      orientation: this.orientation,
      velocity: this.velocity,
      rates: this.rates,
      mass: this.mass,
      fuel: this.fuel,
      engineThrust: this.engineThrust,
      tas: this.tas,
      iasKmh: this.iasKmh,
      mach: this.mach,
      aoa: this.alpha,
      beta: this.beta,
      gLoad: this.normalLoad,
      verticalSpeed: this.verticalSpeed,
      heading: this.heading,
      pitch: this.pitch,
      bank: this.bank,
      onGround: this.onGround,
    };
  }
}
