import * as T from '../../vendor/three.module.js';
import {SKIN_ENV_INTENSITY,SKIN_WEATHER_GLSL} from './skinFinish.js';

// "August 1st" (Ba Yi) aerobatic-team livery for the J-10C white model,
// after the user's reference (paper model): blue upper surfaces, white lower
// fuselage sides, a red cheat line from nose to tail, white saw-tooth flashes
// at the wing roots, white fin flash and canard leading edges, PLAAF roundels on
// wings and fuselage, "中国空军" on the fuselage. Unseen areas (undersides) are
// designed to match: white wing undersides with blue outer panels, blue belly
// with a white centre flash.
//
// The pattern is computed per fragment in rest-pose model space, so it stays
// fixed to each control surface / door while it moves. Decals are canvas
// textures generated on first use (browser only).
//
// A second scheme (uScheme 1) is the base exterior: PLAAF service grey with
// darker radome, lighter underside and the same roundels. Both schemes are
// weathered (skinFinish.js) and kept off pure white so they do not wash out.

const lin=hex=>{const c=new T.Color(hex).convertSRGBToLinear();return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;};
// Display paint, toned down from the paper-model colours: an off-white that
// stays below clipping in full sun, a deeper blue and a less saturated red.
const BLUE=lin(0x1f4a98),DEEP=lin(0x183b7b),WHITE=lin(0xd0d4d3),RED=lin(0xae1d27);
const GREY=lin(0x7f888e),GREY_UNDER=lin(0x969ea2),RADOME=lin(0x666d71);

let decals=null;
function makeDecals(){
  if(decals)return decals;
  if(typeof document==='undefined')throw new Error('J-10C livery decals need a browser canvas');
  const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
  // PLAAF insignia: red star with gold "八一" and gold-edged red bars (fore-aft).
  const r=canvas(512,256),g=r.getContext('2d');
  g.clearRect(0,0,512,256);
  const bar=(x)=>{g.fillStyle='#f2c230';g.fillRect(x-4,96,188,64);g.fillStyle='#c8202c';g.fillRect(x,102,180,52);};
  bar(18);bar(314);
  const star=(cx,cy,R,rot)=>{g.beginPath();for(let i=0;i<10;i++){const a=rot+i*Math.PI/5,rr=i%2?R*.40:R;g.lineTo(cx+rr*Math.cos(a),cy+rr*Math.sin(a));}g.closePath();};
  star(256,132,118,-Math.PI/2);g.fillStyle='#f2c230';g.fill();
  star(256,132,104,-Math.PI/2);g.fillStyle='#c8202c';g.fill();
  g.fillStyle='#f2c230';g.font='bold 62px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('八一',256,140);
  const roundel=new T.CanvasTexture(r);
  // "中国空军" in red.
  const t=canvas(1024,256),h=t.getContext('2d');
  h.clearRect(0,0,1024,256);h.fillStyle='#c8202c';h.font='bold 190px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  h.textAlign='center';h.textBaseline='middle';h.fillText('中国空军',512,136);
  const text=new T.CanvasTexture(t);
  for(const tex of [roundel,text]){tex.encoding=T.sRGBEncoding;tex.anisotropy=8;tex.needsUpdate=true;}
  decals={roundel,text};return decals;
}

