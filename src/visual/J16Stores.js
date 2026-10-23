import * as T from '../../vendor/three.module.js';
import {J16_STORE_DATA} from '../data/j16Weapons.js';

// Visual authoring proportions in metres; these are not certified weapons data.
// Ten stations follow the user's marked photograph, rather than reproducing
// every station supported by the War Thunder aircraft.
export const J16_STATIONS=[
 {id:'LT',label:'左翼尖',x:-7.26,z:5.12,kind:'tip'},
 {id:'LO',label:'左翼外',x:-5.10,z:3.72,kind:'wing'},
 {id:'LI',label:'左翼内',x:-3.18,z:2.30,kind:'heavy'},
 {id:'LN',label:'左进气道下',x:-1.075,z:.65,kind:'nacelle'},
 {id:'CF',label:'机腹前',x:0,z:-.30,kind:'belly'},
 {id:'CR',label:'机腹后',x:0,z:4.20,kind:'belly'},
 {id:'RN',label:'右进气道下',x:1.075,z:.65,kind:'nacelle'},
 {id:'RI',label:'右翼内',x:3.18,z:2.30,kind:'heavy'},
 {id:'RO',label:'右翼外',x:5.10,z:3.72,kind:'wing'},
 {id:'RT',label:'右翼尖',x:7.26,z:5.12,kind:'tip'},
];
export const J16_WEAPONS={
 PL8B:{label:'PL-8B',length:2.95,r:.08,family:'canard',span:.40},
 PL10:{label:'PL-10',length:3.0,r:.08,family:'short',span:.31},
 PL12A:{label:'PL-12A',length:3.93,r:.101,family:'radar',span:.32},
 PL15:{label:'PL-15',length:4.0,r:.102,family:'long',span:.28},
 LD10:{label:'LD-10',length:3.93,r:.101,family:'radar',span:.32},
 YJ91A:{label:'YJ-91A',length:4.70,r:.18,family:'ramjet',span:.55},
 KD88A:{label:'KD-88A',length:4.70,r:.18,family:'cruise',span:.55},
 LS6500:{label:'LS-6 / 500 kg',length:3.05,r:.21,family:'bomb',span:.34},
 YINGSIII:{label:'YINGS-III',length:2.35,r:.18,family:'pod',span:.22},
};
export const J16_LOADOUTS={
 clean:{label:'净构型',stores:{}},racks:{label:'十个挂点 / 空挂架',stores:{}},
 modern:{label:'现代制空 · PL-10 / PL-15',stores:{LT:'PL10',LO:'PL15',LI:'PL15',LN:'PL15',CF:'PL15',CR:'PL15',RN:'PL15',RI:'PL15',RO:'PL15',RT:'PL10'}},
 wiki:{label:'维基制空 · PL-8B / PL-12A',stores:{LT:'PL8B',LO:'PL12A',LI:'PL12A',LN:'PL12A',CF:'PL12A',CR:'PL12A',RN:'PL12A',RI:'PL12A',RO:'PL12A',RT:'PL8B'}},
 strike:{label:'对地展示 · KD-88A / LS-6',stores:{LT:'PL10',LO:'PL12A',LI:'KD88A',LN:'LS6500',CF:'YINGSIII',CR:'PL12A',RN:'LS6500',RI:'KD88A',RO:'PL12A',RT:'PL10'}},
 sead:{label:'反辐射展示 · YJ-91A / LD-10',stores:{LT:'PL8B',LO:'LD10',LI:'YJ91A',LN:'PL12A',CF:'YINGSIII',CR:'PL12A',RN:'PL12A',RI:'YJ91A',RO:'LD10',RT:'PL8B'}},
};
for(const w of Object.values(J16_STORE_DATA))J16_WEAPONS[w.id]={label:w.name,length:w.length,r:w.radius,family:w.family,span:w.span};
const mat=(color,metalness=.06,roughness=.62)=>new T.MeshStandardMaterial({color,metalness,roughness});
const join=gs=>{const ps=[],ns=[];for(const raw of gs){const g=raw.index?raw.toNonIndexed():raw;ps.push(...g.attributes.position.array);ns.push(...g.attributes.normal.array);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ps,3));g.setAttribute('normal',new T.Float32BufferAttribute(ns,3));return g;};
const box=(x,y,z,p)=>new T.BoxGeometry(x,y,z).translate(...p);
function lathe(points){return new T.LatheGeometry(points.map(([z,r])=>new T.Vector2(r,z)),32).rotateX(Math.PI/2);}
function fin(outline,angle,thickness=.012){
 const p=[],idx=[],e=new T.Vector3(Math.sin(angle),Math.cos(angle),0),t=new T.Vector3(Math.cos(angle),-Math.sin(angle),0);
 for(const sign of [-1,1])for(const [r,z]of outline)p.push(...e.clone().multiplyScalar(r).addScaledVector(t,sign*thickness/2).add(new T.Vector3(0,0,z)).toArray());
 const n=outline.length;
 for(let i=1;i<n-1;i++)idx.push(0,i+1,i,n,n+i,n+i+1);
 for(let i=0;i<n;i++){const j=(i+1)%n;idx.push(i,j,n+j,i,n+j,n+i);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function add(group,name,geometry,material,extras={}){const m=new T.Mesh(geometry,material);m.name=name;m.userData.exportExtras={storePart:true,...extras};group.add(m);return m;}
export function buildJ16Weapon(id,w=J16_WEAPONS[id]){
 if(!w)throw new Error('Unknown J-16 store '+id);
 const root=new T.Group();root.name=id;root.userData.exportExtras={storeId:id,label:w.label,visualDimensions:w};
 if(J16_STORE_DATA[id]?.bundleOf){const cfg=J16_STORE_DATA[id],support=new T.Mesh(new T.BoxGeometry(.62,.05,.65),mat(0x737c80,.4));support.name=id+'_twin_adaptor';support.position.y=cfg.radius+.055;root.add(support);for(const side of [-1,1]){const child=buildJ16Weapon(cfg.bundleOf);child.position.x=side*.23;root.add(child);}return root;}
 const white=mat(0xcbd0cc),finMat=mat(0x939d9b,.2),dark=mat(0x182023,.18,.24),metal=mat(0x727a7b,.7,.35),yellow=mat(0xada15e),brown=mat(0x80745e);
 const {length:L,r,family:f,span}=w,n=-L/2,a=L/2;
 const profile=f==='pod'?[[n,0],[n+.10,r*.65],[n+.30,r],[a-.2,r],[a-.08,r*.8],[a,0]]:
 f==='bomb'?[[n,0],[n+.12,r*.5],[n+.38,r*.94],[n+.55,r],[a-.55,r],[a-.25,r*.62],[a-.02,r*.35],[a,0]]:
 [[n,0],[n+.06,r*.12],[n+L*.055,r*.5],[n+L*.12,r*.85],[n+L*.17,r],[a-.16,r],[a-.07,r*.84],[a,0]];
 add(root,id+'_body',lathe(profile),white,{storeId:id,part:'body'});
 const rings=[];for(const z of [n+L*.22,n+L*.32])rings.push(lathe([[z-.018,r*1.003],[z+.018,r*1.003]]));
 add(root,id+'_identification_bands',join(rings),id==='LD10'?brown:yellow,{storeId:id});
 const fins=[];const set=(outline,rotation=Math.PI/4)=>{for(let i=0;i<4;i++)fins.push(fin(outline,rotation+i*Math.PI/2));};
 if(f==='canard'){
  set([[r*.95,n+.57],[span*.77,n+.73],[span*.77,n+1.03],[r*.95,n+1.16]]);
  set([[r*.95,a-1.05],[span,a-.47],[span,a-.15],[r*.95,a-.07]]);
 }else if(f==='short'){
  set([[r*.95,n+.70],[r+.07,n+.83],[r+.07,a-.65],[r*.95,a-.42]]);
  set([[r*.95,a-.75],[span,a-.25],[span*.92,a-.08],[r*.95,a-.04]]);
 }else if(f==='radar'||f==='long'){
  const mid=f==='long'?.5:.35;
  set([[r*.95,mid-.72],[span,mid+.05],[span*.85,mid+.35],[r*.95,mid+.44]]);
  set([[r*.95,a-.54],[span*.76,a-.21],[span*.76,a-.08],[r*.95,a-.04]]);
 }else if(f==='ramjet'||f==='cruise'){
  set([[r*.95,-.38],[span,.18],[span,.63],[r*.95,.47]]);
  set([[r*.95,a-.68],[span*.66,a-.24],[span*.66,a-.06],[r*.95,a-.06]]);
 }else if(f==='bomb'){
  // Wing kit remains folded alongside the body while carried.
  for(const sign of [-1,1])fins.push(box(.035,.065,1.35,[sign*(r+.026),.035,-.05]));
  set([[r*.6,a-.61],[span,a-.26],[span,a-.02],[r*.6,a-.02]]);
 }
 if(fins.length)add(root,id+'_fins',join(fins),finMat,{storeId:id,part:'fins'});
 const nozzle=lathe([[a-.048,r*.75],[a-.025,r*.75],[a-.025,r*.56],[a-.12,r*.56],[a-.12,0]]);add(root,id+'_recessed_nozzle',nozzle,dark,{storeId:id});
 if(['short','canard','cruise','pod'].includes(f)){
  const g=f==='pod'?new T.SphereGeometry(r*.9,24,12).scale(1,1,.80).translate(0,-.07,n+.13):lathe([[n-.002,0],[n+.04,r*.3],[n+.13,r*.62],[n+.25,r*.81]]);
  add(root,id+'_optical_window',g,dark,{storeId:id});
 }
 if(f==='ramjet'){
  const ducts=[],inlets=[];for(let i=0;i<4;i++){
   const angle=Math.PI/4+i*Math.PI/2;
   ducts.push(lathe([[-1.03,.07],[-.92,.10],[a-.50,.10],[a-.36,0]]).translate(0,r+.07,0).rotateZ(angle));
   inlets.push(new T.CircleGeometry(.071,20).rotateY(Math.PI).translate(0,r+.07,-1.034).rotateZ(angle));
  }
  add(root,id+'_ramjet_ducts',join(ducts),finMat,{storeId:id});add(root,id+'_intake_shadows',join(inlets),dark,{storeId:id});
 }
 if(f==='cruise'){
  add(root,id+'_ventral_intake',box(.19,.11,.66,[0,-r-.045,.52]),finMat,{storeId:id});
  add(root,id+'_intake_shadow',new T.PlaneGeometry(.14,.065).rotateY(Math.PI).translate(0,-r-.06,.184),dark,{storeId:id});
 }
 // Small flush suspension pads; connection is made at the body, not the fins.
 add(root,id+'_suspension',join([box(.075,.055,.15,[0,r+.012,-.25]),box(.075,.055,.15,[0,r+.012,.25])]),metal,{storeId:id,part:'suspension'});
 return root;
}

function supportMeshes(airframe){const out=[];airframe.traverse(o=>{if(o.isMesh&&/^(J16_fixed_fuselage_|wing_fixed_|wing_root_|intake_._outer_cowl)/.test(o.name))out.push(o);});return out;}
export function buildJ16Stores(airframe,preset='modern'){
 const config=typeof preset==='object'?{stores:preset}:J16_LOADOUTS[preset];if(!config)throw new Error('Unknown J-16 loadout '+preset);
 const root=new T.Group();root.name='J16_external_stores';root.userData.exportExtras={loadout:typeof preset==='object'?'custom':preset,stationCount:10};if(preset==='clean')return root;
 const service=['weathered','camo'].includes(airframe.userData.paintMode);   // painted liveries use the grey pylons
 airframe.updateMatrixWorld(true);const surfaces=supportMeshes(airframe),ray=new T.Raycaster(),pylonMat=mat(service?new T.Color(0x74818a).convertSRGBToLinear():0x9ca6ab,.06,.79),railMat=mat(service?new T.Color(0x68747c).convertSRGBToLinear():0x6f7a80,.35,.58);
 pylonMat.name='J16 pylon paint';railMat.name='J16 launcher rail';
 const floor=(x,z)=>{ray.set(new T.Vector3(x,-5,z).applyMatrix4(airframe.matrixWorld),new T.Vector3(0,1,0).transformDirection(airframe.matrixWorld));const hit=ray.intersectObjects(surfaces).map(h=>airframe.worldToLocal(h.point.clone())).find(p=>p.y<0);if(!hit)throw new Error(`No hardpoint support at ${x},${z}`);return hit.y;};
 for(const s of J16_STATIONS){
  const group=new T.Group();group.name='station_'+s.id;group.userData.exportExtras={station:s.id,label:s.label,kind:s.kind};root.add(group);
  const id=config.stores[s.id],w=J16_WEAPONS[id],isTip=s.kind==='tip';
  let y;
  if(isTip){
   y=-1.31;
   add(group,'tip_adaptor_'+s.id,join([box(.065,.235,.15,[s.x,-1.08,s.z-.25]),box(.065,.235,.15,[s.x,-1.08,s.z+.25])]),railMat,{station:s.id,part:'adaptor'});
  }
  else{
   const top=floor(s.x,s.z),drop=s.kind==='heavy'?.51:s.kind==='wing'?.36:.29;
   y=top-drop-(w?.r??.10);
   // A tapered pylon with two individually fitted contact feet.
   const fore=s.z-.49,aft=s.z+.49,fy=floor(s.x,fore),ay=floor(s.x,aft),bottom=y+(w?.r??.10)+.018;
   const outline=[[fy+.008,fore],[ay+.008,aft],[bottom,s.z+.62],[bottom,s.z-.67]];
   const g=fin(outline,0,.105).translate(s.x,0,0);
   add(group,'pylon_'+s.id,g,pylonMat,{station:s.id,part:'pylon'});
   for(const [z,contactY]of [[fore,fy],[aft,ay]])add(group,'contact_'+s.id+'_'+z,box(.15,.018,.11,[s.x,contactY-.001,z]),pylonMat,{station:s.id,part:'contact',support:[s.x,contactY,z]});
   add(group,'launcher_'+s.id,box(.09,.065,1.40,[s.x,bottom-.02,s.z]),railMat,{station:s.id,part:'launcher'});
  }
  group.userData.exportExtras.position=[s.x,y,s.z];
  if(id){const weapon=buildJ16Weapon(id);weapon.position.set(s.x,y,s.z);group.add(weapon);}
 }
 root.traverse(o=>{o.userData.exportExtras={...o.userData.exportExtras,workZone:'mid'};if(o.isMesh)o.userData.baseMaterial=o.material;});return root;
}
export function setJ16Loadout(airframe,preset){
 const old=airframe.getObjectByName('J16_external_stores');if(old){old.parent.remove(old);const materials=new Set();old.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});materials.forEach(m=>m.dispose());}
 const stores=buildJ16Stores(airframe,preset);airframe.add(stores);airframe.updateMatrixWorld(true);return stores;
}


