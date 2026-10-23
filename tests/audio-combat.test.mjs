import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import { Aircraft } from '../src/sim/Aircraft.js';
import { CombatSystem } from '../src/sim/CombatSystem.js';
import { F16CM_BLOCK52, MIG29 } from '../src/data/aircraft.js';
import { killFeedEntry } from '../src/ui/killFeed.js';
import { CockpitWarnings } from '../src/core/CockpitWarnings.js';
import { AudioEngine } from '../src/core/Audio.js';
import { VOICE_PACKS } from '../src/data/voicePacks.js';

const player = new Aircraft(structuredClone(F16CM_BLOCK52),
  { isPlayer: true, callsign: '测试玩家' });
const target = new Aircraft(MIG29, { team: 'red', callsign: '敌机' });
player.flight.position.set(0, 1000, 0);
const combat = Object.assign(Object.create(CombatSystem.prototype), {
  projectiles: [], world: { groundHeight: () => 0 },
  effects: { impact() {}, explosion() {} }, audio: { explosion() {} },
  getAircraft: () => [player, target], getPlayer: () => player,
  tracers: { setMatrixAt() {}, instanceMatrix: {} }, retiredTrails: [],
});
combat.fireGun(player, 0.6, true);
assert.ok(combat.projectiles.length);
const shot = combat.projectiles[0], gunName = shot.weaponName;
player.config.armament.cannon.name = '后来更换的机炮';
target.flight.position.copy(shot.position).addScaledVector(shot.velocity, .01);
target.health = 1;
combat.updateProjectiles(.02);
const gunKill = target.takeEvents().find(e => e.type === 'destroyed');
assert.equal(gunKill.weaponName, gunName, 'cannon name survives impact and weapon changes');
assert.deepEqual(killFeedEntry(target, gunKill, player, 1).segments.map(s => s.text),
  ['测试玩家', `   ${gunName}   `, '敌机']);

const missileVictim = new Aircraft(MIG29, { team: 'red', callsign: '敌机2' });
missileVictim.health = 1;
const missile = { alive: true, target: missileVictim, owner: player,
  weaponName: 'AIM-120C-5', damage: 200, position: missileVictim.flight.position.clone(),
  velocity: new T.Vector3(), trail: {} };
combat._removeMissileMesh = () => {};
combat._detonateMissile(missile);
const missileKill = missileVictim.takeEvents().find(e => e.type === 'destroyed');
assert.equal(missileKill.weaponName, 'AIM-120C-5');
assert.equal(killFeedEntry(missileVictim, missileKill, player, 2).segments[1].text.trim(), 'AIM-120C-5');
assert.equal(killFeedEntry(player, { attacker: target, source: 'missile', weaponName: 'R-27R' }, player, 2)
  .segments.map(s => s.text).join(''), '敌机   R-27R   测试玩家');
assert.equal(killFeedEntry(target, { type: 'crashed' }, player, 2).segments[1].text, ' 已损失');
assert.equal(killFeedEntry(target, { attacker: player, source: 'missile' }, player, 2)
  .segments[1].text.trim(), '导弹', 'legacy missile events never invent AIM-9L');

const played = [];
let loaded = false;
const warnings = new CockpitWarnings({
  playSequence(keys, options) { if (!loaded) return false; played.push({ keys, ...options }); return true; },
  callout(key) { played.push({ keys: [key] }); },
});
const p = { alive: true, onGround: false, health: 100, gLoad: 1,
  flight: { fuel: 240, verticalSpeed: 0, engineSpool: .9 },
  systems: { gear: 0, airbrake: 0 }, weapons: { ammo: 50, flares: 60, chaff: 60 } };
const update = (time, extra = {}) => warnings.update({ player: p, time, agl: 1000, ...extra });
update(0); loaded = true; update(.1);
assert.equal(played[0].keys[0], 'vws_fuel_low', 'loading does not swallow first fuel warning');
for (let i = 0; i < 100; i++) update(.2 + i * .01);
assert.equal(played.length, 1, 'persistent condition does not spam');
p.flight.fuel = 500; update(2); p.flight.fuel = 240; update(6);
assert.equal(played.length, 2, 'cleared and re-entered condition rearms');
update(6.1, { rwr: { locked: true, tracked: true,
  threats: [{ mode: 'lock', bearing: 1.5, range: 1500, altDelta: 0 }] } });
