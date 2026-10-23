import * as T from '../../vendor/three.module.js';
import {loadCachedModel} from './modelCache.js';
import { loftFuselage } from './jet/geometry.js';
import { profileCurve } from './jet/profileCurve.js';
import {intakeSurfaces,intakeCutter,intakeRamp} from './jet/j16Intake.js';
import {J16_GEAR,wingRootBlend,landingTire,poseGearBraces} from './jet/j16LandingGear.js';
import {J16_TAIL,tailSurface,roundEngine} from './jet/j16Tail.js';
import {J16_WING,wingAt,leadingHingeZ,leadingFraction,trailingHingeZ,trailingFraction} from './jet/j16Wing.js';
import {splitCadVolume} from './CadGeometry.js';
import {j16EngineDetails} from './jet/j16EngineDetails.js';
import {applyJ16Skin} from './J16Skin.js';
export {whenJ16SkinReady} from './J16Skin.js';

// Visual geometry; runtime flight data and hardpoints live in the J-16 config.
// All dimensions are metres, +Y up, -Z forward. A separate rig node owns each
// movable assembly; meshes and local hinge frames survive the GLB export.
export const J16_DIMENSIONS = {length:21.95,wingspan:14.70,groundHeight:6.36};
export const J16_WORKZONES = {
  nose:{label:'机头区',color:0x4b9fea,includes:'座舱、机头、前起落架',shellRange:[null,-2.48]},
  mid:{label:'中段区',color:0xf2a347,includes:'机背、进气道、主起落架、机翼',shellRange:[-2.48,4.75]},
  tail:{label:'机尾区',color:0x62c396,includes:'尾翼、双发动机',shellRange:[4.75,null]},
};
const rad=T.MathUtils.degToRad, color=h=>new T.Color(h).convertSRGBToLinear();
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const v=a=>new T.Vector3(...a);
function data(o){return o.userData.exportExtras||o.userData;}

function stations(keys,step=.12){
  const out=[];
  for(let i=0;i<keys.length-1;i++){
    const a=keys[i],b=keys[i+1],count=Math.max(1,Math.ceil((b.z-a.z)/step));
    for(let j=0;j<count;j++){
      const t=j/count,entry={z:T.MathUtils.lerp(a.z,b.z,t)};
      for(const k of Object.keys(a).filter(k=>k!=='z')){
        const prev=keys[Math.max(0,i-1)],next=keys[Math.min(keys.length-1,i+2)];
        const m0=(b[k]-prev[k])/(b.z-prev.z),m1=(next[k]-a[k])/(next.z-a.z),dz=b.z-a.z;
        entry[k]=(2*t**3-3*t*t+1)*a[k]+(t**3-2*t*t+t)*dz*m0+(-2*t**3+3*t*t)*b[k]+(t**3-t*t)*dz*m1;
      }
      out.push(entry);
    }
  }
  out.push({...keys.at(-1)});return out;
}
// Broad dorsal volume from the supplied side reference: a high aft-cockpit
// shoulder flowing into a long, descending spine. Only the upper centre body
// moves; the wing roots, intake mouths and underside retain their coordinates.
function geometry(positions,indices,uv){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
function merge(geometries){
  const p=[],n=[],uv=[],idx=[];let at=0;
  for(const g of geometries){
    p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);
    uv.push(...(g.attributes.uv?.array||new Float32Array(g.attributes.position.count*2)));
    const indices=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i);
    for(const i of indices)idx.push(i+at);at+=g.attributes.position.count;
  }
  const g=geometry(p,idx,uv);g.setAttribute('normal',new T.Float32BufferAttribute(n,3));return g;
}
function segment(a,b,r1,r2,segments=32){
  const x=v(a),y=v(b),d=y.clone().sub(x);
  const g=new T.CylinderGeometry(r2,r1,d.length(),segments,1);
  g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize())));
  g.translate(...x.add(y).multiplyScalar(.5).toArray());return g;
}
function box(size,position){return new T.BoxGeometry(...size).translate(...position);}
function closedSlice(g,normal,constant){
  const inside=splitCadVolume(new T.Mesh(g),[{normal:v(normal),constant}]);
  inside.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(inside.attributes.position.count*2),2));
  if(!inside.index)inside.setIndex(Array.from({length:inside.attributes.position.count},(_,i)=>i));return inside;
}
function tube(points,r=.025,segments=48){return new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v)),segments,r,8,false);}
function sliceGeometry(g,plane){
  const positions=[],normals=[],uv=[],indices=[],seen=new Map();
  const index=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i);
  const read=i=>({p:new T.Vector3().fromBufferAttribute(g.attributes.position,i),n:new T.Vector3().fromBufferAttribute(g.attributes.normal,i),u:new T.Vector2().fromBufferAttribute(g.attributes.uv,i)});
  const emit=p=>{
    const key=[...p.p.toArray(),...p.n.toArray(),...p.u.toArray()].map(x=>Math.round(x*1e6)).join(',');
    if(seen.has(key))return seen.get(key);
    const i=positions.length/3;positions.push(...p.p.toArray());normals.push(...p.n.clone().normalize().toArray());uv.push(...p.u.toArray());seen.set(key,i);return i;
  };
  for(let i=0;i<index.length;i+=3){
    const triangle=[read(index[i]),read(index[i+1]),read(index[i+2])],poly=[];
    let a=triangle[2],da=plane(a.p);
    for(const b of triangle){
      const db=plane(b.p);
      if((da>=0)!==(db>=0)){const t=da/(da-db);poly.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t),u:a.u.clone().lerp(b.u,t)});}
      if(db>=0)poly.push(b);a=b;da=db;
    }
    for(let j=1;j<poly.length-1;j++)indices.push(emit(poly[0]),emit(poly[j]),emit(poly[j+1]));
  }
  const out=geometry(positions,indices,uv);out.setAttribute('normal',new T.Float32BufferAttribute(normals,3));return out;
}
// Subtract a convex opening without moving its rim vertices. Quantising the
// clipped CAD vertices used to turn matching rims into little triangular gaps.
function subtractGeometry(g,planes){
  const outside=[];let inside=g;
  for(const plane of planes){
    // A coplanar face belongs to the cutter until the remaining planes have
    // been applied; retaining it here would cap the inlet across its mouth.
    const piece=sliceGeometry(inside,p=>-plane(p)-1e-6);
    if(piece.index.count)outside.push(piece);
    inside=sliceGeometry(inside,p=>plane(p)+1e-6);
    if(!inside.index.count)break;
  }
  return merge(outside);
}

// A common NACA section is sampled before splitting. Adjacent fixed/moving
// patches therefore meet at exactly the same hinge and have identical camber.
function foil(secs,from=0,to=1,side=1,vertical=false,resolution={}){
  const positions=[],uv=[],indices=[],ns=resolution.span??18,nc=resolution.chord??26;
  const interp=x=>{
    let i=0;while(i<secs.length-2&&x>secs[i+1].x)i++;
    const a=secs[i],b=secs[i+1],t=(x-a.x)/(b.x-a.x);
    return {x,y:T.MathUtils.lerp(a.y,b.y,t),le:T.MathUtils.lerp(a.le,b.le,t),te:T.MathUtils.lerp(a.te,b.te,t),thickness:T.MathUtils.lerp(a.thickness,b.thickness,t)};
  };
  const ring=2*(nc+1);
  for(let i=0;i<=ns;i++){
    const s=interp(T.MathUtils.lerp(secs[0].x,secs.at(-1).x,i/ns)),c=s.te-s.le;
    for(let face=0;face<2;face++)for(let j=0;j<=nc;j++){
      const t=T.MathUtils.lerp(typeof from==='function'?from(s.x):from,typeof to==='function'?to(s.x):to,face===0?j/nc:1-j/nc);
      const thickness=5*s.thickness*c*(.2969*Math.sqrt(Math.max(t,0))-.126*t-.3516*t*t+.2843*t**3-.1036*t**4);
      const h=s.y+(face===0?1:-1)*thickness;
      if(vertical)positions.push(side*h,s.x,s.le+t*c);else positions.push(side*s.x,h,s.le+t*c);
      uv.push(t,i/ns);
    }
  }
  for(let i=0;i<ns;i++)for(let j=0;j<ring;j++){
    const a=i*ring+j,b=i*ring+(j+1)%ring,c=b+ring,d=a+ring;indices.push(a,b,c,a,c,d);
  }
  for(const end of [0,ns]){
    const base=end*ring;for(let j=1;j<ring-1;j++)indices.push(base,base+j+(end?1:0),base+j+(end?0:1));
  }
  if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  return geometry(positions,indices,uv);
}

function glassRows(rows){
  const p=[],uv=[],idx=[],n=48;
  rows.forEach((s,i)=>{for(let j=0;j<=n;j++){const a=j/n*Math.PI;p.push(s.w*Math.cos(a),s.y+s.h*Math.sin(a),s.z);uv.push(j/n,i/(rows.length-1));}});
  for(let i=0;i<rows.length-1;i++)for(let j=0;j<n;j++){const a=i*(n+1)+j,b=a+1,c=b+n+1,d=a+n+1;idx.push(a,c,b,a,d,c);}
  return geometry(p,idx,uv);
}
function bow(s){const pts=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI;pts.push([s.w*Math.cos(a),s.y+s.h*Math.sin(a),s.z]);}return tube(pts,.024,64);}

