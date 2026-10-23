import * as THREE from '../../vendor/three.module.js';
import { mulberry32 } from '../world/noise.js';
import { SKIN_ENV_INTENSITY, SKIN_WEATHER_GLSL } from './skinFinish.js';
function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}
function weatherMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d'),
    r = mulberry32(52093);
  ctx.fillStyle = '#e9e9e9';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 280; i++) {
    const x = r() * 1024,
      y = r() * 1024,
      w = 8 + r() * 110,
      h = 5 + r() * 80,
      g = ctx.createRadialGradient(x, y, 0, x, y, w);
    g.addColorStop(0, `rgba(50,48,43,${0.018 + r() * 0.04})`);
    g.addColorStop(1, 'rgba(50,48,43,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    ctx.translate(-x, -y);
    ctx.fillRect(x - w, y - w, w * 2, w * 2);
    ctx.restore();
  }
  const image = ctx.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = (r() - 0.5) * 7;
    image.data[i] += v;
    image.data[i + 1] += v;
    image.data[i + 2] += v;
  }
  ctx.putImageData(image, 0, 0);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function markings(bottom = false, jersey = false) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 3072;
  const ctx = c.getContext('2d');
  const p = (x, z) => [
    ((x + 5.2) / 10.4) * c.width,
    ((7.6 - z) / 15.2) * c.height,
  ];
  const width = (m) => (m / 10.4) * c.width;
  function line(points, alpha = 0.38) {
    ctx.strokeStyle = `rgba(28,35,42,${alpha})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    points.forEach(([x, z], i) => {
      const q = p(x, z);
      i ? ctx.lineTo(...q) : ctx.moveTo(...q);
    });
    ctx.stroke();
  }
  function starBar(x, z) {
    const [cx, cy] = p(x, z),
      R = width(0.21);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(36,43,50,.82)';
    ctx.fillRect(-R * 2.05, -R * 0.34, R * 4.1, R * 0.68);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? R * 0.42 : R;
      const xx = Math.cos(a) * r,
        yy = Math.sin(a) * r;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,166,169,.88)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  if (jersey) {
    starBar(-3.24, 1.85);
    starBar(3.24, 1.85);
  } else starBar(bottom ? 3.24 : -3.24, 1.85);
  for (const side of [-1, 1]) {
    for (const x of [1.75, 2.7, 3.65]) {
      line([
        [side * x, 0.75 * x - 0.86],
        [side * x, 1.6505 + 0.3417 * x],
      ]);
    }
    line(
      [
        [side * 1.42, 0.2],
        [side * 2.15, 0.78],
        [side * 2.15, 2.2],
        [side * 1.42, 1.96],
      ],
      0.3,
    );
    for (const x of [2.3, 3.2, 4.0]) {
      const q = p(side * x, 1.6505 + 0.3417 * x - 0.18);
      ctx.save();
      ctx.translate(...q);
      ctx.rotate(side < 0 ? Math.PI : 0);
      ctx.fillStyle = 'rgba(28,35,42,.60)';
      ctx.font = '9px Arial';
      ctx.fillText('NO STEP', -17, 0);
      ctx.restore();
    }
  }
  if (!bottom) {
    for (const z of [-1.0, 0.7, 2.1, 4.0]) {
      const q = p(0.0, z);
      ctx.strokeStyle = 'rgba(25,32,39,.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        q[0] - width(0.2),
        q[1] - width(0.14),
        width(0.4),
        width(0.28),
      );
    }
    const q = p(0.0, -4.95);
    ctx.fillStyle = 'rgba(42,45,47,.75)';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('CAUTION', q[0], q[1]);
  }
  return texture(c);
}
function tailMap(jersey = false, reverse = false) {
  const c = document.createElement('canvas');
  if (jersey) {
    c.width = c.height = 1536;
    const ctx = c.getContext('2d');
    // CAD-local fin bounds, measured from f16_flight.glb. Both faces share
    // the same rays; only the lettering reverses to read correctly outside.
    const p = (z, y) => [(z - 3.9) / 3.7 * c.width, (2.65 - y) / 2.05 * c.height];
    const polygon = (points, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      points.forEach(([z, y], i) => i ? ctx.lineTo(...p(z, y)) : ctx.moveTo(...p(z, y)));
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = '#f9bd13';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const [z, width] of [[3.65, .36], [4.65, .28], [5.62, .24], [6.57, .29], [7.55, .34], [8.55, .42]])
      polygon([[5.76, .89], [z, 2.75], [z + width, 2.75]], '#092664');
    polygon([[3.9, .6], [7.6, .6], [7.6, .98], [3.9, .98]], '#082353');
    polygon([[3.9, 2.36], [7.6, 2.36], [7.6, 2.65], [3.9, 2.65]], '#082353');
    function text(label, z, y, size, maxWidth, color = '#fff7dc', italic = false) {
      ctx.save();
      ctx.translate(...p(z, y));
      if (reverse) ctx.scale(-1, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${italic ? 'italic ' : ''}bold ${size / 2.05 * c.height}px Arial`;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#061b40';
      ctx.lineWidth = size / 2.05 * c.height * .10;
      ctx.strokeText(label, 0, 0, maxWidth / 3.7 * c.width);
      ctx.fillStyle = color;
      ctx.fillText(label, 0, 0, maxWidth / 3.7 * c.width);
      ctx.restore();
    }
    text('New Jersey', 6.57, 2.46, .12, 1.35, '#ffce26');
    text('AC', 6.25, 1.99, .43, .89);
    text('119FS', 5.99, 1.54, .29, 1.23);
    text('AF 86 309', 5.51, 1.17, .17, 1.18);
    text('“Jersey Jerk”', 5.50, .82, .19, 1.95, '#ffce26', true);
    return texture(c);
  }
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#313a43';
  ctx.textAlign = 'center';
  ctx.font = 'bold 170px Arial';
  ctx.fillText('MO', 256, 185);
  ctx.font = 'bold 54px Arial';
  ctx.fillText('AF 93', 256, 265);
  ctx.font = 'bold 100px Arial';
  ctx.fillText('0541', 256, 370);
  return texture(c);
}
const linear = (hex) =>
  new THREE.Color(hex)
    .convertSRGBToLinear()
    .toArray()
    .map((x) => x.toFixed(5))
    .join(',');
