import {writeFile,mkdir} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb,writeModelGlb} from './lib/model-glb.mjs';
import {buildJ10CModel,poseJ10C,paintJ10C,J10C_DIMENSIONS,J10C_WORKZONES,J10C_GEAR} from '../src/visual/J10CModel.js';
const directory='assets/models/j10c';await mkdir(directory,{recursive:true});
const cad=await readModelGlb(directory+'/j10c-cad-reference.glb');
const model=buildJ10CModel(cad);
poseJ10C(model,{gear:1,nozzle:0});
model.updateMatrixWorld(true);
const bounds=new T.Box3().setFromObject(model),roles={};
model.traverse(o=>{const d=o.userData.exportExtras;if(d?.role)(roles[d.role]??=[]).push(o.name);});
const stats=await writeModelGlb(model,directory+'/j10c-white.glb');
const audit={...stats,dimensions:J10C_DIMENSIONS,gear:J10C_GEAR,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new T.Vector3()).toArray()},
  movableAssemblies:roles,source:'assets/models/j10c/J10C.STEP (1:10 surface model) via SolidWorks tessellation; CAD shell plus rebuilt control surfaces, cockpit, gear and nozzle',
  units:'metres',forward:'-Z',stage:'white model, no stores, separate articulated parts',
  triangleBudget:'kept below the F-16CM runtime GLB (about 189k triangles)'};
await writeFile(directory+'/j10c-white.json',JSON.stringify(audit,null,2)+'\n');
paintJ10C(model,'zones');
const zoneStats=await writeModelGlb(model,directory+'/j10c-workzones.glb');
const workZones={};
for(const [id,zone]of Object.entries(J10C_WORKZONES)){
  const members=[];model.traverse(o=>{if(o.isMesh&&o.userData.exportExtras?.workZone===id)members.push(o.name);});
  workZones[id]={...zone,color:'#'+zone.color.toString(16).padStart(6,'0'),meshes:members};
}
await writeFile(directory+'/j10c-workzones.json',JSON.stringify({stage:'three modelling work areas',...zoneStats,workZones},null,2)+'\n');
console.log(JSON.stringify(audit,null,2));
