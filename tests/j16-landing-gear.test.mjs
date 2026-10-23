import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';

const root=await readModelGlb('assets/models/j16/j16-white.glb');poseJ16(root,{gear:0});
const material=o=>(o.userData.exportExtras||o.userData).material;
const metadata=o=>o.userData.exportExtras||o.userData;
const roofs=['nose_bay_roof','main_bay_-1_roof','main_bay_1_roof'].map(name=>root.getObjectByName(name));
const bays=roofs.map(o=>({name:o.name,...metadata(o).bay,box:new T.Box3().setFromObject(o)}));
const main=bays[2];
assert.ok(main.x>1.8&&main.x<2.1&&main.x+main.width/2>2.3,'main well spans the outer nacelle/inner wing root');
assert.ok(root.getObjectByName('wing_body_blend_L')&&root.getObjectByName('wing_body_blend_R'),'both structural root blends exist');

// Cache a vertical envelope of the actual exported closed skin, including its
// closed doors. A small X/Z triangle grid makes the full gear sweep affordable.
const envelope=[];
root.traverse(o=>{
 if(o.isMesh&&/^(J16_fixed_fuselage_|J16_radome|J16_forebody|J16_double_cockpit|wing_|slat_skin_|flaperon_skin_|intake_._outer_cowl|nose_bay_door_skin|main_bay_.*_door_skin)/.test(o.name))envelope.push(o);
});
const cell=.10,grid=new Map();
for(const o of envelope){
 const p=o.geometry.attributes.position,index=o.geometry.index.array;
 for(let i=0;i<index.length;i+=3){
  const points=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,index[i+k]).applyMatrix4(o.matrixWorld));
  const [a,b,c]=points,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-10)continue;
  const xmin=Math.max(-2.85,Math.min(a.x,b.x,c.x)),xmax=Math.min(2.85,Math.max(a.x,b.x,c.x));
  const zmin=Math.max(-5.2,Math.min(a.z,b.z,c.z)),zmax=Math.min(4.8,Math.max(a.z,b.z,c.z));
  for(let x=Math.floor(xmin/cell);x<=Math.floor(xmax/cell);x++)for(let z=Math.floor(zmin/cell);z<=Math.floor(zmax/cell);z++){
   const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push({a,b,c,den,door:/_door_skin/.test(o.name)});
  }
 }
}
const height=(x,z)=>{
 const triangles=grid.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[],hits=[],doorHits=[];
 for(const {a,b,c,den,door}of triangles){
  const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den;
  const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;
  if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6){const y=u*a.y+v*b.y+w*c.y;hits.push(y);if(door)doorHits.push(y);}
 }
 return hits.length?{lower:Math.min(...hits),upper:Math.max(...hits),door:doorHits.length?Math.max(...doorHits):null}:null;
};
const report={rootCoverage:0,poses:0,motionSamples:0,doorCrossingChecks:0,braceChecks:0,axleConnectionChecks:0,doorActuatorChecks:0,collisions:[],stowedWheels:[]};
const ray=new T.Raycaster(),opaque=[];root.traverse(o=>{if(o.isMesh&&!o.material.transparent)opaque.push(o);});
for(const side of [-1,1])for(const x of [1.5,1.62,1.70,1.76,1.95,2.2,2.4,2.6])for(const z of [1.4,1.8,2.3,2.8,3.3,3.8]){
 for(const top of [true,false]){
  ray.set(new T.Vector3(side*x,top?5:-5,z),new T.Vector3(0,top?-1:1,0));
  const h=ray.intersectObjects(opaque)[0];
  assert.ok(h&&material(h.object)==='skin',`root skin coverage ${side*x},${z},${top}: ${h?.object.name}`);report.rootCoverage++;
 }
}
for(const wheelName of ['nose_wheel_L','nose_wheel_R','main_L_wheel','main_R_wheel']){
 const wheel=root.getObjectByName(wheelName),box=new T.Box3().setFromObject(wheel),bay=bays[wheelName.startsWith('nose')?0:wheelName.includes('_L_')?1:2];
 assert.ok(box.min.x>bay.box.min.x+.01&&box.max.x<bay.box.max.x-.01,'stored wheel fits the actual lateral well');
 assert.ok(box.min.z>bay.box.min.z+.01&&box.max.z<bay.box.max.z-.01&&box.max.y<bay.box.min.y-.012,'stored wheel clears well ends and roof');
 report.stowedWheels.push({name:wheelName,min:box.min.toArray(),max:box.max.toArray()});
 const tire=root.getObjectByName(wheelName+'_tire'),p=tire.geometry.attributes.position,n=tire.geometry.attributes.normal,radius=metadata(wheel).radius;
 for(let i=0;i<p.count;i++)if(Math.hypot(p.getY(i),p.getZ(i))>radius*.98){
  assert.ok(p.getY(i)*n.getY(i)+p.getZ(i)*n.getZ(i)>0,'tire tread normals face outward and cannot disappear from the front');
 }
}

