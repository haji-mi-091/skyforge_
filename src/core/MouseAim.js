/**
 * Mouse-aim flight assistant.
 *
 * The mouse is not a roll/pitch joystick. Its screen position defines an aim
 * direction relative to the nose; the assistant banks the aircraft, pulls the
 * required load factor and coordinates a heading change so the nose follows
 * that aim point. The normal FBW/AoA/actuator limits still apply underneath.
 */
import * as THREE from '../../vendor/three.module.js';
import {
  clamp, damp, projectToScreen,
} from '../sim/math.js';

const DEG = Math.PI / 180;
const _project = { x: 0, y: 0, visible: false, ndcZ: 0 };
const _tmp = new THREE.Vector3();

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class MouseAim {
  constructor() {
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.targetHeading = 0;
    this.targetPitch = 0;
    this.bankTarget = 0;
    this.loadTarget = 1;
    this.aimX = 0;
    this.aimY = 0;
  }

  reset() {
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
    this.targetHeading = 0;
    this.targetPitch = 0;
    this.bankTarget = 0;
    this.loadTarget = 1;
    this.aimX = 0;
    this.aimY = 0;
  }

  /**
   * @param {object} flight interpolated render pose (has pitch/heading/bank)
   * @param {object} camera current camera
   * @param {object} mouse Input.mouse
   * @param {object} options width, height, sensitivity, inside, keyboard,
   *   holdHeading, holdPitch, disabled
   * @returns {{pitch:number, roll:number, yaw:number}}
   */
  update(flight, camera, mouse, options = {}) {
    const width = options.width || 1600;
    const height = options.height || 900;
    const dt = options.dt ?? 1 / 60;
    const holdHeading = options.holdHeading;
    const holdPitch = options.holdPitch;
    const disabled = options.disabled || holdHeading !== undefined;

    let desiredHeading;
    let desiredPitch;
    let ax = 0;
    let ay = 0;
    let keyPitch = 0;

    if (disabled) {
      desiredHeading = holdHeading ?? flight.heading * DEG;
      desiredPitch = holdPitch ?? flight.pitch * DEG;
      this.aimX = 0;
      this.aimY = 0;
    } else {
      keyPitch = clamp(options.keyboard?.pitch || 0, -1, 1);
      if (options.relative) {
        // Centre-reticle mouse mode: the physical cursor is locked at centre.
        // Movement advances a virtual aim/bank offset; it is not a one-frame
        // velocity, so a held turn remains established while the nose sits in
        // the centre reticle. Moving the mouse back levels the aircraft.
        const sens = options.sensitivity ?? 1;
        this.aimX = clamp(this.aimX + (options.dx || 0) * 0.0018 * sens, -1, 1);
        this.aimY = clamp(this.aimY - (options.dy || 0) * 0.0018 * sens, -1, 1);
        ax = this.aimX;
        ay = options.invertY ? -this.aimY : this.aimY;
      } else {
        // Absolute fallback for browsers that refuse pointer lock. The HUD
        // still draws the reticle at centre.
        if (options.mouseUsable !== false) {
          _tmp.copy(flight.position).addScaledVector(flight.basis.forward, 10000);
          const bs = projectToScreen(_tmp, camera, width, height, _project);
          const bx = bs.visible ? bs.x : width * 0.5;
          const by = bs.visible ? bs.y : height * 0.47;
          ax = (mouse.x - bx) / (width * 0.5);
          ay = (by - mouse.y) / (height * 0.5);
          const dead = 0.035;
          const shape = (v) => {
            const s = Math.sign(v) || 1;
            const a = Math.abs(v);
            if (a <= dead) return 0;
            return s * Math.pow((a - dead) / (1 - dead), 1.18);
          };
          ax = shape(ax);
          ay = shape(ay);
          if (options.invertY) ay *= -1;
        }
        const sens = options.sensitivity ?? 1;
        ax = clamp(ax * sens, -1, 1);
        ay = clamp(ay * sens, -1, 1);
        this.aimX = damp(this.aimX, ax, 5.0, dt);
        this.aimY = damp(this.aimY, ay, 5.0, dt);
        ax = this.aimX;
        ay = this.aimY;
      }

      // Screen deflection maps to an aim direction relative to the nose. The
      // rim still commands a fighter-class turn, but the loop below is softer
      // and rate-limited so the nose follows rather than snaps.
      const headingOffset = ax * 55 * DEG;
      const pitchOffset = ay * 38 * DEG;
      desiredHeading = flight.heading * DEG + headingOffset;
      desiredPitch = flight.pitch * DEG + pitchOffset;
    }

    desiredPitch = clamp(desiredPitch, -78 * DEG, 78 * DEG);
    this.targetHeading = desiredHeading;
    this.targetPitch = desiredPitch;

    const pitchErr = desiredPitch - flight.pitch * DEG;

    // Convert lateral aim demand directly into a turn load, then bank to the
    // angle that keeps the vertical lift component at 1 g. This is the key
    // difference from the earlier "bank a little and pull a little" loop:
    // a full-deflection turn commands ~8.5 g and ~83° of bank, giving roughly
    // the Wiki's 19.5 s F-16A turn instead of a 50–70 s gentle arc.
    const turnDemand = Math.pow(Math.abs(ax), 1.15);
    const turnLoad = 1 + turnDemand * 7.7;
    const bankMag = turnLoad > 1.01
      ? Math.acos(clamp(1 / turnLoad, 0, 1)) : 0;
    let bankTarget = Math.abs(ax) < 0.01 ? 0 : Math.sign(ax) * bankMag;
    this.bankTarget = damp(this.bankTarget, bankTarget, 4.0, dt);
    bankTarget = this.bankTarget;

    const manualRoll = disabled ? 0 : clamp(options.keyboard?.roll || 0, -1, 1);
    const manual = Math.abs(manualRoll) > 0.01;
    // A/D are a real roll axis, not a small bank trim. This is what allows a
    // complete 360° aileron roll and inverted flight; mouse aim only owns the
    // bank when the roll keys are released.
    if (manual) this.bankTarget = flight.bank * DEG;
    const headingErr = wrapAngle(desiredHeading - flight.heading * DEG);
    const pitchDemand = clamp(pitchErr / (45 * DEG), -0.37, 1);
    let loadTarget = manual ? 1 : 1 + pitchDemand * 7.6;
    if (!manual && Math.abs(ax) > 0.02 && pitchErr > -2 * DEG) {
      loadTarget = Math.max(loadTarget, 1 + (turnLoad - 1) * 0.55);
    }
    loadTarget = damp(this.loadTarget, loadTarget, 7.5, dt);
    loadTarget = clamp(loadTarget, -2.0, 8.6);
    // W/S are the "pull to the limit" keys. S asks for the full positive
    // structural/FBW limit; W asks for the negative limit. The FBW still
    // reduces this when AoA or available lift cannot support it.
    if (keyPitch > 0) loadTarget = 8.6;
    else if (keyPitch < 0) loadTarget = -2.8;
    this.loadTarget = loadTarget;

    let roll;
    if (manual) {
      roll = manualRoll;
    } else {
      // Outer-loop bank-angle controller. The inner FBW still owns roll-rate
      // limits, but this cascade avoids commanding raw roll stick.
      const bankErr = wrapAngle(bankTarget - flight.bank * DEG);
      const pDesired = clamp(bankErr * 1.8 - flight.rates.p * 0.8, -3.2, 3.2);
      roll = clamp(pDesired / 4.9, -1, 1);
      if (Math.abs(bankErr) < 0.02 && Math.abs(flight.rates.p) < 0.04) roll = 0;
    }

    // G command -> FBW pitch stick. Negative stick range is smaller (-3G).
    const pitchStick = loadTarget >= 1
      ? (loadTarget - 1) / 8
      : (loadTarget - 1) / 4;
    const pitch = clamp(pitchStick, -1, 1);

    this.pitch = damp(this.pitch, pitch, 14, dt);
    this.roll = damp(this.roll, roll, manual ? 7 : 9, dt);
    this.yaw = 0;

    return { pitch: this.pitch, roll: this.roll, yaw: 0 };
  }

  /**
   * Shooter-style view tracking: the camera view defines the desired nose
   * direction. The assistant banks and pulls until the aircraft nose points at
   * the view centre, then relaxes the turn as the error closes.
   */
  updateToward(flight, desiredHeading, desiredPitch, options = {}) {
    const dt = options.dt ?? 1 / 60;
    const headingErr = wrapAngle(desiredHeading - flight.heading * DEG);
    const pitchErr = clamp(desiredPitch, -75 * DEG, 75 * DEG) -
      flight.pitch * DEG;
    // Proportional bank for small errors, capped at a level-turn bank of 83°.
    // The previous inverse-cosine law demanded a huge bank even for a 5° error,
    // which made the nose oscillate spring-like around the centre reticle.
    const errorDeg = Math.abs(headingErr) / DEG;
    // Lead the rollout using the current turn rate so a fast closing turn does
    // not carry 80° of bank past the centre line and spring back.
    const closureDeg = Math.abs(flight.turnRate || 0);
    const effectiveError = Math.max(0, errorDeg - closureDeg * 1.0);
    const bankMag = clamp(effectiveError * 2.8, 0, 83 * DEG);
    let bankTarget = Math.abs(headingErr) < 0.6 * DEG
      ? 0 : Math.sign(headingErr) * bankMag;
    this.bankTarget = damp(this.bankTarget, bankTarget, 10.0, dt);
    bankTarget = this.bankTarget;

    const manualRoll = clamp(options.keyboard?.roll || 0, -1, 1);
    const manual = Math.abs(manualRoll) > 0.01;
    if (manual) this.bankTarget = flight.bank * DEG;

    // Load factor is signed by the vertical aim error. Looking above the nose
    // asks for a pull; looking below it must unload/push instead of continuing
    // to pull up. A pure horizontal turn gets only enough extra load to keep
    // the banked turn coordinated.
    const pitchDemand = clamp(pitchErr / (45 * DEG), -0.37, 1);
    let loadTarget = manual ? 1 : 1 + pitchDemand * 7.6;
    const absHeadingErr = Math.abs(headingErr);
    if (!manual && absHeadingErr > 2 * DEG && pitchErr > -2 * DEG) {
      const bankAbs = Math.min(Math.abs(bankTarget), 75 * DEG);
      const coordinated = 1 / Math.max(0.26, Math.cos(bankAbs)) - 1;
      loadTarget = Math.max(loadTarget, 1 + coordinated * 0.75);
    }
    if (!manual && absHeadingErr < 0.8 * DEG &&
      Math.abs(pitchErr) < 0.8 * DEG) {
      loadTarget = 1;
    }
    loadTarget = damp(this.loadTarget, loadTarget, 7.5, dt);
    loadTarget = clamp(loadTarget, -2.0, 8.6);
    const keyPitch = clamp(options.keyboard?.pitch || 0, -1, 1);
    if (keyPitch > 0) loadTarget = 8.6;
    else if (keyPitch < 0) loadTarget = -2.8;
    this.loadTarget = loadTarget;
    this.targetHeading = desiredHeading;
    this.targetPitch = desiredPitch;

    let roll;
    if (manual) {
      roll = manualRoll;
    } else {
      const bankErr = wrapAngle(bankTarget - flight.bank * DEG);
      const pDesired = clamp(bankErr * 1.8 - flight.rates.p * 0.8, -3.2, 3.2);
      roll = clamp(pDesired / 4.9, -1, 1);
      if (Math.abs(bankErr) < 0.02 && Math.abs(flight.rates.p) < 0.04) roll = 0;
    }

    const pitchStick = loadTarget >= 1
      ? (loadTarget - 1) / 8
      : (loadTarget - 1) / 4;
    const pitch = clamp(pitchStick, -1, 1);

    this.pitch = damp(this.pitch, pitch, 14, dt);
    this.roll = damp(this.roll, roll, manual ? 7 : 9, dt);
    this.yaw = 0;
    return { pitch: this.pitch, roll: this.roll, yaw: 0 };
  }
}
