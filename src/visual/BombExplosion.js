import * as T from '../../vendor/three.module.js';

// Shared flipbooks on a bounded set of attached sheets; no particle emitter.
let maps;
function flipbook(kind){
 const tile=128,canvas=document.createElement('canvas');canvas.width=tile*8;canvas.height=tile*4;
 const ctx=canvas.getContext('2d'),image=ctx.createImageData(tile,tile);
 for(let frame=0;frame<32;frame++){
  const age=frame/31;
  for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
   const px=(x+.5)/tile*2-1,py=(y+.5)/tile*2-1,r=Math.hypot(px,py),a=Math.atan2(py,px);
   const lobes=.10*Math.sin(7*a+age*2)+.06*Math.sin(11*a-age*3),noise=(Math.sin(px*19+age*4+Math.sin(py*12))*Math.sin(py*23-age*3)+1)/2;
   const border=T.MathUtils.smoothstep(1-Math.max(Math.abs(px),Math.abs(py)),0,.14),edge=T.MathUtils.clamp((.84+lobes-r)*5,0,1),density=edge*border*(.45+.55*noise),i=(y*tile+x)*4;
   if(kind==='fire'){
    const hot=T.MathUtils.clamp(1-r*.85-age*.65+noise*.22,0,1);
    image.data[i]=255;image.data[i+1]=25+hot*145;image.data[i+2]=4+Math.pow(hot,4)*70;image.data[i+3]=density*255*(.9-.35*age);
   }else{
    const shade=kind==='dust'?126+noise*55:45+noise*55;
    image.data[i]=shade;image.data[i+1]=kind==='dust'?shade*.83:shade*.96;image.data[i+2]=kind==='dust'?shade*.60:shade*.91;image.data[i+3]=density*225;
   }
  }
  ctx.putImageData(image,(frame%8)*tile,Math.floor(frame/8)*tile);
 }
 const map=new T.CanvasTexture(canvas);map.encoding=T.sRGBEncoding;map.minFilter=T.LinearFilter;map.generateMipmaps=false;return map;
}
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`uniform sampler2D map;uniform float frame;uniform float opacity;uniform vec3 tint;varying vec2 vUv;
 vec4 cell(float f){vec2 p=vec2(mod(f,8.),3.-floor(f/8.));return texture2D(map,(p+clamp(vUv,vec2(.008),vec2(.992)))/vec2(8.,4.));}
 void main(){float f=clamp(frame,0.,31.);vec4 c=mix(cell(floor(f)),cell(min(31.,floor(f)+1.)),fract(f));if(c.a*opacity<.003)discard;gl_FragColor=vec4(pow(c.rgb,vec3(2.2))*tint,c.a*opacity);
 #include <tonemapping_fragment>
 #include <encodings_fragment>
 }`;
