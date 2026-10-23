import * as T from '../../vendor/three.module.js';
import {loadCachedModel} from './modelCache.js';
import { landingTire } from './jet/j16LandingGear.js';
import { createJ10CLiveryMaterial, liveryPart, restOffsetOf } from './J10CLivery.js';

// Visual study only: no flight model, weapons or stores are assigned to J-10C.
// Built from the supplied J10C.STEP (1:10 surface model) via
// assets/models/j10c/j10c-cad-reference.glb. Metres, +Y up, -Z forward.
// Each movable assembly is a rig node (role/axis/pivot extras); its meshes are
// stored relative to the hinge so a pure rotation of the node is the motion.
// Ground plane from the reference photos (nose close-up side view and the
// head-on view): the intake lower lip stands about 1.2 m off the ground, i.e.
// 2.28 m of canopy-top-to-lip spans ~1.2 m of lip-to-ground. Public height
// figures disagree (4.78 / 5.43 / 5.5 m) and none gives gear data.
export const J10C_GROUND_Y = -2.30;
export const J10C_DIMENSIONS = {length:17.05,wingspan:9.73,groundHeight:5.80,
  note:'CAD scale; ground clearance measured on photos. Public figures: ~16.4-16.9 m long, 9.75 m span, 4.78-5.5 m high'};
export const J10C_WORKZONES = {
  nose:{label:'机头区',color:0x4b9fea,includes:'雷达罩、座舱、鸭翼、前起落架',shellRange:[null,-2.6]},
  mid:{label:'中段区',color:0xf2a347,includes:'进气道、机翼、前缘襟翼、升降副翼、主起落架',shellRange:[-2.6,4.2]},
  tail:{label:'机尾区',color:0x62c396,includes:'垂尾、方向舵、腹鳍、减速板、喷口、减速伞舱',shellRange:[4.2,null]},
};
// Gear and opening coordinates measured on the CAD shell (work/j10c/measure.mjs).
// The CAD belly is already open for both wells (scanned, work/j10c/scan-*.mjs):
// nose x +-0.27, z -2.95..-1.35; main x 0.30..0.64 beside the keel. The main
// opening is widened to x 0.80 so the splayed strut clears the wing-root skin.
export const J10C_GEAR = {
  // Open between x +-0.27 (closed at 0.30) and z -2.95..-1.35 (closed at -3.0 /
  // -1.3): the doors and well are sized to the closed lines so nothing shows.
  noseBay:{halfWidth:.30,z0:-3.00,z1:-1.30,skinY:-1.125,roof:-.70},
  nosePivot:[0,-.92,-2.85],noseAxle:[0,J10C_GROUND_Y+.21,-3.05],noseWheel:{radius:.21,width:.12,track:.14},
  // The ragged CAD hole is trimmed to this exact rectangle, which the door,
  // the opening edge and the well walls all share.
  mainBay:{x0:.255,x1:.80,z0:-.12,z1:1.86,wellOuter:1.02,roof:-.62},
  mainPivot:{x:.72,y:-.90,z:1.60},mainStubEnd:1.00,mainStub:.15,mainWheel:{radius:.29,width:.17},
  // Lower-surface line across the main opening (x, y) from the scan; doors sit 6 mm below.
  mainDoorLine:[[.255,-1.162],[.50,-1.11],[.66,-1.035],[.74,-.96],[.80,-.92]],
};
// Leading edge measured on the CAD (z = 0.95 + 1.35 (x - 2.4), x 1.1..4.6).
// The flap chord tapers 0.48 -> 0.36 m streamwise so it stays clear of the
// elevon hinge (z 4.36) at the tip; split into two sections at x 3.05.
// Half span to the clipped tip: CAD elevon tip and public span 9.75 m.
// The fixed wing outboard of TIP_ROOT (= outer end of the LE flap) is rebuilt.
export const WING_TIP = 4.865, TIP_ROOT = 4.552;
// Per the user's marked-up plan view: elevon ends 0.36 m inboard of the tip
// (red line) and the trailing corner is cut back to x 4.63 (blue arc).
export const ELEVON_END = 4.50, TE_CORNER_X = 4.63;
// Trailing edge scanned on the CAD elevon sheets (plan view).
const wingTE=x=>x<2.4?5.11-(x-1.2)*.0583:5.04-(x-2.4)*.0574;
export const LE_FLAP = {
  edge:x=>.95+1.35*(x-2.4),
  hinge:x=>.95+1.35*(x-2.4)+.48-.04*(x-1.58),
  hingeSlope:1.31,
  sections:[['inner',1.58,3.05],['outer',3.05,4.55]],
};
const rad=T.MathUtils.degToRad, color=h=>new T.Color(h).convertSRGBToLinear();
const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
const v=a=>new T.Vector3(...a);
function data(o){return o.userData.exportExtras||o.userData;}

// ---------------------------------------------------------------- geometry
function geometry(positions,indices,uv){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv||new Array(positions.length/3*2).fill(0),2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
// Box-projected base UVs (metres), chosen per vertex by the dominant normal.
function boxUV(g){
  const p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i)),x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const [u,w]=ay>=ax&&ay>=az?[x,z]:ax>=az?[z,y]:[x,y];uv[i*2]=u/4;uv[i*2+1]=w/4;
  }
  g.setAttribute('uv',new T.BufferAttribute(uv,2));return g;
}
function merge(geometries){
  const p=[],n=[],uv=[],idx=[];let at=0;
  for(const g of geometries){
    if(!g||!g.attributes.position.count)continue;
    p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);
    uv.push(...(g.attributes.uv?.array||new Float32Array(g.attributes.position.count*2)));
    const indices=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i);
    for(const i of indices)idx.push(i+at);at+=g.attributes.position.count;
  }
  const g=geometry(p,idx,uv);g.setAttribute('normal',new T.Float32BufferAttribute(n,3));return g;
}
// Weld one CAD face so its own smooth B-spline patch shades smoothly; separate
// faces stay separate, which keeps creases between adjacent CAD faces.
function weld(src,eps=1e-5){
  const p=src.attributes.position,map=new Map(),pos=[],idx=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),key=Math.round(x/eps)+','+Math.round(y/eps)+','+Math.round(z/eps);
    let j=map.get(key);if(j===undefined){j=pos.length/3;pos.push(x,y,z);map.set(key,j);}idx.push(j);
  }
  const clean=[];for(let i=0;i<idx.length;i+=3){const [a,b,c]=idx.slice(i,i+3);if(a!==b&&b!==c&&a!==c)clean.push(a,b,c);}
  return boxUV(geometry(pos,clean));
}
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
  const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  out.setAttribute('normal',new T.Float32BufferAttribute(normals,3));out.setAttribute('uv',new T.Float32BufferAttribute(uv,2));out.setIndex(indices);return out;
}
// Split by a convex prism (planes >= 0 inside): returns [outside, inside].
// Rim vertices are emitted once on both sides, so a cut panel matches its hole.
function splitConvex(g,planes){
  const outside=[];let inside=g;
  for(const plane of planes){
    const piece=sliceGeometry(inside,p=>-plane(p)-1e-7);
    if(piece.index.count)outside.push(piece);
    inside=sliceGeometry(inside,p=>plane(p)+1e-7);
    if(!inside.index.count)break;
  }
  return [merge(outside),inside];
}
const triangles=g=>g?(g.index?.count||g.attributes.position.count)/3:0;
function segment(a,b,r1,r2=r1,segments=20){
  const x=v(a),y=v(b),d=y.clone().sub(x);
  const g=new T.CylinderGeometry(r2,r1,d.length(),segments,1);
  g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize())));
  g.translate(...x.add(y).multiplyScalar(.5).toArray());return boxUV(g);
}
function indexed(g){if(g.index)return g;const n=g.attributes.position.count;g.setIndex(Array.from({length:n},(_,i)=>i));return g;}
function box(size,position){return boxUV(new T.BoxGeometry(...size).translate(...position));}
function trapezoidDeck(halfRear,halfFront,zRear,zFront,y){
  return boxUV(geometry([-halfRear,y,zRear,halfRear,y,zRear,halfFront,y,zFront,-halfFront,y,zFront],[0,2,1,0,3,2]));
}
function quadStrip(a,b,flip=false){
  // Two equal-length polylines -> one strip of quads.
  const p=[],idx=[];for(let i=0;i<a.length;i++)p.push(...a[i].toArray(),...b[i].toArray());
  for(let i=0;i<a.length-1;i++){const k=i*2;if(flip)idx.push(k,k+2,k+1,k+1,k+2,k+3);else idx.push(k,k+1,k+2,k+1,k+3,k+2);}
  return boxUV(geometry(p,idx));
}
// Close an open CAD edge: sample rays across the cut; each ray's first and
// last hit on the target surfaces give the two skin points a cap joins.
const caster=new T.Raycaster();
function capStrip(targets,rays){
  const top=[],bottom=[];
  for(const {origin,dir}of rays){
    caster.set(origin,dir.clone().normalize());
    const hits=caster.intersectObjects(targets,false);
    if(hits.length<2)continue;
    top.push(hits[0].point);bottom.push(hits.at(-1).point);
  }
  return top.length>1?quadStrip(top,bottom):null;
}
const tempMesh=g=>{const m=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));m.updateMatrixWorld(true);return m;};

