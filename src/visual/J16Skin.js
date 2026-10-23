import * as T from '../../vendor/three.module.js';
import {mulberry32} from '../world/noise.js';
import {wingAt,leadingHingeZ,trailingHingeZ} from './jet/j16Wing.js';
import {SKIN_WEATHER_GLSL,SKIN_ENV_INTENSITY} from './skinFinish.js';

// Authored display livery, following the user's grey J-16 references. All
// projection coordinates are metres in the bind pose, so moving parts carry
// their paint with them and adjoining work zones sample the same surface.
let shared,ready;
const meta=o=>o.userData.exportExtras||o.userData;
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function texture(c,repeat=false){const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;if(repeat)t.wrapS=t.wrapT=T.RepeatWrapping;t.userData={sharedJ16Skin:true};return t;}
function weather(){
 const c=canvas(512,512),ctx=c.getContext('2d'),random=mulberry32(16052);ctx.fillStyle='#ebedec';ctx.fillRect(0,0,512,512);
 for(let i=0;i<180;i++){const x=random()*512,y=random()*512,r=8+random()*80,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(65,62,55,.10)');g.addColorStop(1,'rgba(65,62,55,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
 const image=ctx.getImageData(0,0,512,512);for(let i=0;i<image.data.length;i+=4){const v=(random()-.5)*9;for(let j=0;j<3;j++)image.data[i+j]+=v;}ctx.putImageData(image,0,0);return texture(c,true);
}
function painter(c,project){
 const ctx=c.getContext('2d'),random=mulberry32(16161),scale=c.width/15;
 function line(points,opacity=.27,width=.012,rivets=true){
  ctx.strokeStyle=`rgba(26,34,39,${opacity})`;ctx.lineWidth=Math.max(.8,width*scale);ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...project(...p)):ctx.moveTo(...project(...p)));ctx.stroke();
  if(!rivets)return;ctx.fillStyle='rgba(34,42,45,.32)';
  for(let i=1;i<points.length;i++){const a=project(...points[i-1]),b=project(...points[i]),d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(d/9);for(let j=0;j<n;j++){const t=j/n;ctx.beginPath();ctx.arc(a[0]+(b[0]-a[0])*t+2,a[1]+(b[1]-a[1])*t+2,.65,0,Math.PI*2);ctx.fill();}}
 }
 function box(a,b,w,h){line([[a-w/2,b-h/2],[a+w/2,b-h/2],[a+w/2,b+h/2],[a-w/2,b+h/2],[a-w/2,b-h/2]],.23,.010);}
 function dirt(a,b,w,h,alpha=.13){const p=project(a,b),q=project(a+w,b+h),rw=Math.abs(q[0]-p[0]),rh=Math.abs(q[1]-p[1]);ctx.save();ctx.translate(...p);ctx.scale(rw,rh);const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(42,37,30,${alpha})`);g.addColorStop(1,'rgba(42,37,30,0)');ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();}
 function insignia(a,b,size,angle=0,mirror=false){const p=project(a,b),r=size*scale;ctx.save();ctx.translate(...p);ctx.rotate(angle);if(mirror)ctx.scale(-1,1);ctx.strokeStyle='rgba(195,204,207,.82)';ctx.fillStyle='rgba(195,204,207,.75)';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.42:r;i?ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr):ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.stroke();for(const sign of [-1,1])ctx.strokeRect(sign>0?r*.80:-r*2.1,-r*.20,r*1.30,r*.40);ctx.font=`bold ${r*.32}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.fillText('八一',0,r*.14);ctx.restore();}
 function text(a,b,label,size=.08,colour='rgba(185,195,199,.8)',mirror=false){const p=project(a,b);ctx.save();ctx.translate(...p);if(mirror)ctx.scale(-1,1);ctx.fillStyle=colour;ctx.textAlign='center';ctx.font=`${Math.max(7,size*scale)}px Arial,"Microsoft YaHei",sans-serif`;ctx.fillText(label,0,0);ctx.restore();}
 return {ctx,random,line,box,dirt,insignia,text,scale};
}
function horizontal(bottom=false){
 const c=canvas(1536,2048),p=(x,z)=>[(x+7.5)/15*c.width,(11.1-z)/22.2*c.height],a=painter(c,p),{ctx,line,box,dirt,insignia,text}=a;
 for(const z of [-8.134,-6.9,-5.6,-4.45,-2.48,-.7,1.1,2.8,4.75,6.15,7.55]){const w=z<-7?.46:z<-4?.72:1.42;line([[-w,z],[w,z]],.20,.011);}
 for(const side of [-1,1]){
  line([[side*.65,-7],[side*.78,-4.4],[side*1.34,-2.4],[side*1.42,5.8]],.18);
  for(const x of [2.25,3.6,4.9,6.15]){const w=wingAt(x);line([[side*x,w.le+.22],[side*x,w.te-.20]],.18,.010);}
  const leading=[],trailing=[];for(let x=1.8;x<=7.15;x+=.15)leading.push([side*x,leadingHingeZ(x)]);for(let x=2.8;x<=6.1;x+=.15)trailing.push([side*x,trailingHingeZ(x)]);line(leading,.29,.013);line(trailing,.28,.013);
  for(const x of [2.4,3.4,4.4,5.6]){const w=wingAt(x);text(side*x,w.te-.30,'禁止踩踏',.065,'rgba(35,43,47,.55)');}
  insignia(side*4.85,4.45,.30,side<0?-.32:.32);
  box(side*1.075,5.8,.62,.75);box(side*1.075,4.4,.62,.8);box(side*.9,-3.0,.24,.48);
  for(const z of [1.2,2.7,4.3,6.1]){dirt(side*1.02,z,.30,.65,bottom?.18:.08);line([[side*.73,z],[side*1.38,z+.12]],.16,.010);}
  // Local scuffing around servicing points; sparse rather than uniform noise.
  for(let i=0;i<24;i++){const x=side*(.6+a.random()*.9),z=-2+a.random()*8;dirt(x,z,.045+a.random()*.05,.15+a.random()*.35,.05);}
  line([[side*2.2,6.8],[side*3.65,7.9],[side*4.15,8.8]],.20,.010);
 }
 if(bottom){for(const side of [-1,1]){box(side*2.05,2.8,.36,1.9);dirt(side*1.075,6.8,.46,1.2,.19);}box(0,-5.2,.36,1.2);}
 else{box(0,-.9,.83,2.65);box(0,2.8,.50,.65);text(0,2.8,'检修盖',.065);dirt(1,-2.9,.28,.8,.28);}
 // A few slightly faded replacement panels, alpha retained for shader mixing.
 ctx.fillStyle='rgba(196,202,199,.055)';for(const [x,z,w,h]of [[.55,1.5,.45,1.1],[-.7,4.8,.30,.65],[2.8,3.6,.5,.7]]){const q=p(x,z),r=p(x+w,z+h);ctx.fillRect(q[0],q[1],r[0]-q[0],r[1]-q[1]);}
 return texture(c);
}
function lateral(mirror=false,serial='61249',serialColour='rgba(31,39,45,.90)'){
 const c=canvas(2048,768),p=(z,y)=>[(z+11.1)/22.2*c.width,(3.6-y)/7*c.height],{ctx,line,box,dirt,insignia,text}=painter(c,p);
 for(const z of [-8.134,-6.9,-5.6,-4.45,-2.48,-.7,1.1,2.8,4.75,6.15,7.55])line([[z,-1.55],[z,z<-3?.45:.2]],.19,.010);
 line([[-8.13,-.50],[-5.2,-.64],[-2.5,-.75],[1,-.85],[6,-.95]],.14,.010);
 for(const z of [-6.2,-4.8,-3.35,-1.5,.3,2.3,4.0])box(z,-.22,.50,.35);
 for(const z of [-6.0,-4.65]){const q=p(z,.18);ctx.fillStyle='rgba(224,226,214,.84)';ctx.beginPath();ctx.moveTo(q[0]-7,q[1]-4);ctx.lineTo(q[0]+7,q[1]-4);ctx.lineTo(q[0],q[1]+7);ctx.closePath();ctx.fill();text(z,-.06,'救援',.055,'rgba(222,222,204,.8)',mirror);}
 dirt(-3.0,-.1,.8,.22,.26);dirt(6.6,-1.3,.9,.38,.27);
 for(const z of [-1.4,1.2,4.1])dirt(z,-.55,.10,.42,.13);
 // Tail cap, rudder hinge and a low-visibility demonstration serial.
 line([[5.65,.15],[6.55,1.0],[8.15,2.9]],.20,.012);line([[5.2,.30],[8.35,.30]],.25);
 box(7.43,.94,.15,.26);insignia(7.68,1.85,.20,0,mirror);text(7.36,.62,serial,.28,serialColour,mirror);
 text(-7.0,-.20,'注意',.065,'rgba(181,191,195,.72)',mirror);text(6.35,-.12,'高温 · 勿触摸',.07,'rgba(185,195,196,.65)',mirror);
 return texture(c);
}
function reflection(){const faces=[];for(let i=0;i<6;i++){const c=canvas(128,128),ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,'#b9cbd4');g.addColorStop(.45,'#e1e6e4');g.addColorStop(.52,'#8b979d');g.addColorStop(1,'#515b60');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);faces.push(c);}const t=new T.CubeTexture(faces);t.encoding=T.sRGBEncoding;t.needsUpdate=true;t.userData={sharedJ16Skin:true};return t;}
export function buildJ16SkinMaps(){return {weather:weather(),top:horizontal(),bottom:horizontal(true),left:lateral(),right:lateral(true),reflection:reflection()};}
export function j16SkinMaps(){
 if(shared)return shared;shared={reflection:reflection()};const promises=[],loader=new T.TextureLoader();
 for(const key of ['weather','top','bottom','left','right']){
  let resolve,reject;promises.push(new Promise((a,b)=>{resolve=a;reject=b;}));
  const t=loader.load(new URL('../../assets/textures/j16/'+key+'.png',import.meta.url).href,resolve,undefined,reject);t.encoding=T.sRGBEncoding;t.anisotropy=4;t.userData={sharedJ16Skin:true};if(key==='weather')t.wrapS=t.wrapT=T.RepeatWrapping;shared[key]=t;
 }ready=Promise.all(promises);return shared;
}
export function whenJ16SkinReady(){j16SkinMaps();return ready;}