export function buildJ16Model(cad,profile,noseTrace){
  const noseUpper=profileCurve(noseTrace.upper.map(p=>[p.z,p.modelY]));
  const noseLower=profileCurve(noseTrace.lower.map(p=>[p.z,p.modelY]));
  const ct=noseTrace.canopy,canopyFront=ct.frontZ,canopyRear=ct.rearZ;
  const zFromPixel=x=>-10.975+(1155-x)*noseTrace.metresPerPixel;
  const windscreenZ=zFromPixel(ct.windscreenFramePixel),centreFrameZ=zFromPixel(ct.centreFramePixel);
  const canopyTop=profileCurve(ct.upper.map(p=>[p.z,p.modelY]));
  const canopySill=profileCurve(ct.sill.map(p=>[p.z,p.modelY]));
  const canopyWidth=profileCurve(ct.widths);
  const canopyAt=z=>{z=T.MathUtils.clamp(z,canopyFront,canopyRear);const y=canopySill(z);return {z,y,w:canopyWidth(z),h:Math.max(.002,canopyTop(z)-y)};};
  const canopyRows=[...new Set([...Array.from({length:81},(_,i)=>T.MathUtils.lerp(canopyFront,canopyRear,i/80)),windscreenZ,centreFrameZ])].sort((a,b)=>a-b).map(canopyAt);
  const dorsalRows=[{z:-4.8,top:-.20},...ct.dorsal.map(p=>({z:p.z,top:p.modelY})),
    {z:-1,top:1},{z:0,top:.70},{z:1,top:.42},{z:2,top:.20},{z:3,top:.02},
    {z:4,top:-.15},{z:5,top:-.30},{z:6.2,top:-.40},{z:7.2,top:-.45},{z:8.15,top:-.47},
  ].sort((a,b)=>a.z-b.z);
  const dorsalTop=profileCurve(dorsalRows.map(p=>[p.z,p.top]));
  const lastLower=noseTrace.lower.at(-1);
  // The next interval is hidden by stores in the photo. Continue the measured
  // gentle rise, then join the intake region with a smooth, explicit blend.
  const lowerRise=Math.tan(4.5*Math.PI/180);
  const inferredLower=z=>lastLower.modelY+(z-lastLower.z)*lowerRise;
  const root=new T.Group();root.name='J16_white_model';
  root.userData.exportExtras={aircraft:'J-16',stage:'white model',units:'metres',forward:'-Z',dimensions:J16_DIMENSIONS};
  const materials={
    skin:new T.MeshStandardMaterial({color:color(0xb2bac0),roughness:.72,metalness:.08,side:T.DoubleSide}),
    radome:new T.MeshStandardMaterial({color:color(0xa0a8ad),roughness:.83,metalness:.01,side:T.DoubleSide}),
    metal:new T.MeshStandardMaterial({color:color(0x8a9092),roughness:.45,metalness:.63,side:T.DoubleSide}),
    hot:new T.MeshStandardMaterial({color:color(0x4a4947),roughness:.68,metalness:.45,side:T.DoubleSide}),
    heatMetal:new T.MeshStandardMaterial({color:color(0x746c60),roughness:.54,metalness:.72,side:T.DoubleSide}),
    nozzleDark:new T.MeshStandardMaterial({color:color(0x41474a),roughness:.55,metalness:.70,side:T.DoubleSide}),
    glass:new T.MeshStandardMaterial({color:color(0x71909a),roughness:.12,metalness:.12,transparent:true,opacity:.40,side:T.DoubleSide,depthWrite:false}),
    optics:new T.MeshStandardMaterial({color:color(0x101419),roughness:.18,metalness:.12,side:T.DoubleSide}),
    tire:new T.MeshStandardMaterial({color:color(0x252a2c),roughness:.93,metalness:0}),
    interior:new T.MeshStandardMaterial({color:color(0x343e40),roughness:.88,metalness:.02,side:T.DoubleSide}),
    wheelhub:new T.MeshStandardMaterial({color:color(0x58634b),roughness:.72,metalness:.28,side:T.DoubleSide}),
    duct:new T.MeshStandardMaterial({color:color(0x141c21),roughness:.91,metalness:.02,side:T.DoubleSide}),
  };
  for(const [name,m]of Object.entries(materials))m.name='J16 '+name;
  const hullSection=z=>{
    let i=0;while(i<profile.z.length-2&&z>profile.z[i+1])i++;
    const t=T.MathUtils.clamp((z-profile.z[i])/(profile.z[i+1]-profile.z[i]),0,1);
    return {cy:T.MathUtils.lerp(profile.centerY[i],profile.centerY[i+1],t),r:profile.radii[i].map((r,j)=>T.MathUtils.lerp(r,profile.radii[i+1][j],t))};
  };
  const frontUpper=noseUpper(-7.58),frontLower=noseLower(-7.58);
  const noseRows=stations([
    {z:-7.58,shift:(frontUpper+frontLower)/2+.70,scale:(frontUpper-frontLower)/1.22},{z:-7,shift:.393,scale:1.10},
    {z:-6.25,shift:.25,scale:1},{z:-5.20,shift:0,scale:1},
  ],.07);
  const noseHeight=(y,z)=>{
    if(z>=-1.60)return y;
    let i=0;while(i<noseRows.length-2&&z>noseRows[i+1].z)i++;
    const a=noseRows[i],b=noseRows[i+1],t=T.MathUtils.clamp((z-a.z)/(b.z-a.z),0,1),cy=hullSection(z).cy;
    const section=hullSection(z);
    const shift=z>=-5.20?0:T.MathUtils.lerp(a.shift,b.shift,t),scale=z>=-5.20?1:T.MathUtils.lerp(a.scale,b.scale,t);
    const base=cy+shift+(y-cy)*scale;
    const oldBottom=cy-section.r[section.r.length*3/4];
    const target=z<=lastLower.z?noseLower(z):inferredLower(z);
    const blend=1-smooth((z+2.23)/.63);
    const baseBottom=cy+shift+(oldBottom-cy)*scale,cut=cy+shift+(-.30-cy)*scale;
    // Compress below the existing cockpit cut plane with an increasing map.
    // Merely pushing the belly above a stationary section centre folds faces.
    const newBottom=T.MathUtils.lerp(baseBottom,target,blend);
    return y>=-.30?base:cut+(base-cut)*(cut-newBottom)/(cut-baseBottom);
  };
  const dorsalHeight=(x,y,z)=>{
    if(z<=dorsalRows[0].z||z>=dorsalRows.at(-1).z)return y;
    const target=dorsalTop(z);
    const section=hullSection(z),top=section.cy+section.r[section.r.length/4];
    // Weight relative to each section's crown, not a fixed world height:
    // otherwise the deformation vanishes abruptly on the low aft fuselage.
    const floor=T.MathUtils.lerp(-.30,section.cy,smooth((z+2.48)/2.48));
    const weight=smooth((y-floor)/Math.max(.05,top-floor));
    return y+Math.max(0,target-top)*weight*(1-smooth((Math.abs(x)-.55)/1.05))*smooth((z+4.8));
  };
  const hullIntersection=(value,z,vertical=true,upper=true)=>{
    const s=hullSection(z),hits=[];
    for(let j=0;j<s.r.length;j++){
      const k=(j+1)%s.r.length,a=j/s.r.length*Math.PI*2,b=k/s.r.length*Math.PI*2;
      const p=[s.r[j]*Math.cos(a),s.cy+s.r[j]*Math.sin(a)],q=[s.r[k]*Math.cos(b),s.cy+s.r[k]*Math.sin(b)];
      const axis=vertical?0:1,other=1-axis;
      if((p[axis]<=value)!==(q[axis]<=value))hits.push(T.MathUtils.lerp(p[other],q[other],(value-p[axis])/(q[axis]-p[axis])));
    }
    const hit=hits.length?(upper?Math.max(...hits):Math.min(...hits)):(vertical?s.cy:.68);
    return vertical?dorsalHeight(value,noseHeight(hit,z),z):hit;
  };
  const mesh=(name,g,mat='skin',parent=root)=>{
    const o=new T.Mesh(g,materials[mat]);o.name=name;o.userData.exportExtras={material:mat};parent.add(o);return o;
  };
  const joint=(name,pivot,role,axis=[1,0,0],extra={},parent=root)=>{
    const o=new T.Group();o.name=name;o.position.fromArray(pivot);o.userData.exportExtras={role,axis,pivot,...extra};parent.add(o);return o;
  };
  const attach=(name,g,mat,parent)=>mesh(name,g.translate(...parent.position.clone().negate().toArray()),mat,parent);
  const wing=J16_WING;
  const wingRoots=new Map([-1,1].map(side=>[side,wingRootBlend(wing,side)]));
  const mainWellCut=side=>{
    const b=J16_GEAR.mainBay;
    return [p=>p.z-(b.z-b.length/2),p=>b.z+b.length/2-p.z,p=>b.roof-p.y,
      p=>b.width/2-(p.x-side*b.x),p=>b.width/2+(p.x-side*b.x)];
  };
  // Re-tessellate the two work areas from the same unrounded CAD sections.
  // All replacement panels cut this one surface, rather than covering holes
  // left by differently sized, independently rounded CAD cutters.
  const repairedShell=()=>{
    const cuts=[-7.58,-7.14,-5.85,-5.03,-2.48,-2.35,-2.23,-2.40,-1.50,-1.20,.05,.62,.95,1.2,3.75,4.75];
    const zs=[...new Set([...profile.z.filter(z=>z<4.75),...cuts])].sort((a,b)=>a-b);
    const p=[],uv=[],idx=[],n=profile.radii[0].length;
    const sectionCache=new Map();
    const sectionAt=z=>{
      if(sectionCache.has(z))return sectionCache.get(z);
      const s=hullSection(z),cy=noseHeight(s.cy,z);
      const points=s.r.map((r,j)=>{const a=j/n*Math.PI*2,x=r*Math.cos(a);return [x,dorsalHeight(x,noseHeight(s.cy+r*Math.sin(a),z),z)-cy];});
      const result={cy,points};sectionCache.set(z,result);return result;
    };
    for(const [i,z]of zs.entries()){
      const s=sectionAt(z);
      for(let j=0;j<n;j++){
        p.push(s.points[j][0],s.cy+s.points[j][1],z);uv.push(j/n,(z+7.58)/18.555);
        if(i<zs.length-1){const k=i*n+j,b=i*n+(j+1)%n;idx.push(k,b,b+n,k,b+n,k+n);}
      }
    }
    const bodyOutside=p=>{
      const {cy,points}=sectionAt(p.z),dx=p.x,dy=p.y-cy,rr=Math.hypot(dx,dy),ux=dx/rr,uy=dy/rr;
      let radius=0;
      for(let j=0;j<n;j++){
        const a=points[j],b=points[(j+1)%n],ex=b[0]-a[0],ey=b[1]-a[1],den=ux*ey-uy*ex;
        if(Math.abs(den)<1e-10)continue;
        const r=(a[0]*ey-a[1]*ex)/den,t=(a[0]*uy-a[1]*ux)/den;
        if(r>0&&t>=0&&t<=1)radius=Math.max(radius,r);
      }
      return rr-radius;
    };
    let g=geometry(p,idx,uv);
    const cutters=[
      [p=>p.z+7.58,p=>-2.48-p.z,p=>p.y-noseHeight(-.30,p.z)],
      [p=>p.z+2.35,p=>.62-p.z,p=>p.y-hullSection(p.z).cy,p=>.49-p.x,p=>.49+p.x],
      [p=>p.z+5.03,p=>-2.23-p.z,p=>noseHeight(-.89,p.z)-p.y,p=>.37-p.x,p=>.37+p.x],
      [p=>p.z+7.14,p=>-5.85-p.z,p=>p.y-noseHeight(-.56,p.z),p=>noseHeight(-.30,p.z)-p.y,p=>-.44-p.x],
    ];
    for(const side of [-1,1]){
      const blend=wingRoots.get(side),bayCut=mainWellCut(side);
      cutters.push(...blend.cutters,bayCut);
      const blendSkin=subtractGeometry(sliceGeometry(blend.main,bodyOutside),bayCut);
      mesh('wing_body_blend_'+(side<0?'L':'R'),blendSkin);
      mesh('wing_body_leading_blend_'+(side<0?'L':'R'),sliceGeometry(blend.leading,bodyOutside));
      cutters.push(intakeCutter(side));
      const tag=side<0?'L':'R',surfaces=intakeSurfaces(side);
      mesh('intake_'+tag+'_outer_cowl',sliceGeometry(surfaces.outer,bodyOutside));
      mesh('intake_'+tag+'_lip',surfaces.lip);
      mesh('intake_'+tag+'_inner_duct',surfaces.inner,'duct');
    }
    for(const cutter of cutters)g=subtractGeometry(g,cutter);
    return g;
  };
  const frontShell=repairedShell();
  const tail=tailSurface(profile,hullSection,dorsalHeight);
  const exhaustCuts=side=>[p=>p.z-8.15,p=>9.25-p.z,p=>.535-Math.hypot(p.x-side*J16_TAIL.engineX,p.y-J16_TAIL.engineY)];
  let tailAft=tail.aft,tailBulkhead=tail.bulkhead;
  // The bulkhead lies exactly on z 8.15, so it is opened by the engine disc alone
  // (the slim tail beam leaves the ring spanning the engine openings).
  const boreCut=side=>[p=>.535-Math.hypot(p.x-side*J16_TAIL.engineX,p.y-J16_TAIL.engineY)];
  for(const side of [-1,1]){tailAft=subtractGeometry(tailAft,exhaustCuts(side));tailBulkhead=subtractGeometry(tailBulkhead,boreCut(side));}
  cad.traverse(o=>{if(o.isMesh){o.material=materials.skin;o.name='J16_fixed_CAD_fuselage';o.userData.exportExtras={material:'skin',origin:'cleaned J-11 CAD'};}});root.add(cad);
  const shell=[];cad.traverse(o=>{if(o.isMesh)shell.push(o);});
  for(const skin of shell){
    const p=skin.geometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,dorsalHeight(p.getX(i),noseHeight(p.getY(i),p.getZ(i)),p.getZ(i)));
    p.needsUpdate=true;skin.geometry.computeVertexNormals();
    const tip=tail.tip;
    skin.geometry=merge([frontShell,tail.forward,tailAft,tailBulkhead]);
    for(const side of [-1,1]){
      const door=joint('parachute_cover_'+side,[side*.06,-.60,10.48],'parachute-door',[0,1,0],{side,limitsDeg:[0,50]});
      attach('parachute_cover_skin_'+side,sliceGeometry(tip,p=>side*p.x),'skin',door);
    }
  }
  mesh('parachute_compartment_pack',new T.SphereGeometry(.095,24,16).scale(1,.85,1.6).translate(0,-.60,10.48),'interior');
  const joinTailRoot=(g,outward)=>{
    // Match the clipped root to the actual triangulated shell, including the
    // small difference between an analytic section and the loft between rows.
    root.updateMatrixWorld(true);const ray=new T.Raycaster(),direction=v(outward),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const q=new T.Vector3().fromBufferAttribute(p,i);if(Math.abs(tail.outside(q))>.012)continue;
      ray.set(q.clone().addScaledVector(direction,.08),direction.clone().negate());ray.far=.16;
      const h=ray.intersectObjects(shell)[0];if(h)p.setXYZ(i,...h.point.toArray());
    }
    p.needsUpdate=true;g.computeVertexNormals();return g;
  };

  // Trace the drooping tip, rising upper line and shallow lower belly as
  // independent curves. A common loft keeps the shorter radome flush with
  // the forebody instead of attaching a symmetric cone to a low cylinder.
  const noseWidth=profileCurve([[-10.975,.003],[-10.70,.11],[-10.30,.26],[-9.75,.40],[-9.15,.51],[-8.60,.57],[-8.12,.60],[-7.58,.612]]);
  const noseSections=Array.from({length:87},(_,i)=>{
    const z=T.MathUtils.lerp(-10.975,-7.58,i/86),epsilon=i===0?.003:0;
    return {z,w:noseWidth(z),top:noseUpper(z)+epsilon,bottom:noseLower(z)-epsilon};
  });
  const np=[],nu=[],ni=[],noseSegments=80;
  noseSections.forEach((s,i)=>{
    for(let j=0;j<noseSegments;j++){
      const a=j/noseSegments*Math.PI*2,cy=(s.top+s.bottom)/2;
      np.push(s.w*Math.cos(a),cy+(s.top-s.bottom)/2*Math.sin(a),s.z);nu.push(j/noseSegments,i/(noseSections.length-1));
      if(i<noseSections.length-1){const k=i*noseSegments+j,b=i*noseSegments+(j+1)%noseSegments;ni.push(k,b,b+noseSegments,k,b+noseSegments,k+noseSegments);}
    }
  });
  for(let j=1;j<noseSegments-1;j++)ni.push(0,j+1,j);
  const noseGeometry=geometry(np,ni,nu);
  mesh('J16_radome_no_nose_pitot',sliceGeometry(noseGeometry,p=>noseTrace.radomeRootZ-p.z),'radome');
  mesh('J16_forebody_transition',sliceGeometry(noseGeometry,p=>p.z-noseTrace.radomeRootZ));

  // New upper forebody bridges the cleaned CAD shell to a tandem cockpit rim.
  const crown=[],crownUv=[],crownIndex=[],rows=[...new Set([...Array.from({length:101},(_,i)=>T.MathUtils.lerp(-7.58,-2.48,i/100)).filter(z=>z<canopyFront||z>canopyRear),...canopyRows.map(s=>s.z),canopyFront,canopyRear])].sort((a,b)=>a-b).flatMap(z=>z===canopyRear?[{z,y:noseUpper(z),inside:true},{z,y:noseUpper(z),inside:false}]:[{z,y:noseUpper(z)}]),nc=20;
  for(let side=0;side<2;side++){
    const base=crown.length/3;
    rows.forEach((s,i)=>{
      const glass=canopyAt(s.z);
      const inside=s.inside??(s.z>canopyFront&&s.z<canopyRear),inner=inside?glass.w:0,roof=inside?glass.y:s.y;
      const outer=hullIntersection(-.30,s.z,false,true);
      for(let j=0;j<=nc;j++){
        const t=j/nc,x=(side?1:-1)*T.MathUtils.lerp(outer,inner,t);
        let y=T.MathUtils.lerp(noseHeight(-.30,s.z),roof,t)+.015*Math.sin(t*Math.PI)*smooth((canopyRear-s.z)/.3);
        if(s.z>=canopyRear&&!inside){
          const tail=canopyAt(canopyRear),ax=Math.abs(x),cut=noseHeight(-.30,s.z);
          const arch=ax<=tail.w?tail.y+tail.h*Math.sqrt(Math.max(0,1-(ax/tail.w)**2)):
            T.MathUtils.lerp(tail.y,cut,T.MathUtils.clamp((ax-tail.w)/(outer-tail.w),0,1));
          const lifted=arch+(hullIntersection(0,s.z)-(tail.y+tail.h))*smooth(1-ax/outer);
          y=T.MathUtils.lerp(lifted,hullIntersection(x,s.z),smooth((s.z-canopyRear)/(-2.48-canopyRear)));
        }
        if(s.z<canopyFront){
          const top=noseUpper(s.z),bottom=noseLower(s.z),cy=(top+bottom)/2;
          const ellipse=cy+(top-bottom)/2*Math.sqrt(Math.max(0,1-(x/noseWidth(s.z))**2));
          y=T.MathUtils.lerp(ellipse,y,smooth((s.z+7.58)/(canopyFront+7.58)));
        }
        crown.push(x,y,s.z);crownUv.push(t,i/(rows.length-1));
      }
    });
    // The cockpit opening and the full rear arch have different cross-section
    // widths. They share a boundary but must never be joined as matching grid
    // columns: that created the folded triangular strip behind the canopy.
    for(let i=0;i<rows.length-1;i++)if(rows[i+1].z!==rows[i].z)for(let j=0;j<nc;j++){const a=base+i*(nc+1)+j,b=a+1,c=b+nc+1,d=a+nc+1;if(side)crownIndex.push(a,b,c,a,c,d);else crownIndex.push(a,c,b,a,d,c);}
    // Fair the fairing behind the canopy: the canopy-width arch blending into the
    // spine left a concave saddle beside the hump. Relax the interior heights;
    // the canopy rear row, the spine centreline, the outer edge and the join at
    // z -2.48 stay fixed, so no seam moves.
    const rear=rows.map((s,i)=>i).filter(i=>rows[i].z>canopyRear&&i<rows.length-1&&rows[i-1]?.z>=canopyRear&&!rows[i].inside);
    for(let pass=0;pass<40;pass++)for(const i of rear)for(let j=1;j<nc;j++){
      const at=(ii,jj)=>(base+ii*(nc+1)+jj)*3+1;
      crown[at(i,j)]=(crown[at(i-1,j)]+crown[at(i+1,j)]+crown[at(i,j-1)]+crown[at(i,j+1)]+4*crown[at(i,j)])/8;
    }
  }
  mesh('J16_double_cockpit_shoulders',geometry(crown,crownIndex,crownUv));
  mesh('cockpit_floor',box([1.13,.10,3.65],[0,-.30,-4.76]),'interior');
  for(const side of [-1,1]){
    const p=[],u=[],idx=[];
    canopyRows.forEach((s,i)=>{
      p.push(side*Math.max(.005,s.w-.025),s.y-.028,s.z,side*Math.max(.004,s.w-.065),s.y-.16,s.z);u.push(i/canopyRows.length,0,i/canopyRows.length,1);
      if(i<canopyRows.length-1){const a=i*2;idx.push(a,a+1,a+3,a,a+3,a+2);}
    });
    mesh('cockpit_inner_sill_'+side,geometry(p,idx,u),'interior');
  }
  // Fairing end bulkheads close the small height difference to the CAD crown.
  for(const end of [0]){
    const s=rows[end],outer=hullIntersection(-.30,s.z,false,true),p=[],u=[],idx=[];
    for(let i=0;i<=32;i++){
      const x=T.MathUtils.lerp(-outer,outer,i/32),t=1-Math.abs(x)/outer;
      p.push(x,T.MathUtils.lerp(noseHeight(-.30,s.z),s.y,t)+.015*Math.sin(t*Math.PI),s.z,
        x,hullIntersection(x,s.z),s.z);u.push(i/32,0,i/32,1);
      if(i<32){const a=i*2;idx.push(a,a+1,a+3,a,a+3,a+2);}
    }
    mesh('cockpit_fairing_end_'+end,geometry(p,idx,u));
  }
  const fixedRows=canopyRows.filter(s=>s.z<=windscreenZ+1e-8);
  mesh('fixed_windscreen_glass',glassRows(fixedRows),'glass');
  mesh('fixed_windscreen_rear_frame',bow(fixedRows.at(-1)));
  const canopy=joint('canopy_hinge',[0,ct.hingeY,canopyRear],'canopy',[1,0,0],{limitsDeg:[0,55],reference:'orthographic canopy-profile.json'});
  const moving=canopyRows.filter(s=>s.z>=windscreenZ-1e-8);
  attach('canopy_front_seat_glass',glassRows(moving.filter(s=>s.z<=centreFrameZ+1e-8)),'glass',canopy);
  attach('canopy_rear_seat_glass',glassRows(moving.filter(s=>s.z>=centreFrameZ-1e-8)),'glass',canopy);
  for(const z of [windscreenZ,centreFrameZ,canopyRear]){
    const s=canopyAt(z);
    attach('canopy_bow_'+z,bow(s),'skin',canopy);
  }
  for(const side of [-1,1])attach('canopy_lower_rail_'+side,tube(moving.map(s=>[side*s.w,s.y,s.z]),.029,80),'skin',canopy);
  // Seats are deliberately low enough to clear the closed glass at both stations.
  for(const [i,z,y]of [[0,-5.65,.27],[1,-4.21,.38]]){
    mesh('seat_'+i+'_cushion',box([.46,.12,.50],[0,y,z]),'interior');
    mesh('seat_'+i+'_back',box([.45,.79,.18],[0,y+.39,z+.25]),'interior');
    mesh('seat_'+i+'_headbox',box([.31,.23,.20],[0,y+.86,z+.27]),'interior');
    for(const side of [-1,1])mesh('seat_'+i+'_arm_'+side,box([.065,.09,.45],[side*.27,y+.27,z]),'interior');
    mesh('seat_'+i+'_instrument_panel',box([.88,.36,.15],[0,y+.38,z-.59]),'interior');
    for(const side of [-1,0,1])mesh('seat_'+i+'_display_'+side,box([.19,.17,.012],[side*.24,y+.40,z-.50]),'hot');
  }
  mesh('HUD_combiner',box([.25,.20,.01],[0,.78,-6.55]),'glass');
  const actuator=joint('canopy_actuator_rod',[.12,ct.hingeY-.35,canopyRear-.10],'canopy-actuator');
  mesh('canopy_actuator_barrel',segment([.12,ct.hingeY-.70,canopyRear+.18],[.12,ct.hingeY-.30,canopyRear-.05],.037,.037,24),'metal');
  mesh('canopy_actuator_piston',segment([0,0,0],[0,.28,-.13],.018,.018,24),'metal',actuator);
  // A single conformal housing replaces the floating pod and oval pedestal.
  // Sample the actual rebuilt skin, since its shoulder is well below the
  // centreline crown and cannot be positioned from a guessed fixed height.
  root.updateMatrixWorld(true);
  const irstSkin=['J16_double_cockpit_shoulders','J16_forebody_transition','J16_radome_no_nose_pitot'].map(name=>root.getObjectByName(name));
  root.traverse(o=>{if(o.isMesh&&o.name==='J16_fixed_CAD_fuselage')irstSkin.push(o);});
  const irstRay=new T.Raycaster(),irstCache=new Map();
  const irstSkinY=(x,z)=>{
    const key=x.toFixed(6)+','+z.toFixed(6);if(irstCache.has(key))return irstCache.get(key);
    irstRay.set(new T.Vector3(x,3,z),new T.Vector3(0,-1,0));
    const hit=irstRay.intersectObjects(irstSkin)[0];if(!hit)throw new Error('No skin under IRST at '+x+','+z);
    irstCache.set(key,hit.point.y);return hit.point.y;
  };
  const irstX=.34,irstFrontY=irstSkinY(irstX,-7.62)+.13;
  const caseKeys=[
    {z:-7.62,width:.111,height:.111,y:irstFrontY},
    {z:-7.57,width:.114,height:.114,y:irstFrontY+.007},
    {z:-7.25,width:.12,height:.12,y:irstFrontY+.04},
    {z:-7.12,width:.09,height:.09,y:irstFrontY+.035},
    {z:-6.98,width:.015,height:.015,y:irstSkinY(irstX,-6.98)-.02},
  ];
  const caseSections=stations(caseKeys,.025),caseCentre=profileCurve(caseSections.map(s=>[s.z,s.y]));
  const caseHeight=profileCurve(caseSections.map(s=>[s.z,s.height]));
  const irstCase=loftFuselage(caseSections,48,1,{capStart:false,capEnd:true});irstCase.translate(irstX,0,0);
  const cp=irstCase.attributes.position;
  for(let i=0;i<cp.count;i++){
    const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i);
    if(y<caseCentre(z)-.00001){
      const centre=caseCentre(z),t=(centre-y)/(.88*caseHeight(z));
      const attached=centre+(irstSkinY(x,z)-.015-centre)*smooth(t/.82),blend=smooth((z+7.62)/.10);
      cp.setY(i,T.MathUtils.lerp(y,attached,blend));
    }
  }
  irstCase.computeVertexNormals();
  mesh('IRST_sensor_housing',irstCase);
  const irst=joint('IRST_gimbal',[irstX,irstFrontY,-7.62],'sensor-gimbal',[0,1,0]);
  const opticalDome=new T.SphereGeometry(.102,32,12,0,Math.PI*2,0,Math.PI/2);
  opticalDome.scale(1,.65,1);opticalDome.rotateX(-Math.PI/2-rad(8));
  mesh('IRST_optical_window',opticalDome,'optics',irst);
  const rim=new T.TorusGeometry(.106,.008,8,40);rim.rotateX(-rad(8));
  mesh('IRST_window_rim',rim,'hot',irst);

  const atSpan=x=>{let i=0;while(i<wing.length-2&&x>wing[i+1].x)i++;const a=wing[i],b=wing[i+1],t=(x-a.x)/(b.x-a.x);return Object.fromEntries(Object.keys(a).map(k=>[k,T.MathUtils.lerp(a[k],b[k],t)]));};
  for(const side of [-1,1]){
    const tag=side<0?'L':'R';
    const gap=.012,front=x=>leadingFraction(x)+gap/(wingAt(x).te-wingAt(x).le),back=x=>trailingFraction(x)-gap/(wingAt(x).te-wingAt(x).le);
    const sections=(a,b)=>[atSpan(a),...wing.filter(s=>s.x>a&&s.x<b),atSpan(b)];
    mesh('wing_fixed_'+tag,foil(sections(2.74,7.17),front,back,side));
    mesh('wing_root_trailing_'+tag,foil(sections(2.74,2.80),back,1,side,false,{span:2,chord:12}));
    mesh('wing_tip_trailing_'+tag,foil(sections(6.10,7.17),back,1,side,false,{span:8,chord:16}));
    const leadingSecs=sections(1.76,7.17),p0=leadingSecs[0],p1=leadingSecs.at(-1);
    const leadingPivot=[side*p0.x,p0.y-.12,leadingHingeZ(p0.x)],leadingAxis=[side*(p1.x-p0.x),p1.y-.04-leadingPivot[1],leadingHingeZ(p1.x)-leadingPivot[2]];
    const leading=joint('leading_edge_'+tag+'_0',leadingPivot,'slat',leadingAxis,{side,limitsDeg:[0,25]});
    attach('slat_skin_'+tag+'_0',foil(leadingSecs,0,x=>leadingFraction(x)-gap/(wingAt(x).te-wingAt(x).le),side),'skin',leading);
    const rearSecs=sections(2.85,6.06),a=rearSecs[0],b=rearSecs.at(-1),pivot=[side*a.x,a.y-.10,trailingHingeZ(a.x)];
    const g=joint('flaperon_hinge_'+tag,pivot,'flaperon',[side*(b.x-a.x),b.y-.045-pivot[1],trailingHingeZ(b.x)-pivot[2]],{side,limitsDeg:[-20,35]});
    attach('flaperon_skin_'+tag,foil(rearSecs,x=>trailingFraction(x)+gap/(wingAt(x).te-wingAt(x).le),1,side),'skin',g);
    // Universal wingtip rail; no J-11 stepped PL-8 adaptor or J-16D pods.
    mesh('wingtip_rail_'+tag,box([.18,.17,2.30],[side*7.26,-.88,5.12]));
    const tailResolution={span:12,chord:20};
    const stab=joint('stabilator_hinge_'+tag,[side*J16_TAIL.stabilatorX,J16_TAIL.stabilatorY,J16_TAIL.stabilatorZ],'stabilator',[1,0,0],{side,limitsDeg:[-22,22]});
    mesh('stabilator_bearing_'+tag,joinTailRoot(sliceGeometry(segment([side*1.48,-.98,7.37],[side*1.805,-.98,7.37],.12,.11,32),tail.outside),[side,0,0]));
    attach('stabilator_trunnion_'+tag,segment([side*1.70,-.98,7.37],[side*1.96,-.98,7.37],.040,.040,24),'metal',stab);
    attach('stabilator_skin_'+tag,foil([{x:1.82,y:-.98,le:5.72,te:8.55,thickness:.045},{x:2.15,y:-1.0,le:6.1,te:8.97,thickness:.04},{x:4.92,y:-1.14,le:8.25,te:9.27,thickness:.035}],0,1,side,false,tailResolution),'skin',stab);
    const fins=[{x:-.58,y:J16_TAIL.finX,le:4.90,te:8.35,thickness:.065},{x:.8,y:1.54,le:5.65,te:8.49,thickness:.06},{x:3.32,y:1.59,le:7.60,te:8.47,thickness:.045}];
    // A straight swept hinge must also pass through the middle section. The
    // old kink made the rudder sweep through the fixed fin away from its axis.
    const finT=(fins[1].x-fins[0].x)/(fins[2].x-fins[0].x);
    fins[1].y=T.MathUtils.lerp(fins[0].y,fins[2].y,finT);
    const hingeZ=T.MathUtils.lerp(fins[0].le+.73*(fins[0].te-fins[0].le),fins[2].le+.73*(fins[2].te-fins[2].le),finT);
    fins[1].te=(hingeZ-.27*fins[1].le)/.73;
    const finFixed=merge([closedSlice(foil(fins,0,.73,side,true,tailResolution),[0,-1,-.18/.87],3.32+.18*7.60/.87),closedSlice(closedSlice(foil(fins,.73,1,side,true,tailResolution),[0,1,0],-2.68),[0,-1,-.18/.87],3.32+.18*7.60/.87)]);
    mesh('fin_fixed_'+tag,joinTailRoot(sliceGeometry(finFixed,tail.outside),[0,1,0]));
    const fp=fins[0],ft=fins.at(-1),pivotFin=[side*fp.y,fp.x,fp.le+.73*(fp.te-fp.le)];
    const rudder=joint('rudder_hinge_'+tag,pivotFin,'rudder',[side*(ft.y-fp.y),ft.x-fp.x,ft.le+.73*(ft.te-ft.le)-pivotFin[2]],{side,limitsDeg:[-25,25]});
    attach('rudder_skin_'+tag,closedSlice(closedSlice(foil(fins,.742,1,side,true,tailResolution),[0,1,0],.44),[0,-1,0],2.65),'skin',rudder);
  }

  const brake=joint('dorsal_airbrake_hinge',[0,hullIntersection(0,-2.35),-2.35],'airbrake',[1,0,0],{limitsDeg:[0,54]});
  // Skin is a closed, slightly crowned panel; its forward hinge stays fixed.
  const bp=[],bu=[],bi=[],bnz=40,bnx=16;
  for(let iz=0;iz<=bnz;iz++)for(let ix=0;ix<=bnx;ix++){
    const z=T.MathUtils.lerp(-2.35,.62,iz/bnz),x=T.MathUtils.lerp(-.49,.49,ix/bnx);
    bp.push(x,hullIntersection(x,z)+.002,z);bu.push(ix/bnx,iz/bnz);
  }
  for(let iz=0;iz<bnz;iz++)for(let ix=0;ix<bnx;ix++){const a=iz*(bnx+1)+ix,b=a+1,c=b+bnx+1,d=a+bnx+1;bi.push(a,c,b,a,d,c);}
  const back=bp.map((q,i)=>i%3===1?q-.025:q),backIndex=[];
  for(let i=0;i<bi.length;i+=3)backIndex.push(bi[i],bi[i+2],bi[i+1]);
  const edgeP=[],edgeUv=[],edgeIdx=[],wellP=[],wellUv=[],wellIdx=[];
  const edge=(a,b)=>{
    const at=edgeP.length/3,wt=wellP.length/3;
    for(const k of [a,b]){edgeP.push(...bp.slice(k*3,k*3+3),...back.slice(k*3,k*3+3));edgeUv.push(0,0,0,1);
      const p=bp.slice(k*3,k*3+3);wellP.push(p[0],p[1]-.003,p[2],p[0],p[1]-.12,p[2]);wellUv.push(0,0,0,1);}
    edgeIdx.push(at,at+1,at+3,at,at+3,at+2);wellIdx.push(wt,wt+1,wt+3,wt,wt+3,wt+2);
  };
  for(let i=0;i<bnx;i++){edge(i,i+1);edge(bnz*(bnx+1)+i,bnz*(bnx+1)+i+1);}
  for(let i=0;i<bnz;i++){edge(i*(bnx+1),(i+1)*(bnx+1));edge(i*(bnx+1)+bnx,(i+1)*(bnx+1)+bnx);}
  const brakeGeo=merge([geometry(bp,bi,bu),geometry(back,backIndex,bu),geometry(edgeP,edgeIdx,edgeUv)]);
  attach('dorsal_airbrake_skin',brakeGeo,'skin',brake);
  mesh('dorsal_airbrake_recess',merge([geometry(bp.map((q,i)=>i%3===1?q-.12:q),bi,bu),geometry(wellP,wellIdx,wellUv)]),'interior');

  // Flush wheel-bay doors and internal roofs are modelled separately.
  const bay=(name,x,z,width,length,bottom,roof,isMain=false)=>{
    const roofMesh=mesh(name+'_roof',box([width,.035,length],[x,roof,z]),'interior');
    roofMesh.userData.exportExtras.bay={x,z,width,length,roof};
    const bottomAt=(px,pz)=>{
      let y=hullIntersection(px,pz,true,false);
      if(isMain)y=Math.min(y,wingRoots.get(Math.sign(x)).height(Math.abs(px),pz,false));
      return Math.min(roof-.03,y+.015);
    };
    for(const side of [-1,1]){
      const positions=[],uv=[],indices=[],steps=40;
      for(let i=0;i<=steps;i++){
        const zz=z-length/2+length*i/steps,xx=x+side*width/2;
        positions.push(xx,bottomAt(xx,zz),zz,xx,roof,zz);uv.push(i/steps,0,i/steps,1);
        if(i<steps){const a=i*2;indices.push(a,a+1,a+3,a,a+3,a+2);}
      }
      mesh(name+'_side_'+side,geometry(positions,indices,uv),'interior');
    }
    for(const end of [-1,1]){
      const positions=[],uv=[],indices=[],steps=24,zz=z+end*length/2;
      for(let i=0;i<=steps;i++){
        const xx=x-width/2+width*i/steps;positions.push(xx,bottomAt(xx,zz),zz,xx,roof,zz);uv.push(i/steps,0,i/steps,1);
        if(i<steps){const a=i*2;indices.push(a,a+1,a+3,a,a+3,a+2);}
      }
      mesh(name+'_end_'+end,geometry(positions,indices,uv),'interior');
    }
    for(const side of [-1,1]){
      const hingeBottom=bottomAt(x+side*width/2,z);
      const inner=isMain&&side===-Math.sign(x),leafWidth=isMain?(inner?.30:width-.30):width/2;
      const door=joint(name+'_door_'+side,[x+side*width/2,hingeBottom,z],'gear-door',[0,0,1],{side,limitsDeg:[0,86],offsetHinge:inner,slide:inner?side*.28:0,drop:inner?.24:isMain?0:.04});
      const positions=[],uv=[],indices=[],nz=40,nx=12;
      for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
        // The port leaf carries a small overlapping seal under the centre seam.
        const xx=x+side*width/2-side*(leafWidth+(side<0?.008:-.005))*ix/nx,zz=z-length/2+.002+(length-.004)*iz/nz;
        positions.push(xx,bottomAt(xx,zz)-.017-(side<0?.001:0),zz);uv.push(ix/nx,iz/nz);
      }
      for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){const a=iz*(nx+1)+ix,b=a+1,c=b+nx+1,d=a+nx+1;indices.push(a,b,c,a,c,d);}
      attach(name+'_door_skin_'+side,geometry(positions,indices,uv),'skin',door);
      if(inner)for(const [label,offset]of [['front',-length*.30],['rear',length*.30]]){
        const attachX=x+side*width/2-side*.16;
        const attachY=bottomAt(attachX,z+offset)-.017-(side<0?.001:0)-hingeBottom+.050;
        const hinge=joint(name+'_offset_hinge_'+label,[x+side*width/2-side*.12,roof-.10,z+offset+(label==='front'?.21:-.21)],'door-link',[0,0,1],{
          telescopicLink:true,leg:door.name,knee:[-side*.16,attachY,offset],barrelLength:.40,middleLength:.41,pistonLength:.40,
        });
        mesh(hinge.name+'_upper',new T.CylinderGeometry(.018,.018,.40,12,1),'skin',hinge);
        mesh(hinge.name+'_middle',new T.CylinderGeometry(.014,.014,.41,12,1),'metal',hinge);
        mesh(hinge.name+'_lower',new T.CylinderGeometry(.010,.010,.40,12,1),'metal',hinge);
      }
    }
  };
  bay('nose_bay',0,-3.63,.74,2.80,-.99,.36);
  for(const side of [-1,1]){const b=J16_GEAR.mainBay;bay('main_bay_'+side,side*b.x,b.z,b.width,b.length,-1.25,b.roof,true);}
  const wheel=(parent,name,r,width,offset=0)=>{
    const w=joint(name,[offset,0,0],'wheel',[1,0,0],{radius:r},parent);
    mesh(name+'_tire',landingTire(r,width),'tire',w);
    const hub=new T.CylinderGeometry(r*.56,r*.56,width*.96,32,1);hub.rotateZ(Math.PI/2);
    mesh(name+'_hub',hub,'wheelhub',w);
    const vents=[],caps=[];
    for(const side of [-1,1]){
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,g=new T.CircleGeometry(r*.052,8);g.rotateY(side*Math.PI/2);
        g.translate(side*(width*.48+.001),r*.39*Math.cos(a),r*.39*Math.sin(a));vents.push(g);
      }
      const cap=new T.CylinderGeometry(r*.18,r*.18,.022,12,1);cap.rotateZ(Math.PI/2);cap.translate(side*width*.5,0,0);caps.push(cap);
    }
    mesh(name+'_hub_vents',merge(vents),'tire',w);
    mesh(name+'_axle_caps',merge(caps),'metal',w);
    return w;
  };
  const mp=J16_GEAR.mainPivot;
  for(const [name,x,y,z,length,isNose]of [
    ['nose',0,-.85,-2.78,1.85,true],
    ['main_L',-mp.x,mp.y,mp.z,J16_GEAR.mainLength,false],
    ['main_R',mp.x,mp.y,mp.z,J16_GEAR.mainLength,false],
  ]){
    const mount=isNose?joint('nose_gear_stow_slide',[0,0,0],'gear-slide',[0,1,0],{travel:.52}):root;
    const side=x<0?-1:1,spreadAngle=isNose?0:J16_GEAR.mainSpread;
    const fold=joint(name+'_gear_retraction',[x,y,z],'gear-fold',[1,0,0],{isNose},mount);
    const leg=joint(name+'_gear_spread',[0,0,0],'gear-spread',[0,0,1],{side,isNose,spreadAngle},fold);
    const radius=isNose?.066:.095,foot=isNose?.36:.18;
    mesh(name+'_strut_barrel',segment([0,0,0],[0,-length*.57,0],radius,radius*.94,24),'skin',leg);
    const collarRadius=radius*(isNose?1.22:1.10);
    mesh(name+'_upper_collar',segment([0,-.14,0],[0,-.24,0],collarRadius,collarRadius,24),'metal',leg);
    const shock=joint(name+'_oleo',[0,-length*.55,0],'shock',[0,1,0],{travel:.18},leg);
    const pistonLength=length*.45-foot;
    mesh(name+'_oleo_piston',segment([0,0,0],[0,-pistonLength,0],isNose?.042:.057,isNose?.042:.057,24),'metal',shock);
    mesh(name+'_lower_collar',segment([0,-pistonLength+.045,0],[0,-pistonLength-.015,0],radius*.88,radius*.88,20),'skin',shock);
    for(const [i,a,b]of [[0,[radius,-.72,0],[radius*1.9,-.94,.12]],[1,[radius*1.9,-.94,.12],[radius,-1.14,0]]]){
      mesh(name+'_torque_link_'+i,segment(a,b,.022,.022,12),'metal',leg);
    }
    mesh(name+'_torque_link_pins',merge([segment([0,-.72,0],[radius+.02,-.72,0],.022,.022,12),segment([0,-1.14,0],[radius+.02,-1.14,0],.022,.022,12)]),'metal',leg);
    const carrier=joint(name+'_wheel_carrier',[0,-length,isNose?0:J16_GEAR.mainAxleAft],'wheel-carrier',[0,1,0],{isNose,side,spreadAngle},leg);
    if(isNose){
      wheel(carrier,'nose_wheel_L',.34,.18,-.135);wheel(carrier,'nose_wheel_R',.34,.18,.135);
      // Central T leg: the transverse axle enters both inner hubs. There is
      // no outer U fork wrapping around the pair of tires.
      mesh('nose_t_stem',segment([0,.36,0],[0,0,0],.050,.035,24),'skin',carrier);
      mesh('nose_wheel_axle',segment([-.21,0,0],[.21,0,0],.038,.038,24),'metal',carrier);
      const lights=[];
      for(const dx of [-.085,.085]){
        const lamp=new T.CylinderGeometry(.055,.055,.036,20,1);lamp.rotateX(Math.PI/2);lamp.translate(dx,-.41,-.11);lights.push(lamp);
      }
      mesh('nose_landing_light_housings',merge(lights),'metal',leg);
      mesh('nose_light_mount',box([.26,.045,.04],[0,-.41,-.06]),'skin',leg);
    }else{
      // The main oleo is vertical; the single wheel sits on an outboard axle.
      wheel(carrier,name+'_wheel',.46,.26,side*J16_GEAR.mainWheelOffset);
      mesh(name+'_axle_knuckle',segment([0,.18,-J16_GEAR.mainAxleAft],[0,0,0],.075,.095,24),'skin',carrier);
      mesh(name+'_wheel_axle',segment([0,0,0],[side*.30,0,0],.052,.052,24),'metal',carrier);
      mesh(name+'_brake_housing',segment([side*.065,0,0],[side*.13,0,0],.13,.13,20),'metal',carrier);
    }
    const fixed=isNose?[0,-.43,-3.05]:[x,-.79,3.92],armLength=isNose?.72:.68;
    const brace=joint(name+'_drag_brace',fixed,'gear-brace',[1,0,0],{isNose,kinematicBrace:true,leg:leg.name,knee:[0,-length*.5,0],pole:isNose?[0,1,0]:[side,0,0],armLength});
    for(const part of ['upper','lower'])mesh(brace.name+'_'+part,new T.CylinderGeometry(isNose?.023:.029,isNose?.023:.029,armLength,16,1),'skin',brace);
    mesh(brace.name+'_elbow',new T.SphereGeometry(isNose?.034:.041,12,8),'metal',brace);
    mesh(name+'_pivot_axle',segment([-.14,0,0],[.14,0,0],.09,.09,24),'metal',fold);
  }

  // Two engine bays retain the CAD nacelles. Each moving feather is a separate
  // node, not one permanently fused cone. Inner liners stay recessed.
  for(const side of [-1,1]){
    const tag=side<0?'L':'R',x=side*1.075,y=-1.14;
    const casing=roundEngine([{z:8.15,r:.53},{z:8.43,r:.52}]);
    casing.translate(x,y,0);mesh('engine_'+tag+'_fixed_collar',casing,'metal');
    const lip=new T.RingGeometry(.46,.52,80);lip.translate(x,y,8.43);mesh('engine_'+tag+'_inner_lip',lip,'hot');
    const liner=roundEngine([{z:7.50,r:.40},{z:8.45,r:.46}]);liner.translate(x,y,0);mesh('engine_'+tag+'_recessed_liner',liner,'hot');
    mesh('engine_'+tag+'_turbine_face',new T.CircleGeometry(.40,64).translate(x,y,7.55),'hot');
    const detail=j16EngineDetails(x,y);
    mesh('engine_'+tag+'_attachment_bands',detail.bands,'heatMetal');
    mesh('engine_'+tag+'_hinge_bosses',detail.fasteners,'metal');
    mesh('engine_'+tag+'_liner_ribs',detail.linerRibs,'nozzleDark');
    mesh('engine_'+tag+'_flameholder',detail.flameholder,'heatMetal');
    for(let i=0;i<16;i++){
      const angle=(i+.5)*Math.PI/8,pivot=[x+Math.cos(angle)*.52,y+Math.sin(angle)*.52,8.43];
      const petal=joint('nozzle_'+tag+'_petal_'+String(i).padStart(2,'0'),pivot,'nozzle-petal',[-Math.sin(angle),Math.cos(angle),0],{angle,side,limitsDeg:[0,12]});
      const p=[],uv=[],idx=[],ns=8,nc=4,layer=(ns+1)*(nc+1);
      for(let inner=0;inner<2;inner++)for(let j=0;j<=ns;j++)for(let k=0;k<=nc;k++){
        const a=angle+(k/nc-.5)*(Math.PI/8)*.994,r=.52-.035*(j/ns)-inner*(.001+.007*smooth(j/ns*4));
        p.push(x+r*Math.cos(a)-pivot[0],y+r*Math.sin(a)-pivot[1],j/ns*.78+.003*(1-smooth(j/ns*4)));uv.push(k/nc,j/ns);
      }
      for(let j=0;j<ns;j++)for(let k=0;k<nc;k++){const a=j*(nc+1)+k,b=a+1,c=b+nc+1,d=a+nc+1;idx.push(a,b,c,a,c,d,a+layer,c+layer,b+layer,a+layer,d+layer,c+layer);}
      const edge=(a,b)=>idx.push(a,a+layer,b+layer,a,b+layer,b);
      for(let k=0;k<nc;k++){edge(k,k+1);edge(ns*(nc+1)+k+1,ns*(nc+1)+k);}
      for(let j=0;j<ns;j++){edge((j+1)*(nc+1),j*(nc+1));edge(j*(nc+1)+nc,(j+1)*(nc+1)+nc);}
      mesh('nozzle_'+tag+'_feather_'+i,geometry(p,idx,uv),i%2?'heatMetal':'metal',petal);
      const rib=new T.BoxGeometry(.014,.012,.54).rotateX(Math.atan(.035/.78)).translate(0,-.035*.40/.78+.006,.40).rotateZ(angle-Math.PI/2);
      mesh('nozzle_'+tag+'_outer_rib_'+i,rib,'nozzleDark',petal);
    }
    const rampPart=intakeRamp(side);
    const ramp=joint('intake_'+tag+'_ramp',rampPart.pivot,'intake-ramp',rampPart.axis,{limitsDeg:[0,12]});
    mesh('intake_'+tag+'_ramp_skin',rampPart.geometry,'interior',ramp);
    mesh('intake_'+tag+'_dark_throat',box([.49,.38,.04],[x,-.74,1.20]),'duct');
    // Flush auxiliary louvre slots follow the existing underside instead of
    // floating on a flat rectangular panel over the curved nacelle.
    const gp=[],gu=[],gi=[],grilleSkin=[],grilleRay=new T.Raycaster(),grilleY=new Map();
    root.updateMatrixWorld(true);
    root.traverse(o=>{if(o.isMesh&&(o.name==='J16_fixed_CAD_fuselage'||/^intake_._outer_cowl$/.test(o.name)))grilleSkin.push(o);});
    const underside=(xx,zz)=>{
      const key=xx.toFixed(6)+','+zz.toFixed(6);if(grilleY.has(key))return grilleY.get(key);
      grilleRay.set(new T.Vector3(xx,-4,zz),new T.Vector3(0,1,0));
      const hit=grilleRay.intersectObjects(grilleSkin)[0];
      if(!hit)throw new Error('Intake louvre has no supporting skin: '+key);
      grilleY.set(key,hit.point.y-.005);return grilleY.get(key);
    };
    for(let row=0;row<14;row++)for(let j=0;j<16;j++){
      const base=gp.length/3,z=-1.20+row*.055;
      for(const [u,dz]of [[j/16,0],[(j+1)/16,0],[(j+1)/16,.018],[j/16,.018]]){
        const xx=side*(1.18+(u-.5)*.50),zz=z+dz;
        gp.push(xx,underside(xx,zz),zz);gu.push(u,row/14);
      }
      gi.push(base,base+1,base+2,base,base+2,base+3);
    }
    mesh('intake_'+tag+'_auxiliary_louvres',geometry(gp,gi,gu),'interior');
    mesh('ventral_keel_'+tag,joinTailRoot(sliceGeometry(foil([{x:-2.22,y:1.48,le:7.30,te:8.37,thickness:.035},{x:-1.43,y:1.39,le:6.50,te:8.10,thickness:.035}],0,1,side,true,{span:12,chord:20}),tail.outside),[0,-1,0]));
  }
  const probe=joint('refueling_probe_hinge',[-.52,noseHeight(-.42,-6.0),-6.0],'probe',[0,1,0],{limitsDeg:[0,55]});
  mesh('refueling_probe_shaft',tube([[0,0,0],[-.01,.01,-.44],[.03,.04,-1.0]],.034,40),'metal',probe);
  mesh('refueling_probe_tip',segment([.03,.04,-1.0],[.03,.04,-1.14],.046,.046,24),'metal',probe);
  const probeDoor=joint('refueling_probe_door',[-hullIntersection(-.30,-6.50,false,true),noseHeight(-.30,-6.50),-6.50],'probe-door',[0,0,1],{limitsDeg:[0,70]});
  const probeP=[],probeUv=[],probeIdx=[],probeNZ=24,probeNY=8;
  for(let iz=0;iz<=probeNZ;iz++)for(let iy=0;iy<=probeNY;iy++){
    const z=T.MathUtils.lerp(-7.14,-5.85,iz/probeNZ),y=T.MathUtils.lerp(-.56,-.30,iy/probeNY);
    probeP.push(-hullIntersection(y,z,false,true)-.002,noseHeight(y,z),z);probeUv.push(iy/probeNY,iz/probeNZ);
  }
  for(let iz=0;iz<probeNZ;iz++)for(let iy=0;iy<probeNY;iy++){const a=iz*(probeNY+1)+iy,b=a+1,c=b+probeNY+1,d=a+probeNY+1;probeIdx.push(a,b,c,a,c,d);}
  attach('refueling_probe_door_skin',geometry(probeP,probeIdx,probeUv),'skin',probeDoor);
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;}});
  // Match the lighting normal across the separately tessellated cockpit/spine
  // boundary; geometry positions alone leave a false vertical crease here.
  root.traverse(o=>{
    if(!o.isMesh||!['J16_fixed_CAD_fuselage','J16_double_cockpit_shoulders'].includes(o.name))return;
    const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,eps=.004;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),distance=Math.abs(z+2.48);
      if(distance>.16||Math.abs(x)>.80||y<-.25||Math.abs(y-hullIntersection(x,z))>.025)continue;
      const dx=(hullIntersection(x+eps,z)-hullIntersection(x-eps,z))/(2*eps);
      const dz=(hullIntersection(x,z+eps)-hullIntersection(x,z-eps))/(2*eps);
      const normal=new T.Vector3().fromBufferAttribute(n,i);
      normal.lerp(new T.Vector3(-dx,1,-dz).normalize(),1-smooth(distance/.16)).normalize();
      n.setXYZ(i,...normal.toArray());
    }
    n.needsUpdate=true;
  });
  assignWorkzones(root);
  poseJ16(root,{gear:1,nozzle:.7});return root;
}

