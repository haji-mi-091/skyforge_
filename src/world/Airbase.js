import * as THREE from '../../vendor/three.module.js';
import { AIRBASE } from './terrainData.js';

function makeAsphaltTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#383c3e';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(14,16,17,.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 62);
  tex.anisotropy = 8;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeConcreteTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#77766b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    const v = 95 + Math.random() * 45;
    ctx.fillStyle = `rgba(${v},${v},${v - 5},.12)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(45,45,40,.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 8);
  tex.anisotropy = 4;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeTextTexture(text, { color = '#e9e7d7', font = 'bold 150px Bahnschrift, sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 270);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

export class Airbase {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'airbase';
    this.y = AIRBASE.elevation + 0.12;
    this.group.position.set(0, 0, 0);
    this._buildRunway();
    this._buildBuildings();
    this._buildLights();
  }

  _flatPlane(width, length, x, z, y, material) {
    const geo = new THREE.PlaneGeometry(width, length);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    return mesh;
  }

  _buildRunway() {
    const asphaltTex = makeAsphaltTexture();
    const asphalt = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      color: '#9da1a1',
      roughness: 0.92,
      metalness: 0.02,
    });
    const runway = this._flatPlane(
      AIRBASE.runwayWidth, AIRBASE.runwayLength,
      AIRBASE.x, AIRBASE.z, this.y, asphalt);
    this.group.add(runway);

    const concrete = new THREE.MeshStandardMaterial({
      map: makeConcreteTexture(),
      color: '#b2ae9f',
      roughness: 0.95,
    });
    const apron = this._flatPlane(300, 560, AIRBASE.x + 220, AIRBASE.z + 80,
      this.y - 0.015, concrete);
    this.group.add(apron);
    const taxi = this._flatPlane(150, 190, AIRBASE.x + 84, AIRBASE.z + 40,
      this.y - 0.005, concrete);
    this.group.add(taxi);

    const markingMat = new THREE.MeshBasicMaterial({
      color: '#d8d6c6',
      toneMapped: false,
    });
    const marks = new THREE.Group();
    const y = this.y + 0.035;
    const box = new THREE.BoxGeometry(1, 0.01, 1);
    const dashCount = 44;
    const dashes = new THREE.InstancedMesh(box, markingMat, dashCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < dashCount; i++) {
      const z = AIRBASE.z - 1280 + i * 60;
      p.set(AIRBASE.x, y, z);
      s.set(0.75, 1, 27);
      m.compose(p, q, s);
      dashes.setMatrixAt(i, m);
    }
    marks.add(dashes);

    // Threshold piano keys, touchdown markers and aiming point.
    const barCount = 40;
    const bars = new THREE.InstancedMesh(box, markingMat, barCount);
    let bi = 0;
    for (const end of [-1, 1]) {
      const zBase = AIRBASE.z + end * (AIRBASE.runwayLength / 2 - 28);
      for (let i = 0; i < 8; i++) {
        const x = AIRBASE.x + (i - 3.5) * 5.4;
        p.set(x, y, zBase - end * 0);
        s.set(2.4, 1, 24);
        m.compose(p, q, s);
        bars.setMatrixAt(bi++, m);
      }
      for (let i = 0; i < 4; i++) {
        const z = AIRBASE.z + end * (280 + i * 50);
        for (const side of [-1, 1]) {
          p.set(AIRBASE.x + side * 7.5, y, z);
          s.set(3.4, 1, 22);
          m.compose(p, q, s);
          bars.setMatrixAt(bi++, m);
        }
      }
      for (let side = 0; side < 2; side++) {
        p.set(AIRBASE.x + (side === 0 ? -1 : 1) * 3.3, y,
          AIRBASE.z + end * 345);
        s.set(4.5, 1, 42);
        m.compose(p, q, s);
        bars.setMatrixAt(bi++, m);
      }
    }
    bars.count = bi;
    marks.add(bars);

    // Painted runway designators.
    const south = this._flatPlane(26, 34, AIRBASE.x, AIRBASE.z + 1210,
      y + 0.004,
      new THREE.MeshBasicMaterial({
        map: makeTextTexture('18'),
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }));
    south.rotation.y = 0;
    const north = this._flatPlane(26, 34, AIRBASE.x, AIRBASE.z - 1210,
      y + 0.004,
      new THREE.MeshBasicMaterial({
        map: makeTextTexture('36'),
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }));
    north.rotation.y = Math.PI;
    marks.add(south, north);
    this.group.add(marks);
  }

  _buildBuildings() {
    const hangarMat = new THREE.MeshStandardMaterial({
      color: '#8a8e8b', roughness: 0.78, metalness: 0.32,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: '#5d6665', roughness: 0.7, metalness: 0.38,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#151b1d', roughness: 0.55, metalness: 0.45,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#4f7688', roughness: 0.12, metalness: 0.55,
      transparent: true, opacity: 0.72,
    });

    const addHangar = (x, z, rot = 0) => {
      const g = new THREE.Group();
      g.position.set(x, this.y, z);
      g.rotation.y = rot;
      const shape = new THREE.Shape();
      shape.moveTo(-16, 0);
      shape.lineTo(-16, 8);
      shape.absarc(0, 8, 16, Math.PI, 0, true);
      shape.lineTo(16, 0);
      shape.lineTo(-16, 0);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 42, bevelEnabled: true, bevelSegments: 1,
        bevelSize: 0.6, bevelThickness: 0.6,
      });
      geo.translate(0, 0, -21);
      const shell = new THREE.Mesh(geo, hangarMat);
      shell.castShadow = true;
      shell.receiveShadow = true;
      g.add(shell);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(23, 13), darkMat);
      door.position.set(0, 6.5, 21.3);
      g.add(door);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(30, 0.6, 0.1),
        new THREE.MeshBasicMaterial({ color: '#c5b98a', toneMapped: false }));
      stripe.position.set(0, 2, 21.4);
      g.add(stripe);
      this.group.add(g);
    };

    addHangar(AIRBASE.x + 250, AIRBASE.z - 150, 0);
    addHangar(AIRBASE.x + 250, AIRBASE.z - 260, 0);

    // Control tower.
    const tower = new THREE.Group();
    tower.position.set(AIRBASE.x + 330, this.y, AIRBASE.z + 265);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(13, 24, 13),
      new THREE.MeshStandardMaterial({ color: '#a5a196', roughness: 0.9 }));
    body.position.y = 12;
    body.castShadow = true;
    tower.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(19, 6, 17), glassMat);
    cab.position.y = 27;
    cab.castShadow = true;
    tower.add(cab);
    const cabBase = new THREE.Mesh(
      new THREE.BoxGeometry(21, 1.2, 19),
      new THREE.MeshStandardMaterial({ color: '#545953', roughness: 0.8 }));
    cabBase.position.y = 23.8;
    tower.add(cabBase);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, 16, 6),
      roofMat);
    mast.position.y = 38;
    tower.add(mast);
    const radar = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#d9d7ca', roughness: 0.7 }));
    radar.rotation.x = Math.PI / 2;
    radar.position.y = 42;
    tower.add(radar);
    this.group.add(tower);

    // Fuel farm.
    const tankMat = new THREE.MeshStandardMaterial({
      color: '#c3c1b4', roughness: 0.58, metalness: 0.3,
    });
    for (let i = 0; i < 2; i++) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 10, 18), tankMat);
      tank.position.set(AIRBASE.x + 250 + i * 22, this.y + 5, AIRBASE.z + 180);
      tank.castShadow = true;
      tank.receiveShadow = true;
      this.group.add(tank);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(8, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        tankMat);
      cap.position.set(AIRBASE.x + 250 + i * 22, this.y + 10,
        AIRBASE.z + 180);
      this.group.add(cap);
    }

    // Small ground-support blocks and containers.
    const containerMats = ['#8e5b42', '#596650', '#6e7274'].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.25 }));
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.8, 2.6), containerMats[i % 3]);
      c.position.set(
        AIRBASE.x + 175 + (i % 3) * 7,
        this.y + 1.4,
        AIRBASE.z + 230 + Math.floor(i / 3) * 4);
      c.rotation.y = (i % 2) * 0.08;
      c.castShadow = true;
      c.receiveShadow = true;
      this.group.add(c);
    }

    // Ground support vehicles add scale to the apron.
    const olive = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#4d5138').convertSRGBToLinear(),
      roughness: 0.86, metalness: 0.16,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#22343a').convertSRGBToLinear(),
      roughness: 0.25, metalness: 0.45,
    });
    const addTruck = (x, z, rot = 0) => {
      const t = new THREE.Group();
      t.position.set(x, this.y, z);
      t.rotation.y = rot;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 7.8), olive);
      bed.position.y = 1.7;
      bed.castShadow = true;
      t.add(bed);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.0, 2.4), olive);
      cab.position.set(0, 1.7, 4.6);
      cab.castShadow = true;
      t.add(cab);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.1), glass);
      shield.position.set(0, 2.1, 5.82);
      t.add(shield);
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 0.95, 4.6, 12), 
        new THREE.MeshStandardMaterial({ color: '#b5b4a5', roughness: 0.55, metalness: 0.3 }));
      tank.rotation.x = Math.PI / 2;
      tank.position.set(0, 2.6, -0.8);
      t.add(tank);
      for (const [wx, wz] of [[-1.1, 3.8], [1.1, 3.8], [-1.1, -2.2], [1.1, -2.2]]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10),
          new THREE.MeshStandardMaterial({ color: '#171a18', roughness: 0.9 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.42, wz);
        t.add(wheel);
      }
      this.group.add(t);
    };
    addTruck(AIRBASE.x + 340, AIRBASE.z + 120, 0.25);
    addTruck(AIRBASE.x + 300, AIRBASE.z + 170, -0.1);
    // A small service tractor.
    const tractor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 2.8), olive);
    tractor.position.set(AIRBASE.x + 250, this.y + 0.55, AIRBASE.z + 70);
    tractor.castShadow = true;
    this.group.add(tractor);

    // Windsock.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#d0cbb9', roughness: 0.7 }));
    pole.position.set(AIRBASE.x - 44, this.y + 4, AIRBASE.z + 1190);
    this.group.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 5.5, 10, 1, true),
      new THREE.MeshStandardMaterial({
        color: '#d97b32', roughness: 0.9, side: THREE.DoubleSide,
      }));
    sock.rotation.z = Math.PI / 2;
    sock.rotation.y = 0.3;
    sock.position.set(AIRBASE.x - 41, this.y + 7.6, AIRBASE.z + 1190);
    this.group.add(sock);
  }

  _buildLights() {
    const geo = new THREE.SphereGeometry(0.3, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffe7b0', toneMapped: false });
    const count = 100;
    const lights = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    for (let i = 0; i < 46; i++) {
      for (let side = 0; side < 2; side++) {
        const z = AIRBASE.z - 1380 + i * 60;
        p.set(AIRBASE.x + (side ? 1 : -1) * 26, this.y + 0.25, z);
        m.compose(p, q, s);
        lights.setMatrixAt(i * 2 + side, m);
      }
    }
    for (let i = 0; i < 4; i++) {
      for (let side = 0; side < 2; side++) {
        p.set(AIRBASE.x + (side ? 1 : -1) * 9, this.y + 0.25,
          AIRBASE.z + 1415 + i * 30);
        m.compose(p, q, s);
        lights.setMatrixAt(92 + i * 2 + side, m);
      }
    }
    this.group.add(lights);

    const glide = new THREE.Group();
    const greenMat = new THREE.MeshBasicMaterial({ color: '#85ffad', toneMapped: false });
    for (let i = 0; i < 6; i++) {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), greenMat);
      light.position.set(AIRBASE.x, this.y + 0.5, AIRBASE.z + 1450 + i * 60);
      glide.add(light);
    }
    this.group.add(glide);
  }
}