// Closed control surface from hinge thickness to a thin trailing edge.
// sections: [{x,zh,zt,yu,yl}] along span (x signed), hinge line at zh.
function controlFoil(sections,nc=10){
  const p=[],idx=[],n=sections.length,ring=2*nc+2;
  for(const s of sections){
    const ym=(s.yu+s.yl)/2,h=(s.yu-s.yl)/2,te=.004;
    for(const upper of [1,-1])for(let j=0;j<=nc;j++){
      const t=upper>0?j/nc:1-j/nc,half=h+(te-h)*t*t*(1.25-.25*t)+h*.18*Math.sin(Math.PI*t)*(1-t);
      p.push(s.x,ym+upper*half,s.zh+(s.zt-s.zh)*t);
    }
  }
  for(let i=0;i<n-1;i++)for(let j=0;j<ring-1;j++){const a=i*ring+j,b=a+1,c=a+ring,d=c+1;idx.push(a,c,b,b,c,d);}
  for(let i=0;i<n-1;i++){const a=i*ring+ring-1,b=i*ring,c=a+ring,d=b+ring;idx.push(a,c,b,b,c,d);}
  for(const end of [0,n-1]){const base=end*ring;for(let j=1;j<ring-1;j++)idx.push(base,base+j,base+j+1);}
  return boxUV(geometry(p,idx));
}
function conePatch(cy,r0,r1,z0,z1,a0,a1,na=6,nz=8){
  const p=[],idx=[];
  for(let i=0;i<=nz;i++)for(let j=0;j<=na;j++){
    const t=i/nz,a=T.MathUtils.lerp(a0,a1,j/na),r=T.MathUtils.lerp(r0,r1,t);
    p.push(r*Math.cos(a),cy+r*Math.sin(a),T.MathUtils.lerp(z0,z1,t));
  }
  for(let i=0;i<nz;i++)for(let j=0;j<na;j++){const a=i*(na+1)+j,b=a+1,c=a+na+1,d=c+1;idx.push(a,b,c,b,d,c);}
  return boxUV(geometry(p,idx));
}
function lathe(points,segments,cy,z){
  const g=new T.LatheGeometry(points.map(([r,y])=>new T.Vector2(r,y)),segments);
  g.rotateX(Math.PI/2);g.translate(0,cy,z);return boxUV(g);
}

