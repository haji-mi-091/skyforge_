import {STORE_DIMENSIONS} from './storeDimensions.js';
import {F16_WIKI} from './f16Wiki.js';
import {F16_STATIONS,F16_STATION_STORES,normalizeF16Loadout} from './f16Stations.js';
import {J16_STORE_DATA,J16_GAME_STATIONS,J16_DEFAULT_PRESETS,j16LoadoutError,normalizeJ16Loadout,sortJ16Weapons} from './j16Weapons.js';
export {J16_GAME_STATIONS,J16_DEFAULT_PRESETS};
import {J10C_STORE_DATA,J10C_EXTRA_STORES,J10C_GAME_STATIONS,J10C_DEFAULT_PRESETS,j10cLoadoutError,normalizeJ10CLoadout,sortJ10CWeapons} from './j10cWeapons.js';
export {J10C_GAME_STATIONS,J10C_DEFAULT_PRESETS};
/**
 * Hangar loadout catalog for the F-16 DeepSeek. Weapon masses are approximate
 * public figures. Release/guidance coefficients for non-AAM stores are gameplay
 * approximations; all expendable weapons feed the unified release system.
 */
export const HANGAR_STORAGE_KEY = 'skyforge.hangar.v1';
export const CHAFF_PER_COMPOSITE = 30;

export const STORE_CATEGORIES = [
  { id: 'missile', label: '空空导弹' },
  { id: 'bomb', label: '常规炸弹' },
  { id: 'guided', label: '制导炸弹' },
  { id: 'antiradar', label: '反辐射' },
  { id: 'cluster', label: '集束炸弹' },
  { id: 'incendiary', label: '燃烧弹' },
  { id: 'agm', label: '空地导弹' },
  { id: 'tank', label: '副油箱' },
  { id: 'pod', label: '瞄准吊舱' },
  { id: 'rocket', label: '火箭弹巢' },
];

