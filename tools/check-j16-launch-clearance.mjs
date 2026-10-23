import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&loadout=modern&gear=0&hud=0&grid=0');assert.ok(tab.ready);
 const result=await tab.page.evaluate(`(async()=>{
 const a=window.__J16_PREVIEW__,{triangleGrid,edgeCrossings}=await import('/tools/lib/mesh-queries.mjs'),report={launches:0,poses:0,triangleChecks:0,collisions:[]};a.paused=true;
 for(const [preset,stations]of [['modern',['LT','LO','LI','LN','CF','CR','RN','RI','RO','RT']],['wiki',['LT','LI']],['strike',['LI']],['sead',['LI','LO']]])for(const id of stations){
  a.setLoadout(preset);a.setState({gear:0});const shot=a.systems.launch(id),targets=[];a.root.traverse(o=>{if(o.isMesh&&!o.material.isShaderMaterial)targets.push(o);});const grid=triangleGrid(targets);report.launches++;
  const meshes=[];shot.weapon.traverse(o=>{const m=o.userData.exportExtras||o.userData;if(o.isMesh&&['body','fins'].includes(m.part))meshes.push(o);});
  for(let i=0;i<40;i++){a.systems.update(.02,a.state);shot.weapon.updateMatrixWorld(true);report.poses++;for(const o of meshes){const r=edgeCrossings(o,grid,2);report.triangleChecks+=r.checked;for(const c of r.out)if(report.collisions.length<30)report.collisions.push({preset,id,age:shot.age,...c});}}
 }
 a.systems.resetLaunches();return report;})()`);
 await writeFile('work/j16/launch-clearance-validation.json',JSON.stringify(result,null,2));assert.equal(result.collisions.length,0,JSON.stringify(result.collisions.slice(0,8),null,2));
 assert.deepEqual(tab.page.problems,[]);console.log('PASS: actual missile bodies and fins clear airframe, launchers and neighbouring stores.',result);await tab.close();
});
