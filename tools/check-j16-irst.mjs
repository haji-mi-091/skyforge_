import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from './lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
const root=await readModelGlb('assets/models/j16/j16-white.glb');poseJ16(root,{gear:1,canopy:0});
assert.equal(root.getObjectByName('IRST_right_mount'),undefined,'separate oval pedestal is removed');
assert.equal(root.getObjectByName('fixed_windscreen_front_frame'),undefined,'redundant bead at the windshield point is removed');
const housing=root.getObjectByName('IRST_sensor_housing'),lens=root.getObjectByName('IRST_optical_window');
assert.ok(!lens.material.transparent&&Math.max(lens.material.color.r,lens.material.color.g,lens.material.color.b)<.02,'optical dome is black');
const skin=[];root.traverse(o=>{if(o.isMesh&&/^(J16_fixed_fuselage|J16_radome|J16_forebody|J16_double_cockpit)/.test(o.name))skin.push(o);});
const ray=new T.Raycaster(),contacts=[];
for(const z of [-7.48,-7.36,-7.24])for(const x of [.27,.30,.34,.38,.41]){
 ray.set(new T.Vector3(x,3,z),new T.Vector3(0,-1,0));const body=ray.intersectObjects(skin)[0];assert.ok(body);
 ray.set(new T.Vector3(x,-3,z),new T.Vector3(0,1,0));const foot=ray.intersectObject(housing)[0];assert.ok(foot);
 const embed=body.point.y-foot.point.y;contacts.push({x,z,embed});
 assert.ok(embed>.002&&embed<.06,'housing has a small continuous overlap with the real skin: '+JSON.stringify(contacts.at(-1)));
}
const centre=root.getObjectByName('IRST_gimbal').getWorldPosition(new T.Vector3());
const a=8*Math.PI/180,axis=new T.Vector3(0,-Math.sin(a),-Math.cos(a)),up=new T.Vector3(0,Math.cos(a),-Math.sin(a));
for(const dx of [-.055,0,.055])for(const dy of [-.055,0,.055]){
 const origin=centre.clone().addScaledVector(axis,1).addScaledVector(up,dy);origin.x+=dx;
 ray.set(origin,axis.clone().negate());
 assert.equal(ray.intersectObject(root,true)[0]?.object.name,'IRST_optical_window','black aperture is exposed rather than buried in the fuselage');
}
await writeFile('work/j16/irst-validation.json',JSON.stringify({contacts,blackLens:true,exposedAperture:true,removedOvalPedestal:true,removedWindshieldBead:true},null,2)+'\n');
console.log('PASS: 15 housing/skin contact samples; exposed black aperture; oval pedestal and windshield bead absent.');
