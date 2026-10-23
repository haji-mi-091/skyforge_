import {J16_WIKI} from './j16Wiki.js';
import {DEG} from '../sim/math.js';

// Stat-card facts are imported above. Motor curves, drag, blast damage and
// unlisted dimensions below are authored game coefficients, not Wiki claims.
const rows=[
 ['pl8b','PL-8B','missile','canard',2.95,.08,.40],['pl12','PL-12','missile','radar',3.93,.101,.32],['pl12a','PL-12A','missile','radar',3.93,.101,.32],
 ['ld10','LD-10','antiradar','radar',3.93,.101,.32],['yj91a','YJ-91A','antiradar','ramjet',4.70,.18,.55],['cm102','CM-102','antiradar','radar',4.0,.127,.40],
 ['kh29te','Kh-29TE','agm','cruise',3.9,.19,.55],['kd88','KD-88','agm','cruise',4.70,.18,.55],['kd88a','KD-88A','agm','cruise',4.70,.18,.55],
 ['yj91','YJ-91','agm','ramjet',4.70,.18,.55],['yj83k','YJ-83K','agm','cruise',5.1,.18,.58],
 ['bomb250','250-3','bomb','bomb',2.2,.14,.25],['bomb500','500-3','bomb','bomb',2.5,.20,.32],['ret250','250-4','bomb','bomb',2.3,.15,.26],['ret500','500-4','bomb','bomb',2.6,.21,.34],
 ['ls6250','LS-6 250','guided','bomb',2.4,.15,.29],['ls6ir250','LS-6(IR) 250','guided','bomb',2.4,.15,.29],['ls6500','LS-6 500','guided','bomb',3.05,.21,.34],['ls6ir500','LS-6(IR) 500','guided','bomb',3.05,.21,.34],
 ['gb3','GB3','guided','bomb',2.6,.15,.31],['gb250','GB250','guided','bomb',2.6,.15,.31],['gb500','GB500','guided','bomb',3.1,.21,.35],['gb1000','GB1000','guided','bomb',4.2,.27,.44],
 ['type90','Type 90-1 ×32','rocket','rocket',2.2,.23,.25],['s13of','S-13OF ×10','rocket','rocket',2.8,.25,.29],
 ['yingsiii','YINGS-III','pod','pod',2.35,.18,.22],['datalink','Data Link','pod','pod',2.2,.16,.20],
];
export const J16_STORE_DATA=Object.fromEntries(rows.map(([id,name,category,family,length,radius,span])=>{
 const wiki=J16_WIKI.weapons[id],target=category==='missile'?'air':category==='antiradar'?'emitter':id==='yj91'||id==='yj83k'?'ship':'ground';
 const ballistic=category==='bomb',glide=category==='guided',rocket=category==='rocket',pod=category==='pod';
 const guidance=ballistic||rocket?'unguided':category==='antiradar'?'antiRadiation':(glide||target!=='air')?'ground':wiki.guidanceLabel?.startsWith('ARH')?'activeRadar':'ir';
 const maxRange=wiki.maxRange??(glide?60000:ballistic?15000:rocket?8000:0),maxMach=wiki.speedUnit==='M'?wiki.maxSpeed:null;
 const mass=id==='type90'?535.2:id==='s13of'?1010:id==='gb3'?260.8:wiki.mass;
 return [id,{id,type:id,name,short:name,category,family,length,radius,span,mass,color:0xcbd0cc,aircraft:['j16'],statLimits:true,targetType:target,
  projectileMass:wiki.mass,warhead:wiki.warhead||0,tnt:wiki.tnt??wiki.warhead??0,
  damage:Math.max(30,Math.min(1800,(wiki.tnt??wiki.warhead??0)*9)),
  lockAngle:(id==='pl8b'?40:category==='missile'?55:60)*DEG,
  lockRange:wiki.allAspectRange??wiki.lockRange??maxRange,rearLockRange:wiki.rearLockRange,
  maxRange,maxMach,maxSpeedMps:wiki.speedUnit==='m/s'?wiki.maxSpeed:undefined,maxG:wiki.maxG??(glide?5:target==='ground'||target==='ship'?12:25),
  guidanceTime:wiki.guidanceTime??(ballistic?180:rocket?45:300),guidance,irSeeker:guidance==='ir',radar:guidance==='activeRadar'||guidance==='antiRadiation',
  datalink:wiki.guidanceLabel?.includes('DL')||false,activeRange:wiki.lockRange||0,seekerRange:wiki.lockRange||0,seekerAngle:55*DEG,
  irccm:wiki.irccm,flareSusceptibility:wiki.irccm?.14:.55,chaffSusceptibility:.23,
  boostTime:ballistic||glide||pod?0:rocket?1.6:id.startsWith('pl8')?1:id.startsWith('pl12')||id==='ld10'?3.5:4,
  boostAccel:ballistic||glide||pod?0:rocket?500:id==='pl8b'?310:target==='air'?225:95,
  sustainTime:ballistic||glide||pod||rocket?0:id==='pl8b'?2.7:id==='pl12a'?5.5:id==='pl12'?3.5:target==='air'?4:Math.min(90,(wiki.guidanceTime||90)*.7),
  sustainAccel:id==='pl8b'?165:target==='air'?65:glide||ballistic?0:28,
  drag:glide?.000018:ballistic?.00011:id==='pl8b'?.000075:target==='air'?.000045:.00005,
  proximity:target==='air'?10:3,blastRadius:target==='air'?26:Math.min(160,12+Math.sqrt(wiki.tnt??wiki.warhead??0)*5),
  selfDestructSpeed:ballistic||glide||pod?0:target==='air'?120:55,energyFloor:.035,
  count:0,rounds:rocket?(id==='type90'?32:10):1,retarded:id.startsWith('ret'),ballistic,glide,pod,
  source:J16_WIKI.url,coefficientPolicy:'Wiki stat-card limits; authored motor/drag/damage coefficients',
 }];
}));
// User-approved domestic range estimate: PL-10E 20 km / PL-15E 145 km × 1.25.
// Sources: CASI Air-to-Air Missiles and Guidance Systems (2020), IISS (2021-10-08).
// Only range uses the export uplift; seeker, motor, drag and damage are conservative game estimates.
J16_STORE_DATA.pl10={...structuredClone(J16_STORE_DATA.pl8b),id:'pl10',type:'pl10',name:'PL-10',short:'PL-10',family:'short',length:3,radius:.08,span:.31,mass:105,
 projectileMass:105,maxRange:20000*1.25,lockRange:8000,rearLockRange:15000,lockAngle:90*DEG,maxMach:4,maxG:60,guidanceTime:30,boostAccel:350,sustainAccel:180,sustainTime:3.5,
 flareSusceptibility:.10,damage:90,drag:.000060,seekerAngle:90*DEG,customUpgrade:{base:'pl8b',range:25000/18000,maxG:60/40,lockRange:8000/3400},source:'PL-10E export range (CASI 2020); user domestic range estimate +25%',coefficientPolicy:'Export range ×1.25; 60-G class; other performance/motor/seeker/drag/damage values are game estimates'};
