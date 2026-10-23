import * as T from '../../../vendor/three.module.js';
import {roundEngine} from './j16Tail.js';

const merge=gs=>{const p=[],n=[],uv=[];for(const raw of gs){const g=raw.index?raw.toNonIndexed():raw;p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);uv.push(...(g.attributes.uv?.array||new Float32Array(g.attributes.position.count*2)));}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(Array.from({length:p.length/3},(_,i)=>i));return g;};
// Visible nozzle hardware only. Dimensions follow the existing circular casing;
// hidden compressor machinery and speculative internal systems are omitted.
export function j16EngineDetails(x,y){
 const bands=[],fasteners=[],liners=[],holders=[];
 for(const z of [8.23,8.325,8.405]){const r=.53-.01*(z-8.15)/.28;bands.push(roundEngine([{z:z-.012,r:r+.001},{z,r:r+.005},{z:z+.012,r:r+.001}],48));}
 for(let i=0;i<16;i++){
  const a=(i+.5)*Math.PI/8;
  // Small fixed hinge bosses sit on the attachment band; moving outer ribs
  // belong to each feather and therefore follow its actual nozzle hinge.
  const boss=new T.BoxGeometry(.023,.018,.065).translate(0,.517,8.397).rotateZ(a);fasteners.push(boss);
  const blade=new T.BoxGeometry(.014,.12,.035).translate(0,.275,7.80).rotateZ(a);holders.push(blade);
 }
 for(let i=0;i<6;i++){const z=7.64+i*.125,r=.40+(.46-.40)*(z-7.50)/.95;liners.push(roundEngine([{z:z-.009,r:r-.004},{z:z+.009,r:r-.004}],48));}
 for(const [a,b]of [[.17,.19],[.34,.36]])holders.push(new T.RingGeometry(a,b,48).translate(0,0,7.80));
 const place=g=>g.translate(x,y,0);
 return {bands:place(merge(bands)),fasteners:place(merge(fasteners)),linerRibs:place(merge(liners)),flameholder:place(merge(holders))};
}