// Silver camouflage livery ("camo", after the user's J-16 "36001" photo): masks drawn
// in the same top / side projections as the decals. R = light-grey rims (leading-edge
// flaps, wingtips, stabilator and fin leading edges and tips), G = slightly lighter
// irregular camouflage stripes. Rims follow the bind-pose outline of the surfaces, so
// they are measured from the model, not hand-placed. Built once (all J-16 instances
// share one geometry) and only when the livery is first used.
let camoShared=null;
// Per-slice extent of the matching meshes: slices along |x| (axis 'x') or y (axis
// 'y'), each giving the min / max z (leading / trailing edge) of the surface.
function slices(root,pattern,axis,step=.05){
 const bins=new Map(),v=new T.Vector3();
 root.traverse(o=>{if(!o.isMesh||!pattern.test(o.name))return;const a=o.geometry.attributes.j16BindPosition;if(!a)return;
  for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);const k=Math.round((axis==='x'?Math.abs(v.x):v.y)/step),b=bins.get(k)||[Infinity,-Infinity];b[0]=Math.min(b[0],v.z);b[1]=Math.max(b[1],v.z);bins.set(k,b);}});
 return [...bins.entries()].sort((a,b)=>a[0]-b[0]).map(([k,[lo,hi]])=>({s:k*step,lo,hi}));
}
function maskTexture(c){const t=new T.CanvasTexture(c);t.anisotropy=4;t.userData={sharedJ16Skin:true};return t;}
// Filled band between two edges of a slice list; point(s,z) maps to canvas pixels.
function band(ctx,rows,point,lo,hi){if(rows.length<2)return;ctx.beginPath();rows.forEach((r,i)=>{const q=point(r.s,lo(r));i?ctx.lineTo(...q):ctx.moveTo(...q);});[...rows].reverse().forEach(r=>ctx.lineTo(...point(r.s,hi(r))));ctx.closePath();ctx.fill();}
// Irregular camouflage stripes: soft, wandering curves of varying width.
function stripes(ctx,random,count,box,point,scale){
 ctx.save();ctx.filter=`blur(${Math.round(scale*.06)}px)`;ctx.strokeStyle='rgb(0,255,0)';ctx.lineCap='round';ctx.lineJoin='round';
 for(let i=0;i<count;i++){let a=box[0]+random()*(box[1]-box[0]),b=box[2]+random()*(box[3]-box[2]),heading=random()*Math.PI*2;
  ctx.lineWidth=(.22+random()*.42)*scale;ctx.beginPath();ctx.moveTo(...point(a,b));
  for(let j=0;j<4;j++){const len=1.0+random()*1.6,turn=(random()-.5)*1.8,c1=[a+Math.cos(heading)*len*.5,b+Math.sin(heading)*len*.5];heading+=turn;a+=Math.cos(heading)*len;b+=Math.sin(heading)*len;ctx.quadraticCurveTo(...point(...c1),...point(a,b));}
  ctx.stroke();}
 ctx.restore();
}
function camoMaps(root){
 if(camoShared)return camoShared;
 const random=mulberry32(36001);
 // Top / bottom projection, same mapping as horizontal(): x across, z along.
 const top=canvas(1024,1536),tc=top.getContext('2d'),tp=(x,z)=>[(x+7.5)/15*top.width,(11.1-z)/22.2*top.height],ts=top.width/15;
 tc.fillStyle='#000';tc.fillRect(0,0,top.width,top.height);tc.globalCompositeOperation='lighter';
 stripes(tc,random,30,[-7.4,7.4,-10,10],tp,ts);
 tc.filter=`blur(${Math.round(ts*.012)}px)`;tc.fillStyle='rgb(255,0,0)';
 const slats=slices(root,/^slat_skin_/,'x'),stab=slices(root,/^stabilator_skin/,'x'),tips=slices(root,/^(wingtip_rail|wing_tip_trailing)/,'x');
 const stabTip=Math.max(...stab.map(r=>r.s));
 for(const side of [-1,1]){const pt=(s,z)=>tp(side*s,z);
  band(tc,slats,pt,r=>r.lo,r=>r.hi);                                       // leading-edge flaps
  band(tc,tips,pt,r=>r.lo,r=>r.hi);                                        // wingtip rail and tip trailing edge
  band(tc,slats.filter(r=>r.s>6.75),pt,r=>r.lo,r=>r.hi+1.6);               // outer wing panel to the tip
  band(tc,stab,pt,r=>r.lo,r=>Math.min(r.hi,r.lo+.38));                     // stabilator leading edge
  band(tc,stab.filter(r=>r.s>stabTip-.42),pt,r=>r.lo,r=>r.hi);             // stabilator tip
 }
 // Side projection, same mapping as lateral(): z along, y up. Only the fins use it.
 const side=canvas(1536,512),sc=side.getContext('2d'),sp=(z,y)=>[(z+11.1)/22.2*side.width,(3.6-y)/7*side.height],ss=side.width/22.2;
 sc.fillStyle='#000';sc.fillRect(0,0,side.width,side.height);sc.globalCompositeOperation='lighter';
 stripes(sc,random,16,[-10,10,-1.6,3.4],(z,y)=>sp(z,y),ss);
 sc.filter=`blur(${Math.round(ss*.012)}px)`;sc.fillStyle='rgb(255,0,0)';
 const fin=slices(root,/^(fin_fixed|rudder_skin)/,'y').filter(r=>r.s>.25),finTop=Math.max(...fin.map(r=>r.s));
 const yp=(y,z)=>sp(z,y);
 band(sc,fin,yp,r=>r.lo,r=>Math.min(r.hi,r.lo+.32));                       // fin leading edge
 band(sc,fin.filter(r=>r.s>finTop-.5),yp,r=>r.lo,r=>r.hi);                 // fin cap
 const light='rgba(203,210,214,.88)';
 return camoShared={top:maskTexture(top),side:maskTexture(side),left:lateral(false,'36001',light),right:lateral(true,'36001',light)};
}