export const STORE_TYPES = {
  aim9m: {
    id: 'aim9m', name: 'AIM-9M Sidewinder', short: 'AIM-9M',
    category: 'missile', mass: 85, color: 0xd8d5c9, length: 3.0, radius: 0.065,
  },
  aim9x: {
    id: 'aim9x', name: 'AIM-9X Sidewinder', short: 'AIM-9X',
    category: 'missile', mass: 85, color: 0xdedbd0, length: 3.0, radius: 0.065,
  },
  aim9l: {
    id: 'aim9l', name: 'AIM-9L Sidewinder', short: 'AIM-9L',
    category: 'missile', mass: 85, color: 0xd8d5c9, length: 3.0, radius: 0.065,
    hidden: true,
  },
  aim120c: {
    id: 'aim120c', name: 'AIM-120C-7 AMRAAM', short: 'AIM-120C-7',
    category: 'missile', mass: 152, color: 0xe2dfd2, length: 3.66, radius: 0.089,
    advanced: true,
  },
  aim120c_chaff: {
    id: 'aim120c_chaff', name: 'AIM-120C-7 + Chaff', short: 'AIM-120C+CH',
    category: 'missile', mass: 177, color: 0xe2dfd2, length: 3.66, radius: 0.089,
    advanced: true, composite: true, chaff: 30,
  },
  aim7m: {
    id: 'aim7m', name: 'AIM-7M Sparrow', short: 'AIM-7M',
    category: 'missile', mass: 231, color: 0xd9d6ca, length: 3.66, radius: 0.100,
  },
  mk82: {
    id: 'mk82', name: 'Mk 82 500 lb', short: 'Mk 82',
    category: 'bomb', mass: 241, color: 0x59634e, length: 2.2, radius: 0.1365,
  },
  mk83: {
    id: 'mk83', name: 'Mk 83 1000 lb', short: 'Mk 83',
    category: 'bomb', mass: 447, color: 0x59634e, length: 3.0, radius: 0.178,
  },
  mk84: {
    id: 'mk84', name: 'Mk 84 2000 lb', short: 'Mk 84',
    category: 'bomb', mass: 894, color: 0x555f4a, length: 3.8, radius: 0.2285,
  },
  gbu12: {
    id: 'gbu12', name: 'GBU-12 Paveway II', short: 'GBU-12',
    category: 'guided', mass: 277, color: 0x6b7465, length: 3.3, radius: 0.1365,
  },
  gbu16: {
    id: 'gbu16', name: 'GBU-16 Paveway II', short: 'GBU-16',
    category: 'guided', mass: 564, color: 0x67705f, length: 3.7, radius: 0.178,
  },
  gbu10: {
    id: 'gbu10', name: 'GBU-10 Paveway II', short: 'GBU-10',
    category: 'guided', mass: 1214, color: 0x616a57, length: 4.3, radius: 0.2285,
  },
  mk77: {
    id: 'mk77', name: 'Mk 77 Firebomb', short: 'Mk 77',
    category: 'incendiary', mass: 340, color: 0x8a6234, length: 3.0, radius: 0.30,
  },
  agm65d: {
    id: 'agm65d', name: 'AGM-65D Maverick', short: 'AGM-65D',
    category: 'agm', mass: 218, color: 0x8a8a7f, length: 2.5, radius: 0.1525,
  },
  agm65g: {
    id: 'agm65g', name: 'AGM-65G Maverick', short: 'AGM-65G',
    category: 'agm', mass: 307, color: 0x8a8a7f, length: 2.5, radius: 0.1525,
  },
  agm88: {
    id: 'agm88', name: 'AGM-88B HARM', short: 'AGM-88B',
    category: 'antiradar', mass: 361, color: 0xb8b9ac, length: 4.1, radius: 0.13,
  },
  gbu24: {
    id: 'gbu24', name: 'GBU-24 Paveway III', short: 'GBU-24',
    category: 'guided', mass: 1085, color: 0x616a57, length: 4.4, radius: 0.2285,
  },
  gbu31: {
    id: 'gbu31', name: 'GBU-31 JDAM 2000 lb', short: 'GBU-31',
    category: 'guided', mass: 925, color: 0x5f6855, length: 3.9, radius: 0.2285,
  },
  gbu38: {
    id: 'gbu38', name: 'GBU-38 JDAM 500 lb', short: 'GBU-38',
    category: 'guided', mass: 241, color: 0x5f6855, length: 2.4, radius: 0.1365,
  },
  cbu87: {
    id: 'cbu87', name: 'CBU-87 Cluster Bomb', short: 'CBU-87',
    category: 'cluster', mass: 431, color: 0x55614f, length: 2.8, radius: 0.198,
  },
  cbu97: {
    id: 'cbu97', name: 'CBU-97 Sensor Fuzed', short: 'CBU-97',
    category: 'cluster', mass: 417, color: 0x55614f, length: 2.8, radius: 0.198,
  },
  // Drop-tank fuel (kg): the wiki's 3,090 kg for the full 370+370+300 gal set,
  // split by capacity; `mass` (full tank) is unchanged.
  fuel300: {id:'fuel300', name:'300 gal Centreline Tank',short:'300 GAL',category:'tank',mass:950,fuel:F16_WIKI.aircraft.dropTankFuel*300/1040,color:0x9da49a,length:3.95,radius:.315},
  fuel370: {
    id: 'fuel370', name: '370 gal Drop Tank', short: '370 GAL',
    category: 'tank', mass: 1150, fuel: F16_WIKI.aircraft.dropTankFuel*370/1040, color: 0x9da49a, length: 4.8, radius: 0.34,
  },
  litening: {
    id: 'litening', name: 'LITENING Targeting Pod', short: 'LITENING',
    category: 'pod', mass: 200, color: 0x7b8378, length: 2.1, radius: 0.165,
  },
};
Object.assign(STORE_TYPES,J16_STORE_DATA,J10C_EXTRA_STORES);

