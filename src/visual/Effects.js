import * as THREE from '../../vendor/three.module.js';
import { TrailRibbon } from './Trail.js';
import {BombExplosionSystem} from './BombExplosion.js';

function makeSoftTexture(kind = 'smoke') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 2 - 1;
      const ny = y / size * 2 - 1;
      const r = Math.hypot(nx, ny);
      let a;
      if (kind === 'smoke') {
        const n = Math.sin(x * 0.31 + Math.cos(y * 0.17) * 3) *
          Math.sin(y * 0.27 + 1.7) * 0.5 + 0.5;
        a = Math.max(0, 1 - r) ** 1.4 * (0.55 + n * 0.45);
      } else if (kind === 'spark') {
        a = Math.max(0, 1 - r) ** 4;
      } else {
        a = Math.max(0, 1 - r) ** 2;
      }
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeFlashTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,245,1)');
  grad.addColorStop(0.12, 'rgba(255,236,180,.95)');
  grad.addColorStop(0.4, 'rgba(255,140,50,.35)');
  grad.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,240,190,.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 10, c + Math.sin(a) * 10);
    ctx.lineTo(c + Math.cos(a) * 62, c + Math.sin(a) * 62);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

class ParticlePool {
  constructor(scene, texture, count, blending) {
    this.items = [];
    this.group = new THREE.Group();
    this.group.name = 'effect-particles';
    scene.add(this.group);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending,
        opacity: 0,
        color: 0xffffff,
        fog: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.frustumCulled = false;
      this.group.add(sprite);
      this.items.push({
        sprite, mat, active: false, life: 0, maxLife: 1,
        velocity: new THREE.Vector3(), gravity: 0, drag: 0,
        startScale: 1, endScale: 1, startOpacity: 1, spin: 0,
      });
    }
    this.cursor = 0;
  }

  spawn(opts) {
    let item = null;
    for (let i = 0; i < this.items.length; i++) {
      const candidate = this.items[(this.cursor + i) % this.items.length];
      if (!candidate.active) {
        item = candidate;
        this.cursor = (this.cursor + i + 1) % this.items.length;
        break;
      }
    }
    if (!item) {
      item = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;
    }
    item.active = true;
    item.life = 0;
    item.maxLife = opts.life ?? 1;
    item.sprite.visible = true;
    item.sprite.position.copy(opts.position);
    item.velocity.copy(opts.velocity || new THREE.Vector3());
    item.gravity = opts.gravity ?? 0;
    item.drag = opts.drag ?? 0;
    item.startScale = opts.startScale ?? 10;
    item.endScale = opts.endScale ?? opts.startScale ?? 10;
    item.startOpacity = opts.opacity ?? 1;
    item.mat.color.set(opts.color ?? 0xffffff);
    item.mat.rotation = opts.rotation ?? Math.random() * Math.PI * 2;
    item.spin = (Math.random() - 0.5) * 0.8;
    item.mat.opacity = item.startOpacity;
    item.sprite.scale.setScalar(item.startScale);
    return item;
  }

  update(dt) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.life += dt;
      const t = item.life / item.maxLife;
      if (t >= 1) {
        item.active = false;
        item.sprite.visible = false;
        continue;
      }
      item.velocity.y += item.gravity * dt;
      if (item.drag > 0) item.velocity.multiplyScalar(Math.exp(-item.drag * dt));
      item.sprite.position.addScaledVector(item.velocity, dt);
      const scale = item.startScale + (item.endScale - item.startScale) * t;
      item.sprite.scale.setScalar(scale);
      item.mat.opacity = item.startOpacity * Math.pow(1 - t, 1.25);
      item.mat.rotation += item.spin * dt;
    }
  }

  clear() {
    for (const item of this.items) {
      item.active = false;
      item.sprite.visible = false;
    }
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);

    this.smokeTex = makeSoftTexture('smoke');
    this.sparkTex = makeSoftTexture('spark');
    this.flashTex = makeFlashTexture();
    this.smoke = new ParticlePool(scene, this.smokeTex, 180, THREE.NormalBlending);
    this.sparks = new ParticlePool(scene, this.sparkTex, 130, THREE.AdditiveBlending);
    this.flashes = new ParticlePool(scene, this.flashTex, 40, THREE.AdditiveBlending);

    this.explosionLight = new THREE.PointLight(0xff8038, 0, 500, 2);
    this.explosionLight.position.set(0, -9999, 0);
    scene.add(this.explosionLight);
    this.lightLife = 0;

    this.trails = [];
    this.bombs=new BombExplosionSystem(scene);
  }

  createTrail(options, persistent = false) {
    const trail = new TrailRibbon(this.scene, options);
    trail.persistent = persistent;
    this.trails.push(trail);
    return trail;
  }

  removeTrail(trail) {
    if (trail.persistent) {
      trail.clear();
      trail.setOpacity(0);
      return;
    }
    const idx = this.trails.indexOf(trail);
    if (idx >= 0) this.trails.splice(idx, 1);
    trail.dispose();
  }

  impact(position, normal = null, kind = 'metal') {
    const dir = normal || new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 5; i++) {
      const v = dir.clone().multiplyScalar(8 + Math.random() * 18)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18));
      this.sparks.spawn({
        position,
        velocity: v,
        gravity: -20,
        drag: 0.8,
        life: 0.25 + Math.random() * 0.25,
        startScale: 1.1 + Math.random() * 2.2,
        endScale: 0.2,
        opacity: 1,
        color: Math.random() > 0.4 ? 0xffb15b : 0xfff2c8,
      });
    }
    this.smoke.spawn({
      position,
      velocity: dir.clone().multiplyScalar(3).add(new THREE.Vector3(0, 2, 0)),
      gravity: 1.5,
      drag: 1.4,
      life: 0.8,
      startScale: 2,
      endScale: 8,
      opacity: kind === 'water' ? 0.7 : 0.35,
      color: kind === 'water' ? 0xdce9ee : 0x3c3c3b,
    });
  }

  explosion(position, scale = 1, inheritedVelocity = null) {
    const base = position;
    const vel = inheritedVelocity ? inheritedVelocity.clone().multiplyScalar(0.25) : new THREE.Vector3();
    this.flashes.spawn({
      position: base,
      velocity: vel,
      life: 0.22,
      startScale: 45 * scale,
      endScale: 110 * scale,
      opacity: 1,
      color: 0xffe3aa,
    });
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 34,
        (Math.random() - 0.2) * 36,
        (Math.random() - 0.5) * 34).multiplyScalar(scale).add(vel);
      this.flashes.spawn({
        position: base.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6)),
        velocity: v,
        gravity: -4,
        drag: 1.8,
        life: 0.5 + Math.random() * 0.7,
        startScale: (8 + Math.random() * 16) * scale,
        endScale: (2 + Math.random() * 5) * scale,
        opacity: 0.95,
        color: Math.random() > 0.3 ? 0xff8e3a : 0xffd574,
      });
    }
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 18,
        4 + Math.random() * 22,
        (Math.random() - 0.5) * 18).multiplyScalar(scale).add(vel);
      this.smoke.spawn({
        position: base.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 8)),
        velocity: v,
        gravity: 1.8,
        drag: 0.55,
        life: 2.4 + Math.random() * 3.6,
        startScale: (7 + Math.random() * 10) * scale,
        endScale: (36 + Math.random() * 35) * scale,
        opacity: 0.5 + Math.random() * 0.25,
        color: Math.random() > 0.5 ? 0x2c2a26 : 0x65615b,
      });
    }
    for (let i = 0; i < 22; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 110,
        (Math.random() - 0.3) * 100,
        (Math.random() - 0.5) * 110).multiplyScalar(scale).add(vel);
      this.sparks.spawn({
        position: base,
        velocity: v,
        gravity: -28,
        drag: 0.55,
        life: 0.45 + Math.random() * 0.9,
        startScale: 1.8 + Math.random() * 3.5,
        endScale: 0.2,
        opacity: 1,
        color: 0xffc36b,
      });
    }
    this.explosionLight.position.copy(base);
    this.explosionLight.intensity = 20 * scale;
    this.lightLife = 0.32;
  }

  bombExplosion(position,options={}) {
    const effect=this.bombs.spawn(position,options);
    this.explosionLight.position.copy(position);this.explosionLight.intensity=25*effect.scale;this.lightLife=.35;
    return effect;
  }

  damageSmoke(position, velocity, severity = 0.5) {
    const v = velocity.clone().multiplyScalar(0.12).add(new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      2 + Math.random() * 3,
      (Math.random() - 0.5) * 4));
    this.smoke.spawn({
      position,
      velocity: v,
      gravity: 1.4,
      drag: 0.7,
      life: 2.5 + Math.random() * 3,
      startScale: 3 + Math.random() * 4,
      endScale: 18 + Math.random() * 18,
      opacity: 0.28 + severity * 0.34,
      color: severity > 0.65 ? 0x312c28 : 0x5d5a55,
    });
    if (severity > 0.68 && Math.random() < 0.4) {
      this.flashes.spawn({
        position,
        velocity: v,
        life: 0.35,
        startScale: 4,
        endScale: 1,
        opacity: 0.7,
        color: 0xff7026,
      });
    }
  }

  waterSplash(position, scale = 1) {
    for (let i = 0; i < 9; i++) {
      this.smoke.spawn({
        position,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 16 * scale,
          10 + Math.random() * 26 * scale,
          (Math.random() - 0.5) * 16 * scale),
        gravity: -8,
        drag: 0.6,
        life: 1.4 + Math.random() * 1.5,
        startScale: 4 * scale,
        endScale: 20 * scale,
        opacity: 0.35,
        color: 0xdfeef1,
      });
    }
  }

  update(dt, camera) {
    this.smoke.update(dt);
    this.sparks.update(dt);
    this.flashes.update(dt);
    this.bombs.update(dt,camera);
    for (const trail of this.trails) trail.update(dt, camera);
    if (this.lightLife > 0) {
      this.lightLife -= dt;
      this.explosionLight.intensity *= Math.exp(-9 * dt);
      if (this.lightLife <= 0) this.explosionLight.intensity = 0;
    }
  }

  clear() {
    this.smoke.clear();
    this.sparks.clear();
    this.flashes.clear();
    this.bombs.clear();
    const keep = [];
    for (const trail of this.trails) {
      if (trail.persistent) {
        trail.clear();
        trail.setOpacity(0);
        keep.push(trail);
      } else {
        trail.dispose();
      }
    }
    this.trails = keep;
    this.explosionLight.intensity = 0;
  }
}
