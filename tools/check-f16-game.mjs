import assert from 'node:assert/strict';
import { withBrowser } from './cdp.mjs';
import { writeFile } from 'node:fs/promises';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await withBrowser(async (api) => {
  const v = await api.open(
    'http://127.0.0.1:4173/tools/airframe-preview.html?loadout=cap',
  );
  await v.page.send('Page.navigate', {
    url: 'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52',
  });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (await v.page.evaluate('!!window.__SKYFORGE__?.playerJet?.cadCockpit')) {
      ready = true;
      break;
    }
    await sleep(300);
  }
  assert.ok(ready,JSON.stringify({errors:v.page.problems,state:await v.page.evaluate(`({aircraft:window.__SKYFORGE__?.player?.config?.id,cadLoading:window.__SKYFORGE__?.playerJet?.cadLoading,hasCad:!!window.__SKYFORGE__?.playerJet?.cadGroup})`)}));
  const result = await v.page.evaluate(`(async()=>{
  const game=window.__SKYFORGE__,p=game.player,j=game.playerJet;game.pause();
  const {missileLoadoutFromPreset}=await import('./src/data/hangar.js');
  const loadout={lt:'aim120c',lo:'aim9x',li:'aim120c',tl:'fuel370',ctr:'fuel300',tr:'fuel370',ri:'aim120c',ro:'aim9m',rt:'aim120c',pr:'litening'};
  j.setVisualLoadout(loadout);p.config.armament.missileLoadout=missileLoadoutFromPreset({loadout},p.config);p._initMissileLoadout();
  p.onGround=true;p.systems.gear=1;p.flight.velocity.set(0,0,-18);p.flight.orientation.identity();
  game._syncVisuals(.1,1);const angles=j.cadGearRigs.map(r=>r.wheelAngle),ground=j._groundContact;
  p.onGround=false;p.systems.gear=0;p.flight.aoaDeg=20;p.flight.air.alpha=20*Math.PI/180;p.flight.control.surfaces.aileron=.4;game._syncVisuals(1,1);
  const targets=j.cadSurfaceParts.map(s=>({kind:s.kind,target:s.target,angle:s.angle}));
  const target=game.enemyRecords[0]?.aircraft || {alive:true,team:'red',flight:{position:p.flight.position.clone().addScaledVector(p.flight.basis.forward,5000)}};
  const launched=[];
  while(p.weapons.missiles>0){const type=p.getMissileConfig().type,remaining=p.weapons.missileRemaining[type],pose=j.getMissileLaunchPose(type,remaining-1);const before=game.combat.missiles.length;const ok=game.combat.launchMissile(p,target);if(!ok)break;const missile=game.combat.missiles[before];launched.push({type,visual:missile.mesh.userData.storeId,expected:pose.storeId,error:missile.position.distanceTo(pose.position)});}
  j.sync(1/60,p.flight,p.systems,p.weapons,{cockpit:false,onGround:false});
  const remaining=j.cadMountedStores.map(s=>({id:s.storeId,type:s.type,category:s.category,released:!!s.released,mounted:s.group.parent===j.group,visible:s.group.visible}));
  j.setCockpitView(true);const hidden=j.cadPylons.every(s=>!s.visible);j.setCockpitView(false);game._syncVisuals(1/60,1);
  // New optional chin station and tank survive serialization/migration.
  return {ground,angles,targets,launched,remaining,hidden,adapters:j.cadPylons.length,errors:[]};
 })()`);
  assert.ok(
    result.ground && result.angles.every((a) => Math.abs(a) > 0.001),
    'real Game sync ground state drives wheels',
  );
  assert.equal(result.launched.length, 6);
  assert.ok(
    result.launched.every((l) => l.error < 1e-6 && l.visual === l.expected),
    'same visual and exact mounted launch position',
  );
  assert.ok(result.remaining.filter((s) => s.category==='missile').every((s) => s.released&&!s.mounted));
  assert.ok(result.remaining.filter((s) => s.category!=='missile').every((s) => s.visible&&s.mounted));
  assert.ok(result.hidden);
  assert.ok(
    result.targets
      .filter((s) => s.kind === 'leading')
      .every((s) => Math.abs(s.target) > 0.2),
  );
  console.log(
    JSON.stringify(
      v.page.events.filter(
        (e) =>
          e.method === 'Log.entryAdded' && e.params.entry.level === 'error',
      ),
      null,
      2,
    ),
  );
  assert.equal(
    v.page.events.filter((e) => e.method === 'Runtime.exceptionThrown').length,
    0,
    JSON.stringify(v.page.problems),
  );
  await writeFile('work/f16-game-check.json', JSON.stringify(result, null, 2));
  console.log(
    'PASS: shipping Game ground-wheel pipeline; automatic/differential flaps; six launches from actual mounted positions, including AIM-9X vs AIM-9M; non-missile stores retained; cockpit adapters; no runtime errors',
  );
  await v.close();
});