// --------------------------------------------------------------- the model
export function buildJ10CModel(cad){
  cad.updateMatrixWorld(true);
  const faces=new Map();
  cad.traverse(o=>{if(o.isMesh){const m=/b(\d+)_f(\d+)/.exec(o.name);const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);faces.set(`${+m[1]}.${+m[2]}`,{body:+m[1],face:+m[2],g});}});
  const used=new Set();
  const take=keys=>{const gs=[];for(const k of keys){const f=faces.get(k);if(!f)throw new Error('missing CAD face '+k);used.add(k);gs.push(weld(f.g));}return merge(gs);};
  const bodyKeys=b=>[...faces.keys()].filter(k=>faces.get(k).body===b);
  const b13=n=>n.map(i=>'13.'+i);

  const root=new T.Group();root.name='J10C_white_model';
  root.userData.exportExtras={aircraft:'J-10C',stage:'white model',units:'metres',forward:'-Z',dimensions:J10C_DIMENSIONS,groundY:J10C_GROUND_Y};
  const materials={
    skin:new T.MeshStandardMaterial({color:color(0xb2bac0),roughness:.72,metalness:.08,side:T.DoubleSide}),
    radome:new T.MeshStandardMaterial({color:color(0x9aa2a7),roughness:.83,metalness:.01,side:T.DoubleSide}),
    metal:new T.MeshStandardMaterial({color:color(0x8a9092),roughness:.45,metalness:.63,side:T.DoubleSide}),
    hot:new T.MeshStandardMaterial({color:color(0x4a4947),roughness:.68,metalness:.45,side:T.DoubleSide}),
    glass:new T.MeshStandardMaterial({color:color(0x71909a),roughness:.12,metalness:.12,transparent:true,opacity:.40,side:T.DoubleSide,depthWrite:false}),
    optics:new T.MeshStandardMaterial({color:color(0x101419),roughness:.18,metalness:.12,side:T.DoubleSide}),
    tire:new T.MeshStandardMaterial({color:color(0x252a2c),roughness:.93,metalness:0,side:T.DoubleSide}),
    interior:new T.MeshStandardMaterial({color:color(0x5d6a6c),roughness:.88,metalness:.02,side:T.DoubleSide}),
    wheelhub:new T.MeshStandardMaterial({color:color(0x8d9590),roughness:.6,metalness:.35,side:T.DoubleSide}),
    duct:new T.MeshStandardMaterial({color:color(0x141c21),roughness:.91,metalness:.02,side:T.DoubleSide}),
  };
  for(const [name,m]of Object.entries(materials))m.name='J10C '+name;
  const mesh=(name,g,mat='skin',parent=root)=>{
    const o=new T.Mesh(g,materials[mat]);o.name=name;o.userData.exportExtras={material:mat};parent.add(o);return o;
  };
  const worldPivot=o=>{const p=new T.Vector3();for(let q=o;q&&q!==root;q=q.parent)p.add(q.position);return p;};
  const joint=(name,pivot,role,axis=[1,0,0],extra={},parent=root)=>{
    const o=new T.Group();o.name=name;o.position.copy(v(pivot).sub(worldPivot(parent)));
    o.userData.exportExtras={role,axis:v(axis).normalize().toArray(),pivot:[...pivot],local:o.position.toArray(),...extra};parent.add(o);return o;
  };
  const attach=(name,g,mat,parent)=>mesh(name,g.translate(...worldPivot(parent).negate().toArray()),mat,parent);

  // ---- control surfaces taken out of the CAD shell
  const elevonFaces=b13([284,285,292,293,294,295,298,299,290,291,296,297]);
  for(const k of elevonFaces)used.add(k); // replaced by closed procedural foils
  for(const k of bodyKeys(7).concat(bodyKeys(12)))used.add(k); // CAD main doors, rebuilt below
  const canopyFaces=b13([120,249]);
  const rudderFaces=['18.0','18.2'];
  const chuteFaces={1:b13([277,301]),'-1':b13([283,300])};
  const canardBodies={1:19,'-1':17};

  // ---- fixed shell, grouped by work area / material
  const radome=take(b13([112,238])),windscreen=take(b13([123,253]));
  // The stowed nose wheels need the duct floor over the well raised to y -0.69.
  const nbCut=J10C_GEAR.noseBay;
  const [duct]=splitConvex(take(b13([286,287,288,289])),
    [p=>nbCut.halfWidth+.03-Math.abs(p.x),p=>p.z-(nbCut.z0-.012),p=>nbCut.z1+.012-p.z,p=>-.69-p.y]);
  const groups={};
  const addTo=(key,k)=>{(groups[key]??=[]).push(k);};
  // Lower wing-root skins that carry the main-wheel opening; only these are cut,
  // so the upper wing surface over the well stays intact.
  const mainLower={1:b13([172,158,170,187]),'-1':b13([38,26,37,54])};
  for(const s of [1,-1])for(const k of mainLower[s])addTo('wing_root_lower_'+(s>0?'R':'L'),k);
  const grouped=new Set([...mainLower[1],...mainLower[-1]]);
  const pending=new Set([...canopyFaces,...rudderFaces,...chuteFaces[1],...chuteFaces[-1],
    ...bodyKeys(17),...bodyKeys(19)]);
  for(const k of bodyKeys(20))used.add(k); // CAD probe (fixed, curved): rebuilt as a retractable probe
  for(const [k,f]of faces){
    if(used.has(k)||pending.has(k)||grouped.has(k))continue;
    f.g.computeBoundingBox();const c=f.g.boundingBox.getCenter(new T.Vector3());
    if(f.body===13){
      if(Math.abs(c.x)>.95&&c.y<-.5&&c.z>-.8)addTo(c.x>0?'wing_R':'wing_L',k);
      else addTo(c.z<-2.6?'fuselage_nose':c.z<4.2?'fuselage_mid':'fuselage_tail',k);
    }else if([15,16].includes(f.body))addTo(f.body===15?'ventral_fin_R':'ventral_fin_L',k);
    else if(f.body===18)addTo('fin',k);
    else if([0,2,5,21,22].includes(f.body))addTo('fin_tip_and_tail_fittings',k);
    else if([10,14].includes(f.body))continue; // faceted CAD IRST, rebuilt smooth below
    else if([1,3,8,9].includes(f.body))addTo('nose_strakes',k);
    else if([6,11].includes(f.body))addTo('canopy_rear_arch',k);
    else if(f.body===4)addTo('dorsal_antenna',k);
    else throw new Error('unclassified CAD body '+f.body);
  }
  const fixed={};for(const [key,keys]of Object.entries(groups))fixed[key]=take(keys);

  // Real openings: the cut skin becomes the door / airbrake panel itself.
  const G=J10C_GEAR,mb=G.mainBay;
  const mainCut=s=>[p=>s*p.x-mb.x0,p=>mb.x1-s*p.x,p=>p.z-mb.z0,p=>mb.z1-p.z,p=>-.80-p.y];
  const brakeCut=s=>[p=>s*p.x-.45,p=>p.z-4.55,p=>5.40-p.z,p=>p.y+.45,p=>.12-p.y];
  const originalSkin=tempMesh(merge(['fuselage_mid','fuselage_tail','wing_R','wing_L','wing_root_lower_R','wing_root_lower_L'].map(k=>fixed[k]).filter(Boolean)));
  const ductTarget=tempMesh(duct);
  const cutPieces={};
  for(const s of [1,-1]){
    const tag=s>0?'R':'L';
    for(const [label,planes,targets]of [['main_door',mainCut(s),['wing_root_lower_'+tag,'fuselage_mid']],['airbrake',brakeCut(s),['fuselage_tail']]]){
      const parts=[];
      for(const key of targets){
        if(!fixed[key])continue;
        const [out,inside]=splitConvex(fixed[key],planes);
        if(inside.index.count){fixed[key]=out;parts.push(inside);}
      }
      cutPieces[label+'_'+tag]=merge(parts);
    }
  }
  // Leading-edge flaps (reference: underside photo of an in-service J-10C): a
  // constant-width strip along the whole leading edge, root fairing to just
  // short of the tip, in two spanwise sections. Cut from the full wing (upper,
  // lower and the CAD nose strip), so the flap carries the true CAD section.
  const leCut=(s,x0,x1)=>[p=>s*p.x-x0,p=>x1-s*p.x,p=>LE_FLAP.hinge(s*p.x)-p.z,p=>p.y+.95,p=>-.45-p.y];
  const slatPieces={};
  for(const s of [1,-1]){
    const tag=s>0?'R':'L';
    for(const [part,x0,x1]of LE_FLAP.sections){
      const parts=[];
      for(const key of ['wing_'+tag,'wing_root_lower_'+tag]){
        const [out,inside]=splitConvex(fixed[key],leCut(s,x0,x1));
        if(inside.index.count){fixed[key]=out;parts.push(inside);}
      }
      slatPieces[tag+part]=merge(parts);
    }
  }
  // The CAD tip outboard of the flap carries a small stepped tip shoe (faces
  // z 3.86..4.36, x 4.53..4.74) that the reference photos do not show; it is
  // replaced below by a clean clipped tip. Keep the removed piece to sample
  // its (thin) section.
  const cadTip={};
  for(const s of [1,-1]){
    const key='wing_'+(s>0?'R':'L'),[out,inside]=splitConvex(fixed[key],[p=>s*p.x-TIP_ROOT]);
    fixed[key]=out;cadTip[s]=tempMesh(inside);
  }
  // Refuelling-probe bay. The probe hinges where the CAD probe met the skin
  // (starboard, ahead of the windscreen) and stows aft along the cockpit side,
  // in a band clear of the canopy sill above and the canard root below. The
  // skin over the band becomes the bay door.
  const noseSkin=tempMesh(fixed.fuselage_nose);
  const skinX=(y,z)=>{caster.set(new T.Vector3(3,y,z),new T.Vector3(-1,0,0));const h=caster.intersectObject(noseSkin)[0];return h?h.point.x:.6;};
  const PB={B:v([skinX(.24,-4.93)-.05,.24,-4.93]),S:v([skinX(.46,-3.38)-.07,.46,-3.38])};
  PB.len=PB.S.distanceTo(PB.B);PB.t=PB.S.clone().sub(PB.B).normalize();
  PB.out=new T.Vector3(1,0,0).addScaledVector(PB.t,-PB.t.x).normalize();
  PB.up=new T.Vector3().crossVectors(PB.t,PB.out).normalize();if(PB.up.y<0)PB.up.negate();
  PB.half=.065;PB.t0=-.07;PB.t1=PB.len+.20;
  const pbd=p=>p.clone().sub(PB.B);
  const [noseOut,probeDoorSkin]=splitConvex(fixed.fuselage_nose,[p=>pbd(p).dot(PB.t)-PB.t0,p=>PB.t1-pbd(p).dot(PB.t),
    p=>pbd(p).dot(PB.up)+PB.half,p=>PB.half-pbd(p).dot(PB.up),p=>pbd(p).dot(PB.out)+.06]);
  fixed.fuselage_nose=noseOut;
  const fixedMats={fuselage_nose:'skin',fuselage_mid:'skin',fuselage_tail:'skin',wing_R:'skin',wing_L:'skin',wing_root_lower_R:'skin',wing_root_lower_L:'skin',ventral_fin_R:'skin',ventral_fin_L:'skin',
    fin:'skin',fin_tip_and_tail_fittings:'skin',IRST_window:'optics',IRST_housing:'metal',nose_strakes:'skin',canopy_rear_arch:'skin',dorsal_antenna:'skin'};
  for(const [key,g]of Object.entries(fixed))mesh(key==='wing_R'||key==='wing_L'?key+'_fixed':key,g,fixedMats[key]);
  // Skin-coloured door frame: a lip from the skin edge of an opening down past
  // the closed door, so the seam around a door shows frame, never the well.
  const skinNow=tempMesh(merge(Object.values(fixed)));
  const frameLip=(corners,doorY,name)=>{
    const strips=[];
    for(let c=0;c<corners.length-1;c++){const [xa,za]=corners[c],[xb,zb]=corners[c+1],top=[],bottom=[];
      const nx=-(zb-za),nz=xb-xa,len=Math.hypot(nx,nz);
      for(let i=0;i<=14;i++){const x=T.MathUtils.lerp(xa,xb,i/14),z=T.MathUtils.lerp(za,zb,i/14);
        // skin height just outside the edge (try both sides: only one has skin)
        let h=null;for(const k of [1,-1]){caster.set(new T.Vector3(x+k*nx/len*.006,-5,z+k*nz/len*.006),new T.Vector3(0,1,0));
          const c=caster.intersectObject(skinNow)[0];if(c&&c.point.y<-.6&&(!h||c.point.y<h.point.y))h=c;}
        const y=h?h.point.y:doorY(x,z);
        top.push(new T.Vector3(x,y+.004,z));bottom.push(new T.Vector3(x,Math.min(y,doorY(x,z))-.012,z));}
      strips.push(quadStrip(top,bottom));}
    mesh(name,merge(strips),'skin');
  };
  mesh('radome',radome,'radome');mesh('fixed_windscreen',windscreen,'glass');mesh('intake_duct',duct,'duct');

  // ---- canopy (rear hinge, opens upward) and cockpit
  const canopy=joint('canopy',[0,.83,-3.15],'canopy',[1,0,0]);
  attach('canopy_glass',take(canopyFaces),'glass',canopy);
  attach('canopy_rear_bow',merge([segment([-.33,.80,-3.13],[-.18,.97,-3.12],.022),
    segment([-.18,.97,-3.12],[.18,.97,-3.12],.022),segment([.18,.97,-3.12],[.33,.80,-3.13],.022)]),'metal',canopy);
  const tub=[
    box([.78,.025,1.75],[0,.22,-4.02]),                      // floor
    box([.025,.40,1.75],[-.39,.42,-4.02]),box([.025,.40,1.75],[.39,.42,-4.02]), // side walls
    box([.78,.40,.025],[0,.42,-3.15]),                       // rear bulkhead
    box([.78,.36,.03],[0,.40,-4.88]),                         // instrument panel
    trapezoidDeck(.38,.13,-4.90,-5.75,.56),                   // glare-shield deck, inside the windscreen base
    box([.22,.06,.40],[-.30,.52,-3.95]),box([.22,.06,.40],[.30,.52,-3.95]), // side consoles
  ];
  mesh('cockpit_tub',merge(tub),'interior');
  // Seat sized to the measured canopy (inner height 1.12 m on the centreline at
  // z -3.66, 1.03 m at x 0.25): headrest top 1.07 m, back narrowing upward.
  mesh('cockpit_seat',merge([box([.44,.10,.44],[0,.40,-3.95]),box([.44,.36,.10],[0,.63,-3.68]),box([.36,.20,.10],[0,.91,-3.67]),
    box([.26,.08,.12],[0,1.03,-3.66]),box([.05,.26,.05],[0,.52,-4.28])]),'interior');
  mesh('cockpit_HUD',merge([box([.24,.20,.008],[0,.80,-5.02]),box([.24,.05,.10],[0,.67,-4.98])]),'glass');

  // ---- IRST: smooth teardrop fairing on the starboard nose (where the CAD
  // had a faceted box, x 0.04..0.24, z -6.38..-5.67) carrying an optical ball.
  {
    const cx=.14,zBall=-6.30,zEnd=-5.62,ballR=.072,skinY=z=>{caster.set(new T.Vector3(cx,3,z),new T.Vector3(0,-1,0));
      const h=caster.intersectObject(skinNow)[0]||caster.intersectObject(tempMesh(radome))[0];return h?h.point.y:.50;};
    const rOf=t=>.088*Math.sqrt(Math.max(0,1-t*t*.0))*(1-Math.pow(t,1.6)); // t 0 at ball, 1 at tail
    const nz=26,na=28,rows=[];
    for(let i=0;i<=nz;i++){const t=i/nz,z=T.MathUtils.lerp(zBall,zEnd,t),base=skinY(z)-.012,r=Math.max(.002,rOf(t)),row=[];
      for(let j=0;j<=na;j++){const a=j/na*Math.PI;row.push(new T.Vector3(cx+r*Math.cos(a),base+.012+r*.92*Math.sin(a)-.012*(1-Math.sin(a)),z));}
      rows.push(row);}
    const fairing=[];for(let i=0;i<nz;i++)fairing.push(quadStrip(rows[i],rows[i+1]));
    const ballC=new T.Vector3(cx,skinY(zBall)+.012+.088*.55,zBall);
    // collar where the fairing meets the ball, then the ball itself
    const collar=[];for(let j=0;j<=na;j++){const a=j/na*Math.PI;collar.push(new T.Vector3(cx+.088*Math.cos(a),skinY(zBall)+.088*.92*Math.sin(a),zBall));}
    const collarIn=collar.map(p=>p.clone().lerp(ballC,.25));
    fairing.push(quadStrip(collar,collarIn));
    mesh('IRST_fairing',merge(fairing),'skin');
    mesh('IRST_window',boxUV(new T.SphereGeometry(ballR,32,20).translate(...ballC.toArray())),'optics');
  }

  // ---- canards: all-moving, spanwise pivot near the root mid-chord
  for(const s of [1,-1]){
    const c=joint(`canard_${s>0?'R':'L'}`,[s*.70,.21,-2.15],'canard',[1,0,0],{side:s});
    attach(c.name+'_skin',take(bodyKeys(canardBodies[s])),'skin',c);
  }

  // ---- leading-edge flaps (cut above), hinged on their rear edge
  const leHinge=LE_FLAP.hinge,leEdge=LE_FLAP.edge;
  for(const s of [1,-1]){
    const tag=s>0?'R':'L';
    for(const [part,x0,x1]of LE_FLAP.sections){
      const g=slatPieces[tag+part],target=tempMesh(g),xm=(x0+x1)/2;
      caster.set(new T.Vector3(s*xm,2,leHinge(xm)-.01),new T.Vector3(0,-1,0));
      const h=caster.intersectObject(target),ym=h.length>1?(h[0].point.y+h.at(-1).point.y)/2:-.80;
      const j=joint(`leading_edge_flap_${tag}_${part}`,[s*xm,ym,leHinge(xm)],'slat',[s,0,LE_FLAP.hingeSlope],{side:s});
      const caps=[];
      // end ribs at both span stations and the rear (hinge) face
      for(const x of [x0+.003,x1-.003]){
        const rays=[];for(let i=0;i<=8;i++){const z=T.MathUtils.lerp(leEdge(x)+.004,leHinge(x)-.003,i/8);rays.push({origin:new T.Vector3(s*x,2,z),dir:new T.Vector3(0,-1,0)});}
        caps.push(capStrip([target],rays));
      }
      const back=[];for(let i=0;i<=16;i++){const x=T.MathUtils.lerp(x0+.003,x1-.003,i/16);back.push({origin:new T.Vector3(s*x,2,leHinge(x)-.003),dir:new T.Vector3(0,-1,0)});}
      caps.push(capStrip([target],back));
      attach(j.name+'_skin',merge([g,...caps.filter(Boolean)]),'skin',j);
    }
  }
  // The CAD root fairing (x 0.92..~1.5, z 3.11..4.36) has an upper skin only;
  // its lower skin is missing (scan: work/j10c/scan-root.mjs). Close it with a
  // panel at the neighbouring lower-surface height, ending where the CAD wing
  // lower skin starts (that edge runs from x 1.54 at z 3.11 to 1.12 at z 4.36).
  const rootLower={};
  for(const s of [1,-1]){
    // Laps 6 cm under f187 (fore) and 10 cm under f170 (outboard); the panel
    // sits above those lower skins there, so the overlap is hidden inside.
    const rows=[];for(let i=0;i<=10;i++){const z=T.MathUtils.lerp(3.04,4.358,i/10),xe=1.54-(z-3.11)*.336+.10,row=[];
      for(let k=0;k<=6;k++){const x=T.MathUtils.lerp(.915,xe,k/6);row.push(new T.Vector3(s*x,-.789+(x-.92)*.15,z));}rows.push(row);}
    const strips=[];for(let i=0;i<10;i++)strips.push(quadStrip(rows[i],rows[i+1]));
    rootLower[s]=merge(strips);mesh('wing_root_lower_closure_'+(s>0?'R':'L'),rootLower[s],'skin');
  }
  // ---- wing tip (user's marked-up plan view + reference photo): the elevon
  // stops at ELEVON_END; outboard of it the whole tip is fixed structure, its
  // leading edge carried straight out to WING_TIP (public span 9.75 m) and the
  // trailing corner cut away by a quarter-ellipse from the tip point to the
  // trailing edge at TE_CORNER_X. Section from the removed CAD tip.
  const wingTip={};
  for(const s of [1,-1]){
    const tag=s>0?'R':'L',zh=4.358;
    const sect=(x,z)=>{caster.set(new T.Vector3(s*T.MathUtils.clamp(x,4.56,4.70),2,Math.min(z,4.33)),new T.Vector3(0,-1,0));const h=caster.intersectObject(cadTip[s]);
      return h.length>1?{ym:(h[0].point.y+h.at(-1).point.y)/2,h:Math.max(.0015,(h[0].point.y-h.at(-1).point.y)/2)}:{ym:-.81,h:.0015};};
    // The CAD wings are not quite mirror images (the port leading edge runs up
    // to 9 cm further forward outboard), so continue each side's own leading
    // edge, measured on its outer flap, straight out to the tip.
    const flapLE=x=>{const m=tempMesh(slatPieces[tag+'outer']);for(let z=2.5;z<4.4;z+=.002){caster.set(new T.Vector3(s*x,2,z),new T.Vector3(0,-1,0));if(caster.intersectObject(m).length)return z;}return LE_FLAP.edge(x);};
    const la=flapLE(4.0),lb=flapLE(TIP_ROOT-.006),edge=x=>lb+(la-lb)*(x-(TIP_ROOT-.006))/(4.0-(TIP_ROOT-.006));
    const zc=edge(WING_TIP),ax=WING_TIP-TE_CORNER_X,az=wingTE(TE_CORNER_X)-zc;
    const aft=x=>x<=TE_CORNER_X?wingTE(x):zc+az*Math.sqrt(Math.max(0,1-((x-TE_CORNER_X)/ax)**2));
    // A thin closed panel over [x0,x1] between front(x) and aft(x); a leading
    // edge front closes to zero thickness, a hinge front gets a face.
    const panel=(x0,x1,nx,front,frontIsLE)=>{
      const nz=14,U=[],L=[];
      for(let k=0;k<=nx;k++){const x=T.MathUtils.lerp(x0,x1,1-Math.pow(1-k/nx,1.6)),zf=front(x),za=Math.max(zf+.0005,aft(x)),u=[],l=[];
        for(let i=0;i<=nz;i++){const z=T.MathUtils.lerp(zf,za,i/nz),c=sect(x,z),tLE=frontIsLE?Math.min(1,i/(nz*.3)):1,tTE=z>zh?1-.85*(z-zh)/Math.max(.01,za-zh):1;
          const h=c.h*tLE*tTE;u.push(new T.Vector3(s*x,c.ym+h,z));l.push(new T.Vector3(s*x,c.ym-h,z));}
        U.push(u);L.push(l);}
      const parts=[];
      for(let k=0;k<nx;k++){parts.push(quadStrip(U[k],U[k+1]),quadStrip(L[k],L[k+1]),
        quadStrip([U[k][nz],U[k+1][nz]],[L[k][nz],L[k+1][nz]]));                          // trailing edge / tip arc
        if(!frontIsLE)parts.push(quadStrip([U[k][0],U[k+1][0]],[L[k][0],L[k+1][0]]));}   // hinge face
      parts.push(quadStrip(U[0],L[0]),quadStrip(U[nx],L[nx]));                            // end ribs
      return parts;
    };
    const parts=[...panel(ELEVON_END,TIP_ROOT,3,()=>zh,false),...panel(TIP_ROOT,WING_TIP,18,edge,true)];
    wingTip[s]=merge(parts);mesh('wing_tip_'+tag,wingTip[s],'skin');
  }
  // Rear spar caps of the fixed wing at the LE-flap hinge and the elevon hinge.
  const wingTargets={1:tempMesh(merge([fixed.wing_R,fixed.wing_root_lower_R,rootLower[1],wingTip[1]])),'-1':tempMesh(merge([fixed.wing_L,fixed.wing_root_lower_L,rootLower[-1],wingTip[-1]]))};
  const spar=[];
  for(const s of [1,-1]){
    const leRays=[],teRays=[];
    for(let i=0;i<=40;i++){const x=T.MathUtils.lerp(LE_FLAP.sections[0][1]+.003,LE_FLAP.sections[1][2]-.003,i/40);leRays.push({origin:new T.Vector3(s*x,2,leHinge(x)+.006),dir:new T.Vector3(0,-1,0)});}
    for(let i=0;i<=44;i++){const x=T.MathUtils.lerp(.925,4.72,i/44);teRays.push({origin:new T.Vector3(s*x,2,4.352),dir:new T.Vector3(0,-1,0)});}
    spar.push(capStrip([wingTargets[s]],leRays),capStrip([wingTargets[s]],teRays));
    // fixed-wing ribs facing the two outer ends of the leading-edge flap run
    for(const x of [LE_FLAP.sections[0][1]-.003,LE_FLAP.sections[1][2]+.003]){
      const rays=[];for(let i=0;i<=8;i++){const z=T.MathUtils.lerp(LE_FLAP.edge(x)+.004,LE_FLAP.hinge(x)+.004,i/8);rays.push({origin:new T.Vector3(s*x,2,z),dir:new T.Vector3(0,-1,0)});}
      spar.push(capStrip([wingTargets[s]],rays));
    }
  }
  mesh('wing_hinge_spars',merge(spar.filter(Boolean)),'skin');


  // ---- elevons: closed foils matching the wing section at the z=4.36 hinge
  const teZ=wingTE;
  const wingAt=(s,x)=>{caster.set(new T.Vector3(s*x,2,4.33),new T.Vector3(0,-1,0));const h=caster.intersectObject(wingTargets[s]);
    if(h.length<2)throw new Error(`no wing section at the elevon hinge, x=${s*x}`);
    return {yu:h[0].point.y,yl:h.at(-1).point.y};};
  for(const s of [1,-1]){
    // The outer elevon stops at ELEVON_END; the tip outboard is fixed.
    for(const [part,x0,x1]of [['inner',.93,2.685],['outer',2.695,ELEVON_END-.003]]){
      const n=part==='outer'?12:8,secs=[];
      for(let i=0;i<=n;i++){const x=T.MathUtils.lerp(x0,x1,i/n),w=wingAt(s,Math.min(x,4.72));
        secs.push({x:s*x,zh:4.365,zt:teZ(x),yu:w.yu,yl:Math.min(w.yl,w.yu-.008)});}
      if(s<0)secs.reverse();
      const mid=wingAt(s,(x0+x1)/2);
      const j=joint(`elevon_${s>0?'R':'L'}_${part}`,[s*(x0+x1)/2,(mid.yu+mid.yl)/2,4.365],'elevon',[1,0,0],{side:s});
      attach(j.name+'_skin',controlFoil(secs),'skin',j);
    }
  }

  // ---- rudder (CAD skins + hinge cap)
  const rudderAxis=v([-.025,2.897,8.046]).sub(v([-.048,.887,6.748]));
  const rudder=joint('rudder',[0,.887,6.748],'rudder',rudderAxis.toArray());
  const rudderG=take(rudderFaces),rudderTarget=tempMesh(rudderG),rudderRays=[];
  for(let i=0;i<=20;i++){const t=i/20,p=v([0,.887,6.748]).lerp(v([0,2.897,8.046]),t);p.z+=.012;rudderRays.push({origin:p.clone().setX(1),dir:new T.Vector3(-1,0,0)});}
  attach('rudder_skin',merge([rudderG,capStrip([rudderTarget],rudderRays)].filter(Boolean)),'skin',rudder);

  // ---- airbrakes: cut fuselage panels hinged at their forward edge
  for(const s of [1,-1]){
    const tag=s>0?'R':'L',panel=cutPieces['airbrake_'+tag];
    const j=joint('airbrake_'+tag,[s*.69,-.17,4.55],'airbrake',[-.66*s,.75,0],{side:s});
    attach(j.name+'_panel',panel,'skin',j);
    // Shallow well behind the panel so the opening shows structure, not a void.
    const walls=[],back=[];
    for(const [y0,y1,z0,z1]of [[-.45,.12,4.55,4.55],[-.45,.12,5.40,5.40],[-.45,-.45,4.55,5.40],[.12,.12,4.55,5.40]]){
      const outer=[],inner=[];
      for(let i=0;i<=8;i++){const t=i/8,y=T.MathUtils.lerp(y0,y1,t),z=T.MathUtils.lerp(z0,z1,t);
        caster.set(new T.Vector3(s*3,y,z),new T.Vector3(-s,0,0));const h=caster.intersectObject(originalSkin)[0];if(!h)continue;
        outer.push(h.point);inner.push(h.point.clone().add(new T.Vector3(-s*.09,0,0)));}
      if(outer.length>1)walls.push(quadStrip(outer,inner));
    }
    for(let i=0;i<=6;i++){const y=T.MathUtils.lerp(-.45,.12,i/6);const row=[];
      for(let k=0;k<=6;k++){const z=T.MathUtils.lerp(4.55,5.40,k/6);caster.set(new T.Vector3(s*3,y,z),new T.Vector3(-s,0,0));const h=caster.intersectObject(originalSkin)[0];row.push(h?h.point.clone().add(new T.Vector3(-s*.09,0,0)):new T.Vector3(s*.6,y,z));}
      back.push(row);}
    for(let i=0;i<6;i++)walls.push(quadStrip(back[i],back[i+1]));
    // Same finish as the panel: the hairline seam then reads as a panel line.
    mesh('airbrake_bay_'+tag,merge(walls),'skin');
  }

  // ---- drag-chute housing doors (clamshell, vertical hinges at the sides)
  for(const s of [1,-1]){
    const j=joint('parachute_door_'+(s>0?'R':'L'),[s*.13,.70,7.88],'parachute-door',[0,1,0],{side:s});
    attach(j.name+'_skin',take(chuteFaces[s]),'skin',j);
  }

  // ---- refuelling probe: fixed starboard probe on J-10C
  // ---- retractable refuelling probe. Built stowed (lying in its bay); the
  // extended pose points it at the CAD probe tip (1.08, 0.76, -6.43).
  {
    const ext=v([1.08,.76,-6.43]).sub(PB.B).normalize();
    const axis=new T.Vector3().crossVectors(PB.t,ext).normalize(),extendAngle=Math.acos(T.MathUtils.clamp(PB.t.dot(ext),-1,1));
    const probe=joint('refueling_probe',PB.B.toArray(),'probe',axis.toArray(),{extendDeg:T.MathUtils.radToDeg(extendAngle)});
    const at=d=>PB.B.clone().addScaledVector(PB.t,d);
    attach('refueling_probe_shaft',merge([segment(at(-.03).toArray(),at(PB.len).toArray(),.034,.030,20),
      segment(at(-.05).toArray(),at(.10).toArray(),.042,.042,20),                       // root collar / hinge fitting
      segment(at(PB.len).toArray(),at(PB.len+.10).toArray(),.044,.044,20),               // nozzle body
      segment(at(PB.len+.10).toArray(),at(PB.len+.16).toArray(),.040,.018,20)]),'metal',probe);
    // bay door: the cut skin, hinged along the lower edge of the bay
    const door=joint('refueling_probe_door',PB.B.clone().addScaledVector(PB.up,-PB.half).addScaledVector(PB.out,.05).toArray(),'probe-door',PB.t.toArray(),{side:1});
    attach('refueling_probe_door_skin',probeDoorSkin,'skin',door);
    // bay well: floor and walls from the floor up to the original skin
    const floorAt=(d,u)=>PB.B.clone().addScaledVector(PB.t,d).addScaledVector(PB.up,u).addScaledVector(PB.out,-.055);
    const skinAbove=p=>{caster.set(p,PB.out);const h=caster.intersectObject(noseSkin)[0];return h?h.point.clone().addScaledVector(PB.out,-.004):p.clone().addScaledVector(PB.out,.06);};
    const walls=[],n=16,d0=PB.t0+.004,d1=PB.t1-.004,u0=-PB.half+.004,u1=PB.half-.004;
    for(const u of [u0,u1]){const a=[],b=[];for(let i=0;i<=n;i++){const p=floorAt(T.MathUtils.lerp(d0,d1,i/n),u);a.push(p);b.push(skinAbove(p));}walls.push(quadStrip(a,b));}
    for(const d of [d0,d1]){const a=[],b=[];for(let i=0;i<=4;i++){const p=floorAt(d,T.MathUtils.lerp(u0,u1,i/4));a.push(p);b.push(skinAbove(p));}walls.push(quadStrip(a,b));}
    {const a=[],b=[];for(let i=0;i<=n;i++){const d=T.MathUtils.lerp(d0,d1,i/n);a.push(floorAt(d,u0));b.push(floorAt(d,u1));}walls.push(quadStrip(a,b));}
    mesh('refueling_probe_bay',merge(walls),'interior');
  }

  // ---- gun port. Sources place the J-10's internal 23 mm cannon on the port
  // side of the forward fuselage above the nose gear; the muzzle is set on the
  // lower port intake-trunk side, ahead of the nose-gear well.
  {
    const gz=-3.32,gy=-.80;caster.set(new T.Vector3(-3,gy,gz),new T.Vector3(1,0,0));
    const h=caster.intersectObject(skinNow)[0],mx=h?h.point.x:-.70,nrm=new T.Vector3(-1,0,0);
    const muzzle=new T.Vector3(mx-.004,gy,gz);
    // dark elongated port lying on the skin (3 mm proud), muzzle at its front
    const onSkin=(y,z)=>{caster.set(new T.Vector3(-3,y,z),new T.Vector3(1,0,0));const p=caster.intersectObject(skinNow)[0]?.point;return p?p.add(new T.Vector3(-.003,0,0)):new T.Vector3(mx-.003,y,z);};
    const pos=[],idx=[],centre=onSkin(gy,gz+.15);pos.push(...centre.toArray());
    const N=32;for(let i=0;i<N;i++){const a=i/N*Math.PI*2;pos.push(...onSkin(gy+.038*Math.sin(a),gz+.15+.17*Math.cos(a)).toArray());}
    for(let i=0;i<N;i++)idx.push(0,1+i,1+(i+1)%N);
    mesh('gun_port',merge([boxUV(geometry(pos,idx)),segment(muzzle.clone().add(new T.Vector3(.012,0,0)).toArray(),muzzle.clone().add(new T.Vector3(.012,0,.08)).toArray(),.020,.020,12)]),'duct');
    root.userData.exportExtras.gunMuzzle=muzzle.toArray().map(v=>+v.toFixed(4));
    root.userData.exportExtras.gunDirection=[0,0,-1];
  }
  root.userData.exportExtras.nozzleExit={centre:[0,-.30,7.62],radius:.50,axis:[0,0,1]};

  // ---- nozzle: the user's closed-nozzle photo, with a bright fixed collar,
  // bowed overlapping feathers and a heat-darkened lip. Dimensions, finishes
  // and the 0.50 -> 0.64 m aperture are visual modelling values, not engine data.
  const cy=-.30;
  const collar=materials.metal.clone();collar.name='J10C nozzle brushed silver collar';
  collar.color.copy(color(0xa5a397));collar.metalness=.72;collar.roughness=.42;
  mesh('nozzle_shroud',conePatch(cy,.660,.625,6.60,6.95,0,Math.PI*2,64,5),'hot').material=collar;
  for(const [z,r]of [[6.615,.659],[6.925,.628]])
    mesh('nozzle_collar_seam_'+z,boxUV(new T.TorusGeometry(r,.005,6,64).translate(0,cy,z)),'hot');
  const featherMaterials=[0x79766b,0x807b6e,0x72736e,0x7d786d].map((h,i)=>{
    const m=materials.hot.clone();m.name='J10C nozzle worn metal '+i;m.color.copy(color(h));m.metalness=.64;m.roughness=.49+i*.015;return m;
  });
  const oxide=materials.hot.clone();oxide.name='J10C nozzle root oxidation';oxide.color.copy(color(0x504d45));oxide.roughness=.67;
  const burnt=materials.hot.clone();burnt.name='J10C nozzle heat-stained lip';burnt.color.copy(color(0x474b4e));burnt.metalness=.42;burnt.roughness=.72;
  const rubbed=materials.metal.clone();rubbed.name='J10C nozzle longitudinal wear';rubbed.color.copy(color(0x999383));rubbed.roughness=.50;
  const featherPoint=(r0,r1,z0,z1,am,half,bow,t,u,layer=0)=>{
    const a=(u*2-1)*half,width=r0*(1-.015*t);
    // Near-constant feather width keeps the joints covered when they open.
    const r=T.MathUtils.lerp(r0,r1,t)+4*bow*t*(1-t)-width*(1-Math.cos(a))+
      .012*(u-.5)*Math.sin(t*Math.PI/2)-layer;
    const side=width*Math.sin(a),z=T.MathUtils.lerp(z0,z1,t)-.006*t**8*(u*2-1)**2;
    return [r*Math.cos(am)-side*Math.sin(am),cy+r*Math.sin(am)+side*Math.cos(am),z];
  };
  const feather=(r0,r1,z0,z1,am,half,bow,thickness,start=0,end=1)=>{
    const p=[],uv=[],idx=[],rows=Math.max(2,Math.ceil(16*(end-start))),cols=6,stride=cols+1,face=(rows+1)*stride;
    for(let layer=0;layer<2;layer++)for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){
      const t=T.MathUtils.lerp(start,end,j/rows),u=k/cols;
      p.push(...featherPoint(r0,r1,z0,z1,am,half,bow,t,u,layer*thickness));uv.push(u,t);
    }
    for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){
      const a=j*stride+k,b=a+1,c=a+stride,d=c+1;
      idx.push(a,b,c,b,d,c,a+face,c+face,b+face,b+face,c+face,d+face);
    }
    const rim=[];
    for(let k=0;k<=cols;k++)rim.push(k);
    for(let j=1;j<=rows;j++)rim.push(j*stride+cols);
    for(let k=cols-1;k>=0;k--)rim.push(rows*stride+k);
    for(let j=rows-1;j>0;j--)rim.push(j*stride);
    for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];idx.push(a,a+face,b,b,a+face,b+face);}
    return geometry(p,idx,uv);
  };
  mesh('engine_liner',merge([conePatch(cy,.56,.53,6.20,7.30,0,Math.PI*2,40,2),
    lathe([[.001,-.12],[.18,-.08],[.30,0],[.56,0]],40,cy,6.30)]),'hot');
  mesh('engine_turbine_face',merge([lathe([[.001,-.16],[.12,-.10],[.20,0]],32,cy,6.40),
    ...Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2;return segment([.20*Math.cos(a),cy+.20*Math.sin(a),6.42],[.55*Math.cos(a+.15),cy+.55*Math.sin(a+.15),6.44],.012,.018,4);})]),'duct');
  // The CAD intake duct ends at z 1.887 in a circle of r 0.55 on the engine axis
  // and is open behind it. Close it with the engine: a forward-facing
  // compressor face (spinner + 24 blades) and a case running back to the liner,
  // so the intake shows the compressor and nothing of the empty fuselage.
  const ductEnd=1.885,fanR=.552;
  mesh('engine_compressor_face',merge([lathe([[.001,-.26],[.07,-.20],[.13,-.10],[.17,0]],40,cy,ductEnd+.06),
    lathe([[.17,0],[fanR,0]],48,cy,ductEnd+.075),
    ...Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2;return segment([.17*Math.cos(a),cy+.17*Math.sin(a),ductEnd+.055],[(fanR-.01)*Math.cos(a+.22),cy+(fanR-.01)*Math.sin(a+.22),ductEnd+.035],.016,.012,4);})]),'metal');
  mesh('engine_case',conePatch(cy,fanR+.004,.562,ductEnd-.01,6.22,0,Math.PI*2,48,3),'duct');
  for(let i=0;i<16;i++){
    const am=(i+.5)/16*Math.PI*2,half=Math.PI/16*1.12;
    const pivot=[.62*Math.cos(am),cy+.62*Math.sin(am),6.93];
    const j=joint(`nozzle_petal_${String(i).padStart(2,'0')}`,pivot,'nozzle-petal',[-Math.sin(am),Math.cos(am),0],{index:i,dir:1});
    attach(j.name+'_skin',feather(.62,.50,6.93,7.62,am,half,.025,.006),'hot',j).material=featherMaterials[i%4];
    attach(j.name+'_root_oxide',feather(.621,.501,6.93,7.62,am,half,.025,.002,0,.13),'hot',j).material=oxide;
    attach(j.name+'_heat_stain',feather(.621,.501,6.93,7.62,am,half,.025,.002,.83,1),'hot',j).material=burnt;
    attach(j.name+'_liner',feather(.603,.485,6.93,7.607,am,half*1.02,.012,.005),'duct',j);
    const tracks=[];
    for(const u of [.14,.58,.88])for(let k=0;k<6;k++){
      const t0=.20+k*.085,t1=t0+.060;
      tracks.push(segment(featherPoint(.622,.502,6.93,7.62,am,half,.025,t0,u),
        featherPoint(.622,.502,6.93,7.62,am,half,.025,t1,u),.0012,.001,4));
    }
    attach(j.name+'_wear_tracks',merge(tracks),'hot',j).material=rubbed;
  }

  // ---- landing gear
  const tire=(r,w)=>boxUV(indexed(landingTire(r,w)));
  const hub=(r,w)=>boxUV(indexed(new T.CylinderGeometry(r*.52,r*.52,w*1.02,24).rotateZ(Math.PI/2)));
  // Nose gear: twin wheels, raked strut, retracts aft into the belly slot.
  const nb=G.noseBay,np=v(G.nosePivot),na=v(G.noseAxle),legDir=na.clone().sub(np);
  const noseLeg=joint('nose_gear_leg',np.toArray(),'gear-fold',[1,0,0],{isNose:true,foldAngle:-(90+T.MathUtils.radToDeg(Math.atan2(-legDir.z,-legDir.y)))});
  // One straight line from pivot to axle: cylinder, piston and steering axis are
  // all coaxial with legDir, so nothing kinks at any compression or steer angle.
  const at=t=>np.clone().lerp(na,t),fwd=new T.Vector3(0,legDir.z,-legDir.y).normalize().multiplyScalar(-1);
  attach('nose_gear_strut',merge([segment(np.toArray(),at(.62).toArray(),.055,.05),
    segment([-.06,np.y,np.z],[.06,np.y,np.z],.045)]),'metal',noseLeg);
  const noseShock=joint('nose_gear_shock',at(.55).toArray(),'shock',legDir.clone().normalize().toArray(),{travel:.10},noseLeg);
  const noseCarrier=joint('nose_gear_wheels',na.toArray(),'wheel-carrier',legDir.clone().normalize().toArray(),{isNose:true},noseShock);
  const knee=at(.80).add(fwd.clone().multiplyScalar(.09));
  attach('nose_gear_piston',merge([segment(at(.55).toArray(),at(.97).toArray(),.036),
    box([.12,.08,.07],at(.97).toArray()),
    segment([-G.noseWheel.track-.07,na.y,na.z],[G.noseWheel.track+.07,na.y,na.z],.025),
    // torque link (scissor) on the forward face of the strut
    segment(at(.66).add(fwd.clone().multiplyScalar(.03)).toArray(),knee.toArray(),.014),
    segment(knee.toArray(),at(.94).add(fwd.clone().multiplyScalar(.03)).toArray(),.014)]),'metal',noseCarrier);
  for(const s of [1,-1]){
    const w=joint(`nose_wheel_${s>0?'R':'L'}`,[s*G.noseWheel.track,na.y,na.z],'wheel',[1,0,0],{isNose:true},noseCarrier);
    attach(w.name+'_tire',tire(G.noseWheel.radius,G.noseWheel.width).translate(...worldPivot(w).toArray()),'tire',w);
    attach(w.name+'_hub',hub(G.noseWheel.radius,G.noseWheel.width).translate(...worldPivot(w).toArray()),'wheelhub',w);
  }
  // Nose bay walls, roof and the two doors (hinged at the slot's outer edges).
  // Well walls stand 2.5 cm inside the opening so they never share a plane
  // with the skin-coloured frame lip that lines the opening edge.
  const wellH=nb.roof-nb.skinY,wellZ=(nb.z0+nb.z1)/2,wellL=nb.z1-nb.z0-.05,wellW=nb.halfWidth-.025;
  const noseWell=[box([wellW*2,.02,wellL],[0,nb.roof,wellZ]),
    box([.02,wellH,wellL],[-wellW+.01,(nb.roof+nb.skinY)/2,wellZ]),box([.02,wellH,wellL],[wellW-.01,(nb.roof+nb.skinY)/2,wellZ]),
    box([wellW*2,wellH,.02],[0,(nb.roof+nb.skinY)/2,nb.z0+.035]),box([wellW*2,wellH,.02],[0,(nb.roof+nb.skinY)/2,nb.z1-.035])];
  mesh('nose_bay_well',merge(noseWell),'interior');
  // Raised duct floor over the well: one smooth height field. Its flat core
  // covers the cut hole (and the well under it); outside the core it eases down
  // to the original duct floor on all four sides, so from the intake it reads
  // as a gentle hump, never as a box or as well structure.
  const ductTargetAll=tempMesh(duct),ductFloorAt=(x,z)=>{caster.set(new T.Vector3(x,-3,z),new T.Vector3(0,1,0));
    const h=caster.intersectObject(ductTargetAll).find(h=>h.point.y<-.70);return h?h.point.y:-.9;};
  const hw=nb.halfWidth+.03,fz0=nb.z0-.012,fz1=nb.z1+.012,side=.17,fore=.50,aft=.32,top=-.685;
  const hump=[],nxH=20,nzH=34;
  for(let i=0;i<=nzH;i++){const z=T.MathUtils.lerp(fz0-fore,fz1+aft,i/nzH),row=[];
    for(let k=0;k<=nxH;k++){const x=T.MathUtils.lerp(-hw-side,hw+side,k/nxH),floor=ductFloorAt(x,z);
      const dx=Math.max(0,Math.abs(x)-hw)/side,dz=z<fz0?(fz0-z)/fore:z>fz1?(z-fz1)/aft:0;
      const t=1-smooth(Math.min(1,Math.hypot(dx,dz)));
      row.push(new T.Vector3(x,Math.max(floor+.004,T.MathUtils.lerp(floor,top,t)),z));}
    hump.push(row);}
  const ductPatch=[];for(let i=0;i<nzH;i++)ductPatch.push(quadStrip(hump[i],hump[i+1]));
  mesh('intake_duct_well_fairing',merge(ductPatch),'duct');
  const noseDoorY=x=>nb.skinY-.02-.02*(1-Math.min(1,(x/nb.halfWidth)**2));
  frameLip([[nb.halfWidth,nb.z0],[nb.halfWidth,nb.z1],[-nb.halfWidth,nb.z1],[-nb.halfWidth,nb.z0],[nb.halfWidth,nb.z0]],x=>noseDoorY(x),'nose_bay_frame');
  for(const s of [1,-1]){
    const d=joint(`nose_gear_door_${s>0?'R':'L'}`,[s*nb.halfWidth,noseDoorY(nb.halfWidth),(nb.z0+nb.z1)/2],'gear-door',[0,0,1],{side:s,isNose:true});
    // Doors lap the opening by 5 mm at the ends and 4 mm at the centre seam
    // (the starboard door sits 2 mm lower where they overlap).
    const p=[],idx=[];const nx=6,nz=10;
    for(let i=0;i<=nz;i++)for(let k=0;k<=nx;k++){const x=s*(nb.halfWidth-(nb.halfWidth+.004)*k/nx),z=T.MathUtils.lerp(nb.z0-.005,nb.z1+.005,i/nz);
      p.push(x,noseDoorY(x)-(s>0?.002:0),z);}
    for(let i=0;i<nz;i++)for(let k=0;k<nx;k++){const a=i*(nx+1)+k,b=a+1,c=a+nx+1,e=c+1;idx.push(a,b,c,b,e,c);}
    attach(d.name+'_skin',boxUV(geometry(p,idx)),'skin',d);
  }
  // Main gear: the strut hangs at the outer edge of the keel-side well and is
  // splayed outboard. Retraction un-splays, swings it forward, and the stub
  // axle turns vertical so the wheel lies flat inside the well.
  const doorLine=x=>{const L=G.mainDoorLine;let i=0;while(i<L.length-2&&x>L[i+1][0])i++;
    return T.MathUtils.lerp(L[i][1],L[i+1][1],T.MathUtils.clamp((x-L[i][0])/(L[i+1][0]-L[i][0]),0,1));};
  for(const s of [1,-1]){
    const tag=s>0?'R':'L',mp=G.mainPivot,r=G.mainWheel.radius;
    const pivot=v([s*mp.x,mp.y,mp.z]),stubEnd=v([s*G.mainStubEnd,J10C_GROUND_Y+r,mp.z]),hubC=stubEnd.clone().add(v([s*G.mainStub,0,0]));
    const legVec=stubEnd.clone().sub(pivot),splay=T.MathUtils.radToDeg(Math.atan2(Math.abs(legVec.x),-legVec.y));
    const leg=joint('main_gear_leg_'+tag,pivot.toArray(),'gear-fold',[1,0,0],{side:s,foldAngle:90,splay});
    attach(leg.name+'_strut',merge([segment(pivot.toArray(),pivot.clone().lerp(stubEnd,.58).toArray(),.05,.046),
      // trunnion along the fold axis (x), so it only spins in place when folding
      segment(pivot.clone().add(v([-.05,0,0])).toArray(),pivot.clone().add(v([.05,0,0])).toArray(),.040)]),'metal',leg);
    const shockAt=pivot.clone().lerp(stubEnd,.5);
    const shock=joint('main_gear_shock_'+tag,shockAt.toArray(),'shock',legVec.clone().normalize().toArray(),{travel:.10},leg);
    const carrier=joint('main_gear_wheel_carrier_'+tag,stubEnd.toArray(),'wheel-carrier',[0,1,0],{side:s,stub:[s,0,0]},shock);
    // The piston belongs to the shock (it stays on the strut line); only the
    // stub axle and its fitting turn with the wheel carrier.
    attach(shock.name+'_piston',segment(shockAt.toArray(),stubEnd.toArray(),.038,.036),'metal',shock);
    attach(carrier.name+'_axle',merge([
      segment(stubEnd.toArray(),hubC.clone().add(v([s*G.mainWheel.width*.45,0,0])).toArray(),.03),
      box([.08,.08,.08],stubEnd.toArray())]),'metal',carrier);
    const w=joint('main_wheel_'+tag,hubC.toArray(),'wheel',[1,0,0],{side:s},carrier);
    attach(w.name+'_tire',tire(r,G.mainWheel.width).translate(...worldPivot(w).toArray()),'tire',w);
    attach(w.name+'_hub',hub(r,G.mainWheel.width).translate(...worldPivot(w).toArray()),'wheelhub',w);
    frameLip([[s*mb.x0,mb.z0],[s*mb.x1,mb.z0],[s*mb.x1,mb.z1],[s*mb.x0,mb.z1],[s*mb.x0,mb.z0]],x=>doorLine(Math.abs(x))-.006,'main_bay_frame_'+tag);
    // Door follows the belly line across the opening, hinged at its outboard edge.
    const door=joint('main_gear_door_'+tag,[s*mb.x1,doorLine(mb.x1)-.006,(mb.z0+mb.z1)/2],'gear-door',[0,0,1],{side:s});
    const dp=[],di=[],nx=8,nz=14;
    // 5 mm lap on every side: the door sits 6 mm under the skin, so the lap
    // covers the rim seam without touching the frame.
    for(let i=0;i<=nz;i++)for(let k=0;k<=nx;k++){const x=T.MathUtils.lerp(mb.x0-.005,mb.x1+.005,k/nx),z=T.MathUtils.lerp(mb.z0-.005,mb.z1+.005,i/nz);dp.push(s*x,doorLine(x)-.006,z);}
    for(let i=0;i<nz;i++)for(let k=0;k<nx;k++){const a=i*(nx+1)+k,b=a+1,c=a+nx+1,e=c+1;di.push(a,b,c,b,e,c);}
    attach(door.name+'_skin',boxUV(geometry(dp,di)),'skin',door);
    // Well: from the door line (or remaining skin outboard) up to 3 cm under the
    // next surface above, extended outboard to hold the flat wheel.
    // Outboard of the opening the well floor runs straight from the door line to
    // the skin at the outer wall (sampled once per station: no stepped edges).
    const skinAt=(x,z)=>{caster.set(new T.Vector3(s*x,-4,z),new T.Vector3(0,1,0));const h=caster.intersectObject(originalSkin)[0];return h?h.point.y+.01:-.85;};
    const lowerY=(x,z)=>x<=mb.x1?doorLine(x)+.004:Math.max(skinAt(x,z)+.006,T.MathUtils.lerp(doorLine(mb.x1)+.004,skinAt(mb.wellOuter,z),(x-mb.x1)/(mb.wellOuter-mb.x1)));
    const rawRoof=(x,z)=>{const y0=lowerY(x,z)+.03;caster.set(new T.Vector3(s*x,y0,z),new T.Vector3(0,1,0));
      const h=caster.intersectObjects([originalSkin,ductTarget])[0];return Math.min(mb.roof,(h?h.point.y:mb.roof)-.03);};
    const x0=mb.x0+.015,x1=mb.wellOuter,z0=mb.z0+.015,z1=mb.z1-.015;
    // The CAD duct above is coarsely faceted; sample the clearance on a grid,
    // keep the lowest value in each 3x3 neighbourhood (never higher than any
    // sample) and box-blur it, so the roof and wall tops are smooth.
    const RX=10,RZ=16,grid=[];for(let i=0;i<=RZ;i++){grid.push([]);for(let k=0;k<=RX;k++)grid[i].push(rawRoof(T.MathUtils.lerp(x0,x1,k/RX),T.MathUtils.lerp(z0,z1,i/RZ)));}
    const pass=(g,f)=>g.map((row,i)=>row.map((_,k)=>{const n=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const r=g[i+a]?.[k+b];if(r!==undefined)n.push(r);}return f(n);}));
    const smoothRoof=pass(pass(pass(grid,n=>Math.min(...n)),n=>n.reduce((a,b)=>a+b)/n.length),n=>n.reduce((a,b)=>a+b)/n.length);
    const roofY=(x,z)=>{const u=T.MathUtils.clamp((x-x0)/(x1-x0),0,1)*RX,w=T.MathUtils.clamp((z-z0)/(z1-z0),0,1)*RZ;
      const k=Math.min(RX-1,Math.floor(u)),i=Math.min(RZ-1,Math.floor(w)),fu=u-k,fw=w-i;
      return T.MathUtils.lerp(T.MathUtils.lerp(smoothRoof[i][k],smoothRoof[i][k+1],fu),T.MathUtils.lerp(smoothRoof[i+1][k],smoothRoof[i+1][k+1],fu),fw);};
    const corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]],walls=[];
    for(let c=0;c<4;c++){const [xa,za]=corners[c],[xb,zb]=corners[c+1],lo=[],hi=[];
      for(let i=0;i<=12;i++){const x=T.MathUtils.lerp(xa,xb,i/12),z=T.MathUtils.lerp(za,zb,i/12);
        lo.push(new T.Vector3(s*x,lowerY(x,z),z));hi.push(new T.Vector3(s*x,roofY(x,z),z));}
      walls.push(quadStrip(lo,hi));}
    const rows=[];for(let i=0;i<=12;i++){const z=T.MathUtils.lerp(z0,z1,i/12),row=[];
      for(let k=0;k<=8;k++){const x=T.MathUtils.lerp(x0,x1,k/8);row.push(new T.Vector3(s*x,roofY(x,z),z));}rows.push(row);}
    for(let i=0;i<12;i++)walls.push(quadStrip(rows[i],rows[i+1]));
    mesh('main_bay_well_'+tag,merge(walls),'interior');
  }

  // ---- work areas and direction calibration
  calibrateDirections(root);
  groupWorkZones(root);
  return root;
}

