import * as T from '../../../vendor/three.module.js';
import {leadingFraction} from './j16Wing.js';
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export const J16_GEAR={
 noseBay:{x:0,z:-3.63,width:.74,length:2.80,roof:.36},
 mainBay:{x:1.95,z:2.65,width:1.06,length:2.80,roof:-.69},
 mainPivot:{x:1.95,y:-1.095,z:3.52},mainSpread:0,mainLength:1.485,mainAxleAft:0,mainWheelOffset:.23,
};

function geometry(p,index,uv){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

// The wing root is a closed structural blend with room for the outboard main
// well. At x=2.74 it has exactly the existing airfoil section, ahead of the
// flaperon root. The leading-edge flap remains a separate moving assembly.
export function wingRootBlend(wing,side){
 const at=x=>{
  let i=0;while(i<wing.length-2&&x>wing[i+1].x)i++;
  const a=wing[i],b=wing[i+1],t=(x-a.x)/(b.x-a.x);
  return Object.fromEntries(Object.keys(a).map(k=>[k,T.MathUtils.lerp(a[k],b[k],t)]));
 };
 const chord=(x,z)=>{const s=at(x);return (z-s.le)/(s.te-s.le);};
 const height=(x,z,upper)=>{
  const s=at(x),t=T.MathUtils.clamp(chord(x,z),0,1),c=s.te-s.le;
  const h=5*s.thickness*c*(.2969*Math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4);
  const span=1-smooth((x-2.40)/.34),long=smooth((t-.16)/.065)*(1-smooth((t-.90)/.08));
  return s.y+(upper?1:-1)*h+(upper?.12:-.38)*span*long;
 };
 const patch=(x0,x1,t0,t1,nx,nz)=>{
  const p=[],uv=[],idx=[],stride=nz+1,sheet=(nx+1)*stride;
  for(const upper of [true,false])for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){
   const x=T.MathUtils.lerp(x0,x1,i/nx),s=at(x),t=T.MathUtils.lerp(t0===.16?leadingFraction(x):t0,t1===.16?leadingFraction(x):t1,j/nz),z=T.MathUtils.lerp(s.le,s.te,t);
   p.push(side*x,height(x,z,upper),z);uv.push(i/nx,t);
  }
  for(let face=0;face<2;face++)for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
   const a=face*sheet+i*stride+j,b=a+stride,c=b+1,d=a+1;
   if((face===0)===(side>0))idx.push(a,c,b,a,d,c);else idx.push(a,b,c,a,c,d);
  }
  const edge=(a,b)=>{idx.push(a,b,b+sheet,a,b+sheet,a+sheet);};
  for(let j=0;j<nz;j++){edge(j,j+1);edge(nx*stride+j+1,nx*stride+j);}
  for(let i=0;i<nx;i++){edge((i+1)*stride,i*stride);edge(i*stride+nz,(i+1)*stride+nz);}
  return geometry(p,idx,uv);
 };
 const cutter=(x0,x1,t0,t1)=>[
  p=>side*p.x-x0,p=>x1-side*p.x,
  p=>chord(side*p.x,p.z)-(t0===.16?leadingFraction(side*p.x):t0),p=>(t1===.16?leadingFraction(side*p.x):t1)-chord(side*p.x,p.z),
  p=>p.y-height(side*p.x,p.z,false),p=>height(side*p.x,p.z,true)-p.y,
 ];
 return {height,chord,main:patch(1.28,2.74,.16,1,20,36),leading:patch(1.28,1.76,0,.16,8,8),
  cutters:[cutter(1.28,2.74,.16,1),cutter(1.28,1.76,0,.16)]};
}

// Aviation-tire section: a broad tread and rounded shoulders, not a torus.
// The axle is +X; all four tires can keep the existing wheel-spin rig.
export function landingTire(radius,width){
 const profile=[[.53,.50],[.73,.50],[.90,.43],[.985,.28],[1,.10],[1,-.10],[.985,-.28],[.90,-.43],[.73,-.50],[.53,-.50],[.53,.50]];
 const g=new T.LatheGeometry(profile.reverse().map(([r,x])=>new T.Vector2(r*radius,x*width)),64);
 g.rotateZ(-Math.PI/2);return g;
}

// Constant-length two-link drag braces join a fixed airframe lug to the moving
// strut. No dangling rods, visibility switches or animated mesh scaling.
export function poseGearBraces(root){
 root.updateMatrixWorld(true);
 root.traverse(group=>{
  const m=group.userData.exportExtras||group.userData;if(!m.kinematicBrace&&!m.telescopicLink)return;
  const leg=root.getObjectByName(m.leg),a=group.getWorldPosition(new T.Vector3()),b=leg.localToWorld(new T.Vector3(...m.knee));
  const direction=b.clone().sub(a),distance=direction.length();direction.normalize();
  if(m.telescopicLink){
   // Fixed-size barrel and piston overlap as the door moves; neither is scaled.
   for(const [part,center]of [['upper',a.clone().addScaledVector(direction,m.barrelLength/2)],['middle',a.clone().add(b).multiplyScalar(.5)],['lower',b.clone().addScaledVector(direction,-m.pistonLength/2)]]){
    const o=group.getObjectByName(group.name+'_'+part);o.position.copy(group.worldToLocal(center));
    const localDirection=direction.clone().transformDirection(group.matrixWorld.clone().invert());
    o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),localDirection);
   }
   return;
  }
  const pole=new T.Vector3(...m.pole).transformDirection(root.matrixWorld);
  pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const elbow=a.clone().add(b).multiplyScalar(.5).addScaledVector(pole,Math.sqrt(Math.max(0,m.armLength**2-distance**2/4)));
  const local=p=>group.worldToLocal(p.clone());
  for(const [name,start,end]of [['upper',a,elbow],['lower',elbow,b]]){
   const o=group.getObjectByName(group.name+'_'+name),p=local(start),q=local(end);
   o.position.copy(p).add(q).multiplyScalar(.5);
   o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(p).normalize());
  }
  group.getObjectByName(group.name+'_elbow').position.copy(local(elbow));
 });
 root.updateMatrixWorld(true);
}