for(const [id,store] of Object.entries(STORE_TYPES)){
 const size=STORE_DIMENSIONS[id==='aim120c_chaff'?'aim120c':id==='aim9l'?'aim9m':id];
 if(size)[store.length,store.radius]=size;
}

const WING_STORES = [
  'aim120c', 'aim120c_chaff', 'mk82', 'mk83', 'mk84',
  'gbu12', 'gbu16', 'gbu10', 'gbu24', 'gbu31', 'gbu38',
  'cbu87', 'cbu97', 'mk77', 'agm65d', 'agm65g', 'agm88',
  'fuel370', 'litening',
];

export const STATIONS = [
  { id: 'lt', label: 'L TIP', name: '左翼尖', allowed: ['aim9m', 'aim9x'] },
  { id: 'lo', label: 'L OUT', name: '左外挂', allowed: WING_STORES },
  { id: 'li', label: 'L IN', name: '左内挂', allowed: WING_STORES },
  { id: 'ctr', label: 'CTR', name: '机腹', allowed: WING_STORES },
  { id: 'ri', label: 'R IN', name: '右内挂', allowed: WING_STORES },
  { id: 'ro', label: 'R OUT', name: '右外挂', allowed: WING_STORES },
  { id: 'rt', label: 'R TIP', name: '右翼尖', allowed: ['aim9m', 'aim9x'] },
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

// Station eligibility follows the C-model physical installation.
export const F16CM_STATIONS=F16_STATIONS.map(s=>({id:s.id,label:`STA ${s.number}`,name:({lt:'左翼尖',lo:'左轻载',li:'左重载',tl:'左湿挂点',ctr:'机腹',tr:'右湿挂点',ri:'右重载',ro:'右轻载',rt:'右翼尖',pr:'进气道右侧'})[s.id],allowed:F16_STATION_STORES[s.id]}));

function emptyLoadout() {
  return Object.fromEntries(STATIONS.map((s) => [s.id, null]));
}

function emptyF16CMLoadout() {
  return {
    ...emptyLoadout(),
    tl: null, tr: null, pr: null,
  };
}

export const DEFAULT_PRESETS = [
  {
    name: '制空 / CAP',
    loadout: {
      ...emptyLoadout(),
      lt: 'aim9m', lo: 'aim120c_chaff', li: 'aim120c',
      ctr: 'aim120c', ri: 'aim120c', ro: 'aim120c_chaff', rt: 'aim9m',
    },
  },
  {
    name: '对地 / STRIKE',
    loadout: {
      ...emptyLoadout(),
      lt: 'aim9m', lo: 'agm88', li: 'gbu38',
      ctr: 'fuel370', ri: 'gbu38', ro: 'agm88', rt: 'aim9m',
    },
  },
  {
    name: '混合 / MIXED',
    loadout: {
      ...emptyLoadout(),
      lt: 'aim9x', lo: 'aim120c', li: 'gbu31',
      ctr: 'litening', ri: 'gbu31', ro: 'aim120c', rt: 'aim9x',
    },
  },
];

export const F16CM_DEFAULT_PRESETS = [
  {
    name: '制空 / 6 AAM',
    loadout: {
      ...emptyF16CMLoadout(),
      lt: 'aim9m', lo: 'aim120c', li: 'aim120c',
      ri: 'aim120c', ro: 'aim120c', rt: 'aim9m',
    },
  },
  {
    name: '截击 / 4+2',
    loadout: {
      ...emptyF16CMLoadout(),
      lt: 'aim9m', lo: 'aim120c', li: 'aim120c',
      ri: 'aim120c', ro: 'aim120c', rt: 'aim9m',
    },
  },
  {
    name: '转场 / 3 TANKS',
    loadout: {
      ...emptyF16CMLoadout(),
      lt: 'aim9m', lo: 'aim120c', li: 'aim120c',
      tl: 'fuel370', ctr: 'fuel300', tr: 'fuel370',
      ri: 'aim120c', ro: 'aim120c', rt: 'aim9m',
    },
  },
];

/**
 * Aircraft with an editable hangar loadout, one entry per aircraft id:
 * stations, default presets, validation (error text or null), normalisation,
 * and for aircraft with their own weapon set the store table and slot sort
 * (`stores`, `sort`). Shared code asks hasLoadout(id) / LOADOUT_JETS[id]
 * instead of testing aircraft ids.
 */
export const LOADOUT_JETS = {
  'f16cm-block52': {
    stations: F16CM_STATIONS, presets: F16CM_DEFAULT_PRESETS, error: () => null,
    normalize: normalizeF16Loadout,
  },
  j16: {
    stations: J16_GAME_STATIONS, presets: J16_DEFAULT_PRESETS, error: j16LoadoutError,
    normalize: normalizeJ16Loadout, stores: J16_STORE_DATA, sort: sortJ16Weapons,
  },
  j10c: {
    stations: J10C_GAME_STATIONS, presets: J10C_DEFAULT_PRESETS, error: j10cLoadoutError,
    normalize: normalizeJ10CLoadout, stores: J10C_STORE_DATA, sort: sortJ10CWeapons,
  },
};
export const hasLoadout = (id) => Object.hasOwn(LOADOUT_JETS, id);
/** Catalogue filter: own-weapon-set aircraft get stores tagged with their id, others the untagged F-16 stores. */
export const storeOffered = (store, id) =>
  LOADOUT_JETS[id]?.stores ? !!store.aircraft?.includes(id) : !store.aircraft;

/** Copy a preset in its aircraft's station format (LOADOUT_JETS normalize; generic 7 stations otherwise). */
export function clonePreset(preset, aircraftId) {
  const jet = LOADOUT_JETS[aircraftId];
  return {
    name: preset.name,
    loadout: jet ? jet.normalize(preset.loadout) : { ...emptyLoadout(), ...preset.loadout },
  };
}

export function defaultHangarState() {
  return {
    version: 6,
    aircraft: Object.fromEntries(Object.entries(LOADOUT_JETS).map(([id, jet]) =>
      [id, { active: 0, presets: jet.presets.map((p) => clonePreset(p, id)) }])),
  };
}

export function loadHangarState() {
  try {
    const raw = localStorage.getItem(HANGAR_STORAGE_KEY);
    if (!raw) return defaultHangarState();
    const parsed = JSON.parse(raw);
    if (!parsed?.aircraft) return defaultHangarState();
    // Presets of the retired procedural F-16s are no longer used.
    delete parsed.aircraft['f16-deepseek'];
    for (const [id, jet] of Object.entries(LOADOUT_JETS)) {
      if (!parsed.aircraft[id]?.presets?.length) parsed.aircraft[id] = { active: 0, presets: jet.presets.map((p) => clonePreset(p, id)) };
      parsed.aircraft[id].presets = parsed.aircraft[id].presets.map((p) => ({ ...p, loadout: jet.normalize(p.loadout) }));
    }
    parsed.version=6;
    saveHangarState(parsed);
    return parsed;
  } catch {
    return defaultHangarState();
  }
}

export function saveHangarState(state) {
  try {
    localStorage.setItem(HANGAR_STORAGE_KEY, JSON.stringify(state));
  } catch { /* private mode */ }
}

export function getAircraftHangar(state, aircraftId) {
  if (!state.aircraft[aircraftId]) {
    const presets = LOADOUT_JETS[aircraftId]?.presets ?? DEFAULT_PRESETS;
    state.aircraft[aircraftId] = {
      active: 0,
      presets: presets.map((p) => clonePreset(p, aircraftId)),
    };
  }
  return state.aircraft[aircraftId];
}

export function getActivePreset(state, aircraftId) {
  const hangar = getAircraftHangar(state, aircraftId);
  const preset = hangar.presets[hangar.active] || hangar.presets[0];
  return preset;
}

export function presetMass(preset) {
  let mass = 0;
  for (const storeId of Object.values(preset.loadout || {})) {
    const store = STORE_TYPES[storeId];
    if (store) mass += store.mass;
  }
  return mass;
}

export function presetCounts(preset) {
  const counts = {};
  for (const storeId of Object.values(preset.loadout || {})) {
    if (!storeId) continue;
    counts[storeId] = (counts[storeId] || 0) + 1;
  }
  return counts;
}

/** Convert expendable stores into the unified weapon slots. Pods/tanks stay separate. */
export function missileLoadoutFromPreset(preset, config) {
  const counts = presetCounts(preset);
  // Aircraft with their own weapon set (J-16 / J-10C): its stores, its pylon mass.
  const jet=LOADOUT_JETS[config.id];
  if(jet?.stores){
    const loadout=jet.normalize(preset.loadout);config.visual.loadout=loadout;
    const ownCounts=presetCounts({loadout});
    config.mass.stores=(config.armament.pylonMass??160)+Object.values(loadout).reduce((n,id)=>n+(jet.stores[id]?.mass||0),0);
    config.armament.externalTanks=Object.entries(loadout).filter(([,id])=>jet.stores[id]?.category==='tank').map(([station,id])=>({station,id,mass:jet.stores[id].mass,fuel:jet.stores[id].fuel||0}));
    return jet.sort(Object.values(jet.stores).filter(w=>!w.pod&&w.category!=='tank'&&ownCounts[w.id]).map(w=>({...w,count:ownCounts[w.id]*(w.rounds||1)})));
  }
  const entries = [];
  const compositeCount = counts.aim120c_chaff || 0;
  const irCount = (counts.aim9m || 0) + (counts.aim9x || 0) +
    (counts.aim9l || 0);
  for (const base of config.armament.missileLoadout || []) {
    let count = counts[base.type] || 0;
    if (base.type === 'aim120c') count += compositeCount;
    if (base.type === 'aim9m') count = irCount;
    if (count > 0) entries.push({ ...base, count });
  }
  // The composite pylon carries a normal AIM-120C plus a chaff dispenser.
  config.armament.chaffPods = compositeCount;
  config.armament.chaffPerPod = CHAFF_PER_COMPOSITE;
  if (irCount && !entries.some((entry) => entry.type === 'aim9m')) {
    entries.push({
      ...config.armament.missiles,
      type: 'aim9m',
      name: 'AIM-9M Sidewinder',
      count: irCount,
    });
  }
  for(const [id,count]of Object.entries(counts)){
    const store=STORE_TYPES[id];if(!store||store.aircraft||['missile','tank','pod'].includes(store.category))continue;
    const bomb=['bomb','cluster','incendiary'].includes(store.category),glide=store.category==='guided',emitter=store.category==='antiradar';
    entries.push({...store,type:id,count,targetType:emitter?'emitter':'ground',guidance:emitter?'antiRadiation':bomb?'unguided':'ground',
      irSeeker:false,radar:emitter,lockAngle:60*Math.PI/180,lockRange:emitter?100000:60000,maxRange:emitter?100000:bomb?20000:60000,
      boostTime:bomb||glide?0:3,boostAccel:bomb||glide?0:150,sustainTime:bomb||glide?0:8,sustainAccel:bomb||glide?0:35,
      maxG:glide?5:15,damage:Math.min(1800,store.mass*(bomb||glide?2:1)),proximity:3,blastRadius:Math.min(150,20+Math.sqrt(store.mass)*3),
      drag:glide?.000018:bomb?.00011:.00006,ballistic:bomb,glide,guidanceTime:glide?300:180,statLimits:true,
      selfDestructSpeed:0,energyFloor:.035,coefficientPolicy:'Authored gameplay coefficients; not sourced performance claims'});
  }
  config.armament.trackStoreMass=true;config.armament.pylonMass=160;
  config.armament.externalTanks=Object.entries(preset.loadout||{}).filter(([,id])=>STORE_TYPES[id]?.category==='tank').map(([station,id])=>({station,id,mass:STORE_TYPES[id].mass,fuel:STORE_TYPES[id].fuel||0}));
  config.mass.stores=160+presetMass(preset);
  return entries;
}
