import {readFile,writeFile,mkdir} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb,writeModelGlb} from './lib/model-glb.mjs';
import {buildJ16Model,J16_DIMENSIONS,J16_WORKZONES,paintJ16} from '../src/visual/J16Model.js';
const directory='assets/models/j16';await mkdir(directory,{recursive:true});
const cad=await readModelGlb(directory+'/j16-cad-base.glb');
const profile=JSON.parse(await readFile(directory+'/cad-profile.json','utf8'));
const noseTrace=JSON.parse(await readFile(directory+'/nose-profile.json','utf8'));
const model=buildJ16Model(cad,profile,noseTrace);
model.updateMatrixWorld(true);
const bounds=new T.Box3().setFromObject(model),roles={};
model.traverse(o=>{const d=o.userData.exportExtras;if(d?.role)(roles[d.role]??=[]).push(o.name);});
const stats=await writeModelGlb(model,directory+'/j16-white.glb');
const audit={...stats,dimensions:J16_DIMENSIONS,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:bounds.getSize(new T.Vector3()).toArray()},
  movableAssemblies:roles,source:'Supplied J-11B DWG via SolidWorks 2024; cleaned central CAD shell plus rebuilt J-16 features',
  units:'metres',forward:'-Z',stage:'white model with separate articulated parts',
  references:['https://www.81.cn/bq_208581/jdt_208582/16397209.html','https://www.mod.go.jp/js/pdf/2025/p20251211_02e.pdf'],
  sizeNote:'Public dimensions are used as modelling targets, not certified engineering measurements. Span is not enlarged uniformly with the forebody.'};
await writeFile(directory+'/j16-white.json',JSON.stringify(audit,null,2)+'\n');
paintJ16(model,'zones');
const zoneStats=await writeModelGlb(model,directory+'/j16-workzones.glb');
const workZones={};
for(const [id,zone]of Object.entries(J16_WORKZONES)){
  const members=[];model.traverse(o=>{if(o.isMesh&&o.userData.exportExtras?.workZone===id)members.push(o.name);});
  workZones[id]={...zone,color:'#'+zone.color.toString(16).padStart(6,'0'),meshes:members};
}
await writeFile(directory+'/j16-workzones.json',JSON.stringify({stage:'three modelling work areas',...zoneStats,workZones},null,2)+'\n');
console.log(JSON.stringify(audit,null,2));
