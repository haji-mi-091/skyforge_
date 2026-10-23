/**
 * Lightweight adversary pilot. It flies through the same fly-by-wire and
 * aerodynamics as the player; no cheating position or turn-rate multipliers.
 * Behaviour is a small pursuit/evade state machine with deliberately imperfect
 * aim and reaction times.
 */
import * as THREE from '../../vendor/three.module.js';
import { clamp, damp } from './math.js';

const _dir = new THREE.Vector3();
const _lead = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _avoid = new THREE.Vector3();
const _aimDir = new THREE.Vector3();

export class AIPilot {
  constructor(
    aircraft,
    { skill = 0.72, name = 'BANDIT', passive = false } = {},
  ) {
    this.aircraft = aircraft;
    aircraft.ai = this;
    this.skill = skill;
    this.name = name;
    this.passive = passive;
    this.target = null;
    this.mode = passive ? 'patrol' : 'pursue';
    this.patrolCenter = aircraft.flight.position.clone();
    this.orbitDirection = Math.random() > 0.5 ? 1 : -1;
    this.modeTimer = 0;
    this.inputs = { pitch: 0, roll: 0, yaw: 0, throttle: 1.1 };
    this.wantsGun = false;
    this.requestMissile = false;
    this.requestFlare = false;
    this.missileTimer = 9 + Math.random() * 7;
    this.gunBurst = 0;
    this.gunCooldown = 0;
    this.evadeTimer = 0;
    this.evadeDirection = Math.random() > 0.5 ? 1 : -1;
    this.jitterPhase = Math.random() * 10;
    this.reaction = 0.5 + (1 - skill) * 1.2;
    this.decisionTimer = 0;
    this.aggression = 0.55 + skill * 0.4;
    this.threat = null;
    this.recovering = false;
    this.lowEnergy = false;
    this.terrainTimer = 0;
    this.futureClearance = Infinity;
    this.terrainPeak = aircraft.flight.position.y - 1500;
  }

  get speed() {
    return this.aircraft.flight.tas;
  }