// Fixed shell boundaries follow the aft cockpit and forward tail station.
// Whole assemblies retain one work area even when their geometry crosses a
// station (e.g. the wing trailing edge and the retracting nose wheel).
function assignWorkzones(root){
  const shells=[];root.updateMatrixWorld(true);
  root.traverse(o=>{if(o.isMesh&&o.name==='J16_fixed_CAD_fuselage')shells.push(o);});
  for(const shell of shells){
    const global=shell.geometry.clone().applyMatrix4(shell.matrixWorld);
    for(const [id,zone]of Object.entries(J16_WORKZONES)){
      let g=global;
      const [start,end]=zone.shellRange;
      if(start!==null)g=sliceGeometry(g,p=>p.z-start);
      if(end!==null)g=sliceGeometry(g,p=>end-p.z);
      const part=new T.Mesh(g,shell.material);part.name='J16_fixed_fuselage_'+id;
      part.userData.exportExtras={...data(shell),workZone:id};root.add(part);
    }
    shell.parent.remove(shell);
  }
  // Remove the now-empty CAD wrapper before creating the three identity groups.
  for(const o of [...root.children])if(!o.isMesh&&!o.children.length&&!data(o).role)root.remove(o);
  const groups={};
  for(const [id,zone]of Object.entries(J16_WORKZONES)){
    const group=new T.Group();group.name='workzone_'+id;
    group.userData.exportExtras={workZone:id,label:zone.label,includes:zone.includes};groups[id]=group;
  }
  for(const assembly of [...root.children]){
    let id=data(assembly).workZone;
    if(!id){
      if(/^(J16_radome|J16_forebody|J16_double_cockpit|cockpit_|fixed_windscreen|canopy_|seat_|HUD_|IRST_|refueling_|nose_)/.test(assembly.name))id='nose';
      else if(/^(parachute_|stabilator_|fin_|rudder_|engine_|nozzle_|ventral_keel_)/.test(assembly.name))id='tail';
      else if(/^(wing_|wingtip_|leading_edge_|flaperon_|dorsal_airbrake_|main_|intake_)/.test(assembly.name))id='mid';
      else throw new Error('J-16 assembly needs a work area: '+assembly.name);
    }
    assembly.traverse(o=>{o.userData.exportExtras={...data(o),workZone:id};});
    groups[id].add(assembly);
  }
  root.add(...Object.values(groups));
  root.userData.exportExtras.workZones=J16_WORKZONES;
}

