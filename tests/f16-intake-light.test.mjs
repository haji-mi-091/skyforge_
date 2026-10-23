import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {smoothCadSkin} from '../src/visual/CadGeometry.js';
import {buildF16Intake,prepareNoseGearBay} from '../src/visual/F16Intake.js';
const nodes=root=>{const out=[];root.traverse(o=>{if(o.isMesh)out.push(o);});return out;};
const raw=await readModelGlb('assets/models/f16/f16_cad.glb'),light=await readModelGlb('assets/models/f16/f16_flight.glb');
const before=nodes(raw).find(o=>/cc52$/.test(o.name)),after=nodes(light).find(o=>/cc52$/.test(o.name));
before.geometry=smoothCadSkin(before.geometry);prepareNoseGearBay(raw,before);
before.material=after.material=new T.MeshStandardMaterial({side:T.DoubleSide});
raw.updateMatrixWorld(true);light.updateMatrixWorld(true);
// Compare the shipped bake with the original CAD, not with another copy of
// the bake: reducing internal geometry must leave the external skin intact.
const ray=new T.Raycaster();let samples=0;
for(const side of [-1,1])for(let iz=0;iz<15;iz++)for(const y of [-1.4,-1.25,-1.1,-.95,-.8]){
 ray.set(new T.Vector3(side*2,y,-2.8+iz*.10),new T.Vector3(-side,0,0));
 const a=ray.intersectObject(before,false)[0],b=ray.intersectObject(after,false)[0];
 assert.equal(!!a,!!b,'bake retains original external skin');
 if(a){assert.ok(Math.abs(a.distance-b.distance)<1e-6,'outer silhouette unchanged');samples++;}
}
const start=performance.now(),intake=buildF16Intake(light,nodes(light)),elapsed=performance.now()-start;
assert.ok(elapsed<100,'ready-to-draw inlet has no multi-second CAD construction');
assert.equal(intake.children.length,2);assert.equal(light.userData.noseBay.children.length,2);
assert.ok(intake.children.every(o=>!o.castShadow));
assert.ok(intake.userData.liner.geometry.index.count/3<1500);
intake.userData.liner.geometry.computeBoundingBox();
assert.ok(intake.userData.liner.geometry.boundingBox.max.z<=.151,'duct terminates ahead of the main gear bay');
for(const mesh of intake.children)assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
console.log(`PASS: ${samples} exterior rays match original CAD; baked inlet builds in ${elapsed.toFixed(2)} ms; two inlet meshes and two well meshes; finite geometry and draw budget.`);
