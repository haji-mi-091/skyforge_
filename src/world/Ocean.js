import * as THREE from '../../vendor/three.module.js';

const VERT = /* glsl */`
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    vViewDirection = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform vec3 uDeepColor;
  uniform vec3 uHorizonColor;
  varying vec3 vWorldPosition;
  varying vec3 vViewDirection;

  vec2 waveGradient(vec2 p, float t, float detail) {
    vec2 grad = vec2(0.0);
    // Swell, wind sea and fine chop with analytic derivatives.
    vec2 d1 = normalize(vec2(0.92, 0.38));
    vec2 d2 = normalize(vec2(-0.31, 0.95));
    vec2 d3 = normalize(vec2(0.68, -0.73));
    vec2 d4 = normalize(vec2(-0.96, -0.26));
    grad += d1 * cos(dot(p, d1) * 0.018 + t * 0.38) * 0.018 * 0.30;
    grad += d2 * cos(dot(p, d2) * 0.043 + t * 0.61) * 0.043 * 0.16;
    grad += d3 * cos(dot(p, d3) * 0.115 + t * 1.04) * 0.115 * 0.06 * detail;
    grad += d4 * cos(dot(p, d4) * 0.34 + t * 1.71) * 0.34 * 0.018 * detail;
    // Low-frequency cross-swell breaks up regular wave interference.
    grad += vec2(cos(p.x * 0.006 + t * 0.16),
      sin(p.y * 0.007 - t * 0.13)) * 0.008;
    return grad;
  }

  void main() {
    vec3 toCamera = vViewDirection;
    float dist = length(toCamera);
    vec3 viewDir = toCamera / max(dist, 0.001);
    float detail = 1.0 - smoothstep(900.0, 6500.0, dist);
    vec2 grad = waveGradient(vWorldPosition.xz, uTime, detail);
    vec3 normal = normalize(vec3(-grad.x * 0.7, 1.0, -grad.y * 0.7));

    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 4.0);
    fresnel = mix(0.025, 0.72, fresnel);

    vec3 reflected = reflect(-viewDir, normal);
    float skyT = clamp(reflected.y * 0.75 + 0.22, 0.0, 1.0);
    vec3 skyColor = mix(uHorizonColor, vec3(0.018, 0.09, 0.22), skyT);
    vec3 waterColor = mix(uDeepColor, skyColor, clamp(fresnel, 0.0, 0.8));

    float sunDot = max(dot(reflected, uSunDirection), 0.0);
    // Widen and dim the specular lobe with distance. A 420-power glint sampled
    // across kilometres of waves aliases into a shimmering field of pixels; a
    // broader lobe stays stable at altitude while keeping the near-water sparkle.
    float glintSharpness = mix(420.0, 28.0, smoothstep(1000.0, 8000.0, dist));
    float glint = pow(sunDot, glintSharpness) * 3.2 +
      pow(sunDot, 22.0) * 0.05;
    glint *= 0.35 + detail * 0.65;
    glint *= mix(1.0, 0.12, smoothstep(2200.0, 10000.0, dist));
    waterColor += uSunColor * glint;

    // Subtle open-ocean tonal variation, kept low frequency.
    float variation = sin(vWorldPosition.x * 0.00042 + vWorldPosition.z * 0.00037) * 0.5 + 0.5;
    waterColor *= 0.9 + variation * 0.12;

    float fog = 1.0 - exp(-pow(dist * 0.000019, 2.0));
    // Streak toward the horizon hides the mesh edge and sells atmospheric haze.
    fog = clamp(fog + smoothstep(32000.0, 65000.0, dist) * 0.4, 0.0, 0.9);
    vec3 color = mix(waterColor, uFogColor, fog);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

export class Ocean {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'ocean';
    const geo = new THREE.PlaneGeometry(130000, 130000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: new THREE.Vector3(0.42, 0.52, -0.74).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.88, 0.70) },
        uFogColor: { value: new THREE.Color('#9aafbd').convertSRGBToLinear() },
        uDeepColor: { value: new THREE.Color('#042531').convertSRGBToLinear() },
        uHorizonColor: { value: new THREE.Color('#7f9db0').convertSRGBToLinear() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = 0;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = false;
    this.group.add(this.mesh);
    if (scene) scene.add(this.group);
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
  }
}
