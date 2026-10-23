import * as THREE from '../../vendor/three.module.js';
let atlas = null,
  ready = false,
  promise = null;
export function vfxTexture() {
  if (!atlas) {
    const url = new URL(
      '../../assets/textures/vfx/f16-vfx-atlas.png',
      import.meta.url,
    ).href;
    promise = new Promise((resolve, reject) => {
      atlas = new THREE.TextureLoader().load(
        url,
        () => {
          ready = true;
          resolve(atlas);
        },
        undefined,
        reject,
      );
      atlas.encoding = THREE.sRGBEncoding;
      atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
      atlas.minFilter = THREE.LinearMipmapLinearFilter;
      atlas.anisotropy = 4;
      atlas.userData = { sharedVfx: true };
    });
  }
  return atlas;
}
export function whenVfxReady() {
  vfxTexture();
  return promise;
}
const VERT = `varying vec2 vFxUv;void main(){vFxUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const FRAG = `uniform sampler2D uAtlas;uniform float uFrame;uniform float uRow;uniform float uOpacity;uniform vec2 uCropV;uniform float uCap;varying vec2 vFxUv;
 vec4 sampleFrame(float frame,vec2 uv){vec2 local=vec2(mix(.09,.98,uv.x),mix(uCropV.x,uCropV.y,uv.y));return texture2D(uAtlas,(vec2(mod(frame,4.0),3.0-uRow)+local)*.25);}
 void main(){vec2 uv=vFxUv;float edge=1.0;if(uCap>.5){float r=length(vFxUv-.5)*2.0;edge=1.0-smoothstep(.45,1.0,r);uv=vec2(.08,.5+(r-.4)*.30);}float f=floor(uFrame);vec4 a=sampleFrame(f,uv),b=sampleFrame(mod(f+1.0,4.0),uv);vec4 c=mix(a,b,fract(uFrame));float border=smoothstep(0.0,.10,vFxUv.x)*(1.0-smoothstep(.95,1.0,vFxUv.x))*smoothstep(0.0,.10,vFxUv.y)*(1.0-smoothstep(.90,1.0,vFxUv.y));float rootWidth=mix(uRow<.5?.10:.30,.50,smoothstep(0.0,.22,vFxUv.x));float rootMask=1.0-smoothstep(rootWidth*.60,rootWidth,abs(vFxUv.y-.5));float alpha=c.a*uOpacity*edge*(uCap>.5?1.0:border*rootMask);if(alpha<.003)discard;gl_FragColor=vec4(c.rgb,alpha);#include <tonemapping_fragment>\n#include <encodings_fragment>}`;
function material(row, cap = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: vfxTexture() },
      uFrame: { value: 0 },
      uRow: { value: row },
      uOpacity: { value: 0 },
      uCropV: {
        value: new THREE.Vector2(
          row === 0 ? 0.19 : 0.29,
          row === 0 ? 0.81 : 0.71,
        ),
      },
      uCap: { value: cap ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG.replace(';#include', ';\n#include'),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
/** Fixed textured sheets, never an emitter or a pool of free particles. +Z exhaust. */
export function createVfxPlume(row = 1) {
  const group = new THREE.Group();
  group.name = [
    'M61 attached texture flash',
    'F100 afterburner texture sheets',
    'missile motor texture sheets',
  ][row];
  const mats = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1],
        3,
      ),
    );
    geo.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2),
    );
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    const m = material(row),
      mesh = new THREE.Mesh(geo, m);
    mesh.rotation.z = (i * Math.PI) / 3;
    mesh.frustumCulled = false;
    group.add(mesh);
    mats.push(m);
  }
  const cap = material(row, true),
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.64), cap);
  mesh.position.z = 0.025;
  if (row === 0) mesh.visible = false;
  group.add(mesh);
  mats.push(cap);
  group.userData.vfx = { row, mats, frame: 0 };
  group.visible = false;
  return group;
}
export function updateVfxPlume(
  group,
  { time = 0, intensity = 0, length = 1, diameter = 1, phase = 0 } = {},
) {
  if (!group) return;
  const rig = group.userData.vfx;
  if (!rig) return;
  group.visible = ready && intensity > 0.001;
  group.scale.set(diameter, diameter, length);
  rig.frame = (time * (rig.row === 0 ? 45 : 23) + phase) % 4;
  for (let i = 0; i < rig.mats.length; i++) {
    rig.mats[i].uniforms.uFrame.value = rig.frame;
    rig.mats[i].uniforms.uOpacity.value =
      intensity * (i === 3 ? 0.4 : rig.row === 0 ? 0.75 : 0.33);
  }
  rig.intensity = intensity;
  rig.length = length;
  rig.diameter = diameter;
}
export function disposeVfxPlume(group) {
  if (!group) return;
  group.parent?.remove(group);
  group.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}