const moving=[],doors=[];
root.traverse(o=>{
 if(o.isMesh&&((/^(nose|main_[LR])_/.test(o.name)&&!/bay_|light_|landing_light/.test(o.name))||/^main_bay_.*_offset_hinge_/.test(o.name)))moving.push(o);
 if(o.isMesh&&/_door_skin_/.test(o.name)&&/^(nose_bay|main_bay)/.test(o.name))doors.push(o);
});
const vertex=(o,i)=>new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld);
for(const o of moving)for(let i=0;i<o.geometry.attributes.position.count;i+=3){
 const p=vertex(o,i),h=height(p.x,p.z),bay=bays.find(b=>Math.abs(p.x-b.x)<b.width/2+.002&&Math.abs(p.z-b.z)<b.length/2+.002);
 assert.ok(h&&bay&&p.y>h.lower+.001&&p.y<bay.box.min.y-.0005,`stored mechanism enclosed by skin: ${o.name} ${p.toArray()}`);
 if(h.door!==null)assert.ok(p.y>h.door+.006,`stored mechanism above its actual closed door: ${o.name} ${p.toArray()} door=${h.door}`);
}
const edges=new Map();
for(const o of moving.filter(o=>/_tire$|^nose_t_stem$|^main_bay_.*offset_hinge/.test(o.name))){
 const unique=new Map(),idx=o.geometry.index.array;
 for(let i=0;i<idx.length;i+=3)for(let k=0;k<3;k++){
  const a=idx[i+k],b=idx[i+(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);unique.set(key,[a,b]);
 }
 edges.set(o,[...unique.values()]);
}
const sweep=Array.from({length:21},(_,i)=>({gear:i/20,compression:0,steer:0}));
for(const gear of [0,.3,.6,1])for(const steer of [-1,0,1])sweep.push({gear,compression:1,steer});
for(const state of sweep){
 const {gear}=state;poseJ16(root,state);report.poses++;
 // Keep the actual piston end attached to the axle support through compression,
 // steering and the mirrored main-wheel swivel. This catches a carrier that
 // rotates about an offset point and leaves a floating wheel assembly.
 for(const name of ['nose','main_L','main_R']){
  const piston=root.getObjectByName(name+'_oleo_piston'),carrier=root.getObjectByName(name+'_wheel_carrier');
  piston.geometry.computeBoundingBox();
  const end=piston.localToWorld(new T.Vector3(0,piston.geometry.boundingBox.min.y,0));
  const support=carrier.localToWorld(new T.Vector3(0,name==='nose'?.36:.18,0));
  assert.ok(end.distanceTo(support)<1e-6,`connected piston/axle support: ${name}, gear=${gear}`);
  const axle=root.getObjectByName(name==='nose'?'nose_wheel_axle':name+'_wheel_axle');
  const wheels=name==='nose'?['nose_wheel_L','nose_wheel_R']:[name+'_wheel'];
  for(const wheelName of wheels){
   const hub=root.getObjectByName(wheelName+'_hub');
   assert.ok(new T.Box3().setFromObject(axle).intersectsBox(new T.Box3().setFromObject(hub)),`axle enters hub: ${wheelName}`);
   report.axleConnectionChecks++;
  }
  if(gear===1&&name!=='nose'){
   const leg=root.getObjectByName(name+'_gear_spread'),top=leg.localToWorld(new T.Vector3()),bottom=leg.localToWorld(new T.Vector3(0,-1,0));
   assert.ok(Math.abs(top.x-bottom.x)<1e-6&&Math.abs(top.z-bottom.z)<1e-6,'main oleo is vertical');
   const wheel=root.getObjectByName(name+'_wheel').getWorldPosition(new T.Vector3());
   assert.ok((wheel.x-top.x)*(name==='main_L'?-1:1)>.20,'main wheel is outboard of its vertical strut');
  }
 }
 for(const o of [...moving,...doors]){
  const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i+=3){
   const q=vertex(o,i),h=height(q.x,q.z);if(!h)continue;
   const bay=bays.find(b=>Math.abs(q.x-b.x)<b.width/2+.002&&Math.abs(q.z-b.z)<b.length/2+.002);
   const freeBay=bay&&q.y<bay.box.min.y-.0005&&q.y>h.lower-.004;
   const inSkin=q.y>h.lower+.004&&q.y<h.upper-.004;
   if(inSkin&&!freeBay&&report.collisions.length<80)report.collisions.push({...state,mesh:o.name,point:q.toArray(),envelope:h});
   report.motionSamples++;
  }
 }
 const braceNames=[];root.traverse(o=>{if(metadata(o).kinematicBrace)braceNames.push(o.name);});
 for(const braceName of braceNames){
  const b=root.getObjectByName(braceName),m=metadata(b),a=b.getWorldPosition(new T.Vector3()),end=root.getObjectByName(m.leg).localToWorld(new T.Vector3(...m.knee));
  const e=b.getObjectByName(b.name+'_elbow').getWorldPosition(new T.Vector3());
  assert.ok(Math.abs(e.distanceTo(a)-m.armLength)<1e-5&&Math.abs(e.distanceTo(end)-m.armLength)<1e-5,`connected brace ${braceName} gear=${gear} span=${a.distanceTo(end)} arm=${m.armLength}`);report.braceChecks++;
 }
 root.traverse(o=>{
  const m=metadata(o);if(!m.telescopicLink)return;
  const a=o.getWorldPosition(new T.Vector3()),b=root.getObjectByName(m.leg).localToWorld(new T.Vector3(...m.knee)),span=a.distanceTo(b);
  assert.ok(span>Math.max(m.barrelLength,m.pistonLength)+.01&&span<m.barrelLength+m.middleLength+m.pistonLength-.02,`door actuator stays inside its physical stroke: ${o.name} gear=${gear} span=${span}`);
  const upper=o.getObjectByName(o.name+'_upper'),lower=o.getObjectByName(o.name+'_lower');
  assert.ok(upper.localToWorld(new T.Vector3(0,-m.barrelLength/2,0)).distanceTo(a)<1e-6,'actuator barrel is attached to fixed lug');
  assert.ok(lower.localToWorld(new T.Vector3(0,m.pistonLength/2,0)).distanceTo(b)<1e-6,'actuator piston is attached to door lug');
  report.doorActuatorChecks++;
 });
 // Check actual surface crossings with moving doors, in addition to clearance
 // against the static body. Tire/T-stem edges are tested against nearby leaves.
 for(const [o,list]of edges){
  const box=new T.Box3().setFromObject(o),near=doors.filter(d=>box.intersectsBox(new T.Box3().setFromObject(d)));if(!near.length)continue;
  const points=Array.from({length:o.geometry.attributes.position.count},(_,i)=>vertex(o,i));
  for(const [i,j]of list){
   const start=points[i],end=points[j],direction=end.clone().sub(start),length=direction.length();if(length<1e-6)continue;
   ray.set(start,direction.normalize());ray.near=1e-5;ray.far=length-1e-5;
   const hits=ray.intersectObjects(near);if(hits.length&&report.collisions.length<80)report.collisions.push({gear,mesh:o.name,door:hits[0].object.name,point:hits[0].point.toArray()});report.doorCrossingChecks++;
  }
 }
}
ray.near=0;ray.far=Infinity;
await writeFile('work/j16/landing-gear-validation.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.collisions.length,0,JSON.stringify(report.collisions.slice(0,8),null,2));
console.log('PASS: closed wing-root coverage, four stowed wheels, outward tire normals, gear/steer/compression poses, door clearances and connected braces.',{...report,collisions:0,stowedWheels:4});
