import assert from 'node:assert/strict';
import {AIRCRAFT_TYPES,J10C,J16,F16CM_BLOCK52} from '../src/data/aircraft.js';
import {J10C_STORE_DATA,J10C_GAME_STATIONS,J10C_DEFAULT_PRESETS,j10cLoadoutError} from '../src/data/j10cWeapons.js';
import {J16_STORE_DATA} from '../src/data/j16Weapons.js';
import {missileLoadoutFromPreset,STORE_TYPES} from '../src/data/hangar.js';
import {Aircraft} from '../src/sim/Aircraft.js';
import {FlightModel} from '../src/sim/FlightModel.js';

// Registration and War Thunder wiki stat card.
const a=J10C.wiki.aircraft;
assert.equal(AIRCRAFT_TYPES.j10c,J10C);assert.equal(J10C.id,'j10c');assert.equal(J10C.engine.count,1);
assert.equal(J10C.engine.dryThrust,8620*9.80665);assert.equal(J10C.engine.afterburnerThrust,13580*9.80665);
assert.equal(J10C.mass.fuel,2900);assert.equal(J10C.systems.maxFuel,2900);assert.equal(J10C.limits.gPositive,11);assert.equal(J10C.limits.gNegative,-4);
assert.equal(J10C.limits.maxIas,1543);assert.equal(J10C.limits.gearIas,620);assert.equal(J10C.armament.cannon.ammo,200);assert.equal(J10C.armament.cannon.rate,3396);
assert.equal(J10C.visual.audioManifest,'audio/j10c/pack.json');assert.equal(J10C.systems.contactHeight,2.30);
for(const [k,v]of Object.entries(a))if(typeof v==='number')assert.ok(Number.isFinite(v),k);
// Radar, RWR, countermeasures and alerts are the J-16's (F-16CM Block 52 avionics).
assert.equal(J10C.avionicsSource,J16.avionicsSource);assert.equal(J10C.rwrType,J16.rwrType);assert.deepEqual(J10C.systems.flareCount,J16.systems.flareCount);assert.deepEqual(J10C.systems.chaffCount,J16.systems.chaffCount);

// Hardpoints from the wiki pylon table, weapons from the J-16 set.
assert.equal(J10C_GAME_STATIONS.length,11);
for(const s of J10C_GAME_STATIONS)assert.ok(s.allowed.length>0,s.id+' has stores');
assert.deepEqual(J10C_GAME_STATIONS.find(s=>s.id==='LT').allowed.sort(),['pl10','pl8b']);
assert.ok(J10C_GAME_STATIONS.find(s=>s.id==='LF').allowed.includes('yingsiii')&&J10C_GAME_STATIONS.find(s=>s.id==='RF').allowed.includes('gb250'));
for(const [id,w]of Object.entries(J10C_STORE_DATA)){assert.ok(w.aircraft.includes('j10c'),id);assert.equal(STORE_TYPES[id],w,id+' in hangar catalogue');if(J16_STORE_DATA[id])assert.equal(w,J16_STORE_DATA[id],id+' is the J-16 store');}
assert.ok(J16_STORE_DATA.pl15.aircraft.includes('j16'),'J-16 keeps its stores');assert.ok(!J16_STORE_DATA.kh29te.aircraft.includes('j10c'),'J-16-only stores stay J-16 only');
assert.equal(j10cLoadoutError({LI:'gb1000',LO:'kd88a',LT:'pl10',LF:'yingsiii',LA:'gb250',C:'bomb500'}),'左右挂载差超过1750 kg');
assert.equal(j10cLoadoutError({C:'kd88a'}),'机腹中线不兼容该挂载');
for(const preset of J10C_DEFAULT_PRESETS){
 assert.equal(j10cLoadoutError(preset.loadout),null,preset.name);
 const cfg=structuredClone(J10C);cfg.armament.missileLoadout=missileLoadoutFromPreset(preset,cfg);const aircraft=new Aircraft(cfg,{isPlayer:true});
 const selected=aircraft.getMissileConfig(),mass=aircraft.flight.storesMass;assert.ok(aircraft.consumeMissile(),preset.name);assert.ok(aircraft.flight.storesMass<mass);
 assert.equal(aircraft.weapons.missileRemaining[selected.type],selected.count-1);assert.equal(aircraft.contactHeight,2.30);
}

