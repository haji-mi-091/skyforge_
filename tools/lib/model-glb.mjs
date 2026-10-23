// Small local glTF bridge for untextured modelling assets. Retains named rig
// nodes and their local pivots, without a DOM or a browser-only exporter.
import { readFile, writeFile } from 'node:fs/promises';
import * as T from '../../vendor/three.module.js';

export async function readModelGlb(path) {
  const file=await readFile(path),size=file.readUInt32LE(12);
  const gltf=JSON.parse(file.subarray(20,20+size).toString('utf8'));
  const bin=file.subarray(28+size);
  const array=index=>{
    const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView];
    const n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    const Type={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array}[a.componentType];
    const start=(v.byteOffset||0)+(a.byteOffset||0);
    return new Type(bin.buffer.slice(bin.byteOffset+start,bin.byteOffset+start+a.count*n*Type.BYTES_PER_ELEMENT));
  };
  const materials=(gltf.materials||[]).map(m=>{
    const p=m.pbrMetallicRoughness||{},c=p.baseColorFactor||[.7,.7,.7,1];
    const out=new T.MeshStandardMaterial({color:new T.Color(...c),roughness:p.roughnessFactor??.7,metalness:p.metallicFactor??.1,
      transparent:m.alphaMode==='BLEND',opacity:c[3],side:m.doubleSided?T.DoubleSide:T.FrontSide});
    out.name=m.name||'base skin';return out;
  });
  const objects=gltf.nodes.map(n=>{
    let o;
    if(n.mesh!==undefined){
      const mesh=gltf.meshes[n.mesh];
      const parts=mesh.primitives.map(p=>{
        const g=new T.BufferGeometry();
        for(const [name,index] of Object.entries(p.attributes)){
          const semantic={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[name];
          if(semantic)g.setAttribute(semantic,new T.BufferAttribute(array(index),semantic==='uv'?2:3));
        }
        if(p.indices!==undefined)g.setIndex(new T.BufferAttribute(array(p.indices),1));
        if(!g.attributes.normal)g.computeVertexNormals();
        return new T.Mesh(g,materials[p.material]||new T.MeshStandardMaterial());
      });
      if(parts.length===1)o=parts[0];else {o=new T.Group();o.add(...parts);}
    }else o=new T.Group();
    o.name=n.name||'';o.userData=n.extras||{};
    if(n.matrix)o.applyMatrix4(new T.Matrix4().fromArray(n.matrix));
    else {if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);}
    return o;
  });
  gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(j=>objects[i].add(objects[j])));
  const scene=new T.Group();for(const i of gltf.scenes[gltf.scene||0].nodes)scene.add(objects[i]);
  return scene;
}

export async function writeModelGlb(root,path,{compactIndices=false}={}) {
  const doc={asset:{version:'2.0',generator:'SKYFORGE white-model pipeline'},scene:0,scenes:[{nodes:[0]}],
    nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
  const chunks=[];let length=0,triangles=0;const mats=new Map();
  const add=(typed,type,target)=>{
    const aligned=(length+3)&~3;if(aligned>length)chunks.push(Buffer.alloc(aligned-length));length=aligned;
    const bytes=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength);
    const view=doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length,target})-1;
    chunks.push(bytes);length+=bytes.length;
    const entry={bufferView:view,componentType:typed instanceof Float32Array?5126:typed instanceof Uint16Array?5123:5125,
      count:typed.length/({SCALAR:1,VEC2:2,VEC3:3}[type]),type};
    if(type==='VEC3'){
      entry.min=[Infinity,Infinity,Infinity];entry.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<typed.length;i++){const j=i%3;entry.min[j]=Math.min(entry.min[j],typed[i]);entry.max[j]=Math.max(entry.max[j],typed[i]);}
    }
    return doc.accessors.push(entry)-1;
  };
  const material=m=>{
    if(mats.has(m))return mats.get(m);
    const p={name:m.name||'base skin',pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,m.opacity],
      metallicFactor:m.metalness??0,roughnessFactor:m.roughness??.7},doubleSided:m.side===T.DoubleSide};
    if(m.transparent)p.alphaMode='BLEND';
    const id=doc.materials.push(p)-1;mats.set(m,id);return id;
  };
  const node=o=>{
    const id=doc.nodes.length;o.updateMatrix();
    const n={name:o.name||'part',matrix:o.matrix.toArray()};doc.nodes.push(n);
    const extras=o.userData.exportExtras||o.userData.gltfExtras;
    if(extras)n.extras=extras;
    if(o.isMesh){
      const g=o.geometry,p={attributes:{},mode:4,material:material(o.material)};
      for(const [attribute,semantic] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0']]){
        const a=g.attributes[attribute];if(a)p.attributes[semantic]=add(new Float32Array(a.array),a.itemSize===2?'VEC2':'VEC3',34962);
      }
      if(g.index){
        const Index=compactIndices&&g.attributes.position.count<=65535?Uint16Array:Uint32Array;
        p.indices=add(new Index(g.index.array),'SCALAR',34963);
      }
      triangles+=(g.index?.count||g.attributes.position.count)/3;
      n.mesh=doc.meshes.push({name:o.name,primitives:[p]})-1;
    }
    const children=o.children.filter(c=>c.visible);
    if(children.length)n.children=children.map(node);
    return id;
  };
  node(root);const binary=Buffer.concat(chunks);doc.buffers=[{byteLength:binary.length}];
  const raw=Buffer.from(JSON.stringify(doc));const json=Buffer.alloc((raw.length+3)&~3,32);raw.copy(json);
  const payload=Buffer.alloc((binary.length+3)&~3);binary.copy(payload);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+payload.length,8);
  header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(payload.length);binHeader.writeUInt32LE(0x004e4942,4);
  await writeFile(path,Buffer.concat([header,json,binHeader,payload]));
  return {triangles,meshes:doc.meshes.length,nodes:doc.nodes.length,materials:doc.materials.length,bytes:28+json.length+payload.length};
}
