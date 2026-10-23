import * as THREE from '../../../vendor/three.module.js';
import { mulberry32 } from '../../world/noise.js';

/** Procedural panel-line / weathering albedo shared by the airframe. */
export function makePanelTexture(scheme = 'falcon') {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(scheme === 'falcon' ? 91321 : 41777);
  const isFalcon = scheme === 'falcon';

  const base = isFalcon ? '#6f787d' : '#7b8784';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Large soft camouflage / repair patches.
  for (let i = 0; i < 34; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const rw = 40 + rand() * 210;
    const rh = 18 + rand() * 95;
    const dark = rand() > (isFalcon ? 0.55 : 0.7);
    ctx.fillStyle = dark
      ? `rgba(${isFalcon ? '47,55,60' : '58,72,70'},${0.04 + rand() * 0.055})`
      : `rgba(205,208,204,${0.025 + rand() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Grime and rivet rows.
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(20,24,26,${0.02 + rand() * 0.055})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let y = 24; y < h; y += 16 + Math.floor(rand() * 6)) {
    for (let x = 12; x < w; x += 30) {
      ctx.fillStyle = 'rgba(225,228,224,.09)';
      ctx.beginPath();
      ctx.arc(x, y, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Panel seams.
  ctx.lineWidth = 1;
  for (let i = 0; i < 44; i++) {
    const horizontal = rand() > 0.4;
    ctx.strokeStyle = `rgba(15,19,21,${0.24 + rand() * 0.22})`;
    ctx.beginPath();
    if (horizontal) {
      const y = rand() * h;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + (rand() - 0.5) * 4);
    } else {
      const x = rand() * w;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (rand() - 0.5) * 4, h);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,232,230,.055)';
    ctx.beginPath();
    if (horizontal) {
      const y = rand() * h;
      ctx.moveTo(0, y + 1);
      ctx.lineTo(w, y + 1 + (rand() - 0.5) * 4);
    } else {
      const x = rand() * w;
      ctx.moveTo(x + 1, 0);
      ctx.lineTo(x + 1 + (rand() - 0.5) * 4, h);
    }
    ctx.stroke();
  }

  // A few access hatches.
  for (let i = 0; i < 14; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const rw = 12 + rand() * 38;
    const rh = 8 + rand() * 20;
    ctx.strokeStyle = 'rgba(20,24,26,.28)';
    ctx.strokeRect(x, y, rw, rh);
    ctx.fillStyle = 'rgba(30,34,36,.06)';
    ctx.fillRect(x + 1, y + 1, rw - 2, rh - 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeStarTexture(color = '#aeb3b1', red = false) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = 128;
  const cy = 128;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, 61, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  if (red) {
    ctx.fillStyle = '#c3352f';
  } else {
    ctx.fillStyle = color;
  }
  const drawStar = (rOuter, rInner, rot = -Math.PI / 2) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = rot + i * Math.PI / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  drawStar(54, 22);
  // Wing bars.
  ctx.fillRect(cx - 95, cy - 10, 36, 20);
  ctx.fillRect(cx + 59, cy - 10, 36, 20);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

function makeTextDecal(text, { font = '700 110px Bahnschrift, Arial', color = '#777f83' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

export function createJetMaterials(scheme = 'falcon') {
  const panel = makePanelTexture(scheme);
  const isFalcon = scheme === 'falcon';
  const linear = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const body = new THREE.MeshStandardMaterial({
    map: panel,
    color: linear('#c2c6c7'),
    roughness: 0.6,
    metalness: 0.2,
    envMapIntensity: 0.8,
  });
  const bodyLight = body.clone();
  bodyLight.color.set(linear('#d5d8d6'));
  const dark = new THREE.MeshStandardMaterial({
    color: linear(isFalcon ? '#252b2e' : '#2d3634'),
    roughness: 0.72,
    metalness: 0.26,
  });
  const radome = new THREE.MeshStandardMaterial({
    color: linear(isFalcon ? '#41484b' : '#4c5552'),
    roughness: 0.68,
    metalness: 0.18,
  });
  const metal = new THREE.MeshStandardMaterial({
    color: linear('#4c4f50'),
    roughness: 0.38,
    metalness: 0.82,
    envMapIntensity: 1.1,
  });
  const nozzleMetal = new THREE.MeshStandardMaterial({
    color: linear('#2a2520'),
    roughness: 0.46,
    metalness: 0.9,
    side: THREE.DoubleSide,
  });
  const nozzleInner = new THREE.MeshStandardMaterial({
    color: linear('#0b0907'),
    emissive: '#ff5a13',
    emissiveIntensity: 0,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const intakeDuct = new THREE.MeshStandardMaterial({
    color: linear('#121719'),
    roughness: 0.88,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const intakeVane = new THREE.MeshStandardMaterial({
    color: linear('#4a5454'),
    emissive: linear('#1a2323'),
    emissiveIntensity: 0.7,
    roughness: 0.5,
    metalness: 0.58,
    side: THREE.DoubleSide,
  });
  const nozzlePetal = new THREE.MeshStandardMaterial({
    color: linear('#292724'),
    emissive: linear('#100c09'),
    emissiveIntensity: 0.25,
    roughness: 0.44,
    metalness: 0.88,
    side: THREE.DoubleSide,
  });
  const intakeDetail = new THREE.MeshBasicMaterial({
    color: '#0b1010',
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const fanBlade = new THREE.MeshBasicMaterial({
    color: '#1b2222',
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: linear('#d9f2f7'),
    metalness: 0.02,
    roughness: 0.008,
    transparent: true,
    opacity: 0.10,
    clearcoat: 1,
    clearcoatRoughness: 0.006,
    reflectivity: 1,
    ior: 1.52,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const tire = new THREE.MeshStandardMaterial({
    color: linear('#141617'),
    roughness: 0.92,
    metalness: 0.02,
  });
  const gear = new THREE.MeshStandardMaterial({
    color: linear('#8c9292'),
    roughness: 0.38,
    metalness: 0.68,
  });
  const cockpit = new THREE.MeshStandardMaterial({
    color: linear('#1d2326'),
    roughness: 0.78,
    metalness: 0.12,
  });
  const screen = new THREE.MeshStandardMaterial({
    color: linear('#08110d'),
    emissive: linear('#225c44'),
    emissiveIntensity: 0.5,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
  });
  const missileBody = new THREE.MeshStandardMaterial({
    color: linear('#c8c7bc'),
    roughness: 0.56,
    metalness: 0.16,
  });
  const missileSeeker = new THREE.MeshStandardMaterial({
    color: linear('#202527'),
    roughness: 0.32,
    metalness: 0.55,
  });
  const warningRed = new THREE.MeshBasicMaterial({
    color: '#ff2b1a', toneMapped: false,
  });
  const warningGreen = new THREE.MeshBasicMaterial({
    color: '#42ff7a', toneMapped: false,
  });
  const warningWhite = new THREE.MeshBasicMaterial({
    color: '#fff7dd', toneMapped: false,
  });
  const insignia = new THREE.MeshBasicMaterial({
    map: makeStarTexture(isFalcon ? '#8f979a' : '#d8d3c3', !isFalcon),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    toneMapped: false,
  });
  const serial = new THREE.MeshBasicMaterial({
    map: makeTextDecal(isFalcon ? 'AF 78-0104' : '09 RED',
      { color: isFalcon ? '#596164' : '#b9c0b8' }),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    toneMapped: false,
  });
  return {
    panel, body, bodyLight, dark, radome, metal, nozzleMetal, nozzleInner,
    intakeDuct, intakeVane, intakeDetail, fanBlade, nozzlePetal,
    glass, tire, gear, cockpit, screen, missileBody, missileSeeker,
    warningRed, warningGreen, warningWhite, insignia, serial,
  };
}

export function makeAfterburnerMaterial(core = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uCore: { value: core ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform float uIntensity;
      uniform float uCore;
      varying vec2 vUv;
      varying vec3 vPos;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      void main() {
        float along = smoothstep(0.0, 0.09, vUv.y) * smoothstep(1.0, 0.56, vUv.y);
        float flicker = 0.72 + 0.28 * sin(uTime * 43.0 + vUv.y * 21.0) *
          sin(uTime * 17.0 - vUv.x * 8.0);
        float pulse = 0.8 + 0.2 * hash(vec2(floor(uTime * 30.0), floor(vUv.y * 9.0)));
        vec3 hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.82, 0.35), uCore);
        vec3 cool = vec3(0.25, 0.48, 1.0);
        vec3 color = mix(cool, hot, smoothstep(0.0, 0.55, vUv.x) * 0.7 + uCore * 0.3);
        float alpha = along * uIntensity * flicker * pulse *
          (0.3 + uCore * 0.22);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
}