J16_STORE_DATA.pl15={...structuredClone(J16_STORE_DATA.pl12a),id:'pl15',type:'pl15',name:'PL-15',short:'PL-15',family:'long',length:4,radius:.102,span:.28,mass:210,
 projectileMass:210,maxRange:145000*1.25,lockRange:25000,activeRange:25000,seekerRange:25000,maxMach:5,maxG:45,guidanceTime:180,boostTime:4,boostAccel:260,sustainTime:8,sustainAccel:75,
 drag:.000040,chaffSusceptibility:.18,damage:150,customUpgrade:{base:'pl12a',range:181250/120000,maxG:45/38,seekerRange:25000/16000},source:'PL-15E export range (IISS 2021-10-08); user domestic range estimate +25%',coefficientPolicy:'Export range ×1.25; Mach-5 class estimate; other performance/motor/seeker/drag/damage values are game estimates'};
for(const base of ['bomb250','ret250','ls6250','ls6ir250','gb3','gb250']){const w=J16_STORE_DATA[base],id=base+'x2';J16_STORE_DATA[id]={...structuredClone(w),id,type:id,name:w.name+' ×2',short:w.short+' ×2',mass:w.mass*2,payloadCount:2,rounds:2,bundleOf:base};}
// Stores the J-10C shares (its War Thunder wiki pylon table, mapped in
// j10cWeapons.js, which checks this list instead of editing these objects).
export const J10C_SHARED_STORES=['pl8b','pl10','pl12','pl12a','pl15','ld10','bomb250','bomb250x2','bomb500','ret250','ret250x2','ret500','gb250','gb500',
 'ls6250','ls6ir250','ls6ir250x2','ls6500','gb3','kd88','kd88a','yj91','yj91a','cm102','gb1000','datalink','yingsiii'];