const vertexHead=`varying vec3 vLivP; varying vec3 vLivN; uniform vec3 uRest;`;
const vertexBody=`vLivP=position+uRest; vLivN=normal;`;
const fragmentHead=`
varying vec3 vLivP; varying vec3 vLivN;
uniform sampler2D uRoundel, uText;
float saw(float t){return abs(fract(t)-.5)*2.;}
float band(float d,float a,float b){return step(a,d)*step(d,b);}
float redLineY(float z){                     // cheat line height along the fuselage side
  if(z<-5.6) return mix(-.06,.42,clamp((z+8.)/2.4,0.,1.));
  if(z<-3.0) return .42;
  if(z< .5) return mix(.42,.15,(z+3.)/3.5);
  if(z<4.0) return mix(.15,.05,(z-.5)/3.5);
  return .05;
}
uniform float uPart, uScheme;
${SKIN_WEATHER_GLSL}
// canvas decals are sRGB: decode by hand (only the map slot is decoded by three)
vec4 decal(sampler2D tex,vec2 uv){ if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) return vec4(0.); vec4 t=texture2D(tex,uv); return vec4(pow(t.rgb,vec3(2.2)),t.a); }
// Base exterior: PLAAF service grey, roundels on wings and fin only.
vec3 serviceColor(vec3 P,vec3 N){
  float s=abs(P.x), side=sign(P.x+1e-5), z=P.z, y=P.y; N=normalize(N);
  int part=int(uPart+.5);
  vec3 c=mix(${GREY},${GREY_UNDER},smoothstep(.15,.85,-N.y)*(1.-smoothstep(-.8,-.3,y)));
  if(part==6) c=${RADOME};
  vec4 d=vec4(0.);
  if((part==1||part==5)&&abs(N.y)>.5){vec2 uv=vec2((z-3.0)/1.55+.5,(s-3.15)/.78+.5); if(N.y<0.) uv.y=1.-uv.y; d=decal(uRoundel,uv);}
  if(part==3&&y>.86&&abs(N.x)>.5){vec2 r=vec2((side>0.?6.30-z:z-6.30)/.80+.5,(y-1.62)/.40+.5); d=decal(uRoundel,r);}
  return mix(c,d.rgb,d.a*.85);
}
vec3 liveryColor(vec3 P,vec3 N){
  float s=abs(P.x), side=sign(P.x+1e-5), z=P.z, y=P.y;
  N=normalize(N); float ny=N.y;
  vec3 c=${BLUE};
  // part from the mesh name (see liveryPart): 0 fuselage, 1 wing, 2 canard, 3 fin, 4 ventral, 5 LE flap
  int part=int(uPart+.5);
  bool fin=part==3&&y>.86;
  bool ventral=part==4;
  bool canard=part==2;
  bool flap=part==5;
  bool wing=part==1||flap;
  if(fin){
    float lef=4.1+(y-.95)*1.55, d=z-lef;
    if(band(d,.30,.56)>.5) c=${WHITE};
    if(band(d,.56,.63)>.5) c=${RED};
    if(y>2.84) c=${WHITE};
  } else if(canard){
    float lec=-3.58+(s-.7)*1.245;
    if(z-lec<.24) c=${WHITE};
    if(s>2.18) c=${WHITE};
  } else if(wing){
    if(ny>=0.){
      // white saw-tooth flash at the root, red-edged; white tip band
      float edge=1.10+.55*saw((z+.5)/1.1);
      if(s<edge) c=${WHITE};
      if(abs(s-edge)<.035) c=${RED};
      if(s>4.62) c=${WHITE};
      if(flap&&s<4.62) c=${DEEP};                   // leading-edge flap reads darker
    } else {
      // underside (not visible on the reference): white with blue outer
      // panels behind a red saw-tooth edge, mirroring the upper flash
      float edge=2.75-.30*saw(z/1.2);
      c=${WHITE};
      if(s>edge) c=${BLUE};
      if(abs(s-edge)<.035) c=${RED};
    }
  } else if(ventral){
    c=${BLUE};
    if(y<-1.30) c=${WHITE};
  } else {
    // fuselage, intake, spine, radome: split by height, not by normal, so
    // curved shoulders do not break up into patches
    float ry=redLineY(z);
    if(y>ry+.045) c=${BLUE}; else if(y>ry-.045) c=${RED}; else c=${WHITE};
    if(y>ry&&s<.05&&z<-5.95) c=${WHITE};            // nose top flash
    // blue lightning teeth along the lower white side aft of the wing root
    if(y<ry-.045&&z>.9&&z<5.8&&y>ry-.045-.26*saw((z-.9)/1.22)&&y<ry-.12) c=${BLUE};
    // belly by height too: some door skins carry flipped normals
    if(y<-.85&&z>-3.5){
      c=${BLUE};                                    // belly (designed): blue with white centre flash
      if(s<.07&&z>-3.2&&z<6.2) c=${WHITE};
      if(s>=.07&&s<.10&&z>-3.2&&z<6.2) c=${RED};
    }
  }
  // decals
  vec4 d=vec4(0.);
  if(wing&&abs(ny)>.5){
    vec2 uv=vec2((z-3.0)/1.55+.5,(s-3.15)/.78+.5); if(ny<0.) uv.y=1.-uv.y;
    d=decal(uRoundel,uv);
  }
  if(part==0&&abs(N.x)>.8&&s>.25){                // flat, near-vertical side only
    vec2 r=vec2((side>0.?5.15-z:z-5.15)/.92+.5,(y+.22)/.46+.5);
    vec4 a=decal(uRoundel,r); if(a.a>d.a) d=a;
    vec2 tx=vec2((side>0.?-1.60-z:z+1.60)/1.50+.5,(y+.12)/.34+.5);
    vec4 b=decal(uText,tx); if(b.a>d.a) d=b;
  }
  if(fin&&abs(N.x)>.5){
    vec2 r=vec2((side>0.?6.30-z:z-6.30)/.80+.5,(y-1.62)/.40+.5);
    vec4 a=decal(uRoundel,r); if(a.a>d.a) d=a;
  }
  return mix(c,d.rgb,d.a);
}`;