// For each rig node choose the sign so that a positive command produces the
// documented motion (canopy up, slats/elevons/doors down, airbrake outward...).
function calibrateDirections(root){
  root.updateMatrixWorld(true);
  const probe=(o,angle)=>{
    const m=data(o),axis=v(m.axis),pts=[];
    o.traverse(c=>{if(c.isMesh){const p=c.geometry.attributes.position;for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/60)))pts.push(new T.Vector3().fromBufferAttribute(p,i));}});
    const far=pts.reduce((a,b)=>b.clone().cross(axis).lengthSq()>a.clone().cross(axis).lengthSq()?b:a);
    const moved=far.clone().applyAxisAngle(axis,angle);
    return {far,moved,d:moved.clone().sub(far)};
  };
  root.traverse(o=>{
    const m=data(o);if(!m.role||m.dir!==undefined)return;
    const {d,far}=probe(o,.1);
    let want=null;
    if(['canopy'].includes(m.role))want=d.y>0;
    if(['slat','elevon','gear-door'].includes(m.role))want=d.y<0;
    if(m.role==='canard')want=far.z<0?d.y>0:d.y<0;        // positive = nose-up (leading edge up)
    if(m.role==='airbrake'||m.role==='parachute-door'||m.role==='probe-door')want=d.x*m.side>0;
    if(m.role==='rudder')want=d.x>0;                       // positive = trailing edge to starboard
    if(m.role==='nozzle-petal')want=new T.Vector2(m.pivot[0],m.pivot[1]+.30).dot(new T.Vector2(d.x,d.y))>0; // positive = open
    m.dir=want===null?1:want?1:-1;
  });
}

