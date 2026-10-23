import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';

const root=await readModelGlb('assets/models/j16/j16-white.glb');poseJ16(root,{gear:0});
const ray=new T.Raycaster(),opaque=[],skin=[];
root.traverse(o=>{
 if(o.isMesh&&!o.material.transparent)opaque.push(o);
 if(o.isMesh&&(/^J16_fixed_fuselage_/.test(o.name)||/^intake_._outer_cowl$/.test(o.name)))skin.push(o);
});
const report={shape:{},exteriorSamples:0,louvreSamples:0,rampSamples:0,linerClearanceSamples:0};
const vertex=(o,i)=>new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld);
for(const [side,tag]of [[-1,'L'],[1,'R']]){
 const lip=root.getObjectByName('intake_'+tag+'_lip'),liner=root.getObjectByName('intake_'+tag+'_inner_duct');
 assert.ok(lip&&liner&&!root.getObjectByName('intake_'+tag+'_lip_0'),'thin lip replaces the four round tube edges');
 const n=lip.geometry.attributes.position.count/3;
 const mouth=Array.from({length:n},(_,i)=>vertex(lip,n*2+i));
 const zmin=Math.min(...mouth.map(p=>p.z)),zmax=Math.max(...mouth.map(p=>p.z));
 const top=mouth.filter(p=>p.z<zmin+1e-5).sort((a,b)=>side*(a.x-b.x));
 const a=top[0],b=top.at(-1),angle=Math.atan2(b.y-a.y,side*(b.x-a.x));
 const degrees=angle*180/Math.PI;
 assert.ok(degrees>8&&degrees<14,'front-view walls lean outward like the reference');
 const unrotate=p=>-side*p.x*Math.sin(angle)+p.y*Math.cos(angle);
 const diagonal=mouth.filter(p=>p.z>zmin+.04&&p.z<zmax-.04);
 const meanX=diagonal.reduce((s,p)=>s+unrotate(p),0)/diagonal.length,meanZ=diagonal.reduce((s,p)=>s+p.z,0)/diagonal.length;
 const slope=diagonal.reduce((s,p)=>s+(unrotate(p)-meanX)*(p.z-meanZ),0)/diagonal.reduce((s,p)=>s+(unrotate(p)-meanX)**2,0);
 const rms=Math.sqrt(diagonal.reduce((s,p)=>s+(p.z-meanZ-slope*(unrotate(p)-meanX))**2,0)/diagonal.length);
 const upright=mouth.filter(p=>p.z>zmax-1e-5),endHeight=Math.max(...upright.map(unrotate))-Math.min(...upright.map(unrotate));
 assert.ok(zmax-zmin>.8&&zmax-zmin<1.05&&rms<.002,'one straight swept edge in a true side projection');
 assert.ok(endHeight>.13&&endHeight<.20,'a separate short vertical return at the bottom');
 for(let i=0;i<n;i++)assert.ok(mouth[i].distanceTo(vertex(liner,i))<1e-6,'inner lip joins the actual liner with no rim crack');
 report.shape[tag]={outwardCantDeg:degrees,lipSetback:zmax-zmin,verticalReturn:endHeight,diagonalRms:rms};

 const cowl=root.getObjectByName('intake_'+tag+'_outer_cowl'),idx=cowl.geometry.index.array;
 for(let i=0;i<idx.length;i+=21){
  const a=vertex(cowl,idx[i]),b=vertex(cowl,idx[i+1]),c=vertex(cowl,idx[i+2]);
  const normal=b.clone().sub(a).cross(c.clone().sub(a));if(normal.length()<1e-6)continue;normal.normalize();
  const centre=a.clone().add(b).add(c).multiplyScalar(1/3);
  ray.set(centre.clone().addScaledVector(normal,.025),normal.clone().negate());
  const h=ray.intersectObjects(opaque)[0];
  assert.ok(h&&Math.abs(h.distance-.025)<.011&&(h.object.userData.material==='skin'||h.object.name.endsWith('_auxiliary_louvres')),'no liner leaks through the cowl surface');report.exteriorSamples++;
 }
 const louvres=root.getObjectByName('intake_'+tag+'_auxiliary_louvres');
 for(let i=0;i<louvres.geometry.attributes.position.count;i+=4){
  const p=vertex(louvres,i);ray.set(new T.Vector3(p.x,-4,p.z),new T.Vector3(0,1,0));
  const h=ray.intersectObjects(skin)[0],gap=h?.point.y-p.y;
  assert.ok(gap>.001&&gap<.011,'louvre strips conform to the final exterior skin');report.louvreSamples++;
 }
 // The well has moved to the wing root. Check separation from its actual
 // exported bounds and containment beneath the blended outer upper skin.
 const body=[root.getObjectByName('J16_fixed_fuselage_mid'),root.getObjectByName('wing_body_blend_'+tag)];
 const well=new T.Box3().setFromObject(root.getObjectByName('main_bay_'+side+'_roof'));
 const overlapsWell=p=>p.x>=well.min.x&&p.x<=well.max.x&&p.z>=well.min.z&&p.z<=well.max.z;
 for(let i=0;i<liner.geometry.attributes.position.count;i++){
  const p=vertex(liner,i);if(p.z<.95)continue;
  if(overlapsWell(p))assert.ok(p.y>well.max.y+.012,'liner clears the main bay roof');
  ray.set(new T.Vector3(p.x,4,p.z),new T.Vector3(0,-1,0));
  const h=ray.intersectObjects(body)[0];assert.ok(h&&p.y<h.point.y-.008,'liner remains below the exterior upper skin');report.linerClearanceSamples++;
 }
 const linerIndex=liner.geometry.index.array;
 for(let i=0;i<linerIndex.length;i+=3)for(let k=0;k<3;k++){
  const a=vertex(liner,linerIndex[i+k]),b=vertex(liner,linerIndex[i+(k+1)%3]);
  if((a.z<well.min.z)===(b.z<well.min.z))continue;
  const p=a.clone().lerp(b,(well.min.z-a.z)/(b.z-a.z));
  if(overlapsWell(p))assert.ok(p.y>well.max.y+.012,'liner triangles clear the actual forward edge of the main bay');
  report.linerClearanceSamples++;
 }
 const throat=root.getObjectByName('intake_'+tag+'_dark_throat');
 assert.ok(new T.Box3().setFromObject(throat).max.z<well.min.z-.02,'the intake throat ends ahead of the relocated well');
 for(let i=0;i<throat.geometry.attributes.position.count;i++){
  const p=vertex(throat,i);ray.set(new T.Vector3(p.x,4,p.z),new T.Vector3(0,-1,0));
  const h=ray.intersectObjects(body)[0];
  assert.ok(h&&p.y<h.point.y-.008,'the throat closure stays inside the upper body');
 }
 for(const amount of [0,.5,1]){
  poseJ16(root,{gear:0,ramps:amount});
  const ramp=root.getObjectByName('intake_'+tag+'_ramp_skin');
  for(let i=0;i<ramp.geometry.attributes.position.count;i++){
   const p=vertex(ramp,i);ray.set(new T.Vector3(p.x,3,p.z),new T.Vector3(0,-1,0));
   const hits=ray.intersectObject(liner);
   assert.ok(hits.length&&p.y<hits[0].point.y-.006,'moving compression ramp clears the duct roof');
   if(hits.length>1&&hits.at(-1).point.y<hits[0].point.y-.1)assert.ok(p.y>hits.at(-1).point.y+.015,'moving ramp clears the duct floor');
   report.rampSamples++;
  }
 }
}
const left=root.getObjectByName('intake_L_lip'),right=root.getObjectByName('intake_R_lip');
for(let i=0;i<left.geometry.attributes.position.count;i++){
 const p=vertex(left,i),q=vertex(right,i);q.x=-q.x;assert.ok(p.distanceTo(q)<1e-6,'both intakes are mirror symmetric');
}
await writeFile('work/j16/intake-validation.json',JSON.stringify({passed:true,...report},null,2)+'\n');
console.log('PASS: swept/vertical lip, outward cant, symmetry, lip joins, cowl coverage, louvre contact and ramp/bay clearances.',report);
