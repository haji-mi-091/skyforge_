import * as T from '../../vendor/three.module.js';
import {buildJ16Weapon,J16_WEAPONS} from './J16Stores.js';
import {J10C_GAME_STATIONS,J10C_STORE_DATA} from '../data/j10cWeapons.js';
import {SKIN_ENV_INTENSITY,SKIN_WEATHER_GLSL} from './skinFinish.js';

// Eleven J-10C hardpoints (War Thunder slot order, left wing tip -> right wing
// tip) placed on the white model: three under each wing, two in tandem under
// each intake corner and one on the centreline, clear of the gear doors.
// Positions are visual authoring values in model metres.
const PLACE={LT:[-3.95,3.80,'wing'],LO:[-3.00,3.15,'wing'],LI:[-2.05,2.35,'heavy'],LA:[-.55,3.15,'belly'],LF:[-.62,-1.40,'belly'],C:[0,.95,'belly'],
 RF:[.62,-1.40,'belly'],RA:[.55,3.15,'belly'],RI:[2.05,2.35,'heavy'],RO:[3.00,3.15,'wing'],RT:[3.95,3.80,'wing']};
export const J10C_STATIONS=J10C_GAME_STATIONS.map(s=>({id:s.id,label:s.name,x:PLACE[s.id][0],z:PLACE[s.id][1],kind:PLACE[s.id][2]}));
// J-10C-only stores (Type 90-1 ×7) get their visual dimensions here; shared
// stores use the J-16 table as-is.
const J10C_WEAPONS=Object.fromEntries(Object.values(J10C_STORE_DATA).filter(w=>!J16_WEAPONS[w.id]).map(w=>[w.id,{label:w.name,length:w.length,r:w.radius,family:w.family,span:w.span}]));
// Builds any store tagged with store.aircraft: the shared J-16 weapon set plus the
// J-10C-only Type 90-1 ×7 and drop tanks. Used by the J-10C rig and by the hangar
// weapon display for every own-weapon-set aircraft.
export function buildTaggedStore(id,spec=J16_WEAPONS[id]??J10C_WEAPONS[id]){return spec?.family==='tank'?buildJ10CDropTank(id,spec):buildJ16Weapon(id,spec);}

