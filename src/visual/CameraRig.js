import * as THREE from '../../vendor/three.module.js';
import { damp, smoothstep, clamp } from '../sim/math.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _localUp = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _normPos = new THREE.Vector3();
const _normLook = new THREE.Vector3();
const _normUp = new THREE.Vector3();
const _freePos = new THREE.Vector3();
const _freeLook = new THREE.Vector3();
const _freeDir = new THREE.Vector3();
const _freeUp = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _camUp = new THREE.Vector3();

export class CameraRig {
  constructor(camera, groundHeight) {
    this.camera = camera;
    this.groundHeight = groundHeight;
    this.mode = 'chase';
    this.time = 0;
    this.position = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.fov = 62;
    this.shake = 0;
    this.shakeVelocity = 0;
    this._initialized = false;
    this.freeLookActive = false;
    this.freeLookWeight = 0;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
    this.freeLookOrigin = { x: 960, y: 540 };
  }

  beginFreeLook(mouse) {
    this.freeLookActive = true;
    this.freeLookOrigin.x = mouse?.x ?? 0;
    this.freeLookOrigin.y = mouse?.y ?? 0;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
  }

  endFreeLook() {
    this.freeLookActive = false;
  }

  setMode(mode) {
    this.mode = mode;
    // A slightly deeper near plane preserves depth precision against the
    // 75 km far plane; 0.18/0.4 caused far-ocean stippling at altitude.
    this.camera.near = mode === 'cockpit' ? 0.30 : 0.60;
    this.camera.updateProjectionMatrix();
    this._initialized = false;
  }

  toggle() {
    this.setMode(this.mode === 'chase' ? 'cockpit' : 'chase');
  }

  kick(amount) {
    this.shakeVelocity = Math.max(this.shakeVelocity, amount);
  }

  reset() {
    this._initialized = false;
    this.shake = 0;
    this.shakeVelocity = 0;
    this.freeLookActive = false;
    this.freeLookWeight = 0;
    this.freeLookYaw = 0;
    this.freeLookPitch = 0;
  }

