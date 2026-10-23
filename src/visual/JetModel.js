import * as THREE from '../../vendor/three.module.js';
import { JET_PROFILES } from './jet/profiles.js';
import {
  loftFuselage, buildWing, buildFin, buildControlPlate,
  mirrorGeometryX, makeCylinderBetween,
  buildIntakeLipGeometry, buildNozzlePetals, buildBubbleCanopy,
} from './jet/geometry.js';
import {
  createJetMaterials, makeAfterburnerMaterial,
} from './jet/materials.js';
import {loadCachedModel} from './modelCache.js';
import { F16_STATIONS, normalizeF16Loadout } from '../data/f16Stations.js';
import { createStoreModel, createF16Mount } from './F16Stores.js';
import { clamp } from '../sim/math.js';
import {selectMountedStore,commitMountedRelease,detachMountedStores} from './storeRelease.js';
import {
  cleanF16Cad, prepareF16SkinGeometry, buildF16ControlSurfaces,
  updateF16Surfaces, buildF16Cockpit, trimF16Stabilator, rebuildF16SkinNormals,
} from './F16Airframe.js';
import {createF100Nozzle,updateF100Nozzle} from './F16Propulsion.js';
import {createF100Exhaust,updateF100Exhaust} from './F16Exhaust.js';
import {buildF16Canopy,updateF16Canopy} from './F16Canopy.js';
import {buildF16Intake} from './F16Intake.js';
import {createVfxPlume,updateVfxPlume} from './VfxAtlas.js';
import { createF16SkinMaterial } from './F16Skin.js';
import { buildHydraulicGear, updateHydraulicGear, gearDoorClosure, mainDoorClearance,
  widenMainDoor, addMainDoorHingeArms, addMainDoorSeal } from './CadLandingGear.js';

function makeCanopyReflectionMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6);
        vec3 col = mix(vec3(0.42, 0.56, 0.60), vec3(0.92, 0.98, 1.0), f);
        gl_FragColor = vec4(col, 0.035 + f * 0.48);
      }
    `,
  });
}

function makeHudGlassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 384);
  ctx.fillStyle = 'rgba(105, 220, 158, 0.10)';
  ctx.fillRect(0, 0, 512, 384);
  ctx.strokeStyle = 'rgba(145, 255, 182, 0.92)';
  ctx.fillStyle = 'rgba(145, 255, 182, 0.92)';
  ctx.lineWidth = 3;
  // Glass edges: intentionally open at the top; the black rails carry the frame.
  ctx.beginPath();
  ctx.moveTo(24, 36);
  ctx.lineTo(24, 348);
  ctx.lineTo(488, 348);
  ctx.lineTo(488, 36);
  ctx.stroke();
  // Reticle.
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(256, 192, 23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(256, 155); ctx.lineTo(256, 177);
  ctx.moveTo(256, 207); ctx.lineTo(256, 229);
  ctx.moveTo(219, 192); ctx.lineTo(241, 192);
  ctx.moveTo(271, 192); ctx.lineTo(293, 192);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(256, 142); ctx.lineTo(250, 151);
  ctx.moveTo(256, 142); ctx.lineTo(262, 151);
  ctx.stroke();
  // Pitch ladder ticks on the glass.
  ctx.lineWidth = 2;
  for (const [y, w] of [[92, 46], [132, 32], [252, 32], [292, 46]]) {
    ctx.beginPath();
    ctx.moveTo(256 - w, y); ctx.lineTo(256 + w, y);
    ctx.stroke();
  }
  ctx.font = '600 18px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HUD', 256, 320);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeCockpitDeck({
  innerX, innerZ, outerX, outerZ, thickness = 0.06, segments = 64,
}) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const ring = (rx, rz, y) => {
    const start = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * rx, y, Math.sin(a) * rz);
      uvs.push(i / segments, y === 0 ? 0 : 1);
    }
    return start;
  };
  const outerTop = ring(outerX, outerZ, 0);
  const innerTop = ring(innerX, innerZ, 0);
  const outerBottom = ring(outerX, outerZ, -thickness);
  const innerBottom = ring(innerX, innerZ, -thickness);
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    // Top annulus.
    indices.push(outerTop + i, innerTop + i, innerTop + j);
    indices.push(outerTop + i, innerTop + j, outerTop + j);
    // Bottom annulus.
    indices.push(outerBottom + i, innerBottom + j, innerBottom + i);
    indices.push(outerBottom + i, outerBottom + j, innerBottom + j);
    // Outer and inner walls.
    indices.push(outerTop + i, outerTop + j, outerBottom + j);
    indices.push(outerTop + i, outerBottom + j, outerBottom + i);
    indices.push(innerTop + i, innerBottom + j, innerTop + j);
    indices.push(innerTop + i, innerBottom + i, innerBottom + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addMesh(parent, geometry, material, cast = true, receive = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

function addTube(parent, points, radius, material, segments = 14) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segments, radius, 5, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  parent.add(mesh);
  return mesh;
}


function buildNozzleAssembly(m, radius) {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.84, radius, 0.5, 24, 1, true),
    m.nozzleMetal);
  outer.rotation.x = Math.PI / 2;
  outer.position.z = -0.10;
  outer.castShadow = true;
  group.add(outer);

  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.68, radius * 0.74,
      1.20, 20, 1, true), m.nozzleInner);
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.32;
  group.add(inner);

  // Outer boat-tail fairing blending the nozzle into the fuselage.
  const shroud = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius * 1.02,
      0.9, 24, 1, true), m.body);
  shroud.rotation.x = Math.PI / 2;
  shroud.position.z = -0.55;
  shroud.castShadow = true;
  group.add(shroud);

  // Segmented convergent petals. Gaps expose the dark inner barrel.
  const petals = new THREE.Mesh(
    buildNozzlePetals({
      segments: 16,
      radiusFront: radius * 1.08,
      radiusRear: radius * 0.84,
      zFront: 0.20,
      zRear: 0.92,
      gap: 0.035,
    }), m.nozzlePetal);
  petals.castShadow = false;
  group.add(petals);
  const petalRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.84, 0.013, 4, 24),
    m.nozzlePetal);
  petalRim.position.z = 0.92;
  group.add(petalRim);

  // Turbine / afterburner face and flame-holder ring inside the pipe.
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.58, 20), m.nozzleInner);
  face.position.z = 0.20;
  face.rotation.y = Math.PI;
  group.add(face);
  for (let i = 0; i < 10; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, radius * 0.5, 0.016),
      m.nozzlePetal);
    blade.position.z = 0.22;
    blade.rotation.z = i * Math.PI / 5;
    group.add(blade);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.19,
      0.10, 14), m.nozzlePetal);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.24;
  group.add(hub);
  const burnerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.48, 0.032, 5, 18),
    m.nozzlePetal);
  burnerRing.position.z = 0.66;
  group.add(burnerRing);
  for (let i = 0; i < 8; i++) {
    const holder = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, radius * 0.34, 0.02),
      m.nozzlePetal);
    holder.position.z = 0.68;
    holder.rotation.z = i * Math.PI / 4;
    group.add(holder);
  }
  group.userData.inner = inner;
  return group;
}



function createMissile(type, mats) {
  const group = new THREE.Group();
  const radarMissile = type === 'aim120' || type === 'aim7';
  const r = type === 'aim120' ? 0.089 : type === 'aim7' ? 0.100 :
    type === 'r73' ? 0.075 : 0.065;
  const length = radarMissile ? 3.66 : type === 'r73' ? 2.9 : 3.05;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, length * 0.72, 12),
    mats.missileBody);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.18;
  body.castShadow = true;
  group.add(body);

  const seekerEnd = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.82, r * 0.92, length * 0.17, 12),
    mats.missileSeeker);
  seekerEnd.rotation.x = Math.PI / 2;
  seekerEnd.position.z = -length * 0.31;
  group.add(seekerEnd);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.82, length * 0.26, 12),
    type === 'r73' ? mats.missileSeeker : mats.missileBody);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -length * 0.53;
  group.add(nose);

  const motor = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.02, r * 0.96, 0.18, 12),
    mats.dark);
  motor.rotation.x = Math.PI / 2;
  motor.position.z = length * 0.48;
  group.add(motor);

  const finMat = mats.missileBody;
  const finShape = type === 'r73'
    ? new THREE.BoxGeometry(0.52, 0.025, 0.34)
    : radarMissile
      ? new THREE.BoxGeometry(0.46, 0.024, 0.34)
      : new THREE.BoxGeometry(0.34, 0.02, 0.28);
  for (let i = 0; i < 2; i++) {
    const fin = new THREE.Mesh(finShape, finMat);
    fin.position.z = length * 0.31;
    fin.rotation.z = i * Math.PI / 2;
    group.add(fin);
  }
  const canardShape = new THREE.BoxGeometry(0.24, 0.018, 0.18);
  for (let i = 0; i < 2; i++) {
    const fin = new THREE.Mesh(canardShape, finMat);
    fin.position.z = -length * 0.22;
    fin.rotation.z = i * Math.PI / 2;
    group.add(fin);
  }
  return group;
}

// cc61/cc62 are exported splayed OUTBOARD of the nose bay. Closing must swing
// their free edges underneath the hinge and INBOARD to the centre seam, not
// raise them onto the outer chine. At 134 degrees the actual CAD vertices meet
// at x ~= 0.0075 m and follow the bay rim at y ~= -1.51 m (CAD-local).
const NOSE_DOOR_CLOSE_ANGLE = THREE.MathUtils.degToRad(134);

export class JetModel {
  constructor(config, { isPlayer = false } = {}) {
    this.config = config;
    this.profile = JET_PROFILES[config.visual.scheme] || JET_PROFILES.falcon;
    this.isPlayer = isPlayer;
    this.paint = config.visual.paint === 'jersey-jerk' ? 'jersey-jerk' : 'service';
    this.cadSkinMaterials = {};
    this.mats = createJetMaterials(this.profile.scheme);
    this.group = new THREE.Group();
    this.group.name = `jet-${config.id}-${isPlayer ? 'player' : 'ai'}`;
    this.airframe = config.visual?.cadModel ? null : this.group;
    this.group.visible = !config.visual?.cadModel;
    this.disposed = false;
    this.lastSync = null;
    this.parts = {
      missiles: [], missileTypes: [], flaps: [], ailerons: [], stabilators: [],
      rudders: [], gear: [], gearFairings: [], wheels: [],
      flames: [], nozzles: [], strobes: [], lights: [], brake: [],
    };
    this.time = 0;
    this.cockpitView = false;
    this.hardpointWorld = [];
    this.mountedTanks = [];
    this.cadMountedStores = [];
    this.cadPylons = [];
    this._buildAirframe();
    this._buildWings();
    this._buildTail();
    this._buildEngines();
    this._buildLandingGear();
    this._buildStores();
    this._buildExternalTanks();
    this._buildCadLoadoutStores();
    this._buildCockpit();
    this._buildLightsAndDecals();
    // In cockpit view we draw only the interior and canopy frame; hiding the
    // external airframe avoids the player's own nose and wings filling the view.
    this.externalObjects = this.group.children.filter(
      (child) => child !== this.parts.interior &&
        child !== this.parts.canopyFrame &&
        !this.cadMountedStores.some((store) => store.group === child) &&
        !this.mountedTanks.includes(child));
    // Airframe parts that must stay hidden from the pilot's eye point. Other
    // exterior geometry (wings, fuselage, nose, stores) remains visible so the
    // cockpit view reads as being inside an aircraft, not a floating camera.
    this.cockpitHidden = new Set([
      this.parts.canopyRig, this.parts.pilot,
      this.parts.cockpitRim, this.parts.cockpitCoaming,
    ]);
    this.cadGroup = null;
    this.cadSurfaceParts = [];
    this.cadGearDoors = [];
    this.mountedTanks = this.mountedTanks || [];
    this.cadMountedStores = this.cadMountedStores || [];
    this.cadMissileTemplates = {};
    this.cadAfterburner = null;
    this.cadPylons = this.cadPylons || [];
    this.cadLoading = false;
    this.ready = config.visual?.cadModel ? this._loadCad(config.visual.cadModel) : Promise.resolve(this);
    // Preview callers may poll cadLoading; keep rejection available to Game's await.
    this.ready.catch(() => {});
    // Self-shadowing at a 2k shadow map over a 520 m frustum produced visible
    // shimmer on the fuselage. The jet still casts a shadow; it simply does not
    // receive its own acne-prone shadow.
    this.group.traverse((object) => {
      if (object.isMesh) object.receiveShadow = false;
    });
    this.group.updateMatrixWorld(true);
  }

  async _loadCad(url) {
    this.cadLoading = true;
    try {
      const cad = await loadCachedModel(url);
      if (this.disposed) { this._disposeObject(cad);return; }
      cad.name = 'cad-f16cm-block52';
      cad.position.y = 0.55;
      this.cadGroup = cad;
      this.group.add(cad);
      this._prepareCadRig(cad);
      this.airframe = cad;
      this.cadLoading = false;
      if (this.lastSync) this.sync(...this.lastSync);
      else this._applyCadVisibility();
      this.group.visible = true;
      return this;
    } finally {
      this.cadLoading = false;
    }
  }

  _prepareCadRig(cad) {
    this.cadStabilizers = [];
    this.cadGearRigs = [];
    this.cadSkinMaterial = this.cadSkinMaterials[this.paint] = createF16SkinMaterial(this.paint);
    cad.userData.paintMode = this.paint;
    const nodes = [];
    const normName = (object) => `${object.name || ''}`
      .toLowerCase().replace(/_/g, ' ');
    cad.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = false;
      nodes.push(object);
      if (object.material?.name === 'body') {
        this._paintCadMesh(object);
      }
    });

    this.cadRemovedParts = cleanF16Cad(nodes);
    prepareF16SkinGeometry(nodes);
    this._removeCadMissileNodes(nodes, normName);
    this._extractCadPylons(nodes, normName);
    this._removeCadExternalStores(nodes, normName);
    this._extractCadGearDoors(nodes, normName);
    this._removeCadFlapBeams(nodes, normName);

    this._buildSymmetricStabilizers(cad, nodes, normName);

    this.cadGearRigs = buildHydraulicGear(cad, nodes, normName);

    this.cadSurfaceParts = buildF16ControlSurfaces(cad, nodes, this.cadSkinMaterial);
    this.cadCockpit=buildF16Cockpit(cad,nodes);
    this.cadCanopy=buildF16Canopy(cad,nodes,this.cadSkinMaterial);
    this.cadIntake=buildF16Intake(cad,nodes);
    if(this._cadGunPort)cad.add(this._cadGunPort);
    this._buildCadPylons();
    this._buildCadAfterburner(cad, nodes, normName);
    const rebuilt = new Map();
    cad.traverse((object) => {
      if (!object.isMesh || object.material !== this.cadSkinMaterial) return;
      const source = object.geometry;
      if (!rebuilt.has(source)) rebuilt.set(source, rebuildF16SkinNormals(source));
      object.geometry = rebuilt.get(source);
    });
    for (const source of rebuilt.keys()) source.dispose();
  }

  _removeCadMissileNodes(nodes, normName) {
    for (const node of nodes.filter((n) => /missile/.test(normName(n)))) {
      node.parent?.remove(node);
    }
  }

  _extractCadPylons(nodes, normName) {
    // The CAD pylon/rail solids are asymmetric and were never intended to be
    // shown once the stores are detached. Remove them rather than attaching
    // them to whichever missile happened to be closest; keeping only the six
    // mirrored missile bodies gives the same clean result as DeepSeek.
    for (const id of [54, 55, 56, 63]) {
      const node = nodes.find((n) =>
        new RegExp(`cc0?${id}(?!\\d)`).test(normName(n)));
      node?.parent?.remove(node);
    }
  }

  _removeCadExternalStores(nodes, normName) {
    // The last two loose CAD stores are the big external fuel tanks
    // (cc59/cc68). cc57/cc58 are their pylons; cc65/cc66 are the two
    // air-to-ground composite racks. They are supplied by the loadout editor
    // now, so no permanent geometry should remain on the clean airframe.
    for (const id of [35, 36, 57, 58, 59, 65, 66, 68]) {
      const node = nodes.find((n) =>
        new RegExp(`cc0?${id}(?!\\d)`).test(normName(n)));
      node?.parent?.remove(node);
    }
  }

  _cadLocalBox(node) {
    node.updateMatrix();
    node.geometry.computeBoundingBox();
    return node.geometry.boundingBox.clone().applyMatrix4(node.matrix);
  }

  _makeCadHinge(nodes, hinge, axis) {
    const parts = [];
    for (const node of nodes) {
      node.updateMatrix();
      // Clone the existing CAD node and hide the original. The clone keeps
      // the exact local matrix and geometry; animation only premultiplies a
      // rotation around the hinge line, so there is no reparenting/translation.
      const mesh = node.clone(true);
      mesh.name = `${node.name}-hinged`;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(node.matrix);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.visible = false;
      node.parent.add(mesh);
      node.visible = false;
      parts.push({ mesh, baseMatrix: node.matrix.clone() });
    }
    return {
      parts,
      hinge: hinge.clone(),
      axis: axis.clone().normalize(),
    };
  }

  _setCadHingeAngle(rig, angle) {
    rig.angle = angle; // last applied angle, read by the gear debug readout
    const t = new THREE.Matrix4();
    const r = new THREE.Matrix4();
    const ti = new THREE.Matrix4();
    const h = rig.hinge;
    t.makeTranslation(h.x, h.y, h.z);
    r.makeRotationAxis(rig.axis, angle);
    ti.makeTranslation(-h.x, -h.y, -h.z);
    for (const part of rig.parts) {
      part.mesh.matrix.copy(t)
        .multiply(r)
        .multiply(ti)
        .multiply(part.baseMatrix);
      part.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  _buildSymmetricStabilizers(cad, nodes, normName) {
    const right = nodes.find((n) => /rear stabilizer right/.test(normName(n)));
    const left = nodes.find((n) => /rear stabilizer left/.test(normName(n)));
    if (!right) return;
    const box = this._cadLocalBox(right);
    // The CAD left/right stabilisers are not mirrored: the right part is
    // larger and sits further aft. Rebuild both from the right-hand geometry
    // so they have identical span, chord and hinge line.
    const hinge = new THREE.Vector3(
      0, (box.min.y + box.max.y) * 0.5, box.min.z + 0.65);
    const axis = new THREE.Vector3(1, 0, 0);
    const rightGeo = trimF16Stabilator(right.geometry.clone().applyMatrix4(right.matrix));
    const leftGeo = rightGeo.clone();
    leftGeo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
    if (leftGeo.index) {
      const indices = leftGeo.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const tmp = indices[i + 1];
        indices[i + 1] = indices[i + 2];
        indices[i + 2] = tmp;
      }
      leftGeo.index.needsUpdate = true;
    }
    leftGeo.computeVertexNormals();

    const parts = [];
    for (const [node, geometry] of [[right, rightGeo], [left, leftGeo]]) {
      if (!node) continue;
      const mesh = new THREE.Mesh(geometry, right.material);
      mesh.name = `${node.name}-symmetric`;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.identity();
      mesh.visible = false;
      cad.add(mesh);
      node.visible = false;
      parts.push({ mesh, baseMatrix: new THREE.Matrix4() });
    }
    for (const part of parts) {
      this.cadStabilizers.push({
        parts: [part], hinge, axis,
        side: /left/i.test(part.mesh.name) ? -1 : 1,
      });
    }
  }

  _removeCadFlapBeams(nodes, normName) {
    // cc32/cc33/cc34 are the exposed flap-track beams; cc64/cc67 are the
    // remaining pair of pylon-root beams that cut through the dropped flap.
    for (const id of [32, 33, 34, 64, 67]) {
      const node = nodes.find((n) =>
        new RegExp(`cc0?${id}(?!\\d)`).test(normName(n)));
      node?.parent?.remove(node);
    }
  }

  _buildCadPylons() { /* Adapters belong to the selected station stores. */ }

  _extractCadGearDoors(nodes, normName) {
    // Body_2 contains the gear-bay doors as separate solids: cc51/cc53 are the
    // two main-gear doors, cc61/cc62 the nose-gear doors. Hinge them on their
    // outer/top edge so they open when the gear extends and close flush when it
    // retracts into the fuselage.
    const specs = [
      { id: 51, kind: 'main', side: -1 },
      { id: 53, kind: 'main', side: 1 },
      { id: 61, kind: 'front', side: -1 },
      { id: 62, kind: 'front', side: 1 },
    ];
    for (const spec of specs) {
      const node = nodes.find((n) =>
        new RegExp(`cc0?${spec.id}(?!\\d)`).test(normName(n)));
      if (!node) continue;
      // The real CAD hinge is the inner/top edge, not the outer/top corner.
      // Extract that edge from actual vertices and fit the hinge line there.
      const box = this._cadLocalBox(node);
      const innerX = spec.side < 0 ? box.max.x : box.min.x;
      const outerX = spec.side < 0 ? box.min.x : box.max.x;
      const pos = node.geometry.attributes.position;
      const verts = [];
      for (let i = 0; i < pos.count; i++) {
        verts.push(new THREE.Vector3().fromBufferAttribute(pos, i)
          .applyMatrix4(node.matrix));
      }
      const top = verts.filter((v) =>
        Math.abs(v.y - box.max.y) < 0.015 &&
        Math.abs(v.x - innerX) < 0.05);
      const bottom = verts.filter((v) =>
        Math.abs(v.y - box.min.y) < 0.015 &&
        Math.abs(v.x - outerX) < 0.05);
      let hinge;
      let axis;
      if (top.length >= 2) {
        const lo = top.reduce((a, b) => (b.z < a.z ? b : a));
        const hi = top.reduce((a, b) => (b.z > a.z ? b : a));
        hinge = lo.clone().add(hi).multiplyScalar(0.5);
        axis = hi.clone().sub(lo).normalize();
        if (axis.z < 0) axis.negate();
      } else {
        hinge = new THREE.Vector3(
          innerX, box.max.y - 0.005,
          (box.min.z + box.max.z) * 0.5);
        axis = new THREE.Vector3(0, 0, 1);
      }
      const free = bottom.length
        ? bottom.reduce((a, b) => a.add(b), new THREE.Vector3())
          .multiplyScalar(1 / bottom.length)
        : new THREE.Vector3(outerX, box.min.y,
          (box.min.z + box.max.z) * 0.5);
      const closedAngle = Math.atan2(
        Math.max(Math.abs(free.y - hinge.y), 0.001),
        Math.max(Math.abs(free.x - hinge.x), 0.001));
      // The main doors retain their existing travel. Nose panels must cross
      // beneath their hinges to cover the central bay; cancelling their droop
      // merely flattens them outside the opening.
      const closeAngle = spec.kind === 'front'
        ? NOSE_DOOR_CLOSE_ANGLE
        : closedAngle;
      if (spec.kind === 'main') widenMainDoor(node, hinge, axis);
      const rig = this._makeCadHinge([node], hinge, axis);
      const door = { ...rig, closedAngle, closeAngle, kind: spec.kind, side: spec.side };
      addMainDoorHingeArms(node.parent, door, this.cadSkinMaterial);
      addMainDoorSeal(node.parent, door, this.cadSkinMaterial);
      this.cadGearDoors.push(door);
    }
  }

  createCadMissileMesh(type) {
    const store=this.pendingLaunch;this.pendingLaunch=null;
    if(!store)return createStoreModel(type);
    commitMountedRelease(store,this.releaseState);
    const mesh=store.group;mesh.parent?.remove(mesh);mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.userData.storeReleased=true;
    mesh.userData.length=mesh.userData.length||mesh.children.find(o=>o.userData.length)?.userData.length||3;
    mesh.userData.storeId=store.storeId;
    return mesh;
  }

  getMissileLaunchPose(type, remainingAfter) {
    this.releaseState??={};
    const store = selectMountedStore(this.cadMountedStores,type.startsWith('aim9')?'aim9m':type,this.releaseState);
    if (!store) return null;
    this.group.updateMatrixWorld(true);
    const position = store.group.getWorldPosition(new THREE.Vector3());
    const localPosition = this.group.worldToLocal(position.clone());
    this.pendingLaunch=store;
    const bomb=['bomb','guided','cluster','incendiary'].includes(store.category);
    return { position, localPosition, storeId:store.storeId,station:store.station,releaseMode:bomb?'drop':'rail' };
  }

  releaseExternalTanks(stations) {
    this.group.updateMatrixWorld(true);
    return detachMountedStores(this.cadMountedStores,stations,(store)=>store.category==='tank');
  }

  _syncCadStores(weapons) {
    if (!this.cadMountedStores.length) return;
    const remaining = weapons?.missileRemaining;
    if (!remaining) {
      for (const store of this.cadMountedStores) store.group.visible = true;
      return;
    }
    for (const store of this.cadMountedStores) {
      if(store.released)continue;
      store.group.visible=!weapons?.jettisonedStations?.[store.station];
    }
  }

  _buildCadAfterburner(cad, nodes, normName) {
    const prop=nodes.find(n=>/propeller/.test(normName(n)));if(!prop)return;
    const box=this._cadLocalBox(prop),center=box.getCenter(new THREE.Vector3());
    const radius=Math.min(box.max.x-box.min.x,box.max.y-box.min.y)*.42;
    const nozzle=createF100Nozzle(radius);nozzle.position.set(center.x,center.y,box.max.z-.92);cad.add(nozzle);prop.visible=false;
    const plume=createF100Exhaust();plume.position.copy(nozzle.position);cad.add(plume);
    this.cadAfterburner={nozzle,group:plume,plume};
  }

  _updateCadAfterburner(flight,dt=1/60) {
    const rig=this.cadAfterburner;if(!rig)return;
    updateF100Nozzle(rig.nozzle,flight,dt);
    rig.plume.position.copy(rig.nozzle.position);
    updateF100Exhaust(rig.plume,rig.nozzle.userData.nozzle,flight,this.time);
  }

  setPaint(paint) {
    this.paint = paint === 'jersey-jerk' ? paint : 'service';
    if (!this.cadGroup) return;
    const previous = this.cadSkinMaterial;
    const material = this.cadSkinMaterials[this.paint] ||= createF16SkinMaterial(this.paint);
    this.cadGroup.traverse((object) => {
      if (object.material === previous) object.material = material;
    });
    this.cadSkinMaterial = material;
    this.cadGroup.userData.paintMode = this.paint;
  }

  _paintCadMesh(mesh) {
    // Geometry has no UVs; the DeepSeek panel texture is applied triplanar in
    // the material shader instead of baking colours per vertex.
    mesh.material = this.cadSkinMaterial;
  }

  _updateCadRig(flight, systems, dt = 1 / 60) {
    if (!this.cadGroup) return;
    const surfaces = flight.control?.surfaces || {
      aileron: 0, elevator: 0, rudder: 0,
    };
    const elevator = surfaces.elevator || 0;
    for (const stab of this.cadStabilizers) {
      this._setCadHingeAngle(stab, clamp(-elevator * .95-(surfaces.aileron||0)*.28*stab.side,-25*Math.PI/180,25*Math.PI/180));
    }
    const gearAmount = clamp(1 - (systems.gear ?? 1), 0, 1);
    for (const gear of this.cadGearRigs) updateHydraulicGear(gear, gearAmount, {flight,dt,onGround:this._groundContact});
    // Extend: doors open first. Retract: wheels and cylinders enter the wells
    // before any panel starts closing. One reversible phase curve prevents
    // snapping when the pilot reverses G halfway through a cycle.
    const closure = gearDoorClosure(gearAmount);
    for (const door of this.cadGearDoors) {
      this._setCadHingeAngle(door, -door.side * door.closeAngle * closure);
      mainDoorClearance(door, closure);
    }
    updateF16Canopy(this.cadCanopy,systems.canopy || 0);
    updateF16Surfaces(this.cadSurfaceParts || [], flight, systems, dt,
      (rig, angle) => this._setCadHingeAngle(rig, angle));
  }

  _applyCadVisibility() {
    if (!this.cadGroup) {
      if (this.config.visual?.cadModel) this.group.visible = false;
      return;
    }
    const showCad = !this.cockpitView;
    this.cadGroup.visible = showCad;
    if (showCad) {
      this.parts.interior.visible = false;
      // Keep the effects that are anchored to the airframe; the CAD skin
      // replaces the procedural fuselage and wings.
      const keep = new Set([this.parts.muzzleFlash, ...this.parts.strobes]);
      for (const object of this.externalObjects) {
        // Keep the muzzle flash/strobes at the state sync() just set.
        // Forcing them visible here made the gun flash glow permanently.
        if (!keep.has(object)) object.visible = false;
      }
    } else {
      this.parts.interior.visible = true;
    }
    for (const pylon of this.cadPylons) pylon.visible = showCad;
    for (const stab of this.cadStabilizers) {
      for (const part of stab.parts) part.mesh.visible = showCad;
    }
    for (const control of this.cadSurfaceParts || []) {
      for (const part of control.parts) part.mesh.visible = showCad;
    }
    for (const door of this.cadGearDoors) {
      // These panels close the nose bay and must remain rendered at gear=0.
      for (const part of door.parts) part.mesh.visible = showCad;
      for (const arm of door.hingeArms || []) arm.mesh.visible = showCad;
    }
    for (const gear of this.cadGearRigs) {
      // Fully retracted wheels stay in the scene, occluded by the closed
      // doors and fuselage. No disappearing tyre or visibility threshold.
      gear.group.visible = showCad;
      for (const part of gear.parts) part.mesh.visible = showCad;
    }
    if (!showCad) {
      for (const store of this.cadMountedStores) if(!store.released)store.group.visible = false;
      for (const tank of this.mountedTanks) tank.visible = false;
    } else {
      for (const tank of this.mountedTanks) tank.visible = true;
    }
  }

  _buildAirframe() {
    const p = this.profile;
    const m = this.mats;
    const fuselage = addMesh(this.group,
      loftFuselage(p.fuselage, 56, 3.4, {
        cutout: {
          ellipse: {
            cx: 0,
            cz: p.canopy.position[2],
            rx: 0.36,
            rz: 1.10,
            minY: 0.15,
          },
        },
      }), m.body, true, true);
    this.parts.fuselage = fuselage;

    // Dark radome over the nose section.
    const noseSections = p.fuselage.filter((s) => s.z <= p.noseBreak).map((s) => ({
      ...s, width: s.width * 1.006, height: s.height * 1.006,
    }));
    if (noseSections.length > 2) {
      addMesh(this.group, loftFuselage(noseSections, 24, 1), m.radome, true, false);
    }

    // Pitot booms.
    const noseZ = p.fuselage[0].z;
    const noseY = p.fuselage[0].y ?? 0;
    const pitot = makeCylinderBetween(
      new THREE.Vector3(0, noseY, noseZ - 0.05),
      new THREE.Vector3(0, noseY, noseZ - 1.15), 0.018, m.metal, 5);
    this.group.add(pitot);

    // Dorsal spine. Prototype 2 sets `spine: null` to remove the old hump;
    // its upper line is part of the fuselage loft instead.
    if (p.spine !== null) {
      const spineSections = p.spine || [
        { z: -2.1, width: 0.32, height: 0.1, y: 0.92 },
        { z: -0.8, width: 0.44, height: 0.24, y: 1.0 },
        { z: 0.7, width: 0.47, height: 0.3, y: 0.99 },
        { z: 2.2, width: 0.38, height: 0.24, y: 0.9 },
        { z: 3.8, width: 0.24, height: 0.14, y: 0.78 },
        { z: 4.55, width: 0.06, height: 0.04, y: 0.7 },
      ];
      addMesh(this.group, loftFuselage(spineSections, 16, 1), m.body, true, true);
    }

    this._buildIntake();

    // Leading-edge root extensions.
    const lerxGeo = buildWing(p.lerx, { chordSegments: 4 });
    addMesh(this.group, lerxGeo, m.body, true, true);
    addMesh(this.group, mirrorGeometryX(lerxGeo), m.body, true, true);



    // No free-floating dorsal boxes: the old cosmetic antenna blocks hovered
    // above the loft and read as detached cubes. Keep the skin clean.
  }

  _buildIntake() {
    const p = this.profile;
    const m = this.mats;
    const intake = p.intake;
    const seamOverlap = intake.seamOverlap ?? 0;
    const sections = intake.sections.map((section) => ({
      ...section,
      y: (section.y ?? 0) + seamOverlap,
      roundness: section.roundness ?? 0.66,
    }));
    const innerSections = (intake.innerSections || sections.map((section, i) => ({
      ...section,
      z: section.z + 0.02,
      width: section.width * (0.82 - i * 0.035),
      height: section.height * (0.82 - i * 0.035),
      roundness: 0.7 + i * 0.025,
    }))).map((section) => ({
      ...section,
      y: (section.y ?? 0) + seamOverlap,
      roundness: section.roundness ?? 0.7,
    }));

    // The cowl is open at the front; its first ring is the exact outer edge of
    // the lip. The dark inner duct starts just behind that same ring.
    addMesh(this.group,
      loftFuselage(sections, 32, 1, { capStart: false, capEnd: true }),
      m.body, true, true);
    addMesh(this.group,
      loftFuselage(innerSections, 32, 1, { capStart: false, capEnd: true }),
      m.intakeDuct, false, false);

    const outer = sections[0];
    const inner = innerSections[0];
    const lip = addMesh(this.group,
      buildIntakeLipGeometry({
        outerWidth: outer.width * 1.005,
        outerHeight: outer.height * 1.005,
        innerWidth: inner.width * 0.995,
        innerHeight: inner.height * 0.995,
        depth: intake.lipDepth ?? 0.1,
        roundness: outer.roundness ?? 0.62,
        segments: 44,
      }), m.body, true, false);
    lip.position.set(outer.xOffset ?? 0, outer.y ?? 0, outer.z);

    // Internal boundary-layer splitter: 0.25 m aft of the lip, vertical, with
    // its top and bottom edges touching the inner duct walls.
    const splitZ = outer.z + 0.25;
    let splitSection = innerSections[0];
    for (let i = 0; i < innerSections.length - 1; i++) {
      const a = innerSections[i];
      const b = innerSections[i + 1];
      if (splitZ >= a.z && splitZ <= b.z) {
        const t = (splitZ - a.z) / Math.max(1e-4, b.z - a.z);
        splitSection = {
          y: a.y + (b.y - a.y) * t,
          height: a.height + (b.height - a.height) * t,
        };
        break;
      }
    }
    const splitTop = splitSection.y + splitSection.height;
    const splitBottom = splitSection.y - splitSection.height * 0.88;
    const splitter = new THREE.Mesh(
      new THREE.BoxGeometry(0.020, splitTop - splitBottom, 0.08), m.metal);
    splitter.position.set(
      outer.xOffset ?? 0, (splitTop + splitBottom) * 0.5, splitZ + 0.04);
    this.group.add(splitter);

    // Compressor face inside the elliptical duct. The fan is placed on the
    // duct centreline and sized from the inner lip, so no blade pokes through
    // the cowl or floats outside the intake.
    if (!intake.noFan) {
      const fanY = inner.y ?? -0.18;
      const fanZ = (inner.z ?? sections[0].z) + 0.72;
      const fanW = inner.width * 0.90;
      const fanH = inner.height * 0.90;
      const fanBack = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32), m.dark);
      fanBack.scale.set(fanW * 0.98, fanH * 0.98, 1);
      fanBack.position.set(0, fanY, fanZ + 0.16);
      fanBack.rotation.y = Math.PI;
      this.group.add(fanBack);

      const fanFace = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32), m.dark);
      fanFace.scale.set(fanW, fanH, 1);
      fanFace.position.set(0, fanY, fanZ);
      fanFace.rotation.y = Math.PI;
      this.group.add(fanFace);

      // Deep shadowed intake: no bright blades. A dark cap closes the duct so
      // no sky can show through the fan gaps, with only faint duct rings.
      const darkCap = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32), m.dark);
      darkCap.scale.set(fanW * 1.04, fanH * 1.04, 1);
      darkCap.position.set(0, fanY, fanZ + 0.05);
      darkCap.rotation.y = Math.PI;
      this.group.add(darkCap);

      for (const [z, scale] of [
        [inner.z + 0.24, 0.92], [inner.z + 1.55, 0.84],
      ]) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.015, 4, 32), m.intakeVane);
        ring.scale.set(inner.width * scale, inner.height * scale, 1);
        ring.position.set(0, fanY, z);
        this.group.add(ring);
      }
    }

  }

  _wingSurfaceY(x) {
    const wing = this.profile.wing;
    if (x <= wing[0].x) return wing[0].y;
    for (let i = 0; i < wing.length - 1; i++) {
      const a = wing[i];
      const b = wing[i + 1];
      if (x <= b.x) {
        const t = (x - a.x) / Math.max(0.001, b.x - a.x);
        return a.y + (b.y - a.y) * t;
      }
    }
    return wing[wing.length - 1].y;
  }

  _buildWings() {
    const p = this.profile;
    const m = this.mats;
    const wingGeo = buildWing(p.wing, { chordSegments: 9 });
    addMesh(this.group, wingGeo, m.body, true, true);
    addMesh(this.group, mirrorGeometryX(wingGeo), m.body, true, true);

    const makeSurface = (spec, kind, side) => {
      let geo = buildControlPlate(spec.inner, spec.outer, spec.chord, 0.055, 0.8);
      if (side < 0) geo = mirrorGeometryX(geo);
      const group = new THREE.Group();
      group.position.set(0, spec.y, spec.hingeZ);
      const mesh = addMesh(group, geo, m.body, true, true);
      this.group.add(group);
      this.parts[kind].push({ group, mesh, side });
    };
    if (p.flapPanels) {
      // Two independent flap pairs per wing. They hinge on the straight-cut
      // trailing edge so no flap is buried inside the wing skin.
      for (const side of [1, -1]) {
        for (const panelSpec of p.flapPanels) {
          let geo = buildControlPlate(
            panelSpec.inner, panelSpec.outer, panelSpec.chord,
            panelSpec.thickness, panelSpec.taper ?? 0.86);
          if (side < 0) geo = mirrorGeometryX(geo);
          const group = new THREE.Group();
          group.position.set(0, p.flapY, p.flapHingeZ);
          addMesh(group, geo, m.body, true, true);
          this.group.add(group);
          this.parts.flaps.push({
            group, side, role: panelSpec.role ?? 'flap',
            mesh: group.children[0],
          });
        }
      }
    } else {
      for (const side of [1, -1]) {
        makeSurface(p.flap, 'flaps', side);
        makeSurface(p.aileron, 'ailerons', side);
      }
    }

    // Pylons are permanent, missiles are detachable. Their height is derived
    // from the wing underside and the missile body so they cannot float.
    for (const hp of p.hardpoints) {
      const wingY = this._wingSurfaceY(hp.x);
      if (!hp.rail) {
        const missileTop = hp.y + (hp.type === 'r73' ? 0.078 : 0.068);
        // Embed the pylon top into the wing skin instead of leaving a visible
        // air gap under the wing that reads as a floating box.
        const topY = wingY + 0.025;
        const height = Math.max(0.1, topY - missileTop);
        const pylon = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, height, 0.9), m.dark);
        pylon.position.set(hp.x, topY - height * 0.5, hp.z);
        pylon.castShadow = true;
        this.group.add(pylon);
      } else {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 1.55), m.dark);
        rail.position.set(hp.x, wingY + 0.012, hp.z);
        rail.castShadow = true;
        this.group.add(rail);
      }
    }
  }

  _buildTail() {
    const p = this.profile;
    const m = this.mats;

    // Prototype 2's fin is carried by a square-section tail beam. The beam ends
    // exactly at the engine/nozzle rear face; the fin TE stops short of it.
    if (p.tailBeam) {
      const b = p.tailBeam;
      const length = b.endZ - b.startZ;
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(b.width, b.height, length), m.body);
      beam.position.set(0, b.y, (b.startZ + b.endZ) * 0.5);
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.group.add(beam);
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(b.width * 0.76, 0.035, length), m.body);
      cap.position.set(0, b.y + b.height * 0.5 + 0.017,
        (b.startZ + b.endZ) * 0.5);
      cap.castShadow = true;
      this.group.add(cap);
      const endCap = new THREE.Mesh(
        new THREE.BoxGeometry(b.width + 0.012, b.height + 0.012, 0.035),
        m.body);
      endCap.position.set(0, b.y, b.endZ - 0.0175);
      this.group.add(endCap);

      // Half-height saddle under the forward half of the beam. It fills the
      // air gap between beam bottom and fuselage top and tapers from a narrow
      // nose at Z=4.2 instead of ending in a vertical face.
      const beamBottom = b.y - b.height * 0.5;
      const fairing = [
        { z: 4.20, width: 0.08, height: 0.026 },
        { z: 4.80, width: 0.18, height: 0.037 },
        { z: 5.60, width: 0.25, height: 0.045 },
        { z: 6.20, width: 0.28, height: 0.050 },
        { z: 6.90, width: 0.28, height: 0.059 },
      ];
      for (const sec of fairing) {
        // Top exactly on beam underside; lower edge follows the body crown.
        sec.y = beamBottom - sec.height;
      }
      addMesh(this.group, loftFuselage(fairing, 20, 1, {
        capStart: true, capEnd: false,
      }), m.body, true, true);
    }

    // Pivot fairings bridge the fuselage side to the stabilator root. The
    // stabilator itself starts outboard of the engine with a small air gap.
    for (const side of [1, -1]) {
      const fairing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.050, 0.060, 0.10, 10), m.body);
      fairing.rotation.z = Math.PI / 2;
      fairing.position.set(side * 0.62, p.htailPivot.y, p.htailPivot.z);
      fairing.castShadow = true;
      this.group.add(fairing);
    }

    // All-moving horizontal stabilators.
    for (const side of [1, -1]) {
      let geo = buildWing(p.htail.map((sec) => ({
        ...sec,
        x: sec.x - p.htailPivot.x,
        zLE: sec.zLE - p.htailPivot.z,
        zTE: sec.zTE - p.htailPivot.z,
        y: sec.y - p.htailPivot.y,
      })), { chordSegments: 7 });
      if (side < 0) geo = mirrorGeometryX(geo);
      const group = new THREE.Group();
      group.position.set(side * p.htailPivot.x, p.htailPivot.y, p.htailPivot.z);
      addMesh(group, geo, m.body, true, true);
      this.group.add(group);
      this.parts.stabilators.push({ group, side });
    }

    // Vertical tails.
    p.fins.forEach((fin) => {
      const group = new THREE.Group();
      group.position.set(fin.x, 0, 0);
      group.rotation.z = fin.cant;
      const geo = buildFin(fin.sections, { chordSegments: 7 });
      addMesh(group, geo, m.body, true, true);

      // Rudder panel. Anchors are derived from the fin root trailing edge so
      // prototype 2 can move the whole fin forward without leaving decals behind.
      const root = fin.sections[0];
      const last = fin.sections[fin.sections.length - 1];
      const rootTE = root.zTE;
      const height = last.y - root.y;
      const rudderGroup = new THREE.Group();
      // Restore the original full-height fin silhouette. The rudder is a thin
      // trailing-edge panel whose aft edge is flush with Z=7.30, so it does not
      // protrude as a slab but still moves with rudder input.
      const rudderChord = 0.38;
      rudderGroup.position.set(
        0, root.y + height * 0.5, rootTE - rudderChord);
      const rudderGeo = new THREE.BoxGeometry(
        0.065, height * 0.90, rudderChord);
      const rudder = new THREE.Mesh(rudderGeo, m.body);
      rudder.position.set(0, 0, rudderChord * 0.5);
      rudder.castShadow = true;
      rudderGroup.add(rudder);
      group.add(rudderGroup);
      this.parts.rudders.push({ group: rudderGroup, side: Math.sign(fin.x) || 1 });

      // Tail serial, both sides.
      const decalMat = new THREE.MeshBasicMaterial({
        map: this.mats.serial.map,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.DoubleSide,
      });
      const starMat = new THREE.MeshBasicMaterial({
        map: this.mats.insignia.map,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.DoubleSide,
      });
      for (const s of [1, -1]) {
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), decalMat);
        decal.position.set(s * 0.075, 1.45, rootTE - 0.60);
        decal.rotation.y = s * Math.PI / 2;
        group.add(decal);
        const star = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), starMat);
        star.position.set(s * 0.078, 2.15, rootTE - 0.85);
        star.rotation.y = s * Math.PI / 2;
        group.add(star);
      }

      this.group.add(group);
    });

    // Ventral fins: one under each side of the aft fuselage. The root section
    // is embedded a little into the belly so the fin cannot appear to float.
    for (const f of p.ventralFins) {
      const zMid = (f.zLE + f.zTE) * 0.5;
      const shapeFin = new THREE.Group();
      shapeFin.position.set(f.x, f.y, zMid);
      shapeFin.rotation.z = f.cant;
      const geo = buildFin([
        {
          y: -f.height,
          zLE: f.zLE - zMid + 0.12,
          zTE: f.zTE - zMid - 0.12,
          thickness: 0.032,
        },
        {
          y: 0.22,
          zLE: f.zLE - zMid,
          zTE: f.zTE - zMid,
          thickness: 0.045,
        },
      ], { chordSegments: 4 });
      const mesh = addMesh(shapeFin, geo, m.dark, true, false);
      this.group.add(shapeFin);
    }

    // Speed-brake visual geometry removed (it read as a floating panel).
    // The airbrake aerodynamic effect remains fully active through
    // systems.airbrake; only the mesh is gone.
  }

  _buildEngines() {
    const p = this.profile;
    const m = this.mats;
    for (const eng of p.engines) {
      const group = buildNozzleAssembly(m, eng.radius);
      group.position.set(eng.x, eng.y, eng.z);
      const inner = group.userData.inner;

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(eng.radius * 0.68, 24),
        new THREE.MeshBasicMaterial({
          color: '#ff7a32',
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }));
      glow.position.z = 0.60;
      group.add(glow);

      const outerFlameMat = makeAfterburnerMaterial(false);
      const coreFlameMat = makeAfterburnerMaterial(true);
      const outerFlame = new THREE.Mesh(
        new THREE.CylinderGeometry(eng.radius * 0.22, eng.radius * 0.8, 3.4, 18, 1, true),
        outerFlameMat);
      outerFlame.rotation.x = Math.PI / 2;
      outerFlame.position.z = 2.05;
      outerFlame.visible = false;
      group.add(outerFlame);
      const coreFlame = new THREE.Mesh(
        new THREE.CylinderGeometry(eng.radius * 0.08, eng.radius * 0.38, 2.0, 14, 1, true),
        coreFlameMat);
      coreFlame.rotation.x = Math.PI / 2;
      coreFlame.position.z = 1.28;
      coreFlame.visible = false;
      group.add(coreFlame);

      // The exhaust glow is emissive/additive geometry. A real PointLight per
      // nozzle would change the scene's light count whenever a bandit becomes
      // visible or dies, forcing Three.js to recompile every material in the
      // scene — the exact radar-contact / kill hitch this build avoids.
      const light = new THREE.PointLight(0xff7a32, 0, 20, 2);
      light.visible = false;
      light.position.z = 1.4;
      group.add(light);

      this.group.add(group);
      this.parts.nozzles.push({ group, glow, inner, light, engine: eng });
      this.parts.flames.push({ outer: outerFlame, core: coreFlame, outerMat: outerFlameMat, coreMat: coreFlameMat });
    }
  }

  _buildLandingGear() {
    const p = this.profile;
    const m = this.mats;
    const makeWheel = (radius, width) => {
      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, width, 16), m.tire);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.46, radius * 0.46, width * 1.05, 12), m.gear);
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(hub);
      return wheelGroup;
    };

    const makeGear = (spec, side, nose) => {
      const group = new THREE.Group();
      group.position.set(spec.x, spec.y, spec.z);
      const top = new THREE.Vector3(0, 0, 0);
      const bottom = new THREE.Vector3(0, -spec.strut, 0);
      group.add(makeCylinderBetween(top, bottom, nose ? 0.06 : 0.075, m.gear, 7));
      // The nose leg is a clean single strut; its old diagonal drag brace
      // crossed the intake skin and was the visible clipping rod.
      if (!nose) {
        const brace = makeCylinderBetween(
          new THREE.Vector3(side * 0.06, -0.1, 0.1),
          new THREE.Vector3(side * 0.16, -spec.strut * 0.62, -0.12),
          0.035, m.gear, 5);
        group.add(brace);
      }
      const wheel = makeWheel(spec.wheel, nose ? 0.22 : 0.28);
      wheel.position.set(0, -spec.strut, 0);
      group.add(wheel);
      if (nose) {
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 8, 6),
          new THREE.MeshBasicMaterial({ color: '#fff3cf', toneMapped: false }));
        light.position.set(0, -spec.strut + 0.1, 0.2);
        group.add(light);
      }
      this.group.add(group);
      this.parts.gear.push({ group, side, nose });
      this.parts.wheels.push(wheel);
    };

    makeGear(p.gear.nose, 0, true);

    // Main gear is a two-rod A-frame. From the front the inner pair forms 120°
    // at the belly centre; each outer rod is 25° away from its inner rod. The
    // wheels stay vertical because the wheel group itself is not rotated.
    const makeMainGear = (spec, side) => {
      const group = new THREE.Group();
      group.position.set(spec.x, spec.y, spec.z);
      const apex = new THREE.Vector3(-spec.x, spec.apexY - spec.y, 0);
      const axle = new THREE.Vector3(spec.axleX - spec.x, spec.axleY - spec.y, 0);
      group.add(makeCylinderBetween(apex, axle, 0.055, m.gear, 8));
      group.add(makeCylinderBetween(
        new THREE.Vector3(0, 0, 0), axle, 0.060, m.gear, 8));
      const axlePin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.26, 10), m.gear);
      axlePin.rotation.z = Math.PI / 2;
      axlePin.position.copy(axle);
      group.add(axlePin);
      const wheel = makeWheel(spec.wheel, 0.30);
      wheel.position.copy(axle);
      group.add(wheel);
      this.group.add(group);
      this.parts.gear.push({ group, side, nose: false, customMain: true });
      this.parts.wheels.push(wheel);
    };
    for (const main of p.gear.main) {
      if (main.axleX != null) {
        makeMainGear(main, Math.sign(main.x));
      } else {
        makeGear(main, Math.sign(main.x), false);
      }
    }

    // No external belly blisters: both the inner apex and the outer anchor are
    // inside the fuselage skin, so the rods attach directly to the belly.

    // Gear-door visuals removed: they were separate belly plates and read as
    // floating squares when the gear was retracted. The gear animation itself
    // remains intact.
    this.parts.gearDoors = [];
  }

  _buildStores() {
    if(this.config.visual?.cadModel||this.config.visual?.loadout)return;
    for (const hp of this.profile.hardpoints) {
      const missile = createMissile(hp.type, this.mats);
      missile.position.set(hp.x, hp.y, hp.z);
      missile.rotation.y = hp.x < 0 ? 0.0 : 0;
      this.group.add(missile);
      this.parts.missiles.push(missile);
      this.parts.missileTypes.push(hp.type);
      const type=hp.type==='aim120'?'aim120c':hp.type==='aim9'?'aim9m':hp.type;
      this.cadMountedStores.push({group:missile,type,storeId:type,x:hp.x,category:'missile',remaining:1});
    }
  }

  setVisualLoadout(loadout) {
    if (!this.config.visual) return;
    this.config.visual.loadout = loadout;
    for (const tank of this.mountedTanks) {
      this.group.remove(tank);
      tank.traverse((object) => {
        object.geometry?.dispose?.();
        object.material?.map?.dispose?.();
        object.material?.dispose?.();
      });
    }
    this.mountedTanks = [];
    this._disposeCadLoadoutStores();
    for(const mesh of this.parts.missiles)mesh.parent?.remove(mesh);this.parts.missiles=[];this.parts.missileTypes=[];
    this._buildExternalTanks();
    this._buildCadLoadoutStores();
  }

  _disposeCadLoadoutStores() {
    for (const adapter of this.cadPylons) {
      adapter.parent?.remove(adapter);
      adapter.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    }
    this.cadPylons = [];
    for (const store of this.cadMountedStores) {
      if(store.released)continue;
      this.group.remove(store.group);
      store.group.traverse((object) => {
        object.geometry?.dispose?.();
        object.material?.map?.dispose?.();
        object.material?.dispose?.();
      });
    }
    this.cadMountedStores = [];
    this.releaseState={};
  }

  _buildCadLoadoutStores() {
    if (!this.config.visual?.cadModel) {
      const loadout=this.config.visual?.loadout;if(!loadout)return;
      const points={lt:[-5.02,.18,3.55],rt:[5.02,.18,3.55],lo:[-3.82,-.34,3.30],ro:[3.82,-.34,3.30],li:[-2.35,-.38,2.90],ri:[2.35,-.38,2.90],ctr:[0,-.74,2.70]};
      for(const [station,id]of Object.entries(loadout)){const pos=points[station];if(!id||!pos)continue;const group=createStoreModel(id),category=id.startsWith('fuel')?'tank':id.startsWith('aim')?'missile':id.startsWith('agm')?'agm':id.startsWith('gbu')?'guided':id==='litening'?'pod':'bomb';
        group.position.set(...pos);if(!['missile','agm'].includes(category))group.position.y-=.45;this.group.add(group);
        const type=id.startsWith('aim9')?'aim9m':id==='aim120c_chaff'?'aim120c':id;
        this.cadMountedStores.push({group,storeId:id,type,station,category,x:pos[0],remaining:1});
      }return;
    }
    const loadout = normalizeF16Loadout(this.config.visual.loadout || {});
    for (const spec of F16_STATIONS) {
      const id = loadout[spec.id];
      if (!id) {
        // The tip rails remain installed even when no weapon is loaded.
        if (spec.tip) {
          const empty = createF16Mount(spec, 'aim120c', { withStore: false });
          this.group.add(empty.adapter);
          this.cadPylons.push(empty.adapter);
        }
        continue;
      }
      const mount = createF16Mount(spec, id);
      mount.category=id.startsWith('fuel')?'tank':id.startsWith('aim')?'missile':id.startsWith('agm')?'agm':id.startsWith('gbu')?'guided':id==='litening'?'pod':'bomb';
      mount.type=mount.type||id;mount.x=spec.x;mount.remaining=1;
      this.group.add(mount.group, mount.adapter);
      this.cadPylons.push(mount.adapter);
      this.cadMountedStores.push(mount);
    }
  }

  _buildExternalTanks() { /* Tanks use the same station system as other stores. */ }

  _buildCockpit() {
    const p = this.profile;
    const m = this.mats;
    const interior = new THREE.Group();
    interior.name = 'cockpit-interior';
    this.parts.interior = interior;

    const eyeZ = p.cockpitEye[2];
    const eyeY = p.cockpitEye[1];
    const seatZ = p.cockpitSeat[2];
    const box = (w, h, d, x, y, z, mat = m.cockpit, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      interior.add(mesh);
      return mesh;
    };

    // Recessed cockpit trough. The fuselage loft has a real top cut-out; these
    // walls/floor close the hole and give the seat/panel somewhere to sit.
    const cutFront = p.canopy.position[2] - 0.70;
    const cutRear = p.canopy.position[2] + 0.85;
    const cutMid = (cutFront + cutRear) * 0.5;
    const cutLen = cutRear - cutFront;
    for (const side of [-1, 1]) {
      box(0.03, 0.58, cutLen, side * 0.30, 0.64, cutMid, m.cockpit);
    }
    box(0.60, 0.04, cutLen, 0, 0.35, cutMid, m.cockpit);
    box(0.60, 0.58, 0.04, 0, 0.64, cutFront, m.cockpit);
    box(0.60, 0.58, 0.04, 0, 0.64, cutRear, m.cockpit);

    // Thin oval cockpit rim, matching the canopy base ellipse. It sits flush
    // with the fuselage skin, so it reads as an oval opening rather than a
    // rectangular hatch or a raised deck.
    const rim = new THREE.Mesh(makeCockpitDeck({
      innerX: p.canopy.scale[0] * 0.997,
      innerZ: p.canopy.scale[2] * 0.997,
      outerX: p.canopy.scale[0] + (p.bubbleCanopy ? 0.04 : 0.12),
      outerZ: p.canopy.scale[2] + (p.bubbleCanopy ? 0.04 : 0.14),
      thickness: 0.020,
      segments: 64,
    }), m.body);
    const rimY = p.cockpitRimY ?? 0.992;
    const rimTilt = p.cockpitRimTilt ?? 0;
    rim.position.set(0, rimY, p.canopy.position[2]);
    rim.rotation.x = rimTilt;
    interior.add(rim);
    this.parts.cockpitRim = rim;

    // Dark inner coaming ring: closes the annular gap between the tub and the
    // oval rim so the transparent canopy never shows terrain through the sides.
    const coaming = new THREE.Mesh(makeCockpitDeck({
      innerX: 0.28,
      innerZ: 0.85,
      outerX: p.bubbleCanopy
        ? p.canopy.scale[0] * 0.80
        : p.canopy.scale[0] * 0.985,
      outerZ: p.canopy.scale[2] * 0.985,
      thickness: 0.035,
      segments: 64,
    }), m.cockpit);
    coaming.position.set(0, rimY - 0.026, p.canopy.position[2]);
    coaming.rotation.x = rimTilt;
    interior.add(coaming);
    this.parts.cockpitCoaming = coaming;

    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 1.15), m.cockpit);
    tub.position.set(0, 0.42, p.cockpitSeat[2] - 0.15);
    interior.add(tub);

    // Side consoles, walls and centre pedestal.
    for (const side of [-1, 1]) {
      box(0.12, 0.07, 1.12, side * 0.27, 0.52, eyeZ - 0.13, m.cockpit);
      box(0.03, 0.30, 1.32, side * 0.35, 0.70, eyeZ - 0.08, m.cockpit);
      box(0.08, 0.026, 0.16, side * 0.20, 0.32, eyeZ - 0.95, m.gear, -0.28);
      // Coaming fills the gap between the inner wall and the oval rim; without
      // it the transparent canopy shows the terrain through the side opening.
      const coamX0 = 0.28;
      const coamX1 = p.bubbleCanopy
        ? p.canopy.scale[0] * 0.76
        : p.canopy.scale[0] * 0.985;
      if (!p.bubbleCanopy) {
        box(coamX1 - coamX0, 0.06, 2.10,
          side * (coamX0 + coamX1) * 0.5, 0.958, eyeZ - 0.10, m.cockpit);
      }
    }
    // The bubble's lower shell tucks into the fuselage, so the old black
    // side-sill boxes are omitted entirely (they poked out as dark blocks).
    if (!p.bubbleCanopy) {
      const sillHalf = p.canopy.scale[0] * 0.985;
      box(sillHalf * 2, 0.06, 0.09, 0, 0.958, cutFront + 0.055, m.cockpit);
      box(sillHalf * 2, 0.06, 0.09, 0, 0.958, cutRear - 0.055, m.cockpit);
    }
    box(0.16, 0.08, 0.82, 0, 0.47, eyeZ - 0.10, m.cockpit);
    box(0.20, 0.18, 0.18, 0, 0.60, eyeZ - 0.54, m.cockpit);
    // Throttle quadrant (left console).
    box(0.09, 0.08, 0.26, -0.28, 0.59, eyeZ + 0.16, m.dark);
    box(0.03, 0.14, 0.045, -0.28, 0.67, eyeZ + 0.16, m.gear, -0.28);
    // A few console switches.
    for (let i = 0; i < 4; i++) {
      box(0.026, 0.016, 0.045, 0.25, 0.565,
        eyeZ - 0.46 - i * 0.15, i === 1 ? m.warningRed : m.gear);
    }

    const seat = new THREE.Group();
    seat.position.set(...p.cockpitSeat);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.44), m.cockpit);
    cushion.position.y = 0.05;
    seat.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.12), m.cockpit);
    back.position.set(0, 0.31, 0.20);
    back.rotation.x = -0.16;
    seat.add(back);
    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.17, 0.13), m.cockpit);
    headrest.position.set(0, 0.60, 0.21);
    headrest.rotation.x = -0.16;
    seat.add(headrest);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.50, 0.075), m.gear);
      rail.position.set(side * 0.23, 0.29, 0.22);
      seat.add(rail);
      const harness = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.38, 0.016), m.dark);
      harness.position.set(side * 0.09, 0.30, 0.15);
      harness.rotation.x = -0.16;
      seat.add(harness);
    }
    const survivalKit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.10, 0.27), m.cockpit);
    survivalKit.position.set(0, -0.02, -0.24);
    seat.add(survivalKit);
    interior.add(seat);

    const panelZ = eyeZ - 0.86;
    // Main instrument panel and glareshield.
    box(0.70, 0.38, 0.09, 0, 0.66, panelZ, m.cockpit, -0.18);
    box(0.74, 0.055, 0.28, 0, 0.86, panelZ + 0.11, m.cockpit, -0.12);
    box(0.20, 0.04, 0.12, 0, 0.93, panelZ + 0.06, m.cockpit, -0.16);
    box(0.03, 0.018, 0.20, 0, 0.835, panelZ + 0.02, m.gear);
    // Analog gauges: enough to read as an F-16A panel, not a simulator.
    const gaugeMat = new THREE.MeshBasicMaterial({
      color: '#101818', toneMapped: false,
    });
    const gaugePositions = [
      [-0.22, 0.76], [-0.07, 0.76], [0.07, 0.76], [0.22, 0.76],
      [-0.18, 0.58], [-0.04, 0.58], [0.10, 0.58], [0.23, 0.58],
    ];
    for (const [gx, gy] of gaugePositions) {
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.040, 0.040, 0.009, 14), m.gear);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(gx, gy, panelZ + 0.060);
      interior.add(rim);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.031, 14), gaugeMat);
      face.position.set(gx, gy, panelZ + 0.066);
      interior.add(face);
      const needle = new THREE.Mesh(
        new THREE.BoxGeometry(0.004, 0.025, 0.003), m.warningWhite);
      needle.position.set(gx, gy + 0.009, panelZ + 0.072);
      needle.rotation.z = (gx * 3.1 + gy * 2.0) % 1.2 - 0.6;
      interior.add(needle);
    }
    // Small centre MFD.
    const mfd = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), m.screen);
    mfd.position.set(0, 0.67, panelZ + 0.072);
    interior.add(mfd);
    box(0.19, 0.14, 0.014, 0, 0.67, panelZ + 0.062, m.cockpit);
    for (let i = 0; i < 3; i++) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 6, 4),
        i === 0 ? m.warningRed : i === 1 ? m.warningGreen : m.warningWhite);
      lamp.position.set(0.27, 0.81 - i * 0.04, panelZ + 0.072);
      interior.add(lamp);
    }

    // HUD combiner: a rectangular glass sheet with a reticle painted on it.
    // Black side rails only; no top frame, so the forward view stays open.
    const hudZ = p.cockpitEye[2] - 0.55;
    // Trim a quarter off the glass height and drop the eye line by the same
    // 0.04 m so the reticle stays on the glass centre.
    const hudEyeY = p.cockpitEye[1] + 0.02;
    // HUD projector sits on the glareshield instead of floating in front of it.
    box(0.20, 0.06, 0.14, 0, 0.97, panelZ + 0.12, m.cockpit, -0.12);
    const glassW = 0.18;
    const glassH = 0.12;
    const railBottom = 0.84;
    const railTop = hudEyeY + glassH * 0.5;
    const rootZ = hudZ + 0.18;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, railTop - railBottom, 0.014), m.dark);
      rail.position.set(side * (glassW * 0.5 + 0.012),
        (railTop + railBottom) * 0.5, rootZ);
      interior.add(rail);
    }
    // Black root bar ties the glass assembly to the cockpit deck.
    box(glassW + 0.05, 0.026, 0.040, 0, railBottom + 0.013, rootZ, m.dark);
    const combiner = new THREE.Mesh(
      new THREE.PlaneGeometry(glassW, glassH),
      new THREE.MeshBasicMaterial({
        map: makeHudGlassTexture(), color: '#baffd1',
        transparent: true, opacity: 0.82,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
      }));
    // Centre the glass on the pilot's forward axis so its reticle projects
    // onto the same infinity point as the nose/gun boresight.
    combiner.position.set(0, hudEyeY, hudZ);
    combiner.rotation.x = -0.1;
    combiner.renderOrder = 3;
    interior.add(combiner);
    this.parts.hudGlass = combiner;

    // Canopy bows only. The long side rails were the two abrupt black lines;
    // a frameless acrylic canopy reads cleaner from the outside.
    box(0.62, 0.018, 0.018, 0, 0.84, eyeZ - 0.92, m.dark);
    box(0.58, 0.018, 0.018, 0, 0.76, eyeZ + 0.82, m.dark);
    // Ejection handle.
    const eject = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.010, 4, 12), m.gear);
    eject.position.set(0, 0.98, seatZ + 0.10);
    eject.rotation.x = Math.PI / 2;
    interior.add(eject);

    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.38, 8), m.gear);
    stick.position.set(0, 0.43, eyeZ - 0.38);
    interior.add(stick);
    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m.dark);
    grip.position.set(0, 0.61, eyeZ - 0.38);
    interior.add(grip);
    box(0.022, 0.025, 0.03, 0, 0.63, eyeZ - 0.44, m.warningRed);

    // Pilot visible in external views. Simple rod limbs with the hands on the
    // stick/throttle; no need for a detailed character model.
    const pilot = new THREE.Group();
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 8), m.dark);
    helmet.scale.set(0.9, 1, 1.05);
    helmet.position.set(0, 0.90, p.cockpitSeat[2] - 0.16);
    helmet.castShadow = false;
    pilot.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.09), m.gear);
    visor.position.set(0, 0.92, p.cockpitSeat[2] - 0.34);
    pilot.add(visor);
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.21, 0.42, 8), m.dark);
    torso.position.set(0, 0.64, p.cockpitSeat[2] + 0.07);
    pilot.add(torso);
    const limb = (a, b, radius, mat = m.dark) => {
      const rod = makeCylinderBetween(a, b, radius, mat, 6);
      rod.castShadow = false;
      pilot.add(rod);
      return rod;
    };
    const hand = (x, y, z) => {
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5), m.gear);
      glove.position.set(x, y, z);
      pilot.add(glove);
    };
    for (const side of [-1, 1]) {
      // Thigh and shin to the rudder pedals.
      const hip = new THREE.Vector3(side * 0.11, 0.50, p.cockpitSeat[2] - 0.06);
      const knee = new THREE.Vector3(side * 0.16, 0.34, p.cockpitSeat[2] - 0.70);
      const foot = new THREE.Vector3(side * 0.14, 0.27, p.cockpitSeat[2] - 1.30);
      limb(hip, knee, 0.042, m.gear);
      limb(knee, foot, 0.036, m.gear);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.22), m.dark);
      boot.position.set(side * 0.14, 0.23, p.cockpitSeat[2] - 1.36);
      pilot.add(boot);
      // Shoulder to elbow.
      const shoulder = new THREE.Vector3(side * 0.16, 0.82, p.cockpitSeat[2] - 0.02);
      const elbow = new THREE.Vector3(side * 0.22, 0.66, p.cockpitSeat[2] - 0.48);
      limb(shoulder, elbow, 0.030, m.gear);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 5), m.gear);
      glove.position.copy(elbow);
      pilot.add(glove);
    }
    // Right forearm reaches the stick, left forearm the throttle.
    const rightElbow = new THREE.Vector3(0.22, 0.66, p.cockpitSeat[2] - 0.48);
    const rightHand = new THREE.Vector3(0, 0.64, p.cockpitSeat[2] - 0.88);
    limb(rightElbow, rightHand, 0.028, m.gear);
    hand(rightHand.x, rightHand.y, rightHand.z);
    const leftElbow = new THREE.Vector3(-0.22, 0.66, p.cockpitSeat[2] - 0.48);
    const leftHand = new THREE.Vector3(-0.27, 0.66, p.cockpitSeat[2] - 0.34);
    limb(leftElbow, leftHand, 0.028, m.gear);
    hand(leftHand.x, leftHand.y, leftHand.z);
    // The pilot is part of the external silhouette. The cockpit tub, HUD and
    // seat are hidden while the canopy is closed (otherwise the tall HUD rails
    // float above the glass), and shown from inside or with the canopy open.
    this.group.add(pilot);
    this.parts.pilot = pilot;

    this.group.add(interior);
    interior.visible = false;

    // Canopy bubble. The bubble and its side rails form one sliding rig.
    const canopyRig = new THREE.Group();
    canopyRig.name = 'canopy-rig';
    this.group.add(canopyRig);
    this.parts.canopyRig = canopyRig;
    let bubble = null;
    let canopy;
    if (p.bubbleCanopy) {
      const bc = p.bubbleCanopy;
      const built = buildBubbleCanopy({
        frontZ: p.canopy.frameZ[0],
        rearZ: p.canopy.frameZ[1],
        rimY: p.cockpitRimY ?? 1.0,
        rimTilt: p.cockpitRimTilt ?? 0,
        halfWidth: bc.halfWidth,
        halfHeight: bc.halfHeight,
        baseScale: bc.baseScale ?? 0.10,
        peakFraction: bc.peakFraction ?? 0.40,
        sillOffset: bc.sillOffset ?? 0,
      });
      bubble = built;
      canopy = new THREE.Mesh(built.geometry, m.glass);
      canopy.position.set(0, 0, built.zc);
      // Thin Fresnel reflection shell: clear in the middle, bright at grazing
      // angles, so the bubble reads as glass without hiding the pilot.
      const shell = new THREE.Mesh(
        built.geometry, makeCanopyReflectionMaterial());
      shell.scale.setScalar(1.008);
      shell.renderOrder = 4;
      canopy.add(shell);
    } else {
      canopy = new THREE.Mesh(
        new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2),
        m.glass);
      canopy.position.set(...p.canopy.position);
      canopy.scale.set(...p.canopy.scale);
    }
    canopy.renderOrder = 3;
    canopyRig.add(canopy);
    this.parts.canopy = canopy;

    // No external side tubes: together with the inner rails they formed the two
    // very prominent black lines over the fuselage. Prototype 2 adds only the
    // two transverse canopy bows called for by the reference document.
    const frame = new THREE.Group();
    if (p.canopyArches && bubble) {
      const bc = p.bubbleCanopy;
      const halfLength = (p.canopy.frameZ[1] - p.canopy.frameZ[0]) * 0.5;
      for (const z of [p.canopy.frameZ[0] + 0.03, p.canopy.frameZ[1] - 0.03]) {
        const zr = z - bubble.zc;
        const arch = Math.sqrt(Math.max(0, 1 - (zr / halfLength) ** 2));
        const a = bc.halfWidth * ((bc.baseScale ?? 0.46) +
          (1 - (bc.baseScale ?? 0.46)) * arch);
        const b = bc.halfHeight * ((bc.baseScale ?? 0.46) +
          (1 - (bc.baseScale ?? 0.46)) * arch);
        const sillY = (p.cockpitRimY ?? 1.0) * Math.cos(p.cockpitRimTilt ?? 0) -
          zr * Math.sin(p.cockpitRimTilt ?? 0);
        const yc = sillY + b * Math.SQRT1_2;
        const points = [];
        for (let i = 0; i <= 24; i++) {
          const th = -Math.PI / 4 + (i / 24) * Math.PI * 1.5;
          points.push(new THREE.Vector3(
            Math.cos(th) * a, yc + Math.sin(th) * b, z));
        }
        addTube(frame, points, 0.006, m.dark, 18);
      }
    } else if (p.canopyArches) {
      const rx = p.canopy.scale[0];
      const ry = p.canopy.scale[1];
      const rz = p.canopy.scale[2];
      const cy = p.canopy.position[1];
      const cz = p.canopy.position[2];
      for (const z of [p.canopy.frameZ[0] + 0.16, p.canopy.frameZ[1] - 0.16]) {
        const f = Math.sqrt(Math.max(0, 1 - ((z - cz) / rz) ** 2));
        const xr = rx * f;
        const yr = ry * f;
        if (xr < 0.02) continue;
        const points = [];
        for (let i = 0; i <= 12; i++) {
          const x = -xr + (2 * xr * i) / 12;
          const y = cy + yr * Math.sqrt(Math.max(0, 1 - (x / xr) ** 2));
          points.push(new THREE.Vector3(x, y, z));
        }
        addTube(frame, points, 0.010, m.dark, 18);
      }
    }
    canopyRig.add(frame);
    this.parts.canopyFrame = frame;
  }

  _buildLightsAndDecals() {
    const p = this.profile;
    const m = this.mats;
    const createNav = (pos, material, scale = 1) => {
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.07 * scale, 8, 6), material);
      light.position.set(...pos);
      this.group.add(light);
      return light;
    };
    const lastWing = p.wing[p.wing.length - 1];
    const wingTipY = lastWing.y + 0.045;
    const wingTipZ = (lastWing.zLE + lastWing.zTE) * 0.5;
    createNav([-lastWing.x + 0.1, wingTipY, wingTipZ], m.warningRed);
    createNav([lastWing.x - 0.1, wingTipY, wingTipZ], m.warningGreen);
    const tailZ = p.fuselage[p.fuselage.length - 1].z;
    const strobe = createNav([0, 0.58, tailZ + 0.02], m.warningWhite, 1.1);
    this.parts.strobes.push(strobe);
    for (const eng of p.engines) {
      const strobe2 = createNav([eng.x, eng.y + 0.4, eng.z - 0.2], m.warningWhite, 0.7);
      this.parts.strobes.push(strobe2);
    }

    // Wing insignia (upper surface).
    const decalGeo = new THREE.PlaneGeometry(1.5, 1.15);
    decalGeo.rotateX(-Math.PI / 2);
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(decalGeo, m.insignia);
      decal.position.set(side * 3.1, this._wingSurfaceY(3.1) + 0.008,
        p.wingInsigniaZ ?? 1.75);
      decal.renderOrder = 2;
      this.group.add(decal);
    }

    // Fuselage side insignia / marks.
    const widthAt = (z) => {
      let best = p.fuselage[0];
      let bestD = Infinity;
      for (const sec of p.fuselage) {
        const d = Math.abs(sec.z - z);
        if (d < bestD) { bestD = d; best = sec; }
      }
      return best.width;
    };
    for (const side of [-1, 1]) {
      const insignia = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.65), m.insignia);
      insignia.position.set(side * widthAt(-0.45) * 0.95, 0.24, -0.45);
      insignia.rotation.y = side * Math.PI / 2;
      insignia.renderOrder = 2;
      this.group.add(insignia);

      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.3), new THREE.MeshBasicMaterial({
          map: m.serial.map, transparent: true, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -2,
          side: THREE.DoubleSide,
        }));
      mark.position.set(side * widthAt(1.0) * 0.96, 0.42, 1.0);
      mark.rotation.y = side * Math.PI / 2;
      this.group.add(mark);
    }

    // Cannon port only: the old external barrel floated beside the intake.
    // A short flush muzzle keeps the gun position without a detached tube.
    // No protruding gun fairing: the old port cylinder read as a floating pod.
    // Keep only the muzzle position for the attached flash / firing origin.
    const muzzle = new THREE.Vector3(...(this.config.visual?.cadModel ? this.config.armament.cannon.muzzle : p.cannonMuzzle));

    // One attached muzzle flash texture. It never spawns world-space copies, so
    // a burst cannot leave a string of flashes behind the aircraft.
    // Shared VfxAtlas muzzle flash (same as J-16 / J-10C); it extends along +Z, so turn it forward.
    const flash=createVfxPlume(0);
    flash.position.copy(muzzle);
    flash.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(this.config.visual?.cadModel?-.12:0,this.config.visual?.cadModel?.02:0,-1).normalize());
    flash.visible=false;this.group.add(flash);this.parts.muzzleFlash=flash;

    if(this.config.visual?.cadModel){
      const port=new THREE.Mesh(new THREE.CircleGeometry(.042,32),new THREE.MeshStandardMaterial({color:0x090c0d,roughness:.87,side:THREE.DoubleSide}));
      port.position.set(muzzle.x,muzzle.y-.55,muzzle.z+.008);port.scale.y=.64;port.name='M61 flush gun port';
      this._cadGunPort=port;
    }
    this.parts.muzzle = muzzle.clone();
    this.parts.wingTips = [
      new THREE.Vector3(-4.7, wingTipY + 0.02, wingTipZ),
      new THREE.Vector3(4.7, wingTipY + 0.02, wingTipZ),
    ];
    this.parts.nozzleLocal = p.engines.map((e) =>
      new THREE.Vector3(e.x, e.y, e.z + 0.6));
  }

  /**
   * @param {number} dt
   * @param {object} flight FlightModel
   * @param {object} systems { gear, flaps, airbrake }
   * @param {object} weapons { missiles }
   * @param {object} options { cockpit }
   */
  sync(dt, flight, systems, weapons, options = {}) {
    this.lastSync = [0, flight, systems, weapons, {...options}];
    this.time += dt;
    this._lastSystems = systems;
    this._gunFiring = !!options.gunFiring;
    this.group.position.copy(options.position || flight.position);
    this.group.quaternion.copy(options.orientation || flight.orientation);

    const cockpit = options.cockpit ?? this.cockpitView;
    this.cockpitView = cockpit;
    if (!cockpit) {
      for (const object of this.externalObjects) object.visible = true;
    }
    if (this.parts.muzzleFlash) {
      const firing=!!options.gunFiring && !cockpit;
      updateVfxPlume(this.parts.muzzleFlash,{
        time:this.time,intensity:firing?.85+.15*Math.sin(this.time*157):0,length:.52,diameter:.30,
      });
    }

    const surfaces = flight.control.surfaces;
    const flapAngle = systems.flaps * 0.50;
    for (const flap of this.parts.flaps) {
      if (flap.role === 'aileron') {
        // Outboard pair is a flaperon: flaps down collectively, then
        // differential roll on top of it.
        flap.group.rotation.x = flapAngle * 0.55 -
          surfaces.aileron * 0.85 * flap.side;
      } else {
        flap.group.rotation.x = flapAngle;
      }
    }
    for (const aileron of this.parts.ailerons) {
      aileron.group.rotation.x = flapAngle * 0.55 -
        surfaces.aileron * 0.85 * aileron.side;
    }
    for (const stab of this.parts.stabilators) {
      // All-moving stabilators: collective pitch plus a small differential
      // taileron component for roll authority.
      stab.group.rotation.x = -surfaces.elevator * 0.82 -
        surfaces.aileron * 0.28 * stab.side;
    }
    for (const rudder of this.parts.rudders) {
      rudder.group.rotation.y = -surfaces.rudder * 0.75 * rudder.side;
    }
    for (const brake of this.parts.brake) {
      brake.group.rotation.z = brake.side * systems.airbrake * 0.98;
    }

    for (const door of this.parts.gearDoors) {
      door.mesh.visible = systems.gear > 0.012;
    }
    // Retract the three gear fairings up into the belly with the legs.
    const retractFairing = 1 - systems.gear;
    for (const fairing of this.parts.gearFairings) {
      fairing.mesh.visible = systems.gear > 0.015;
      fairing.mesh.position.y =
        fairing.baseY + retractFairing * fairing.travel;
    }
    for (const gear of this.parts.gear) {
      gear.group.visible = systems.gear > 0.012;
      // 0 = extended/down, 1 = retracted. Rotating the strut away from -Y at
      // low gear values (the old code did the opposite) left the wheels
      // horizontal while the aircraft sat on the runway.
      const retract = 1 - systems.gear;
      if (gear.nose) {
        // Kept vertical when extended; folds upward when retracted.
        gear.group.rotation.x = retract * Math.PI / 2;
        gear.group.rotation.z = 0;
      } else if (gear.customMain) {
        // The A-frame legs already provide the splay; the wheel group stays
        // vertical until the whole leg folds.
        gear.group.rotation.z = -gear.side * retract * Math.PI / 2;
        gear.group.rotation.x = 0;
      } else {
        gear.group.rotation.z =
          gear.side * (0.16 - retract * (Math.PI / 2 + 0.16));
        gear.group.rotation.x = 0;
      }
    }
    for (const door of this.parts.gearDoors) {
      // Closed door panels only in the clean gear-up configuration.
      door.mesh.visible = systems.gear < 0.02;
      door.mesh.rotation.x = 0;
    }

    const canopyAmount = clamp(systems.canopy ?? 0, 0, 1);
    const canopyEase = canopyAmount * canopyAmount * (3 - 2 * canopyAmount);
    this.canopyOpen = canopyEase > 0.06;
    this.parts.canopyRig.position.set(0, canopyEase * 0.48, canopyEase * 1.45);
    this.parts.canopyRig.rotation.x = -canopyEase * 0.04;
    // Prototype 2 is temporarily canopy-less while its exterior is redesigned.
    this.parts.canopyRig.visible = !this.profile.noCanopy && !cockpit;

    const missileCount = weapons?.missiles ?? this.parts.missiles.length;
    const remaining = weapons?.missileRemaining;
    const remainingNorm = {};
    if (remaining) {
      for (const [type, count] of Object.entries(remaining)) {
        remainingNorm[type.replace(/c$|m$/, '')] = count;
      }
    }
    const seenByType = {};
    this.parts.missiles.forEach((m, i) => {
      if(m.userData.storeReleased)return;
      if (remaining) {
        const type = (this.parts.missileTypes[i] || 'aim9').replace(/c$|m$/, '');
        const left = remainingNorm[type] ?? 0;
        const index = seenByType[type] || 0;
        seenByType[type] = index + 1;
        m.visible = index < left;
      } else {
        m.visible = i < missileCount;
      }
    });

    const ab = clamp(flight.afterburner ?? 0, 0, 1);
    for (const flame of this.parts.flames) {
      const visible = ab > 0.015;
      flame.outer.visible = visible;
      flame.core.visible = visible;
      const flicker = 0.94 + Math.sin(this.time * 52) * 0.035 +
        Math.sin(this.time * 23.3) * 0.025;
      flame.outer.scale.set(1 + ab * 0.08, 1 + ab * 0.08,
        0.45 + ab * 0.75 * flicker);
      flame.core.scale.set(1, 1, 0.5 + ab * 0.6 * flicker);
      flame.outerMat.uniforms.uTime.value = this.time;
      flame.outerMat.uniforms.uIntensity.value = ab;
      flame.coreMat.uniforms.uTime.value = this.time;
      flame.coreMat.uniforms.uIntensity.value = ab;
    }
    for (const nozzle of this.parts.nozzles) {
      nozzle.inner.material.emissiveIntensity = 0.0 + ab * 2.4;
      nozzle.glow.material.opacity = ab * 0.78;
      nozzle.light.intensity = ab * 2.6 * (0.9 + Math.sin(this.time * 47) * 0.08);
    }

    if (cockpit) {
      for (const object of this.externalObjects) {
        object.visible = !this.cockpitHidden.has(object);
      }
    }
    this.parts.canopy.visible = !this.profile.noCanopy && !cockpit;
    this.parts.pilot.visible = !cockpit;
    // The oval rim is an exterior sill; from the cockpit it would be a huge
    // grey arc across the view.
    this.parts.cockpitRim.visible = !cockpit;
    this.parts.cockpitCoaming.visible = !cockpit;
    // The tub and panel sit inside the fuselage trough, below the closed glass.
    this.parts.interior.visible = true;

    const strobeOn = (this.time % 1.15) < 0.075;
    for (const strobe of this.parts.strobes) strobe.visible = strobeOn;

    this._syncCadStores(weapons);
    this._groundContact = options.onGround ?? flight.onGround ?? false;
    this._updateCadRig(flight, systems, dt);
    this._updateCadAfterburner(flight,dt);
    this._applyCadVisibility();
    this.group.updateMatrixWorld(true);
  }

  setCockpitView(active) {
    this.cockpitView = active;
    this.parts.canopyRig.visible = !this.profile.noCanopy && !active;
    this.parts.canopy.visible = !this.profile.noCanopy && !active;
    this.parts.pilot.visible = !active;
    this.parts.cockpitRim.visible = !active;
    this.parts.cockpitCoaming.visible = !active;
    this.parts.interior.visible = true;
    for (const object of this.externalObjects) {
      object.visible = !active || !this.cockpitHidden.has(object);
    }
    this._applyCadVisibility();
  }

  getCockpitEye(out = new THREE.Vector3()) {
    return out.set(...this.profile.cockpitEye).applyMatrix4(this.group.matrixWorld);
  }

  get cockpitEyeLocal() {
    return new THREE.Vector3(...this.profile.cockpitEye);
  }

  getMuzzleWorld(out = new THREE.Vector3()) {
    return this.parts.muzzle.clone().applyMatrix4(this.group.matrixWorld);
  }

  getNozzleWorld(out = new THREE.Vector3()) {
    return this.parts.nozzleLocal[0].clone().applyMatrix4(this.group.matrixWorld);
  }

  dispose() {
    this.disposed = true;
    this.airframe = null;
    this.group.visible = false;
    this._disposeObject(this.group);
    this.group.clear();
  }

  _disposeObject(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      const list = Array.isArray(o.material) ? o.material :
        o.material ? [o.material] : [];
      for (const material of list) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value && value.isTexture) textures.add(value);
        }
        if (material.uniforms) {
          for (const uniform of Object.values(material.uniforms)) {
            if (uniform?.value?.isTexture) textures.add(uniform.value);
          }
        }
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(this.cadSkinMaterials || {})) {
      materials.add(material);
      if (material.map) textures.add(material.map);
      for (const texture of material.userData.f16Maps || []) textures.add(texture);
    }
    for (const texture of textures) if(!texture.userData?.sharedVfx) texture.dispose();
    for (const material of materials) material.dispose();
  }
}

