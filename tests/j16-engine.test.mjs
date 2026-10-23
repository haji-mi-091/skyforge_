import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
import {triangleGrid,edgeCrossings} from '../tools/lib/mesh-queries.mjs';
const root=await readModelGlb('assets/models/j16/j16-white.glb'),body=[],ribs=[],report={poses:0,triangleChecks:0,collisions:[],closedFeathers:0};
root.traverse(o=>{if(!o.isMesh)return;if(/^(J16_fixed_fuselage_tail|stabilator_skin_|ventral_keel_)/.test(o.name))body.push(o);if(/^nozzle_.*_outer_rib_/.test(o.name))ribs.push(o);
 if(/^nozzle_.*_feather_/.test(o.name)){
  const p=o.geometry.attributes.position,idx=o.geometry.index.array,edges=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
  for(let i=0;i<idx.length;i+=3)for(let j=0;j<3;j++){const a=key(idx[i+j]),b=key(idx[i+(j+1)%3]);if(a===b)continue;const k=[a,b].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}
  assert.ok([...edges.values()].every(n=>n===2),o.name+' closed inner/outer skins and rim');report.closedFeathers++;
 }
});
for(let i=0;i<=20;i++){poseJ16(root,{gear:0,nozzle:i/20,pitch:i/10-1});const grid=triangleGrid(body);for(const rib of ribs){const r=edgeCrossings(rib,grid);report.triangleChecks+=r.checked;report.collisions.push(...r.out);}report.poses++;}
assert.equal(report.closedFeathers,32);assert.equal(report.collisions.length,0,JSON.stringify(report.collisions.slice(0,4)));await writeFile('work/j16/engine-geometry-validation.json',JSON.stringify(report,null,2));console.log('PASS: 32 closed nozzle feathers and moving external ribs clear tail geometry.',report);
