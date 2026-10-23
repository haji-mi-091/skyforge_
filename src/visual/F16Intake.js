import * as THREE from '../../vendor/three.module.js';
import { splitCadVolume, boxPlanes } from './CadGeometry.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z),
  CX = 0.0075;
export const noseBayRoof = (z) =>
  THREE.MathUtils.lerp(
    -1.25,
    -0.84,
    THREE.MathUtils.smoothstep(z, -2.4, -1.98),
  );
export const NOSE_BAY = {
  min: V(-0.315, -1.495, -2.405),
  max: V(0.33, -0.84, -1.31),
  wheelTarget: V(CX, -1.19, -1.7),
};
const color = (hex) => new THREE.Color(hex).convertSRGBToLinear();
function add(parent, g, m, name) {
  const o = new THREE.Mesh(g, m);
  o.name = name;
  o.castShadow = false;
  parent.add(o);
  return o;
}
/** The nose well is below the rising inlet duct; a solid roof separates them. */
export function prepareNoseGearBay(cad, body) {
  if (cad.userData.noseBay) return cad.userData.noseBay;
  if (!body.userData.f16NoseBayPrepared)
    splitCadVolume(body, boxPlanes(NOSE_BAY.min, NOSE_BAY.max), { cap: false });
  const group = new THREE.Group();
  group.name = 'nose-wheel-well';
  cad.add(group);
  const paint = new THREE.MeshStandardMaterial({
      color: color(0x86938c),
      roughness: 0.76,
      side: THREE.DoubleSide,
    }),
    metal = new THREE.MeshStandardMaterial({
      color: color(0x5e6a6c),
      roughness: 0.46,
      metalness: 0.65,
    });
  // The well follows the closed belly contour; it is not a rectangular box
  // hanging outside the inlet. Its sloped roof is the inlet floor above it.
  const { min, max } = NOSE_BAY,
    xc = (min.x + max.x) / 2,
    zs = [min.z, -2.35, -2.2, -2.04, -1.98, max.z];
  const floor = (x) =>
    -1.49 + 0.09 * Math.pow(Math.abs((x - xc) / 0.3225), 1.5);
  const face = (points, name) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        points.flatMap((p) => p.toArray()),
        3,
      ),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    return add(group, geo, paint, name);
  };
  for (let i = 0; i < zs.length - 1; i++) {
    const a = zs[i],
      b = zs[i + 1];
    face(
      [
        V(min.x, noseBayRoof(a), a),
        V(max.x, noseBayRoof(a), a),
        V(max.x, noseBayRoof(b), b),
        V(min.x, noseBayRoof(b), b),
      ],
      'nose-bay-roof',
    );
    for (const x of [min.x, max.x])
      face(
        [
          V(x, floor(x), a),
          V(x, noseBayRoof(a), a),
          V(x, noseBayRoof(b), b),
          V(x, floor(x), b),
        ],
        'nose-bay-sidewall',
      );
  }
  for (const z of [min.z, max.z])
    for (let i = 0; i < 12; i++) {
      const a = THREE.MathUtils.lerp(min.x, max.x, i / 12),
        b = THREE.MathUtils.lerp(min.x, max.x, (i + 1) / 12);
      face(
        [
          V(a, floor(a), z),
          V(b, floor(b), z),
          V(b, noseBayRoof(z), z),
          V(a, noseBayRoof(z), z),
        ],
        'nose-bay-bulkhead',
      );
    }
  for (const side of [-1, 1])
    for (const z of [-2.3, -1.84, -1.4]) {
      const bolt = add(
        group,
        new THREE.CylinderGeometry(0.012, 0.012, 0.007, 8),
        metal,
        'well fastener',
      );
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(CX + side * 0.312, noseBayRoof(z) - 0.08, z);
    }
  const line = new THREE.CatmullRomCurve3(
    [-2.32, -2.12, -1.7, -1.39].map((z) => V(0.283, noseBayRoof(z) - 0.045, z)),
  );
  add(
    group,
    new THREE.TubeGeometry(line, 20, 0.008, 8, false),
    metal,
    'well hydraulic line',
  );
  mergeWellMeshes(group);
  group.userData.bounds = { min: min.toArray(), max: max.toArray() };
  cad.userData.noseBay = group;
  return group;
}

// Interior pieces need neither separate draw calls nor individual shadows.
function mergeWellMeshes(group) {
  const batches=new Map();
  for(const mesh of [...group.children]){
    if(!mesh.isMesh)continue;
    mesh.updateMatrix();
    const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    g.applyMatrix4(mesh.matrix);
    let batch=batches.get(mesh.material);
    if(!batch){batch={positions:[],normals:[]};batches.set(mesh.material,batch);}
    batch.positions.push(...g.attributes.position.array);
    batch.normals.push(...g.attributes.normal.array);
    group.remove(mesh);mesh.geometry.dispose();g.dispose();
  }
  for(const [material,batch]of batches){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normals,3));
    g.computeBoundingBox();g.computeBoundingSphere();
    add(group,g,material,material.metalness>.5?'nose-bay-hardware':'nose-bay-enclosure');
  }
}

function shadeInterior(geometry) {
  const p=geometry.attributes.position,colors=[],uv=[];
  for(let i=0;i<p.count;i++){
    const z=p.getZ(i),shade=.025+.975*Math.exp(-Math.max(0,z+2.68)*5);
    colors.push(shade,shade,shade);
    uv.push(p.getX(i)*.29,z*.29);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return geometry;
}

/** Ready-to-draw, low-poly inlet. CAD fitting lives in the offline build tool. */
export function buildF16Intake(cad,nodes) {
  const body=nodes.find(n=>/cc52$/.test(n.name));
  if(!body)return null;
  const liner=nodes.find(n=>n.userData.f16IntakePart==='liner');
  if(!liner||!body.userData.f16IntakePrepared)
    throw new Error('F-16 requires assets/models/f16/f16_flight.glb; rebuild with node tools/build-f16-intake.mjs');
  prepareNoseGearBay(cad,body);
  const group=new THREE.Group();group.name='F16-NSI-inlet';cad.add(group);
  const paint=new THREE.MeshStandardMaterial({
    color:color(0x89929b),map:body.material.map,
    roughness:body.material.roughness??.78,metalness:body.material.metalness??.1,
    vertexColors:true,side:THREE.FrontSide,
  });
  const oldMaterial=liner.material;
  liner.material=paint;liner.name='continuous intake duct liner';
  liner.castShadow=false;liner.receiveShadow=false;
  shadeInterior(liner.geometry);group.add(liner);oldMaterial.dispose();

  // Keep the recognizable centre airfoil support, attached at both ends.
  const sections=[[-1.407,.025],[-1.37,.018],[-1.06,.016],[-1.001,.027]],pos=[],index=[];
  for(const [y,w]of sections)
    for(const [x,z]of [[-w,-2.754],[0,-2.805],[w,-2.754],[w*.6,-2.605],[0,-2.565],[-w*.6,-2.605]])pos.push(CX+x,y,z);
  for(let j=0;j<sections.length-1;j++)for(let i=0;i<6;i++){
    const a=j*6+i,b=j*6+(i+1)%6,c=a+6,d=b+6;index.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(index);g.computeVertexNormals();
  const strut=add(group,shadeInterior(g),paint,'inlet centre airfoil strut');
  group.userData={liner,strut,sections:liner.userData.sections,replacement:liner.userData.replacement,baked:true};
  return group;
}
