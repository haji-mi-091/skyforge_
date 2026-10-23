import {readFile,writeFile} from 'node:fs/promises';
import {withBrowser} from '../work/f16-loading/cdp-native.mjs';
const results=[];
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/work/f16-loading/index.html');
 await tab.page.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__LOAD_TIMING__={tasks:[],gaps:[]};new PerformanceObserver(l=>window.__LOAD_TIMING__.tasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});const frame=window.requestAnimationFrame;let last;window.requestAnimationFrame=cb=>frame.call(window,t=>{if(last!==undefined&&t-last>50)window.__LOAD_TIMING__.gaps.push(t-last);last=t;cb(t);});`});
 for(let run=0;run<2;run++){
  await tab.page.send('Profiler.enable');await tab.page.send('Profiler.setSamplingInterval',{interval:1000});await tab.page.send('Profiler.start');
  await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/tools/airframe-preview.html?loadout=tanks&view=intake&gear=0&revision=intake-fit-2'});
  if(!await tab.page.waitReady())throw new Error('Actual preview failed to become ready');
  const state=await tab.page.evaluate(`(()=>{const a=window.__AIRFRAME_PREVIEW__;a.paused=true;const gl=a.renderer.getContext(),d=gl.getExtension('WEBGL_debug_renderer_info');return {elapsed:performance.now(),gpu:gl.getParameter(d.UNMASKED_RENDERER_WEBGL),...window.__LOAD_TIMING__,resource:performance.getEntriesByType('resource').filter(e=>e.name.endsWith('f16_flight.glb')).map(e=>({duration:e.duration,transferSize:e.transferSize,bytes:e.encodedBodySize})),stats:a.renderer.info.render};})()`);
  const {profile}=await tab.page.send('Profiler.stop');await writeFile('work/f16-loading/preview-'+run+'.cpuprofile',JSON.stringify(profile));
  const parent=new Map(),nodes=new Map(profile.nodes.map(n=>[n.id,n])),inclusive=new Map();
  for(const n of profile.nodes)for(const child of n.children||[])parent.set(child,n.id);
  profile.samples.forEach((id,i)=>{const dt=profile.timeDeltas[i]||0,seen=new Set();while(id){const n=nodes.get(id),name=n?.callFrame.functionName;if(name&&!seen.has(name)){seen.add(name);inclusive.set(name,(inclusive.get(name)||0)+dt);}id=parent.get(id);}});
  state.cpuInclusiveMs=Object.fromEntries(['replaceInnerWall','buildF16Intake','_prepareCadRig','smoothCadSkin','splitCadVolume','WebGLProgram'].map(n=>[n,(inclusive.get(n)||0)/1000]));
  results.push(state);console.log(JSON.stringify({run,...state},null,2));
 }
 if(tab.page.problems.length)throw new Error(JSON.stringify(tab.page.problems));await tab.close();
},{width:1280,height:800});
await writeFile('work/f16-loading/preview-profile.json',JSON.stringify(results,null,2)+'\n');
