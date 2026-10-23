import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ16} from '../src/visual/J16Model.js';
const root=await readModelGlb('assets/models/j16/j16-white.glb');
const meshes=[],roles={};let triangles=0;
root.traverse(o=>{
  if(o.isMesh){
    meshes.push(o);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
    for(const [key,attribute]of Object.entries(o.geometry.attributes)){
      assert.ok([...attribute.array].every(Number.isFinite),o.name+' finite '+key);
    }
    assert.ok(o.geometry.attributes.uv,o.name+' has base UVs');
  }
  if(o.userData.role)(roles[o.userData.role]??=[]).push(o);
});
assert.ok(triangles>90000&&triangles<190000,'white model stays within the existing F-16 source mesh budget');
for(const [role,count]of Object.entries({canopy:1,slat:2,flaperon:2,stabilator:2,rudder:2,airbrake:1,'gear-door':6,'gear-fold':3,'shock':3,'wheel-carrier':3,wheel:4,'nozzle-petal':32,'intake-ramp':2,probe:1,'probe-door':1,'parachute-door':2})){
  assert.equal(roles[role]?.length,count,role+' independently named rig nodes survive GLB round-trip');
}
const dimensions=()=>new T.Box3().setFromObject(root).getSize(new T.Vector3());
const rest={gear:1,nozzle:.7};poseJ16(root,rest);
const size=dimensions();
assert.ok(Math.abs(size.x-14.7)<.002&&Math.abs(size.z-21.95)<.002&&Math.abs(size.y-6.36)<.01,'metre-based J-16 target dimensions');
const ground=roles.wheel.map(o=>new T.Box3().setFromObject(o).min.y);
assert.ok(Math.max(...ground)-Math.min(...ground)<.006,'all four tires share the ground plane');
for(const wheel of roles.wheel){
  const axis=new T.Vector3(1,0,0).transformDirection(wheel.matrixWorld);
  assert.ok(Math.abs(axis.y)<1e-5,'wheel axles remain horizontal with extended splayed legs');
}
const before=new Map();
for(const role of ['canopy','slat','flaperon','stabilator','rudder','airbrake'])for(const o of roles[role]){
  const mesh=o.children.find(c=>c.isMesh&&/_skin/.test(c.name))||o.children.find(c=>c.isMesh),p=mesh.geometry.attributes.position;
  // Sample a point farthest from the hinge to observe the direction of motion.
  let index=0,max=-1;
  const axis=new T.Vector3(...o.userData.axis).normalize();
  for(let i=0;i<p.count;i++){const d=new T.Vector3().fromBufferAttribute(p,i).cross(axis).lengthSq();if(d>max){max=d;index=i;}}
  before.set(o,{mesh,index,point:new T.Vector3().fromBufferAttribute(p,index).applyMatrix4(mesh.matrixWorld),hinge:o.getWorldPosition(new T.Vector3())});
}
poseJ16(root,{...rest,canopy:1,slats:1,flaps:1,pitch:1,yaw:1,airbrake:1});
for(const [o,b]of before){
  const p=new T.Vector3().fromBufferAttribute(b.mesh.geometry.attributes.position,b.index).applyMatrix4(b.mesh.matrixWorld);
  assert.ok(p.distanceTo(b.point)>.03,o.name+' moves');
  assert.ok(o.getWorldPosition(new T.Vector3()).distanceTo(b.hinge)<1e-7,o.name+' keeps its hinge fixed');
  if(['canopy','airbrake'].includes(o.userData.role))assert.ok(p.y>b.point.y,o.name+' opens upward');
  if(['slat','flaperon'].includes(o.userData.role))assert.ok(p.y<b.point.y,o.name+' deflects downward');
}
poseJ16(root,{...rest,gear:0});
const stored=roles.wheel.map(o=>({name:o.name,box:new T.Box3().setFromObject(o)}));
for(const {name,box}of stored){
  const bayName=name.startsWith('nose')?'nose_bay_roof':name.includes('_L_')?'main_bay_-1_roof':'main_bay_1_roof';
  const well=new T.Box3().setFromObject(root.getObjectByName(bayName)),ceiling=well.min.y-.015;
  assert.ok(box.min.y>-1.34&&box.max.y<ceiling,name+' stored vertically inside the fuselage below its bay roof');
  assert.ok(box.min.z>well.min.z&&box.max.z<well.max.z&&box.min.x>well.min.x&&box.max.x<well.max.x,name+' stays within its own wheel bay');
}
const ray=new T.Raycaster();
for(const [side,tag]of [[-1,'L'],[1,'R']]){
  ray.set(new T.Vector3(side*1.075,-1.14,13),new T.Vector3(0,0,-1));
  const hit=ray.intersectObject(root,true)[0];
  assert.equal(hit.object.name,'engine_'+tag+'_turbine_face','no white body skin crosses the engine bore');
}
for(const {name,box}of stored){
  for(const dx of [-.15,0,.15]){
    const center=box.getCenter(new T.Vector3());ray.set(new T.Vector3(center.x+dx,-5,center.z),new T.Vector3(0,1,0));
    const hits=ray.intersectObject(root,true).filter(h=>!h.object.material.transparent);
    assert.ok(hits.length&&!/tire|hub/.test(hits[0].object.name),name+' hidden by real closed bay geometry, not a visibility flag');
  }
}
// The model uses the actual attached tires throughout, never visibility or scale
// tricks. Its geometry and bounds return exactly after a complete pose cycle.
for(let i=0;i<=100;i++)poseJ16(root,{...rest,gear:i/100,canopy:1-i/100});
poseJ16(root,rest);const restored=dimensions();
assert.ok(restored.distanceTo(size)<1e-6,'pose cycles restore the original airframe');
assert.ok(meshes.every(m=>m.visible&&m.scale.distanceTo(new T.Vector3(1,1,1))<1e-9),'no animated mesh shrinking or hiding');
const audit={triangles,meshes:meshes.length,dimensions:size.toArray(),wheelGround:ground,
  storedWheels:stored.map(s=>({name:s.name,min:s.box.min.toArray(),max:s.box.max.toArray()})),roles:Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v.length]))};
await writeFile('work/j16/model-validation.json',JSON.stringify(audit,null,2));
console.log('PASS: J-16 GLB data, face budget, metre dimensions, named independent rig parts, hinge directions, four ground contacts, stowed tire bays, pose restoration and no hiding/scaling.');
