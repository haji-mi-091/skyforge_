import * as T from '../../vendor/three.module.js';
import {loadJ16Model,poseJ16,paintJ16,whenJ16SkinReady} from './J16Model.js';
import {setJ16Loadout,buildJ16Weapon,J16_WEAPONS} from './J16Stores.js';
import {J16Systems,j16NozzleOpening} from './J16Systems.js';
import {J16_STORE_DATA,J16_DEFAULT_PRESETS} from '../data/j16Weapons.js';
import {selectMountedStore,commitMountedRelease,detachMountedStores} from './storeRelease.js';
const clamp=T.MathUtils.clamp,meta=o=>o.userData.exportExtras||o.userData;
// Game paint ids -> paintJ16 modes ('service' is the weathered PLAAF grey, 'camo' the
// silver camouflage; paintJ16's own 'base' mode means the raw CAD materials). Other
// values (e.g. config default 'weathered') pass through unchanged.
const J16_PAINTS={service:{mode:'weathered'},camo:{mode:'camo'}};
const SKINNED=new Set(['weathered','camo']);   // modes that need the skin textures loaded
const j16PaintMode=paint=>J16_PAINTS[paint]?.mode||paint||'weathered';
export class J16Jet{
 constructor(config,{isPlayer=false}={}){
  this.config=config;this.isPlayer=isPlayer;this.group=new T.Group();this.group.name='jet-j16-'+(isPlayer?'player':'showcase');this.parts={wingTips:[new T.Vector3(-7.26,-.88,5.12),new T.Vector3(7.26,-.88,5.12)],nozzleLocal:[new T.Vector3(-1.075,-1.14,9.21),new T.Vector3(1.075,-1.14,9.21)],muzzle:new T.Vector3(...config.armament.cannon.muzzle)};this.cadGearDoors=[];this.loadout=config.visual.loadout||J16_DEFAULT_PRESETS[0].loadout;this.cockpitView=false;this.wheelSpin=0;this.disposed=false;
  this.ready=this._load();
 }
 async _load(){
  const root=await loadJ16Model();if(this.disposed){this._disposeObject(root);return;}
  const paint=j16PaintMode(this.config.visual.paint);
  if(SKINNED.has(paint)){await whenJ16SkinReady();if(this.disposed){this._disposeObject(root);return;}}
  this.airframe=root;paintJ16(root,paint);this.systems=new J16Systems(root,null);this.parts.muzzleFlash=this.systems.gun;
  this.parts.muzzle.copy(this.systems.gunMount);this.config.armament.cannon.muzzle=this.parts.muzzle.toArray();
  this.group.add(root);this.setVisualLoadout(this.loadout);await this.systems.ready;if(this.disposed)return;
  this.dragChute=new T.Group();this.dragChute.name='J16_drag_chute';this.dragChute.visible=false;root.add(this.dragChute);
  for(let i=0;i<8;i++){const canopy=new T.Mesh(new T.SphereGeometry(2,3,10,i*Math.PI/4,Math.PI/4,0,Math.PI/2).rotateX(Math.PI/2).translate(0,-.6,16),new T.MeshStandardMaterial({color:i%2?0xb6a589:0xd8d7c8,roughness:1,side:T.DoubleSide}));canopy.userData.exportExtras={workZone:'tail'};this.dragChute.add(canopy);const a=i*Math.PI/4,points=[new T.Vector3(0,-.6,10.85),new T.Vector3(2*Math.cos(a),-.6+2*Math.sin(a),16)];this.dragChute.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xa7a59a})));}
  if(this.lastSync)this.sync(...this.lastSync);this.setCockpitView(this.cockpitView);
 }
 // Hangar livery switch (same role as J10CJet.setPaint): repaint, then rebuild the
 // stores so the pylons take the livery's colours.
 setPaint(paint){this.config.visual.paint=paint;if(!this.airframe)return;const mode=j16PaintMode(paint);
  (SKINNED.has(mode)?whenJ16SkinReady():Promise.resolve()).then(()=>{if(this.disposed||!this.airframe)return;paintJ16(this.airframe,mode);this.setVisualLoadout(this.loadout);});}
 setVisualLoadout(loadout){this.loadout={...(loadout||J16_DEFAULT_PRESETS[0].loadout)};if(!this.airframe)return;setJ16Loadout(this.airframe,this.loadout);this.stores=[];this.releaseState={};
  const rig=this.airframe.getObjectByName('J16_external_stores');for(const station of rig.children){const group=station.children.find(o=>meta(o).storeId);if(group){const id=meta(group).storeId,groups=J16_STORE_DATA[id]?.bundleOf?group.children.filter(o=>meta(o).storeId):[group];for(const part of groups)this.stores.push({group:part,type:id,storeId:id,station:meta(station).station,x:meta(station).position[0],rounds:J16_STORE_DATA[id]?.rounds||1,remaining:J16_STORE_DATA[id]?.category==='rocket'?J16_STORE_DATA[id].rounds:1,released:false});}}
 }
 releaseExternalTanks(stations){
  this.group.updateMatrixWorld(true);
  return detachMountedStores(this.stores,stations,store=>J16_STORE_DATA[store.storeId]?.category==='tank');
 }
 getMissileLaunchPose(type,remainingAfter){if(!this.airframe)return null;const cfg=J16_STORE_DATA[type];if(cfg?.category==='tank')return null;const store=selectMountedStore(this.stores,type,this.releaseState);if(!store)return null;
  this.group.updateMatrixWorld(true);const position=store.group.getWorldPosition(new T.Vector3()),localPosition=this.group.worldToLocal(position.clone());this.pendingLaunch=store;
  return {position,localPosition,storeId:type,station:store.station,releaseMode:cfg?.ballistic||cfg?.glide?'drop':cfg?.category==='rocket'||cfg?.category==='missile'&&['pl8b','pl10'].includes(type)?'rail':'eject'};
 }
 createCadMissileMesh(type){const store=this.pendingLaunch;this.pendingLaunch=null;const cfg=J16_STORE_DATA[type];
  if(store)commitMountedRelease(store,this.releaseState);
  if(store&&cfg?.category!=='rocket'){store.released=true;store.group.parent?.remove(store.group);store.group.visible=true;store.group.position.set(0,0,0);store.group.quaternion.identity();store.group.userData.length=cfg.length;return store.group;}
  if(cfg?.category==='rocket'){const id=type+'_round';J16_WEAPONS[id]??={label:cfg.name,length:type==='type90'?1.15:2.9,r:type==='type90'?.045:.061,family:'short',span:.10};const g=buildJ16Weapon(id);g.userData.length=J16_WEAPONS[id].length;return g;}
  const g=buildJ16Weapon(type);g.userData.length=cfg?.length||3;return g;
 }
 sync(dt,flight,systems,weapons,options={}){
  this.lastSync=[0,flight,systems,weapons,options];this.group.position.copy(options.position||flight.position);this.group.quaternion.copy(options.orientation||flight.orientation);if(!this.airframe)return;
  this.group.updateMatrixWorld(true);const s=flight.control?.surfaces||{},onGround=!!options.onGround,speed=flight.tas||flight.velocity?.length()||0,throttle=Math.min(1,flight.engineSpool||0)+.1*(flight.afterburner||0);this.wheelSpin+=onGround?speed*dt/.46:0;
  const slats=Math.max(systems.flaps||0,clamp((flight.alpha||0)/.45,0,1)),flaps=systems.flaps||0;
  poseJ16(this.airframe,{gear:systems.gear??1,canopy:systems.canopy||0,flaps,slats,pitch:clamp((s.elevator||0)/.40,-1,1),yaw:clamp((s.rudder||0)/.38,-1,1),airbrake:systems.airbrake||0,nozzle:j16NozzleOpening(throttle),steer:onGround?clamp(s.rudder||0,-1,1):0,wheelSpin:this.wheelSpin,parachute:systems.parachute?1:0});
  this.airframe.traverse(o=>{const d=meta(o);if(d.role==='flaperon')o.rotateOnAxis(new T.Vector3(...d.axis).normalize(),-(s.aileron||0)*.55);});
  if(weapons?.missileRemaining&&!options.showcase)for(const store of this.stores){if(store.released)continue;store.group.visible=!weapons.jettisonedStations?.[store.station];}
  this.systems.fireGun(!!options.gunFiring&&!this.cockpitView);this.systems.update(dt,{throttle,pressure:flight.air?.pressure});
  if(this.dragChute)this.dragChute.visible=onGround&&!!systems.parachute;
  this.setCockpitView(options.cockpit??this.cockpitView);
 }
 setCockpitView(active){this.cockpitView=!!active;if(!this.airframe)return;this.airframe.traverse(o=>{if(o.name.startsWith('seat_0_')&&/back|headbox/.test(o.name))o.visible=!active;});if(active)this.systems.gun.visible=false;}
 get cockpitEyeLocal(){return new T.Vector3(0,1.02,-5.73);}
 getCockpitEye(out=new T.Vector3()){this.group.updateMatrixWorld(true);return out.copy(this.cockpitEyeLocal).applyMatrix4(this.group.matrixWorld);}
 getMuzzleWorld(out=new T.Vector3()){return out.copy(this.parts.muzzle).applyMatrix4(this.group.matrixWorld);}
 getNozzleWorld(out=new T.Vector3()){return out.copy(this.parts.nozzleLocal[0]).applyMatrix4(this.group.matrixWorld);}
 _disposeObject(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){ms.add(o.material);for(const key of ['baseMaterial','paintMaterial','zoneMaterial','weatheredMaterial','camoMaterial'])if(o.userData[key])ms.add(o.userData[key]);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
 dispose(){this.disposed=true;if(this.airframe){this.systems.dispose();this._disposeObject(this.airframe);}this.group.clear();}
}
