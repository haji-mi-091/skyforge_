import * as T from '../../vendor/three.module.js';
export const worldVertices=o=>Array.from({length:o.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(o.matrixWorld));
export function meshEdges(o){const map=new Map(),idx=o.geometry.index?.array||Array.from({length:o.geometry.attributes.position.count},(_,i)=>i);for(let i=0;i<idx.length;i+=3)for(let k=0;k<3;k++){const a=idx[i+k],b=idx[i+(k+1)%3];map.set(Math.min(a,b)+','+Math.max(a,b),[a,b]);}return [...map.values()];}
export function triangleGrid(objects,cell=.24){
 const grid=new Map(),triangles=[],key=(x,y,z)=>x+','+y+','+z;
 const cells=(box,fn)=>{for(let x=Math.floor(box.min.x/cell);x<=Math.floor(box.max.x/cell);x++)for(let y=Math.floor(box.min.y/cell);y<=Math.floor(box.max.y/cell);y++)for(let z=Math.floor(box.min.z/cell);z<=Math.floor(box.max.z/cell);z++)fn(key(x,y,z));};
 for(const o of objects){const pts=worldVertices(o),idx=o.geometry.index?.array||pts.map((_,i)=>i);for(let i=0;i<idx.length;i+=3){const tri=new T.Triangle(...[0,1,2].map(k=>pts[idx[i+k]])),box=new T.Box3().setFromPoints([tri.a,tri.b,tri.c]),at=triangles.length;triangles.push({tri,box,o});cells(box,k=>{if(!grid.has(k))grid.set(k,[]);grid.get(k).push(at);});}}
 return {triangles,near(box){const ids=new Set();cells(box,k=>{for(const i of grid.get(k)||[])ids.add(i);});return [...ids].map(i=>triangles[i]);}};
}
export function edgeCrossings(source,targetGrid,limit=20){
 const pts=worldVertices(source),ray=new T.Ray(),box=new T.Box3(),hit=new T.Vector3(),out=[];let checked=0;
 for(const [i,j]of meshEdges(source)){
  const a=pts[i],b=pts[j],direction=b.clone().sub(a),length=direction.length();if(length<1e-7)continue;ray.set(a,direction.normalize());box.setFromPoints([a,b]);
  for(const {tri,box:otherBox,o}of targetGrid.near(box)){
   if(!box.intersectsBox(otherBox))continue;checked++;
   if(ray.intersectTriangle(tri.a,tri.b,tri.c,false,hit)&&hit.distanceTo(a)>1e-5&&hit.distanceTo(a)<length-1e-5&&out.length<limit)out.push({source:source.name,target:o.name,point:hit.toArray()});
  }
 }
 return {out,checked};
}
