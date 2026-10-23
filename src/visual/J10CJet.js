import * as T from '../../vendor/three.module.js';
import {loadJ10CModel,poseJ10C,paintJ10C} from './J10CModel.js';
import {addJ10CEffects,updateJ10CEffects} from './J10CEffects.js';
import {setJ10CLoadout,buildTaggedStore} from './J10CStores.js';
import {J10C_STORE_DATA,J10C_DEFAULT_PRESETS} from '../data/j10cWeapons.js';
import {selectMountedStore,commitMountedRelease,detachMountedStores} from './storeRelease.js';
const clamp=T.MathUtils.clamp,meta=o=>o.userData.exportExtras||o.userData;
// Game paint ids -> paintJ10C modes ('service' is the weathered PLAAF service grey;
// paintJ10C's own 'base' mode means the raw model materials). Labels live in the config (visual.paints).
export const J10C_PAINTS={service:{mode:'service'},bayi:{mode:'bayi'}};
// The reference photo is the contracted dry nozzle; only augmentation opens it.
const nozzleOpening=ab=>T.MathUtils.smoothstep(ab,0,1);

// Game-side J-10C: the articulated white model with livery, stores and runtime
// effects, driven by the shared flight/systems state. Same interface as J16Jet.
export class J10CJet{
 constructor(config,{isPlayer=false}={}){
  this.config=config;this.isPlayer=isPlayer;this.group=new T.Group();this.group.name='jet-j10c-'+(isPlayer?'player':'showcase');
  this.parts={wingTips:[new T.Vector3(-4.86,-.62,4.30),new T.Vector3(4.86,-.62,4.30)],nozzleLocal:[new T.Vector3(0,-.30,7.62)],muzzle:new T.Vector3(...config.armament.cannon.muzzle)};
  this.loadout=config.visual.loadout||J10C_DEFAULT_PRESETS[0].loadout;this.paint=config.visual.paint||'bayi';this.cockpitView=false;this.wheelSpin=0;this.time=0;this.nozzle=0;this.disposed=false;this.stores=[];this.releaseState={};
  this.ready=this._load();
 }
 async _load(){
  const root=await loadJ10CModel();if(this.disposed){this._disposeObject(root);return;}
  this.airframe=root;this.setPaint(this.paint);addJ10CEffects(root);
  const m=meta(root);if(m.gunMuzzle){this.parts.muzzle.fromArray(m.gunMuzzle);this.config.armament.cannon.muzzle=m.gunMuzzle.slice();}
  if(m.nozzleExit)this.parts.nozzleLocal[0].fromArray(m.nozzleExit.centre);
  this.group.add(root);this.setVisualLoadout(this.loadout);
  this.dragChute=new T.Group();this.dragChute.name='J10C_drag_chute';this.dragChute.visible=false;root.add(this.dragChute);
  for(let i=0;i<8;i++){const canopy=new T.Mesh(new T.SphereGeometry(1.7,3,10,i*Math.PI/4,Math.PI/4,0,Math.PI/2).rotateX(Math.PI/2).translate(0,.70,12.6),new T.MeshStandardMaterial({color:i%2?0xc8202c:0xeef1f4,roughness:1,side:T.DoubleSide}));this.dragChute.add(canopy);
   const a=i*Math.PI/4,points=[new T.Vector3(0,.70,7.95),new T.Vector3(1.7*Math.cos(a),.70+1.7*Math.sin(a),12.6)];this.dragChute.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xa7a59a})));}
  if(this.lastSync)this.sync(...this.lastSync);
 }
 setPaint(paint){this.paint=J10C_PAINTS[paint]?paint:'bayi';if(!this.airframe)return;paintJ10C(this.airframe,J10C_PAINTS[this.paint].mode);this.airframe.userData.paintMode=this.paint;}
 setVisualLoadout(loadout){this.loadout={...(loadout||J10C_DEFAULT_PRESETS[0].loadout)};if(!this.airframe)return;setJ10CLoadout(this.airframe,this.loadout);this.stores=[];this.releaseState={};
  const rig=this.airframe.getObjectByName('J10C_external_stores');
  for(const station of rig.children){const group=station.children.find(o=>meta(o).storeId);if(!group)continue;const id=meta(group).storeId,cfg=J10C_STORE_DATA[id],parts=cfg?.bundleOf?group.children.filter(o=>meta(o).storeId):[group];
   for(const part of parts)this.stores.push({group:part,type:id,storeId:id,station:meta(station).station,x:meta(station).position[0],rounds:cfg?.rounds||1,remaining:cfg?.category==='rocket'?cfg.rounds:1,released:false});}
 }
 releaseExternalTanks(stations){
  this.group.updateMatrixWorld(true);
  return detachMountedStores(this.stores,stations,store=>J10C_STORE_DATA[store.storeId]?.category==='tank');
 }
 getMissileLaunchPose(type){if(!this.airframe)return null;const cfg=J10C_STORE_DATA[type];if(cfg?.category==='tank')return null;const store=selectMountedStore(this.stores,type,this.releaseState);if(!store)return null;
  this.group.updateMatrixWorld(true);const position=store.group.getWorldPosition(new T.Vector3()),localPosition=this.group.worldToLocal(position.clone());this.pendingLaunch=store;
  return {position,localPosition,storeId:type,station:store.station,releaseMode:cfg?.ballistic||cfg?.glide?'drop':cfg?.category==='rocket'||cfg?.category==='missile'&&['pl8b','pl10'].includes(type)?'rail':'eject'};
 }
 createCadMissileMesh(type){const store=this.pendingLaunch;this.pendingLaunch=null;const cfg=J10C_STORE_DATA[type];
  if(store)commitMountedRelease(store,this.releaseState);
  if(store&&cfg?.category!=='rocket'){store.released=true;store.group.parent?.remove(store.group);store.group.visible=true;store.group.position.set(0,0,0);store.group.quaternion.identity();store.group.userData.length=cfg.length;return store.group;}
  if(cfg?.category==='rocket'){const spec={label:cfg.name,length:1.15,r:.045,family:'short',span:.10},g=buildTaggedStore(type+'_round',spec);g.userData.length=spec.length;return g;}
  const g=buildTaggedStore(type);g.userData.length=cfg?.length||3;return g;
 }
 sync(dt,flight,systems,weapons,options={}){
  this.lastSync=[0,flight,systems,weapons,options];this.group.position.copy(options.position||flight.position);this.group.quaternion.copy(options.orientation||flight.orientation);if(!this.airframe)return;
  this.time+=Math.max(0,dt);this.group.updateMatrixWorld(true);
  const s=flight.control?.surfaces||{},aero=this.config.aero,onGround=!!options.onGround,speed=flight.tas||flight.velocity?.length?.()||0,ab=flight.afterburner||0;
  this.wheelSpin+=onGround?speed*dt/.29:0;
  const pitch=clamp((s.elevator||0)/aero.elevatorMax,-1,1),target=nozzleOpening(ab);
  this.nozzle=dt>0?T.MathUtils.lerp(this.nozzle,target,1-Math.exp(-6*dt)):target;
  const nozzle=this.nozzle;
  poseJ10C(this.airframe,{gear:systems.gear??1,canopy:systems.canopy||0,canards:pitch*.8,slats:Math.max(systems.flaps||0,clamp((flight.alpha||0)/.45,0,1)),
   pitch,roll:clamp((s.aileron||0)/aero.aileronMax,-1,1),yaw:clamp((s.rudder||0)/aero.rudderMax,-1,1),airbrake:systems.airbrake||0,nozzle,
   steer:onGround?clamp(s.rudder||0,-1,1):0,compression:0,   // tyres stay at the physics contact height (2.30)
wheelSpin:this.wheelSpin,parachute:systems.parachute?1:0,probe:0});
  if(weapons?.missileRemaining&&!options.showcase)for(const store of this.stores){if(store.released)continue;store.group.visible=!weapons.jettisonedStations?.[store.station];}
  // Shared afterburner shader: blue while lighting, orange at full afterburner.
  updateJ10CEffects(this.airframe,{afterburner:ab,nozzle,pressure:flight.air?.pressure,firing:!!options.gunFiring&&!this.cockpitView},this.time);
  if(this.dragChute)this.dragChute.visible=onGround&&!!systems.parachute;
  this.setCockpitView(options.cockpit??this.cockpitView);
 }
 // No cockpit interior pass yet: the external model stays visible.
 setCockpitView(active){this.cockpitView=!!active;}
 get cockpitEyeLocal(){return new T.Vector3(0,.95,-4.75);}
 getCockpitEye(out=new T.Vector3()){this.group.updateMatrixWorld(true);return out.copy(this.cockpitEyeLocal).applyMatrix4(this.group.matrixWorld);}
 getMuzzleWorld(out=new T.Vector3()){return out.copy(this.parts.muzzle).applyMatrix4(this.group.matrixWorld);}
 getNozzleWorld(out=new T.Vector3()){return out.copy(this.parts.nozzleLocal[0]).applyMatrix4(this.group.matrixWorld);}
 _disposeObject(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material){ms.add(o.material);for(const key of ['baseMaterial','paintMaterial','zoneMaterial','liveryMaterial','serviceMaterial'])if(o.userData[key])ms.add(o.userData[key]);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
 dispose(){this.disposed=true;if(this.airframe)this._disposeObject(this.airframe);this.group.clear();}
}
