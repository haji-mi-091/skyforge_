import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';

const root=await readModelGlb('assets/models/j16/j16-white.glb');poseJ16(root,{gear:1,pitch:0,yaw:0,nozzle:1});
const meta=o=>o.userData.exportExtras||o.userData;
const body=root.getObjectByName('J16_fixed_fuselage_tail');
const point=(o,i)=>new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld);
const report={rootConnections:{},nacelleCoverage:0,roundCollarSamples:0,poses:0,movingEdgeChecks:0,movingPairChecks:0,triangleChecks:0,collisions:[]};

// Actual exported triangle grid, rather than a radial envelope that can mistake
// an unrelated surface for the nearest skin. Also checks thin edge crossings.
const cell=.24,key=(x,y,z)=>x+','+y+','+z;
function gridFor(objects){
 const grid=new Map(),triangles=[];
 for(const o of objects){const idx=o.geometry.index.array;
  for(let i=0;i<idx.length;i+=3){
   const tri=new T.Triangle(...[0,1,2].map(k=>point(o,idx[i+k]))),box=new T.Box3().setFromPoints([tri.a,tri.b,tri.c]),at=triangles.length;
   triangles.push({tri,box,o});
   for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)for(let y=Math.floor(box.min.y/cell);y<=Math.floor(box.max.y/cell);y++)for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++){
    const k=key(x,y,z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(at);
   }
  }
 }
 return {triangles,near(box){const ids=new Set();
  for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)for(let y=Math.floor(box.min.y/cell);y<=Math.floor(box.max.y/cell);y++)for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++)for(const i of grid.get(key(x,y,z))||[])ids.add(i);
  return [...ids].map(i=>triangles[i]);
 }};
}
const bodyGrid=gridFor([body]),closest=new T.Vector3();
const nearBody=p=>{
 const box=new T.Box3(p.clone(),p.clone()).expandByScalar(.025);let d=Infinity;
 for(const {tri}of bodyGrid.near(box))d=Math.min(d,tri.closestPointToPoint(p,closest).distanceTo(p));return d;
};
for(const tag of ['L','R'])for(const prefix of ['fin_fixed_','ventral_keel_','stabilator_bearing_']){
 const o=root.getObjectByName(prefix+tag),contacts=[];
 for(let i=0;i<o.geometry.attributes.position.count;i++){
  const p=point(o,i);if(nearBody(p)<.0015)contacts.push(p);
 }
 const span=contacts.length?new T.Box3().setFromPoints(contacts).getSize(new T.Vector3()):new T.Vector3();
 report.rootConnections[o.name]={contacts:contacts.length,span:span.toArray()};
 assert.ok(contacts.length>=8,`${o.name} has a real skin contact seam: ${contacts.length}`);
 if(!prefix.startsWith('stabilator'))assert.ok(span.z>.8,`${o.name} root is connected along its chord`);
 const side=tag==='L'?-1:1;
 if(prefix.startsWith('stabilator')){
  const bearing=new T.Box3().setFromObject(o),axle=new T.Box3().setFromObject(root.getObjectByName('stabilator_trunnion_'+tag)),plane=new T.Box3().setFromObject(root.getObjectByName('stabilator_skin_'+tag));
  assert.ok(bearing.intersectsBox(axle)&&axle.intersectsBox(plane),'fixed bearing, moving trunnion and stabilator join');
  assert.ok(Math.abs(root.getObjectByName('stabilator_hinge_'+tag).position.x-side*1.80)<1e-6);
 }
}
const ray=new T.Raycaster(),nacelles=[body,...['L','R'].map(tag=>root.getObjectByName('engine_'+tag+'_fixed_collar'))];
for(const side of [-1,1])for(const z of [5.5,6,6.5,7,7.5,7.8,8.0,8.14,8.2,8.42])for(let j=0;j<64;j++){
 const a=j/64*Math.PI*2;ray.set(new T.Vector3(side*1.075,-1.14,z),new T.Vector3(Math.cos(a),Math.sin(a),0));
 assert.ok(ray.intersectObjects(nacelles).length,`continuous nacelle skin ${side},${z},${j}`);report.nacelleCoverage++;
}
for(const tag of ['L','R']){
 const o=root.getObjectByName('engine_'+tag+'_fixed_collar'),cx=tag==='L'?-1.075:1.075,p=o.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const q=point(o,i),expected=T.MathUtils.lerp(.53,.52,(q.z-8.15)/.28);
  assert.ok(Math.abs(Math.hypot(q.x-cx,q.y+1.14)-expected)<1e-6,'collar is circular, including its underside');report.roundCollarSamples++;
 }
}
const fixed=[];root.traverse(o=>{if(o.isMesh&&/^(J16_fixed_fuselage_tail|fin_fixed_|ventral_keel_|engine_.*_fixed_collar|engine_.*_inner_lip|engine_.*_recessed_liner)/.test(o.name))fixed.push(o);});
const fixedGrid=gridFor(fixed),moving=[];root.traverse(o=>{if(o.isMesh&&/^(stabilator_skin_|rudder_skin_|nozzle_.*_feather_)/.test(o.name))moving.push(o);});
const meshEdges=o=>{const map=new Map(),idx=o.geometry.index.array;for(let i=0;i<idx.length;i+=3)for(let k=0;k<3;k++){const a=idx[i+k],b=idx[i+(k+1)%3];map.set(Math.min(a,b)+','+Math.max(a,b),[a,b]);}return [...map.values()];};
const edges=new Map(moving.map(o=>[o,meshEdges(o)]));
const sweep=Array.from({length:21},(_,i)=>({pitch:i/10-1,yaw:i/10-1,nozzle:i/20}));
for(const pitch of [-1,1])for(const yaw of [-1,1])for(const nozzle of [0,1])sweep.push({pitch,yaw,nozzle});
const r=new T.Ray(),hit=new T.Vector3(),box=new T.Box3();
for(const state of sweep){
 poseJ16(root,{gear:1,...state});report.poses++;
 for(const [o,list]of edges){
  const pts=Array.from({length:o.geometry.attributes.position.count},(_,i)=>point(o,i));
  for(const [i,j]of list){
   const a=pts[i],b=pts[j],delta=b.clone().sub(a),length=delta.length();if(length<1e-7)continue;
   r.set(a,delta.normalize());box.setFromPoints([a,b]);report.movingEdgeChecks++;
   for(const {tri,box:targetBox,o:other}of fixedGrid.near(box)){
    if(!box.intersectsBox(targetBox))continue;report.triangleChecks++;
    if(!r.intersectTriangle(tri.a,tri.b,tri.c,false,hit))continue;
    const distance=hit.distanceTo(a);if(distance<1e-5||distance>length-1e-5)continue;
    // The rudder's hinge line and nozzle's front attachment rim are intended
    // contacts; crossings beyond these small joint tolerances are failures.
    if(o.name.startsWith('rudder')){
     const hinge=o.parent,origin=hinge.getWorldPosition(new T.Vector3()),axis=new T.Vector3(...meta(hinge).axis).normalize();
     if(hit.clone().sub(origin).cross(axis).length()<.006)continue;
    }
    if(o.name.startsWith('nozzle')&&Math.abs(hit.z-8.43)<.0015&&other.name.startsWith('engine_'))continue;
    if(report.collisions.length<40)report.collisions.push({state,moving:o.name,fixed:other.name,point:hit.toArray()});
   }
  }
 }
 // Control surfaces must also clear each other and the moving exhaust petals.
 // Adjacent nozzle petals intentionally form an overlapping feather assembly.
 const bounds=new Map(moving.map(o=>[o,new T.Box3().setFromObject(o)]));
 for(let i=0;i<moving.length;i++)for(let j=i+1;j<moving.length;j++){
  const a=moving[i],b=moving[j];if(a.name.startsWith('nozzle')&&b.name.startsWith('nozzle'))continue;
  report.movingPairChecks++;if(!bounds.get(a).intersectsBox(bounds.get(b)))continue;
  for(const [source,target]of [[a,b],[b,a]]){
   const targetGrid=gridFor([target]),pts=Array.from({length:source.geometry.attributes.position.count},(_,k)=>point(source,k));
   for(const [k,l]of edges.get(source)){
    const start=pts[k],end=pts[l],direction=end.clone().sub(start),length=direction.length();if(length<1e-7)continue;
    r.set(start,direction.normalize());box.setFromPoints([start,end]);
    for(const {tri,box:targetBox}of targetGrid.near(box)){
     if(!box.intersectsBox(targetBox))continue;report.triangleChecks++;
     if(r.intersectTriangle(tri.a,tri.b,tri.c,false,hit)&&hit.distanceTo(start)>1e-5&&hit.distanceTo(start)<length-1e-5&&report.collisions.length<40)report.collisions.push({state,moving:source.name,fixed:target.name,point:hit.toArray()});
    }
   }
  }
 }
}
await writeFile('work/j16/tail-validation.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.collisions.length,0,JSON.stringify(report.collisions.slice(0,8),null,2));
console.log('PASS: six connected tail roots, continuous nacelles, circular collars and swept moving-surface clearances.',{...report,collisions:0});