function sheet(map,additive=false){return new T.Mesh(new T.PlaneGeometry(1,1),new T.ShaderMaterial({
 uniforms:{map:{value:map},frame:{value:0},opacity:{value:0},tint:{value:new T.Color(1,1,1)}},vertexShader:vertex,fragmentShader:fragment,
 transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,toneMapped:false,blending:additive?T.AdditiveBlending:T.NormalBlending,
}));}
function dispose(group){group.parent?.remove(group);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
export class BombExplosionSystem{
 constructor(scene){this.scene=scene;this.active=[];this.limit=8;}
 spawn(position,{mass=250,tnt,groundHeight=position.y,normal=new T.Vector3(0,1,0),surface='ground',airburst=false}={}){
  maps??={fire:flipbook('fire'),smoke:flipbook('smoke'),dust:flipbook('dust')};
  if(this.active.length>=this.limit)dispose(this.active.shift().group);
  const scale=T.MathUtils.clamp(Math.cbrt(Math.max(1,tnt??mass*.45)/100),.45,2.4),group=new T.Group();group.name='bomb-explosion';group.position.copy(position);this.scene.add(group);
  const flash=sheet(maps.fire,true),fire=sheet(maps.fire,true),fireCross=sheet(maps.fire,true),smoke=sheet(maps.smoke),smokeBack=sheet(maps.smoke),dust=sheet(maps.dust);
  for(const [name,o]of Object.entries({flash,fire,fireCross,smoke,smokeBack,dust})){o.name='bomb-'+name;o.frustumCulled=false;group.add(o);}
  const ring=new T.Mesh(new T.RingGeometry(.91,1,96),new T.MeshBasicMaterial({color:surface==='water'?0xd4e7ec:0xb9aa8d,transparent:true,opacity:0,side:T.DoubleSide,depthWrite:false}));ring.name='bomb-shock-ring';
  const scorch=sheet(maps.smoke);scorch.name='bomb-ground-scorch';scorch.material.uniforms.tint.value.setRGB(.16,.14,.12);
  group.add(ring,scorch);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);scorch.quaternion.copy(ring.quaternion);
  ring.position.y=groundHeight-position.y+.12;scorch.position.y=groundHeight-position.y+.08;
  const effect={group,scale,age:0,flash,fire,fireCross,smoke,smokeBack,dust,ring,scorch,surface,airburst};this.active.push(effect);this._pose(effect,null);return effect;
 }
 _pose(e,camera){
  const t=e.age,s=e.scale,u=o=>o.material.uniforms,alpha=(a,b)=>T.MathUtils.smoothstep(t,a,b),grow=(a,b,k)=>a+(b-a)*(1-Math.exp(-t*k));
  for(const o of [e.flash,e.fire,e.fireCross,e.smoke,e.smokeBack,e.dust])if(camera)o.quaternion.copy(camera.quaternion);else o.quaternion.identity();
  e.fireCross.rotation.y+=Math.PI/3;e.smokeBack.position.set(-4*s,0,-2*s);e.smoke.position.x=2*s;
  const fireFrame=Math.min(31,t/1.3*31),fireOpacity=1-alpha(.5,1.4);
  e.flash.scale.setScalar(grow(8,40,18)*s);u(e.flash).opacity.value=Math.exp(-t*25);u(e.flash).frame.value=0;
  for(const o of [e.fire,e.fireCross]){o.position.y=grow(2,9,1.5)*s;o.scale.setScalar(grow(5,30,5)*s);u(o).opacity.value=fireOpacity*(o===e.fireCross?.22:.65);u(o).frame.value=fireFrame;o.visible=t<1.4&&e.surface!=='water';}
  for(const [i,o]of [e.smoke,e.smokeBack].entries()){const height=grow(12,58,1);o.position.y=Math.max(height*.49,grow(5,16,1)+t*1.7)*s;o.scale.set(grow(12,48,1)*s,height*s,1);u(o).frame.value=Math.min(31,t/9*31+i*2);u(o).opacity.value=alpha(.12,.6)*(1-alpha(4.5,9))*(i?.45:.8);u(o).tint.value.setRGB(e.surface==='water'?2:1,e.surface==='water'?2.1:1,e.surface==='water'?2.2:1);}
  e.dust.position.y=grow(4,18,1.2)*.49*s;e.dust.scale.set(grow(8,100,1.5)*s,grow(4,18,1.2)*s,1);u(e.dust).frame.value=Math.min(31,t/4*31);u(e.dust).opacity.value=alpha(.04,.25)*(1-alpha(1.5,4.5))*.65;u(e.dust).tint.value.setRGB(e.surface==='water'?2:1,e.surface==='water'?2.5:1,e.surface==='water'?3:1);e.dust.visible=!e.airburst;
  e.ring.visible=!e.airburst;e.ring.scale.setScalar((3+Math.min(t,2)*42)*s);e.ring.material.opacity=alpha(.02,.08)*(1-alpha(.2,1.8))*.30;
  e.scorch.visible=!e.airburst&&e.surface!=='water';e.scorch.scale.setScalar(17*s);u(e.scorch).frame.value=12;u(e.scorch).opacity.value=alpha(.15,.7)*(1-alpha(7,10))*.7;
 }
 update(dt,camera){this.active=this.active.filter(e=>{e.age+=dt;if(e.age>=10){dispose(e.group);return false;}this._pose(e,camera);return true;});}
 clear(){for(const e of this.active)dispose(e.group);this.active=[];}
}