for(const id of J10C_SHARED_STORES)J16_STORE_DATA[id].aircraft=['j16','j10c'];
export const J16_TYPE_TO_MODEL={pl8b:'PL8B',pl10:'PL10',pl12a:'PL12A',pl15:'PL15',ld10:'LD10',yj91a:'YJ91A',kd88a:'KD88A',ls6500:'LS6500',yingsiii:'YINGSIII'};
export function sortJ16Weapons(entries){const priority=['pl15','pl12a','pl12','pl10','pl8b'];const rank=w=>priority.includes(w.id||w.type)?priority.indexOf(w.id||w.type):100;return entries.sort((a,b)=>rank(a)-rank(b));}
export const J16_GAME_STATIONS=[
 {id:'LT',name:'左翼尖',kind:'tip'},{id:'LO',name:'左翼外',kind:'wing'},{id:'LI',name:'左翼内',kind:'heavy'},{id:'LN',name:'左进气道下',kind:'nacelle'},
 {id:'CF',name:'机腹前',kind:'belly'},{id:'CR',name:'机腹后',kind:'belly'},{id:'RN',name:'右进气道下',kind:'nacelle'},{id:'RI',name:'右翼内',kind:'heavy'},
 {id:'RO',name:'右翼外',kind:'wing'},{id:'RT',name:'右翼尖',kind:'tip'},
].map(s=>({...s,label:s.id,allowed:Object.values(J16_STORE_DATA).filter(w=>s.kind==='tip'?['pl8b','pl10'].includes(w.id):s.kind==='wing'?['missile','antiradar'].includes(w.category):s.kind==='belly'?w.category==='missile'||w.category==='pod'||w.category==='guided'&&w.mass<700:w.mass<1500).map(w=>w.id)}));
export const J16_DEFAULT_PRESETS=[
 {name:'现代制空 / PL-15 + PL-10',loadout:{LT:'pl10',LO:'pl15',LI:'pl15',LN:'pl15',CF:'pl15',CR:'pl15',RN:'pl15',RI:'pl15',RO:'pl15',RT:'pl10'}},
 {name:'维基制空 / PL-12A + PL-8B',loadout:{LT:'pl8b',LO:'pl12a',LI:'pl12a',LN:'pl12a',CF:'pl12a',CR:'pl12a',RN:'pl12a',RI:'pl12a',RO:'pl12a',RT:'pl8b'}},
 {name:'对地 / KD-88A + LS-6',loadout:{LT:'pl10',LO:'pl12a',LI:'kd88a',LN:'ls6500',CF:'yingsiii',CR:'pl12a',RN:'ls6500',RI:'kd88a',RO:'pl12a',RT:'pl10'}},
 {name:'反辐射 / YJ-91A + LD-10',loadout:{LT:'pl8b',LO:'ld10',LI:'yj91a',LN:'pl12a',CF:'yingsiii',CR:'pl12a',RN:'pl12a',RI:'yj91a',RO:'ld10',RT:'pl8b'}},
];
export function j16LoadoutError(loadout){let total=0,left=0,right=0;for(const s of J16_GAME_STATIONS){const w=J16_STORE_DATA[loadout?.[s.id]];if(!w)continue;if(!s.allowed.includes(w.id))return s.name+'不兼容该挂载';total+=w.mass;if(s.id.startsWith('L'))left+=w.mass;if(s.id.startsWith('R'))right+=w.mass;}if(total>8040)return '总挂载超过8040 kg';if(left>3100||right>3100)return '单侧挂载超过3100 kg';if(Math.abs(left-right)>1500)return '左右挂载差超过1500 kg';return null;}
export function normalizeJ16Loadout(input={}){const result={};for(const s of J16_GAME_STATIONS)result[s.id]=s.allowed.includes(input[s.id])?input[s.id]:null;return result;}
