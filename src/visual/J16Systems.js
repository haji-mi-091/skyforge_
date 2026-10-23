import * as T from '../../vendor/three.module.js';
import {createF100Exhaust,exhaustBlueMix} from './F16Exhaust.js';
import {createVfxPlume,updateVfxPlume,disposeVfxPlume,whenVfxReady} from './VfxAtlas.js';
import {J16_WEAPONS} from './J16Stores.js';

const clamp=T.MathUtils.clamp,smooth=(x,a,b)=>T.MathUtils.smoothstep(x,a,b),meta=o=>o.userData.exportExtras||o.userData;
export function j16NozzleOpening(throttle){const t=clamp(throttle,0,1.1);return t>1?.22+.78*smooth(t,1,1.1):.80-.58*smooth(t,.2,1);}
export function j16NozzleExit(root,side){
 const feather=root.getObjectByName('nozzle_'+(side<0?'L':'R')+'_feather_0'),p=feather.geometry.attributes.position,inv=root.matrixWorld.clone().invert();let r=0,z=0,count=0;
 for(let i=0;i<p.count;i++)if(p.getZ(i)>.779){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(feather.matrixWorld).applyMatrix4(inv);r+=Math.hypot(v.x-side*1.075,v.y+1.14);z+=v.z;count++;}
 return {radius:r/count-.004,z:z/count};
}

/** Attached effects and detachable visual stores. No target guidance or damage
 * is simulated here; the future combat adapter supplies those state changes. */
