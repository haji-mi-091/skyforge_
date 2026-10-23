import * as T from '../../../vendor/three.module.js';
import {profileCurve} from './profileCurve.js';

// Reference-photo proportions, metres. The lower end of each side lip has a
// short vertical return after the long swept edge. The two apertures lean
// outward towards their bottoms, as a mirrored pair, rather than upright boxes.
export const J16_INTAKE={topY:-.84,bottomY:-1.77,elbowY:-1.61,topZ:-2.40,elbowZ:-1.50,backZ:1.20,
  topCentre:1.035,bottomCentre:1.215,topWidth:.395,bottomWidth:.415,lipWidth:.030,lipHeight:.025};
const c=J16_INTAKE,clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const curve=keys=>profileCurve(keys);
const mouthWidth=(c.topWidth+c.bottomWidth)/2,mouthHeight=(c.topY-c.bottomY)/2,mouthY=(c.topY+c.bottomY)/2;
const width=curve([[0,mouthWidth],[.22,.405],[.55,.355],[1,.30]]);
const innerWidth=curve([[0,mouthWidth],[.22,.405],[.55,.33],[1,.235]]);
const height=curve([[0,mouthHeight],[.22,.43],[.55,.32],[1,.25]]);
const centreY=curve([[0,mouthY],[.22,-1.31],[.55,-1.22],[1,-1.15]]);
// Lift the internal passage above the main wheel-bay roof. The exterior still
// joins the original nacelle; the liner must not run through its wheel well.
const innerHeight=curve([[0,mouthHeight],[.22,.43],[.55,.30],[.86,.195],[1,.17]]);
const innerY=curve([[0,mouthY],[.22,-1.31],[.55,-1.12],[.86,-.81],[1,-.74]]);
const centreX=curve([[0,(c.topCentre+c.bottomCentre)/2],[.3,1.12],[1,1.075]]);
const cant=curve([[0,(c.bottomCentre-c.topCentre)/2],[.35,.055],[1,.005]]);
const taper=curve([[0,(c.bottomWidth-c.topWidth)/2],[.3,.008],[1,0]]);
export const intakeFrontZ=y=>c.topZ+(c.elbowZ-c.topZ)*clamp((c.topY-y)/(c.topY-c.elbowY),0,1);

