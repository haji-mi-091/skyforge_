import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {withBrowser} from './cdp.mjs';
await mkdir('work/gameplay-fixes',{recursive:true});
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/bomb-preview.html');assert.ok(tab.ready,JSON.stringify(tab.page.problems));
 const fx=await tab.page.evaluate(`(()=>{const a=window.__BOMB_PREVIEW__,checks=[],check=(ok,name)=>checks.push({ok:!!ok,name});a.paused=true;
  const capture=t=>{a.setTime(t);a.renderer.render(a.scene,a.camera);const gl=a.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const early=capture(.12),late=capture(2);let changed=0,fire=0;for(let i=0;i<early.length;i+=4){if(Math.abs(early[i]-late[i])+Math.abs(early[i+1]-late[i+1])+Math.abs(early[i+2]-late[i+2])>20)changed++;if(early[i]>early[i+2]+45&&early[i]>early[i+1]+15)fire++;}
  check(changed>500&&fire>100,'fireball and evolving smoke render');check(!a.renderer.info.programs.some(p=>p.diagnostics?.runnable===false),'bomb shaders compile');
  let particles=0;a.scene.traverse(o=>{if(o.isSprite||o.isPoints)particles++;});check(particles===0,'bombs use fixed sheets without particle emitters');
  const small=a.effect.scale;document.getElementById('mass').value='1000';a.trigger();check(a.effect.scale>small,'larger bomb increases effect scale');document.getElementById('surface').value='water';a.trigger();a.setTime(.2);check(!a.effect.fire.visible&&!a.effect.scorch.visible,'water suppresses land fire/scorch');
  document.getElementById('surface').value='air';a.trigger();a.setTime(.4);check(!a.effect.ring.visible&&!a.effect.dust.visible,'airburst suppresses ground layers');
  document.getElementById('surface').value='ground';a.trigger();for(let i=0;i<12;i++)a.bombs.spawn(a.effect.group.position,{mass:250});check(a.bombs.active.length===8,'simultaneous effects capped');a.bombs.update(10.1,a.camera);check(a.bombs.active.length===0,'expired effects retire');a.trigger();a.bombs.clear();check(a.bombs.active.length===0,'effect reset releases meshes');a.trigger();a.setTime(.25);return checks;
 })()`);
 await writeFile('work/gameplay-fixes/bomb-fireball.png',await tab.screenshot());
 await tab.page.evaluate('window.__BOMB_PREVIEW__.setTime(2.5)');await writeFile('work/gameplay-fixes/bomb-smoke.png',await tab.screenshot());
 for(const c of fx)assert.ok(c.ok,c.name);
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/?autostart=test&aircraft=f16cm-block52'});
 let ready=false;for(let i=0;i<160;i++){try{ready=await tab.page.evaluate("window.__SKYFORGE__?.state==='playing'&&!!window.__SKYFORGE__.playerJet?.cadCockpit");}catch{}if(ready)break;await sleep(200);}assert.ok(ready,JSON.stringify(tab.page.problems));
 const runtime=await tab.page.evaluate(`(async()=>{
  const g=window.__SKYFORGE__;g.pause();const T=await import('/vendor/three.module.js'),{missileLoadoutFromPreset}=await import('/src/data/hangar.js'),checks=[],check=(ok,name)=>checks.push({ok:!!ok,name});
  const p=g.player,j=g.playerJet,loadout={lt:'aim9m',lo:'aim120c',li:'mk82',tl:'fuel370',ctr:'fuel300',tr:'fuel370',ri:'mk82',ro:'aim120c',rt:'aim9m'};
  j.setVisualLoadout(loadout);p.config.armament.missileLoadout=missileLoadoutFromPreset({loadout},p.config);p.flight.storesMass=p.config.mass.stores;p._refreshMass();p._initMissileLoadout();
  const press=key=>{g.input.pressed.add(key);g._frameInput(0);g.input.pressed.clear();};
  const target={alive:true,team:'red',flight:{position:p.flight.position.clone().addScaledVector(p.flight.basis.forward,2000),velocity:new T.Vector3()},config:{shortName:'TEST'},takeDamage(){}};
  p.weapons.selectedMissile=p.weapons.missileLoadout.findIndex(w=>w.type==='aim120c');g.lockCandidate=target;g.lockProgress=1;press('Space');press('Space');
  const aam=g.combat.missiles.filter(m=>m.weaponType==='aim120c');check(aam.length===2&&aam[0].station==='lo'&&aam[1].station==='ro','Space releases F-16 missiles left then right');
  j.sync(0,p.flight,p.systems,p.weapons,{cockpit:false});check(aam.every(m=>m.mesh.visible&&m.mesh.parent===g.engine.scene),'released meshes survive visual sync');
  const mass=p.flight.mass;press('KeyO');check(Math.abs(mass-p.flight.mass-3250)<.001&&g.combat.jettisonedStores.length===3,'O drops all three tanks and subtracts their mass');const after=p.flight.mass;press('KeyO');check(after===p.flight.mass&&g.combat.jettisonedStores.length===3,'second O does not repeat jettison');
  p.weapons.selectedMissile=p.weapons.missileLoadout.findIndex(w=>w.type==='mk82');g.viewPitch=-.65;g.viewYaw=0;press('Space');press('Space');const bombs=g.combat.missiles.filter(m=>m.weaponType==='mk82');check(bombs.length===2&&bombs[0].station==='li'&&bombs[1].station==='ri'&&bombs.every(m=>m.ballistic),'Space drops ordinary bombs from both F-16 wing mounts');
  const oldParticles=g.effects.smoke.items.filter(i=>i.active).length;const bomb=bombs[0];bomb.position.y=g.world.groundHeight(bomb.position.x,bomb.position.z);g.combat._detonateMissile(bomb);check(g.effects.bombs.active.length===1&&g.effects.smoke.items.filter(i=>i.active).length===oldParticles,'real bomb detonation calls shared fixed-sheet effect');
  g.combat.reset();check(g.combat.jettisonedStores.length===0,'combat reset cleans detached tanks');
  return checks;
 })()`);
 for(const c of runtime)assert.ok(c.ok,c.name);assert.deepEqual(tab.page.problems,[]);
 await writeFile('work/gameplay-fixes/checks.json',JSON.stringify({fx,runtime},null,2));console.log('PASS: bomb visual rendering/lifecycle and real F-16 controls, alternating mounts, tank jettison, ordinary/guided bomb release and shared impact effects.');await tab.close();
});
