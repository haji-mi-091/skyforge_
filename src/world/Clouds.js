import * as THREE from '../../vendor/three.module.js';
import { Noise2D, mulberry32 } from './noise.js';

const CLOUD_VERT = /* glsl */`
  precision highp float;
  attribute vec3 iCenter;
  attribute vec2 iScale;
  attribute float iRotation;
  attribute float iAlpha;
  attribute float iShade;
  uniform float uTime;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vShade;
  varying float vSun;
  varying float vDistance;

  void main() {
    // Gentle drift; different layers move at slightly different speeds.
    vec3 center = iCenter;
    center.x += uTime * (0.55 + iShade * 0.45);
    center.z += uTime * 0.14;

    vec3 toCam = cameraPosition - center;
    float dist = length(toCam);
    vec3 dir = toCam / max(dist, 0.001);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
    vec3 up = normalize(cross(dir, right));
    float c = cos(iRotation);
    float s = sin(iRotation);
    vec2 p = vec2(position.x * c - position.y * s,
                  position.x * s + position.y * c);
    vec3 world = center + right * p.x * iScale.x + up * p.y * iScale.y;

    vUv = uv;
    vAlpha = iAlpha;
    vShade = iShade;
    vDistance = dist;
    vec3 sunDir = normalize(vec3(0.42, 0.52, -0.74));
    vSun = clamp(dot(dir, sunDir), 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uMap;
  uniform vec3 uFogColor;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vShade;
  varying float vSun;
  varying float vDistance;

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float alpha = tex.a * vAlpha;
    if (alpha < 0.006) discard;

    float topLight = smoothstep(0.05, 0.95, vUv.y);
    vec3 shadowColor = vec3(0.53, 0.59, 0.68);
    vec3 litColor = vec3(1.00, 0.98, 0.93);
    vec3 color = mix(shadowColor, litColor, 0.34 + 0.66 * topLight * vShade);
    color += vec3(0.24, 0.17, 0.09) * vSun * (0.2 + topLight * 0.6);
    float silver = pow(1.0 - topLight, 2.0) * pow(vSun, 3.0);
    color += vec3(0.55, 0.44, 0.28) * silver * 0.6;

    // Match the scene's exponential fog without pulling in the whole chunk.
    float fog = 1.0 - exp(-pow(vDistance * 0.000019, 2.0));
    color = mix(color, uFogColor, clamp(fog, 0.0, 0.82));

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

function makeCloudTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rand = mulberry32(88271);
  // Build a soft cumulus mass from overlapping radial lobes. This reads much
  // better than a single hard fBm cut-out at billboard scale.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 15; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 0.58) * size * 0.26;
    const x = size * 0.5 + Math.cos(a) * r;
    const y = size * 0.5 + Math.sin(a) * r * 0.72;
    const radius = size * (0.12 + rand() * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,255,252,${0.2 + rand() * 0.18})`);
    g.addColorStop(0.46, `rgba(250,252,252,${0.12 + rand() * 0.09})`);
    g.addColorStop(1, 'rgba(245,250,252,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  const img = ctx.getImageData(0, 0, size, size);
  const noise = new Noise2D(66211);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * 2 - 1;
      const ny = y / size * 2 - 1;
      const r = Math.hypot(nx, ny * 1.18);
      const n = noise.fbm(x / size * 4.6 + 10, y / size * 4.6 - 3, 5) * 0.5 + 0.5;
      const n2 = noise.fbm(x / size * 11 - 4, y / size * 11 + 9, 3) * 0.5 + 0.5;
      const edge = 1 - THREE.MathUtils.smoothstep(r, 0.48, 1.0);
      const i = (y * size + x) * 4;
      const alpha = Math.min(1, Math.max(0,
        (img.data[i + 3] / 255) * (0.55 + n * 0.65) * edge));
      img.data[i] = 255;
      img.data[i + 1] = 253;
      img.data[i + 2] = 250;
      // Keep the very core dense but erode the outer fringe.
      img.data[i + 3] = Math.pow(alpha, 0.88) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export class CloudField {
  constructor({ fogColor = '#b9c8d4' } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'clouds';
    this.puffs = [];
    this._scatter();
    this._build(fogColor);
  }

  _addPuff(cx, cy, cz, sx, sy, rot, alpha, shade) {
    // Keep the player's opening view out of an opaque cloud bank. The hole is
    // soft and invisible at normal distances, but prevents spawn white-out.
    for (const [zx, zz, radius] of [[1300, 3000, 2300], [9200, 2200, 1800]]) {
      const d = Math.hypot(cx - zx, cz - zz);
      if (d < radius) {
        alpha *= THREE.MathUtils.smoothstep(d, radius * 0.45, radius);
      }
    }
    if (alpha < 0.012) return;
    this.puffs.push({ cx, cy, cz, sx, sy, rot, alpha, shade });
  }

  _scatter() {
    const rand = mulberry32(937211);
    const noise = new Noise2D(31171);

    // Cumulus clusters at typical dogfight altitudes.
    for (let c = 0; c < 30; c++) {
      const angle = rand() * Math.PI * 2;
      const radius = 2600 + Math.pow(rand(), 0.7) * 16000;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const cy = 1950 + rand() * 2300;
      const count = 10 + Math.floor(rand() * 10);
      const clusterX = 700 + rand() * 1200;
      const clusterZ = 600 + rand() * 1000;
      const clusterY = 190 + rand() * 380;
      for (let i = 0; i < count; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 0.55);
        const px = cx + Math.cos(a) * clusterX * r;
        const pz = cz + Math.sin(a) * clusterZ * r;
        const py = cy + (rand() - 0.4) * clusterY;
        const base = 280 + rand() * 480;
        this._addPuff(px, py, pz,
          base * (1.3 + rand() * 0.9), base * (0.78 + rand() * 0.55),
          rand() * Math.PI * 2, 0.16 + rand() * 0.22,
          0.72 + rand() * 0.28);
      }
    }

    // High, stretched cirrus.
    for (let c = 0; c < 12; c++) {
      const angle = rand() * Math.PI * 2;
      const radius = 5000 + rand() * 21000;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const cy = 6300 + rand() * 2300;
      const count = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < count; i++) {
        this._addPuff(
          cx + (rand() - 0.5) * 5000,
          cy + (rand() - 0.5) * 300,
          cz + (rand() - 0.5) * 2800,
          1400 + rand() * 2200, 260 + rand() * 230,
          rand() * Math.PI, 0.05 + rand() * 0.07, 0.6);
      }
    }

    // Distant bank on the horizon.
    for (let c = 0; c < 22; c++) {
      const angle = rand() * Math.PI * 2;
      const radius = 22000 + rand() * 18000;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      const cy = 1200 + rand() * 1800;
      this._addPuff(cx, cy, cz,
        3000 + rand() * 4000, 700 + rand() * 700,
        rand() * Math.PI, 0.24 + rand() * 0.2, 0.8);
    }
  }

  _build(fogColor) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    const count = this.puffs.length;
    const centers = new Float32Array(count * 3);
    const scales = new Float32Array(count * 2);
    const rotations = new Float32Array(count);
    const alphas = new Float32Array(count);
    const shades = new Float32Array(count);
    this.puffs.forEach((p, i) => {
      centers[i * 3] = p.cx;
      centers[i * 3 + 1] = p.cy;
      centers[i * 3 + 2] = p.cz;
      scales[i * 2] = p.sx;
      scales[i * 2 + 1] = p.sy;
      rotations[i] = p.rot;
      alphas[i] = p.alpha;
      shades[i] = p.shade;
    });
    geo.setAttribute('iCenter', new THREE.InstancedBufferAttribute(centers, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(scales, 2));
    geo.setAttribute('iRotation', new THREE.InstancedBufferAttribute(rotations, 1));
    geo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(alphas, 1));
    geo.setAttribute('iShade', new THREE.InstancedBufferAttribute(shades, 1));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60000);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: makeCloudTexture(512) },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(fogColor) },
      },
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.material = material;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.group.add(this.mesh);
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}
