import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
import {wingAt,leadingHingeZ,trailingHingeZ} from '../src/visual/jet/j16Wing.js';
import {triangleGrid,edgeCrossings} from '../tools/lib/mesh-queries.mjs';
const root=await readModelGlb('assets/models/j16/j16-white.glb');poseJ16(root,{gear:0});
const fixed=[],moving=[];root.traverse(o=>{if(!o.isMesh)return;if(/^(slat_skin_|flaperon_skin_)/.test(o.name))moving.push(o);else if(/^(wing_|J16_fixed_fuselage_|intake_._outer_cowl)/.test(o.name))fixed.push(o);});
assert.equal(moving.length,4,'one leading and one trailing flap per wing');
const report={coverage:0,poses:0,triangleChecks:0,collisions:[]},ray=new T.Raycaster();
for(const side of [-1,1])for(const x of [1.8,2.2,2.7,3,3.8,4.8,5.8,6.5,7.1])for(const t of [.04,.24,.45,.65,.88,.98]){
 const s=wingAt(x),z=T.MathUtils.lerp(s.le,s.te,t);if(Math.abs(z-leadingHingeZ(x))<.05||Math.abs(z-trailingHingeZ(x))<.05)continue;
 for(const top of [true,false]){ray.set(new T.Vector3(side*x,top?4:-4,z),new T.Vector3(0,top?-1:1,0));assert.ok(ray.intersectObjects([...fixed,...moving]).length,`no wing hole ${side*x},${z},${top}`);report.coverage++;}
}
const grid=triangleGrid(fixed);
for(let i=0;i<=20;i++){
 const state={gear:0,slats:i/20,flaps:i/20};poseJ16(root,state);report.poses++;
 for(const o of moving){const r=edgeCrossings(o,grid);report.triangleChecks+=r.checked;for(const c of r.out)if(report.collisions.length<40)report.collisions.push({state,...c});}
}
for(const tag of ['L','R']){
 const fin=root.getObjectByName('fin_fixed_'+tag),rudder=root.getObjectByName('rudder_skin_'+tag),fb=new T.Box3().setFromObject(fin),rb=new T.Box3().setFromObject(rudder);
 assert.ok(rb.max.y<2.66&&fb.max.y>3.3,'rudder stops below the clipped fin tip');
 const x=(tag==='L'?-1:1)*1.585;
 ray.set(new T.Vector3(x,5,8.24),new T.Vector3(0,-1,0));assert.ok(ray.intersectObject(fin).some(h=>h.point.y>3.0),'sloped fin tip has a closed cap');
}
await writeFile('work/j16/wing-validation.json',JSON.stringify(report,null,2)+'\n');assert.equal(report.collisions.length,0,JSON.stringify(report.collisions.slice(0,6),null,2));
console.log('PASS: four flap outlines, wing coverage, capped fin tips and flap movement clearances.',{...report,collisions:0});
