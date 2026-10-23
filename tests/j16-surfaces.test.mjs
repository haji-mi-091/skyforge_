import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';

const root=await readModelGlb('assets/models/j16/j16-white.glb');
const ray=new T.Raycaster(),opaque=[];
root.traverse(o=>{if(o.isMesh&&!o.material.transparent)opaque.push(o);});
const hit=(origin,direction)=>{
 ray.set(new T.Vector3(...origin),new T.Vector3(...direction));
 return ray.intersectObjects(opaque)[0];
};
const counts={intakeExterior:0,intakeAperture:0,noseSides:0,shoulderSeams:0,closedBayEdges:0,airbrake:0};
const isSkin=h=>h&&['skin','radome'].includes(h.object.userData.material);
poseJ16(root,{gear:0});
// These rays used to hit the exposed dark liner through the nacelle sides.
// The swept mouth is intentionally open ahead of its lower lip (z=-1.50).
// Exterior side/bottom probes therefore begin aft of that lip.
for(const side of [-1,1])for(const z of [-1.3,-1.05,-.8,-.55,-.3,0,.3]){
 for(const y of [-1.42,-1.3,-1.18]){
  const h=hit([side*3,y,z],[-side,0,0]);
  assert.ok(isSkin(h),`cowl side ${side},${y},${z}: ${h?.object.name}`);counts.intakeExterior++;
 }
 for(const x of [.90,1.075,1.25]){
  const h=hit([side*x,-4,z],[0,1,0]);
  assert.ok(isSkin(h)||h?.object.name.endsWith('_auxiliary_louvres'),`cowl bottom ${side},${x},${z}: ${h?.object.name}`);counts.intakeExterior++;
 }
}
// A repair must retain the inlet aperture, rather than hide it behind a cap.
for(const side of [-1,1])for(const dx of [-.25,0,.25])for(const dy of [-.14,0,.14]){
 const h=hit([side*1.075+dx,-1.25+dy,-3],[0,0,1]);
 assert.ok(h&&!isSkin(h)&&/^intake_/.test(h.object.name)&&h.point.z>-1.45,`clear intake aperture: ${h?.object.name}`);counts.intakeAperture++;
}
// Inspect the cockpit flank from both sides, below the glazing sill.
for(const side of [-1,1])for(const z of [-6.3,-6,-5.7,-5.4,-5.1,-4.8,-4.5,-4.2])for(const y of [-.1,.1,.3]){
 const h=hit([side*3,y,z],[-side,0,0]);
 assert.ok(isSkin(h),`nose flank ${side},${y},${z}: ${h?.object.name}`);counts.noseSides++;
}
// Check both sides of the skin/cockpit seam, not only the middle of each patch.
const crown=root.getObjectByName('J16_double_cockpit_shoulders').geometry.attributes.position;
for(let i=0;i<crown.count;i+=21){
 const x=crown.getX(i),y=crown.getY(i),z=crown.getZ(i),side=Math.sign(x);
 if(z< -7.3||z> -2.5)continue;
 for(const dy of [-.003,.003]){
  const h=hit([side*3,y+dy,z],[-side,0,0]);
  assert.ok(isSkin(h)&&Math.abs(h.point.x-x)<.035,`shoulder seam ${x},${y+dy},${z}: ${h?.object.name}`);counts.shoulderSeams++;
 }
}
// The former last cockpit row folded across the entire rear arch. Adjacent
// triangles on the opening side must remain narrow shoulder strips.
const rear=root.getObjectByName('canopy_hinge').userData.pivot[2];
const crownIndex=root.getObjectByName('J16_double_cockpit_shoulders').geometry.index.array;
for(let i=0;i<crownIndex.length;i+=3){
 const ids=[crownIndex[i],crownIndex[i+1],crownIndex[i+2]],zs=ids.map(j=>crown.getZ(j));
 if(Math.min(...zs)<rear-.07||Math.max(...zs)>rear+1e-5)continue;
 const xs=ids.map(j=>crown.getX(j));
 assert.ok(Math.max(...xs)-Math.min(...xs)<.12,'rear shoulder triangles must not fold across the cockpit opening');
}
// Sample the former centimetre-wide gaps at the well ends and side edges.
for(const name of ['nose_bay_roof','main_bay_-1_roof','main_bay_1_roof']){
 const {x,z,width:w,length:len}=root.getObjectByName(name).userData.bay;
 for(const dx of [-w/2+.005,0,w/2-.005])for(const dz of [-len/2+.005,-len/2+.02,0,len/2-.02,len/2-.005]){
  const h=hit([x+dx,-5,z+dz],[0,1,0]);
  assert.ok(isSkin(h),`closed well perimeter ${x+dx},${z+dz}: ${h?.object.name}`);counts.closedBayEdges++;
 }
}
const brake=root.getObjectByName('dorsal_airbrake_skin');
assert.ok(new T.Box3().setFromObject(brake).getSize(new T.Vector3()).y>.025,'airbrake has actual thickness');
const closedHeights=new Map();
for(const state of [0,1]){
 poseJ16(root,{gear:0,airbrake:state});
 for(const x of [-.3,0,.3])for(const z of [-.4,0,.4]){
  const key=x+','+z,h=hit([x,state?closedHeights.get(key)+.03:6,z],[0,-1,0]);
  if(!state)closedHeights.set(key,h?.point.y);
  assert.equal(h?.object.name,state?'dorsal_airbrake_recess':'dorsal_airbrake_skin','closed panel / recessed well remains covered');counts.airbrake++;
 }
}
await writeFile('work/j16/surface-validation.json',JSON.stringify({passed:true,counts},null,2)+'\n');
console.log('PASS: repaired intake exteriors, open apertures, nose flanks, closed bay edges and airbrake well.',counts);
