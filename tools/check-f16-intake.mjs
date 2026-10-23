import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';

const dir='work/f16-intake-light';await mkdir(dir,{recursive:true});
const compare=process.argv.includes('--compare'),reports=[];
await withBrowser(async api=>{
 for(const version of compare?['before','after']:['shipping']){
  const path=version==='shipping'?'tools/airframe-preview.html':dir+'/'+version+'.html';
  const v=await api.open('http://127.0.0.1:4173/'+path+'?view=intake&loadout=clean&gear=0&hud=0');
  assert.ok(v.ready,'F-16 preview loads '+version);
  const report=await v.page.evaluate(`(()=>{
   const p=window.__AIRFRAME_PREVIEW__;p.paused=true;
   const j=p.jet,count=root=>{let meshes=0,triangles=0,bytes=0,shadows=0;const materials=new Set();root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;bytes+=o.geometry.index?.array.byteLength??0;shadows+=o.castShadow?1:0;materials.add(o.material);});return {meshes,triangles,bytes,shadows,materials:materials.size};};
   p.renderer.render(p.scene,p.camera);
   let body;j.cadGroup.traverse(o=>{if(/cc52$/.test(o.name))body=o;});
   return {intakeBuildMs:window.__INTAKE_BUILD_MS__??null,intake:count(j.cadIntake),well:count(j.cadGroup.userData.noseBay),body:count(body),render:{...p.renderer.info.render},baked:!!j.cadIntake.userData.baked,sameWeatherMap:j.cadIntake.userData.liner.material.map===j.cadSkinMaterial.map};
  })()`);
  report.version=version;
  assert.ok(report.sameWeatherMap,'interior shares weather texture');
  if(version!=='before'){
   assert.ok(report.baked);assert.equal(report.intake.meshes,2);assert.equal(report.well.meshes,2);
   assert.ok(report.intake.triangles<1600);assert.equal(report.intake.shadows+report.well.shadows,0);
   if(report.intakeBuildMs!==null)assert.ok(report.intakeBuildMs<50,'no CAD fitting stall');
  }
  for(const [name,offset]of [['front',[0,-.05,-3.1]],['quarter',[1.7,.05,-2.8]],['below',[.7,-1.5,-2.8]]]){
   await v.page.evaluate(`(()=>{const p=window.__AIRFRAME_PREVIEW__;p.camera.position.set(${offset[0]},${-.65+offset[1]},${-2.7+offset[2]});p.camera.lookAt(0,-.65,-2.7);p.renderer.render(p.scene,p.camera);})()`);
   await writeFile(dir+'/'+version+'-'+name+'.png',await v.screenshot());
  }
  assert.deepEqual(v.page.problems,[],'no shader/runtime errors');
  reports.push(report);console.log(JSON.stringify(report));await v.close();
 }
},{width:1000,height:800});
if(compare){
 assert.ok(reports[1].intakeBuildMs<reports[0].intakeBuildMs*.1);
 assert.ok(reports[1].intake.triangles<reports[0].intake.triangles*.4);
}
await writeFile(dir+(compare?'/benchmark.json':'/shipping-check.json'),JSON.stringify(reports,null,2)+'\n');
console.log('PASS: baked low-poly F-16 intake, shared skin, merged wheel well, draw budgets and browser rendering.');