function groupWorkZones(root){
  const groups={};
  for(const [id,zone]of Object.entries(J10C_WORKZONES)){
    const g=new T.Group();g.name='workzone_'+id;g.userData.exportExtras={workZone:id,label:zone.label,includes:zone.includes};groups[id]=g;
  }
  for(const a of [...root.children]){
    let id;
    if(/^(radome|fuselage_nose|fixed_windscreen|canopy|cockpit_|IRST_|nose_|refueling_|canard_|gun_)/.test(a.name))id='nose';
    else if(/^(fuselage_tail|fin|rudder|ventral_fin|airbrake|parachute_|nozzle_|engine_liner|engine_turbine)/.test(a.name))id='tail';
    else if(/^(fuselage_mid|wing_|leading_edge_|elevon_|main_|intake_|dorsal_|engine_compressor|engine_case)/.test(a.name))id='mid';
    else throw new Error('J-10C assembly needs a work area: '+a.name);
    a.traverse(o=>{o.userData.exportExtras={...data(o),workZone:id};});
    groups[id].add(a);
  }
  root.add(...Object.values(groups));
  root.userData.exportExtras.workZones=J10C_WORKZONES;
}

function legRotation(m,fold){
  const qFold=new T.Quaternion().setFromAxisAngle(v(m.axis).normalize(),rad(m.foldAngle)*fold*(m.dir??1));
  const qSplay=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-(m.side||1)*rad(m.splay||0)*fold);
  return qFold.multiply(qSplay);
}