const liveryKey='j10c-livery-v3';
// Livery region of a skin mesh, from its name.
export function liveryPart(name){
  if(/^radome/.test(name))return 6;
  if(/^leading_edge_flap/.test(name))return 5;
  if(/^(wing_|elevon_)/.test(name))return 1;
  if(/^canard_/.test(name))return 2;
  if(/^(fin|rudder)/.test(name))return 3;
  if(/^ventral_fin/.test(name))return 4;
  return 0;
}
// Returns a livery material for one mesh; restOffset is the mesh origin in
// rest-pose model space (sum of its rig nodes' local offsets). scheme
// 'bayi' = August 1st team, 'service' = PLAAF grey base exterior.
export function createJ10CLiveryMaterial(base,restOffset,part=0,scheme='bayi'){
  const {roundel,text}=makeDecals();
  const service=scheme==='service';
  const m=new T.MeshStandardMaterial({color:0xffffff,roughness:service?.70:.64,metalness:.06,side:T.DoubleSide,envMapIntensity:SKIN_ENV_INTENSITY});
  m.name=service?'J10C PLAAF service grey':'J10C Ba Yi livery';
  const uniforms={uRest:{value:restOffset.clone()},uRoundel:{value:roundel},uText:{value:text},uPart:{value:part},uScheme:{value:service?1:0}};
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+vertexHead)
      .replace('#include <begin_vertex>','#include <begin_vertex>\n'+vertexBody);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+fragmentHead)
      .replace('#include <color_fragment>',`#include <color_fragment>
 diffuseColor.rgb=(uScheme>.5?serviceColor(vLivP,vLivN):liveryColor(vLivP,vLivN))*skinWeather(vLivP,vLivN,7.6);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor+(.55-skinGrime(vLivP))*.18,.5,.9);');
  };
  m.customProgramCacheKey=()=>liveryKey;
  m.userData.liveryUniforms=uniforms;
  return m;
}

// Rest-pose origin of a mesh: the joints' rest offsets are their `local`
// extras (falling back to their current position for static nodes).
export function restOffsetOf(mesh,root){
  const p=new T.Vector3();
  for(let o=mesh.parent;o&&o!==root;o=o.parent){
    const d=o.userData.exportExtras||o.userData;
    if(d&&d.local)p.add(new T.Vector3(...d.local));else p.add(o.position);
  }
  return p;
}