  update(dt, flight, jetModel, extraShake = 0, options = {}) {
    this.time += dt;
    this.shakeVelocity = Math.max(0, this.shakeVelocity - dt * 3.5);
    this.shake = damp(this.shake, this.shakeVelocity, 5, dt);
    const extra = extraShake + (flight.buffet || 0) * 0.12;
    const amount = this.shake + extra;
    if (options.view) {
      this._updateAimView(dt, flight, jetModel, options.view, amount);
      return;
    }
    const free = options.freeLook;
    const targetWeight = free?.active ? 1 : 0;
    this.freeLookWeight = damp(this.freeLookWeight, targetWeight, 13, dt);

    if (free?.active && free.inside) {
      if (free.relative) {
        // Pointer-lock free look: accumulate relative movement so the physical
        // cursor can stay parked at the centre of the screen.
        this.freeLookYaw = clamp(
          this.freeLookYaw + (free.dx || 0) * 0.0025, -2.65, 2.65);
        this.freeLookPitch = clamp(
          this.freeLookPitch - (free.dy || 0) * 0.0018, -1.0, 1.15);
      } else {
        const width = options.width || window.innerWidth;
        const height = options.height || window.innerHeight;
        this.freeLookYaw = clamp(
          (free.x - this.freeLookOrigin.x) / (width * 0.5) * 2.5,
          -2.65, 2.65);
        this.freeLookPitch = clamp(
          -(free.y - this.freeLookOrigin.y) / (height * 0.5) * 1.5,
          -1.0, 1.15);
      }
    }
    const w = clamp(this.freeLookWeight, 0, 1);
    const speed = flight.tas || 0;

    if (this.mode === 'cockpit') {
      _forward.copy(flight.basis.forward || new THREE.Vector3(0, 0, -1));
      const eye = jetModel.getCockpitEye(new THREE.Vector3());
      // Sit back and slightly high so the instrument panel, HUD glass and the
      // nose are all visible as one cockpit rather than a floating camera.
      eye.addScaledVector(flight.basis.forward, -0.25);
      eye.addScaledVector(flight.basis.up, 0.02);
      _normPos.copy(eye);
      _normLook.copy(eye).addScaledVector(_forward, 100);
      _normUp.copy(flight.basis.up);
      if (w > 0.001) {
        _freeDir.copy(_forward)
          .applyAxisAngle(flight.basis.up, -this.freeLookYaw)
          .applyAxisAngle(flight.basis.right, this.freeLookPitch)
          .normalize();
        _freeLook.copy(eye).addScaledVector(_freeDir, 100);
        _freeUp.copy(flight.basis.up);
      } else {
        _freeLook.copy(_normLook);
        _freeUp.copy(_normUp);
      }
      _camPos.copy(_normPos);
      _camLook.copy(_normLook).lerp(_freeLook, w);
      _camUp.copy(_normUp).lerp(_freeUp, w).normalize();
      this.position.copy(_normPos);
      this.camera.position.copy(_camPos);
      this.camera.up.copy(_camUp);
      this.camera.lookAt(_camLook);
      this._applyShake(amount, 0.55);
      const targetFov = 72 + 6 * smoothstep(140, 600, flight.tas);
      this._setFov(targetFov, dt, 4);
      return;
    }

    // Chase camera: offset in aircraft space, but intentionally stabilised
    // against the horizon by blending only a little of the aircraft's roll.
    // Close chase framing: keep the jet readable without losing the horizon.
    _offset.set(0.7, 2.9 + speed * 0.0012, 18 + speed * 0.006)
      .applyQuaternion(flight.orientation);
    _desired.copy(flight.position).add(_offset);
    const ground = this.groundHeight(_desired.x, _desired.z) + 4.5;
    if (_desired.y < ground) _desired.y = ground;

    if (!this._initialized) {
      this.position.copy(_desired);
      this._initialized = true;
    } else {
      // Feed translation forward with the aircraft, then damp only the
      // residual offset. Pure spring-follow lags tens of metres at 250 m/s.
      this.position.addScaledVector(flight.velocity, dt);
      const follow = 9.5;
      this.position.x = damp(this.position.x, _desired.x, follow, dt);
      this.position.y = damp(this.position.y, _desired.y, follow, dt);
      this.position.z = damp(this.position.z, _desired.z, follow, dt);
    }

    const ground2 = this.groundHeight(this.position.x, this.position.z) + 2.2;
    if (this.position.y < ground2) this.position.y = ground2;

    _forward.copy(flight.basis.forward);
    _look.copy(flight.position).addScaledVector(_forward, 78 + speed * 0.11);
    _look.y += 1.0;
    _look.addScaledVector(flight.velocity, 0.012);

    _localUp.copy(flight.basis.up);
    _up.copy(WORLD_UP).multiplyScalar(0.82)
      .addScaledVector(_localUp, 0.18).normalize();
    _normPos.copy(this.position);
    _normLook.copy(_look);
    _normUp.copy(_up);

    if (w > 0.001) {
      // Orbit the aircraft instead of changing the aircraft attitude. Pulling
      // the mouse up lowers the camera and looks up at the jet / sky.
      const elevation = clamp(0.115 - this.freeLookPitch, -1.05, 1.15);
      const radius = 22 + speed * 0.009;
      const away = flight.heading * Math.PI / 180 + Math.PI + this.freeLookYaw;
      const horizontal = Math.cos(elevation) * radius;
      _freePos.set(
        flight.position.x + Math.sin(away) * horizontal,
        flight.position.y + Math.sin(elevation) * radius + 1.25,
        flight.position.z - Math.cos(away) * horizontal);
      const freeGround = this.groundHeight(_freePos.x, _freePos.z) + 3.0;
      if (_freePos.y < freeGround) _freePos.y = freeGround;
      _freeLook.copy(flight.position).addScaledVector(flight.basis.up, 1.4);
      _freeUp.copy(WORLD_UP);
      _camPos.copy(_normPos).lerp(_freePos, w);
      _camLook.copy(_normLook).lerp(_freeLook, w);
      _camUp.copy(_normUp).lerp(_freeUp, w).normalize();
    } else {
      _camPos.copy(_normPos);
      _camLook.copy(_normLook);
      _camUp.copy(_normUp);
    }

    this.camera.position.copy(_camPos);
    this.camera.up.copy(_camUp);
    this.camera.lookAt(_camLook);
    this._applyShake(amount, 1.0);

    const targetFov = 55 + 11 * smoothstep(80, 600, speed) +
      (flight.afterburner || 0) * 2.5;
    this._setFov(targetFov, dt, 3);
  }

