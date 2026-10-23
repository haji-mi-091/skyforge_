import * as THREE from '../../vendor/three.module.js';

// A bounded emissive gas volume, attached to the augmentor rather than a trail
// of particles. Units stay in the same metre-based space as the moving nozzle.
// This is the one afterburner shader for every aircraft (F-16, J-16, J-10C):
// colour follows exhaustBlueMix (blue as the afterburner lights, orange at
// full afterburner) and the Mach rings carry an animated noise texture.

// Blue while the afterburner is lighting, orange once it is fully lit.
export function exhaustBlueMix(afterburner) {
  return 1 - THREE.MathUtils.smoothstep(afterburner, .08, .72);
}

let noiseTexture = null;
// Tileable value noise, two independent channels (R: Mach rings, G: gas).
function exhaustNoiseTexture() {
  if (noiseTexture) return noiseTexture;
  const size = 128, data = new Uint8Array(size * size * 4);
  const lattice = (n, seed) => Array.from({ length: n * n }, (_, i) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x);
  });
  const fbm = (seed) => {
    const octaves = [[4, 1], [8, .5], [16, .25], [32, .125]].map(([n, a], k) => ({ n, a, g: lattice(n, seed * 10 + k) }));
    const smooth = (t) => t * t * (3 - 2 * t);
    return (u, v) => {
      let sum = 0, weight = 0;
      for (const o of octaves) {
        const x = u * o.n, y = v * o.n, x0 = Math.floor(x), y0 = Math.floor(y);
        const at = (i, j) => o.g[((j % o.n + o.n) % o.n) * o.n + ((i % o.n + o.n) % o.n)];
        const fx = smooth(x - x0), fy = smooth(y - y0);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
        sum += (top + (bottom - top) * fy) * o.a; weight += o.a;
      }
      return sum / weight;
    };
  };
  const rings = fbm(1), gas = fbm(2);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = (j * size + i) * 4;
    data[k] = Math.round(rings(i / size, j / size) * 255);
    data[k + 1] = Math.round(gas(i / size, j / size) * 255);
    data[k + 3] = 255;
  }
  noiseTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noiseTexture.wrapS = noiseTexture.wrapT = THREE.RepeatWrapping;
  // No mipmaps: the texture is sampled inside the ray-march loop.
  noiseTexture.magFilter = noiseTexture.minFilter = THREE.LinearFilter;
  noiseTexture.generateMipmaps = false;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}