export function poseJ16(root,state={}){
  const gear=state.gear??1,a=smooth((1-gear)/.80),nozzle=state.nozzle??.7;
  root.traverse(o=>{
    const m=data(o);if(!m.role)return;
    const axis=v(m.axis||[1,0,0]).normalize();let angle=null;
    if(m.role==='canopy')angle=rad(55)*(state.canopy||0);
    if(m.role==='slat')angle=-rad(25)*(state.slats||0)*(m.side||1);
    if(m.role==='flaperon')angle=rad(30)*(state.flaps||0)*(m.side||1);
    if(m.role==='stabilator')angle=rad(22)*(state.pitch||0);
    if(m.role==='rudder')angle=rad(25)*(state.yaw||0);
    if(m.role==='airbrake')angle=-rad(54)*(state.airbrake||0);
    if(m.role==='gear-slide'){o.position.fromArray(m.pivot);o.position.y+=m.travel*a;return;}
    if(m.role==='gear-fold')angle=rad(m.isNose?97.5:90)*a;
    if(m.role==='gear-spread')angle=m.isNose?0:(m.side*(m.spreadAngle??.5)*(1-a));
    if(m.role==='gear-door'){
      const opening=smooth(gear>=.20?1:gear/.20),swing=m.offsetHinge?smooth((opening-.20)/.80):opening;
      o.position.fromArray(m.pivot);
      if(m.offsetHinge){o.position.x+=m.slide*swing;o.position.y-=m.drop*smooth(opening/.25);}
      else o.position.y-=(m.drop||0)*opening;
      angle=m.side*rad(86)*swing;
    }
    if(m.role==='wheel-carrier'){
      const compression=.18*(state.compression||0);
      o.position.fromArray(m.pivot);o.position.y+=compression;
      o.quaternion.setFromEuler(new T.Euler(0,m.isNose?rad(35)*(state.steer||0)*(1-a):m.side*Math.PI*.5*a,m.isNose?0:-m.side*(m.spreadAngle??.5)*(1-a),'ZYX'));return;
    }
    if(m.role==='shock'){o.position.fromArray(m.pivot);o.position.y+=m.travel*(state.compression||0);}
    if(m.role==='gear-brace'&&!m.kinematicBrace)angle=Math.atan2(.82,.94)*a;
    if(m.role==='wheel')angle=state.wheelSpin||0;
    if(m.role==='parachute-door')angle=m.side*rad(50)*(state.parachute||0);
    if(m.role==='sensor-gimbal')angle=rad(60)*(state.sensor||0);
    if(m.role==='nozzle-petal')angle=-rad(10)*(1-nozzle);
    if(m.role==='probe'){
      o.quaternion.setFromEuler(new T.Euler(rad(15)*(state.probe||0),rad(55)*(state.probe||0),0));return;
    }
    if(m.role==='probe-door')angle=-rad(70)*(state.probe||0);
    if(m.role==='intake-ramp')angle=rad(12)*(state.ramps||0);
    if(m.role==='canopy-actuator')angle=-rad(32)*(state.canopy||0);
    if(angle!==null)o.quaternion.setFromAxisAngle(axis,angle);
  });root.updateMatrixWorld(true);poseGearBraces(root);
}

