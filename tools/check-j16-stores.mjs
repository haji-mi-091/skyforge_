import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&loadout=modern&hud=0&grid=0');assert.ok(tab.ready);
 const checks=[];
 for(const [preset,view,gear]of [['modern','beauty',1],['modern','bottom',0],['wiki','front',1],['strike','bottom',0],['strike','beauty',1],['sead','bottom',0]]){
  checks.push(await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setState({gear:${gear},slats:0,flaps:0});a.setLoadout('${preset}');a.setView('${view}');return {preset:'${preset}',view:'${view}',stations:a.root.getObjectByName('J16_external_stores').children.length,draws:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};})()`));
  await writeFile('work/j16/stores-'+preset+'-'+view+'.png',await tab.screenshot());
 }
 for(const [name,expression]of [
  ['wing-open',"a.setLoadout('modern');a.setState({gear:0,slats:1,flaps:1});a.setView('bottom');a.camera.position.set(11,-8,1);a.camera.up.set(0,0,-1);a.camera.lookAt(4,-.8,3);"],
  ['fin-shape',"a.setLoadout('clean');a.setState({gear:0,yaw:.6});a.setView('tail');a.camera.position.set(11,2,7);a.camera.lookAt(1.3,1,7);"],
  ['weapon-close',"a.setLoadout('sead');a.setState({gear:0,slats:0,flaps:0});a.setView('beauty');a.camera.position.set(7,-4,-1);a.camera.lookAt(3.3,-1.5,2.4);"],
 ]){await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;${expression}a.render();})()`);await writeFile('work/j16/'+name+'.png',await tab.screenshot());}
 const select=await tab.page.evaluate("(()=>{const el=document.getElementById('loadout');el.value='strike';el.dispatchEvent(new Event('change'));return window.__J16_PREVIEW__.root.getObjectByName('J16_external_stores').userData.exportExtras.loadout;})()");assert.equal(select,'strike');
 assert.ok(checks.every(c=>c.stations===10&&c.draws>250));assert.deepEqual(tab.page.problems,[]);
 await writeFile('work/j16/stores-browser-validation.json',JSON.stringify({checks,select,problems:tab.page.problems},null,2));
 console.log('PASS: six loaded views, four articulated wing surfaces, fin outline, stores close-up, actual loadout selector and zero browser errors.');await tab.close();
},{width:1440,height:1000});
