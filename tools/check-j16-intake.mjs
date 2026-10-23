import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await mkdir('work/j16',{recursive:true});
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=base&hud=0&grid=0');
 assert.ok(tab.ready);
 const views=[
  ['front',[0,-.95,-20],[0,-.95,-.6],5.2,{},[0,1,0]],
  ['side',[20,-1,-.7],[0,-1,-.7],5.4,{},[0,1,0]],
  ['bottom',[0,-20,-.6],[0,-1,-.6],5.6,{},[0,0,1]],
  ['quarter',[4,-2.7,-6],[.5,-1,-.8],null,{},[0,1,0]],
  ['ramps',[3,-2.6,-5],[.7,-1,-.9],null,{ramps:1},[0,1,0]],
 ];
 for(const [name,pos,aim,width,state,up]of views){
  await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setState({gear:1,ramps:0,...${JSON.stringify(state)}});
    a.setView(${width?'\'profile\'':'\'cockpit\''});const c=a.camera;
    ${width?`c.left=-${width}/2;c.right=${width}/2;c.top=${width}*.625/2;c.bottom=-c.top;`:''}
    c.up.set(...${JSON.stringify(up)});c.position.set(...${JSON.stringify(pos)});c.lookAt(...${JSON.stringify(aim)});c.updateProjectionMatrix();a.render();})()`);
  await writeFile('work/j16/intake-'+name+'.png',await tab.screenshot());
 }
 for(const view of ['intake','intake-front','intake-side','intake-bottom']){
  const state=await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setView('${view}');return {view:document.getElementById('view').value,ortho:!!a.camera.isOrthographicCamera};})()`);
  assert.equal(state.view,view);assert.equal(state.ortho,view!=='intake');
 }
 assert.deepEqual(tab.page.problems,[]);
 const errors=tab.page.events.filter(e=>e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');assert.deepEqual(errors,[]);
 await tab.close();
},{width:1440,height:900});
console.log('PASS: front/side/bottom/quarter intake views, moving ramp and four preview presets, zero browser errors.');
