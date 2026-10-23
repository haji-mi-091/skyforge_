import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from './lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
const trace=JSON.parse(await readFile('assets/models/j16/nose-profile.json','utf8'));
if(trace.canopy){await import('./check-j16-canopy.mjs');}
else{
const scan=async path=>{
  const root=await readModelGlb(path);poseJ16(root,{gear:0});
  const skin=[];root.traverse(o=>{if(o.isMesh&&/^(J16_fixed_fuselage_|J16_radome|J16_forebody|J16_double_cockpit)/.test(o.name))skin.push(o);});
  const ray=new T.Raycaster();
  const height=(z,upper)=>{
    ray.set(new T.Vector3(0,upper?20:-20,z),new T.Vector3(0,upper?-1:1,0));
    const hit=ray.intersectObjects(skin)[0];assert.ok(hit,'closed skin at station '+z);
    return hit.point.y;
  };
  const result={};
  for(const label of ['upper','lower']){
    const points=trace[label].map(p=>({...p,actual:height(p.z+(p.z===-10.975?.0001:0),label==='upper')}));
    result[label]={rms:Math.sqrt(points.reduce((sum,p)=>sum+(p.actual-p.modelY)**2,0)/points.length),points};
  }
  const chord=(points,i,j)=>Math.atan2(points[j].actual-points[i].actual,points[i].z-points[j].z)*180/Math.PI;
  result.angles={upper:chord(result.upper.points,7,0),lower:chord(result.lower.points,7,0),
    lowerToMinimum:chord(result.lower.points,7,4),lowerToTip:chord(result.lower.points,4,0),
    cockpitUnderside:chord(result.lower.points,result.lower.points.length-1,7)};
  result.profile=Array.from({length:85},(_,i)=>{
    const z=-10.9749+i/84*(10.9749+trace.lower.at(-1).z);
    return {xForward:trace.radomeRootZ-z,upper:z<=-7.58?height(z,true):null,lower:height(z,false)};
  });
  return result;
};
const before=existsSync('work/j16/nose-before-measure.glb')?await scan('work/j16/nose-before-measure.glb'):null,after=await scan('assets/models/j16/j16-white.glb');
assert.ok(after.upper.rms<.008&&after.lower.rms<.008,'upper and lower actual GLB skins fit the independent photo samples');
if(before)assert.ok(after.lower.rms<before.lower.rms*.25,'lower forebody improves materially over the previous model');
assert.ok(after.angles.lowerToMinimum<0&&after.angles.lowerToTip>0,'lower skin first descends, then rises toward the tip');
assert.ok(after.angles.cockpitUnderside<0,'cockpit underside rises toward the aft fuselage, not the nose');
await writeFile('work/j16/nose-profile-validation.json',JSON.stringify({before,after},null,2)+'\n');
console.log('PASS: ray-cast upper/lower GLB profiles match photo samples; corrected belly slope; RMS before/after',
  {upper:[before?.upper.rms,after.upper.rms],lower:[before?.lower.rms,after.lower.rms],angles:after.angles});
}
