import { STORE_DIMENSIONS } from '../data/storeDimensions.js';
import * as THREE from '../../vendor/three.module.js';

// All dimensions in metres, nose -Z. Profiles, swept sheet fins and fittings
// are shared by the hangar, mounted stores and launched missiles.
const mat = (color, roughness = 0.63, metalness = 0.15) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).convertSRGBToLinear(),
    roughness,
    metalness,
  });
function mesh(g, geometry, material, name) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = true;
  g.add(m);
  return m;
}
function profile(g, points, material, name = 'body') {
  const curve = new THREE.SplineCurve(
    points.map(([z, r]) => new THREE.Vector2(z, r)),
  );
  const sampled = curve
    .getPoints(96)
    .map((p) => new THREE.Vector2(Math.max(0.0001, p.y), p.x));
  const geo = new THREE.LatheGeometry(sampled, 48);
  geo.rotateX(Math.PI / 2);
  if (name === 'body' && typeof document !== 'undefined') {
    material = material.clone();
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ededeb';
    ctx.fillRect(0, 0, 1024, 512);
    let seed = 5281;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 3500; i++) {
      ctx.fillStyle = `rgba(40,38,32,${rand() * 0.025})`;
      ctx.fillRect(rand() * 1024, rand() * 512, 1 + rand() * 5, 1);
    }
    ctx.strokeStyle = 'rgba(36,41,43,.35)';
    ctx.lineWidth = 1;
    for (const y of [102, 360, 470]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }
    for (const x of [70, 330, 590, 850]) {
      ctx.save();
      ctx.translate(x, 285);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#42484b';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(
        g.userData.storeId
          .toUpperCase()
          .replace('AIM120C', 'AIM-120C-7')
          .replace('AIM9', 'AIM-9'),
        0,
        0,
      );
      ctx.font = '7px Arial';
      ctx.fillText('CAUTION • SERVICE / NO STEP', 0, 12);
      ctx.restore();
    }
    const map = new THREE.CanvasTexture(c);
    map.encoding = THREE.sRGBEncoding;
    map.anisotropy = 8;
    material.map = map;
  }
  return mesh(g, geo, material, name);
}
function ring(g, z, r, w, material) {
  const m = mesh(
    g,
    new THREE.CylinderGeometry(r, r, w, 40, 1, true),
    material,
    'identification band',
  );
  m.rotation.x = Math.PI / 2;
  m.position.z = z;
  return m;
}
function fins(
  g,
  { z, root, tip, span, radius, sweep = 0, angle = Math.PI / 4, count = 4 },
  material,
) {
  for (let i = 0; i < count; i++) {
    const shape = new THREE.Shape();
    shape.moveTo(radius, z - root / 2);
    shape.lineTo(span, z - tip / 2 + sweep);
    shape.lineTo(span, z + tip / 2 + sweep);
    shape.lineTo(radius, z + root / 2);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.006,
      bevelEnabled: false,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.003, 0);
    geo.rotateZ(angle + (i * Math.PI * 2) / count);
    mesh(g, geo, material, 'swept fin');
  }
}
const aliases = {
  aim120: 'aim120c',
  aim9: 'aim9m',
  aim7: 'aim7m',
  aim120c_chaff: 'aim120c',
  aim9l: 'aim9m',
};
export function storeDimensions(id) {
  return STORE_DIMENSIONS[aliases[id] || id] || [2.2, 0.15];
}
export function createStoreModel(id) {
  id = aliases[id] || id;
  const g = new THREE.Group();
  g.name = `store-${id}`;
  g.userData.storeId = id;
  const [L, R] = storeDimensions(id),
    gray = mat(0xa4aaad),
    dark = mat(0x272d30, 0.5, 0.55),
    yellow = mat(0xb99b45),
    brown = mat(0x82705b),
    metal = mat(0x7b858a, 0.29, 0.75),
    olive = mat(0x535c46, 0.82, 0.03);
  g.userData.length = L;
  g.userData.radius = R;
  if (id.startsWith('fuel')) {
    profile(
      g,
      [
        [-L / 2, 0],
        [-L * 0.46, R * 0.3],
        [-L * 0.35, R * 0.75],
        [-L * 0.2, R * 0.98],
        [0, R],
        [L * 0.27, R * 0.93],
        [L * 0.42, R * 0.52],
        [L / 2, 0.008],
      ],
      gray,
    );
    for (const z of [-L * 0.18, L * 0.24])
      ring(g, z, R * 1.002, 0.006, mat(0x727a7c));
    fins(
      g,
      {
        z: L * 0.38,
        root: L * 0.2,
        tip: L * 0.09,
        span: R * 1.8,
        radius: R * 0.45,
        sweep: 0.06,
        angle: 0,
        count: 2,
      },
      gray,
    );
    const cap = mesh(
      g,
      new THREE.CylinderGeometry(0.04, 0.04, 0.006, 24),
      dark,
      'filler cap',
    );
    cap.position.set(0, R + 0.001, -0.2);
    return g;
  }
  if (id === 'litening') {
    profile(
      g,
      [
        [-L / 2, 0.07],
        [-L * 0.44, R * 0.95],
        [-L * 0.32, R],
        [L * 0.41, R],
        [L / 2, R * 0.78],
      ],
      gray,
    );
    const ball = mesh(
      g,
      new THREE.SphereGeometry(R * 0.97, 28, 18),
      dark,
      'gimballed sensor',
    );
    ball.position.z = -L * 0.43;
    for (const x of [-0.068, 0.068]) {
      const lens = mesh(
        g,
        new THREE.CylinderGeometry(0.039, 0.039, 0.007, 24),
        mat(0x293b46, 0.12, 0.65),
        'optical window',
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, -0.035, -L * 0.48);
    }
    for (const z of [0.1, 0.6]) ring(g, z, R * 1.003, 0.008, dark);
    return g;
  }
  const aam = id.startsWith('aim'),
    agm = id.startsWith('agm'),
    missile = aam || agm;
  if (missile) {
    const ir = id.startsWith('aim9'),
      mav = id.startsWith('agm65'),
      harm = id === 'agm88';
    const noseLength = mav ? 0.3 : ir ? 0.27 : L * 0.19;
    profile(
      g,
      [
        [-L / 2, 0.002],
        [-L / 2 + noseLength * 0.42, R * 0.67],
        [-L / 2 + noseLength, R],
        [L * 0.4, R],
        [L / 2, R * 0.91],
      ],
      gray,
    );
    const seekerMat = ir
      ? mat(0x46594b, 0.22, 0.55)
      : mav
        ? mat(0x29383b, 0.15, 0.55)
        : mat(0xb6b8b4, 0.75, 0.04);
    profile(
      g,
      [
        [-L / 2, 0.001],
        [-L / 2 + noseLength * 0.42, R * 0.68],
        [-L / 2 + noseLength * 0.97, R * 0.998],
      ],
      seekerMat,
      'seeker/radome',
    );
    for (const [z, material] of [
      [-L * 0.19, yellow],
      [L * 0.18, brown],
    ])
      ring(g, z, R * 1.008, 0.035, material);
    ring(g, L / 2 - 0.012, R * 0.91, 0.025, metal);
    const exhaust = mesh(
      g,
      new THREE.CylinderGeometry(R * 0.67, R * 0.6, 0.025, 28),
      dark,
      'recessed rocket nozzle',
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = L / 2 - 0.014;
    if (id === 'aim120c') {
      fins(
        g,
        { z: 0.28, root: 0.66, tip: 0.21, span: 0.255, radius: R, sweep: 0.17 },
        gray,
      );
      fins(
        g,
        { z: 1.48, root: 0.39, tip: 0.17, span: 0.224, radius: R, sweep: 0.07 },
        gray,
      );
    } else if (ir) {
      fins(
        g,
        {
          z: id === 'aim9x' ? -0.95 : -0.86,
          root: id === 'aim9x' ? 0.15 : 0.3,
          tip: 0.055,
          span: id === 'aim9x' ? 0.115 : 0.24,
          radius: R,
          sweep: 0.04,
        },
        metal,
      );
      fins(
        g,
        {
          z: L * 0.37,
          root: 0.42,
          tip: 0.22,
          span: id === 'aim9x' ? 0.225 : 0.314,
          radius: R,
          sweep: 0.08,
        },
        gray,
      );
    } else if (mav) {
      fins(
        g,
        { z: 0.18, root: 1.0, tip: 0.36, span: 0.36, radius: R, sweep: 0.2 },
        olive,
      );
      fins(
        g,
        {
          z: L * 0.4,
          root: 0.26,
          tip: 0.1,
          span: 0.28,
          radius: R,
          sweep: 0.08,
        },
        gray,
      );
    } else {
      fins(
        g,
        {
          z: 0,
          root: L * 0.32,
          tip: 0.28,
          span: harm ? 0.565 : 0.5,
          radius: R,
          sweep: 0.3,
        },
        gray,
      );
      fins(
        g,
        {
          z: L * 0.39,
          root: 0.39,
          tip: 0.15,
          span: harm ? 0.3 : 0.4,
          radius: R,
          sweep: 0.1,
        },
        gray,
      );
    }
    // Longitudinal cable raceway, suspension buttons and service stripe.
    const cable = mesh(
      g,
      new THREE.BoxGeometry(0.014, 0.016, L * 0.52),
      gray,
      'cable raceway',
    );
    cable.position.set(R * 0.72, R * 0.72, 0.15);
    return g;
  }
  const guided = id.startsWith('gbu'),
    pave = ['gbu12', 'gbu16', 'gbu10', 'gbu24'].includes(id),
    jdam = guided && !pave;
  const tailStart = L * 0.25;
  profile(
    g,
    [
      [-L / 2, 0.007],
      [-L * 0.43, R * 0.58],
      [-L * 0.29, R * 0.97],
      [-L * 0.11, R],
      [L * 0.17, R * 0.96],
      [tailStart, R * 0.7],
      [L * 0.46, R * 0.34],
    ],
    olive,
  );
  if (pave) {
    profile(
      g,
      [
        [-L / 2, 0.014],
        [-L * 0.44, R * 0.27],
        [-L * 0.32, R * 0.37],
      ],
      metal,
      'laser seeker',
    );
    const lens = mesh(
      g,
      new THREE.SphereGeometry(R * 0.2, 18, 12),
      dark,
      'laser lens',
    );
    lens.position.z = -L / 2 + 0.018;
    fins(
      g,
      {
        z: -L * 0.3,
        root: 0.28,
        tip: 0.12,
        span: R * 1.8,
        radius: R * 0.35,
        sweep: 0.08,
      },
      olive,
    );
  }
  const tailR = pave ? R * 2.1 : jdam ? R * 1.65 : R * 1.65;
  fins(
    g,
    {
      z: L * 0.35,
      root: L * 0.27,
      tip: L * 0.14,
      span: tailR,
      radius: R * 0.32,
      sweep: 0.07,
    },
    jdam ? gray : olive,
  );
  profile(
    g,
    [
      [L * 0.29, R * 0.53],
      [L * 0.48, R * 0.48],
      [L / 2, R * 0.36],
    ],
    jdam ? gray : olive,
    'tail kit',
  );
  ring(g, -L * 0.27, R * 0.985, 0.045, yellow);
  if (guided) ring(g, -L * 0.2, R * 1.003, 0.014, brown);
  if (jdam) {
    for (const x of [-1, 1]) {
      const strake = mesh(
        g,
        new THREE.BoxGeometry(0.018, 0.012, L * 0.45),
        gray,
        'JDAM body strake',
      );
      strake.position.set(x * R * 0.72, R * 0.72, -0.02);
    }
  }
  for (const z of [-0.18, 0.18]) {
    const lug = mesh(
      g,
      new THREE.TorusGeometry(0.018, 0.006, 8, 16),
      metal,
      'suspension lug',
    );
    lug.rotation.y = Math.PI / 2;
    lug.position.set(0, R + 0.012, z);
  }
  return g;
}

function airfoilPylon(group, height, material, length = 1.05, width = 0.095) {
  const s = new THREE.Shape();
  s.moveTo(-length * 0.47, 0);
  s.lineTo(length * 0.46, 0);
  s.lineTo(length * 0.32, -height);
  s.lineTo(-length * 0.29, -height);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: width,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.012,
    bevelThickness: 0.008,
  });
  // Shape X is aircraft Z, shape Y is vertical; thickness is aircraft X.
  geo.rotateY(Math.PI / 2);
  geo.translate(-width / 2, 0, 0);
  return mesh(group, geo, material, 'aerodynamic pylon');
}
export function createF16Mount(spec, id, { withStore = true } = {}) {
  const store = withStore ? createStoreModel(id) : null,
    mount = new THREE.Group(),
    adapter = new THREE.Group();
  const [L, R] = storeDimensions(id),
    tip = spec.tip,
    missile = id.startsWith('aim') || id.startsWith('agm'),
    tank = id.startsWith('fuel');
  let y = spec.y,
    z = spec.z;
  if (!tip && !spec.chin && !tank) y = spec.wingY - (missile ? 0.44 : 0.51) - R;
  if (tip) y = spec.y + 0.089 - R;
  if (spec.chin) y = -1.38;
  mount.name = `cad-store-${spec.id}-${id}`;
  mount.position.set(spec.x, y + 0.55, z);
  if (store) mount.add(store);
  adapter.position.copy(mount.position);
  adapter.name = `mount-${spec.id}`;
  const paint = mat(0x858e94, 0.75, 0.12),
    hardware = mat(0x535e65, 0.49, 0.48),
    top = spec.wingY - y;
  if (spec.chin) {
    airfoilPylon(adapter, top - R - 0.025, paint, 0.7, 0.09);
    adapter.children[0].position.y = top;
  } else {
    if (tip) {
      const p = airfoilPylon(
        adapter,
        Math.max(0.025, top - R - 0.075),
        paint,
        0.42,
        0.08,
      );
      p.position.set(0, top, 2.76 - z);
      const saddle = mesh(
        adapter,
        new THREE.BoxGeometry(0.25, 0.035, 0.32),
        paint,
        'wingtip saddle',
      );
      saddle.position.set(-Math.sign(spec.x) * 0.075, top - 0.008, 2.82 - z);
    } else {
      const p = airfoilPylon(
        adapter,
        Math.max(0.08, top - R - 0.075),
        paint,
        tank ? 1.3 : ['lo', 'ro'].includes(spec.id) ? 0.8 : 1.05,
        tank ? 0.13 : 0.095,
      );
      p.position.set(
        0,
        top,
        (['lo', 'ro'].includes(spec.id)
          ? 2.49
          : ['li', 'ri'].includes(spec.id)
            ? 2.08
            : z) - z,
      );
    }
    if (missile) {
      const rail = mesh(
        adapter,
        new THREE.BoxGeometry(0.07, 0.067, 1.38),
        paint,
        'LAU-129 launch rail',
      );
      rail.name = id.startsWith('agm65')
        ? 'LAU-117 launch rail'
        : id === 'agm88'
          ? 'LAU-118 launch rail'
          : 'LAU-129 launch rail';
      rail.position.set(0, R + 0.041, tip ? 0.8 : 0.38);
      for (const zz of [-0.55, 0.42]) {
        const shoe = mesh(
          adapter,
          new THREE.BoxGeometry(0.1, 0.018, 0.12),
          hardware,
          'rail shoe',
        );
        shoe.position.set(0, R + 0.006, zz + (tip ? 0.8 : 0.38));
      }
    } else {
      for (const zz of [-0.25, 0.25]) {
        const rack = mesh(
          adapter,
          new THREE.BoxGeometry(0.105, 0.07, 0.13),
          hardware,
          'ejector rack',
        );
        rack.position.set(0, R + 0.04, zz);
        for (const side of [-1, 1]) {
          const brace = mesh(
            adapter,
            new THREE.CylinderGeometry(0.012, 0.012, 0.13, 10),
            hardware,
            'sway brace',
          );
          brace.position.set(side * 0.06, R + 0.015, zz);
          brace.rotation.z = side * 0.75;
        }
      }
    }
  }
  return {
    group: mount,
    adapter,
    storeId: id,
    station: spec.id,
    type: id.startsWith('aim')
      ? id.startsWith('aim9')
        ? 'aim9m'
        : id === 'aim120c_chaff'
          ? 'aim120c'
          : id
      : null,
  };
}
