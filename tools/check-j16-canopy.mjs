import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from './lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
import {withBrowser} from './cdp.mjs';
const trace=JSON.parse(await readFile('assets/models/j16/nose-profile.json','utf8')),ct=trace.canopy;
const root=await readModelGlb('assets/models/j16/j16-white.glb');poseJ16(root,{gear:0});
const skin=[],glass=[];root.traverse(o=>{
 if(o.isMesh&&/^(J16_fixed_fuselage_|J16_radome|J16_forebody|J16_double_cockpit)/.test(o.name))skin.push(o);
 if(o.isMesh&&/^(fixed_windscreen_glass|canopy_.*_glass)$/.test(o.name))glass.push(o);
});
const ray=new T.Raycaster();
const height=(z,upper,objects=skin,x=0)=>{
 ray.set(new T.Vector3(x,upper?20:-20,z),new T.Vector3(0,upper?-1:1,0));
 const hits=ray.intersectObjects(objects);assert.ok(hits.length,'surface at '+z);return hits[0].point.y;
};
const result={};
for(const label of ['upper','lower']){
 const points=trace[label].filter(p=>p.z<=-7.59).map(p=>({...p,actual:height(p.z+(p.z===-10.975?.0001:0),label==='upper')}));
 result[label]={rms:Math.sqrt(points.reduce((s,p)=>s+(p.actual-p.modelY)**2,0)/points.length)};
 assert.ok(result[label].rms<.004,label+' actual skin follows the smooth constrained fit');
 const values=Array.from({length:65},(_,i)=>height(T.MathUtils.lerp(-10.94,-7.61,i/64),label==='upper'));
 const slopes=values.slice(1).map((y,i)=>(y-values[i])/((10.94-7.61)/64));
 const sign=label==='upper'?-1:1;
 assert.ok(slopes.slice(1).every((s,i)=>sign*(s-slopes[i])>-.035),label+' has no local curvature reversal or flat dent');
 for(const z of [trace.radomeRootZ,-7.58]){
  const left=(height(z-.005,label==='upper')-height(z-.045,label==='upper'))/.04;
  const right=(height(z+.045,label==='upper')-height(z+.005,label==='upper'))/.04;
  assert.ok(Math.abs(right-left)<.07,label+' joins the radome and forebody without a kink at '+z);
 }
}
const upperErrors=ct.upper.filter(p=>p.z>ct.frontZ+.01&&p.z<ct.rearZ-.01).map(p=>height(p.z,true,glass)-p.modelY);
result.canopyTopRms=Math.sqrt(upperErrors.reduce((s,e)=>s+e*e,0)/upperErrors.length);
assert.ok(result.canopyTopRms<.005,'rebuilt glass upper curve follows the new side-reference coordinates');
for(const name of ['seat_0_headbox','seat_1_headbox','HUD_combiner']){
 const o=root.getObjectByName(name),p=o.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
  assert.ok(v.y<height(v.z,true,glass,v.x)-.01,name+' clears the closed glazing');
 }
}
for(const amount of [0,.25,.5,.75,1]){
 poseJ16(root,{gear:1,canopy:amount});
 root.getObjectByName('canopy_hinge').traverse(o=>{
  if(!o.isMesh||!o.name.endsWith('_glass'))return;
  const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
   assert.ok(v.z<ct.rearZ+.025,'opening glass stays forward of the aft fairing');
  }
 });
}
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&view=profile&hud=0&grid=0');
 assert.ok(tab.ready);
 assert.equal(await tab.page.evaluate('window.__J16_PREVIEW__.camera.isOrthographicCamera'),true);
 await writeFile('work/j16/canopy-orthographic.png',await tab.screenshot());
 await tab.page.evaluate("(()=>{const a=window.__J16_PREVIEW__;a.setView('cockpit');a.setState({canopy:1});a.camera.position.set(6,4,-5.5);a.camera.fov=45;a.camera.updateProjectionMatrix();a.camera.lookAt(0,1.8,-5);a.render();})()");
 await writeFile('work/j16/canopy-open.png',await tab.screenshot());
 assert.deepEqual(tab.page.problems,[]);await tab.close();
},{width:1200,height:469});
await writeFile('work/j16/canopy-validation.json',JSON.stringify(result,null,2)+'\n');
console.log('PASS: smooth upper/lower curvature and joins; coordinate-fit canopy; seats/HUD clearance; five opening poses; real orthographic browser render.',result);