export class J16Systems{
 constructor(root,scene){
  this.root=root;this.scene=scene;this.time=0;this.shots=[];this.fired=[];this.gunFiring=false;this.gunPhase=0;this.shotCount=0;
  this.effects=new T.Group();this.effects.name='J16_attached_effects';root.add(this.effects);
  this.exhausts=[-1,1].map(side=>{const g=createF100Exhaust();g.name='J16_'+(side<0?'L':'R')+'_blue_orange_exhaust';g.position.set(side*1.075,-1.14,8.43);g.traverse(o=>{if(o.isMesh){o.userData.exportExtras={effect:true,workZone:'tail'};o.userData.baseMaterial=o.material;}});this.effects.add(g);return {side,group:g};});
  this.gun=createVfxPlume(0);this.gun.name='J16_30mm_attached_texture_flash';this.effects.add(this.gun);
  this.gun.traverse(o=>{if(o.isMesh){o.userData.exportExtras={effect:true,workZone:'mid'};o.userData.baseMaterial=o.material;}});
  // Starboard forward wing-root gun port, fitted to the visible shell by rays.
  const skin=[];root.traverse(o=>{if(o.isMesh&&/^(J16_fixed_fuselage_|wing_root_)/.test(o.name))skin.push(o);});root.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(5,-.43,-2.45).applyMatrix4(root.matrixWorld),new T.Vector3(-1,0,0).transformDirection(root.matrixWorld)),hit=ray.intersectObjects(skin)[0];
  this.gunMount=hit?root.worldToLocal(hit.point.clone()).add(new T.Vector3(.025,0,0)):new T.Vector3(1.12,-.43,-2.45);
  this.gun.position.copy(this.gunMount);this.gun.rotation.y=Math.PI;this.gun.rotation.x=-.025;
  const port=new T.Mesh(new T.CylinderGeometry(.052,.052,.11,20).rotateX(Math.PI/2),new T.MeshStandardMaterial({color:0x22292a,metalness:.7,roughness:.5}));
  port.name='J16_30mm_muzzle_port';port.userData.exportExtras={material:'metal',workZone:'mid'};port.userData.baseMaterial=port.material;port.position.copy(this.gunMount).add(new T.Vector3(0,0,.035));this.effects.add(port);
  this.ready=whenVfxReady();
 }
 fireGun(on){this.gunFiring=!!on;}
 launch(stationId){
  const station=this.root.getObjectByName('station_'+stationId);if(!station)return null;
  const weapon=station.children.find(o=>meta(o).storeId);if(!weapon)return null;
  const id=meta(weapon).storeId,w=J16_WEAPONS[id];if(['bomb','pod'].includes(w.family))return null;
  this.root.updateMatrixWorld(true);const position=weapon.getWorldPosition(new T.Vector3()),orientation=weapon.getWorldQuaternion(new T.Quaternion());
  // Move the exact mounted mesh, preserving its world pose at the boundary.
  const mountPosition=weapon.position.clone(),mountQuaternion=weapon.quaternion.clone();
  station.remove(weapon);this.scene.add(weapon);weapon.position.copy(position);weapon.quaternion.copy(orientation);
  const plume=createVfxPlume(2);plume.name='J16_'+id+'_motor_texture';plume.position.z=w.length/2-.045;weapon.add(plume);
  const rail=station.userData.exportExtras?.kind==='tip'||['PL10','PL8B'].includes(id);
  const item={weapon,plume,id,stationId,mountPosition,mountQuaternion,origin:position.clone(),orientation:orientation.clone(),age:0,mode:rail?'rail':'eject',ignition:rail?.035:.24,forward:new T.Vector3(0,0,-1).applyQuaternion(orientation),down:new T.Vector3(0,-1,0).applyQuaternion(orientation)};
  this.shots.push(item);this.fired.push(item);return item;
 }
 resetLaunches(){
  for(const shot of this.fired){disposeVfxPlume(shot.plume);const station=this.root.getObjectByName('station_'+shot.stationId);if(station){station.add(shot.weapon);shot.weapon.position.copy(shot.mountPosition);shot.weapon.quaternion.copy(shot.mountQuaternion);shot.weapon.visible=true;}else{shot.weapon.parent?.remove(shot.weapon);shot.weapon.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}}
  this.shots=[];this.fired=[];
 }
 update(dt,{throttle=0,pressure=101325}={}){
  this.time+=Math.max(0,dt);this.root.updateMatrixWorld(true);
  const ab=clamp((throttle-1)/.1,0,1),dry=smooth(throttle,.55,1),blue=exhaustBlueMix(ab);
  for(const {side,group}of this.exhausts){
   const exit=j16NozzleExit(this.root,side),u=group.userData.exhaust.uniforms,diameter=exit.radius*2,expansion=Math.pow(101325/clamp(pressure,15000,115000),.12);
   group.visible=throttle>.55;u.uTime.value=this.time+(side>0?.37:0);u.uBlueMix.value=blue;u.uPower.value=(.18*dry+.30*ab);u.uRadius.value=exit.radius;u.uBarrelRadius.value=.46;u.uStart.value=-.78;u.uExit.value=exit.z-8.43;u.uLength.value=diameter*(.65*dry+4.5*ab)*expansion;u.uCell.value=diameter*(.60+.30*ab)*expansion*(1+.018*Math.sin(this.time*11+side*.4));
   Object.assign(group.userData.exhaust,{power:u.uPower.value,length:u.uLength.value,cellSpacing:u.uCell.value,blueMix:blue});
  }
  if(this.gunFiring){const before=Math.floor(this.gunPhase*30);this.gunPhase+=dt;this.shotCount+=Math.floor(this.gunPhase*30)-before;}else this.gunPhase=0;
  updateVfxPlume(this.gun,{time:this.time,intensity:this.gunFiring?(.38+.62*(Math.sin(this.gunPhase*30*Math.PI*2)>.1?1:0)):0,length:.78,diameter:.33,phase:2});
  for(const item of [...this.shots]){
   item.age+=Math.max(0,dt);const t=item.age,burn=Math.max(0,t-item.ignition);
   const forward=item.mode==='rail'?1.2*t+50*burn*burn:18*burn*burn,drop=item.mode==='eject'?2.5*Math.min(t,.5)+.5*Math.min(t,.5)**2:0;
   item.weapon.position.copy(item.origin).addScaledVector(item.forward,forward).addScaledVector(item.down,drop);
   updateVfxPlume(item.plume,{time:this.time,intensity:burn>0&&t<5.5?1:0,length:item.id==='YJ91A'?2.7:1.7,diameter:item.id==='YJ91A'?.43:.23});
   if(t>6){item.weapon.visible=false;this.shots.splice(this.shots.indexOf(item),1);}
  }
 }
 dispose(){this.resetLaunches();this.root.remove(this.effects);this.effects.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}

