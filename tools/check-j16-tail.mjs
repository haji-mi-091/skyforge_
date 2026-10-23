import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
const prefix=process.argv.includes('--before')?'tail-before-':'tail-';
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&hud=0&grid=0');assert.ok(tab.ready);
 if(prefix==='tail-')for(const view of ['tail','tail-rear','tail-bottom']){
  const selected=await tab.page.evaluate(`(()=>{const s=document.getElementById('view');s.value='${view}';s.dispatchEvent(new Event('change'));return {value:s.value,draws:window.__J16_PREVIEW__.renderer.info.render.calls};})()`);
  assert.ok(selected.value===view&&selected.draws>100,'tail preset '+view);
 }
 for(const [name,pos,aim,state,ortho]of [
  ['rear',[0,.25,30],[0,.25,7.5],{},10.7],
  ['quarter',[8,4.7,15],[0,-.15,7.1],{},null],
  ['bottom',[6,-5,14],[0,-1,7.2],{},null],
  ['side',[12,1,7.5],[0,-.2,7.1],{},null],
  ['roots',[4.1,2.3,10.1],[1.3,-.3,7.0],{},null],
  ['exhaust',[3.2,-.2,13.8],[.6,-.9,8.1],{},null],
  ['pitch-up',[8,3,15],[0,-.3,7.3],{pitch:1,yaw:1,nozzle:0},null],
  ['pitch-down',[6,-4,14],[0,-.8,7.3],{pitch:-1,yaw:-1,nozzle:1},null],
 ]){
  await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setState({pitch:0,yaw:0,nozzle:.7,...${JSON.stringify(state)}});a.setView('${ortho?'profile':'rear'}');const c=a.camera;
   ${ortho?`c.left=-${ortho}/2;c.right=${ortho}/2;c.top=${ortho}*.625/2;c.bottom=-c.top;`:''}
   c.position.set(...${JSON.stringify(pos)});c.lookAt(...${JSON.stringify(aim)});c.updateProjectionMatrix();a.render();})()`);
  await writeFile('work/j16/'+prefix+name+'.png',await tab.screenshot());
 }
 assert.deepEqual(tab.page.problems,[]);await tab.close();
 if(prefix==='tail-')await writeFile('work/j16/tail-browser-validation.json',JSON.stringify({views:8,presets:['tail','tail-rear','tail-bottom'],extremeStates:[{pitch:1,yaw:1,nozzle:0},{pitch:-1,yaw:-1,nozzle:1}],problems:[]},null,2)+'\n');
},{width:1440,height:900});
console.log('PASS: eight tail inspection views and extreme stabilator/rudder/nozzle poses rendered.');
