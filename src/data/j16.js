import {J16_WIKI} from './j16Wiki.js';
import {J16_STORE_DATA,J16_DEFAULT_PRESETS,sortJ16Weapons} from './j16Weapons.js';
import {DEG} from '../sim/math.js';
export function createJ16Config(f16){
 const base=structuredClone(f16),a=J16_WIKI.aircraft,loadout=J16_DEFAULT_PRESETS[0].loadout,counts={};for(const id of Object.values(loadout))counts[id]=(counts[id]||0)+1;
 return {...base,id:'j16',name:'歼-16',shortName:'J-16',nation:'中国',role:'双座重型多用途战斗机',rwrCode:'J16',rwrType:'F16',avionicsSource:'f16cm-block52',wiki:J16_WIKI,
  visual:{length:21.95,height:6.36,wingspan:14.70,paint:'weathered',callsign:'FLANKER 1-6',loadout,audioManifest:'audio/j16/pack.json',gunMode:'shots',
   hangar:{title:'歼-16 / J-16',code:'J-16',loadoutTag:'J-16 / LOADOUT',menuTag:'J-16 // MULTIROLE',name:['歼-16','FLANKER'],note:'中国 · 双座双发重型多用途战斗机',specs:['444 kg/m²','约1.02（满内油）','+11 / −4 G','2.1','2 × WS-10B']},
   paints:{default:'service',options:[['service','基础外观'],['camo','银灰迷彩']]}},
  mass:{empty:a.emptyInclEngines,engine:0,fuel:a.fuel,ammo:150*.395,stores:Object.values(loadout).reduce((n,id)=>n+J16_STORE_DATA[id].mass,160)},
  geometry:{wingArea:62.04,wingspan:14.70,chord:4.24,aspectRatio:14.7**2/62.04,hitRadius:9.5},inertia:{roll:51000,pitch:420000,yaw:480000},
  // Wiki limits: ceiling 16,000 m, flaps landing 600 / takeoff 652 km/h (j16Wiki.js).
  limits:{...base.limits,gPositive:11,gNegative:-4,maxIas:1540,maxMach:2.1,gearIas:700,flapIas:a.flapLandingIas,flapTakeoffIas:a.flapTakeoffIas,brakeIas:900,alphaLimit:30*DEG,alphaNegative:-18*DEG,structuralG:12.1,ceiling:a.ceiling},
  // abThreshold 1: afterburner only beyond full military power (shared by all three jets).
  control:{rollRate:3.32},
  aero:{...base.aero,clTable:[[-40,-.55],[-30,-.85],[-24,-1.05],[-18,-1.1],[-12,-.8],[-6,-.4],[0,.06],[4,.35],[8,.68],[12,1],[16,1.28],[20,1.5],[24,1.64],[28,1.68],[32,1.45],[40,.8],[55,.38]],clMax:1.68,clFlap:.56,clFlapLanding:.35,flapPitchMoment:{takeoff:-.015,landing:-.033},cd0:.0217,storesCd:.0045,inducedK:.105,oswald:.80,machDragPeak:.030,machDragWidth:.26,supersonicDrag:.0105,gearCd:.024,flapCd:.060,brakeCd:.065,clAileron:.10,clp:-.42,cmAlpha:-.53,cmq:-14,cmElevator:.64,cnBeta:.14,cnRudder:.085,elevatorMax:.40,aileronMax:.38,rudderMax:.38,elevatorRate:1.4,aileronRate:2.5,rudderRate:1.3},
  engine:{...base.engine,name:'2 × WS-10B series 3',count:2,dryThrust:2*a.perEngineDryKgf*9.80665,afterburnerThrust:2*a.perEngineAbKgf*9.80665,weightKg:null,idleFraction:.04,spoolUp:3.0,spoolDown:3.5,abSpool:.7,abThreshold:1,densityExponent:.55,ramFactor:.10,highMachLoss:.04,fuelFlowDry:9400/(41*60),fuelFlowAB:8.8,idleFlow:.20,nozzleArea:1.48,ceilingFade:2000},
  systems:{...base.systems,maxFuel:9400,contactHeight:3.04,mainGearZ:3.52,gearTime:5.2,flapTime:3,canopyTime:5,dragChute:true,dragChuteCd:.62,fuelDumpRate:25,seekerLimitedLock:true,maxGroundPitchDeg:9.5},// ventral keels strike at 9.6° (tools/measure-tail-strike.mjs)
  armament:{...base.armament,trackStoreMass:true,pylonMass:160,cannon:{...base.armament.cannon,name:'30 mm Type 30-4',caliber:30,ammo:150,rate:1800,spinUpTime:0,muzzleVelocity:860,dispersion:.003,damage:28,tracerEvery:3,mass:.395,trackAmmoMass:true,shellDamage:{'AP-T':22,'APHE':30,'HEF-I':34},tracerShells:['AP-T'],drag:.000065,life:5,muzzle:[1.12,-.43,-2.45],launchOffsets:[[0,-1.6,-.3]],belts:{default:['AP-T','HEF-I'],universal:['AP-T','HEF-I','APHE','HEF-I'],ground:['AP-T','APHE'],air:['AP-T','HEF-I','HEF-I'],stealth:['APHE','HEF-I','HEF-I']},penetration:{apShells:['AP-T'],distance:[10,100,500,1000,1500,2000],apT:[55,53,45,37,31,25],aphe:[42,40,34,28,23,19]}},missiles:{...J16_STORE_DATA.pl15,count:8},missileLoadout:sortJ16Weapons(Object.values(J16_STORE_DATA).filter(w=>!w.pod).map(w=>({...w,count:counts[w.id]||0})))},
  // clFlap: calibrated like the F-16 / J-10C so the hands-off afterburner takeoff run matches the wiki (750 m; 747 m, ~401 km/h).
  performanceTargets:{...a,wingArea:62.04},estimates:['wing area / mean chord / inertia','aerodynamic coefficient curves and actuator rates','engine spool / fuel-flow / altitude lapse coefficients','cannon velocity / dispersion / game damage','weapon motor / drag / blast coefficients'],
 };
}
