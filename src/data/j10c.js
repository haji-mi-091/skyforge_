import {J10C_WIKI} from './j10cWiki.js';
import {J10C_STORE_DATA,J10C_DEFAULT_PRESETS,sortJ10CWeapons} from './j10cWeapons.js';
import {DEG} from '../sim/math.js';

// J-10C game config. Stat-card numbers (mass, fuel, limits, WS-10B thrust,
// Type 23-3 cannon, payload limits) come from the War Thunder wiki (RB
// reference). Avionics, countermeasures and the radar/RWR model are inherited
// from the F-16CM Block 52, as for the J-16. Aerodynamic and inertia
// coefficients are authored to reproduce the wiki speed / climb / turn figures.
export function createJ10CConfig(f16){
 const base=structuredClone(f16),a=J10C_WIKI.aircraft,loadout=J10C_DEFAULT_PRESETS[0].loadout,counts={};for(const id of Object.values(loadout))if(id)counts[id]=(counts[id]||0)+1;
 const wingArea=(a.baseMass+a.fuel)/a.wingLoading,shell=a.burstMassKg/(a.cannonRpm/60);
 return {...base,id:'j10c',name:'歼-10C',shortName:'J-10C',nation:'中国',role:'单发多用途战斗机',rwrCode:'J10',rwrType:'F16',avionicsSource:'f16cm-block52',wiki:J10C_WIKI,
  visual:{length:17.05,height:5.80,wingspan:9.73,paint:'bayi',callsign:'BAYI 1-0',loadout,audioManifest:'audio/j10c/pack.json',gunMode:'shots',
   hangar:{title:'歼-10C / J-10C',code:'J-10C',loadoutTag:'J-10C / LOADOUT',menuTag:'J-10C // MULTIROLE',name:['歼-10C','VIGOROUS DRAGON'],note:'中国 · 单发鸭式布局多用途战斗机',specs:['326 kg/m²','约1.13（满内油）','+11 / −4 G','2.1','WS-10B']},
   paints:{default:'bayi',options:[['service','基础外观'],['bayi','八一涂装']]}},
  mass:{empty:a.baseMass,engine:0,fuel:a.fuel,ammo:a.cannonAmmo*shell,stores:Object.values(loadout).reduce((n,id)=>n+(J10C_STORE_DATA[id]?.mass||0),120)},
  geometry:{wingArea,wingspan:a.span,chord:wingArea/a.span,aspectRatio:a.span**2/wingArea},inertia:{roll:11000,pitch:82000,yaw:92000},
  // Wiki limits: ceiling 16,500 m (j10cWiki.js). The J-10C page lists no flap speed
  // limits, so flapIas 600 / flapTakeoffIas 620 km/h are authored values.
  limits:{...base.limits,gPositive:a.gPositive,gNegative:a.gNegative,maxIas:a.maxIas,maxMach:a.maxMach,gearIas:a.gearIas,flapIas:600,flapTakeoffIas:620,brakeIas:900,alphaLimit:30*DEG,alphaNegative:-16*DEG,structuralG:12.1,ceiling:a.ceiling},
  control:{rollRate:4.2},
  aero:{...base.aero,clTable:[[-40,-.55],[-30,-.85],[-24,-1.0],[-18,-1.0],[-12,-.72],[-6,-.36],[0,.02],[4,.28],[8,.55],[12,.82],[16,1.07],[20,1.29],[24,1.46],[28,1.57],[32,1.6],[36,1.45],[45,1.0],[55,.5]],clMax:1.6,
   // Flap detents (up / takeoff / landing): the leading-edge flaps and drooped
   // elevons pitch the nose down; the FBW trims that moment out with elevator,
   // so every detent keeps the 1 g reference. The FBW holds 1 g, so any flap
   // lift increment comes straight out of AoA and shows as a nose drop: the
   // increments are kept small (LE flaps mostly raise CLmax) so selecting
   // takeoff / landing flaps moves the nose by under 2° (it was ~9° at 1.30).
   // Hands-off liftoff ~450 km/h in ~820 m (wiki run 850 m); rotating from
   // 280 km/h lifts off at ~330 km/h.
   clFlap:.22,clFlapLanding:.12,flapPitchMoment:{takeoff:-.012,landing:-.024},cd0:.0165,storesCd:.004,inducedK:.225,oswald:.62,machDragPeak:.028,machDragWidth:.26,supersonicDrag:.029,
   gearCd:.020,flapCd:.045,brakeCd:.060,clAileron:.13,clp:-.40,cmAlpha:-.30,cmq:-11,cmElevator:.58,cnBeta:.13,cnRudder:.08,elevatorMax:.44,aileronMax:.40,rudderMax:.40,elevatorRate:1.9,aileronRate:3.2,rudderRate:1.6},
  // abThreshold 1: afterburner only beyond full military power (shared by all three jets).
  engine:{...base.engine,name:'WS-10B',count:1,dryThrust:a.engineDryKgf*9.80665,afterburnerThrust:a.engineAbKgf*9.80665,weightKg:null,idleFraction:.04,spoolUp:2.6,spoolDown:3.0,abSpool:.65,abThreshold:1,
   densityExponent:.62,ramFactor:.42,highMachLoss:.05,fuelFlowDry:a.fuel/(a.fuelMinutes*60),fuelFlowAB:4.4,idleFlow:.10,nozzleArea:.74,ceilingFade:2000},
  // Main wheels touch at z 1.60 on the model (rotation pivot); 4° nose-up assist on the takeoff roll.
  systems:{...base.systems,maxFuel:a.fuel,contactHeight:2.30,mainGearZ:1.60,takeoffPitchDeg:4,gearTime:4.6,flapTime:2.5,canopyTime:4,dragChute:true,dragChuteCd:.48,fuelDumpRate:15,seekerLimitedLock:true,maxGroundPitchDeg:12},// ventral fins strike at 12.2° (tools/measure-tail-strike.mjs)
  armament:{...base.armament,trackStoreMass:true,pylonMass:120,
   cannon:{...base.armament.cannon,name:a.cannon,caliber:23,ammo:a.cannonAmmo,rate:a.cannonRpm,spinUpTime:0,muzzleVelocity:715,dispersion:.0032,damage:16,tracerEvery:3,mass:shell,trackAmmoMass:true,drag:.00009,life:4,
    muzzle:[-.95,-.80,-3.32],launchOffsets:[[0,-1.4,0]],belts:a.belts,shellDamage:{'HEFI-T':16,'AP-I':13,'HEF-I':18},tracerShells:['HEFI-T'],
    penetration:{apShells:['AP-I'],distance:a.penetration.distance,apT:a.penetration.mm,aphe:a.penetration.mm}},
   missiles:{...J10C_STORE_DATA.pl15,count:4},missileLoadout:sortJ10CWeapons(Object.values(J10C_STORE_DATA).filter(w=>!w.pod&&w.category!=='tank').map(w=>({...w,count:(counts[w.id]||0)*(w.rounds||1)})))},
  performanceTargets:{...a,wingArea},estimates:['inertia','aerodynamic coefficient curves and actuator rates','engine spool / fuel-flow / altitude lapse coefficients','cannon velocity / dispersion / game damage'],
 };
}
