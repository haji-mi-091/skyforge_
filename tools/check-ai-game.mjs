import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { withBrowser } from './cdp.mjs';

await withBrowser(async (api) => {
  const v = await api.open(
    'http://127.0.0.1:4173/tools/gear-preview.html?gear=1',
  );
  assert.ok(v.ready);
  await v.page.send('Page.navigate', {
    url: 'http://127.0.0.1:4173/?autostart=runway&aircraft=f16cm-block52',
  });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (
      await v.page.evaluate(
        "!!window.__SKYFORGE__?.playerJet?.cadIntake&&window.__SKYFORGE__.mode==='runway'",
      )
    ) {
      ready = true;
      break;
    }
    await sleep(300);
  }
  assert.ok(ready, 'runway game ready');
  const result = await v.page.evaluate(`(()=>{
    const g=window.__SKYFORGE__,p=g.player;g.pause();
    const before=g.enemies.length;g._updateMission(20);const waiting=g.enemies.length===before&&!g.hasTakenOff;
    p.onGround=false;g._updateMission(3);const first=g.enemies.slice();
    const waves=[],quadrants=[0,0,0,0];
    const capture=()=>{const poses=g.enemies.map(ac=>({x:ac.flight.position.x,y:ac.flight.position.y,z:ac.flight.position.z,heading:ac.flight.heading,health:ac.health}));waves.push(poses);for(const a of poses)quadrants[(a.x>=0?1:0)+(a.z>=0?2:0)]++;};
    capture();
    const clear=()=>{for(const rec of g.enemyRecords)g._releaseEnemyResources(rec);g.enemyRecords=[];g.enemies=[];};
    for(let i=0;i<19;i++){clear();g.wave++;g._spawnWave();capture();}
    p.onGround=true;
    g.state='playing';for(let i=0;i<120;i++)g._fixedUpdate(1/120);g.state='paused';
    const progress=g.enemies.map(a=>a.flight.time);
    for(let i=0;i<180*120;i++)for(const rec of g.enemyRecords){const input=rec.ai.update(1/120,p,g.world);rec.aircraft.update(1/120,input,g.world);}
    const survivors=g.enemies.map(a=>({alive:a.alive,health:a.health,agl:a.flight.position.y-g.world.groundHeight(a.flight.position.x,a.flight.position.z),time:a.flight.time}));
    g._syncVisuals(1/60,1);
    return{waiting,firstCount:first.length,waves,quadrants,progress,survivors,bounds:g.world.bounds};
  })()`);
  assert.ok(result.waiting, 'no wave during ground roll');
  assert.equal(result.firstCount, 5, 'takeoff arms first wave');
  assert.ok(
    result.quadrants.every((n) => n > 8),
    'shipping game spawns around all four sides',
  );
  assert.ok(
    result.waves
      .flat()
      .every(
        (p) =>
          Math.hypot(p.x, p.z) >= result.bounds - 5600 - 1e-6 &&
          Math.hypot(p.x, p.z) <= result.bounds - 3400 + 1e-6,
      ),
  );
  assert.ok(
    result.progress.every((t) => t >= 0.99),
    'shipping fixed update advances AI aircraft',
  );
  assert.ok(
    result.survivors.every((a) => a.alive && a.health > 95 && a.agl > 500),
    'five shipping AI survive a three-minute approach/chase',
  );
  assert.equal(
    v.page.events.filter((e) => e.method === 'Runtime.exceptionThrown').length,
    0,
    JSON.stringify(v.page.problems),
  );
  await writeFile('work/ai-game-check.json', JSON.stringify(result, null, 2));
  console.log(
    'PASS: shipping runway takeoff gate; 20 waves / 100 perimeter spawns across all four sides; fixed-step AI wiring; all five AI alive and undamaged after three simulated minutes; no runtime exceptions',
  );
  await v.close();
});
