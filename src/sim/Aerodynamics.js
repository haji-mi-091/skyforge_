/**
 * Coefficient-based 6-DOF aerodynamics.
 *
 * No magic forces: lift, drag, side force and the three moments are built from
 * angle of attack, sideslip, Mach, dynamic pressure, control deflections and
 * rate damping. Stall, transonic drag rise, ground effect and Mach tuck emerge
 * from those terms. The same class is used by the player and every AI aircraft.
 */
import * as THREE from '../../vendor/three.module.js';
import { clamp, lerp, smoothstep, RAD } from './math.js';

const _liftDir = new THREE.Vector3();
const _sideDir = new THREE.Vector3();
const _vhat = new THREE.Vector3();
const _up = new THREE.Vector3(0, 0, -1);

function sampleTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      const t = (x - x0) / (x1 - x0);
      return lerp(y0, y1, t);
    }
  }
  return last[1];
}

export class Aerodynamics {
  constructor(config) {
    this.cfg = config.aero;
    this.geom = config.geometry;
    this.limits = config.limits;
    this.last = {
      CL: 0, CD: 0, CY: 0,
      lift: 0, drag: 0, side: 0,
      alpha: 0, beta: 0, mach: 0, qbar: 0,
      buffet: 0, groundEffect: 0,
      coefficients: { cl: 0, cd: 0, cy: 0, roll: 0, pitch: 0, yaw: 0 },
    };
  }

  /** Transonic / supersonic parasite drag rise. */
  machDrag(mach) {
    const c = this.cfg;
    const transonic = c.machDragPeak *
      Math.exp(-Math.pow((mach - c.machDragCenter) / c.machDragWidth, 2));
    const supersonic = c.supersonicDrag * smoothstep(0.95, 1.8, mach);
    return transonic + supersonic;
  }

  liftScale(mach) {
    const loss = this.cfg.machLiftLoss * smoothstep(0.78, 1.15, mach);
    const supersonicRecovery = 0.05 * smoothstep(1.25, 2.0, mach);
    return 1 - loss + supersonicRecovery;
  }

  /** Flap lift fades as dynamic pressure rises (effective takeoff flap). */
  flapLiftScale(mach) {
    // Takeoff flap lift is strong at rotation speed; keep it constant and let
    // the scheduled flap retraction (not a Mach fade) clean the wing up.
    return 1;
  }

  /** Takeoff detent is 0..0.6; full landing flap adds mostly drag, less lift. */
  flapLift(flaps) {
    const takeoff = Math.min(flaps, 0.6);
    const landing = Math.max(0, flaps - 0.6);
    return this.cfg.clFlap * takeoff +
      (this.cfg.clFlapLanding ?? this.cfg.clFlap) * landing;
  }

  /** Lift coefficient at an arbitrary AoA — used by the envelope limiter. */
  estimateLiftCoefficient(alpha, mach, flaps = 0) {
    const cl = sampleTable(this.cfg.clTable, alpha * RAD) +
      this.flapLift(flaps) * this.flapLiftScale(mach);
    return cl * this.liftScale(mach);
  }

  /** Actual flap pitching moment at each detent; smooth between detents. */
  flapPitchMoment(flaps) {
    const curve=this.cfg.flapPitchMoment;
    if(!curve)return this.cfg.cmFlap*flaps;
    const takeoff=curve.takeoff*smoothstep(0,.6,clamp(flaps,0,1));
    return takeoff+(curve.landing-curve.takeoff)*smoothstep(.6,1,clamp(flaps,0,1));
  }

  /** Pitch moment excluding the elevator, shared with the flight-control system. */
  pitchBaseCoefficient(air, surfaces) {
    const c = this.cfg;
    const qHat = air.rates.q * this.geom.chord / (2 * air.safeSpeed);
    const machTuck = -0.045 * Math.exp(-Math.pow((air.mach - 1.02) / 0.22, 2));
    return c.cm0 + c.cmAlpha * air.alpha + c.cmq * qHat +
      this.flapPitchMoment(surfaces.flaps) + c.cmGear * surfaces.gear +
      c.cmBrake * surfaces.airbrake + machTuck;
  }

  /** Roll moment excluding ailerons. */
  rollBaseCoefficient(air, surfaces) {
    const c = this.cfg;
    const b = this.geom.wingspan;
    const pHat = air.rates.p * b / (2 * air.safeSpeed);
    const rHat = air.rates.r * b / (2 * air.safeSpeed);
    return c.clBeta * air.beta + c.clp * pHat + c.clr * rHat +
      c.clRudder * surfaces.rudder;
  }

  /** Yaw moment excluding the rudder. */
  yawBaseCoefficient(air, surfaces) {
    const c = this.cfg;
    const b = this.geom.wingspan;
    const pHat = air.rates.p * b / (2 * air.safeSpeed);
    const rHat = air.rates.r * b / (2 * air.safeSpeed);
    return c.cnBeta * air.beta + c.cnr * rHat + c.cnp * pHat +
      c.cnAileron * surfaces.aileron;
  }

