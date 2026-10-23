import assert from 'node:assert/strict';
import { withBrowser } from './cdp.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await withBrowser(async api => {
  const view = await api.open('http://127.0.0.1:4173/tools/gear-preview.html?gear=1');
  try {
    await view.page.send('Page.bringToFront');
    await view.page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await view.page.send('Page.navigate', { url: 'http://127.0.0.1:4173/?autostart=instant&aircraft=f16cm-block52' });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      ready = await view.page.evaluate('window.__SKYFORGE__?.playerJet?.cadGearRigs?.length === 3');
      if (ready) break;
      await sleep(300);
    }
    assert.ok(ready, 'shipping game and CAD loaded');
    // Fixed simulation steps use the game's own systems and production sync;
    // pausing avoids dependence on the speed of software WebGL rendering.
    const result = await view.page.evaluate(`(() => {
      const game = window.__SKYFORGE__, player = game.player, jet = game.playerJet;
      game.pause();
      const sync = () => jet.sync(1/120, player.flight, player.systems, player.weapons, {cockpit:false});
      const poses = [];
      for (const target of [1, 0, 1, 0]) {
        player.systems.gearTarget = target;
        for (let frame = 0; frame < 510; frame++) {
          player._updateSystems(1/120);
          sync();
          if (frame % 12 === 0) poses.push({ gear:player.systems.gear,
            wheels:jet.cadGearRigs.map(r => ({visible:r.wheel.visible && r.group.visible,
              center:r.wheelCenter.toArray(), lift:r.lift})),
            doors:jet.cadGearDoors.map(d=>({angle:d.angle,visible:d.parts.every(p=>p.mesh.visible)})) });
        }
      }
      jet.setCockpitView(true);
      const cockpitHidden = jet.cadGearRigs.every(r=>!r.wheel.visible && !r.group.visible);
      jet.setCockpitView(false);
      sync();
      return {poses,cockpitHidden,restored:jet.cadGearRigs.every(r=>r.wheel.visible && r.group.visible)};
    })()`);
    assert.ok(result.cockpitHidden && result.restored, 'cockpit/exterior visibility round trip');
    for (const pose of result.poses) {
      assert.ok(pose.wheels.every(w => w.visible), 'wheels stay in the shipping scene');
      assert.ok(pose.doors.every(d => d.visible), 'doors stay in the shipping scene');
      if (pose.gear >= 0.2) assert.ok(pose.doors.every(d=>Math.abs(d.angle)<1e-10), 'doors open before wheels move');
      if (pose.gear <= 0.2) assert.ok(pose.wheels.every(w=>Math.abs(w.lift-1)<1e-10), 'wheels stowed before doors close');
    }
    const runtimeErrors = view.page.events.filter(e=>e.method === 'Runtime.exceptionThrown');
    assert.equal(runtimeErrors.length, 0, JSON.stringify(runtimeErrors));
    console.log(`PASS: real game, two full extension/retraction cycles, ${result.poses.length} sampled poses, correct visibility and sequencing, cockpit round trip`);
  } finally {
    await view.close();
  }
});
