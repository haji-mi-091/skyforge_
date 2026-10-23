import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
import {buildJ16Stores,J16_STATIONS,J16_LOADOUTS,J16_WEAPONS} from '../src/visual/J16Stores.js';
import {triangleGrid,edgeCrossings} from '../tools/lib/mesh-queries.mjs';
const root=await readModelGlb('assets/models/j16/j16-white.glb');
assert.equal(J16_STATIONS.length,10);assert.equal(new Set(J16_STATIONS.map(s=>s.id)).size,10);
const fixed=[],moving=[];root.traverse(o=>{if(!o.isMesh)return;let p=o;while(p&&!(p.userData.exportExtras||p.userData).role)p=p.parent;((p&&!['sensor-gimbal','canopy'].includes((p.userData.exportExtras||p.userData).role))?moving:fixed).push(o);});
poseJ16(root,{gear:0});const staticGrid=triangleGrid(fixed),ray=new T.Raycaster(),report={presets:[],poses:0,contacts:0,triangleChecks:0,collisions:[]};
const test=(mesh,grid,context)=>{const r=edgeCrossings(mesh,grid,3);report.triangleChecks+=r.checked;for(const c of r.out)if(report.collisions.length<100)report.collisions.push({context,...c});};
for(const preset of ['racks','modern','wiki','strike','sead']){
 const stores=buildJ16Stores(root,preset);root.add(stores);root.updateMatrixWorld(true);assert.equal(stores.children.length,10);
 const weapons=[],all=[];stores.traverse(o=>{if(!o.isMesh)return;all.push(o);if((o.userData.exportExtras||o.userData).storeId)weapons.push(o);});
 for(const o of all){const p=o.geometry.attributes.position;assert.ok(Array.from(p.array).every(Number.isFinite),o.name+' finite geometry');
  const m=o.userData.exportExtras;if(m.part==='contact'){ray.set(new T.Vector3(m.support[0],-5,m.support[2]),new T.Vector3(0,1,0));const hit=ray.intersectObjects(fixed).find(h=>h.point.y<0);assert.ok(hit&&Math.abs(hit.point.y-m.support[1])<.002,o.name+' attached to underside');report.contacts++;}}
 for(const o of weapons)test(o,staticGrid,preset+' fixed');
 const weaponGrid=triangleGrid(weapons);
 for(const o of fixed)test(o,weaponGrid,preset+' fixed reverse');
 // Adjacent stores and pylons must not intersect. Internal body/fin and
 // suspension joints within the same station are deliberate connections.
 for(let i=0;i<stores.children.length;i++){const station=stores.children[i],others=[];for(let j=i+1;j<stores.children.length;j++)stores.children[j].traverse(o=>{if(o.isMesh)others.push(o);});if(!others.length)continue;const grid=triangleGrid(others);station.traverse(o=>{if(o.isMesh)test(o,grid,preset+' neighbour');});}
 for(let i=0;i<=16;i++){
  const pose={gear:i/16,slats:i/16,flaps:i/16,compression:i===16?1:0,pitch:(i/16-.5)*2,yaw:(i/16-.5)*2,ramps:i/16};poseJ16(root,pose);report.poses++;
  const grid=triangleGrid(moving);for(const o of all)test(o,grid,preset+' pose '+i);
  for(const o of moving)test(o,weaponGrid,preset+' pose reverse '+i);
 }
 root.remove(stores);report.presets.push({preset,weaponCount:Object.keys(J16_LOADOUTS[preset].stores).length,meshCount:all.length});
}
await writeFile('work/j16/stores-validation.json',JSON.stringify(report,null,2)+'\n');
assert.equal(report.collisions.length,0,JSON.stringify(report.collisions.slice(0,12),null,2));
console.log('PASS: ten hardpoints, nine store types, underside contacts, adjacent stores and gear/flap sweep.',report);
