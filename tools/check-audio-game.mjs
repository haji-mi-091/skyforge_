import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { withBrowser } from './cdp.mjs';

await withBrowser(async api => {
  const view = await api.open('http://127.0.0.1:4173/tools/audio-preview.html');
  assert.ok(view.ready);
  const mix = await view.page.evaluate(`(async()=>{
    const {AudioEngine}=await import('/src/core/Audio.js');
    const Original=window.AudioContext;
    const render=async(spool,ab)=>{
      const ctx=new OfflineAudioContext(2,48000,24000);
      window.AudioContext=function(){return ctx};
      const a=new AudioEngine();a.init();window.AudioContext=Original;
      await Promise.all([a._voicePackPromise,a._externalPromise,a._wtTonePromise]);
      a.update(.016,{spool,afterburner:ab,altitude:1000,tas:0});
      const output=await ctx.startRendering(),data=output.getChannelData(0);
      let energy=0,peak=0;for(const x of data){energy+=x*x;peak=Math.max(peak,Math.abs(x));}
      return{rms:Math.sqrt(energy/data.length),peak,roles:Object.keys(a.samples),
        procedural:a._nodes.engine.gain.gain.value,
        thrust:a._external.engineThrust.gain.gain.value,
        afterburner:a._external.engineAfterburner.gain.gain.value};
    };
    const idle=await render(.25,0),mil=await render(1,0),ab=await render(1,1);
    const a=window.__AUDIO_PREVIEW__.audio;a.init();
    await Promise.all([a._voicePackPromise,a._externalPromise,a._wtTonePromise]);
    const yuuka={pack:a.voicePack,status:a.voiceStatus,keys:Object.keys(a.voiceBuffers).length,
      enemyLock:a.voiceBuffers.rwr_lock===a.voiceBuffers['alram_radar_track_2.5s'],
      enemyMissile:a.voiceBuffers.rwr_missile===a.voiceBuffers['alram_radar_launch_1s'],
      separateOwnLock:a.voiceBuffers.rwr_lock!==a.voiceBuffers.vws_lock,
      separateOwnLaunch:a.voiceBuffers.rwr_missile!==a.voiceBuffers.vws_missile_launch};
    await a.setVoicePack('wt-zh');
    const official={pack:a.voicePack,status:a.voiceStatus,keys:Object.keys(a.voiceBuffers).length,
      alias:a.voiceBuffers.rwr_missile===a.voiceBuffers.vws_warning,
      enemyLock:a.voiceBuffers.rwr_lock===a.voiceBuffers.vws_attack_air};
    const switching=a.setVoicePack('yuuka');const back=a.setVoicePack('wt-zh');
    await Promise.all([switching,back]);
    const race=a.voicePack==='wt-zh'&&a.voiceBuffers.vws_missile===a.voiceBuffers.vws_warning;
    a.gunFiring(true);const first=a._external.gun;a.gunFiring(false);a.gunFiring(true);
    const gunRestart=a._external.gun!==first&&first.stopping;
    a.gunFiring(false);a.setMuted(true);
    return{idle,mil,ab,yuuka,official,race,gunRestart};
  })()`);
  assert.ok(mix.idle.rms > .002, 'local engine samples render audible PCM');
  assert.ok(mix.mil.rms > mix.idle.rms * 1.1, 'engine grows with spool');
  assert.ok(mix.ab.afterburner > mix.mil.afterburner, 'afterburner drives its own layer');
  assert.ok(mix.ab.peak <= 1 && Number.isFinite(mix.ab.rms));
  assert.ok(mix.mil.procedural < .00001, 'sampled engine replaces synthetic roar');
  assert.equal(mix.yuuka.keys, 68);
  assert.ok(mix.yuuka.enemyLock&&mix.yuuka.enemyMissile&&mix.yuuka.separateOwnLock&&mix.yuuka.separateOwnLaunch);
  assert.ok(mix.official.keys >= 36 && mix.official.alias && mix.official.enemyLock);
  assert.ok(mix.race && mix.gunRestart, 'pack switch race and short gun bursts');

  const electronics=await view.page.evaluate(`(async()=>{
    const {AudioEngine}=await import('/src/core/Audio.js');
    const fetchOriginal=window.fetch,Original=window.AudioContext;
    const ctx=new OfflineAudioContext(2,48000,24000);
    window.AudioContext=function(){return ctx};
    const a=new AudioEngine({voices:false});
    // A malformed required WAV must fail validation even if all other tones load.
    window.fetch=async(url,...args)=>String(url).endsWith('/wt-gui/radar_lock.wav')
      ?new Response(new Uint8Array([0,1,2,3])):fetchOriginal(url,...args);
    a.init();window.AudioContext=Original;
    let failure='';try{await a._wtTonePromise;}catch(error){failure=error.message;}
    const retryable=a._wtTonePromise===null&&!a._wtLoops;
    let oscillators=0,played=[];
    const osc=ctx.createOscillator.bind(ctx),source=ctx.createBufferSource.bind(ctx);
    ctx.createOscillator=()=>{oscillators++;return osc();};
    ctx.createBufferSource=()=>{const src=source(),start=src.start.bind(src);
      src.start=(...args)=>{played.push(Object.entries(a.wtToneBuffers).find(([,b])=>b===src.buffer)?.[0]||'other');start(...args);};return src;};
    a.update(.02,{spool:0,lockTone:true,lockProgress:.5,warning:true,rwrLocked:true});a.rwrNew();a.uiClick();
    const beforeRetry={oscillators,played:[...played]};
    window.fetch=fetchOriginal;await a._loadWtTones();await a._externalPromise;played=[];
    const scenarios=[
      {lockTone:true,lockProgress:.5},
      {lockTone:true,lockProgress:1,lockSeeker:'ir'},
      {lockTone:true,lockProgress:1,lockSeeker:'radar'},
      {rwrSearch:true},{rwrLocked:true},{rwrMissile:true},
      {warning:true,warningLevel:'caution'},{warning:true,warningLevel:'danger'},
    ];
    const events=[];
    for(const state of scenarios){played=[];a.update(2,{spool:0,...state});events.push([...played]);}
    played=[];a.rwrNew();a.uiClick();a.uiClick();const buttons=[...played];
    // Render actual sample output, with the engine and ambient channels muted.
    a.engineBus.gain.value=0;a._nodes.ambience.ambGain.gain.value=0;
    const output=await ctx.startRendering();let energy=0;for(const x of output.getChannelData(0))energy+=x*x;
    return{failure,retryable,beforeRetry,events,buttons,oscillators,rms:Math.sqrt(energy/output.length)};
  })()`);
  assert.match(electronics.failure,/radar_lock/);
  assert.ok(electronics.retryable,'failed electronic decode is retryable');
  assert.equal(electronics.beforeRetry.oscillators,0,'no synthetic electronic fallback while unavailable');
  assert.deepEqual(electronics.events,[['con_scan_track-001'],['con_scan_capture-001'],['radar_lock'],
    ['spin_scan_track-001'],['radar_lock'],['alarm_rocket-001'],['alarm_overload-001'],['alarm_rocket-001']]);
  assert.deepEqual(electronics.buttons,['alarm_wep','click','click']);
  assert.equal(electronics.oscillators,0,'electronic events never create a synthetic oscillator');
  assert.ok(electronics.rms>.00001,'official electronic samples render nonzero PCM');

  await view.page.send('Page.navigate', {url:'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52'});
  let ready=false;
  for(let i=0;i<180;i++){
    try{ready=await view.page.evaluate("!!window.__SKYFORGE__?.playerJet?.cadIntake&&window.__SKYFORGE__.ready");}catch{}
    if(ready)break;await sleep(250);
  }
  if(!ready) console.log('BOOT',await view.page.evaluate("({state:window.__SKYFORGE__?.state,ready:window.__SKYFORGE__?.ready,player:!!window.__SKYFORGE__?.player,loading:document.getElementById('loading-text')?.textContent})"),view.page.problems);
  assert.ok(ready,'shipping game starts with new audio/settings');
  const game=await view.page.evaluate(`(async()=>{
    const g=window.__SKYFORGE__;g.pause();if(g.enemies.length<2)g._spawnWave();
    const names=[...document.getElementById('setting-voice').options].map(o=>o.text);
    const setting=document.getElementById('setting-voice');setting.value='wt-zh';
    setting.dispatchEvent(new Event('change',{bubbles:true}));
    await g.audio._voicePackPromise;
    const saved=JSON.parse(localStorage.getItem('skyforge.settings.v1'));
    const p=g.player,t=g.enemies[0];p.onGround=false;
    const base=p.getMissileConfig();
    p.weapons.missileLoadout=[{...base,name:'AIM-120C-5',type:'aim120',remaining:1,count:1},
      {...base,name:'AIM-9M',type:'aim9m',remaining:1,count:1}];
    p.weapons.selectedMissile=0;p.weapons.missiles=2;p._syncMissileRemaining();
    g.combat.launchMissile(p,t);const m=g.combat.missiles.at(-1);
    const launchName=m.weaponName,selectedAfter=p.getMissileConfig().name;
    t.health=1;m.position.copy(t.flight.position);g.combat._detonateMissile(m);
    g._processEvents(t,t.takeEvents(),false);
    const missileFeed=g.killfeed.at(-1).segments.map(s=>s.text);
    const t2=g.enemies[0];t2.health=1;
    g.combat.fireGun(p,.6,true);
    const projectile=g.combat.projectiles.at(-1);
    t2.flight.position.copy(projectile.position).addScaledVector(projectile.velocity,.01);
    g.combat.updateProjectiles(.02);g._processEvents(t2,t2.takeEvents(),false);
    const cannonFeed=g.killfeed.at(-1).segments.map(s=>s.text);
    await g.audio.setVoicePack('yuuka');
    const scenarios=[];
    const warningScenario=(name,setup)=>{
      g.audio.resetVoice();g.audio.voiceHistory=[];g.cockpitWarnings.reset();
      p.health=100;p.flight.fuel=500;p.systems.gear=0;p.systems.flaps=0;
      p.weapons.ammo=50;p.weapons.flares=60;p.weapons.chaff=60;
      p.flight.position.y=g.world.groundHeight(p.flight.position.x,p.flight.position.z)+2000;
      p.flight.verticalSpeed=0;g.rwr={threats:[],missile:false,locked:false,tracked:false};
      setup();g._updateWarnings();
      const first=g.audio.voiceHistory.flatMap(c=>c.keys);
      const samples=g.audio.voiceHistory.flatMap(c=>c.samples);
      for(let i=0;i<20;i++)g._updateWarnings();
      scenarios.push({name,first,samples,repeated:g.audio.voiceHistory.length});
    };
    warningScenario('terrain',()=>{p.flight.position.y=g.world.groundHeight(p.flight.position.x,p.flight.position.z)+180;p.flight.verticalSpeed=-25;});
    warningScenario('fuel',()=>{p.flight.fuel=240;});
    warningScenario('radar',()=>{g.rwr={tracked:true,threats:[{mode:'search',bearing:1.5,range:6000,altDelta:0}]};});
    warningScenario('enemy-lock',()=>{g.rwr={locked:true,tracked:true,threats:[{mode:'lock',bearing:1.5,range:2000,altDelta:0}]};});
    warningScenario('missile',()=>{g.rwr={missile:true,locked:true,tracked:true,threats:[{missile:true,bearing:-1.5,range:800,altDelta:0}]};});
    g.audio.resetVoice();await g.audio.setVoicePack('wt-zh');
    g._updateHud(0);g.screens.showSettings();
    return{names,saved:saved.voicePack,active:g.audio.voicePack,voiceStatus:g.audio.voiceStatus,
      launchName,selectedAfter,missileFeed,cannonFeed,player:p.callsign,scenarios};
  })()`);
  assert.deepEqual(game.names,['优香','中文女声1']);
  assert.equal(game.saved,'wt-zh');assert.equal(game.active,'wt-zh');
  assert.equal(game.voiceStatus,'ready');
  assert.equal(game.launchName,'AIM-120C-5');assert.equal(game.selectedAfter,'AIM-9M');
  assert.equal(game.missileFeed[0],game.player);assert.equal(game.missileFeed[1].trim(),'AIM-120C-5');
  assert.match(game.cannonFeed[1],/M61/);
  for(const [name,key] of [['terrain','vws_pull_up'],['fuel','vws_fuel_low'],['radar','vws_attack_air'],['enemy-lock','rwr_lock'],['missile','rwr_missile']]){
    const scenario=game.scenarios.find(s=>s.name===name);
    assert.ok(scenario.first.includes(key),name+' triggers in the shipping game');
    assert.equal(scenario.repeated,1,name+' stays throttled across repeated frames');
  }
  assert.ok(game.scenarios.find(s=>s.name==='enemy-lock').samples.includes('alram_radar_track_2.5s'));
  assert.ok(game.scenarios.find(s=>s.name==='missile').samples.includes('alram_radar_launch_1s'));
  assert.ok(game.scenarios.every(s=>!s.first.includes('vws_lock')&&!s.first.includes('vws_missile_launch')),
    'enemy warnings cannot play our own target-lock or launch confirmations');
  await writeFile('work/audio-settings-check.png',await view.screenshot());
  assert.deepEqual(view.page.problems,[]);
  await view.page.send('Page.navigate',{url:'http://127.0.0.1:4173/'});
  let menu=false;
  for(let i=0;i<180;i++){
    try{menu=await view.page.evaluate("window.__SKYFORGE__?.ready&&window.__SKYFORGE__.state==='menu'");}catch{}
    if(menu)break;await sleep(250);
  }
  assert.ok(menu);
  const loading=await view.page.evaluate(`(async()=>{
    const g=window.__SKYFORGE__,original=window.fetch;
    const toasts=[],toast=g.screens.toast.bind(g.screens);
    g.screens.toast=(text,options)=>{toasts.push(text);toast(text,options);};
    window.fetch=async(url,...args)=>String(url).endsWith('/wt-gui/manifest.json')
      ?new Response('',{status:503}):original(url,...args);
    await g.start('test','f16cm-block52');
    const failed={state:g.state,player:!!g.player,retryable:g.audio._wtTonePromise===null,toasts:[...toasts]};
    let releaseTone,releaseVoice;
    const toneGate=new Promise(resolve=>releaseTone=resolve),voiceGate=new Promise(resolve=>releaseVoice=resolve);
    // Reload the selected voice to exercise both independent readiness gates.
    g.audio._voicePackPromise=null;g.audio.voiceBuffers={};
    window.fetch=async(url,...args)=>{
      const path=String(url);if(path.includes('/wt-gui/'))await toneGate;
      if(path.includes('/voice/')||path.includes('/voice-wt-zh/'))await voiceGate;
      return original(url,...args);
    };
    const start=g.start('test','f16cm-block52');await new Promise(resolve=>setTimeout(resolve,100));
    const pendingTone={state:g.state,player:!!g.player};
    releaseTone();await g.audio._wtTonePromise;
    const pendingVoice={state:g.state,player:!!g.player,voice:g.audio.voiceStatus};
    releaseVoice();await start;window.fetch=original;
    const firstReady={state:g.state,tones:g.audio._wtLoops?.ready,voice:g.audio.voiceStatus};
    g.pause();g.resume();const resumed=g.state;g.pause();
    const aircraft=[],toneBuffers=g.audio.wtToneBuffers;
    for(const id of ['j16','j10c','f16cm-block52','mig29']){
      await g.start('test',id);g.pause();
      const a=g.audio,buffer=a.wtToneBuffers.radar_lock;
      for(const pack of ['yuuka','wt-zh']){
        await a.setVoicePack(pack);a.resetVoice();a.voiceHistory=[];
        const sources=[],create=a.ctx.createBufferSource.bind(a.ctx);
        a.ctx.createBufferSource=()=>{const src=create(),start=src.start.bind(src);
          src.start=(...args)=>{sources.push(src.buffer);start(...args);};return src;};
        a.update(2,{spool:0,lockTone:true,lockProgress:1,lockSeeker:'radar',rwrMissile:true});
        a.playVoice('rwr_missile',{cooldown:0});
        a.ctx.createBufferSource=create;
        aircraft.push({id,pack,status:a.voiceStatus,manifest:a.sampleManifest,gunMode:a.gunMode,
          sameTones:a.wtToneBuffers===toneBuffers&&a.wtToneBuffers.radar_lock===buffer,
          radar:sources.includes(buffer),missile:sources.includes(a.wtToneBuffers['alarm_rocket-001']),
          voice:sources.includes(a.voiceBuffers.rwr_missile),
          samples:a.voiceHistory.flatMap(cue=>cue.samples)});
      }
    }
    // A partial voice decode failure must be visible and retryable as well.
    g.returnToMenu();g.audio._voicePackPromise=null;
    window.fetch=async(url,...args)=>String(url).endsWith('/voice-wt-zh/vws_warning.wav')
      ?new Response(new Uint8Array([0,1,2,3])):original(url,...args);
    g.settings.voicePack='wt-zh';await g.start('test','f16cm-block52');
    const failedVoice={state:g.state,status:g.audio.voiceStatus,retryable:g.audio._voicePackPromise===null,toasts:[...toasts]};
    window.fetch=original;await g.start('test','f16cm-block52');g.pause();
    return{failed,pendingTone,pendingVoice,firstReady,resumed,aircraft,failedVoice,
      voiceRetry:g.audio.voiceStatus};
  })()`);
  assert.equal(loading.failed.state,'menu');assert.equal(loading.failed.player,false);
  assert.ok(loading.failed.retryable&&loading.failed.toasts.some(text=>text.includes('电子音效清单加载失败')));
  assert.deepEqual(loading.pendingTone,{state:'menu',player:false});
  assert.deepEqual(loading.pendingVoice,{state:'menu',player:false,voice:'loading'});
  assert.deepEqual(loading.firstReady,{state:'playing',tones:true,voice:'ready'});
  assert.equal(loading.resumed,'playing');
  for(const result of loading.aircraft){
    assert.equal(result.status,'ready');
    assert.ok(result.sameTones&&result.radar&&result.missile&&result.voice,JSON.stringify(result));
    assert.ok(result.samples.includes(result.pack==='yuuka'?'alram_radar_launch_1s':'vws_warning'));
    const cn=result.id==='j16'||result.id==='j10c';
    assert.equal(result.manifest,cn?'audio/'+result.id+'/pack.json':'audio/pack.json');
    assert.equal(result.gunMode,cn?'shots':'loop');
  }
  assert.equal(loading.failedVoice.state,'menu');assert.equal(loading.failedVoice.status,'unavailable');
  assert.ok(loading.failedVoice.retryable&&loading.failedVoice.toasts.some(text=>text.includes('人声采样加载失败')));
  assert.equal(loading.voiceRetry,'ready');
  assert.deepEqual(view.page.problems,[]);
  await writeFile('work/audio-game-check.json',JSON.stringify({mix,game,electronics,loading},null,2));
  console.log(JSON.stringify({mix,game,electronics,loading},null,2));
});