const vertexShader = `
  uniform float uRadius, uStart, uExit, uLength;
  varying vec3 vPoint;
  void main() {
    vPoint = vec3(position.xy * uRadius * 2.12,
      mix(uStart, uExit + uLength, position.z + .5));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPoint, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 uEye;
  uniform mat4 uClipFromLocal;
  uniform float uTime, uPower, uRadius, uBarrelRadius, uStart, uExit, uLength, uCell, uBlueMix;
  uniform sampler2D uNoise;
  varying vec3 vPoint;
  const float PI = 3.14159265359;

  // Gas inside the metal nozzle is visible only through the open exit. Testing
  // the throat as well as the lip prevents orange light bleeding through petals.
  float aperture(vec3 p) {
    if (p.z >= uExit) return 1.0;
    if (uEye.z <= uExit) return 0.0;
    vec3 ray = uEye - p;
    vec2 lip = p.xy + ray.xy * ((uExit - p.z) / ray.z);
    if (length(lip) > uRadius * .974) return 0.0;
    if (p.z < .025) {
      vec2 throat = p.xy + ray.xy * ((.025 - p.z) / ray.z);
      if (length(throat) > uBarrelRadius * .76) return 0.0;
    }
    return 1.0;
  }

  void main() {
    vec3 rd = normalize(vPoint - uEye);
    vec3 safeRay = sign(rd + vec3(1.e-8)) * max(abs(rd), vec3(1.e-6));
    vec3 lo = vec3(-uRadius * 1.06, -uRadius * 1.06, uStart);
    vec3 hi = vec3( uRadius * 1.06,  uRadius * 1.06, uExit + uLength);
    vec3 a = (lo - uEye) / safeRay, b = (hi - uEye) / safeRay;
    vec3 nearP = min(a,b), farP = max(a,b);
    float nearT = max(0.0, max(nearP.x, max(nearP.y,nearP.z)));
    float farT = min(farP.x, min(farP.y,farP.z));
    if (farT <= nearT) discard;
    float stepSize = (farT - nearT) / 56.0;
    vec3 radiance = vec3(0.0);
    float depth = 0.0, firstT = farT;
    for (int i=0; i<56; i++) {
      float t = nearT + (float(i) + .5) * stepSize;
      vec3 p = uEye + rd * t;
      float z = p.z - uExit;
      float x = max(0.0,z) / uLength;
      // Mach rings breathe slightly with the engine; their spacing stays fixed on average.
      float cellPhase = z / (uCell * (1.0 + .03*sin(uTime*7.3)));
      // Stationary compression cells; only fine gas structure convects aft.
      float wave = cos(2.0 * PI * (cellPhase - .22));
      float cellFade = exp(-2.4*x);
      float r = uRadius * (.91 + .035*wave*cellFade);
      r *= 1.0 - .72 * pow(x,1.6);
      if (z < 0.0) {
        r = mix(uBarrelRadius*.70,uRadius*.90,
          clamp((p.z-.025)/(uExit-.025),0.0,1.0));
      }
      float travel = uTime * 12.0;
      float eddy = sin(p.z*29.0-travel*3.1+p.x*19.0)
        * sin(p.y*23.0+p.z*17.0-travel*1.7);
      float wisps = sin(p.x*37.0+p.y*29.0-p.z*41.0+travel*5.0);
      r *= 1.0 + (.010+.035*x) * eddy;
      float radial = length(p.xy) / max(r,.001);
      float envelope = 1.0-smoothstep(.68,1.0,radial);
      float endFade = 1.0-smoothstep(.60,1.0,x);
      float rootFade = smoothstep(uStart,uStart+.22,p.z);
      float compress = pow(max(0.0,wave),12.0) * cellFade;
      // The oblique shock envelope converges toward the axis. Side views show
      // diamonds; rear views see their circular sections, without solid rings.
      float shockR = .08+.72*abs(sin(PI*(cellPhase-.22)));
      float shock = exp(-pow((radial-shockR)/.095,2.0)) * cellFade;
      // Animated texture on the Mach rings and gas: the ring positions stay
      // put, their brightness is broken up by noise that convects aft.
      float ang = atan(p.y, p.x) * .15915494 + .5;
      float ringTex = texture2D(uNoise, vec2(ang*3.0, cellPhase*.5 - uTime*1.7)).r;
      float gasTex = texture2D(uNoise, vec2(ang*2.0 + p.z*.07, p.z*.35 - uTime*2.6)).g;
      compress *= .55 + .9*ringTex;
      shock *= .50 + 1.0*ringTex;
      float gas = (.12+.035*eddy+.012*wisps) * envelope * (.70 + .60*gasTex);
      gas += (1.9*compress*exp(-radial*radial*4.5)+.52*shock*envelope)
        * smoothstep(-.02,.12,z);
      gas *= rootFade * endFade * aperture(p);
      float d = max(0.0,gas) * stepSize / uRadius;
      if (d > .0004 && firstT == farT) firstT = t;
      vec3 orange = vec3(1.0,.16,.012);
      vec3 hot = vec3(1.0,.39,.095);
      vec3 color = mix(orange,hot,clamp(compress*.65+shock*.18,0.0,.75));
      color = mix(color,mix(vec3(.035,.19,1.0),vec3(.28,.55,1.0),clamp(compress*.65+shock*.18,0.0,.75)),uBlueMix);
      float transmission = exp(-depth * .65);
      radiance += color * d * transmission;
      depth += d;
    }
    float energy = uPower * (1.0 + .022*sin(uTime*37.0) + .012*sin(uTime*61.0));
    if (depth*energy < .002) discard;
    // The proxy box never writes a solid rectangular silhouette. The first
    // luminous sample supplies the depth test against the aircraft geometry.
    vec4 projected = uClipFromLocal * vec4(uEye+rd*firstT,1.0);
    gl_FragDepthEXT = projected.z/projected.w * .5 + .5;
    gl_FragColor = vec4(radiance * energy * 2.1,
      smoothstep(0.0,.08,depth*energy));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

export function createF100Exhaust() {
  const group = new THREE.Group();
  group.name = 'afterburner shock-cell gas volume';
  const uniforms = {
    uEye: { value: new THREE.Vector3() },
    uClipFromLocal: { value: new THREE.Matrix4() },
    uTime: { value: 0 }, uPower: { value: 0 },
    uRadius: { value: .4 }, uBarrelRadius: { value: .45 },
    uStart: { value: -1.15 }, uExit: { value: .92 },
    uLength: { value: 3 }, uCell: { value: .75 },
    uBlueMix: { value: 0 },
    uNoise: { value: exhaustNoiseTexture() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, toneMapped: false,
    side: THREE.BackSide, extensions: { fragDepth: true },
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
  mesh.name = 'bounded ray-marched exhaust (no particles)';
  // The vertex shader expands the unit proxy to the live nozzle dimensions.
  mesh.frustumCulled = false;
  const inverse = new THREE.Matrix4();
  mesh.onBeforeRender = (_renderer,_scene,camera) => {
    inverse.copy(mesh.matrixWorld).invert();
    uniforms.uEye.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);
    uniforms.uClipFromLocal.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  };
  group.add(mesh);
  group.visible = false;
  group.userData.exhaust = { uniforms, mesh, power: 0, length: 0, cellSpacing: 0 };
  return group;
}

export function updateF100Exhaust(group,nozzle,flight,time) {
  const rig = group.userData.exhaust, u = rig.uniforms;
  const ab = THREE.MathUtils.clamp(flight.afterburner || 0,0,1);
  // No luminous external flame at dry power; the recessed hot face remains.
  group.visible = ab > .001;
  const pressure = THREE.MathUtils.clamp((flight.air?.pressure ?? 101325)/101325,.12,1.15);
  const expansion = Math.pow(1/pressure,.13);
  const diameter = nozzle.exitRadius*2;
  rig.power = THREE.MathUtils.smoothstep(ab,0,.20) * (.42+.58*ab);
  rig.length = diameter*(2.2+3.0*ab)*expansion;
  rig.cellSpacing = diameter*(.82+.20*ab)*expansion;
  rig.blueMix = exhaustBlueMix(ab);
  u.uBlueMix.value = rig.blueMix;
  u.uTime.value = time;
  u.uPower.value = rig.power;
  u.uRadius.value = nozzle.exitRadius;
  u.uBarrelRadius.value = nozzle.radius;
  u.uStart.value = -1.14;
  u.uExit.value = nozzle.exitZ;
  u.uLength.value = rig.length;
  u.uCell.value = rig.cellSpacing;
}
