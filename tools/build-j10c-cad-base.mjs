// Convert the SolidWorks tessellation of the supplied J-10C STEP
// (sources/j10c/cad/faces.bin + faces.json, exported by tools/j10c-sw-export.py)
// into a metre-based reference GLB: +Y up, -Z forward, one mesh per CAD face.
// The STEP is a 1:10 scale model in millimetres with its nose towards +Z, so
// every point is scaled by 0.01 and turned 180 degrees about Y.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {writeModelGlb} from './lib/model-glb.mjs';

const SCALE=.01;
const meta=JSON.parse(await readFile('sources/j10c/cad/faces.json','utf8'));
const raw=await readFile('sources/j10c/cad/faces.bin');
const tris=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
const lo=meta.bounds.min,hi=meta.bounds.max;
// Centre span and length; place the main airframe body's vertical mid-point at y=0.
const airframe=meta.rows.filter(r=>r.body===13);
const yMid=(Math.min(...airframe.map(r=>r.min[1]))+Math.max(...airframe.map(r=>r.max[1])))/2;
const centre=[(lo[0]+hi[0])/2,yMid,(lo[2]+hi[2])/2];
const map=(x,y,z)=>[-(x-centre[0])*SCALE,(y-centre[1])*SCALE,-(z-centre[2])*SCALE];

const material=new T.MeshStandardMaterial({color:0xd8dadc,roughness:.6,metalness:.05,side:T.DoubleSide});
material.name='cad reference';
const root=new T.Group();root.name='j10c_cad_reference';
const bodies=new Map();
for(const row of meta.rows){
  if(!bodies.has(row.body)){const g=new T.Group();g.name=`cad_b${String(row.body).padStart(2,'0')}`;g.userData.exportExtras={cadBody:row.bodyName};bodies.set(row.body,g);root.add(g);}
  const positions=new Float32Array(row.count*9);
  for(let t=0;t<row.count;t++)for(let k=0;k<3;k++){
    const s=(row.start+t)*9+k*3,[x,y,z]=map(tris[s],tris[s+1],tris[s+2]);
    // Rotating 180 degrees about Y keeps handedness, so winding is unchanged.
    positions.set([x,y,z],t*9+k*3);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));
  g.setAttribute('uv',new T.BufferAttribute(new Float32Array(row.count*6),2));
  g.computeVertexNormals();
  const mesh=new T.Mesh(g,material);mesh.name=`cad_b${String(row.body).padStart(2,'0')}_f${String(row.face).padStart(3,'0')}`;
  mesh.userData.exportExtras={cadBody:row.body,cadFace:row.face,areaMm2:row.area_mm2};
  bodies.get(row.body).add(mesh);
}
await mkdir('assets/models/j10c',{recursive:true});
root.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(root);
const stats=await writeModelGlb(root,'assets/models/j10c/j10c-cad-reference.glb');
const audit={...stats,source:'assets/models/j10c/J10C.STEP (SolidWorks 2020 export, AP203, single part of open B-spline shells)',
  sourceScale:'1:10 model in millimetres; converted with factor 0.01 to full-size metres',
  transform:{centreMm:centre,scale:SCALE,rotation:'180 degrees about Y (source nose +Z -> game nose -Z)'},
  bounds:{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new T.Vector3()).toArray()}};
await writeFile('assets/models/j10c/j10c-cad-reference.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit,null,2));
