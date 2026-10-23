import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { withBrowser } from './cdp.mjs';

await withBrowser(async (api) => {
  const v = await api.open(
    'http://127.0.0.1:4173/tools/airframe-preview.html?loadout=cap',
  );
  assert.ok(v.ready, JSON.stringify(v.page.problems));
  await v.page.send('Page.navigate', {
    url: 'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52',
  });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (await v.page.evaluate('!!window.__SKYFORGE__?.playerJet?.cadCanopy')) {
      ready = true;
      break;
    }
    await sleep(300);
  }
  assert.ok(ready, 'shipping game CAD ready');
  const result = await v.page.evaluate(`(async()=>{
    const game=window.__SKYFORGE__,p=game.player,j=game.playerJet,c=game.combat;
    game.pause();game.cameraMode='chase';
    const T=await import('./vendor/three.module.js');
    const {whenVfxReady,vfxTexture}=await import('./src/visual/VfxAtlas.js');
    const {missileLoadoutFromPreset}=await import('./src/data/hangar.js');
    await whenVfxReady();
    const checks=[];function check(ok,name,data){checks.push({name,ok:!!ok,data});}
    p.onGround=false;p.flight.position.set(0,3000,0);p.flight.orientation.identity();p.flight.velocity.set(0,0,-250);p.systems.gear=0;p.systems.gearTarget=0;
    const sync=dt=>game._syncVisuals(dt,1),nozzle=j.cadAfterburner.nozzle.userData.nozzle;
    p.flight.engineSpool=.5;p.flight.afterburner=0;sync(2);const idle=nozzle.exitRadius;
    p.flight.engineSpool=1;sync(2);const mil=nozzle.exitRadius;
    check(!j.cadAfterburner.plume.visible,'no dry-power flame');
    p.flight.afterburner=1;sync(.02);const transition=nozzle.exitRadius;sync(2);const ab=nozzle.exitRadius;
    check(idle>mil&&ab>mil*1.35&&transition>mil&&transition<ab,'nozzle power schedule and rate limit',{idle,mil,transition,ab});
    check(j.cadAfterburner.plume.visible&&j.cadAfterburner.plume.userData.exhaust?.mesh.isMesh,'afterburner uses the attached F100 gas volume');
    game.engine.renderer.render(game.engine.scene,game.engine.camera);
    check(game.engine.renderer.info.programs.every(program=>program.diagnostics?.runnable!==false),'F100 volume shader compiles in the shipping game renderer');
    p.flight.afterburner=0;sync(.02);check(!j.cadAfterburner.plume.visible,'AB off removes flame immediately');
    p.systems.canopy=0;p.systems.canopyTarget=0;p.toggleCanopy();
    for(let i=0;i<25;i++){p._updateSystems(.1);sync(.1);}const half=j.cadCanopy.angle;
    for(let i=0;i<25;i++){p._updateSystems(.1);sync(.1);}const full=j.cadCanopy.angle;
    check(half>.3&&half<.6&&Math.abs(full-48*Math.PI/180)<1e-6,'five-second rear-hinged canopy',{half,full});
    p.toggleCanopy();for(let i=0;i<50;i++){p._updateSystems(.1);sync(.1);}
    check(j.cadCanopy.angle<1e-6,'canopy closes to original pose');
    game.cameraMode='cockpit';sync(.01);check(!j.cadGroup.visible,'cockpit hides external CAD systems');game.cameraMode='chase';sync(.01);
    check(j.cadGroup.visible&&j.cadCanopy.group.visible&&j.cadIntake.visible,'cockpit/external visibility restores new systems');
    const emissions={smoke:0,sparks:0,flashes:0};
    const originals={};for(const key of Object.keys(emissions)){originals[key]=game.effects[key].spawn;game.effects[key].spawn=()=>emissions[key]++;}
    c.fireGun(p,.01,true);sync(.01);check(!j.parts.muzzleFlash.visible,'M61 spin-up has no premature flash');
    for(let i=0;i<Math.ceil((p.config.armament.cannon.spinUpTime+.1)*120);i++){c.fireGun(p,1/120,true);sync(1/120);}
    check(p.gunFire&&j.parts.muzzleFlash.visible&&c.projectiles.length>0,'actual cannon rounds drive attached flash');
    check(j.parts.muzzle.distanceTo(new T.Vector3(...p.config.armament.cannon.muzzle))<1e-8,'visual and simulated muzzle agree');
    c.fireGun(p,.01,false);sync(.01);check(!j.parts.muzzleFlash.visible,'trigger release clears flash');
    c.reset();
    const loadout={lt:'aim120c',lo:'aim9x',li:'aim120c',tl:'fuel370',ctr:'fuel300',tr:'fuel370',ri:'aim120c',ro:'aim9m',rt:'aim120c',pr:'litening'};
    j.setVisualLoadout(loadout);p.config.armament.missileLoadout=missileLoadoutFromPreset({loadout},p.config);p._initMissileLoadout();sync(.01);
    const target={alive:true,team:'red',flight:{position:new T.Vector3(0,3000,-100000),velocity:new T.Vector3()}};
    const launches=[];let burnout=false,trailStopped=false;
    while(p.weapons.missiles>0){
      sync(.01);const cfg=p.getMissileConfig(),pose=j.getMissileLaunchPose(cfg.type,p.weapons.missileRemaining[cfg.type]-1);
      const expectedLocal=pose.position.clone().sub(p.flight.position).applyQuaternion(p.flight.orientation.clone().invert());
      check(expectedLocal.distanceTo(pose.localPosition)<1e-6,'rail local pose includes CAD root offset: '+cfg.type);
      if(launches.length===0)j.group.position.z+=4; // deliberately stale interpolated renderer
      if(!c.launchMissile(p,target))throw Error('launch rejected');
      const m=c.missiles[c.missiles.length-1],initialError=m.position.distanceTo(pose.position);let lateral=0,jump=0,last=m.position.clone(),oldOwner=p.flight.position.clone();
      for(let i=0;i<24;i++){
        const onRail=m.life+1/120<m.railTime&&m.railDistance<m.railLength;
        p.flight.position.addScaledVector(p.flight.velocity,1/120);c.updateMissiles(1/120);
        if(onRail){const local=m.position.clone().sub(p.flight.position).applyQuaternion(p.flight.orientation.clone().invert());lateral=Math.max(lateral,Math.hypot(local.x-pose.localPosition.x,local.y-pose.localPosition.y));}
        jump=Math.max(jump,m.position.clone().sub(last).sub(p.flight.position.clone().sub(oldOwner)).length());last.copy(m.position);oldOwner.copy(p.flight.position);
      }
      check(m.alive&&initialError<1e-6&&lateral<1e-6&&jump<1,'continuous mounted rail launch: '+cfg.type,{initialError,lateral,jump});
      check(m.rocketPlume.visible&&m.rocketPlume.position.z===(m.mesh.userData.length||3)*.5,'flame rooted at missile tail: '+cfg.type);
      check(m.trail.material.uniforms.uTrailMap.value===vfxTexture()&&m.trail.material.uniforms.uTextured.value===1,'continuous smoke texture ribbon: '+cfg.type);
      launches.push({type:cfg.type,store:m.mesh.userData.storeId,initialError,lateral,jump});
      if(launches.length===1){
        while(m.life<m.boostTime+m.sustainTime+.05){p.flight.position.addScaledVector(p.flight.velocity,1/120);c.updateMissiles(1/120);if(!m.alive)throw Error('test missile destroyed before burnout');}
        burnout=!m.rocketPlume.visible;const count=m.trail.points.length,arc=m.trail.travel;
        for(let i=0;i<15;i++){p.flight.position.addScaledVector(p.flight.velocity,1/120);c.updateMissiles(1/120);}
        trailStopped=m.trail.points.length===count&&m.trail.travel===arc;
      }
      c.reset();
      if(launches.length===1){p.flight.orientation.setFromEuler(new T.Euler(0,.25,.35));p.flight.velocity.set(0,0,-250).applyQuaternion(p.flight.orientation);}
    }
    check(burnout&&trailStopped,'motor burnout stops flame and new smoke');
    check(Object.values(emissions).every(n=>n===0),'gun and missile launches emit zero particles',emissions);
    check(launches.length===6,'all six mixed mounted missiles launch',launches);
    for(const key of Object.keys(originals))game.effects[key].spawn=originals[key];
    game.engine.renderer.render(game.engine.scene,game.engine.camera);
    return {checks,launches,emissions};
  })()`);
  await writeFile(
    'work/f16-systems-game-check.json',
    JSON.stringify(result, null, 2),
  );
  const failed = result.checks.filter((c) => !c.ok);
  assert.deepEqual(failed, [], JSON.stringify(failed, null, 2));
  const exceptions = v.page.events.filter(
    (e) => e.method === 'Runtime.exceptionThrown',
  );
  assert.equal(exceptions.length, 0, JSON.stringify(v.page.problems));
  const shaderErrors = v.page.problems.filter((p) =>
    /shader|VALIDATE_STATUS|WebGLProgram/i.test(p),
  );
  assert.equal(shaderErrors.length, 0, JSON.stringify(shaderErrors));
  console.log(
    'PASS: shipping Game nozzle schedule; five-second canopy cycle; M61 spin-up/release; six continuous mounted launches; burnout and smoke termination; zero gun/launch particle emissions; no runtime/shader errors',
  );
  await v.close();
});
