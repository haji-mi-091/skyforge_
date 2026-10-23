import assert from 'node:assert/strict';
import {Aircraft} from '../src/sim/Aircraft.js';
import {F16CM_BLOCK52,J16,J10C} from '../src/data/aircraft.js';
const world={groundHeight:()=>100,isRunway:()=>true,isAirbase:()=>true};
function approach(cfg,{speed=420,sink=-5,bank=0,pitch=5,gear=1,agl}={}){
 const a=new Aircraft(structuredClone(cfg),{selfDamage:false});a.reset({x:0,y:100+(agl??a.contactHeight+.1),z:0,speed:speed/3.6,throttle:.2});
 // Isolate the touchdown decision from changes made by the flight integrator.
 a.flight.step=()=>{};a.flight.iasKmh=speed;a.flight.verticalSpeed=sink;a.flight.bank=bank;a.flight.pitch=pitch;a.flight.velocity.set(0,sink,-speed/3.6);a.systems.gear=gear;
 a._updateAir(1/120,{},world);return a;
}
for(const cfg of [F16CM_BLOCK52,J16,J10C]){
 for(const params of [{speed:420,sink:-5},{speed:450,sink:-8,bank:18},{speed:480,sink:-11,pitch:-10},{speed:510,sink:-3},{gear:.82,speed:340}]){
  const a=approach(cfg,params);assert.ok(a.onGround&&a.alive,cfg.id+' accepts controlled touchdown '+JSON.stringify(params));assert.equal(a.health,100,'controlled touchdown does not remove health');assert.equal(a.events.at(-1).hard,false);
 }
 const premature=approach(cfg,{agl:4.4});assert.equal(premature.onGround,false,cfg.id+' does not snap down before the wheels touch');
 const hard=approach(cfg,{sink:-15});assert.ok(hard.onGround&&hard.alive);assert.equal(hard.health,92);assert.equal(hard.events.at(-1).hard,true);
 for(const params of [{gear:0,agl:0},{sink:-25,agl:0},{speed:650,agl:0},{bank:60,agl:0}])assert.equal(approach(cfg,params).alive,false,'genuine impact remains a crash');
}
console.log('PASS: F-16/J-16/J-10C controlled touchdown without health loss, wheel-height contact, forgiving gear/speed/attitude limits, reduced heavy-landing damage, and genuine-impact crashes.');
