import * as T from '../../../vendor/three.module.js';
import {profileCurve} from './profileCurve.js';

const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export const J16_TAIL={engineX:1.075,engineY:-1.14,collarZ:8.15,petalZ:8.43,finX:1.52,stabilatorX:1.80,stabilatorY:-.98,stabilatorZ:7.37};
function geometry(p,idx,uv){
 const clean=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
 for(let i=0;i<idx.length;i+=3){a.fromArray(p,idx[i]*3);b.fromArray(p,idx[i+1]*3);c.fromArray(p,idx[i+2]*3);if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-16)clean.push(idx[i],idx[i+1],idx[i+2]);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(clean);g.computeVertexNormals();return g;
}

// One uncut CAD-section loft replaces the old tail's mismatched rectangular
// openings. The two nacelle shoulders and fin pedestals belong to this shell.
export function tailSurface(profile,hullSection,dorsalHeight){
 const n=256,cache=new Map();
 const engineRadius=profileCurve([[4.75,.06],[5.15,.38],[5.85,.59],[6.65,.62],[7.30,.60],[7.85,.555],[8.15,.53],[8.43,.52]]);
 const ellipseHit=(dx,dy,cy,cx,ey,rx,ry)=>{
  const ox=-cx,oy=cy-ey,A=(dx/rx)**2+(dy/ry)**2,B=2*(ox*dx/rx**2+oy*dy/ry**2),C=(ox/rx)**2+(oy/ry)**2-1,D=B*B-4*A*C;
  return D>0?Math.max(0,(-B+Math.sqrt(D))/(2*A)):0;
 };
 // Aft body as designed shapes (reference photo "36001"): from z 5.6 the scanned
 // CAD section hands over to a soft union of smooth primitives, so the two
 // engines read as separate round nacelles with a channel each side of a slim
 // tail beam, outboard booms carry the stabilator pivots, and nothing wrinkles
 // (every primitive varies smoothly along z). By 10.4 the shape is the CAD hull
 // again, so the tip loft and the parachute doors meet it unchanged.
 // The beam narrows gradually: between the fin roots (z 5-6.8) the spine stays one
 // smooth ridge sinking into the deck; the channels beside the nacelles open only
 // from ~6.8 aft, by the nozzles (an earlier, abrupt channel creased the deck).
 const beamHalf=profileCurve([[5.0,1.30],[6.0,1.02],[6.8,.66],[7.4,.42],[8.15,.33],[9.0,.30],[10.0,.24],[10.48,.18]]);
 const beamTop=profileCurve([[5.0,-.33],[6.0,-.42],[6.8,-.52],[7.4,-.59],[8.15,-.63],[9.0,-.60],[10.48,-.48]]);
 // Drag-chute housing side flanges ("sheet beams", reference photo): a thin
 // horizontal plate each side of the stinger at mid-height, from the nozzle
 // collars aft, kept inside the nozzle petals (|x| < 0.50) and ending in rounded
 // caps before the tip.
 const flangeHalf=profileCurve([[7.4,.34],[8.0,.50],[9.3,.50],[9.85,.44],[10.12,.30]]);
 const flangeWeight=z=>smooth((z-7.4)/.5)*(1-smooth((z-9.9)/.24));
 const beamBottom=profileCurve([[5.0,-1.07],[8.15,-1.06],[9.0,-1.05],[10.48,-.92]]);
 const designWeight=z=>smooth((z-5.0)/1.6)*(1-smooth((z-10.1)/.3));
 const SOFT=12;   // soft-union exponent: higher = sharper fillets
 // Rounded stinger end: aft of 10.3 the last full CAD section shrinks along a
 // quarter ellipse to the original tip station, instead of the CAD's abrupt
 // collapse in the final 0.17 m.
 const tipStart=10.3,tipEnd=profile.z.at(-1);
 const rawSection=(z,engines)=>{
  if(!engines&&z>tipStart){const base=rawSection(tipStart,false),f=Math.sqrt(Math.max(0,1-((z-tipStart)/(tipEnd-tipStart))**2)),cy=hullSection(z).cy;
   return {cy,points:base.points.map(p=>[p[0]*Math.max(f,.004),cy+(p[1]-base.cy)*Math.max(f,.004)])};}
  const s=hullSection(z),points=[],design=designWeight(z);
  const pedestal=smooth((z-4.75)/.14)*(1-smooth((z-7.75)/.40));
  const bt=beamTop(z),bb=beamBottom(z),bcy=(bt+bb)/2,bry=(bt-bb)/2,brx=beamHalf(z);
  for(let j=0;j<n;j++){
   const k=j/n*s.r.length,i=Math.floor(k),t=k-i,point=q=>{const a=q/s.r.length*Math.PI*2,x=s.r[q]*Math.cos(a);return [x,dorsalHeight(x,s.cy+s.r[q]*Math.sin(a),z)];};
   const a=point(i),b=point((i+1)%s.r.length),x=T.MathUtils.lerp(a[0],b[0],t),y=T.MathUtils.lerp(a[1],b[1],t);
   const rr=Math.hypot(x,y-s.cy),dx=x/rr,dy=(y-s.cy)/rr;
   let r=rr;
   for(const side of [-1,1]){
    if(engines&&z<=8.43){const er=engineRadius(z);r=Math.max(r,ellipseHit(dx,dy,s.cy,side*1.075,-1.14,er,er));}
    if(pedestal>.001)r=Math.max(r,ellipseHit(dx,dy,s.cy,side*1.50,-.83,.25*pedestal,.31*pedestal));
   }
   // Only the inboard body (between the engines) is redesigned; outboard of
   // |x| ~1.3 the CAD skin stays, because the fin roots, ventral keels and
   // stabilator bearings are fitted to it.
   const inboard=1-smooth((Math.abs(x)-1.25)/.25);
   if(design*inboard>0){
    // Soft union (p-norm) of the designed primitives along this ray: tail beam,
    // nacelles and fin pedestals, with filleted junctions.
    const parts=[ellipseHit(dx,dy,s.cy,0,bcy,brx,bry)],flange=flangeWeight(z);
    if(flange>.001)parts.push(ellipseHit(dx,dy,s.cy,0,bcy-.02,flangeHalf(z),.105*flange+.001));
    for(const side of [-1,1]){
     if(engines&&z<=8.43){const er=engineRadius(z);parts.push(ellipseHit(dx,dy,s.cy,side*1.075,-1.14,er,er));}
     if(pedestal>.001)parts.push(ellipseHit(dx,dy,s.cy,side*1.50,-.83,.25*pedestal,.31*pedestal));
    }
    r=T.MathUtils.lerp(r,Math.pow(parts.reduce((sum,v)=>sum+v**SOFT,0),1/SOFT),design*inboard);
   }
   points.push([dx*r,s.cy+dy*r]);
  }
  // Fair the shoulder intersections in the actual section geometry. Preserve
  // the mid-body seam and round engine attachment station exactly.
  const fair=smooth((z-4.75)/.6)*(engines?1-smooth((z-7.90)/.25):1);
  for(let pass=0;pass<6;pass++){
   const r=points.map(p=>Math.hypot(p[0],p[1]-s.cy));
   for(let j=0;j<n;j++){const next=T.MathUtils.lerp(r[j],(r[(j+n-1)%n]+2*r[j]+r[(j+1)%n])/4,fair),scale=next/r[j];points[j]=[points[j][0]*scale,s.cy+(points[j][1]-s.cy)*scale];}
  }
  return {cy:s.cy,points};
 };
 // Fair along the length too: the CAD stations differ slightly from one to the
 // next, which showed as waves on the deck between the fins. Neighbouring
 // sections are averaged point by point; the mid-body seam (4.75) and the engine
 // bulkhead (8.15) are kept exact.
 const section=(z,engines=z<=8.15)=>{
  const key=z+','+engines;if(cache.has(key))return cache.get(key);
  const base=rawSection(z,engines),w=smooth((z-4.8)/.6)*(engines?1-smooth((z-7.85)/.25):1-smooth((z-10.2)/.2));
  let result=base;
  if(w>0){const d=.2,near=[rawSection(z-d,engines),rawSection(z-d/2,engines),rawSection(z+d/2,engines),rawSection(z+d,engines)];
   result={cy:base.cy,points:base.points.map((p,j)=>{const avg=[0,1].map(c=>(near[0].points[j][c]+2*near[1].points[j][c]+2*p[c]+2*near[2].points[j][c]+near[3].points[j][c])/8);return [T.MathUtils.lerp(p[0],avg[0],w),T.MathUtils.lerp(p[1],avg[1],w)];})};}
  cache.set(key,result);return result;
 };
 const outside=p=>{
  const s=section(p.z,p.z<=8.43),dx=p.x,dy=p.y-s.cy,rr=Math.hypot(dx,dy),ux=dx/rr,uy=dy/rr;let radius=0;
  for(let j=0;j<n;j++){
   const a=[s.points[j][0],s.points[j][1]-s.cy],b=[s.points[(j+1)%n][0],s.points[(j+1)%n][1]-s.cy],ex=b[0]-a[0],ey=b[1]-a[1],den=ux*ey-uy*ex;
   if(Math.abs(den)<1e-10)continue;const r=(a[0]*ey-a[1]*ex)/den,t=(a[0]*uy-a[1]*ux)/den;
   if(r>0&&t>=0&&t<=1)radius=Math.max(radius,r);
  }
  return rr-radius;
 };
 const loft=(start,end,engines,cap=false)=>{
  const zs=[...new Set([start,end,...Array.from({length:Math.ceil((end-start)/.11)},(_,i)=>start+i*.11),4.89,7.75,8.43].filter(z=>z>=start&&z<=end))].sort((a,b)=>a-b),p=[],uv=[],idx=[];
  for(const [i,z]of zs.entries())for(let j=0;j<n;j++){
   p.push(...section(z,engines).points[j],z);uv.push(j/n,(z-4.75)/6.225);
   if(i<zs.length-1){const a=i*n+j,b=i*n+(j+1)%n;idx.push(a,b,b+n,a,b+n,a+n);}
  }
  if(cap){const at=p.length/3;p.push(0,hullSection(end).cy,end);uv.push(.5,1);for(let j=0;j<n;j++)idx.push(at,(zs.length-1)*n+j,(zs.length-1)*n+(j+1)%n);}
  return geometry(p,idx,uv);
 };
 // Bulkhead between the engine-bearing and the slim aft section at z 8.15, split
 // into rings so the engine-disc cut in J16Model can open it (a single band of
 // long triangles spans the engine openings with every corner outside them).
 const p=[],uv=[],idx=[],front=section(8.15,true),back=section(8.15,false),R=3;
 for(let j=0;j<n;j++)for(let m=0;m<=R;m++){const t=m/R;p.push(T.MathUtils.lerp(front.points[j][0],back.points[j][0],t),T.MathUtils.lerp(front.points[j][1],back.points[j][1],t),8.15);uv.push(j/n,t);}
 for(let j=0;j<n;j++)for(let m=0;m<R;m++){const a=j*(R+1)+m,b=((j+1)%n)*(R+1)+m;idx.push(a,b,b+1,a,b+1,a+1);}
 return {forward:loft(4.75,8.15,true),aft:loft(8.15,10.48,false),tip:loft(10.48,profile.z.at(-1),false,true),bulkhead:geometry(p,idx,uv),outside,section,engineRadius};
}

// Circular engine geometry deliberately avoids the generic fuselage loft's
// flattened belly, which previously cut through the round nozzle feathers.
export function roundEngine(rows,segments=80){
 const p=[],uv=[],idx=[];
 for(const [i,{z,r}]of rows.entries())for(let j=0;j<=segments;j++){
  const a=j/segments*Math.PI*2;p.push(r*Math.cos(a),r*Math.sin(a),z);uv.push(j/segments,i/(rows.length-1));
  if(i<rows.length-1&&j<segments){const a=i*(segments+1)+j,b=a+1,c=b+segments+1,d=a+segments+1;idx.push(a,b,c,a,c,d);}
 }
 return geometry(p,idx,uv);
}
