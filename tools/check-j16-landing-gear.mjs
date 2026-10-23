import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&hud=0&grid=0');assert.ok(tab.ready);
 const frontPreset=await tab.page.evaluate(`(()=>{const s=document.getElementById('view');s.value='gear-front';s.dispatchEvent(new Event('change'));return window.__J16_PREVIEW__.camera.isOrthographicCamera&&s.value==='gear-front';})()`);
 assert.ok(frontPreset,'visible front-gear preset selects its orthographic camera');
 for(const [name,pos,aim,state,ortho]of [
  ['front',[0,-.60,-24],[0,-.60,0],{gear:1},8.4],
  ['nose',[2.8,-1.6,-6.3],[0,-1.9,-2.9],{gear:1},null],
  ['main',[5.8,-1.8,1.2],[2,-1.9,3.4],{gear:1},null],
  ['root-top',[6,5,5],[1.9,-.6,2.4],{gear:0},null],
  ['root-stored',[5.5,-4.8,5.4],[1.8,-.9,2.5],{gear:0},null],
  ['root-open',[5.5,-4.8,5.4],[1.8,-.9,2.5],{gear:1},null],
 ]){
  await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setState(${JSON.stringify(state)});a.setView('${ortho?'profile':'gear'}');const c=a.camera;
   ${ortho?`c.left=-${ortho}/2;c.right=${ortho}/2;c.top=${ortho}*.625/2;c.bottom=-c.top;`:''}
   c.position.set(...${JSON.stringify(pos)});c.lookAt(...${JSON.stringify(aim)});c.updateProjectionMatrix();a.render();})()`);
  await writeFile('work/j16/landing-'+name+'.png',await tab.screenshot());
 }
 for(const gear of [1,.75,.5,.25,0]){
  await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setView('gear');a.setState({gear:${gear}});a.camera.position.set(6,-4,6);a.camera.lookAt(1,-1,1);a.render();})()`);
  await writeFile('work/j16/landing-motion-'+gear+'.png',await tab.screenshot());
 }
 assert.deepEqual(tab.page.problems,[]);await tab.close();
},{width:1440,height:900});
console.log('PASS: landing gear front/nose/main/root views and five retraction stages rendered.');