// state: canopy 0..1, canards -1..1, slats 0..1, pitch/roll -1..1 (elevons),
// yaw -1..1, airbrake 0..1, gear 0..1 (1 = down), compression 0..1,
// steer -1..1, wheelSpin rad, nozzle 0..1 (1 = open), parachute 0..1,
// probe 0..1 (0 = stowed in its bay, 1 = extended).
export function poseJ10C(root,state={}){
  const gear=state.gear??1,fold=smooth((1-gear)/.80),nozzle=T.MathUtils.clamp(state.nozzle??0,0,1);
  root.traverse(o=>{
    const m=data(o);if(!m.role)return;
    const axis=v(m.axis||[1,0,0]).normalize(),dir=m.dir??1;let angle=null;
    if(m.local)o.position.fromArray(m.local);
    if(m.role==='canopy')angle=rad(48)*(state.canopy||0);
    if(m.role==='canard')angle=rad(25)*(state.canards||0);
    if(m.role==='slat')angle=rad(25)*(state.slats||0);
    if(m.role==='elevon')angle=rad(25)*T.MathUtils.clamp((state.pitch||0)+(state.roll||0)*(m.side||1),-1,1);
    if(m.role==='rudder')angle=rad(25)*(state.yaw||0);
    if(m.role==='airbrake')angle=rad(50)*(state.airbrake||0);
    if(m.role==='parachute-door')angle=rad(70)*(state.parachute||0);
    if(m.role==='nozzle-petal')angle=Math.asin((.50+.14*nozzle-.62)/Math.hypot(.12,.69))-Math.atan2(-.12,.69);
    if(m.role==='gear-door'){const opening=smooth(gear>=.2?1:gear/.2);angle=rad(m.isNose?88:100)*opening;}
    if(m.role==='gear-fold'){
      // Un-splay first (about Z), then swing about the fold axis.
      o.quaternion.copy(legRotation(m,fold));return;
    }
    if(m.role==='shock'){o.position.addScaledVector(axis,-m.travel*(state.compression||0));}
    if(m.role==='wheel-carrier'){
      if(m.isNose){o.quaternion.setFromAxisAngle(axis,-rad(30)*(state.steer||0)*(1-fold));return;}
      // Turn the stub axle so that, with the strut folded, it points straight
      // up: the wheel then lies flat on top of the stowed strut.
      const legM=data(o.parent.parent),full=legRotation(legM,1);
      const target=new T.Vector3(0,1,0).applyQuaternion(full.clone().invert());
      const q=new T.Quaternion().setFromUnitVectors(v(m.stub),target);
      o.quaternion.identity().slerp(q,fold);return;
    }
    if(m.role==='wheel')angle=state.wheelSpin||0;
    // probe 0 = stowed, 1 = extended: the door opens first, then the probe swings out
    if(m.role==='probe-door')angle=rad(90)*smooth((state.probe||0)/.3); // opens to a horizontal shelf, clear of the skin below
    if(m.role==='probe')angle=rad(m.extendDeg)*smooth(((state.probe||0)-.2)/.8);
    if(angle!==null)o.quaternion.setFromAxisAngle(axis,angle*dir);
  });
  root.updateMatrixWorld(true);
}

