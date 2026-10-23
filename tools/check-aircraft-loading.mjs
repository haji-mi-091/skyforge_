import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {withBrowser} from './cdp.mjs';
const folder='work/aircraft-loading-20261022';
await mkdir(folder,{recursive:true});
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/bomb-preview.html');assert.ok(tab.ready);
 await tab.page.send('Network.enable');await tab.page.send('Network.setCacheDisabled',{cacheDisabled:true});
 const injection=await tab.page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
  const state=window.__AIRCRAFT_LOADING_CHECK__={held:false,samples:0,earlyMenu:false};
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...args){this.checkUrl=String(url);return open.call(this,method,url,...args);};
  XMLHttpRequest.prototype.send=function(...args){if(/f16_flight\\.glb$/.test(this.checkUrl)){state.held=true;setTimeout(()=>{state.held=false;send.apply(this,args);},1800);}else send.apply(this,args);};
  const timer=setInterval(()=>{if(state.held){state.samples++;const g=window.__SKYFORGE__;if(g?.ready||g?.state==='menu'||document.getElementById('loading')?.classList.contains('hidden'))state.earlyMenu=true;}if(window.__SKYFORGE__?.ready)clearInterval(timer);},25);
 })()`});
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/'});
 let ready=false;
 for(let i=0;i<600;i++){
  const state=await tab.page.evaluate(`({ready:!!window.__SKYFORGE__?.ready,text:document.getElementById('loading-text')?.textContent})`);
  assert.ok(!state.text?.startsWith('启动失败'),state.text);
  if(state.ready){ready=true;break;}await sleep(200);
 }
 assert.ok(ready,'all aircraft preload and warm-up completes');
 const result=await tab.page.evaluate(`(async()=>{
  const g=window.__SKYFORGE__,{AIRCRAFT_TYPES,F16CM_BLOCK52}=await import('/src/data/aircraft.js'),{JetModel}=await import('/src/visual/JetModel.js'),{GLTFLoader}=await import('/vendor/GLTFLoader.module.js');
  const checks=[],check=(ok,name)=>checks.push({ok:!!ok,name});
  check(g.state==='menu'&&document.getElementById('loading').classList.contains('hidden'),'menu opens after startup');
  check(window.__AIRCRAFT_LOADING_CHECK__.samples>0&&!window.__AIRCRAFT_LOADING_CHECK__.earlyMenu,'delayed F-16 keeps startup loading page visible');
  check(g.aircraftWarmJets.length===Object.keys(AIRCRAFT_TYPES).length,'all registered aircraft have resident warm-up instances');
  check(g.aircraftWarmJets.every(j=>j.airframe&&!j.group.visible&&!j.group.parent&&!j.disposed),'warm-up resources stay ready and outside gameplay scene');
  const requests=()=>performance.getEntriesByType('resource').filter(r=>/assets\\/models\\/(f16\\/f16_flight|j16\\/j16-white|j10c\\/j10c-white)\\.glb$/.test(r.name)).map(r=>new URL(r.name).pathname);
  const before=requests();check(before.length===3&&new Set(before).size===3,'each shipping GLB requested once on startup');
  for(const id of ['j16','j10c','f16cm-block52','j10c','j16','f16cm-block52']){
   g.screens.selectAircraft(id);const j=g.showcase;await j.ready;g._updateShowcase(0);
   check(!!j.airframe&&j.group.visible,id+' showcase ready after switch');
  }
  check(requests().length===before.length,'switching/disposal/recreation uses parsed templates without GLB requests');
  check(!g.engine.renderer.info.programs.some(p=>p.diagnostics?.runnable===false),'aircraft and cockpit shaders compile');
  // A fresh cache key lets us hold the F-16 loader independently of startup.
  const original=GLTFLoader.prototype.loadAsync;let release;
  const gate=new Promise(r=>{release=r;});GLTFLoader.prototype.loadAsync=async function(url){await gate;return original.call(this,url);};
  const cfg=structuredClone(F16CM_BLOCK52);cfg.visual.cadModel='/assets/models/f16/f16_flight.glb?loading-check=delayed';
  const j=new JetModel(cfg);const pose=g._showcasePose;
  j.sync(0,pose,{gear:1,flaps:0,airbrake:0},{missiles:0},{cockpit:false});j.setCockpitView(true);j.setCockpitView(false);
  check(j.cadLoading&&!j.group.visible&&!j.airframe,'sync/cockpit switches cannot reveal procedural fallback');
  release();try{await j.ready;check(j.group.visible&&j.airframe===j.cadGroup&&!j.cadLoading,'ready exposes assembled CAD model');check(j._groundContact===false&&j.group.position.distanceTo(pose.position)<1e-8,'latest sync replayed');}finally{j.dispose();GLTFLoader.prototype.loadAsync=original;}
  const disposed=new JetModel(structuredClone(cfg));disposed.dispose();await disposed.ready;
  check(disposed.disposed&&disposed.group.children.length===0&&!disposed.airframe&&!disposed.cadGroup,'late cached load does not resurrect a disposed jet');
  const failCfg=structuredClone(cfg);failCfg.visual.cadModel+='-failure';GLTFLoader.prototype.loadAsync=async()=>{throw new Error('intentional model failure');};
  const failed=new JetModel(failCfg);let rejected=false;
  try{await failed.ready;}catch(error){rejected=/intentional model failure/.test(error.message);}finally{GLTFLoader.prototype.loadAsync=original;}
  check(rejected&&!failed.cadLoading&&!failed.group.visible&&!failed.airframe,'F-16 ready rejects and leaves fallback hidden on failure');failed.dispose();
  // The same readiness guard is also used when the MiG-29 launches a missile.
  const mig=g.aircraftWarmJets.find(j=>j.config.id==='mig29');check(mig.airframe===mig.group,'procedural MiG supplies existing combat readiness root');
  return {checks,requests:before,models:g.aircraftWarmJets.map(j=>j.config.id),delay:window.__AIRCRAFT_LOADING_CHECK__};
 })()`);
 for(const c of result.checks)assert.ok(c.ok,c.name);assert.deepEqual(tab.page.problems,[]);
 for(const [name,yaw,pitch]of [['rear',0,.15],['nose-below',Math.PI,-.08],['side',Math.PI/2,.15],['above',.7,1.05]]){
  await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;g.hangarView.yaw=${yaw};g.hangarView.pitch=${pitch};g.hangarView.distance=22;g._updateShowcase(0);g.engine.render();})()`);
  await writeFile(folder+'/f16-'+name+'.png',await tab.screenshot());
 }
 await tab.page.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
 await tab.page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
  const open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...args){this.checkUrl=String(url);return open.call(this,method,url,...args);};
  XMLHttpRequest.prototype.send=function(...args){if(/f16_flight\\.glb$/.test(this.checkUrl))setTimeout(()=>this.dispatchEvent(new ProgressEvent('error')),0);else send.apply(this,args);};
 })()`});
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/'});
 let failure;
 for(let i=0;i<200;i++){
  failure=await tab.page.evaluate(`({text:document.getElementById('loading-text')?.textContent,visible:!document.getElementById('loading')?.classList.contains('hidden'),ready:!!window.__SKYFORGE__?.ready,state:window.__SKYFORGE__?.state})`);
  if(failure.text?.startsWith('启动失败'))break;await sleep(100);
 }
 assert.ok(failure.visible&&!failure.ready&&failure.state==='loading'&&/启动失败.*F-16CM.*模型加载失败/.test(failure.text)&&!failure.text.includes('undefined'),JSON.stringify(failure));
 await writeFile(folder+'/checks.json',JSON.stringify({...result,bootFailure:failure},null,2));
 console.log('PASS: startup waits for all aircraft, resident warm-up, one GLB load per model, repeated switches/disposal, F-16 pending visibility/latest pose/ready/failure/disposal, MiG readiness and named boot-failure screen.');
 await tab.close();
});
