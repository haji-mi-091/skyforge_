import assert from 'node:assert/strict';
import {Aircraft} from '../src/sim/Aircraft.js';
import {FlightModel} from '../src/sim/FlightModel.js';
import {F16CM_BLOCK52,J16,J10C} from '../src/data/aircraft.js';
import {DEG,RAD} from '../src/sim/math.js';

const dt=1/120,world={groundHeight:()=>100,isRunway:()=>true,isAirbase:()=>true};
const results=[];
function groundAircraft(cfg,speed=0,flaps=.6){
 const a=new Aircraft(structuredClone(cfg),{selfDamage:false});
 a.reset({x:0,y:104,z:0,speed,throttle:1.1},{onGround:true});
 a.groundSpeed=speed;a.flight.velocity.set(0,0,-speed);a.flight.refreshGroundReadouts();
 a.systems.flaps=a.systems.flapTarget=flaps;
 return a;
}
for(const cfg of [F16CM_BLOCK52,J16,J10C]){
 // At an unchanged air state, every detent must trim the actual pitch moment
 // while keeping the neutral stick's 1-G demand (rather than adding a turn).
 const fm=new FlightModel(cfg);fm.reset({speed:150,y:1500});
 const trims=[];
 for(const flaps of [0,.6,1]){
  const systems={flaps,gear:0,airbrake:0,stores:1};
  for(let i=0;i<120;i++)fm.control.update(fm.air,{},systems,dt);
  assert.equal(fm.control.feedback.nCmd,1,cfg.id+' neutral stick remains 1 G');
  const residual=fm.aero.pitchBaseCoefficient(fm.air,fm.control.surfaces)+cfg.aero.cmElevator*fm.control.surfaces.elevator;
  assert.ok(Math.abs(residual)<1e-9,cfg.id+' trims the flap moment at '+flaps);
  trims.push(fm.control.feedback.flapTrimElevator*RAD);
 }
 assert.ok(trims[0]===0&&trims[1]>0&&trims[2]>trims[1]);

 // Real flap transit and flight integration: bounded actuator motion, finite
 // attitude and no hidden change to the pilot's neutral load-factor demand.
 fm.reset({speed:150,y:3000,throttle:.8});
 let flap=0,maxSlew=0;
 for(const target of [.6,1,.6,0]){
  for(let i=0;i<480;i++){
   flap+=Math.sign(target-flap)*Math.min(Math.abs(target-flap),dt/cfg.systems.flapTime);
   const before=fm.control.surfaces.elevator;
   fm.step(dt,{throttle:.8},{flaps:flap,gear:0,airbrake:0,stores:1});
   const slew=Math.abs(fm.control.surfaces.elevator-before)/dt;
   maxSlew=Math.max(maxSlew,slew);
   assert.ok(slew<=cfg.aero.elevatorRate+1e-8);
   assert.equal(fm.control.feedback.nCmd,1);
   assert.ok([fm.pitch,fm.rates.q,fm.position.y,fm.tas].every(Number.isFinite));
  }
 }
 assert.ok(Math.abs(flap)<1e-10,'complete flap cycle');

 const a=groundAircraft(cfg);let peak=0,seconds=0;
 for(;seconds<60&&a.onGround;seconds+=dt){
  const before=a.groundPitch;
  a.update(dt,{throttle:1.1},world);
  peak=Math.max(peak,a.groundPitch*RAD);
  assert.ok(Math.abs(a.groundPitch-before)<=.8*DEG*dt+1e-9,'gentle automatic rotation');
  // Transform the main wheel's local point: its bottom must stay on the runway.
  const mainBottom=a.flight.position.y-a.contactHeight*Math.cos(a.groundPitch)-(cfg.systems.mainGearZ||0)*Math.sin(a.groundPitch);
  assert.ok(Math.abs(mainBottom-100)<1e-8,'main wheels remain grounded through rotation');
 }
 assert.ok(a.alive&&!a.onGround,cfg.id+' rotates and lifts off without stick input');
 // Same limit Aircraft applies: the configured takeoff attitude, clamped to 4°.
 const peakLimit=Math.min(4,cfg.systems.takeoffPitchDeg??2.5);
 assert.ok(peak>.5&&peak<=peakLimit+1e-6,'micro rotation stays below '+peakLimit+' degrees');
 assert.ok(a.speedKmh>180,'no low-speed forced takeoff');
 const pitch=a.flight.pitch;
 for(let i=0;i<12;i++)a.update(dt,{throttle:1.1},world);
 assert.ok(Math.abs(a.flight.pitch-pitch)<2,'no attitude jump at liftoff');

 // Baseline speed inside each aircraft's own assist window (85% of its measured
 // liftoff IAS), so the inhibit cases below compare against an active assist.
 const assistSpeed=a.speedKmh/3.6*.85;
 const enabled=groundAircraft(cfg,assistSpeed);enabled.update(dt,{throttle:1.1},world);
 assert.ok(enabled.takeoffPitchAssist>0,'same-speed baseline has active rotation assist');
 const push=groundAircraft(cfg,assistSpeed);push.groundPitch=2*DEG;
 push.update(dt,{throttle:1.1,pitch:-1},world);
 assert.ok(push.groundPitch<2*DEG,'forward stick overrides rotation assist');
 for(const setup of [a=>a.systems.flaps=a.systems.flapTarget=0,a=>a.systems.airbrake=a.systems.airbrakeTarget=1,a=>a.systems.parachute=1]){
  const stoppedAssist=groundAircraft(cfg,assistSpeed);setup(stoppedAssist);
  for(let i=0;i<60;i++)stoppedAssist.update(dt,{throttle:1.1},world);
  assert.equal(stoppedAssist.groundPitch,0,'clean wing, brakes or chute disables assist');
 }
 const idle=groundAircraft(cfg,assistSpeed);for(let i=0;i<60;i++)idle.update(dt,{throttle:.5},world);
 assert.equal(idle.groundPitch,0,'low power disables assist');
 fm.control.reset();assert.equal(fm.control.feedback.flapTrimElevator,0,'reset clears trim feedback');
 results.push({aircraft:cfg.id,trimElevatorDeg:trims,peakRotationDeg:peak,liftoffSeconds:seconds,liftoffIasKmh:a.speedKmh,maxElevatorSlewRadPerSecond:maxSlew});
}
console.log(JSON.stringify(results,null,2));
console.log('PASS: F-16/J-16/J-10C flap moment trim, neutral 1-G reference, full flap transit, gentle rotation, main-wheel ground contact, liftoff transition, pilot override and assist inhibit conditions.');