const linear=hex=>new T.Color(hex).convertSRGBToLinear().toArray().map(x=>x.toFixed(6)).join(',');
// scheme 'service' = weathered PLAAF grey; 'camo' = silver camouflage (camoMaps):
// metallic, smoother "electroplated" finish, lighter stripes and light-grey rims,
// radome light grey, serial 36001. Heat metal and gear are the same in both.
function material(kind,maps,scheme='service',camo=null){
 const plated=scheme==='camo'&&(kind===0||kind===1);
 const m=new T.MeshStandardMaterial({color:0xffffff,map:maps.weather,roughness:kind===2?.48:plated?.44:.77,metalness:kind===2?.76:plated?.22:.035,side:T.DoubleSide,envMap:maps.reflection,envMapIntensity:kind===2?.5:SKIN_ENV_INTENSITY});   // painted skin: shared anti-washout value
 m.name=(scheme==='camo'?'J16 silver-camo ':'J16 service-grey ')+['airframe','radome','heat-metal','gear'][kind];m.extensions={derivatives:true};m.customProgramCacheKey=()=>'j16-'+scheme+'-skin-v3-'+kind;m.userData.j16Skin=true;
 m.onBeforeCompile=shader=>{
  for(const [name,key]of [['j16Top','top'],['j16Bottom','bottom'],['j16Left','left'],['j16Right','right']])shader.uniforms[name]={value:camo&&(key==='left'||key==='right')?camo[key]:maps[key]};
  if(camo){shader.uniforms.j16CamoTop={value:camo.top};shader.uniforms.j16CamoSide={value:camo.side};}
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 j16BindPosition;attribute vec3 j16BindNormal;varying vec3 vJ16P;varying vec3 vJ16N;').replace('#include <begin_vertex>','#include <begin_vertex>\nvJ16P=j16BindPosition;vJ16N=j16BindNormal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vJ16P;varying vec3 vJ16N;uniform sampler2D j16Top;uniform sampler2D j16Bottom;uniform sampler2D j16Left;uniform sampler2D j16Right;\n'+(camo?'uniform sampler2D j16CamoTop;uniform sampler2D j16CamoSide;\n':'')+SKIN_WEATHER_GLSL);
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
 vec3 p=vJ16P,n=normalize(vJ16N),w=pow(abs(n),vec3(6.));w/=max(.001,dot(w,vec3(1.)));float j16Bare=0.;
 vec3 grain=texture2D(map,p.zy*.23).rgb*w.x+texture2D(map,p.xz*.23).rgb*w.y+texture2D(map,p.xy*.23).rgb*w.z;
 vec3 paint=mix(vec3(${linear('#5e6c77')}),vec3(${linear('#858f95')}),smoothstep(.12,.85,-n.y)*.78);
 vec2 uv=vec2((p.x+7.5)/15.,(p.z+11.1)/22.2),sideUv=vec2((p.z+11.1)/22.2,(p.y+3.4)/7.);
 vec4 horizontal=mix(texture2D(j16Bottom,uv),texture2D(j16Top,uv),step(0.,n.y));
 vec4 lateral=mix(texture2D(j16Right,sideUv),texture2D(j16Left,sideUv),step(0.,n.x));
 float sideWeight=w.x/(max(.001,w.x+w.y));vec4 decal=mix(horizontal,lateral,sideWeight);
 float joint=0.;${[-8.134,-2.48,4.75].map(z=>`joint=max(joint,(1.-smoothstep(.003,.013,abs(p.z-(${z}))))*(1.-smoothstep(1.0,1.6,abs(p.x))));`).join('')}
 float soot=exp(-pow((p.z+2.95)/.55,2.)-pow((p.x-1.15)/.30,2.))*.13;
 float servicing=smoothstep(3.,7.8,p.z)*(1.-smoothstep(.8,1.65,abs(p.x)))*smoothstep(-.4,.7,-n.y)*.055;
 ${plated&&kind===0?`
 // Silver body, slightly lighter camouflage stripes, light-grey rims. Side-projected
 // rims belong to the fins only (|x| about 1.5 m, above the fuselage).
 vec4 camoTop=texture2D(j16CamoTop,uv),camoSide=texture2D(j16CamoSide,sideUv);
 float finZone=(1.-smoothstep(.12,.24,abs(abs(p.x)-1.52)))*smoothstep(.15,.35,p.y);
 float stripe=mix(camoTop.g,camoSide.g,sideWeight),rim=max(camoTop.r*(1.-sideWeight),camoSide.r*sideWeight*finZone);
 paint=mix(vec3(${linear('#606a71')}),vec3(${linear('#6f787e')}),stripe*.9);
 paint=mix(paint,vec3(${linear('#959ca0')}),rim);
 paint*=mix(1.,1.05,smoothstep(.12,.85,-n.y));soot*=.5;servicing*=.4;
 // Exposed engine nacelles (aft of mid-fin to the nozzles) are bare polished metal
 // with darker joint bands, as in the reference photo; no paint or decals there.
 float engAxis=length(vec2(abs(p.x)-1.075,p.y+1.14));
 j16Bare=(1.-smoothstep(.72,.78,engAxis))*smoothstep(6.15,6.55,p.z)*(1.-smoothstep(8.12,8.2,p.z));
 float band=1.-.22*(1.-smoothstep(.006,.016,abs(fract(p.z/.42)-.5)*.42));
 paint=mix(paint,vec3(${linear('#50565a')})*band,j16Bare);decal.a*=1.-j16Bare;soot*=1.-j16Bare;`:''}
 ${kind===1?`paint=vec3(${plated?linear('#989fa3'):linear('#7c888c')});decal.a*=.26;soot=0.;servicing=0.;`:''}
 ${kind===3?`paint=vec3(${linear('#c3c8c1')});decal.a=0.;soot=0.;servicing=.025;`:''}
 ${kind===2?`float heat=smoothstep(8.12,9.24,p.z);paint=mix(vec3(${linear('#858780')}),vec3(${linear('#65584d')}),heat);paint=mix(paint,vec3(${linear('#50535f')}),pow(sin(p.z*24.)*.5+.5,5.)*.27);decal.a=0.;soot=heat*.16;servicing=0.;`:''}
 paint=mix(paint,mapTexelToLinear(vec4(decal.rgb,1.)).rgb,decal.a*.75);
 paint*=mix(vec3(${plated?'.91':'.83'}),vec3(1.04),grain);paint*=1.-soot-servicing-joint*.06;
 // shared anti-washout weathering (skinFinish.js) and a slightly darker grey overall;
 // the plated camo keeps it lighter (cleaner, more even metal)
 ${plated?'paint*=mix(1.,skinWeather(p,n,9.2),.55)*.92;':kind===0||kind===1?'paint*=skinWeather(p,n,9.2)*.86;':''}
 diffuseColor.rgb*=paint;
 float j16Height=grain.r*.22-decal.a*.17;
 `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(1.-grain.r)*.35+decal.a*.05,${kind===2?'.34,.70':plated?'.34,.60':'.70,.93'});roughnessFactor=mix(roughnessFactor,.52,j16Bare);`)
  .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.42,j16Bare);')
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 vec3 j16X=dFdx(-vViewPosition),j16Y=dFdy(-vViewPosition),j16R1=cross(j16Y,normal),j16R2=cross(normal,j16X);float j16Det=dot(j16X,j16R1);
 normal=normalize(abs(j16Det)*normal-sign(j16Det)*(dFdx(j16Height)*j16R1+dFdy(j16Height)*j16R2)*.0008);
 `);
 };
 return m;
}
// scheme 'service' (weathered PLAAF grey, the default) or 'camo' (silver camouflage).
export function applyJ16Skin(root,scheme='service'){
 if(!root.userData.j16SkinReady){
  const maps=j16SkinMaps(),materials=[0,1,2,3].map(k=>material(k,maps)),used=new Set();root.updateMatrixWorld(true);const inverse=new T.Matrix4().copy(root.matrixWorld).invert();
  root.traverse(o=>{
   if(!o.isMesh)return;const type=meta(o).material||(/skin|fuselage/.test(o.name)?'skin':null);if(!type)return;
   o.userData.baseMaterial??=o.material;
   let kind=type==='radome'?1:type==='skin'?0:/engine_|nozzle_/.test(o.name)&&['metal','heatMetal'].includes(type)?2:-1;
   if(kind===0&&/strut|collar|brace|nose_t_|axle_knuckle|light_mount/.test(o.name))kind=3;
   if(kind>=0){
    if(used.has(o.geometry))o.geometry=o.geometry.clone();used.add(o.geometry);
    const transform=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld),normalMatrix=new T.Matrix3().getNormalMatrix(transform),source=o.geometry.attributes.position,normals=o.geometry.attributes.normal,positions=new Float32Array(source.count*3),ns=new Float32Array(source.count*3),v=new T.Vector3();
    for(let i=0;i<source.count;i++){v.fromBufferAttribute(source,i).applyMatrix4(transform).toArray(positions,i*3);v.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix).normalize().toArray(ns,i*3);}
    o.geometry.setAttribute('j16BindPosition',new T.BufferAttribute(positions,3));o.geometry.setAttribute('j16BindNormal',new T.BufferAttribute(ns,3));o.userData.weatheredMaterial=materials[kind];o.userData.j16SkinKind=kind;
   }else if(type==='glass'){
    const glass=o.material.clone();glass.name='J16 coated canopy glass';glass.color.set(0x71838b).convertSRGBToLinear();glass.roughness=.10;glass.metalness=.04;glass.opacity=.48;glass.envMap=maps.reflection;glass.envMapIntensity=.65;glass.depthWrite=false;o.userData.weatheredMaterial=glass;
   }
  });root.userData.j16SkinReady=true;
 }
 // Camo materials are made on first use, after the bind attributes exist (the masks
 // are measured from them); glass and unpainted parts stay as for 'service'.
 if(scheme==='camo'&&!root.userData.j16CamoReady){
  const maps=j16SkinMaps(),camo=camoMaps(root),materials=[0,1,2,3].map(k=>material(k,maps,'camo',camo));
  root.traverse(o=>{if(o.isMesh&&o.userData.j16SkinKind!=null)o.userData.camoMaterial=materials[o.userData.j16SkinKind];});root.userData.j16CamoReady=true;
 }
 root.traverse(o=>{if(o.isMesh){o.material=(scheme==='camo'&&o.userData.camoMaterial)||o.userData.weatheredMaterial||o.userData.baseMaterial||o.material;if(o.material.name==='J16 pylon paint')o.material.color.set(0x74818a).convertSRGBToLinear();if(o.material.name==='J16 launcher rail')o.material.color.set(0x68747c).convertSRGBToLinear();}});root.userData.paintMode=scheme==='camo'?'camo':'weathered';
}
