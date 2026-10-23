import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {withBrowser} from './cdp.mjs';
// Resource/interface smoke check only. Flight handling and combat acceptance
// are deliberately left to the user, as requested.
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?paint=white&hud=0&grid=0');assert.ok(tab.ready);
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/?autostart=test&aircraft=j16'});
 let ready=false;for(let i=0;i<160;i++){try{ready=await tab.page.evaluate("window.__SKYFORGE__?.state==='playing'&&!!window.__SKYFORGE__.playerJet?.airframe");}catch{}if(ready)break;await sleep(250);}
 assert.ok(ready,JSON.stringify(tab.page.problems));
 const result=await tab.page.evaluate(`(async()=>{
  const g=window.__SKYFORGE__,p=g.player,j=g.playerJet;g.pause();await j.ready;await g.audio._externalPromise;
  const T=await import('/vendor/three.module.js'),target={alive:true,team:'red',radarEmitting:true,flight:{position:p.flight.position.clone().addScaledVector(p.flight.basis.forward,3000),velocity:new T.Vector3()},takeDamage(){}};
  const checks=[],check=(ok,name,data)=>checks.push({ok:!!ok,name,data});
  check(p.config.id==='j16'&&j.airframe.children.length>0,'shipping game uses J-16 airframe');check(g.audio.sampleManifest==='audio/j16/pack.json'&&g.audio.samples.gunFirst,'J-16 sampled audio selected');
  check(p.config.visual.paint==='service'&&j.airframe.userData.paintMode==='weathered'&&j.airframe.getObjectByName('flaperon_skin_L').material.userData.j16Skin,'shipping game defaults to weathered service livery');
  const before=p.weapons.missiles,selected=p.getMissileConfig(),mass=p.flight.storesMass;check(g.combat.launchMissile(p,target),'combat launch API accepts mounted PL-15');const missile=g.combat.missiles.at(-1);
  check(p.weapons.missiles===before-1&&p.flight.storesMass<mass,'real ammunition and payload mass decrease');check(missile.weaponType==='pl15'&&missile.guidance==='activeRadar'&&missile.maxG===45&&missile.maxRange===181250&&missile.seekerRange===25000&&missile.mass===210,'combat uses conservative PL-15 estimates');
  check(missile.mesh.name==='pl15'&&j.stores.some(s=>s.group===missile.mesh&&s.released),'exact mounted mesh transfers to combat');
  g.combat.updateMissiles(.01);check(Number.isFinite(missile.position.x)&&missile.life>.0,'release updater accepts actual aircraft state');
  j.sync(0,p.flight,p.systems,p.weapons,{showcase:false,cockpit:false});check(missile.mesh.visible,'visual sync keeps released missile visible');
  check(g.combat.launchMissile(p,target)&&missile.station==='LO'&&g.combat.missiles.at(-1).station==='RO','J-16 alternates actual left and right missile stations');
  p.weapons.selectedMissile=p.weapons.missileLoadout.findIndex(w=>w.type==='pl10');p.missileCooldown=0;check(g.combat.launchMissile(p,target),'combat launches a mounted PL-10');const ir=g.combat.missiles.at(-1);
  check(ir.weaponType==='pl10'&&ir.maxRange===25000&&ir.maxG===60&&ir.mass===105&&ir.flareSusceptibility===.10,'combat uses conservative PL-10 estimates');
  g.screens.selectAircraft('j16');check(g.screens.getLoadout()?.LT==='pl10'&&document.querySelectorAll('[data-slot]').length===10,'hangar exposes ten J-16 stations');
  check(document.querySelector('[data-aircraft="j16"]')&&document.querySelector('[data-store="pl15"]'),'aircraft and Chinese weapon controls exist');
  const {Aircraft}=await import('/src/sim/Aircraft.js'),{missileLoadoutFromPreset}=await import('/src/data/hangar.js'),cfg=structuredClone(p.config),loadout={LI:'bomb250x2',RI:'type90'};
  cfg.armament.missileLoadout=missileLoadoutFromPreset({loadout},cfg);const carrier=new Aircraft(cfg);carrier.flight.position.copy(p.flight.position);carrier.flight.orientation.copy(p.flight.orientation);carrier.flight.velocity.copy(p.flight.velocity);carrier.visual=j;j.setVisualLoadout(loadout);
  const ground={alive:true,isGroundTarget:true,flight:{position:p.flight.position.clone().add(new T.Vector3(0,-1000,-2000)),velocity:new T.Vector3()},takeDamage(){}};
  carrier.weapons.selectedMissile=carrier.weapons.missileLoadout.findIndex(w=>w.type==='bomb250x2');const bundleMass=carrier.flight.storesMass;
  check(g.combat.launchMissile(carrier,ground),'twin rack first bomb releases');carrier.missileCooldown=0;check(g.combat.launchMissile(carrier,ground),'twin rack second bomb releases');
  check(j.stores.filter(s=>s.type==='bomb250x2'&&s.released).length===2&&Math.abs(bundleMass-carrier.flight.storesMass-433)<.001,'each bomb uses its own mesh, round and projectile mass');
  carrier.missileCooldown=0;check(g.combat.launchMissile(carrier,ground),'rocket pod releases one rocket');const rocket=g.combat.missiles.at(-1);
  check(rocket.weaponType==='type90'&&rocket.releaseMode==='rail'&&carrier.weapons.missileRemaining.type90===31&&j.stores.some(s=>s.type==='type90'&&!s.released&&s.group.parent),'rocket launches along rail while pod remains mounted');
  check(!g.engine.renderer.info.programs.some(p=>p.diagnostics?.runnable===false),'shipping shaders compile');
  await g.audio.setSampleProfile('audio/pack.json','loop');check(g.audio.gunMode==='loop'&&!!g.audio.samples.gun&&!g.audio.samples.gunFirst,'switching back restores F-16 loop audio');
  await g.audio.setSampleProfile('audio/j16/pack.json','shots');check(g.audio.gunMode==='shots'&&!!g.audio.samples.gunFirst,'switching again restores J-16 shot audio');
  return{checks,aircraft:p.config.id,model:j.airframe.name,audio:Object.keys(g.audio.samples),finalTesting:'user'};
 })()`);
 await writeFile('work/j16/integration/smoke-check.json',JSON.stringify(result,null,2));for(const c of result.checks)assert.ok(c.ok,c.name+' '+JSON.stringify(c.data));
 assert.deepEqual(tab.page.problems,[]);console.log('PASS: J-16 shipping registration/resource/weapon/UI smoke checks; user flight and combat testing remains pending.');await tab.close();
});
