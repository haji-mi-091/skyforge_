import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&loadout=modern&view=engine-side&throttle=1.1&gear=0&hud=0&grid=0');assert.ok(tab.ready,JSON.stringify(tab.page.problems));
 const results=await tab.page.evaluate(`(async()=>{
  const a=window.__J16_PREVIEW__,T=await import('/vendor/three.module.js'),checks=[],s=a.systems;a.paused=true;
  const check=(ok,name,data)=>checks.push({name,ok:!!ok,data});
  const target=new T.WebGLRenderTarget(720,480);target.texture.encoding=T.sRGBEncoding;
  const pixels=()=>{a.renderer.setRenderTarget(target);a.renderer.render(a.scene,a.camera);const p=new Uint8Array(720*480*4);a.renderer.readRenderTargetPixels(target,0,0,720,480,p);a.renderer.setRenderTarget(null);return p;};
  const diff=(off,on)=>{let changed=0,orange=0,blue=0;const columns=Array(720).fill(0);for(let i=0;i<off.length;i+=4){const dr=on[i]-off[i],dg=on[i+1]-off[i+1],db=on[i+2]-off[i+2];if(Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db))>5){changed++;if(dr>db+3)orange++;if(db>dr+3)blue++;columns[(i/4)%720]+=Math.max(dr,db,0);}}return{changed,orange,blue,columns};};
  const renderFlame=throttle=>{a.setState({throttle});s.exhausts.forEach(e=>e.group.visible=false);const off=pixels();s.update(0,a.state);return diff(off,pixels());};
  const dry=renderFlame(1);check(dry.blue>30&&dry.blue>dry.orange,'blue high-power flame is rendered',dry);
  const partial=renderFlame(1.04);const full=renderFlame(1.1);check(full.orange>150&&full.orange>full.blue*2,'full AB is predominantly orange',full);
  check(s.exhausts.every(e=>e.group.userData.exhaust.uniforms.uStart.value<0),'both flames originate inside the nozzle');
  const rig=s.exhausts[0].group.userData.exhaust;
  check(rig.length>3&&rig.length<6,'plume has a bounded physical scale',{length:rig.length});
  const peak=Math.max(...full.columns),peaks=[];for(let i=3;i<717;i++)if(full.columns[i]>peak*.18&&full.columns[i]>full.columns[i-1]&&full.columns[i]>=full.columns[i+1]&&(!peaks.length||i-peaks.at(-1)>12))peaks.push(i);
  check(peaks.length>=3,'multiple resolved Mach cells',{peaks});
  const before=pixels();s.update(.08,a.state);const moving=diff(before,pixels());check(moving.changed>80,'shock cells and gas structure animate',{changed:moving.changed});
  a.setView('front');const front=renderFlame(1.1);check(front.changed<12,'opaque airframe occludes both exhausts from the front',{changed:front.changed});
  a.setState({throttle:0});check(s.exhausts.every(e=>!e.group.visible),'engine off removes both flames');
  a.setView('gun');s.fireGun(false);s.update(0,a.state);const gunOff=pixels();s.fireGun(true);s.update(.12,a.state);const gun=diff(gunOff,pixels());check(gun.changed>20&&s.gun.visible,'30mm muzzle texture is visible',{changed:gun.changed});s.fireGun(false);s.update(0,a.state);check(!s.gun.visible,'release extinguishes gun flash');
  let particles=0;a.scene.traverse(o=>{if(o.isPoints||o.isSprite)particles++;});check(particles===0,'no particle emitters, sprites or point clouds',{particles});
  const launches=[];
  for(const id of ['LT','LO','LI','LN','CF','CR','RN','RI','RO','RT']){
   const station=a.root.getObjectByName('station_'+id),weapon=station.children.find(o=>(o.userData.exportExtras||o.userData).storeId),position=weapon.getWorldPosition(new T.Vector3()),shot=s.launch(id);
   const continuity=shot.weapon.position.distanceTo(position);check(continuity<1e-7,id+' leaves from its actual mounted position',{continuity});check(!s.launch(id),id+' cannot fire twice');
   s.update(.02,a.state);check(!shot.plume.visible,id+' motor waits for ignition');s.update(.30,a.state);check(shot.plume.visible&&shot.weapon.position.distanceTo(position)>.5,id+' separates and ignites');launches.push({id,mode:shot.mode,distance:shot.weapon.position.distanceTo(position)});
  }
  s.update(6,a.state);check(s.shots.length===0,'spent launch effects retire');s.resetLaunches();check(s.fired.length===0&&a.root.getObjectByName('station_LT').children.some(o=>o.name==='PL10'&&o.visible),'reset restores exact mounted objects');
  const Original=window.AudioContext;
  const mix=async(spool,ab,gun)=>{const ctx=new OfflineAudioContext(2,24000,24000);window.AudioContext=function(){return ctx};const {AudioEngine}=await import('/src/core/Audio.js');const sound=new AudioEngine({sampleManifest:'audio/j16/pack.json',voices:false,tones:false,gunMode:'shots'});sound.init();window.AudioContext=Original;await sound._externalPromise;sound.update(.016,{spool,afterburner:ab,gunFiring:gun,tas:0,altitude:0});const pcm=await ctx.startRendering(),d=pcm.getChannelData(0);let sum=0,peak=0;for(const x of d){sum+=x*x;peak=Math.max(peak,Math.abs(x));}return{rms:Math.sqrt(sum/d.length),peak,samples:Object.keys(sound.samples),afterburner:sound._external.engineAfterburner.gain.gain.value,procedural:sound._nodes.engine.gain.gain.value};};
  const idle=await mix(.25,0,false),mil=await mix(1,0,false),ab=await mix(1,1,false),cannon=await mix(0,0,true);
  check(idle.rms>.001&&mil.rms>idle.rms,'WT engine sample mix responds to throttle',{idle,mil});check(ab.afterburner>0&&ab.peak<=1,'WT afterburner layer renders without clipping',ab);check(cannon.rms>.001&&cannon.samples.includes('gunFirst')&&cannon.samples.includes('gunLast'),'local 30mm shot samples decode and render',cannon);check(mil.procedural<1e-5,'sampled engine silences synthetic roar');
  check(!a.renderer.info.programs.some(p=>p.diagnostics?.runnable===false),'all effect shaders compile');target.dispose();return{checks,launches};
 })()`);
 await writeFile('work/j16/systems-validation.json',JSON.stringify(results,null,2));
 for(const c of results.checks)assert.ok(c.ok,c.name+' '+JSON.stringify(c.data));
 for(const [name,view,throttle]of [['engine-detail','engine',0],['blue-flame','engine-side',1],['orange-flame','engine',1.1],['mach-cells','engine-side',1.1],['muzzle-flash','gun',0]]){
  await tab.page.evaluate(`(()=>{const a=window.__J16_PREVIEW__;a.setView('${view}');a.setState({throttle:${throttle}});a.systems.fireGun('${name}'==='muzzle-flash');a.systems.update(.05,a.state);a.render();})()`);await writeFile('work/j16/'+name+'.png',await tab.screenshot());
 }
 await tab.page.evaluate("(()=>{const a=window.__J16_PREVIEW__;a.systems.fireGun(false);a.setView('launch');a.systems.launch('LI');a.systems.update(.36,a.state);a.render();})()");await writeFile('work/j16/missile-separation.png',await tab.screenshot());
 const button=await tab.page.evaluate("(()=>{document.getElementById('controls').hidden=false;const r=document.getElementById('audio').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()");
 await tab.page.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...button});await tab.page.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...button});
 const ui=await tab.page.evaluate("(async()=>{const a=window.__J16_PREVIEW__;await a.audio._externalPromise;const audioState=a.audio.ctx?.state;document.getElementById('launchStation').value='LO';document.getElementById('launch').click();const launched=a.systems.shots.some(s=>s.stationId==='LO');document.getElementById('reset').click();return{audioState,samples:Object.keys(a.audio.samples).length,launched,reset:a.systems.shots.length===0};})()");
 assert.equal(ui.audioState,'running');assert.equal(ui.samples,9);assert.ok(ui.launched&&ui.reset);results.ui=ui;await writeFile('work/j16/systems-validation.json',JSON.stringify(results,null,2));
 assert.deepEqual(tab.page.problems,[]);console.log('PASS: J-16 engine/flame/launch/cannon/audio checks:',results.checks.length);await tab.close();
},{width:1440,height:960});