export function paintJ16(root,mode='weathered'){
  if(mode==='weathered'){applyJ16Skin(root);return;}
  if(mode==='camo'){applyJ16Skin(root,'camo');return;}   // silver camouflage livery
  root.userData.paintMode=mode;
  root.traverse(o=>{
    if(!o.isMesh)return;
    const mat=data(o).material||(/skin|fuselage/.test(o.name)?'skin':null);
    if(!mat)return;
    if(!o.userData.baseMaterial)o.userData.baseMaterial=o.material;
    if(!o.userData.paintMaterial)o.userData.paintMaterial=o.userData.baseMaterial.clone();
    const m=o.userData.paintMaterial;
    o.material=o.userData.baseMaterial;
    if(mode==='zones'){
      const zone=J16_WORKZONES[data(o).workZone];
      if(!zone)return;
      if(!o.userData.zoneMaterial){
        const z=o.userData.baseMaterial.clone();z.name='J16 workzone '+data(o).workZone;
        z.color.copy(color(zone.color));z.roughness=.70;z.metalness=.02;
        // Keep cockpit glazing legible while tinting it with the head work area.
        if(mat==='glass'){z.opacity=.65;z.depthWrite=false;}
        o.userData.zoneMaterial=z;
      }
      o.material=o.userData.zoneMaterial;return;
    }
    if(mode==='base')return;
    if(mat==='skin'||mat==='radome'){
      m.color.copy(color(mode==='white'?0xd5d9dc:0xc5ccd0));m.roughness=.74;m.metalness=.02;
      if(mode==='parts'){
        let p=o.parent;while(p&&p!==root&&!data(p).role)p=p.parent;
        const palette={canopy:0x86bdc5,slat:0xcdb283,flaperon:0x8eafc7,stabilator:0x9facce,rudder:0xb9a2c7,airbrake:0xc19182,'gear-door':0xb9b790};
        if(p&&palette[data(p).role])m.color.copy(color(palette[data(p).role]));
      }
      o.material=m;
    }
  });
}

export async function loadJ16Model(){
  const url=new URL('../../assets/models/j16/j16-white.glb',import.meta.url);
  const root=await loadCachedModel(url.href);
  root.traverse(o=>{if(o.userData.role||o.userData.material)o.userData.exportExtras={...o.userData};});
  return root;
}




