/**
 * Small, dependency-free (except THREE math) helpers shared by the simulation.
 * World convention: +X east, +Y up, +Z south. Aircraft body: +X forward,
 * +Y right, +Z down. The Three.js model is authored nose-down-Z and converted
 * by the same basis, so simulation and rendering stay in lockstep.
 */
import * as THREE from '../../vendor/three.module.js';

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Frame rate independent exponential smoothing. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const moveTowards = (current, target, maxDelta) => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

export function basisFromQuaternion(q, out = {}) {
  out.forward = (out.forward || new THREE.Vector3()).set(0, 0, -1).applyQuaternion(q);
  out.right = (out.right || new THREE.Vector3()).set(1, 0, 0).applyQuaternion(q);
  out.up = (out.up || new THREE.Vector3()).set(0, 1, 0).applyQuaternion(q);
  out.down = (out.down || new THREE.Vector3()).copy(out.up).negate();
  return out;
}

/** Quaternion from compass heading (rad), pitch and roll (rad). */
export function quaternionFromAttitude(heading, pitch, roll) {
  const qYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0), -heading);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), pitch);
  const qRoll = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1), -roll);
  return qYaw.multiply(qPitch).multiply(qRoll).normalize();
}

export function worldToBody(v, basis, out = new THREE.Vector3()) {
  return out.set(v.dot(basis.forward), v.dot(basis.right), v.dot(basis.down));
}

export function bodyToWorld(v, basis, out = new THREE.Vector3()) {
  return out
    .copy(basis.forward).multiplyScalar(v.x)
    .addScaledVector(basis.right, v.y)
    .addScaledVector(basis.down, v.z);
}

/** Integrates orientation by a world-space angular velocity vector. */
const _rot = new THREE.Quaternion();
const _axis = new THREE.Vector3();
export function integrateOrientation(q, omegaWorld, dt) {
  const speed = omegaWorld.length();
  if (speed < 1e-9) return q;
  _axis.copy(omegaWorld).multiplyScalar(1 / speed);
  _rot.setFromAxisAngle(_axis, speed * dt);
  return q.premultiply(_rot).normalize();
}

/** Standard atmosphere lookup for the displayed barometric altitude. */
export function airDataLabel(altitude) {
  return `${Math.max(0, altitude).toFixed(0)} m`;
}

/** Project a world point to CSS pixels with a THREE camera. */
const _proj = new THREE.Vector3();
export function projectToScreen(point, camera, width, height, out = {}) {
  _proj.copy(point).project(camera);
  out.x = (_proj.x * 0.5 + 0.5) * width;
  out.y = (-_proj.y * 0.5 + 0.5) * height;
  out.visible = _proj.z > -1 && _proj.z < 1 && Math.abs(_proj.x) < 1.4 && Math.abs(_proj.y) < 1.4;
  out.ndcZ = _proj.z;
  return out;
}
