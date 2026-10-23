import * as T from '../../vendor/three.module.js';
import {createF100Exhaust,updateF100Exhaust} from './F16Exhaust.js';
import {createVfxPlume,updateVfxPlume} from './VfxAtlas.js';

// Runtime visual effects for the J-10C white model (not stored in the GLB):
//  - afterburner plume: the shared afterburner shader (F16Exhaust.js, also
//    used by the F-16 and J-16): blue while the afterburner lights, orange at
//    full afterburner, shock cells with an animated texture.
//  - cannon muzzle flash: the shared VfxAtlas texture flash (also F-16 / J-16).
// addJ10CEffects(model) once after loading; updateJ10CEffects(model, state, t)
// each frame with state {afterburner 0..1, nozzle 0..1, firing, pressure?}.

// The shared shader runs in a frame whose origin sits this far ahead of the
// nozzle exit, so the gas starts inside the engine (hidden by its aperture test).
const EXIT_Z=1.0;

export function addJ10CEffects(model){
  const meta=findMeta(model);if(!meta)throw new Error('J-10C effects: model metadata not found');
  const fx=new T.Group();fx.name='J10C_runtime_effects';
  // Afterburner plume: shared shader, flowing aft (+Z) from the nozzle exit.
  const [cx,cy,cz]=meta.nozzleExit.centre;
  const plume=createF100Exhaust();plume.position.set(cx,cy,cz-EXIT_Z);fx.add(plume);
  // Muzzle flash at the gun port: shared VfxAtlas flash, turned to fire forward (-Z) like the J-16's.
  const flash=createVfxPlume(0);flash.name='gun_muzzle_flash';flash.position.fromArray(meta.gunMuzzle);flash.rotation.y=Math.PI;fx.add(flash);
  model.add(fx);
  const petal=model.getObjectByName('nozzle_petal_00'),pivot=petal&&(petal.userData.exportExtras||petal.userData).pivot;
  const hinge=pivot?new T.Vector3(...pivot):null,tip=new T.Vector3();
  if(hinge){const r=Math.hypot(hinge.x-cx,hinge.y-cy);tip.set((meta.nozzleExit.radius-r)*(hinge.x-cx)/r,(meta.nozzleExit.radius-r)*(hinge.y-cy)/r,cz-hinge.z);}
  model.userData.j10cEffects={plume,flash,meta,petal,hinge,tip,lip:new T.Vector3()};
  return model.userData.j10cEffects;
}

function findMeta(model){let m=null;model.traverse(o=>{const d=o.userData.exportExtras||o.userData;if(!m&&d&&d.gunMuzzle&&d.nozzleExit)m=d;});return m;}

export function updateJ10CEffects(model,state={},time=0){
  const e=model.userData.j10cEffects;if(!e)return false;
  const ab=T.MathUtils.clamp(state.afterburner||0,0,1),r=e.meta.nozzleExit.radius,[cx,cy,cz]=e.meta.nozzleExit.centre;
  let exitRadius=r,exitZ=EXIT_Z;
  // Follow the rigid feather's actual lip rather than an approximate radius.
  if(e.petal&&e.hinge){e.lip.copy(e.tip).applyQuaternion(e.petal.quaternion).add(e.hinge);exitRadius=Math.hypot(e.lip.x-cx,e.lip.y-cy);exitZ+=e.lip.z-cz;}
  updateF100Exhaust(e.plume,{exitRadius:exitRadius-.012,radius:.62,exitZ},{afterburner:ab,air:{pressure:state.pressure??101325}},time);
  updateVfxPlume(e.flash,{time,intensity:state.firing?.85+.15*Math.sin(time*157):0,length:.6,diameter:.28});
  return e.plume.visible||!!state.firing;   // true while something is animating
}
