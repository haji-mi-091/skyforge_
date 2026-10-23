import * as THREE from '../../vendor/three.module.js';

const SKY_VERT = /* glsl */`
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  varying vec3 vDirection;

  void main() {
    vec3 dir = normalize(vDirection);
    float h = dir.y;
    float up = clamp(h, 0.0, 1.0);

    vec3 zenith = vec3(0.012, 0.055, 0.16);
    vec3 midSky = vec3(0.055, 0.19, 0.41);
    vec3 horizon = vec3(0.36, 0.47, 0.56);
    vec3 below = vec3(0.19, 0.25, 0.29);

    vec3 color = mix(horizon, midSky, smoothstep(0.0, 0.28, up));
    color = mix(color, zenith, smoothstep(0.22, 0.92, up));
    if (h < 0.0) color = mix(horizon, below, smoothstep(0.0, 0.12, -h));

    float mu = max(dot(dir, sunDirection), 0.0);
    // Warm forward scattering around the sun. Kept restrained so flying toward
    // the sun does not blow out the entire HUD.
    color += sunColor * pow(mu, 12.0) * 0.055;
    color += sunColor * pow(mu, 84.0) * 0.24;
    color += sunColor * pow(mu, 2200.0) * 1.3;
    float disk = smoothstep(0.99965, 0.99992, mu);
    color += sunColor * disk * 9.0;

    // Slight haze band on the sea horizon.
    color = mix(color, vec3(0.45, 0.52, 0.56), smoothstep(0.09, 0.0, abs(h)) * 0.28);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

/** Equirectangular sky used for image-based lighting (PMREM). */
function makeEnvironmentCanvas(sunDirection) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#0c3160');
  grad.addColorStop(0.32, '#3e77ae');
  grad.addColorStop(0.49, '#c6d5df');
  grad.addColorStop(0.53, '#9aa3a2');
  grad.addColorStop(0.75, '#3f4b45');
  grad.addColorStop(1.0, '#232b28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Sun at the correct equirectangular longitude/latitude.
  const lon = Math.atan2(sunDirection.x, -sunDirection.z);
  const lat = Math.asin(sunDirection.y);
  const sx = ((lon / (Math.PI * 2)) + 0.5) * 1024;
  const sy = (0.5 - lat / Math.PI) * 512;
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, 150);
  sun.addColorStop(0, 'rgba(255,252,235,1)');
  sun.addColorStop(0.025, 'rgba(255,244,205,1)');
  sun.addColorStop(0.1, 'rgba(255,220,160,.42)');
  sun.addColorStop(1, 'rgba(255,210,150,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(sx - 170, sy - 170, 340, 340);
  return canvas;
}

export class Sky {
  constructor(renderer, scene) {
    this.sunDirection = new THREE.Vector3(0.42, 0.52, -0.74).normalize();
    this.sunColor = new THREE.Color(1.0, 0.90, 0.76);
    this.group = new THREE.Group();
    this.group.name = 'sky';

    const material = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: this.sunDirection.clone() },
        sunColor: { value: this.sunColor.clone() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(62000, 48, 24), material);
    this.sphere.frustumCulled = false;
    this.sphere.renderOrder = -1000;
    this.group.add(this.sphere);

    this.light = new THREE.DirectionalLight(0xffe6c6, 1.8);
    this.light.position.copy(this.sunDirection).multiplyScalar(5000);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.left = -260;
    this.light.shadow.camera.right = 260;
    this.light.shadow.camera.top = 260;
    this.light.shadow.camera.bottom = -260;
    this.light.shadow.camera.near = 10;
    this.light.shadow.camera.far = 6000;
    this.light.shadow.bias = -0.00012;
    this.light.shadow.normalBias = 0.45;
    scene.add(this.light);
    scene.add(this.light.target);

    const hemi = new THREE.HemisphereLight(0x8fb8df, 0x3b3a2c, 0.4);
    scene.add(hemi);
    this.hemi = hemi;

    // Soft sky fill from the anti-sun side. Keeps shadowed airframe panels
    // readable without flattening the main sunlight direction.
    const fill = new THREE.DirectionalLight(0x93b8d8, 0.38);
    fill.position.copy(this.sunDirection).multiplyScalar(-4000);
    fill.position.y = 2200;
    scene.add(fill);
    this.fill = fill;

    this._installEnvironment(renderer, scene);
  }

  _installEnvironment(renderer, scene) {
    const tex = new THREE.CanvasTexture(makeEnvironmentCanvas(this.sunDirection));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(tex);
    scene.environment = env.texture;
    this.envRenderTarget = env;
    tex.dispose();
    pmrem.dispose();
  }

  update(cameraPosition, focusPosition) {
    this.sphere.position.copy(cameraPosition);
    // Shadow frustum follows the action. Snapping to 4 m reduces shimmer.
    const fx = Math.round(focusPosition.x / 4) * 4;
    const fz = Math.round(focusPosition.z / 4) * 4;
    this.light.target.position.set(fx, focusPosition.y, fz);
    this.light.position.set(
      fx + this.sunDirection.x * 3000,
      focusPosition.y + this.sunDirection.y * 3000,
      fz + this.sunDirection.z * 3000);
    this.light.target.updateMatrixWorld();
  }
}