export function paintJ10C(root,mode='white'){
  root.traverse(o=>{
    if(!o.isMesh)return;
    const mat=data(o).material;if(!mat)return;
    if(!o.userData.baseMaterial)o.userData.baseMaterial=o.material;
    if(!o.userData.paintMaterial)o.userData.paintMaterial=o.material.clone();
    const m=o.userData.paintMaterial;o.material=o.userData.baseMaterial;
    if(mode==='bayi'||mode==='service'){
      // Ba Yi aerobatic-team livery / PLAAF service grey on skin and radome (browser only: canvas decals)
      if(mat!=='skin'&&mat!=='radome')return;
      const key=mode==='bayi'?'liveryMaterial':'serviceMaterial';
      if(!o.userData[key])o.userData[key]=createJ10CLiveryMaterial(o.material,restOffsetOf(o,root),liveryPart(o.name),mode);
      o.material=o.userData[key];return;
    }
    if(mode==='zones'){
      const zone=J10C_WORKZONES[data(o).workZone];if(!zone)return;
      if(!o.userData.zoneMaterial){const z=o.userData.baseMaterial.clone();z.name='J10C workzone '+data(o).workZone;
        z.color.copy(color(zone.color));z.roughness=.70;z.metalness=.02;if(mat==='glass'){z.opacity=.65;}o.userData.zoneMaterial=z;}
      o.material=o.userData.zoneMaterial;return;
    }
    if(mode==='base')return;
    if(mat==='skin'||mat==='radome'){
      m.color.copy(color(mode==='white'?0xd5d9dc:0xc5ccd0));m.roughness=.74;m.metalness=.02;
      if(mode==='parts'){
        let p=o.parent;while(p&&p!==root&&!data(p).role)p=p.parent;
        const palette={canopy:0x86bdc5,canard:0xc7a3d6,slat:0xcdb283,elevon:0x8eafc7,rudder:0xb9a2c7,airbrake:0xc19182,'gear-door':0xb9b790,'parachute-door':0x9fc79a};
        if(p&&palette[data(p).role])m.color.copy(color(palette[data(p).role]));
      }
      o.material=m;
    }
  });
}

export async function loadJ10CModel(){
  const url=new URL('../../assets/models/j10c/j10c-white.glb',import.meta.url);
  const root=await loadCachedModel(url.href);
  root.traverse(o=>{if(o.userData.role||o.userData.material||o.userData.workZone)o.userData.exportExtras={...o.userData};});
  return root;
}
