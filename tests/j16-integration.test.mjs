import assert from 'node:assert/strict';
import {AIRCRAFT_TYPES,J16,F16CM_BLOCK52} from '../src/data/aircraft.js';
import {J16_STORE_DATA,J16_GAME_STATIONS,J16_DEFAULT_PRESETS,j16LoadoutError} from '../src/data/j16Weapons.js';
import {missileLoadoutFromPreset} from '../src/data/hangar.js';
import {Aircraft} from '../src/sim/Aircraft.js';
assert.equal(AIRCRAFT_TYPES.j16,J16);assert.equal(J16_GAME_STATIONS.length,10);
assert.deepEqual(J16.systems.flareCount,F16CM_BLOCK52.systems.flareCount);assert.equal(J16.avionicsSource,'f16cm-block52');
for(const [name,value]of Object.entries(J16_WIKI_FIELDS()))assert.ok(Number.isFinite(value),name);
function J16_WIKI_FIELDS(){return J16.wiki.aircraft;}
assert.equal(J16.engine.count,2);assert.equal(J16.engine.dryThrust,2*8790*9.80665);assert.equal(J16.limits.flapTakeoffIas,652);
for(const w of Object.values(J16_STORE_DATA)){assert.ok(w.mass>0&&w.length>0&&w.radius>0,w.name+' dimensions/mass');if(!w.pod)for(const field of ['maxRange','maxG','guidanceTime','damage','boostTime','boostAccel','sustainTime','sustainAccel','drag'])assert.ok(Number.isFinite(w[field])&&w[field]>=0,w.name+' '+field);}
for(const preset of J16_DEFAULT_PRESETS){assert.equal(j16LoadoutError(preset.loadout),null);const cfg=structuredClone(J16);cfg.armament.missileLoadout=missileLoadoutFromPreset(preset,cfg);const aircraft=new Aircraft(cfg,{isPlayer:true});const selected=aircraft.getMissileConfig(),mass=aircraft.flight.storesMass;assert.ok(aircraft.consumeMissile());assert.ok(aircraft.flight.storesMass<mass);assert.equal(aircraft.weapons.missileRemaining[selected.type],selected.count-1);assert.equal(aircraft.contactHeight,3.04);}
assert.equal(J16_STORE_DATA.pl10.maxRange,20000*1.25,'PL-10 domestic range = export baseline +25%');assert.equal(J16_STORE_DATA.pl15.maxRange,145000*1.25,'PL-15 domestic range = export baseline +25%');
for(const [id,base]of [['pl10','pl8b'],['pl15','pl12a']]){const w=J16_STORE_DATA[id],b=J16_STORE_DATA[base];assert.equal(w.projectileMass,w.mass,id+' released mass matches mounted mass');assert.ok(w.maxRange>b.maxRange&&w.maxG>b.maxG,id+' keeps its performance tier');assert.ok(w.maxG<=(id==='pl10'?60:45),id+' conservative G ceiling');assert.ok(w.damage<=(id==='pl10'?90:150),id+' damage ceiling');assert.ok(w.drag>=.000040,id+' no ultra-low drag boost');}
console.log('PASS: J-16 registration, complete numerical stat/weapon fields, ten stations, payload presets, copied countermeasures, ammo/mass release and conservative PL range/performance estimates. No flight-performance acceptance testing performed.');
