import * as THREE from '../../vendor/three.module.js';
import { clamp, projectToScreen } from '../sim/math.js';
import {formatBinding} from '../data/controls.js';

const GREEN = 'rgba(213,255,228,0.98)';
const GREEN_DIM = 'rgba(196,248,216,0.82)';
const GREEN_FAINT = 'rgba(176,240,202,0.42)';
const AMBER = 'rgba(255,201,104,0.98)';
const YELLOW = 'rgba(255,226,94,1)';
const RED = 'rgba(255,104,86,1)';
// HUD surfaces are fully transparent and have no enclosing rectangles: text,
// rules, brackets and the RWR/TWS instruments carry the information.

const G0 = 9.80665;
const _p = { x: 0, y: 0, visible: false, ndcZ: 0 };
const _pLeft = { x: 0, y: 0, visible: false, ndcZ: 0 };
const _pRight = { x: 0, y: 0, visible: false, ndcZ: 0 };
const _v = { x: 0, y: 0, visible: false, ndcZ: 0 };
const _tmpVec = new THREE.Vector3();

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.s = 1;
    this.resize();
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.s = clamp(Math.min(this.w / 1600, this.h / 900), 0.9, 1.24);
  }

  _font(size, weight = 500) {
    this.ctx.font = `${weight} ${Math.round(size * this.s)}px Bahnschrift, "DIN Alternate", "Segoe UI", "Microsoft YaHei", sans-serif`;
  }

  _line(x1, y1, x2, y2, color = GREEN, width = 1) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(0,10,7,0.5)';
    ctx.lineWidth = (width + 1.6) * this.s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * this.s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  _text(text, x, y, size, color = GREEN, align = 'left', weight = 500, baseline = 'middle') {
    const ctx = this.ctx;
    this._font(size, weight);
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,10,7,0.64)';
    ctx.lineWidth = Math.max(1.4, 2.2 * this.s) * (size >= 18 ? 1.5 : 1);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  _textShadow(on = true) {
    const ctx = this.ctx;
    ctx.shadowColor = on ? 'rgba(0,0,0,0.85)' : 'transparent';
    ctx.shadowBlur = on ? 5 * this.s : 0;
    ctx.shadowOffsetY = on ? 1 * this.s : 0;
  }

  /**
   * @param {object} state {flight, aircraft, camera, input, targets, lockedTarget,
   *   gunTarget, lock, score, wave, kills, killfeed, warnings, time, hintAlpha,
   *   gEffect, redout, telemetryVisible, fps, missileAlertLe}
   */
  render(state) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!state || !state.flight) return;

    const flight = state.flight;
    const camera = state.camera;
    const center = this._boresight(flight, camera);
    this._textShadow(true);

    if (state.pitchLadder) this._drawPitchLadder(flight, camera, center);
    this._drawTargets(state, camera, center);
    this._drawIncomingMissiles(state, camera);
    this._drawNoseCrosshair(flight, camera);
    this._drawGunSolution(state, flight, camera, center);
    this._drawHitMarker(state, center);
    this._drawHeadingTape(flight);
    this._drawLeftData(state);
    this._drawGLoad(state);
    this._drawRwr(state);
    if (!state.mapOpen) this._drawMinimap(state);
    this._drawTws(state);
    this._drawLargeMap(state);
    this._drawKillFeed(state);
    this._drawStatusFeed(state);
    this._drawWarnings(state, center);
    if (state.cameraMode === 'cockpit') {
      this._drawCockpitGauges(state);
    }
    if (state.telemetryVisible) this._drawTelemetry(state, flight);
    this._drawHint(state);
    this._drawCursor(state);
    this._drawFreeLookBadge(state);
    this._drawGStress(state);
    this._drawDamage(state);
    this._textShadow(false);
  }

  _boresight(flight, camera) {
    const f = flight.basis.forward;
    const p = projectToScreen(
      _tmpVec.copy(camera.position).addScaledVector(f, 10000),
      camera, this.w, this.h, _p);
    if (!p.visible) return { x: this.w * 0.5, y: this.h * 0.47 };
    return { x: p.x, y: p.y };
  }

  _dirProject(flight, camera, theta, phi, out = _p) {
    const f = flight.basis.forward;
    const u = flight.basis.up;
    const r = flight.basis.right;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    _tmpVec.set(0, 0, 0)
      .addScaledVector(f, ct * cp)
      .addScaledVector(u, st)
      .addScaledVector(r, sp * ct);
    _tmpVec.multiplyScalar(12000).add(camera.position);
    return projectToScreen(_tmpVec, camera, this.w, this.h, out);
  }

  _drawPitchLadder(flight, camera, center) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    for (let deg = -40; deg <= 40; deg += 5) {
      if (deg === 0) continue;
      const theta = deg * Math.PI / 180;
      const left = this._dirProject(flight, camera, theta, -0.17, _pLeft);
      const right = this._dirProject(flight, camera, theta, 0.17, _pRight);
      if (!left.visible || !right.visible) continue;
      const dist = Math.hypot((left.x + right.x) / 2 - center.x,
        (left.y + right.y) / 2 - center.y);
      if (dist > this.h * 0.58) continue;
      const major = deg % 10 === 0;
      const alpha = clamp(0.72 - dist / (this.h * 0.95), 0.1, 0.65);
      const color = `rgba(178,247,207,${alpha * (major ? 1 : 0.62)})`;
      this._line(left.x, left.y, right.x, right.y, color, major ? 1.15 : 0.8);
      if (major) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.85 * this.s;
        const tick = 5 * this.s;
        ctx.beginPath();
        ctx.moveTo(left.x, left.y - tick);
        ctx.lineTo(left.x, left.y + tick);
        ctx.moveTo(right.x, right.y - tick);
        ctx.lineTo(right.x, right.y + tick);
        ctx.stroke();
        this._font(9.5, 500);
        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${deg > 0 ? '+' : ''}${deg}`, left.x - 7 * this.s, left.y);
      }
    }
    // Horizon line with a gap in the middle.
    const left = this._dirProject(flight, camera, 0, -0.24, _pLeft);
    const right = this._dirProject(flight, camera, 0, 0.24, _pRight);
    if (left.visible && right.visible) {
      const midX = (left.x + right.x) / 2;
      const midY = (left.y + right.y) / 2;
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const gap = 54 * this.s;
      this._line(left.x, left.y, midX - ux * gap, midY - uy * gap,
        'rgba(188,255,216,.42)', 1.25);
      this._line(midX + ux * gap, midY + uy * gap, right.x, right.y,
        'rgba(188,255,216,.42)', 1.25);
    }
    ctx.restore();
  }

  _drawTargets(state, camera, center) {
    if (!state.targets) return;
    const ctx = this.ctx;
    this._textShadow(true);
    for (const target of state.targets) {
      if (!target.alive) continue;
      const pos = target.flight.position;
      const dist = pos.distanceTo(state.flight.position);
      const locked = state.lockedTarget === target;
      const acquiring = !!state.lock && state.lock.progress < 1 &&
        state.lock.target === target;
      if (dist > 14000 && !locked && !acquiring) continue;
      const p = projectToScreen(pos, camera, this.w, this.h, _p);
      const isGunTarget = state.gunTarget === target;
      if (!p.visible) {
        if (locked || acquiring) {
          this._drawOffscreenLock(p, center, target, dist, state);
        }
        continue;
      }
      if (locked || acquiring || isGunTarget) {
        const size = clamp(1500 / Math.max(dist, 200), 14, 32) * this.s;
        const color = locked ? GREEN
          : acquiring ? 'rgba(190,255,210,.9)' : 'rgba(150,245,185,.82)';
        ctx.strokeStyle = color;
        ctx.lineWidth = (locked || acquiring ? 1.55 : 1.0) * this.s;
        // Green square lock frame; visible at every range.
        ctx.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
        this._font(10.5, 600);
        ctx.textAlign = 'left';
        ctx.fillStyle = color;
        ctx.fillText(target.config.shortName, p.x + size + 7 * this.s,
          p.y - 10 * this.s);
        const los = _tmpVec.copy(pos).sub(state.flight.position).normalize();
        const closure = -target.flight.velocity.clone()
          .sub(state.flight.velocity).dot(los);
        const altDelta = pos.y - state.flight.position.y;
        this._font(11, 600);
        ctx.fillStyle = GREEN;
        ctx.fillText(`H ${altDelta >= 0 ? '+' : ''}${Math.round(altDelta)}m`,
          p.x + size + 7 * this.s, p.y + 7 * this.s);
        ctx.fillText(`Vc ${closure >= 0 ? '+' : ''}${Math.round(closure)}m/s`,
          p.x + size + 7 * this.s, p.y + 21 * this.s);
        if (locked) {
          this._text('LOCK', p.x, p.y - size - 7 * this.s, 9.5, GREEN,
            'center', 700);
        }
      } else if (dist < 9000) {
        // Unlocked contacts stay subtle: the radar owns the broad picture.
        ctx.strokeStyle = 'rgba(255,126,103,.32)';
        ctx.lineWidth = 0.85 * this.s;
        const d = 4.5 * this.s;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - d);
        ctx.lineTo(p.x + d, p.y);
        ctx.lineTo(p.x, p.y + d);
        ctx.lineTo(p.x - d, p.y);
        ctx.closePath();
        ctx.stroke();
      }
    }
    this._textShadow(false);
  }

  _drawHitMarker(state, center) {
    if (!state.hitMarker || state.hitMarker <= 0) return;
    const ctx = this.ctx;
    const t = clamp(state.hitMarker / 0.22, 0, 1);
    const r = (7 + (1 - t) * 5) * this.s;
    ctx.strokeStyle = `rgba(255,219,150,${0.5 + t * 0.5})`;
    ctx.lineWidth = 1.6 * this.s;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(center.x + sx * r, center.y + sy * r);
      ctx.lineTo(center.x + sx * r * 1.9, center.y + sy * r * 1.9);
      ctx.stroke();
    }
  }

  _drawLockArc(p, size, lock) {
    const ctx = this.ctx;
    const progress = clamp(lock.progress ?? 1, 0, 1);
    ctx.strokeStyle = progress >= 1 ? AMBER : 'rgba(255,224,160,.8)';
    ctx.lineWidth = 2 * this.s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 1.8, -Math.PI / 2,
      -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    if (progress >= 1) {
      this._text('LOCK', p.x, p.y - size * 2.55, 9, AMBER, 'center', 600);
    }
  }

  _drawOffscreenLock(p, center, target, dist, state) {
    const ctx = this.ctx;
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const ang = Math.atan2(dy, dx);
    const rx = this.w * 0.42;
    const ry = this.h * 0.36;
    const x = this.w / 2 + Math.cos(ang) * rx;
    const y = this.h / 2 + Math.sin(ang) * ry;
    const half = 9 * this.s;
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.6 * this.s;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    // Small inward pointer so an off-screen lock is still readable.
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(ang) * 16 * this.s,
      y - Math.sin(ang) * 16 * this.s);
    ctx.stroke();

    const pos = target.flight.position;
    const altDelta = pos.y - state.flight.position.y;
    const los = _tmpVec.copy(pos).sub(state.flight.position).normalize();
    const closure = -target.flight.velocity.clone()
      .sub(state.flight.velocity).dot(los);
    const right = x > this.w * 0.5;
    const textX = right ? x - half - 7 * this.s : x + half + 7 * this.s;
    const align = right ? 'right' : 'left';
    this._text(`${(dist / 1000).toFixed(1)}km`, textX, y - 9 * this.s,
      10, GREEN, align, 600);
    this._text(`H ${altDelta >= 0 ? '+' : ''}${Math.round(altDelta)}m`,
      textX, y + 6 * this.s, 10.5, GREEN, align, 600);
    this._text(`Vc ${closure >= 0 ? '+' : ''}${Math.round(closure)}m/s`,
      textX, y + 20 * this.s, 10.5, GREEN, align, 600);
  }

  _drawIncomingMissiles(state, camera) {
    const missiles = state.incomingMissiles || [];
    if (!missiles.length) return;
    const ctx = this.ctx;
    const s = this.s;
    const margin = 24 * s;
    for (const missile of missiles) {
      if (!missile?.alive) continue;
      const dist = missile.position.distanceTo(state.flight.position);
      if (dist > 10000) continue;
      const p = projectToScreen(missile.position, camera, this.w, this.h, _p);
      if (!p.visible) continue;
      const px = clamp(p.x, margin, this.w - margin);
      const py = clamp(p.y, margin, this.h - margin);
      const r = 7 * s;
      // Red diamond bracket around the incoming missile.
      ctx.save();
      ctx.strokeStyle = 'rgba(255,86,72,.98)';
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r, py);
      ctx.lineTo(px, py + r);
      ctx.lineTo(px - r, py);
      ctx.closePath();
      ctx.stroke();
      this._text('MSL', px + 11 * s, py - 10 * s, 10,
        'rgba(255,92,78,.98)', 'left', 700);
      this._text(`${(dist / 1000).toFixed(1)}km`, px + 11 * s,
        py + 4 * s, 7.5, 'rgba(255,135,120,.82)', 'left', 500);
      ctx.restore();
    }
  }

  _drawNoseCrosshair(flight, camera) {
    // The nose direction is the aiming crosshair. It is deliberately NOT
    // connected to the centre mouse circle by a rubber-band line.
    // Collimate the nose reticle at infinity from the eye point, matching the
    // fixed cockpit HUD glass. Using the aircraft centre here introduces a
    // parallax offset between the glass reticle and the gun boresight.
    _tmpVec.copy(camera.position).addScaledVector(flight.basis.forward, 10000);
    const p = projectToScreen(_tmpVec, camera, this.w, this.h, _p);
    if (!p.visible) return;
    const ctx = this.ctx;
    const gap = 4.2 * this.s;
    const arm = 8.2 * this.s;
    ctx.strokeStyle = 'rgba(211,255,226,.95)';
    ctx.lineWidth = 1.2 * this.s;
    ctx.beginPath();
    ctx.moveTo(p.x - gap - arm, p.y);
    ctx.lineTo(p.x - gap, p.y);
    ctx.moveTo(p.x + gap, p.y);
    ctx.lineTo(p.x + gap + arm, p.y);
    ctx.moveTo(p.x, p.y - gap - arm);
    ctx.lineTo(p.x, p.y - gap);
    ctx.moveTo(p.x, p.y + gap);
    ctx.lineTo(p.x, p.y + gap + arm);
    ctx.stroke();
    ctx.fillStyle = 'rgba(211,255,226,.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.1 * this.s, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawFlightPath(flight, camera, center) {
    const speed = flight.velocity.length();
    if (speed < 12) return;
    _tmpVec.copy(flight.velocity).normalize().multiplyScalar(12000)
      .add(camera.position);
    const p = projectToScreen(_tmpVec, camera, this.w, this.h, _v);
    if (!p.visible) return;
    const ctx = this.ctx;
    const r = 5.8 * this.s;
    ctx.strokeStyle = 'rgba(185,255,214,.85)';
    ctx.lineWidth = 1.2 * this.s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    this._line(p.x - r * 2.2, p.y, p.x - r, p.y);
    this._line(p.x + r, p.y, p.x + r * 2.2, p.y);
    this._line(p.x, p.y - r, p.x, p.y - r * 2.1);
    ctx.fillStyle = 'rgba(188,255,216,.8)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2 * this.s, 0, Math.PI * 2);
    ctx.fill();
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    if (Math.hypot(dx, dy) > 4 * this.s) {
      this._line(center.x, center.y, p.x, p.y, 'rgba(155,235,195,.14)', 0.8);
    }
  }

  _drawGunSolution(state, flight, camera, center) {
    const target = state.gunTarget;
    if (!target || !target.alive) return;
    const targetPos = target.flight.position;
    const targetVel = target.flight.velocity;
    const shooterPos = flight.position;
    const shooterVel = flight.velocity;
    const muzzleSpeed = state.aircraft.config.armament.cannon.muzzleVelocity;
    let aim = targetPos.clone();
    let t = aim.distanceTo(shooterPos) / Math.max(300, muzzleSpeed);
    for (let i = 0; i < 3; i++) {
      aim.copy(targetPos)
        .addScaledVector(targetVel.clone().sub(shooterVel), t);
      aim.y += 0.5 * G0 * t * t;
      t = aim.distanceTo(shooterPos) / Math.max(300, muzzleSpeed);
    }
    const p = projectToScreen(aim, camera, this.w, this.h, _p);
    if (!p.visible) return;
    const ctx = this.ctx;
    const r = 5.4 * this.s;
    ctx.strokeStyle = 'rgba(255,199,105,.8)';
    ctx.lineWidth = 1.05 * this.s;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2 * this.s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,211,132,.9)';
    ctx.fill();
  }

  _drawHeadingTape(flight) {
    const ctx = this.ctx;
    const cx = this.w / 2;
    const y = 44 * this.s;
    const width = 360 * this.s;
    const half = width / 2;
    ctx.strokeStyle = GREEN_FAINT;
    ctx.lineWidth = 1;
    this._line(cx - half, y, cx + half, y, GREEN_FAINT, 0.8);
    this._line(cx - half, y - 22 * this.s, cx + half, y - 22 * this.s,
      'rgba(155,240,197,.12)', 0.8);
    for (let i = -30; i <= 30; i += 5) {
      const hdg = (Math.round(flight.heading / 5) * 5) + i;
      const x = cx + (i / 30) * half;
      const major = ((hdg % 10) + 10) % 10 === 0;
      this._line(x, y, x, y - (major ? 7 : 4) * this.s,
        major ? GREEN_DIM : GREEN_FAINT, 0.8);
      if (major) {
        const label = `${((hdg % 360) + 360) % 360}`.padStart(3, '0');
        this._text(label, x, y - 14 * this.s, 8.5, GREEN_DIM, 'center', 500);
      }
    }
    const current = `${Math.round(flight.heading).toString().padStart(3, '0')}`;
    this._text(current, cx, y, 10, GREEN, 'center', 600);
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(cx, y - 2 * this.s);
    ctx.lineTo(cx - 3.5 * this.s, y - 7 * this.s);
    ctx.lineTo(cx + 3.5 * this.s, y - 7 * this.s);
    ctx.closePath();
    ctx.fill();
  }

  _drawLeftData(state) {
    const ctx = this.ctx;
    const flight = state.flight;
    const a = state.aircraft;
    const x = 28 * this.s;
    const y = 26 * this.s;
    const w = 300 * this.s;
    const rowH = 22 * this.s;
    const prototypeLabel = a.config?.shortName || '原型';
    this._text(`FLIGHT DATA // ${prototypeLabel}`, x + 12 * this.s,
      y + 15 * this.s, 8.5, GREEN_DIM, 'left', 600);
    this._text(a.config?.name || 'BASELINE',
      x + w - 12 * this.s, y + 15 * this.s,
      8, 'rgba(150,225,185,.35)', 'right', 500);

    // 1. Throttle.
    const throttle = flight.engineSpool ?? flight.throttle;
    const throttlePct = clamp(throttle / 1.1, 0, 1);
    const barX = x + 12 * this.s;
    const barY = y + 33 * this.s;
    const barW = w - 72 * this.s;
    this._text('THROTTLE  节流阀', barX, y + 27 * this.s, 8, GREEN_DIM, 'left', 500);
    this._text(`${Math.round(throttle * 100)}%`, x + w - 12 * this.s,
      y + 27 * this.s, 10, throttle > 1 ? AMBER : GREEN, 'right', 600);
    ctx.fillStyle = 'rgba(164,245,200,.12)';
    ctx.fillRect(barX, barY, barW, 5 * this.s);
    ctx.fillStyle = throttle > 1 ? AMBER : GREEN;
    ctx.fillRect(barX, barY, barW * throttlePct, 5 * this.s);
    this._text(flight.afterburner > 0.1 ? 'AB' : 'MIL', barX + barW + 8 * this.s,
      barY + 3 * this.s, 7.5,
      flight.afterburner > 0.1 ? AMBER : GREEN_DIM, 'left', 600);

    let rowY = y + 54 * this.s;
    const row = (label, value, color = GREEN, size = 12, unit = '') => {
      this._line(x + 12 * this.s, rowY - 7 * this.s, x + w - 12 * this.s,
        rowY - 7 * this.s, 'rgba(155,240,197,.14)', 0.7);
      this._text(label, x + 12 * this.s, rowY, 8, GREEN_DIM, 'left', 500);
      this._font(7.5, 500);
      const unitWidth = unit ? this.ctx.measureText(unit).width + 5 * this.s : 0;
      this._text(value, x + w - 12 * this.s - unitWidth, rowY, size,
        color, 'right', 600);
      if (unit) {
        this._text(unit, x + w - 12 * this.s, rowY, 7.5,
          GREEN_DIM, 'right', 500);
      }
      rowY += rowH;
    };

    // 2-4. IAS / TAS / Mach.
    row('IAS  表速', `${Math.round(flight.iasKmh)}`, GREEN, 13, 'km/h');
    row('TAS  速度', `${Math.round(flight.tas * 3.6)}`, GREEN, 12, 'km/h');
    row('MACH  马赫', flight.mach.toFixed(2), GREEN, 12);

    // 5-6. Altitude and radar altitude.
    const agl = Math.max(0, flight.position.y -
      _groundY(flight.position.x, flight.position.z));
    row('ALT  海拔', `${Math.round(flight.position.y).toLocaleString('en-US')}`,
      GREEN, 13, 'm');
    row('RALT  雷达高度', `${Math.round(agl)}`,
      agl < 150 ? AMBER : GREEN, 13, 'm');

    // 7. Current AAM / seeker.
    const missile = a.getMissileConfig ? a.getMissileConfig() : a.config.armament.missiles;
    const slot = a.getSelectedMissileSlot?.();
    const mCount = slot ? slot.remaining : a.weapons.missiles;
    const shortName = missile.name.split(' ')[0];
    const lock = state.lock;
    row(missile.targetType&&missile.targetType!=='air'?'STORE  当前挂载':'AAM  空对空导弹', `${shortName} ×${mCount}`,
      lock ? AMBER : mCount > 0 ? GREEN : RED, 12);

    // 8-10. Countermeasures and gun.
    row('FLARE  热焰弹', `${a.weapons.flares}`,
      a.weapons.flares > 0 ? GREEN : RED, 11);
    row('CHAFF  箔条', `${a.weapons.chaff}`,
      a.weapons.chaff > 0 ? GREEN : RED, 11);
    row('GUN  机炮', `${Math.round(a.weapons.ammo)} / ${a.config.armament.cannon.ammo}`,
      a.weapons.ammo > 0 ? GREEN : RED, 11);

    // 11. Fuel endurance, deliberately in time rather than kg.
    // Internal plus drop-tank fuel at the current flow.
    const totalFuel = flight.fuel + (a.externalFuel || 0);
    const endurance = Math.max(0, flight.fuelFlow > 0 ? totalFuel / flight.fuelFlow : (flight.fuelEndurance || 0));
    const mm = Math.floor(endurance / 60);
    const ss = Math.floor(endurance % 60);
    const fuelText = endurance > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : '--:--';
    row('FUEL  燃油剩余', fuelText,
      endurance < 360 ? RED : endurance < 900 ? AMBER : GREEN, 13);
  }

  _drawGLoad(state) {
    const ctx = this.ctx;
    const flight = state.flight;
    const cx = this.w / 2;
    const y = 82 * this.s;
    const w = 190 * this.s;
    const h = 44 * this.s;
    const g = flight.normalLoad;
    const color = g > 9.5 || g < -3.2 ? RED : g > 8.2 ? AMBER : GREEN;
    this._text('G', cx - w / 2 + 14 * this.s, y + 1 * this.s,
      10, GREEN_DIM, 'left', 600);
    this._text(`${g >= 0 ? '+' : ''}${g.toFixed(1)}`, cx + 1 * this.s,
      y + 1 * this.s, 22, color, 'center', 700);
    const peak = Number.isFinite(state.peakG) ? state.peakG : g;
    this._text(`PEAK ${peak.toFixed(1)}`, cx + w / 2 - 12 * this.s,
      y - 10 * this.s, 7.5, GREEN_DIM, 'right', 500);
    const barW = w - 28 * this.s;
    const bx = cx - barW / 2;
    const by = y + 17 * this.s;
    ctx.fillStyle = 'rgba(164,245,200,.2)';
    ctx.fillRect(bx, by, barW, 3 * this.s);
    const frac = clamp((g + 3) / 12, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, barW * frac, 3 * this.s);
    const label = state.mode === 'test' ? 'FLIGHT TEST' :
      `WAVE ${String(state.wave ?? 1).padStart(2, '0')} · BANDITS ${state.enemiesRemaining ?? 0} · SCORE ${String(state.score ?? 0).padStart(6, '0')}`;
    this._text(label, cx, y + h / 2 + 13 * this.s, 8,
      GREEN_DIM, 'center', 500);
    if (state.destroyNotice) {
      // Five-second kill confirmation, same 22 px size as the G readout and
      // centred just below it. Consecutive kills within 10 s extend the title.
      const streak = state.destroyNoticeCount || 0;
      const title = streak >= 2
        ? `摧毁空中单位 ×${streak}` : '摧毁空中单位';
      this._text(title, cx, y + 60 * this.s, 22, RED, 'center', 700);
    }
  }

  _drawRwr(state) {
    const ctx = this.ctx;
    const s = this.s;
    const x = 28 * s;
    const y = 344 * s;
    const rwr = state.rwr || { threats: [], locked: false, search: false };
    const cx = x + 112 * s;
    const cy = y + 126 * s;
    const r = 110 * s;
    const threats = rwr.threats || [];
    const blink = Math.sin(state.time * 12) > 0;
    ctx.save();
    // Plain circular RWR scope, no panel and no rectangular framing.
    const dish = ctx.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
    dish.addColorStop(0, 'rgba(92,235,158,.22)');
    dish.addColorStop(0.7, 'rgba(55,180,112,.15)');
    dish.addColorStop(1, 'rgba(30,110,70,.09)');
    ctx.fillStyle = dish;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(118,255,174,.62)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // Large inner ring, like the reference scope.
    ctx.strokeStyle = 'rgba(132,255,183,.32)';
    ctx.lineWidth = 0.9 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const inner = i % 3 === 0 ? 0.87 : 0.93;
      this._line(cx + Math.sin(a) * r * inner, cy - Math.cos(a) * r * inner,
        cx + Math.sin(a) * r, cy - Math.cos(a) * r,
        'rgba(132,255,183,.30)', 0.7);
    }
    // Ownship reticle at the centre.
    ctx.strokeStyle = 'rgba(210,255,228,.72)';
    ctx.lineWidth = 0.9 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, 10 * s, 0, Math.PI * 2);
    ctx.moveTo(cx - 15 * s, cy); ctx.lineTo(cx - 5 * s, cy);
    ctx.moveTo(cx + 5 * s, cy); ctx.lineTo(cx + 15 * s, cy);
    ctx.moveTo(cx, cy - 15 * s); ctx.lineTo(cx, cy - 5 * s);
    ctx.moveTo(cx, cy + 5 * s); ctx.lineTo(cx, cy + 15 * s);
    ctx.stroke();

    // Threat labels replace the old dots entirely: each aircraft/missile code
    // sits at the emitter's live bearing around the scope. Nothing is fixed to
    // a legend position, so the text moves with the contact.
    const usedLabels = [];
    for (const threat of threats) {
      const angle = threat.bearing || 0;
      let radius = 0.80;
      let tx = cx + Math.sin(angle) * r * radius;
      let ty = cy - Math.cos(angle) * r * radius;
      // Keep overlapping contacts readable while preserving their bearing:
      // stagger them inward along the same radial line.
      for (let attempt = 0; attempt < 4; attempt++) {
        if (usedLabels.every((p) => Math.hypot(tx - p.x, ty - p.y) > 25 * s)) {
          break;
        }
        radius -= 0.10;
        tx = cx + Math.sin(angle) * r * radius;
        ty = cy - Math.cos(angle) * r * radius;
      }
      usedLabels.push({ x: tx, y: ty });
      const missile = !!threat.missile || threat.mode === 'missile';
      const track = threat.mode === 'track' || threat.mode === 'lock';
      const label = missile ? 'MSL' : (threat.code || threat.type || '?');
      const alpha = (track || missile) && !blink ? 0.45 : 0.96;
      ctx.save();
      ctx.globalAlpha = alpha;
      this._text(label, tx, ty, missile ? 12 : 11,
        missile ? 'rgba(235,255,243,.98)'
          : track ? 'rgba(182,255,211,.95)' : 'rgba(130,235,170,.72)',
        'center', 600);
      ctx.restore();
    }
    ctx.restore();
  }

  _drawMinimap(state) {
    const map = state.map;
    if (!map) return;
    const ctx = this.ctx;
    const r = 90 * this.s;
    const margin = 26 * this.s;
    const cx = this.w - r - margin;
    const cy = r + margin;
    const flight = state.flight;
    const player = flight.position;
    const mapSize = state.mapSize || 36000;
    const viewRadius = 18000;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#102630';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const srcSize = (viewRadius * 2 / mapSize) * map.width;
    const sx = (player.x + mapSize * 0.5 - viewRadius) / mapSize * map.width;
    const sy = (player.z + mapSize * 0.5 - viewRadius) / mapSize * map.height;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(map, sx, sy, srcSize, srcSize, cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;

    // Airbase symbol.
    if (state.airbase) {
      const ax = cx + (state.airbase.x - player.x) / viewRadius * r;
      const az = cy + (state.airbase.z - player.z) / viewRadius * r;
      if (Math.hypot(ax - cx, az - cy) < r - 3) {
        ctx.fillStyle = 'rgba(245,224,160,.9)';
        ctx.fillRect(ax - 1.2 * this.s, az - 4 * this.s, 2.4 * this.s, 8 * this.s);
        ctx.strokeStyle = 'rgba(245,224,160,.45)';
        ctx.lineWidth = 1 * this.s;
        ctx.beginPath();
        ctx.moveTo(ax - 6 * this.s, az);
        ctx.lineTo(ax - 3 * this.s, az);
        ctx.moveTo(ax + 3 * this.s, az);
        ctx.lineTo(ax + 6 * this.s, az);
        ctx.stroke();
      }
    }

    // Bandits.
    for (const target of state.targets || []) {
      if (!target.alive) continue;
      const dx = target.flight.position.x - player.x;
      const dz = target.flight.position.z - player.z;
      const px = cx + dx / viewRadius * r;
      const pz = cy + dz / viewRadius * r;
      if (Math.hypot(px - cx, pz - cy) > r - 3) continue;
      const locked = state.lockedTarget === target;
      ctx.fillStyle = locked ? AMBER : 'rgba(255,100,82,.9)';
      ctx.beginPath();
      ctx.moveTo(px, pz - 3.5 * this.s);
      ctx.lineTo(px + 3 * this.s, pz + 3 * this.s);
      ctx.lineTo(px - 3 * this.s, pz + 3 * this.s);
      ctx.closePath();
      ctx.fill();
    }

    // Player arrow, rotated by heading (north-up map).
    ctx.translate(cx, cy);
    ctx.rotate(flight.heading * Math.PI / 180);
    ctx.fillStyle = 'rgba(218,255,232,.95)';
    ctx.beginPath();
    ctx.moveTo(0, -7 * this.s);
    ctx.lineTo(5 * this.s, 6 * this.s);
    ctx.lineTo(0, 3 * this.s);
    ctx.lineTo(-5 * this.s, 6 * this.s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(5,20,18,.9)';
    ctx.lineWidth = 1 * this.s;
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(155,240,197,.45)';
    ctx.lineWidth = 1.2 * this.s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    this._text('N', cx, cy - r + 9 * this.s, 8, GREEN_DIM, 'center', 700);
    this._text('18 KM', cx, cy + r + 12 * this.s, 7.5, GREEN_DIM, 'center', 500);
    this._text('MAP', cx - r + 8 * this.s, cy + r - 9 * this.s, 7,
      'rgba(150,225,185,.45)', 'left', 600);
  }

  _drawLargeMap(state) {
    if (!state.mapOpen || !state.map) return;
    const ctx = this.ctx;
    const flight = state.flight;
    const player = flight.position;
    const mapSize = state.mapSize || 36000;
    const half = 20000;                 // 40 km × 40 km tactical area
    const size = Math.min(this.w, this.h) * 0.68;
    const cx = this.w * 0.5;
    const cy = this.h * 0.52;
    // Centre the square on the island, not the player: the player is often near
    // the coast and a player-centred crop would be mostly empty ocean.
    const x0 = -half;
    const z0 = -half;
    const mapX = (x) => cx + x / (half * 2) * size;
    const mapZ = (z) => cy + z / (half * 2) * size;
    const sourceScale = state.map.width / mapSize;
    const srcX = (x0 + mapSize * 0.5) * sourceScale;
    const srcY = (z0 + mapSize * 0.5) * sourceScale;
    const srcSize = half * 2 * sourceScale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - size * 0.5, cy - size * 0.5, size, size);
    ctx.clip();
    ctx.fillStyle = '#0d2822';
    ctx.fillRect(cx - size * 0.5, cy - size * 0.5, size, size);
    ctx.globalAlpha = 0.94;
    // Clip the source rectangle to the baked map rather than letting the
    // canvas wrap/clamp it when the player is near the map edge.
    const ix0 = Math.max(0, srcX);
    const iy0 = Math.max(0, srcY);
    const ix1 = Math.min(state.map.width, srcX + srcSize);
    const iy1 = Math.min(state.map.height, srcY + srcSize);
    if (ix1 > ix0 && iy1 > iy0) {
      const dx = cx - size * 0.5 + (ix0 - srcX) / srcSize * size;
      const dy = cy - size * 0.5 + (iy0 - srcY) / srcSize * size;
      const dw = (ix1 - ix0) / srcSize * size;
      const dh = (iy1 - iy0) / srcSize * size;
      ctx.drawImage(state.map, ix0, iy0, ix1 - ix0, iy1 - iy0, dx, dy, dw, dh);
    }
    ctx.globalAlpha = 1;

    if (state.airbase) {
      const ax = mapX(state.airbase.x);
      const az = mapZ(state.airbase.z);
      if (Math.abs(ax - cx) < size * 0.5 - 4 &&
        Math.abs(az - cy) < size * 0.5 - 4) {
        ctx.fillStyle = 'rgba(245,224,160,.95)';
        ctx.fillRect(ax - 2 * this.s, az - 7 * this.s, 4 * this.s, 14 * this.s);
        ctx.strokeStyle = 'rgba(245,224,160,.55)';
        ctx.lineWidth = 1 * this.s;
        ctx.beginPath();
        ctx.moveTo(ax - 11 * this.s, az);
        ctx.lineTo(ax - 5 * this.s, az);
        ctx.moveTo(ax + 5 * this.s, az);
        ctx.lineTo(ax + 11 * this.s, az);
        ctx.stroke();
      }
    }

    for (const target of state.targets || []) {
      if (!target.alive) continue;
      const px = mapX(target.flight.position.x);
      const pz = mapZ(target.flight.position.z);
      if (Math.abs(px - cx) > size * 0.5 - 5 ||
        Math.abs(pz - cy) > size * 0.5 - 5) continue;
      const locked = state.lockedTarget === target;
      ctx.fillStyle = locked ? 'rgba(255,201,104,.98)' : 'rgba(255,110,90,.95)';
      ctx.beginPath();
      ctx.moveTo(px, pz - 6 * this.s);
      ctx.lineTo(px + 5 * this.s, pz + 5 * this.s);
      ctx.lineTo(px - 5 * this.s, pz + 5 * this.s);
      ctx.closePath();
      ctx.fill();
      this._text(`T${String(target.trackId || 0).padStart(2, '0')}`,
        px + 8 * this.s, pz, 7.5, GREEN_DIM, 'left', 600);
    }

    const playerX = mapX(player.x);
    const playerZ = mapZ(player.z);
    ctx.translate(playerX, playerZ);
    ctx.rotate(flight.heading * Math.PI / 180);
    ctx.fillStyle = 'rgba(225,255,236,.98)';
    ctx.beginPath();
    ctx.moveTo(0, -10 * this.s);
    ctx.lineTo(7 * this.s, 8 * this.s);
    ctx.lineTo(0, 4 * this.s);
    ctx.lineTo(-7 * this.s, 8 * this.s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(5,20,18,.9)';
    ctx.lineWidth = 1.2 * this.s;
    ctx.stroke();
    ctx.restore();

    this._text('TACTICAL MAP // M · 60 KM SQUARE', cx,
      cy - size * 0.5 - 16 * this.s, 10, GREEN, 'center', 600);
    this._text('N', cx, cy - size * 0.5 + 12 * this.s, 9,
      GREEN_DIM, 'center', 700);
    this._text('60 KM', cx, cy + size * 0.5 + 15 * this.s, 8,
      GREEN_DIM, 'center', 500);
  }

  _drawTws(state) {
    const ctx = this.ctx;
    const radar = state.radar;
    if (!radar) return;
    const scope = 194 * this.s;
    const pad = 12 * this.s;
    const w = scope + pad * 2;
    const h = scope + 56 * this.s;
    const x = this.w - 28 * this.s - w;
    const y = this.h * 0.48 - h * 0.5;
    const twsRange = Math.round((radar.range || 25000) / 1000);
    this._text(`AESA // TWS ${twsRange} KM`, x + pad, y + 15 * this.s, 8.5,
      GREEN, 'left', 600);
    const azimuthDeg = Math.round((radar.azimuth || Math.PI / 3) * 180 / Math.PI);
    this._text(`±${azimuthDeg}°`, x + w - pad, y + 15 * this.s, 8,
      GREEN_DIM, 'right', 500);
    const sx = x + pad;
    const sy = y + 27 * this.s;
    // No enclosing rectangle: the range/azimuth grid defines the square scope.
    const rangeMax = radar.range || 25000;
    const azimuthLimit = radar.azimuth || Math.PI / 3;
    const rangeKm = Math.round(rangeMax / 1000);
    const gridStep = rangeKm <= 10 ? 2 : rangeKm <= 25 ? 5 :
      rangeKm <= 50 ? 10 : 20;
    for (let km = gridStep; km <= rangeKm; km += gridStep) {
      const yy = sy + scope - (km / rangeKm) * scope;
      this._line(sx, yy, sx + scope, yy, 'rgba(150,235,195,.18)', 0.7);
      this._text(`${km}`, sx - 2 * this.s, yy, 7, GREEN_DIM, 'right', 500);
    }
    for (const deg of [-60, -30, 0, 30, 60]) {
      const xx = sx + scope * 0.5 + (deg / azimuthDeg) * scope * 0.5;
      this._line(xx, sy, xx, sy + scope,
        deg === 0 ? 'rgba(155,240,197,.28)' : 'rgba(150,235,195,.15)', 0.7);
      if (deg !== 0) {
        this._text(`${Math.abs(deg)}`, xx, sy + scope + 9 * this.s, 7,
          GREEN_DIM, 'center', 500);
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, scope, scope);
    ctx.clip();
    // Scan bar and its fading wake.
    const scanX = sx + scope * 0.5 +
      (radar.scanAngle / azimuthLimit) * scope * 0.5;
    const grad = ctx.createLinearGradient(scanX - 20 * this.s, 0,
      scanX + 20 * this.s, 0);
    grad.addColorStop(0, 'rgba(127,255,185,0)');
    grad.addColorStop(0.5, 'rgba(127,255,185,.2)');
    grad.addColorStop(1, 'rgba(127,255,185,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(scanX - 20 * this.s, sy, 40 * this.s, scope);
    this._line(scanX, sy, scanX, sy + scope, 'rgba(188,255,216,.65)', 1.2);

    const contacts = radar.contacts || [];
    for (const contact of contacts) {
      // The scale only changes the scope view; the radar contact list itself
      // always covers the full 100 km working range.
      if (contact.range > rangeMax) continue;
      const px = sx + scope * 0.5 +
        (contact.azimuth / azimuthLimit) * scope * 0.5;
      const py = sy + scope - (contact.range / rangeMax) * scope;
      const locked = contact.locked;
      const scanned = contact.scanned;
      const color = locked ? AMBER : scanned ? GREEN : 'rgba(255,126,103,.55)';
      // Top-down fighter symbol, rotated to the target's relative heading.
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(contact.heading || 0);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.9 * this.s;
      ctx.beginPath();
      ctx.moveTo(0, -6.5 * this.s);
      ctx.lineTo(1.4 * this.s, -1.2 * this.s);
      ctx.lineTo(5.4 * this.s, 1.8 * this.s);
      ctx.lineTo(5.4 * this.s, 3.2 * this.s);
      ctx.lineTo(1.5 * this.s, 2.0 * this.s);
      ctx.lineTo(1.5 * this.s, 4.6 * this.s);
      ctx.lineTo(3.0 * this.s, 6.2 * this.s);
      ctx.lineTo(3.0 * this.s, 7.0 * this.s);
      ctx.lineTo(0, 5.6 * this.s);
      ctx.lineTo(-3.0 * this.s, 7.0 * this.s);
      ctx.lineTo(-3.0 * this.s, 6.2 * this.s);
      ctx.lineTo(-1.5 * this.s, 4.6 * this.s);
      ctx.lineTo(-1.5 * this.s, 2.0 * this.s);
      ctx.lineTo(-5.4 * this.s, 3.2 * this.s);
      ctx.lineTo(-5.4 * this.s, 1.8 * this.s);
      ctx.lineTo(-1.4 * this.s, -1.2 * this.s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (locked) {
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 1 * this.s;
        const k = 4 * this.s;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(px + sx * 8 * this.s, py + sy * 8 * this.s - sy * k);
          ctx.lineTo(px + sx * 8 * this.s, py + sy * 8 * this.s);
          ctx.lineTo(px + sx * 8 * this.s - sx * k, py + sy * 8 * this.s);
          ctx.stroke();
        }
        this._text(`T${String(contact.id).padStart(2, '0')}  ${(contact.range / 1000).toFixed(1)}km`,
          px + 11 * this.s, py - 7 * this.s, 7.2, AMBER, 'left', 500);
        this._text(`${contact.altDelta >= 0 ? '+' : ''}${Math.round(contact.altDelta)}m · ${contact.closure >= 0 ? '+' : ''}${Math.round(contact.closure)}m/s`,
          px + 11 * this.s, py + 4 * this.s, 7, GREEN_DIM, 'left', 500);
      } else {
        this._text(`T${String(contact.id).padStart(2, '0')}`, px + 8 * this.s,
          py - 4 * this.s, 7, scanned ? GREEN_DIM : 'rgba(196,248,216,.4)',
          'left', 500);
      }
    }
    ctx.restore();
    // Ownship notch.
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.moveTo(sx + scope * 0.5, sy + scope - 5 * this.s);
    ctx.lineTo(sx + scope * 0.5 - 4 * this.s, sy + scope);
    ctx.lineTo(sx + scope * 0.5 + 4 * this.s, sy + scope);
    ctx.closePath();
    ctx.fill();
    this._text(`${contacts.length} TRACK${contacts.length === 1 ? '' : 'S'} · TWS AUTO`,
      x + pad, y + h - 10 * this.s, 7.5, GREEN_DIM, 'left', 500);
  }

  _drawCockpitGlass(state) {
    const ctx = this.ctx;
    const s = this.s;
    // Combiner glass stands on the instrument-panel top and reaches up to the
    // boresight at screen centre; its lower edge is attached to the cockpit.
    const w = 126 * s;
    const panelTop = this.h - 124 * s;
    const cy = this.h * 0.5;
    const y = panelTop - 230 * s;
    const h = panelTop - y;
    const cx = this.w * 0.5;
    const x = cx - w * 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(110, 220, 160, 0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(160, 255, 196, 0.62)';
    ctx.lineWidth = 1.1 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(4, 9, 9, 0.86)';
    ctx.fillRect(x - 3 * s, y - 2 * s, 6 * s, h + 4 * s);
    ctx.fillRect(x + w - 3 * s, y - 2 * s, 6 * s, h + 4 * s);

    const r = 12 * s;
    ctx.strokeStyle = 'rgba(167, 255, 203, 0.95)';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r - 10 * s, cy); ctx.lineTo(cx - r + 3 * s, cy);
    ctx.moveTo(cx + r - 3 * s, cy); ctx.lineTo(cx + r + 10 * s, cy);
    ctx.moveTo(cx, cy - r - 10 * s); ctx.lineTo(cx, cy - r + 3 * s);
    ctx.moveTo(cx, cy + r - 3 * s); ctx.lineTo(cx, cy + r + 10 * s);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(167, 255, 203, 0.28)';
    for (let i = -1; i <= 1; i++) {
      if (i === 0) continue;
      const yy = cy + i * 22 * s;
      const half = i < 0 ? 22 * s : 16 * s;
      ctx.beginPath();
      ctx.moveTo(cx - half, yy); ctx.lineTo(cx + half, yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCockpitGauges(state) {
    const flight = state.flight;
    if (!flight) return;
    const ctx = this.ctx;
    const s = this.s;
    const width = Math.min(660 * s, this.w - 80 * s);
    const height = 86 * s;
    const x = this.w * 0.5 - width * 0.5;
    const y = this.h - 124 * s;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 12, 13, 0.62)';
    ctx.strokeStyle = 'rgba(160, 230, 192, 0.22)';
    ctx.lineWidth = 1 * s;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    this._text('F-16CM  //  COCKPIT INSTRUMENTS', x + 12 * s, y + 12 * s,
      8, GREEN_FAINT, 'left', 600);

    const fuelMax = state.aircraft?.config?.systems?.maxFuel || 1;
    const values = [
      { label: 'IAS', value: flight.iasKmh, min: 0, max: 900, text: `${Math.round(flight.iasKmh)}` },
      { label: 'ALT', value: flight.position.y, min: 0, max: 12000, text: `${Math.round(flight.position.y)}` },
      { label: 'VSI', value: flight.verticalSpeed, min: -50, max: 50, text: `${flight.verticalSpeed >= 0 ? '+' : ''}${flight.verticalSpeed.toFixed(0)}` },
      { label: 'RPM', value: (flight.engineSpool ?? 0) * 100, min: 40, max: 110, text: `${Math.round((flight.engineSpool ?? 0) * 100)}%` },
      { label: 'FUEL', value: flight.fuel / fuelMax * 100, min: 0, max: 100, text: `${Math.round(flight.fuel / fuelMax * 100)}%` },
      { label: 'G', value: flight.gLoad ?? 1, min: -3, max: 9, text: `${(flight.gLoad ?? 1).toFixed(1)}` },
    ];
    const gaugeY = y + 51 * s;
    const gap = width / (values.length + 1);
    values.forEach((gauge, i) => {
      const cx = x + gap * (i + 1);
      const r = 22 * s;
      ctx.strokeStyle = 'rgba(178, 245, 205, 0.55)';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.arc(cx, gaugeY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(178, 245, 205, 0.28)';
      ctx.lineWidth = 1;
      for (let tick = 0; tick < 8; tick++) {
        const a = -2.2 + tick * (4.4 / 7);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 4 * s), gaugeY + Math.sin(a) * (r - 4 * s));
        ctx.lineTo(cx + Math.cos(a) * r, gaugeY + Math.sin(a) * r);
        ctx.stroke();
      }
      const norm = clamp((gauge.value - gauge.min) / (gauge.max - gauge.min), 0, 1);
      const needle = -2.2 + norm * 4.4;
      ctx.strokeStyle = gauge.label === 'G' && gauge.value > 7 ? RED : AMBER;
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath();
      ctx.moveTo(cx, gaugeY);
      ctx.lineTo(cx + Math.cos(needle) * (r - 7 * s),
        gaugeY + Math.sin(needle) * (r - 7 * s));
      ctx.stroke();
      this._text(gauge.text, cx, gaugeY + 8 * s, 7.5, GREEN, 'center', 600);
      this._text(gauge.label, cx, gaugeY + 22 * s, 7, GREEN_FAINT, 'center', 600);
    });
    ctx.restore();
  }

  _drawKillFeed(state) {
    if (!state.killfeed?.length) return;
    const x = this.w - 30 * this.s;
    let y = this.h - 34 * this.s;
    const colorFor = (tag) => tag === 'player' ? YELLOW
      : tag === 'enemy' ? RED : GREEN_DIM;
    for (const entry of state.killfeed.slice(-5).reverse()) {
      const age = state.time - entry.time;
      if (age > 9) continue;
      const alpha = clamp(1 - (age - 7) / 2, 0, 1);
      this.ctx.globalAlpha = alpha;
      if (entry.segments?.length) {
        this._font(9.5, 500);
        const widths = entry.segments.map((segment) =>
          this.ctx.measureText(segment.text).width);
        let cursor = x - widths.reduce((sum, width) => sum + width, 0);
        for (let i = 0; i < entry.segments.length; i++) {
          const segment = entry.segments[i];
          this._text(segment.text, cursor, y, 9.5,
            colorFor(segment.color), 'left', 500);
          cursor += widths[i];
        }
      } else {
        this._text(entry.text, x, y, 9.5,
          entry.highlight ? AMBER : GREEN_DIM, 'right', 500);
      }
      y -= 15 * this.s;
      this.ctx.globalAlpha = 1;
    }
  }

  _drawStatusFeed(state) {
    const entries = (state.statusFeed || []).filter((entry) =>
      state.time - entry.time < entry.duration);
    if (!entries.length) return;
    const x = this.w * 0.33;
    let y = this.h - 108 * this.s;
    this._textShadow(false);
    for (const entry of entries.slice(-3)) {
      const age = state.time - entry.time;
      const alpha = clamp(1 - Math.max(0, age - (entry.duration - 0.7)) / 0.7, 0, 1);
      const color = entry.tone === 'danger' ? RED :
        entry.tone === 'good' ? GREEN : AMBER;
      this.ctx.globalAlpha = alpha;
      this._font(9, 600);
      this.ctx.fillStyle = color;
      this.ctx.fillRect(x, y - 8 * this.s, 2 * this.s, 17 * this.s);
      this._text(entry.text, x + 12 * this.s, y, 9, color, 'left', 600);
      this.ctx.globalAlpha = 1;
      y -= 22 * this.s;
    }
    this._textShadow(true);
  }

  _drawWarnings(state, center) {
    if (!state.warnings?.length) return;
    const ctx = this.ctx;
    const blink = Math.floor(state.time * 3.2) % 2 === 0;
    let y = this.h * 0.62;
    for (const warning of state.warnings) {
      if (!warning) continue;
      const color = warning.level === 'danger' ? RED :
        warning.level === 'caution' ? AMBER : GREEN;
      if (!blink && warning.blink) continue;
      const text = warning.text;
      this._text(text, center.x, y, 13, color, 'center', 700);
      y += 25 * this.s;
    }
  }

  _drawHint(state) {
    if (!state.hintAlpha || state.hintAlpha <= 0.01) return;
    this.ctx.globalAlpha = state.hintAlpha;
    this._textShadow(false);
    const text = state.hintText || '鼠标视角  ·  ' + [
      ['gunFire','机炮'],['weaponFire','锁定/发射'],['chaff','箔条'],['flares','热焰弹'],
      ['weaponNext','武器'],['radarRange','雷达'],['freeLook','视角'],['flaps','襟翼'],['gear','起落架'],
    ].map(([id,label]) => `${formatBinding(state.keyBindings,id)} ${label}`).join('  ·  ');
    this._font(9.5, 500);
    this._text(text, this.w / 2, this.h - 42 * this.s, 9.5,
      GREEN_DIM, 'center', 500);
    this.ctx.globalAlpha = 1;
    this._textShadow(true);
  }

  _drawTelemetry(state, flight) {
    const ctx = this.ctx;
    const x = 28 * this.s;
    const y = 610 * this.s;
    const line = 10.5 * this.s;
    const aero = flight.aero.last;
    this._text('FLIGHT TEST DATA', x + 10 * this.s, y, 8, AMBER, 'left', 600);
    this._font(7.6, 500);
    ctx.fillStyle = GREEN_DIM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lines = [
      `MASS  ${flight.mass.toFixed(0)} kg   FUEL ${flight.fuel.toFixed(0)} kg   EXT ${(state.aircraft?.externalFuel || 0).toFixed(0)} kg`,
      `TAS   ${(flight.tas * 3.6).toFixed(0)} km/h   M ${flight.mach.toFixed(2)}`,
      `ALPHA ${flight.aoaDeg.toFixed(1)}°   BETA ${flight.betaDeg.toFixed(1)}°`,
      `CL    ${aero.CL.toFixed(3)}   CD ${aero.CD.toFixed(4)}`,
      `LIFT  ${(aero.lift / 1000).toFixed(1)} kN   DRAG ${(aero.drag / 1000).toFixed(1)} kN`,
      `THR   ${(flight.engineThrust / 1000).toFixed(1)} kN   q ${(aero.qbar / 1000).toFixed(1)} kPa`,
      `Ps    ${flight.specificExcessPower.toFixed(1)} m/s   n ${flight.normalLoad.toFixed(2)} g`,
      `RATE  p ${flight.rates.p.toFixed(2)}  q ${flight.rates.q.toFixed(2)}  r ${flight.rates.r.toFixed(2)} rad/s`,
      `ELEV  ${flight.control.surfaces.elevator.toFixed(3)}   AIL ${flight.control.surfaces.aileron.toFixed(3)}`,
      `FLAPS ${flight.control.surfaces.flaps.toFixed(2)}   GEAR ${flight.control.surfaces.gear.toFixed(2)}   SPD BRK ${flight.control.surfaces.airbrake.toFixed(2)}`,
    ];
    lines.forEach((text, i) =>
      ctx.fillText(text, x + 10 * this.s, y + 15 * this.s + i * line));
  }

  _drawCursor(state) {
    const input = state.input;
    if (!input || !input.mouse.inside || input.altMouse) return;
    // Normal flight uses a fixed centre reticle. Pointer lock keeps the
    // physical mouse at the centre; free look uses the same reticle while the
    // mouse rotates the camera.
    const x = this.w * 0.5;
    const y = this.h * 0.5;
    const ctx = this.ctx;
    const free = state.freeLook;
    const r = (free ? 10 : 8.5) * this.s;
    const color = free ? AMBER : 'rgba(198,255,222,.72)';
    // Mouse cursor: a plain circle. The nose direction is the separate moving
    // crosshair drawn by _drawNoseCrosshair().
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.0 * this.s;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (free) {
      this._text('LOOK', x, y - r - 6 * this.s, 7.5, AMBER, 'center', 600);
    }
  }

  _drawFreeLookBadge(state) {
    if (!state.freeLook) return;
    // Bottom-left, clear of the centre kill banner and the top G readout.
    const x = 28 * this.s;
    const y = this.h - 16 * this.s;
    this._text('FREE LOOK · C', x, y, 9, AMBER, 'left', 600);
  }

  _drawGStress(state) {
    const g = clamp(state.gEffect || 0, 0, 1);
    const red = clamp(state.redout || 0, 0, 1);
    if (g <= 0.001 && red <= 0.001) return;
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.12,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72);
    if (g > 0) {
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.45, `rgba(2,4,5,${g * 0.25})`);
      grad.addColorStop(1, `rgba(0,0,0,${clamp(g * 0.9, 0, 0.94)})`);
    } else {
      grad.addColorStop(0, 'rgba(50,0,0,0)');
      grad.addColorStop(0.5, `rgba(70,0,0,${red * 0.25})`);
      grad.addColorStop(1, `rgba(120,0,0,${clamp(red * 0.85, 0, 0.9)})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  _drawDamage(state) {
    const damage = state.damage ?? 0;
    if (damage <= 0.01) return;
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.25,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.7);
    grad.addColorStop(0, 'rgba(90,0,0,0)');
    grad.addColorStop(1, `rgba(160,8,0,${clamp(damage * 0.55, 0, 0.55)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
    if (damage > 0.55) {
      ctx.strokeStyle = `rgba(255,95,70,${(damage - 0.55) * 0.5})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const x = i % 2 === 0 ? 0 : this.w;
        const y = this.h * (0.25 + i * 0.18);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (i % 2 === 0 ? 1 : -1) * 70 * this.s,
          y + (i - 1.5) * 12 * this.s);
        ctx.stroke();
      }
    }
  }

}

// Terrain is imported lazily to keep the HUD independent of world construction.
let _groundY = () => 0;
export function bindGroundSampler(fn) {
  _groundY = fn;
}
