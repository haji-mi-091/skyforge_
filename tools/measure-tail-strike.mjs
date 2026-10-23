import * as T from '../vendor/three.module.js';
import {readModelGlb} from './lib/model-glb.mjs';
import {poseJ10C} from '../src/visual/J10CModel.js';
import {poseJ16} from '../src/visual/J16Model.js';
import {AIRCRAFT_TYPES} from '../src/data/aircraft.js';
// Tail-strike angle per aircraft: rotate the gear-down model about the main
// wheel contact (z = systems.mainGearZ, y = -systems.contactHeight) until the
// first airframe point aft of the gear touches the runway. Meshes that reach
// the ground are wheels/tyres and are skipped (CAD names are not reliable).
// Model metres, +Y up, -Z nose, so "aft" is +Z. Source of systems.maxGroundPitchDeg.
const models={
 'f16cm-block52':['assets/models/f16/f16_flight.glb',()=>{}],
 j16:['assets/models/j16/j16-white.glb',r=>poseJ16(r,{gear:1})],
 j10c:['assets/models/j10c/j10c-white.glb',r=>poseJ10C(r,{gear:1})],
};
const v=new T.Vector3();
for(const [id,[path,pose]]of Object.entries(models)){
 const cfg=AIRCRAFT_TYPES[id],root=await readModelGlb(path);pose(root);root.updateMatrixWorld(true);
 const gz=cfg.systems.mainGearZ,gy=-cfg.systems.contactHeight;let best={deg:90};
 root.traverse(o=>{if(!o.isMesh||!o.visible)return;
  const p=o.geometry.attributes.position,points=[];let minY=Infinity;
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);minY=Math.min(minY,v.y);points.push(v.z,v.y);}
  if(minY<gy+.15)return;
  for(let i=0;i<points.length;i+=2){const d=points[i]-gz;if(d<1)continue;const deg=Math.atan2(points[i+1]-gy,d)*180/Math.PI;if(deg<best.deg)best={deg,mesh:o.name,at:[points[i],points[i+1]]};}});
 console.log(id.padEnd(14),JSON.stringify({tailStrikeDeg:+best.deg.toFixed(2),mesh:best.mesh,at:best.at.map(n=>+n.toFixed(2)),configured:cfg.systems.maxGroundPitchDeg??14}));
}