// Rounded rectangle samples include the elbow station on both straight sides.
// Keeping that station explicit preserves the vertical return in a side view.
const r=.105,perimeter=[];
for(const [cx,cy,start]of [[1-r,-1+r,-Math.PI/2],[1-r,1-r,0],[-1+r,1-r,Math.PI/2],[-1+r,-1+r,Math.PI]]){
 for(let i=0;i<=4;i++){const a=start+i/4*Math.PI/2;perimeter.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
 const end=perimeter.at(-1),nextAngle=start+Math.PI/2;
 const next=nextAngle===0?[1,1-r]:nextAngle===Math.PI/2?[-1+r,1]:nextAngle===Math.PI?[-1,-1+r]:[1-r,-1];
 const points=Array.from({length:5},(_,i)=>[lerp(end[0],next[0],(i+1)/6),lerp(end[1],next[1],(i+1)/6)]);
 const elbowV=(c.elbowY-centreY(0))/height(0);
 if(Math.abs(end[0])>.99&&Math.abs(next[0])>.99)points.push([end[0],elbowV]);
 points.sort((a,b)=>Math.hypot(a[0]-end[0],a[1]-end[1])-Math.hypot(b[0]-end[0],b[1]-end[1]));
 perimeter.push(...points);
}

export function intakePoint(side,t,u,v,outer=0){
 const h=lerp(innerHeight(t),height(t),outer)+c.lipHeight*outer,w=lerp(innerWidth(t),width(t),outer)+taper(t)*(-v)+c.lipWidth*outer;
 const a=Math.asin(cant(t)/height(t)),co=Math.cos(a),si=Math.sin(a);
 const x=side*(centreX(t)+w*u*co-h*v*si),y=lerp(innerY(t),centreY(t),outer)+w*u*si+h*v*co;
 const mouthY=centreY(0)+height(0)*v;
 const z=lerp(intakeFrontZ(mouthY),c.backZ,t)+(1-t)*lerp(.030,.018,outer);
 return new T.Vector3(x,y,z);
}

function geo(p,index,uv){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

export function intakeSurfaces(side){
 const n=perimeter.length,rows=29;
 const skin=(outer)=>{
  const p=[],uv=[],idx=[];
  for(let i=0;i<rows;i++)for(let j=0;j<n;j++){
   p.push(...intakePoint(side,i/(rows-1),...perimeter[j],outer).toArray());uv.push(j/n,i/(rows-1));
   if(i<rows-1){const a=i*n+j,b=i*n+(j+1)%n;
    if((side>0)===!!outer)idx.push(a,b,b+n,a,b+n,a+n);else idx.push(a,b+n,b,a,a+n,b+n);
   }
  }
  return geo(p,idx,uv);
 };
 const p=[],uv=[],idx=[];
 for(const [i,outer]of [1,.45,0].entries())for(let j=0;j<n;j++){
  const point=intakePoint(side,0,...perimeter[j],outer);
  if(i===1)point.z-=.027;
  p.push(...point.toArray());uv.push(j/n,i/2);
  if(i<2){const a=i*n+j,b=i*n+(j+1)%n;
   if(side<0)idx.push(a,b,b+n,a,b+n,a+n);else idx.push(a,b+n,b,a,a+n,b+n);
  }
 }
 return {outer:skin(1),inner:skin(0),lip:geo(p,idx,uv)};
}

// The fixed fuselage is trimmed by the same canted, tapered envelope used by
// the shell. Inverse loft coordinates make the opening follow the swept lip.
export function intakeCutter(side){
 const cache=new Map();
 const local=(p,t)=>{
  const a=Math.asin(cant(t)/height(t)),co=Math.cos(a),si=Math.sin(a),dx=side*p.x-centreX(t),dy=p.y-centreY(t);
  const v=(-dx*si+dy*co)/(height(t)+c.lipHeight),u=(dx*co+dy*si)/(width(t)-taper(t)*v+c.lipWidth);
  return {t,u,v};
 };
 const frame=p=>{
  const key=p.x.toFixed(6)+','+p.y.toFixed(6)+','+p.z.toFixed(6);
  if(cache.has(key))return cache.get(key);
  let lo=0,hi=1;
  for(let i=0;i<22;i++){
   const t=(lo+hi)/2,{v}=local(p,t);
   const mouthY=centreY(0)+height(0)*v;
   const z=lerp(intakeFrontZ(mouthY),c.backZ,t)+(1-t)*.018;
   if(z<p.z)lo=t;else hi=t;
  }
  const f=local(p,(lo+hi)/2);cache.set(key,f);return f;
 };
 return [
  p=>p.z-intakeFrontZ(centreY(0)+height(0)*local(p,0).v)-.017,
  p=>c.backZ-p.z,
  p=>{
   const f=frame(p),qx=Math.abs(f.u)-(1-r),qy=Math.abs(f.v)-(1-r);
   return r-Math.hypot(Math.max(qx,0),Math.max(qy,0))-Math.min(Math.max(qx,qy),0);
  },
 ];
}

export function intakeRamp(side){
 // A recessed two-dimensional compression ramp; its pivot is below the roof.
 const pivot=intakePoint(side,.10,0,.82,0).toArray(),p=[],uv=[],idx=[];
 for(let iz=0;iz<=12;iz++)for(let ix=0;ix<=8;ix++){
  const q=intakePoint(side,lerp(.10,.37,iz/12),lerp(-.82,.82,ix/8),lerp(.82,.68,iz/12),0);
  p.push(...q.sub(new T.Vector3(...pivot)).toArray());uv.push(ix/8,iz/12);
  if(iz<12&&ix<8){const a=iz*9+ix;idx.push(a,a+1,a+10,a,a+10,a+9);}
 }
 const axis=intakePoint(side,.10,1,.82,0).sub(intakePoint(side,.10,-1,.82,0)).normalize();
 if(axis.x<0)axis.negate();
 return {pivot,axis:axis.toArray(),geometry:geo(p,idx,uv)};
}