// Flight performance against the wiki card (clean, full internal fuel).
const STEP=1/120,clean=()=>{const c=structuredClone(J10C);c.mass.stores=0;return c;},none={flaps:0,gear:0,airbrake:0,stores:0};
{const fm=new FlightModel(clean());fm.reset({y:12000,speed:560,throttle:1.1});
 for(let t=0;t<420;t+=STEP)fm.step(STEP,{pitch:Math.max(-1,Math.min(1,(12000-fm.position.y)*.0008-fm.verticalSpeed*.01)),roll:0,yaw:0,throttle:1.1},none);
 const kmh=fm.tas*3.6;assert.ok(Math.abs(kmh-a.speedKmh)/a.speedKmh<.05,`top speed ${kmh.toFixed(0)} vs ${a.speedKmh}`);console.log(`  top speed ${kmh.toFixed(0)} km/h at 12 km (wiki ${a.speedKmh})`);}
{let best=0;for(let v=150;v<=420;v+=15){const fm=new FlightModel(clean());fm.reset({y:500,speed:v,throttle:1.1});
  for(let t=0;t<6;t+=STEP)fm.step(STEP,{pitch:0,roll:0,yaw:0,throttle:1.1},none);const v0=fm.tas,h0=fm.position.y;
  for(let t=0;t<1;t+=STEP)fm.step(STEP,{pitch:0,roll:0,yaw:0,throttle:1.1},none);best=Math.max(best,(fm.tas**2-v0**2)/(2*9.80665)+fm.position.y-h0);}
 assert.ok(Math.abs(best-a.climbMps)/a.climbMps<.10,`climb ${best.toFixed(0)} vs ${a.climbMps}`);console.log(`  best climb ${best.toFixed(0)} m/s (wiki ${a.climbMps})`);}

// Hands-off pitch trim in the three flap detents (up / takeoff / landing).
const trim=(flaps,gear,y,speed,throttle)=>{const fm=new FlightModel(structuredClone(J10C));fm.reset({y,speed,throttle});let maxEl=0;
 for(let t=0;t<12;t+=STEP){fm.step(STEP,{pitch:0,roll:0,yaw:0,throttle},{flaps,gear,airbrake:0,stores:1});if(t>2)maxEl=Math.max(maxEl,Math.abs(fm.control.surfaces.elevator));}
 return {g:fm.normalLoad,vs:fm.verticalSpeed,pitch:fm.pitch,elev:maxEl};};
const up=trim(0,0,3000,250,.86),takeoff=trim(.6,1,400,85,.85),landing=trim(1,1,400,78,.62);
console.log('  trim',JSON.stringify({up,takeoff,landing},(k,v)=>typeof v==='number'?+v.toFixed(2):v));
// Shared FBW scheme: the flap moment is trimmed out with elevator, every detent holds 1 g.
for(const [name,r]of Object.entries({up,takeoff,landing})){
 assert.ok(Math.abs(r.g-1)<.05&&Math.abs(r.vs)<8,name+' detent holds the 1 g reference hands-off');
 assert.ok(r.elev<J10C.aero.elevatorMax*.5,name+' trim leaves elevator authority');
}
assert.ok(J10C.aero.flapPitchMoment.takeoff<0&&J10C.aero.flapPitchMoment.landing<J10C.aero.flapPitchMoment.takeoff,'flap moments: landing > takeoff nose-down');
// Selecting takeoff / landing flaps and cleaning up again, hands-off at constant IAS:
// the nose may only move slightly and the load factor must not jump.
for(const kmh of [330,400,480]){
 const fm=new FlightModel(structuredClone(J10C));fm.reset({y:600,speed:kmh/3.6,throttle:.7});const sys={flaps:0,gear:1,airbrake:0,stores:1};let flaps=0,ref=null;
 for(const [target,secs]of [[0,8],[.6,10],[1,10],[0,10]]){let gMin=9,gMax=-9,pMin=99,pMax=-99;
  for(let t=0;t<secs;t+=STEP){flaps+=Math.max(-STEP/J10C.systems.flapTime,Math.min(STEP/J10C.systems.flapTime,target-flaps));sys.flaps=flaps;
   fm.step(STEP,{pitch:0,roll:0,yaw:0,throttle:Math.max(0,Math.min(1,.7+(kmh-fm.iasKmh)*.01))},sys);
   if(ref!==null){gMin=Math.min(gMin,fm.normalLoad);gMax=Math.max(gMax,fm.normalLoad);pMin=Math.min(pMin,fm.pitch);pMax=Math.max(pMax,fm.pitch);}}
  if(ref===null){ref=fm.pitch;continue;}
  assert.ok(Math.max(Math.abs(pMin-ref),Math.abs(pMax-ref))<2.5,`${kmh} km/h flaps→${target}: nose moves ${(pMin-ref).toFixed(1)}..${(pMax-ref).toFixed(1)}°`);
  assert.ok(gMin>.9&&gMax<1.1,`${kmh} km/h flaps→${target}: G ${gMin.toFixed(2)}..${gMax.toFixed(2)}`);
 }
}
assert.equal(J10C.systems.mainGearZ,1.60);assert.ok(J10C.systems.takeoffPitchDeg>0,'slight nose-up assist on the takeoff roll');
console.log('PASS: J-10C registration, wiki stat card, eleven hardpoints with J-16 stores, presets, payload limits, performance vs wiki, three-detent pitch trim. In-game flight acceptance is left to the user.');