  update(dt, target, world, threats = []) {
    this.decisionTimer -= dt;
    this.gunCooldown = Math.max(0, this.gunCooldown - dt);
    this.missileTimer = Math.max(0, this.missileTimer - dt);
    this.evadeTimer = Math.max(0, this.evadeTimer - dt);
    this.wantsGun = false;
    this.requestMissile = false;
    this.requestFlare = false;
    this.target = target;
    if (!this.aircraft.alive) return this.inputs;

    const self = this.aircraft;
    const flight = self.flight;
    const pos = flight.position;
    const speed = Math.max(80, flight.tas);

    const ground = world.groundHeight(pos.x, pos.z),
      agl = pos.y - ground;
    this.terrainTimer -= dt;
    if (this.terrainTimer <= 0) {
      this.terrainTimer = 0.15;
      this.futureClearance = agl;
      this.terrainPeak = ground;
      // Sweep the flight path and a corridor either side, not just one point
      // four seconds ahead. This also sees a ridge before reaching its slope.
      for (const t of [2, 4, 6, 8, 10])
        for (const side of [-160, 0, 160]) {
          const x = pos.x + flight.velocity.x * t + flight.basis.right.x * side,
            z = pos.z + flight.velocity.z * t + flight.basis.right.z * side;
          const height = world.groundHeight(x, z);
          this.terrainPeak = Math.max(this.terrainPeak, height);
          this.futureClearance = Math.min(
            this.futureClearance,
            pos.y + flight.velocity.y * t - height,
          );
        }
    }
    if (agl < 850 || this.futureClearance < 450) this.recovering = true;
    else if (agl > 1500 && this.futureClearance > 900 && flight.velocity.y > 0)
      this.recovering = false;
    const nearBoundary = Math.hypot(pos.x, pos.z) > world.bounds - 3500;
    const threat = threats.find((m) => m.alive && m.target === self);
    this.threat = threat || null;

    let desiredSet = false;
    _dir.set(0, 0, 0);

    if (this.recovering) {
      this.mode = 'recover';
      const hx = flight.velocity.x,
        hz = flight.velocity.z,
        len = Math.hypot(hx, hz) || 1;
      _dir.set(hx / len, Math.tan((22 * Math.PI) / 180), hz / len).normalize();
      this.inputs.throttle = 1.1;
      desiredSet = true;
    } else if (nearBoundary) {
      this.mode = 'return';
      _dir.set(-pos.x, 0, -pos.z).normalize();
      _dir.y = clamp(
        (Math.max(1800, this.terrainPeak + 1400) - pos.y) / 6000,
        -0.08,
        0.18,
      );
      this.inputs.throttle = 1.05;
      desiredSet = true;
    } else if (this.passive) {
      // Training-target mode: no guns, no missiles, no evasive reactions.
      // Fly a wide, predictable orbit around the spawn area so the player can
      // practise radar, tracking and gun/missile employment.
      this.mode = 'patrol';
      const dx = pos.x - this.patrolCenter.x;
      const dz = pos.z - this.patrolCenter.z;
      const radius = Math.hypot(dx, dz) || 1;
      const radial = clamp((radius - 4300) / 2600, -0.8, 1.1);
      _dir
        .set(
          (-dz / radius) * this.orbitDirection - (dx / radius) * radial * 0.55,
          clamp(
            (Math.max(this.patrolCenter.y, this.terrainPeak + 1400) - pos.y) /
              3000,
            -0.12,
            0.12,
          ),
          (dx / radius) * this.orbitDirection - (dz / radius) * radial * 0.55,
        )
        .normalize();
      this.inputs.throttle = 0.82;
      desiredSet = true;
    } else if (threat) {
      this.mode = 'evade';
      this.evadeDirection = this.evadeDirection || 1;
      const threatPos = threat.position || threat.flight.position;
      _toTarget.copy(threatPos).sub(pos).normalize();
      // Break perpendicular to the missile line of sight, with a descending
      // component to force the missile to lead into thicker air.
      _avoid
        .set(-_toTarget.z, 0, _toTarget.x)
        .multiplyScalar(this.evadeDirection);
      _avoid.y = -0.34;
      _dir.copy(_avoid).normalize();
      desiredSet = true;
      if (threatPos.distanceTo(pos) < 4200) {
        this.requestFlare = Math.random() < dt * 1.8;
      }
      if (this.modeTimer <= 0) {
        this.evadeDirection *= -1;
        this.modeTimer = 1.4 + Math.random();
      }
      this.modeTimer -= dt;
    } else if (target && target.alive) {
      this.mode = 'pursue';
      const dist = pos.distanceTo(target.flight.position);
      const time = dist / speed;
      _lead
        .copy(target.flight.position)
        .addScaledVector(target.flight.velocity, time * 0.55);
      _lead.y = Math.max(
        _lead.y + 8,
        world.groundHeight(_lead.x, _lead.z) + 1300,
        this.terrainPeak + 1100,
      );
      _toTarget.copy(_lead).sub(pos).normalize();
      // Gun aim uses a shorter, ballistic-flavoured lead than the turn point.
      const gunTime = dist / 1050;
      _avoid
        .copy(target.flight.position)
        .addScaledVector(target.flight.velocity, gunTime);
      _avoid.y += 0.5 * 9.80665 * gunTime * gunTime;
      _aimDir.copy(_avoid).sub(pos).normalize();
      const aimDot = flight.basis.forward.dot(_aimDir);

      // Break turn if the target is close and we are overshooting.
      const forwardDot = flight.basis.forward.dot(
        target.flight.position.clone().sub(pos).normalize(),
      );
      const overshoot =
        dist < 420 && forwardDot > 0.72 && flight.tas - target.flight.tas > 35;
      if (overshoot) {
        _dir
          .copy(flight.basis.forward)
          .addScaledVector(flight.basis.right, this.evadeDirection * 2.4)
          .add(new THREE.Vector3(0, 0.65, 0))
          .normalize();
      } else {
        _dir.copy(_toTarget);
      }
      desiredSet = true;

      if (this.decisionTimer <= 0) {
        this.decisionTimer = 0.16 + Math.random() * 0.22;
        if (dist < 2050 && aimDot > 0.972 && this.gunCooldown <= 0) {
          this.gunBurst = 0.55 + Math.random() * 0.55;
          this.gunCooldown = 0.9 + Math.random() * 0.8;
        }
        if (
          this.missileTimer <= 0 &&
          self.weapons.missiles > 0 &&
          dist > 1200 &&
          dist < 28000 &&
          forwardDot > 0.86
        ) {
          this.requestMissile = true;
          this.missileTimer = 18 + Math.random() * 10;
        }
      }
      this.gunBurst = Math.max(0, this.gunBurst - dt);
      this.wantsGun = this.gunBurst > 0 && aimDot > 0.975;
      this.inputs.throttle = dist > 2500 ? 1.1 : dist < 600 ? 0.72 : 0.95;
    }

    if (!desiredSet) {
      _dir.copy(flight.basis.forward);
      _dir.x += Math.sin(flight.time * 0.2 + this.jitterPhase) * 0.3;
      _dir.z += Math.cos(flight.time * 0.17 + this.jitterPhase) * 0.3;
      _dir.normalize();
    }

    // Roll is a bank-angle controller, not a permanent roll-rate command.
    // Pitch is a load-factor command: neutral already asks the FBW for 1 g.
    const indicated = (flight.iasKmh || flight.tas * 3.6) / 3.6;
    if (indicated < 160 || flight.aoaDeg > 22) this.lowEnergy = true;
    else if (indicated > 195 && flight.aoaDeg < 14) this.lowEnergy = false;
    const bank = Math.atan2(-flight.basis.right.y, flight.basis.up.y);
    const heading = Math.atan2(flight.basis.forward.x, -flight.basis.forward.z);
    let headingError = Math.atan2(_dir.x, -_dir.z) - heading;
    headingError = Math.atan2(Math.sin(headingError), Math.cos(headingError));
    const marginMode = this.recovering || this.lowEnergy;
    const bankLimit =
      ((this.lowEnergy ? 20 : agl < 1500 ? 45 : 75) * Math.PI) / 180;
    let desiredBank = this.recovering
      ? 0
      : clamp(headingError * 3.0, -bankLimit, bankLimit);
    let desiredPath = clamp(Math.asin(clamp(_dir.y, -1, 1)), -0.2, 0.35);
    if (this.recovering) desiredPath = (22 * Math.PI) / 180;
    if (this.lowEnergy) desiredPath = agl > 1200 ? -0.055 : 0.035;
    if (!marginMode) {
      const error = (1 - this.skill) * 0.018;
      desiredBank += Math.sin(flight.time * 1.7 + this.jitterPhase) * error;
      desiredPath +=
        Math.sin(flight.time * 2.3 + this.jitterPhase) * error * 0.3;
    }
    const bankError = Math.atan2(
      Math.sin(desiredBank - bank),
      Math.cos(desiredBank - bank),
    );
    const roll = clamp(bankError * 0.75 - flight.rates.p * 0.13, -0.5, 0.5);
    const path = Math.asin(
      clamp(flight.velocity.y / Math.max(1, flight.tas), -1, 1),
    );
    const pathRate = clamp((desiredPath - path) * 0.65, -0.16, 0.24),
      cosBank = Math.cos(bank);
    let load =
      (Math.cos(path) + (speed / 9.80665) * pathRate) / Math.max(0.2, cosBank);
    const maxLoad = this.lowEnergy
      ? 1.15
      : Math.min(
          this.recovering ? 6 : 5.5,
          Math.max(1.3, (indicated / 180) ** 2 * 3.0),
        );
    load = cosBank < 0.15 ? 0.65 : clamp(load, 0.25, maxLoad);
    const limits = self.config.limits;
    const pitch = clamp(
      (load - 1) / (load >= 1 ? limits.gPositive - 1 : 1 - limits.gNegative),
      -1,
      1,
    );
    this.inputs.roll = damp(
      this.inputs.roll,
      roll,
      this.recovering ? 8 : 6,
      dt,
    );
    this.inputs.pitch = damp(
      this.inputs.pitch,
      pitch,
      this.recovering ? 8 : 5.5,
      dt,
    );
    this.inputs.yaw = 0;
    const range = target?.alive
      ? pos.distanceTo(target.flight.position)
      : Infinity;
    const cornering = Math.abs(headingError) > 0.35;
    const targetSpeed = this.passive
      ? 230
      : cornering
        ? 240
        : range < 1600
          ? 245
          : 300;
    if (!marginMode)
      this.inputs.throttle = clamp(
        0.82 + (targetSpeed - indicated) * 0.012,
        0.5,
        1.1,
      );
    if (marginMode) this.inputs.throttle = 1.1;
    const speedLimit = self.config.limits.maxIas;
    if (flight.iasKmh > speedLimit * 0.9)
      this.inputs.throttle = Math.min(this.inputs.throttle, 0.7);

    return this.inputs;
  }
}
