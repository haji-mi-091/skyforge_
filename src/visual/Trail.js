import * as THREE from '../../vendor/three.module.js';

const VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  varying vec2 vTrailUv;
  void main() {
    vAlpha = aAlpha;
    vTrailUv=uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying vec2 vTrailUv;
  uniform sampler2D uTrailMap;
  uniform vec4 uMapRect;
  uniform float uTextured;
  void main() {
    float a = vAlpha * uOpacity;
    if(uTextured>.5){
      vec2 uv=vec2(fract(vTrailUv.x)*.98+.01,.12+vTrailUv.y*.76);
      vec4 tex=texture2D(uTrailMap,uMapRect.xy+uv*uMapRect.zw);
      uv.x=fract(vTrailUv.x+.5)*.98+.01;
      vec4 other=texture2D(uTrailMap,uMapRect.xy+uv*uMapRect.zw);
      a*=mix(tex.a,other.a,.40);
    }
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

const _tangent = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _side = new THREE.Vector3();

/**
 * Camera-facing ribbon used for wingtip vapour, contrails and missile smoke.
 * A ribbon reads much better than GL lines at chase-camera distances.
 */
export class TrailRibbon {
  constructor(
    scene,
    {
      maxPoints = 90,
      width = 1.2,
      color = '#ffffff',
      opacity = 0.6,
      lifetime = 1.4,
      minSegment = 2.5,
      additive = false,
      fadePower = 1.3,
      map = null,
      mapRect = [0, 0, 1, 1],
      repeatLength = 12,
    } = {},
  ) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.width = width;
    this.baseOpacity = opacity;
    this.lifetime = lifetime;
    this.minSegment = minSegment;
    this.fadePower = fadePower;
    this.points = [];
    this.repeatLength = repeatLength;
    this.travel = 0;
    this.enabled = true;

    this.positions = new Float32Array(maxPoints * 2 * 3);
    this.alphas = new Float32Array(maxPoints * 2);
    this.uvs = new Float32Array(maxPoints * 4);
    const indices = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      'aAlpha',
      new THREE.BufferAttribute(this.alphas, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setIndex(indices);
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color).convertSRGBToLinear() },
        uOpacity: { value: opacity },
        uTrailMap: { value: map },
        uMapRect: { value: new THREE.Vector4(...mapRect) },
        uTextured: { value: map ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  push(position) {
    if (!this.enabled) return;
    const last = this.points[this.points.length - 1];
    if (
      last &&
      last.pos.distanceToSquared(position) < this.minSegment * this.minSegment
    ) {
      return;
    }
    if (last) this.travel += last.pos.distanceTo(position);
    this.points.push({ pos: position.clone(), age: 0, arc: this.travel });
    if (this.points.length > this.maxPoints) this.points.shift();
  }

  setOpacity(value) {
    this.material.uniforms.uOpacity.value = value;
  }

  clear() {
    this.points.length = 0;
    this.travel = 0;
    this.mesh.visible = false;
  }

  update(dt, camera) {
    for (const p of this.points) p.age += dt;
    while (this.points.length && this.points[0].age > this.lifetime) {
      this.points.shift();
    }
    const n = this.points.length;
    if (n < 2 || !camera) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const count = Math.min(n, this.maxPoints);
    for (let i = 0; i < count; i++) {
      const point = this.points[i].pos;
      const prev = this.points[Math.max(0, i - 1)].pos;
      const next = this.points[Math.min(count - 1, i + 1)].pos;
      _tangent.subVectors(next, prev);
      _toCamera.subVectors(camera.position, point);
      _side.crossVectors(_tangent, _toCamera);
      if (_side.lengthSq() < 1e-8) _side.set(0, 1, 0);
      _side.normalize();
      const lifeT = 1 - this.points[i].age / this.lifetime;
      const ageFactor = Math.pow(Math.max(0, lifeT), 0.65);
      const trailFactor = Math.pow((i + 1) / count, 0.7);
      const alpha = Math.pow(Math.max(0, lifeT), this.fadePower) * trailFactor;
      const width = this.width * (0.7 + (1 - trailFactor) * 1.7) * ageFactor;
      const idx = i * 6;
      this.positions[idx] = point.x - _side.x * width;
      this.positions[idx + 1] = point.y - _side.y * width;
      this.positions[idx + 2] = point.z - _side.z * width;
      this.positions[idx + 3] = point.x + _side.x * width;
      this.positions[idx + 4] = point.y + _side.y * width;
      this.positions[idx + 5] = point.z + _side.z * width;
      this.uvs[i * 4] = this.points[i].arc / this.repeatLength;
      this.uvs[i * 4 + 1] = 0;
      this.uvs[i * 4 + 2] = this.points[i].arc / this.repeatLength;
      this.uvs[i * 4 + 3] = 1;
      this.alphas[i * 2] = alpha;
      this.alphas[i * 2 + 1] = alpha;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.setDrawRange(0, (count - 1) * 6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
