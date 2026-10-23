import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {withBrowser} from './cdp.mjs';
// Shipping-game smoke check for the J-10C: registration, resources, paint
// switch, stores and hangar UI. Flight handling and combat acceptance are the
// user's own test, as requested.
await mkdir('work/j10c/integration',{recursive:true});
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j10c-preview.html?hud=0&grid=0');assert.ok(tab.ready);
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/?autostart=test&aircraft=j10c'});
 let ready=false;for(let i=0;i<200;i++){try{ready=await tab.page.evaluate("window.__SKYFORGE__?.state==='playing'&&!!window.__SKYFORGE__.playerJet?.airframe");}catch{}if(ready)break;await sleep(250);}
 assert.ok(ready,JSON.stringify(tab.page.problems));
 await sleep(1500);await writeFile('work/j10c/integration/game-flight.png',await tab.screenshot());
 const result=await tab.page.evaluate(`(async()=>{
  const g=window.__SKYFORGE__,p=g.player,j=g.playerJet;g.pause();await j.ready;await g.audio._externalPromise;
  const T=await import('/vendor/three.module.js'),checks=[],check=(ok,name,data)=>checks.push({ok:!!ok,name,data});
  const painted=()=>{let n=0;j.airframe.traverse(o=>{if(o.isMesh&&o.material?.name==='J10C Ba Yi livery')n++;});return n;};
  check(p.config.id==='j10c'&&j.airframe.children.length>0&&j.constructor.name==='J10CJet','game flies the J-10C airframe',j.constructor.name);
  check(g.audio.sampleManifest==='audio/j10c/pack.json'&&g.audio.samples.gunFirst&&g.audio.samples.engineAfterburner,'J-10C War Thunder sound set loaded',Object.keys(g.audio.samples));
  check(j.paint==='bayi'&&painted()>40,'default exterior is the Ba Yi livery',painted());
  j.setPaint('service');check(j.paint==='service'&&painted()===0,'switches to the service exterior');j.setPaint('bayi');check(painted()>40,'switches back to Ba Yi');
  check(p.contactHeight===2.30&&p.config.systems.mainGearZ===1.6,'ground contact and rotation pivot');
  check(Math.abs(p.config.armament.cannon.muzzle[2]+3.32)<.05,'cannon fires from the model gun port',p.config.armament.cannon.muzzle);
  const target={alive:true,team:'red',radarEmitting:true,flight:{position:p.flight.position.clone().addScaledVector(p.flight.basis.forward,3000),velocity:new T.Vector3()},takeDamage(){}};
  const before=p.weapons.missiles,mass=p.flight.storesMass;check(g.combat.launchMissile(p,target),'combat launches a mounted PL-15');const m1=g.combat.missiles.at(-1);
  check(p.weapons.missiles===before-1&&p.flight.storesMass<mass&&m1.weaponType==='pl15','ammunition and payload mass decrease',{type:m1.weaponType});
  check(m1.maxRange===181250&&m1.maxG===45&&m1.seekerRange===25000&&m1.mass===210,'J-10C combat uses the same conservative PL-15 estimates');
  check(j.stores.some(s=>s.group===m1.mesh&&s.released),'exact mounted mesh leaves the pylon');
  p.missileCooldown=0;check(g.combat.launchMissile(p,target)&&m1.station==='LO'&&g.combat.missiles.at(-1).station==='RO','alternates left and right stations',[m1.station,g.combat.missiles.at(-1).station]);
  p.weapons.selectedMissile=p.weapons.missileLoadout.findIndex(w=>w.type==='pl10');p.missileCooldown=0;check(g.combat.launchMissile(p,target),'combat launches a mounted PL-10');const ir=g.combat.missiles.at(-1);
  check(ir.weaponType==='pl10'&&ir.maxRange===25000&&ir.maxG===60&&ir.mass===105&&ir.flareSusceptibility===.10,'J-10C combat uses the same conservative PL-10 estimates');
  j.sync(0,p.flight,p.systems,p.weapons,{cockpit:false,gunFiring:true});check(j.airframe.userData.j10cEffects.flash.parent,'muzzle flash rig present');
  check(!g.engine.renderer.info.programs.some(q=>q.diagnostics?.runnable===false),'shaders compile');
  return{checks,stores:j.stores.map(s=>s.station+':'+s.type)};
 })()`);
 // Hangar: aircraft button, eleven hardpoints, J-16 weapon catalogue, paint selector.
 await tab.page.evaluate(`window.__SKYFORGE__.returnToMenu()`);await sleep(800);
 const hangar=await tab.page.evaluate(`(async()=>{
  const g=window.__SKYFORGE__,s=g.screens,checks=[],check=(ok,name,data)=>checks.push({ok:!!ok,name,data});
  s.showHangar();s.selectAircraft('j10c');
  check(document.querySelector('[data-aircraft="j10c"]').classList.contains('selected'),'J-10C selectable in the hangar');
  check(document.querySelectorAll('[data-slot]').length===11,'eleven hardpoints');
  check(document.querySelector('[data-store="pl15"]')&&document.querySelector('[data-store="yingsiii"]')&&!document.querySelector('[data-store="kh29te"]'),'J-16 weapons the J-10C can carry');
  const row=document.getElementById('hangar-paint-row'),sel=document.getElementById('hangar-paint');
  check(!row.classList.contains('hidden')&&[...sel.options].map(o=>o.textContent).join()==='基础外观,八一涂装','paint selector shown for the J-10C');
  await new Promise(r=>setTimeout(r,1500));await g.showcase?.ready;
  sel.value='service';sel.dispatchEvent(new Event('change'));check(g.showcase?.paint==='service'&&s.getPaint()==='service','hangar paint switch reaches the showcase');
  sel.value='bayi';sel.dispatchEvent(new Event('change'));check(g.showcase?.paint==='bayi','and back to Ba Yi');
  s.selectAircraft('j16');check([...sel.options].map(o=>o.textContent).join()==='基础外观'&&document.querySelectorAll('[data-slot]').length===10,'J-16 hangar: own livery list, ten stations');
  s.selectAircraft('j10c');return {checks};
 })()`);
 await sleep(1500);await writeFile('work/j10c/integration/hangar.png',await tab.screenshot());
 const all=[...result.checks,...hangar.checks];await writeFile('work/j10c/integration/smoke-check.json',JSON.stringify({checks:all,stores:result.stores,problems:tab.page.problems,finalTesting:'user'},null,2));
 for(const c of all)assert.ok(c.ok,c.name+' '+JSON.stringify(c.data));
 assert.deepEqual(tab.page.problems,[]);
 console.log('PASS: J-10C shipping registration / sound / paint / stores / hangar smoke checks; flight and combat testing is left to the user.');await tab.close();
},{width:1440,height:900});