  /**
   * @param {object} air - velocityBody (m/s, x forward y right z down),
   *   rates {p,q,r}, density, altitude, agl, time, alpha, beta, mach,
   *   safeSpeed, dynamicPressure.
   * @param {object} surfaces - elevator, aileron, rudder (rad), flaps, gear,
   *   airbrake (0..1), stores (0..1).
   */
  compute(air, surfaces) {
    const cfg = this.cfg;
    const g = this.geom;
    const q = air.dynamicPressure;
    const S = g.wingArea;
    const c = g.chord;
    const b = g.wingspan;
    const alphaDeg = air.alpha * RAD;
    const absAlpha = Math.abs(air.alpha);

    // --- Lift ------------------------------------------------------------
    let CL = sampleTable(cfg.clTable, alphaDeg) +
      this.flapLift(surfaces.flaps) * this.flapLiftScale(air.mach);
    // Ground effect: the wing sees its mirror image, adding a little lift and
    // unloading the induced vortex system.
    const spanHeight = Math.max(1, air.agl) / g.wingspan;
    const groundEffect = Math.exp(-spanHeight * 2.2);
    CL += 0.05 * groundEffect * smoothstep(-0.1, 0.25, CL);
    CL *= this.liftScale(air.mach);
    const stallOnset = this.limits.alphaLimit - 5 * Math.PI / 180;
    const buffet = clamp(
      smoothstep(stallOnset, this.limits.alphaLimit + 4 * Math.PI / 180, absAlpha) +
      0.45 * smoothstep(0.92, 1.08, air.mach) * (1 - smoothstep(1.25, 1.55, air.mach)),
      0, 1.3);

    // --- Parasite drag ---------------------------------------------------
    const cdInduced = cfg.inducedK * CL * CL * (1 - 0.45 * groundEffect);
    const cdWave = this.machDrag(air.mach);
    const cdStores = cfg.storesCd * surfaces.stores;
    const cdGear = cfg.gearCd * surfaces.gear;
    const cdFlap = cfg.flapCd * surfaces.flaps;
    const cdBrake = cfg.brakeCd * surfaces.airbrake;
    const cdBeta = 0.55 * air.beta * air.beta;
    const alphaExcess = Math.max(0, absAlpha - this.limits.alphaLimit);
    const cdSeparation = 2.2 * alphaExcess * alphaExcess;
    const CD = cfg.cd0 + cdInduced + cdWave + cdStores +
      cdGear + cdFlap + cdBrake + cdBeta + cdSeparation;

    // --- Side force ------------------------------------------------------
    const CY = cfg.cyBeta * air.beta + cfg.cyRudder * surfaces.rudder;

    const liftForce = q * S * CL;
    const dragForce = q * S * CD;
    const sideForce = q * S * CY;

    // Unit vectors in body coordinates.
    const u = air.velocityBody.x;
    const v = air.velocityBody.y;
    const w = air.velocityBody.z;
    const V = Math.max(1e-3, Math.sqrt(u * u + v * v + w * w));
    _vhat.set(u / V, v / V, w / V);
    // Lift is perpendicular to the relative wind and lives in the symmetry plane.
    _liftDir.copy(_up).addScaledVector(_vhat, -_up.dot(_vhat));
    if (_liftDir.lengthSq() < 1e-8) _liftDir.set(0, 0, -1);
    _liftDir.normalize();
    // Side force is the lateral component perpendicular to the wind.
    _sideDir.set(0, 1, 0).addScaledVector(_vhat, -_vhat.y);
    if (_sideDir.lengthSq() < 1e-8) _sideDir.set(0, 1, 0);
    _sideDir.normalize();

    const forceBody = new THREE.Vector3()
      .addScaledVector(_vhat, -dragForce)
      .addScaledVector(_liftDir, liftForce)
      .addScaledVector(_sideDir, sideForce);

    // --- Moments ---------------------------------------------------------
    const p = air.rates.p;
    const qRate = air.rates.q;
    const r = air.rates.r;
    const pHat = p * b / (2 * air.safeSpeed);
    const qHat = qRate * c / (2 * air.safeSpeed);
    const rHat = r * b / (2 * air.safeSpeed);

    let Cl = cfg.clBeta * air.beta + cfg.clp * pHat + cfg.clr * rHat +
      cfg.clAileron * surfaces.aileron + cfg.clRudder * surfaces.rudder;
    // Post-stall wing rock: small, deterministic and easy to recover from.
    if (absAlpha > this.limits.alphaLimit + 2 * Math.PI / 180) {
      const excess = smoothstep(
        this.limits.alphaLimit, this.limits.alphaLimit + 15 * Math.PI / 180, absAlpha);
      Cl += 0.010 * excess * Math.sin(air.time * 8.1);
    }
    const Cm = this.pitchBaseCoefficient(air, surfaces) +
      cfg.cmElevator * surfaces.elevator;
    const Cn = this.yawBaseCoefficient(air, surfaces) +
      cfg.cnRudder * surfaces.rudder;

    const momentBody = new THREE.Vector3(
      q * S * b * Cl,
      q * S * c * Cm,
      q * S * b * Cn,
    );

    this.last = {
      CL, CD, CY, lift: liftForce, drag: dragForce, side: sideForce,
      alpha: air.alpha, beta: air.beta, mach: air.mach, qbar: q,
      buffet, groundEffect,
      coefficients: { lift: CL, drag: CD, side: CY, pitch: Cm, roll: Cl, yaw: Cn },
    };
    return { forceBody, momentBody, diagnostics: this.last };
  }
}
