import * as THREE from '../../vendor/three.module.js';
const linear = (h) => new THREE.Color(h).convertSRGBToLinear();
function surface(group, material, name, segments = 64) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((segments + 1) * 6), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const idx = [];
  for (let i = 0; i < segments; i++)
    idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const uv = [];
  for (let i = 0; i <= segments; i++) uv.push(i / segments, 0, i / segments, 1);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  group.add(mesh);
  return mesh;
}
function frustum(mesh, r0, r1, z0, z1, segments = 64) {
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    p.setXYZ(i * 2, Math.cos(a) * r0, Math.sin(a) * r0, z0);
    p.setXYZ(i * 2 + 1, Math.cos(a) * r1, Math.sin(a) * r1, z1);
  }
  p.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}
function curvedFlap(r0, r1, length, bow, half, thickness) {
  const positions = [], uv = [], indices = [], rows = 12, columns = 4;
  const depth = Math.sqrt(length ** 2 - (r1 - r0) ** 2);
  // Reference-photo proportions: bowed feathers, near-constant width and a
  // thin closed edge. These are visual modelling values, not engine data.
  for (let layer = 0; layer < 2; layer++) {
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, r = (r1 - r0) * t + 4 * bow * t * (1 - t);
      for (let k = 0; k <= columns; k++) {
        const u = k / columns, a = (u * 2 - 1) * half;
        const width = r0 * (1 - 0.04 * t);
        const overlap = 3 * thickness * (u - 0.5) * Math.sin(t * Math.PI / 2);
        positions.push(r - width * (1 - Math.cos(a)) + overlap - layer * thickness,
          width * Math.sin(a), depth * t);
        uv.push(u, t);
      }
    }
  }
  const stride = columns + 1, face = (rows + 1) * stride;
  for (let j = 0; j < rows; j++) {
    for (let k = 0; k < columns; k++) {
      const a = j * stride + k, b = a + 1, c = a + stride, d = c + 1;
      indices.push(a, b, c, b, d, c,
        a + face, c + face, b + face, b + face, c + face, d + face);
    }
  }
  const rim = [];
  for (let k = 0; k <= columns; k++) rim.push(k);
  for (let j = 1; j <= rows; j++) rim.push(j * stride + columns);
  for (let k = columns - 1; k >= 0; k--) rim.push(rows * stride + k);
  for (let j = rows - 1; j > 0; j--) rim.push(j * stride);
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i], b = rim[(i + 1) % rim.length];
    indices.push(a, a + face, b, b, a + face, b + face);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
