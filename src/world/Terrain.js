import * as THREE from '../../vendor/three.module.js';
import {
  MAP_SIZE, AIRBASE, terrainHeight, terrainSlope, isOnAirbase,
} from './terrainData.js';
import { Noise2D, mulberry32 } from './noise.js';

const detailSeed = new Noise2D(88421);
const tintSeed = new Noise2D(4412);

const PALETTE = {
  grass: new THREE.Color('#485634'),
  dryGrass: new THREE.Color('#736d4f'),
  forest: new THREE.Color('#263b26'),
  rock: new THREE.Color('#6d675d'),
  darkRock: new THREE.Color('#433f39'),
  snow: new THREE.Color('#d4dadb'),
  sand: new THREE.Color('#b09d79'),
  wetSand: new THREE.Color('#887d66'),
  base: new THREE.Color('#55563d'),
};

for (const c of Object.values(PALETTE)) c.convertSRGBToLinear();

/** Tileable, low-contrast ground detail broken up by two noise octaves. */
function makeGroundDetailTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const noise = new Noise2D(7781);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const n = noise.fbm(nx * 9, ny * 9, 5) * 0.5 + 0.5;
      const m = noise.fbm(nx * 31 + 9, ny * 31 - 3, 3) * 0.5 + 0.5;
      const fine = noise.value(nx * 97, ny * 97) * 0.5 + 0.5;
      const v = 0.56 + n * 0.32 + m * 0.16 + fine * 0.05;
      const warm = (n - 0.5) * 0.09;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, v * 255 * (1 + warm));
      img.data[i + 1] = Math.min(255, v * 252);
      img.data[i + 2] = Math.min(255, v * 244 * (1 - warm));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function chooseColor(x, z, height, slope, out) {
  const n = tintSeed.fbm(x * 0.0021, z * 0.0021, 3) * 0.5 + 0.5;
  const macro = detailSeed.fbm(x * 0.00055, z * 0.00055, 3) * 0.5 + 0.5;

  if (height < 2) {
    out.copy(PALETTE.wetSand).lerp(PALETTE.sand, THREE.MathUtils.clamp(height / 2, 0, 1));
  } else if (height < 24 + n * 12) {
    out.copy(PALETTE.sand);
  } else if (height > 1230 + macro * 240 && slope < 1.25) {
    out.copy(PALETTE.rock).lerp(PALETTE.snow,
      THREE.MathUtils.smoothstep(height, 1260, 1580));
  } else if (slope > 0.58 + n * 0.18 || height > 900) {
    out.copy(PALETTE.darkRock).lerp(PALETTE.rock,
      THREE.MathUtils.smoothstep(slope, 0.55, 1.2) * 0.6 + n * 0.35);
    out.lerp(PALETTE.forest, (1 - THREE.MathUtils.smoothstep(height, 800, 1250)) * 0.24);
  } else {
    const treeNoise = detailSeed.fbm(x * 0.0014 + 2, z * 0.0014 - 8, 3) * 0.5 + 0.5;
    const forest = Math.max(
      THREE.MathUtils.smoothstep(macro + n * 0.32, 0.42, 0.73),
      THREE.MathUtils.smoothstep(treeNoise, 0.48, 0.72) * 0.78);
    out.copy(PALETTE.grass).lerp(PALETTE.dryGrass, n * 0.42);
    out.lerp(PALETTE.forest, forest * 0.92);
    if (height < 60) out.lerp(PALETTE.sand, 0.25);
  }
  // Subtle low-frequency luminance variation keeps large surfaces alive.
  const shade = 0.86 + n * 0.22;
  out.multiplyScalar(shade);
}

export class Terrain {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.mesh = this._buildMesh();
    this.group.add(this.mesh);
    this.trees = this._buildTrees();
    this.group.add(this.trees);
  }

  _buildMesh() {
    const segments = 576;
    const geometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const count = position.count;
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const h = terrainHeight(x, z);
      position.setY(i, h);
      const slope = terrainSlope(x, z, 18);
      chooseColor(x, z, h, slope, color);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      uv.setXY(i, uv.getX(i) * 34, uv.getY(i) * 34);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: makeGroundDetailTexture(512),
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.3,
      dithering: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain-mesh';
    return mesh;
  }

  _buildTrees() {
    const group = new THREE.Group();
    group.name = 'forest';
    const rand = mulberry32(523901);
    const positions = [];
    const maxTrees = 22000;
    for (let attempt = 0; attempt < 230000 && positions.length < maxTrees; attempt++) {
      const x = (rand() - 0.5) * MAP_SIZE * 0.94;
      const z = (rand() - 0.5) * MAP_SIZE * 0.94;
      const h = terrainHeight(x, z);
      if (h < 12 || h > 1180) continue;
      if (isOnAirbase(x, z, 260)) continue;
      const slope = terrainSlope(x, z, 16);
      if (slope > 0.82) continue;
      const density = detailSeed.fbm(x * 0.0014 + 2, z * 0.0014 - 8, 3) * 0.5 + 0.5;
      if (rand() > THREE.MathUtils.smoothstep(density, 0.22, 0.7) * 0.98) continue;
      positions.push({ x, z, h, s: 0.65 + rand() * 1.65, rot: rand() * Math.PI * 2 });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.13, 0.22, 2.4, 5);
    trunkGeo.translate(0, 1.2, 0);
    const lowerGeo = new THREE.ConeGeometry(1.55, 5.8, 7);
    lowerGeo.translate(0, 5.0, 0);
    const upperGeo = new THREE.ConeGeometry(1.0, 4.0, 7);
    upperGeo.translate(0, 7.6, 0);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#493b2c').convertSRGBToLinear(), roughness: 1,
    });
    const pineMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#2f4b2a').convertSRGBToLinear(), roughness: 0.96,
    });
    const topMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3b5a33').convertSRGBToLinear(), roughness: 0.96,
    });
    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
    const lower = new THREE.InstancedMesh(lowerGeo, pineMat, positions.length);
    const upper = new THREE.InstancedMesh(upperGeo, topMat, positions.length);
    const matrix = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const pos = new THREE.Vector3();
    positions.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      scl.setScalar(p.s);
      pos.set(p.x, p.h - 0.4, p.z);
      matrix.compose(pos, q, scl);
      trunk.setMatrixAt(i, matrix);
      lower.setMatrixAt(i, matrix);
      upper.setMatrixAt(i, matrix);
    });
    trunk.instanceMatrix.needsUpdate = true;
    lower.instanceMatrix.needsUpdate = true;
    upper.instanceMatrix.needsUpdate = true;
    trunk.castShadow = false;
    lower.castShadow = false;
    upper.castShadow = false;
    group.add(trunk, lower, upper);
    return group;
  }
}
