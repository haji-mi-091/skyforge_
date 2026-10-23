// Bake CAD fitting and interior removal once, rather than on every game load.
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb,writeModelGlb} from './lib/model-glb.mjs';
import {smoothCadSkin} from '../src/visual/CadGeometry.js';
import {prepareNoseGearBay} from '../src/visual/F16Intake.js';
import {fittedSections,replaceInnerWall,linerGeometry} from './lib/f16-intake-authoring.mjs';

const dir='assets/models/f16',cad=await readModelGlb(dir+'/f16_cad.glb');
const nodes=[];cad.traverse(o=>{if(o.isMesh)nodes.push(o);});
const body=nodes.find(o=>/cc52$/.test(o.name));
body.geometry=smoothCadSkin(body.geometry);
prepareNoseGearBay(cad,body);
// The well is built as two merged meshes at runtime, not exported twice.
cad.remove(cad.userData.noseBay);
const start=performance.now(),fitted=fittedSections(body);
// The original long duct overlapped the stowed main struts. A recessed dark
// closure ahead of that bay preserves the visible curved inlet and clearance.
const sections=fitted.filter(s=>s.z<=.15);
const replacement=replaceInnerWall(body,fitted[0].z,fitted.at(-1).z);
const offlineFitMs=performance.now()-start;

// Drop the unreachable vertices left behind by CAD clipping. Preserve every
// referenced coordinate and normal; this is not airframe decimation.
const source=body.geometry,ids=new Map(),indices=[],positions=[],normals=[];
for(const id of source.index.array){
 if(!ids.has(id)){
  ids.set(id,ids.size);
  for(let k=0;k<3;k++){positions.push(source.attributes.position.array[id*3+k]);normals.push(source.attributes.normal.array[id*3+k]);}
 }
 indices.push(ids.get(id));
}
const compact=new T.BufferGeometry();compact.setAttribute('position',new T.Float32BufferAttribute(positions,3));compact.setAttribute('normal',new T.Float32BufferAttribute(normals,3));compact.setIndex(indices);body.geometry=compact;
body.userData.exportExtras={f16IntakePrepared:1,f16SkinPrepared:1,f16NoseBayPrepared:1};

// Close the distant duct with a single dark fan in the same mesh/material.
const duct=linerGeometry(sections,32),p=Array.from(duct.attributes.position.array),n=Array.from(duct.attributes.normal.array),uv=Array.from(duct.attributes.uv.array),ii=Array.from(duct.index.array),base=p.length/3;
const end=sections.at(-1),backZ=end.z-.01;
p.push(.0075,end.y,backZ);n.push(0,0,-1);uv.push(.5,.5);
for(let i=0;i<32;i++){
 const t=i*Math.PI/16;p.push(.0075+end.rx*Math.cos(t),end.y+end.ry*Math.sin(t),backZ);n.push(0,0,-1);uv.push(.5,.5);
 ii.push(base,base+1+(i+1)%32,base+1+i);
}
duct.setAttribute('position',new T.Float32BufferAttribute(p,3));duct.setAttribute('normal',new T.Float32BufferAttribute(n,3));duct.setAttribute('uv',new T.Float32BufferAttribute(uv,2));duct.setIndex(ii);
const liner=new T.Mesh(duct,new T.MeshStandardMaterial({name:'inlet liner',side:T.FrontSide}));
liner.name='F16-intake-liner-baked';
liner.userData.exportExtras={f16IntakePart:'liner',sections,replacement};cad.add(liner);
const asset=await writeModelGlb(cad,dir+'/f16_flight.glb',{compactIndices:true});
const report={...asset,offlineFitMs,replacement,linerTriangles:liner.geometry.index.count/3,linerVertices:liner.geometry.attributes.position.count,radialSegments:32,sections:sections.length,bodyVerticesBefore:source.attributes.position.count,bodyVerticesAfter:compact.attributes.position.count};
await writeFile(dir+'/f16-intake-build.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
