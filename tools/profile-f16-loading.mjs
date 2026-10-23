import {readFile,writeFile,mkdir} from 'node:fs/promises';
const dir='work/f16-loading';await mkdir(dir,{recursive:true});
const base='http://127.0.0.1:4173/src/visual/';
const absolute=source=>source.replace(/from\s*(['"])([^'"]+)\1/g,(_,q,path)=>'from '+q+new URL(path,base+'JetModel.js').pathname+q);
const wrap=(source,names)=>{
 let wrappers='';
 for(const name of names){
  const re=new RegExp('(export )?function '+name+'\\(');const match=source.match(re);if(!match)throw new Error('Missing '+name);
  source=source.replace(re,(match,exp='')=>exp+'function '+name+'Original(');
  wrappers+='\n'+(match[1]||'')+'function '+name+'(...args){return globalThis.__profileStep('+JSON.stringify(name)+',()=>'+name+'Original(...args));}\n';
 }
 return source+wrappers;
};
for(const [file,names]of [
 ['F16Intake',['prepareNoseGearBay','buildF16Intake']],
 ['F16Skin',['weatherMap','markings','tailMap']],
])await writeFile(dir+'/'+file+'.js',wrap(absolute(await readFile('src/visual/'+file+'.js','utf8')),names));
let jet=absolute(await readFile('src/visual/JetModel.js','utf8'));
for(const file of ['F16Intake','F16Skin'])jet=jet.replace('/src/visual/'+file+'.js','/work/f16-loading/'+file+'.js');
for(const fn of ['createF16SkinMaterial','cleanF16Cad','prepareF16SkinGeometry','buildHydraulicGear','buildF16ControlSurfaces','buildF16Cockpit','buildF16Canopy','buildF16Intake']){
 const pattern=new RegExp('('+fn+'\\([^;]*?\\))(?=;)','g');
 jet=jet.replace(pattern,call=>'globalThis.__profileStep('+JSON.stringify(fn)+',()=>'+call+')');
}
await writeFile(dir+'/JetModel.js',jet);
await writeFile(dir+'/index.html','<!doctype html><meta charset="utf-8"><title>F16 load diagnostics</title><script>window.__READY__=true</script>');
const cdp=await readFile('tools/cdp.mjs','utf8');await writeFile(dir+'/cdp-native.mjs',process.argv.includes('--software')?cdp:cdp.replace("'--use-angle=swiftshader', '--enable-unsafe-swiftshader',",''));
const {withBrowser}=await import('../'+dir+'/cdp-native.mjs');
const results=[];
await withBrowser(async api=>{
 for(let run=0;run<3;run++){
  const tab=await api.open('http://127.0.0.1:4173/'+dir+'/index.html');assertReady(tab);
  await tab.page.send('Network.enable');await tab.page.send('Network.setCacheDisabled',{cacheDisabled:run===0});
  await tab.page.send('Profiler.enable');await tab.page.send('Profiler.setSamplingInterval',{interval:500});await tab.page.send('Profiler.start');
  const result=await tab.page.evaluate(`(async()=>{
   const stages=[],longTasks=[];globalThis.__profileStep=(name,fn)=>{const start=performance.now();try{return fn();}finally{stages.push({name,start,duration:performance.now()-start});}};
   new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
   const imports=performance.now();const T=await import('/vendor/three.module.js'),{JetModel}=await import('/work/f16-loading/JetModel.js'),{F16CM_BLOCK52}=await import('/src/data/aircraft.js'),{F16CM_DEFAULT_PRESETS}=await import('/src/data/hangar.js');
   stages.push({name:'imports',start:imports,duration:performance.now()-imports});
   for(const name of Object.getOwnPropertyNames(JetModel.prototype))if(name.startsWith('_')&&typeof JetModel.prototype[name]==='function'){
    const original=JetModel.prototype[name];JetModel.prototype[name]=function(...args){return globalThis.__profileStep(name,()=>original.apply(this,args));};
   }
   const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,800);renderer.localClippingEnabled=true;document.body.append(renderer.domElement);
   const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),gpu=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
   const scene=new T.Scene();scene.add(new T.HemisphereLight(0xdbe7fa,0x58616b,.45));const l=new T.DirectionalLight(0xfff2df,1.8);l.position.set(5,10,-8);scene.add(l);
   const camera=new T.PerspectiveCamera(36,1.6,.03,200);camera.position.set(9,5,-13);camera.lookAt(0,0,0);
   const config=structuredClone(F16CM_BLOCK52);config.visual.cadModel='/'+config.visual.cadModel;config.visual.loadout=structuredClone(F16CM_DEFAULT_PRESETS[2].loadout);
   const start=performance.now(),jet=globalThis.__profileStep('JetModel.constructor',()=>new JetModel(config,{isPlayer:true}));scene.add(jet.group);
   globalThis.__profileStep('render.proceduralFallback',()=>renderer.render(scene,camera));
   while(jet.cadLoading)await new Promise(r=>setTimeout(r,10));
   const cadReady=performance.now()-start;
   globalThis.__profileStep('render.firstCad',()=>renderer.render(scene,camera));
   globalThis.__profileStep('render.secondCad',()=>renderer.render(scene,camera));
   await new Promise(r=>setTimeout(r,60));
   const resource=performance.getEntriesByType('resource').filter(e=>e.name.endsWith('/f16_flight.glb')).map(e=>({duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,decodedBodySize:e.decodedBodySize}));
   let visibleMeshes=0,storedMeshes=0,materials=new Set(),textures=new Map();jet.group.traverse(o=>{if(o.isMesh){storedMeshes++;if(o.visible)visibleMeshes++;for(const m of [].concat(o.material||[])){materials.add(m);for(const t of [...Object.values(m),...(m.userData?.f16Maps||[])])if(t?.isTexture&&t.image)textures.set(t.uuid,{width:t.image.width,height:t.image.height});}}});
   return {gpu,cadReady,stages,longTasks,resource,stats:{visibleMeshes,storedMeshes,materials:materials.size,textures:[...textures.values()],render:renderer.info.render,programs:renderer.info.programs.length},problems:[]};
  })()`);
  const {profile}=await tab.page.send('Profiler.stop');await writeFile(dir+'/run-'+run+'.cpuprofile',JSON.stringify(profile));
  result.problems=tab.page.problems;results.push(result);await tab.close();
  console.log(JSON.stringify({run,gpu:result.gpu,cadReady:result.cadReady,stages:result.stages.filter(s=>s.duration>15),longTasks:result.longTasks,resource:result.resource,stats:{...result.stats,textures:result.stats.textures.length},problems:result.problems},null,2));
 }
},{width:1280,height:800});
await writeFile(dir+'/loading-profile.json',JSON.stringify(results,null,2)+'\n');
function assertReady(tab){if(!tab.ready)throw new Error('Diagnostic page did not load');}
