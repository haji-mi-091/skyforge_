import {J10C_WIKI} from './j10cWiki.js';
import {J16_STORE_DATA,J10C_SHARED_STORES,sortJ16Weapons} from './j16Weapons.js';

// The J-10C carries the J-16's weapon set (same data objects, same models).
// Which store fits which of the 11 hardpoints comes from the War Thunder wiki
// pylon table; PL-10 / PL-15 are the user's enhanced J-16 missiles and go
// wherever the wiki allows PL-8B / PL-12A. Stores the wiki lists but the J-16
// set lacks (Type 130-2 rockets, triple racks, twin PL-12) are not
// offered.
const WIKI_TO_ID={
 'PL-8B air-to-air missiles':['pl8b','pl10'],'PL-12 air-to-air missiles':['pl12'],'PL-12A air-to-air missiles':['pl12a','pl15'],
 'LD-10 anti-radiation missiles':['ld10'],'7 × Type 90-1 HEAT rockets':['type90x7'],
 '250 kg 250-3 bomb':['bomb250'],'2 × 250 kg 250-3 bomb':['bomb250x2'],'500 kg 500-3 bomb':['bomb500'],
 '250 kg 250-4 parachute retarded bomb':['ret250'],'2 × 250 kg 250-4 parachute retarded bomb':['ret250x2'],'500 kg 500-4 parachute retarded bomb':['ret500'],
 'GB250 guided bomb':['gb250'],'GB500 guided bomb':['gb500'],'LS-6 250 guided bomb':['ls6250'],'LS-6(IR) 250 guided bomb':['ls6ir250'],'2 × LS-6(IR) 250 guided bomb':['ls6ir250x2'],
 'LS-6 500 guided bomb':['ls6500'],'GB3 guided bomb':['gb3'],'KD-88 air-to-ground missiles':['kd88'],'KD-88A air-to-ground missiles':['kd88a'],
 'YJ-91 anti-ship missile':['yj91'],'YJ-91A anti-radiation missiles':['yj91a'],'CM-102 anti-radiation missiles':['cm102'],'GB1000 guided bomb':['gb1000'],
 'Data Link pod':['datalink'],'YINGS-III targeting pod':['yingsiii'],
 'Drop tank (1600 liters)':['tank1600'],'Drop tank (800 liters)':['tank800'],
};
// The J-10C's own 7-round Type 90-1 pod (the J-16 pod holds 32).
export const J10C_EXTRA_STORES={type90x7:{...structuredClone(J16_STORE_DATA.type90),id:'type90x7',type:'type90x7',name:'Type 90-1 ×7',short:'Type 90 ×7',
 mass:153.5,rounds:7,length:1.6,radius:.15,span:.18,aircraft:['j10c'],source:J10C_WIKI.url},
 // Drop tanks from the wiki pylon table (1600 L on slots 3/9, 800 L on slot 6). fuel =
 // the wiki's dropTankFuel (3320 kg for the full 1600+1600+800 L set) split by capacity;
 // mass = fuel + the wiki row's 68 kg. Length/radius are estimates sized to the capacity.
 ...Object.fromEntries([[1600,5.0,.36],[800,4.0,.29]].map(([litres,length,radius])=>{const fuel=J10C_WIKI.aircraft.dropTankFuel*litres/4000;
  return ['tank'+litres,{id:'tank'+litres,type:'tank'+litres,name:litres+' L 副油箱',short:litres+' L',category:'tank',family:'tank',fuel,mass:fuel+68,
   length,radius,span:radius*2,color:0xb3babd,aircraft:['j10c'],source:J10C_WIKI.url}];}))};
export const J10C_STORE_DATA={};
// Hardpoints left wing tip -> right wing tip (wiki slot order 1..11).
export const J10C_GAME_STATIONS=[
 ['LT','左翼外'],['LO','左翼中'],['LI','左翼内'],['LA','左机腹后'],['LF','左进气道'],['C','机腹中线'],
 ['RF','右进气道'],['RA','右机腹后'],['RI','右翼内'],['RO','右翼中'],['RT','右翼外'],
].map(([id,name],i)=>({id,name,label:id,slot:i+1,allowed:[]}));
for(const row of J10C_WIKI.pylons){
 const ids=WIKI_TO_ID[row.name];if(!ids)continue;
 for(const id of ids){
  const w=J16_STORE_DATA[id]||J10C_EXTRA_STORES[id];J10C_STORE_DATA[id]=w;
  if(J16_STORE_DATA[id]&&!J10C_SHARED_STORES.includes(id))throw new Error(`J-10C store ${id} missing from J10C_SHARED_STORES`);
  for(const slot of row.slots)J10C_GAME_STATIONS[slot-1].allowed.push(id);
 }
}
export const J10C_DEFAULT_PRESETS=[
 {name:'现代制空 / PL-15 + PL-10',loadout:{LT:'pl10',LO:'pl15',LI:'pl15',RI:'pl15',RO:'pl15',RT:'pl10'}},
 {name:'维基制空 / PL-12A + PL-8B',loadout:{LT:'pl8b',LO:'pl12a',LI:'pl12a',RI:'pl12a',RO:'pl12a',RT:'pl8b'}},
 {name:'对地 / KD-88A + LS-6',loadout:{LT:'pl10',LO:'kd88a',LI:'ls6500',LF:'yingsiii',RI:'ls6500',RO:'kd88a',RT:'pl10'}},
 {name:'反辐射 / YJ-91A + LD-10',loadout:{LT:'pl8b',LO:'yj91a',LI:'ld10',RF:'datalink',RI:'ld10',RO:'yj91a',RT:'pl8b'}},
].map(p=>({...p,loadout:normalizeJ10CLoadout(p.loadout)}));
const limits=J10C_WIKI.aircraft;
export function j10cLoadoutError(loadout){let total=0,left=0,right=0;for(const s of J10C_GAME_STATIONS){const w=J10C_STORE_DATA[loadout?.[s.id]];if(!w)continue;if(!s.allowed.includes(w.id))return s.name+'不兼容该挂载';total+=w.mass;if(s.id.startsWith('L'))left+=w.mass;if(s.id.startsWith('R'))right+=w.mass;}
 if(total>limits.payload)return `总挂载超过${limits.payload} kg`;if(left>limits.sidePayload||right>limits.sidePayload)return `单侧挂载超过${limits.sidePayload} kg`;if(Math.abs(left-right)>limits.payloadImbalance)return `左右挂载差超过${limits.payloadImbalance} kg`;return null;}
export function normalizeJ10CLoadout(input={}){const result={};for(const s of J10C_GAME_STATIONS)result[s.id]=s.allowed.includes(input[s.id])?input[s.id]:null;return result;}
export const sortJ10CWeapons=sortJ16Weapons;
