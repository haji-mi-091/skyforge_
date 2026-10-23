// Archive the two retired procedural F-16 airframes (测试原型机1型, F-16 DeepSeek)
// as static GLB files, gear down, built by the JetModel code they used in game.
// usage: node tools/export-procedural-f16.mjs
import {mkdir} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {writeModelGlb} from './lib/model-glb.mjs';
import {F16A_PROTO1,F16A_PROTO2} from '../src/data/aircraft.js';
// Geometry only: panel/decal textures are drawn on a canvas that Node lacks, so
// a do-nothing canvas stands in (textures are not written to the GLB).
const ctx2d=new Proxy({},{get:(t,k)=>k==='getImageData'||k==='createImageData'?(...a)=>({data:new Uint8ClampedArray(Math.max(4,(a[2]||a[0]||1)*(a[3]||a[1]||1)*4))}):k==='measureText'?()=>({width:0}):(k.startsWith?.('create')?()=>({addColorStop(){}}):()=>{}),set:()=>true});
globalThis.document??={createElement:()=>({width:1,height:1,style:{},getContext:()=>ctx2d})};
const {JetModel}=await import('../src/visual/JetModel.js');
await mkdir('assets/models/f16-procedural',{recursive:true});
for(const [config,file]of [[F16A_PROTO1,'proto1.glb'],[F16A_PROTO2,'f16-deepseek.glb']]){
 const jet=new JetModel(structuredClone(config),{isPlayer:false});
 const root=new T.Group();root.name=config.id;
 jet.group.updateMatrixWorld(true);
 // Bake every visible mesh into model space; effects / sprites / lines are not exported.
 jet.group.traverse(o=>{
  if(!o.isMesh||o.isInstancedMesh||!o.geometry?.attributes?.position)return;
  for(let p=o;p;p=p.parent)if(p.visible===false)return;
  if(o.material?.blending===T.AdditiveBlending||o.material?.isShaderMaterial)return;
  const g=o.geometry.clone().applyMatrix4(o.matrixWorld);
  for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
  const m=new T.Mesh(g,o.material);m.name=o.name||'part';m.userData.exportExtras={material:o.material?.name||''};root.add(m);
 });
 await writeModelGlb(root,'assets/models/f16-procedural/'+file);
 console.log(file,root.children.length,'meshes');
}