export function createF16SkinMaterial(paint = 'service') {
  const jersey = paint === 'jersey-jerk';
  const map = weatherMap(),
    top = markings(false, jersey),
    bottom = markings(true, jersey),
    tail = tailMap(jersey),
    tailRight = jersey ? tailMap(true, true) : tail;
  const material = new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: jersey ? 0.42 : 0.78,
    metalness: 0.1,
    side: THREE.DoubleSide,
    // Less diffuse sky fill so the shadow side keeps its contrast (skinFinish.js).
    envMapIntensity: SKIN_ENV_INTENSITY,
  });
  material.customProgramCacheKey = () => jersey ? 'f16-jersey-jerk-v4' : 'f16-authored-skin-v4';
  material.userData.f16Maps = [...new Set([top, bottom, tail, tailRight])];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.f16Top = { value: top };
    shader.uniforms.f16Bottom = { value: bottom };
    shader.uniforms.f16Tail = { value: tail };
    shader.uniforms.f16TailRight = { value: tailRight };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vF16P;varying vec3 vF16N;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvF16P=position;vF16N=normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
 varying vec3 vF16P; varying vec3 vF16N; uniform sampler2D f16Top; uniform sampler2D f16Bottom;uniform sampler2D f16Tail;uniform sampler2D f16TailRight;
 float f16Line(float d){return 1.0-smoothstep(0.0018,0.0055,abs(d));}
 float f16Box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,q.y),0.0);}
 ${SKIN_WEATHER_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `
 vec3 p=vF16P;vec3 n=normalize(vF16N);
 ${jersey ? 'p.x=abs(p.x-.0075);n.x=abs(n.x);' : ''}
 vec3 weights=pow(abs(n),vec3(4.0));weights/=max(dot(weights,vec3(1.0)),0.001);
 vec3 grain=mapTexelToLinear(texture2D(map,p.zy*.29)).rgb*weights.x+mapTexelToLinear(texture2D(map,p.xz*.29)).rgb*weights.y+mapTexelToLinear(texture2D(map,p.xy*.29)).rgb*weights.z;
 float dorsal=smoothstep(-.60,-.05,p.y)*(1.0-smoothstep(1.0,1.5,abs(p.x)))*smoothstep(-3.0,-1.4,p.z);
 vec3 paint=mix(vec3(${linear('#7c858f')}),vec3(${linear('#444f5a')}),dorsal);
 paint=mix(paint,vec3(${linear('#91979c')}),smoothstep(.1,.9,-n.y)*.45);
 float radome=1.0-smoothstep(-5.75,-5.72,p.z);paint=mix(paint,vec3(${linear('#697073')}),radome);
 ${jersey ? `
 float panel=sfNoise(floor(vec3(p.x*1.1,p.y,p.z*.8)));
 paint=vec3(${linear('#737d87')})*mix(.99,1.01,panel);
 paint=mix(paint,vec3(${linear('#646c74')}),radome);
 float blueSpine=smoothstep(2.25,2.75,p.z)*(1.0-smoothstep(.34,.55,p.x))*smoothstep(-.12,.18,p.y);
 paint=mix(paint,vec3(${linear('#092664')}),blueSpine);
 ` : ''}
 float fuselage=1.0-smoothstep(1.0,1.45,abs(p.x));float seams=0.0;
 ${[-6.68, -5.73, -4.72, -3.08, -1.35, 0.65, 2.75, 4.55, 5.85].map((z) => `seams=max(seams,f16Line(p.z-(${z.toFixed(3)})));`).join('\n')}
 seams*=fuselage*.40;
 float access=max(f16Line(f16Box(vec2(abs(p.x)-.52,p.z+4.05),vec2(.13,.23))),f16Line(f16Box(vec2(abs(p.x)-.66,p.z-3.78),vec2(.13,.34))));
 paint*=1.0-max(seams,access*.28);
 float streak=(.5+.5*sin(p.x*39.0))*smoothstep(4.7,6.8,p.z)*(1.0-smoothstep(.55,1.15,abs(p.x)))*.07;
 paint*=1.0-streak;
 vec2 atlas=vec2((${jersey ? 'vF16P.x-.0075' : 'p.x'}+5.2)/10.4,(p.z+7.6)/15.2);
 vec4 decTop=texture2D(f16Top,atlas),decBottom=texture2D(f16Bottom,atlas);vec4 decals=mix(decBottom,decTop,step(0.0,n.y));
 float decalFace=smoothstep(.60,.9,abs(n.y));paint=mix(paint,mapTexelToLinear(vec4(decals.rgb,1.0)).rgb,decals.a*decalFace);
 ${jersey ? `
 vec2 tailUV=vec2((p.z-3.9)/3.7,(p.y-.6)/2.05);
 vec4 tailDecal=mix(texture2D(f16Tail,tailUV),texture2D(f16TailRight,tailUV),step(0.0,vF16N.x));
 float tailMask=step(.64,p.y)*(1.0-smoothstep(.13,.22,p.x))*step(3.9,p.z);
 paint=mix(paint,mapTexelToLinear(vec4(tailDecal.rgb,1.0)).rgb,tailMask);
 ` : `
 vec2 tailUV=vec2((p.z-5.14)/.80,(p.y-1.23)/.80);if(n.x>0.0)tailUV.x=1.0-tailUV.x;
 vec4 tailDecal=texture2D(f16Tail,tailUV);
 float tailMask=step(0.0,tailUV.x)*step(tailUV.x,1.0)*step(0.0,tailUV.y)*step(tailUV.y,1.0)*step(.80,p.y)*(1.0-step(.20,abs(p.x)));
 paint=mix(paint,mapTexelToLinear(vec4(tailDecal.rgb,1.0)).rgb,tailDecal.a*tailMask);
 `}
 // shared anti-washout weathering and a slightly darker grey overall
 paint*=${jersey ? 'mix(.96,1.0,skinWeather(p,n,6.6))' : 'skinWeather(p,n,6.6)*.90'};
 diffuseColor.rgb*=paint*grain;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        jersey ? `#include <roughnessmap_fragment>
 float painted=max(blueSpine,tailMask);
 roughnessFactor=mix(clamp(.40+panel*.035+skinGrime(p)*.025,.40,.46),.42,painted);
 ` : '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(grain.r-.75)*.10,.62,.88);',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        jersey ? '#include <metalnessmap_fragment>\nmetalnessFactor=mix(.10,.08,painted);metalnessFactor=mix(metalnessFactor,.05,radome);' : '#include <metalnessmap_fragment>',
      );
  };
  return material;
}