export function createF100Nozzle(radius) {
  const group = new THREE.Group();
  group.name = 'F100-PW-229 variable nozzle';
  const casingMat = new THREE.MeshStandardMaterial({
      color: linear(0x424845),
      metalness: 0.64,
      roughness: 0.56,
      side: THREE.DoubleSide,
    }),
    petalMat = new THREE.MeshStandardMaterial({
      color: linear(0x8b8e84),
      metalness: 0.51,
      roughness: 0.57,
      side: THREE.DoubleSide,
    }),
    linerMat = new THREE.MeshStandardMaterial({
      color: linear(0x292e2b),
      roughness: 0.81,
      metalness: 0.13,
      side: THREE.DoubleSide,
    });
  // Feather overlap, rubbed tracks and heat staining follow each moving flap.
  petalMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vFeatherUv;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFeatherUv=uv;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vFeatherUv;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float edge=smoothstep(.0,.035,vFeatherUv.x)*(1.0-smoothstep(.86,.97,vFeatherUv.x));
      float band=smoothstep(.12,.18,vFeatherUv.y)*(1.0-smoothstep(.86,1.0,vFeatherUv.y));
      float brush=.96+.04*sin(vFeatherUv.x*430.0+sin(vFeatherUv.y*37.0));
      diffuseColor.rgb*=mix(.36,1.0,edge)*mix(.58,1.0,band)*brush;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.70,.76,.84),smoothstep(.62,.95,vFeatherUv.y));`,
      );
  };
  petalMat.customProgramCacheKey = () => 'F100-feather-overlap-v1';
  const shell = surface(group, casingMat, 'fixed nozzle casing');
  frustum(shell, radius * 0.98, radius * 1.02, -0.12, 0.2);
  for (const z of [-0.08, 0.16]) {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.018, 0.012, 8, 80),
      casingMat,
    );
    band.position.z = z;
    band.name = 'nozzle fixed attachment band';
    group.add(band);
  }
  const inner = new THREE.Group();
  inner.name = 'variable divergent inner flaps';
  group.add(inner);
  const petals = [];
  const count = 15;
  const r0 = radius * 1.02, r1 = radius * 0.67, length = 0.72;
  const depth = Math.sqrt(length ** 2 - (r1 - r0) ** 2);
  const outerGeometry = curvedFlap(r0, r1, length, radius * 0.10,
    Math.PI / count * 1.025, 0.006);
  const innerRoot = radius * 0.76, innerTip = r1 * 0.974;
  const innerDepth = 0.2 + depth - 0.008 - 0.025;
  const innerLength = Math.hypot(innerTip - innerRoot, innerDepth);
  const innerGeometry = curvedFlap(innerRoot, innerTip, innerLength,
    radius * 0.025, Math.PI / count * 1.34, 0.004);
  for (let i = 0; i < count; i++) {
    const theta = ((i + 0.5) * Math.PI * 2) / count;
    for (const external of [true, false]) {
      const root = external ? r0 : innerRoot;
      const tip = external ? r1 : innerTip;
      const hinge = new THREE.Vector3(root * Math.cos(theta),
        root * Math.sin(theta), external ? 0.2 : 0.025);
      const mesh = new THREE.Mesh(external ? outerGeometry : innerGeometry,
        external ? petalMat : linerMat);
      mesh.name = `${external ? 'external' : 'internal'} nozzle flap ${i + 1}`;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeRotationZ(theta).setPosition(hinge);
      mesh.userData.flap = {
        hinge,
        axis: new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0),
        base: mesh.matrix.clone(),
        inverseHinge: new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z),
        root,
        length: external ? length : innerLength,
        restAngle: Math.atan2(tip - root, external ? depth : innerDepth),
      };
      (external ? group : inner).add(mesh);
      if (external) petals.push(mesh);
    }
  }
  const barrel = surface(group, linerMat, 'recessed augmentor liner');
  frustum(barrel, radius * 0.8, radius * 0.81, -1.3, 0.0);
  const black = new THREE.MeshBasicMaterial({
    color: 0x020303,
    side: THREE.DoubleSide,
  });
  const back = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.81, 64),
    black,
  );
  back.position.z = -1.29;
  group.add(back);
  const hotMat = new THREE.MeshBasicMaterial({
    color: linear(0xff8733),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const hot = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.74, 64),
    hotMat,
  );
  hot.position.z = -1.22;
  group.add(hot);
  for (const [r, z] of [
    [0.7, -0.95],
    [0.47, -0.98],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * r, 0.014, 8, 64),
      casingMat,
    );
    ring.position.z = z;
    group.add(ring);
  }
  group.userData.nozzle = {
    radius,
    petals,
    inner,
    hot,
    opening: 0,
    exitRadius: r1,
    exitZ: 0.2 + depth,
    segments: count,
    rotation: new THREE.Matrix4(),
  };
  updateF100Nozzle(group, { engineSpool: 0, afterburner: 0 }, 0);
  return group;
}
export function nozzleTarget(flight) {
  // Keep the dry nozzle contracted; augmentation opens it continuously.
  return THREE.MathUtils.smoothstep(flight.afterburner || 0, 0, 1);
}
export function updateF100Nozzle(group, flight, dt = 1 / 60) {
  const rig = group?.userData.nozzle;
  if (!rig) return;
  const target = nozzleTarget(flight);
  rig.opening = THREE.MathUtils.lerp(
    rig.opening,
    target,
    1 - Math.exp(-6 * Math.max(0, dt)),
  );
  if (dt === 0) rig.opening = target;
  const r0 = rig.radius * 1.02,
    r1 = rig.radius * (0.67 + 0.31 * rig.opening),
    z1 = 0.2 + Math.sqrt(0.72 ** 2 - (r0 - r1) ** 2);
  rig.exitRadius = r1;
  rig.exitZ = z1;
  for (const mesh of [...rig.petals, ...rig.inner.children]) {
    const flap = mesh.userData.flap;
    const tip = mesh.parent === rig.inner ? r1 * 0.974 : r1;
    const angle = Math.asin((tip - flap.root) / flap.length) - flap.restAngle;
    rig.rotation.makeRotationAxis(flap.axis, angle);
    // T(hinge) R T(-hinge) base: rigid feathers, no vertex edits or scaling.
    mesh.matrix.makeTranslation(flap.hinge.x, flap.hinge.y, flap.hinge.z)
      .multiply(rig.rotation).multiply(flap.inverseHinge).multiply(flap.base);
    mesh.matrixWorldNeedsUpdate = true;
  }
  const ab = flight.afterburner || 0,
    spool = flight.engineSpool ?? flight.throttle ?? 0;
  rig.hot.material.opacity = spool > 0.3 ? 0.035 * spool + ab * 0.11 : 0;
}
