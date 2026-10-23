import assert from 'node:assert/strict';
import {Aircraft} from '../src/sim/Aircraft.js';
import {F16CM_BLOCK52,J16,J10C} from '../src/data/aircraft.js';
import {missileLoadoutFromPreset,STORE_TYPES} from '../src/data/hangar.js';
import {selectMountedStore,commitMountedRelease} from '../src/visual/storeRelease.js';
const dt=1/120,world={groundHeight:()=>100,isRunway:()=>true,isAirbase:()=>true};
for(const original of [F16CM_BLOCK52,J16,J10C]){
 const a=new Aircraft(structuredClone(original),{selfDamage:false});a.reset({x:0,y:104,z:0,speed:70,throttle:.2});
 a.systems.gear=a.systems.gearTarget=1;a.systems.flaps=a.systems.flapTarget=1;a.systems.airbrake=a.systems.airbrakeTarget=1;a._touchDown(100);
 for(let t=0;t<30;t+=dt)a.update(dt,{throttle:0},world);assert.equal(a.groundSpeed,0,'braking stops '+original.id);
 for(let t=0;t<60&&a.onGround;t+=dt)a.update(dt,{throttle:1.1,pitch:1},world);
 assert.ok(a.alive&&!a.onGround,original.id+' can take off again after full stop with brakes still selected');
 assert.ok(a.events.some(e=>e.type==='takeoff'));
}
const stores=[-5,-3,-1,0,1,3,5].map(x=>({type:'test',x,remaining:1})),state={},order=[];
while(true){const s=selectMountedStore(stores,'test',state);if(!s)break;assert.equal(selectMountedStore(stores,'test',state),s,'pose queries do not consume mounts');commitMountedRelease(s,state);order.push(s.x);}
assert.deepEqual(order,[-5,5,-3,3,-1,1,0]);
const asymmetric=[{type:'test',x:-3},{type:'test',x:-1}],asymmetricState={nextSide:1};for(const x of [-3,-1]){const s=selectMountedStore(asymmetric,'test',asymmetricState);assert.equal(s.x,x);commitMountedRelease(s,asymmetricState);}
const pods=[-2,2].map(x=>({type:'rocket',x,remaining:3})),podState={},podOrder=[];
for(let i=0;i<6;i++){const s=selectMountedStore(pods,'rocket',podState);podOrder.push(s.x);commitMountedRelease(s,podState);}assert.deepEqual(podOrder,[-2,2,-2,2,-2,2]);
const cfg=structuredClone(F16CM_BLOCK52),loadout={lt:'aim9m',rt:'aim9m',li:'mk82',ri:'gbu38',tl:'fuel370',tr:'fuel370',ctr:'fuel300'};
cfg.armament.missileLoadout=missileLoadoutFromPreset({loadout},cfg);const a=new Aircraft(cfg);const before=a.flight.mass,internal=a.flight.fuel;
assert.equal(a.jettisonTanks().length,3);assert.equal(before-a.flight.mass,3250);assert.equal(a.flight.fuel,internal);assert.equal(a.jettisonTanks().length,0);
assert.ok(a.weapons.missileLoadout.some(w=>w.type==='mk82'&&w.ballistic));assert.ok(a.weapons.missileLoadout.some(w=>w.type==='gbu38'&&w.glide));
for(const store of Object.values(STORE_TYPES).filter(w=>!w.aircraft&&!['missile','pod','tank'].includes(w.category))){const c=structuredClone(F16CM_BLOCK52);const slot=missileLoadoutFromPreset({loadout:{li:store.id}},c)[0];assert.ok(slot&&slot.targetType&&Number.isFinite(slot.damage),store.id+' has release/runtime data');}
a.reset({x:0,y:104,z:0,speed:0});assert.equal(a.jettisonTanks().length,3,'respawn restores tanks');
console.log('PASS: landed/full-stop/relaunch regression (F-16/J-16/J-10C), symmetric/asymmetric mount selection, multi-round pods, tank mass/idempotence/reset, and every selectable F-16 weapon registered.');