const mat=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
// Drop-tank skin: PLAAF light grey with the shared anti-washout finish (skinFinish.js:
// SKIN_ENV_INTENSITY, skinWeather mottle/streaks/underside, skinGrime roughness),
// darker joint seams at the nose cap, mid section and tail cone, and a filler cap on
// top. Works in tank-local metres (z along the tank, -Z nose), so it needs no UVs.
// A new material per tank (each Jet disposes its own); the program cache key
// shares the compiled shader per tank size (seam stations scale with the length).
function tankSkin(id,L){
 const m=new T.MeshStandardMaterial({color:0x969ea2,metalness:.10,roughness:.64,envMapIntensity:SKIN_ENV_INTENSITY});m.name='J10C drop tank skin';
 m.onBeforeCompile=s=>{
  s.uniforms.uTankLen={value:L};
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTankP;varying vec3 vTankN;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvTankP=position;vTankN=normal;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTankP;varying vec3 vTankN;uniform float uTankLen;\n'+SKIN_WEATHER_GLSL)
   .replace('#include <color_fragment>',`#include <color_fragment>
 vec3 tp=vTankP;float hl=uTankLen*.5;
 float seam=0.;for(int i=0;i<3;i++){float st=-hl+uTankLen*(i==0?.16:i==1?.50:.76);seam=max(seam,1.-smoothstep(.004,.011,abs(tp.z-st)));}
 float cap=(1.-smoothstep(.045,.06,length(vec2(tp.x,tp.z+uTankLen*.12))))*step(.6,normalize(vTankN).y);
 diffuseColor.rgb*=skinWeather(tp,vTankN,99.)*.94*(1.-.32*seam)*(1.-.45*cap);`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor+.16*skinGrime(vTankP)-.06,.55,.88);');
 };
 m.customProgramCacheKey=()=>'j10c-drop-tank-skin-v1-'+id;
 return m;
}
// Drop tank (1600 L / 800 L): ogive nose, parallel body, boat tail, as one lathe.
// Nose toward -Z like the other stores; dimensions from j10cWeapons.js.
function buildJ10CDropTank(id,w){
 const root=new T.Group();root.name=id;root.userData.exportExtras={storeId:id,label:w.label,visualDimensions:w};
 const {length:L,r}=w,n=-L/2,a=L/2;
 const profile=[[n,0],[n+.06*L,r*.42],[n+.16*L,r*.82],[n+.28*L,r],[a-.24*L,r],[a-.08*L,r*.62],[a-.01*L,r*.2],[a,0]];
 const body=new T.Mesh(new T.LatheGeometry(profile.map(([z,rad])=>new T.Vector2(rad,z)),40).rotateX(Math.PI/2),tankSkin(id,L));
 body.name=id+'_body';body.userData.exportExtras={storeId:id,part:'body'};body.userData.baseMaterial=body.material;root.add(body);
 return root;
}
const box=(x,y,z,p)=>new T.BoxGeometry(x,y,z).translate(...p);
function supportMeshes(airframe){const out=[];airframe.traverse(o=>{if(o.isMesh&&/^(fuselage_(nose|mid|tail)|wing_[LR]_fixed|wing_tip_|wing_root_lower|leading_edge_flap_|nose_bay_frame|main_bay_frame)/.test(o.name))out.push(o);});return out;}
// Tapered pylon blade between the skin contact line and the store's crutch.
function blade(x,top,bottom,fore,aft){
 const p=[[top[0],fore],[top[1],aft],[bottom,aft+.10],[bottom,fore-.12]],g=new T.BufferGeometry(),pos=[],t=.045;
 for(const s of [-t,t])for(const [y,z]of p)pos.push(x+s,y,z);
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);g.computeVertexNormals();return g;
}
export function buildJ10CStores(airframe,loadout={}){
 const root=new T.Group();root.name='J10C_external_stores';root.userData.exportExtras={stationCount:J10C_STATIONS.length};
 airframe.updateMatrixWorld(true);const surfaces=supportMeshes(airframe),ray=new T.Raycaster(),inv=airframe.matrixWorld.clone().invert();
 const pylonMat=mat(0xb9c0c4,.05,.7),railMat=mat(0x6f7a80,.35,.58);pylonMat.name='J10C pylon';pylonMat.side=T.DoubleSide;railMat.name='J10C launcher rail';
 const floor=(x,z)=>{ray.set(new T.Vector3(x,-6,z).applyMatrix4(airframe.matrixWorld),new T.Vector3(0,1,0).transformDirection(airframe.matrixWorld));
  const hit=ray.intersectObjects(surfaces).map(h=>h.point.clone().applyMatrix4(inv)).find(p=>p.y<.2);if(!hit)throw new Error(`No J-10C hardpoint support at ${x},${z}`);return hit.y;};
 for(const s of J10C_STATIONS){
  const group=new T.Group();group.name='station_'+s.id;group.userData.exportExtras={station:s.id,label:s.label,kind:s.kind};root.add(group);
  const id=loadout[s.id],w=id&&(J16_WEAPONS[id]??J10C_WEAPONS[id]),r=w?.r??.1,drop=s.kind==='heavy'?.40:s.kind==='wing'?.30:.22;
  const fore=s.z-.45,aft=s.z+.45,fy=floor(s.x,fore),ay=floor(s.x,aft),top=Math.min(fy,ay),y=top-drop-r,bottom=y+r+.02;
  const pylon=new T.Mesh(blade(s.x,[fy+.01,ay+.01],bottom,fore,aft),pylonMat);pylon.name='pylon_'+s.id;pylon.userData.exportExtras={station:s.id,part:'pylon'};group.add(pylon);
  const rail=new T.Mesh(box(.09,.06,1.25,[s.x,bottom-.02,s.z]),railMat);rail.name='launcher_'+s.id;rail.userData.exportExtras={station:s.id,part:'launcher'};group.add(rail);
  group.userData.exportExtras.position=[s.x,y,s.z];
  if(id){const weapon=buildTaggedStore(id);weapon.position.set(s.x,y,s.z);group.add(weapon);}
 }
 root.traverse(o=>{if(o.isMesh)o.userData.baseMaterial=o.material;});return root;
}
export function setJ10CLoadout(airframe,loadout){
 const old=airframe.getObjectByName('J10C_external_stores');if(old){old.parent.remove(old);const ms=new Set();old.traverse(o=>{if(o.isMesh){o.geometry.dispose();ms.add(o.material);}});ms.forEach(m=>m.dispose());}
 const stores=buildJ10CStores(airframe,loadout);airframe.add(stores);airframe.updateMatrixWorld(true);return stores;
}