assert.deepEqual(played.at(-1).keys, ['rwr_lock', 'vws_right'],
  'being locked uses an enemy-threat event, not our own lock confirmation');
const duringMissile = played.length;
update(7, { warnings: [{ text: 'PULL UP' }], rwr: { missile: true, locked: true, tracked: true,
  threats: [{ missile: true, bearing: -1.5, range: 800, altDelta: 250 }] } });
assert.ok(played.some(c => c.keys.join('|') === 'rwr_missile|vws_left|vws_high'));
assert.ok(!played.slice(duringMissile).some(c => ['rwr_lock', 'vws_attack_air', 'vws_lock'].includes(c.keys[0])),
  'incoming missiles suppress lower-priority radar speech and never say own-lock');
assert.ok(played.some(c => c.keys[0] === 'vws_pull_up' && c.priority === 100));
p.weapons.flares = 5; p.weapons.ammo = 0; p.health = 40;
p.systems.gear = 1; p.systems.airbrake = .3; p.flight.fuel = 50; update(8);
for (const key of ['vws_chaff_flare_low', 'vws_chaff_flare', 'vws_check_mech',
  'gunner_out_of_ammo', 'vws_gear_down', 'vws_airbrake', 'vws_bingo']) {
  assert.ok(played.some(c => c.keys.includes(key)), key);
}
p.onGround = true; p.gLoad = 9; update(9, { warnings: [{ text: 'STALL' }] });
assert.ok(!played.some(c => c.keys[0] === 'vws_over_g' || c.keys[0] === 'vws_critical_angle'));

const engine = new AudioEngine(), sources = [];
engine.ctx = { currentTime: 0,
  createGain: () => ({ gain: {}, connect(target) { return target; } }),
  createBufferSource: () => {
    const src = { connect(target) { return target; }, start() {},
      stop() { this.stopped = true; }, disconnect() {} };
    sources.push(src); return src;
  },
};
engine.alertBus = {};
for (const key of ['vws_fuel_low', 'vws_left', 'rwr_missile', 'rwr_lock', 'vws_pull_up', 'vws_warning']) {
  engine.voiceBuffers[key] = { duration: 1 };
}
assert.ok(engine.playSequence(['vws_fuel_low', 'vws_left'], { priority: 10 }));
assert.ok(!engine.playSequence(['vws_fuel_low', 'vws_left'], { priority: 10 }), 'deduplicate same cue');
engine.callout('rwr_missile', '');
assert.ok(sources.slice(0, 2).every(src => src.stopped), 'preemption cancels all scheduled phrase parts');
engine.callout('vws_warning', '', { priority: 5 });
assert.equal(engine._voiceQueue.length, 1);
engine.callout('vws_pull_up', '', { priority: 100 });
assert.equal(engine._voiceQueue.length, 0, 'urgent terrain warning removes stale queued speech');
engine.setMuted(true);
assert.equal(engine._voiceCurrent, null);
assert.ok(sources.every(src => src.stopped), 'mute stops active and future speech');

for (const pack of Object.values(VOICE_PACKS)) {
  const keys = JSON.parse(await readFile(`${pack.path}/manifest.json`, 'utf8'));
  for (const key of keys) {
    const bytes = await readFile(`${pack.path}/${key}.wav`);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.ok(bytes.length > 44, `${pack.label}: ${key}`);
  }
  for (const value of Object.values(pack.aliases || {})) assert.ok(keys.includes(value));
  assert.notEqual(pack.aliases.rwr_lock, 'vws_lock', 'enemy lock never aliases to own lock');
}
assert.equal(VOICE_PACKS.yuuka.aliases.rwr_lock, 'alram_radar_track_2.5s');
assert.equal(VOICE_PACKS.yuuka.aliases.rwr_missile, 'alram_radar_launch_1s');
console.log('PASS: weapon impact names, kill-feed order, warning triggers, voice priority/cancellation, and both local voice manifests');