  _updateAimView(dt, flight, jetModel, view, amount) {
    const speed = flight.tas || 0;
    const pitch = clamp(view.pitch ?? 0, -75 * Math.PI / 180, 75 * Math.PI / 180);
    const cp = Math.cos(pitch);
    _forward.set(Math.sin(view.yaw) * cp, Math.sin(pitch),
      -Math.cos(view.yaw) * cp).normalize();

    if (this.mode === 'cockpit') {
      jetModel.getCockpitEye(_desired);
      _desired.addScaledVector(flight.basis.forward, -0.25);
      _desired.addScaledVector(flight.basis.up, 0.02);
      this.camera.position.copy(_desired);
      this.camera.up.set(0, 1, 0);
      _look.copy(_desired).addScaledVector(_forward, 10000);
      this.camera.lookAt(_look);
      this._applyShake(amount, 0.55);
      this._setFov(72 + 6 * smoothstep(140, 600, speed), dt, 4);
      return;
    }

    // Shooter-style chase: the camera orbits the aircraft according to the
    // mouse view direction, not the aircraft's heading. The nose autopilot then
    // turns the aircraft toward the centre of this view.
    const distance = 18 + speed * 0.006;
    _desired.copy(flight.position).addScaledVector(_forward, -distance);
    // Sit above the jet so the centre reticle points at the airspace ahead,
    // not at the fuselage. The nose autopilot brings the nose up to that line.
    _desired.y += 4.2;
    const ground = this.groundHeight(_desired.x, _desired.z) + 3.0;
    if (_desired.y < ground) _desired.y = ground;
    this.position.copy(_desired);
    this.camera.position.copy(_desired);
    this.camera.up.set(0, 1, 0);
    _look.copy(_desired).addScaledVector(_forward, 10000);
    this.camera.lookAt(_look);
    this._applyShake(amount, 1.0);
    const targetFov = 55 + 11 * smoothstep(80, 600, speed) +
      (flight.afterburner || 0) * 2.5;
    this._setFov(targetFov, dt, 3);
  }

  _applyShake(amount, scale) {
    if (amount <= 0.0001) return;
    const t = this.time;
    const ax = Math.sin(t * 37.1) * 0.55 + Math.sin(t * 23.7 + 1.2) * 0.3;
    const ay = Math.sin(t * 31.3 + 2.1) * 0.45 + Math.sin(t * 17.1) * 0.3;
    const az = Math.sin(t * 29.4 + 0.6) * 0.4;
    this.camera.rotateX(ax * amount * 0.006 * scale);
    this.camera.rotateY(ay * amount * 0.006 * scale);
    this.camera.rotateZ(az * amount * 0.005 * scale);
    this.camera.position.x += ax * amount * 0.05;
    this.camera.position.y += ay * amount * 0.05;
  }

  _setFov(target, dt, rate) {
    this.fov = damp(this.fov, target, rate, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  updateMenu(dt, time) {
    this.time = time;
    const angle = time * 0.014;
    const radius = 7600;
    const height = 2450 + Math.sin(time * 0.09) * 260;
    _desired.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    if (!this._initialized) {
      this.position.copy(_desired);
      this._initialized = true;
    } else {
      this.position.x = damp(this.position.x, _desired.x, 1.8, dt);
      this.position.y = damp(this.position.y, _desired.y, 1.8, dt);
      this.position.z = damp(this.position.z, _desired.z, 1.8, dt);
    }
    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    _look.set(-400, 520, 250);
    this.camera.lookAt(_look);
    this._setFov(55, dt, 2);
  }
}
