import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {poseJ10C,J10C_GROUND_Y,J10C_DIMENSIONS,J10C_GEAR,ELEVON_END,WING_TIP,TE_CORNER_X} from '../src/visual/J10CModel.js';
const root=await readModelGlb('assets/models/j10c/j10c-white.glb');
const meshes=[],roles={};let triangles=0;
root.traverse(o=>{
  if(o.isMesh){
    meshes.push(o);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;
    for(const [key,attribute]of Object.entries(o.geometry.attributes))assert.ok([...attribute.array].every(Number.isFinite),o.name+' finite '+key);
    assert.ok(o.geometry.attributes.uv,o.name+' has base UVs');
  }
  if(o.userData.role)(roles[o.userData.role]??=[]).push(o);
});
// Performance budget: at most the F-16CM runtime GLB (about 189k triangles).
assert.ok(triangles>60000&&triangles<189000,'triangle budget '+triangles);
for(const [role,count]of Object.entries({canopy:1,canard:2,slat:4,elevon:4,rudder:1,airbrake:2,'gear-door':4,'gear-fold':3,shock:3,'wheel-carrier':3,wheel:4,'nozzle-petal':16,probe:1,'probe-door':1,'parachute-door':2})){
  assert.equal(roles[role]?.length,count,role+' independently named rig nodes survive GLB round-trip');
}
assert.ok(!roles.pylon&&!roles.store,'no stores or pylons');
const size=()=>new T.Box3().setFromObject(root).getSize(new T.Vector3());
const rest={gear:1,nozzle:.7};poseJ10C(root,rest);
const restSize=size();
assert.ok(Math.abs(restSize.z-J10C_DIMENSIONS.length)<.01&&Math.abs(restSize.x-J10C_DIMENSIONS.wingspan)<.01&&Math.abs(restSize.y-J10C_DIMENSIONS.groundHeight)<.01,
  'metre dimensions from the CAD: '+restSize.toArray().map(v=>v.toFixed(3)));
const tires=[];root.traverse(o=>{if(o.isMesh&&/_tire$/.test(o.name))tires.push(o);});
assert.equal(tires.length,4);
const ground=tires.map(o=>new T.Box3().setFromObject(o).min.y);
assert.ok(ground.every(y=>Math.abs(y-J10C_GROUND_Y)<.006),'all four tires touch the ground plane: '+ground.map(y=>y.toFixed(4)));
for(const wheel of roles.wheel){
  const axis=new T.Vector3(1,0,0).transformDirection(wheel.matrixWorld);
  assert.ok(Math.abs(axis.y)<1e-5,wheel.name+' axle horizontal with the gear extended');
}
// Motion directions and fixed hinges.
const farthest=o=>{
  const axis=new T.Vector3(...o.userData.axis).normalize();let best=null,dist=-1;
  o.traverse(c=>{if(!c.isMesh)return;const p=c.geometry.attributes.position;
    for(let i=0;i<p.count;i+=3){const q=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(c.matrix);
      // positions relative to the joint: mesh children sit directly under it
      const d=q.clone().cross(axis).lengthSq();if(d>dist){dist=d;best={mesh:c,index:i};}}});
  return best;
};
const world=b=>new T.Vector3().fromBufferAttribute(b.mesh.geometry.attributes.position,b.index).applyMatrix4(b.mesh.matrixWorld);
const tracked=['canopy','canard','slat','elevon','rudder','airbrake','parachute-door'].flatMap(r=>roles[r].map(o=>({o,b:farthest(o)})));
for(const t of tracked){t.before=world(t.b);t.hinge=t.o.getWorldPosition(new T.Vector3());}
poseJ10C(root,{...rest,canopy:1,canards:1,slats:1,pitch:1,yaw:1,airbrake:1,parachute:1});
for(const t of tracked){
  const p=world(t.b),d=p.clone().sub(t.before),role=t.o.userData.role,side=t.o.userData.side||1;
  assert.ok(d.length()>.03,t.o.name+' moves');
  assert.ok(t.o.getWorldPosition(new T.Vector3()).distanceTo(t.hinge)<1e-7,t.o.name+' keeps its hinge fixed');
  if(role==='canopy')assert.ok(d.y>0,'canopy opens upward');
  if(role==='slat'||role==='elevon')assert.ok(d.y<0,t.o.name+' deflects trailing/leading edge down');
  if(role==='airbrake'||role==='parachute-door')assert.ok(d.x*side>0,t.o.name+' opens outboard');
  if(role==='rudder')assert.ok(d.x>0,'positive yaw moves the rudder trailing edge to starboard');
}
// Roll is antisymmetric on the elevons.
poseJ10C(root,{...rest,roll:1});
const elevonY=Object.fromEntries(roles.elevon.map(o=>{const b=farthest(o);return [o.name,world(b).y];}));
assert.ok(elevonY.elevon_R_outer<elevonY.elevon_L_outer,'roll command deflects the elevons differentially');
// Gear stowed: tires inside the airframe, hidden by real closed doors.
poseJ10C(root,{...rest,gear:0});
const ray=new T.Raycaster(),opaque=h=>!h.object.material.transparent;
// Exact vertex bounds (r128 setFromObject inflates rotated boxes).
const exactBox=o=>{const b=new T.Box3(),p=o.geometry.attributes.position,q=new T.Vector3();for(let i=0;i<p.count;i++)b.expandByPoint(q.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));return b;};
const stored=tires.map(o=>({name:o.name,box:exactBox(o)}));
for(const {name,box}of stored){
  assert.ok(box.min.y>-1.17&&box.max.y<-.55,name+' stowed inside the fuselage depth: '+box.min.y.toFixed(3)+'..'+box.max.y.toFixed(3));
  const c=box.getCenter(new T.Vector3());
  for(const [dx,dz]of [[0,0],[-.08,0],[.08,0],[0,-.1],[0,.1]]){
    ray.set(new T.Vector3(c.x+dx,-5,c.z+dz),new T.Vector3(0,1,0));
    const hit=ray.intersectObject(root,true).filter(opaque)[0];
    assert.ok(hit&&!/tire|hub|strut|axle|piston|well/.test(hit.object.name),name+' hidden by closed skin/doors from below, got '+hit?.object.name);
  }
}
// Every stowed gear part (struts, pistons, axles, wheels) stays behind skin or doors.
const gearPart=/tire|hub|strut|axle|piston|nose_gear|main_gear_(leg|shock|wheel)/;
let gearSamples=0;
for(const leg of roles['gear-fold'])leg.traverse(o=>{
  if(!o.isMesh)return;const p=o.geometry.attributes.position,q=new T.Vector3();
  for(let i=0;i<p.count;i+=5){q.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);gearSamples++;
    ray.set(new T.Vector3(q.x,-5,q.z),new T.Vector3(0,1,0));
    const hit=ray.intersectObject(root,true).filter(opaque)[0];
    assert.ok(hit&&(/door/.test(hit.object.name)||!gearPart.test(hit.object.name)),
      o.name+' vertex visible below the closed airframe at '+q.toArray().map(v=>v.toFixed(3))+' -> '+hit?.object.name);
  }
});
const doorClosed=roles['gear-door'].map(o=>o.quaternion.angleTo(new T.Quaternion())<1e-6);
assert.ok(doorClosed.every(Boolean),'doors return exactly to the flush closed pose');
// Main opening: the skin frame follows the door rectangle exactly (gear down,
// door open): just inside each edge is open, just outside is skin.
poseJ10C(root,rest);
for(const s of [1,-1]){
  const inside=[],outside=[];
  const {x0,x1,z0,z1}=J10C_GEAR.mainBay;
  for(let i=1;i<=9;i++){const z=z0+(z1-z0)*i/10;inside.push([x0+.01,z],[x1-.01,z]);outside.push([x0-.02,z]);}
  for(let i=1;i<=6;i++){const x=x0+(x1-x0)*i/7;inside.push([x,z0+.01],[x,z1-.01]);outside.push([x,z0-.015],[x,z1+.015]);}
  const firstSkin=([x,z])=>{ray.set(new T.Vector3(s*x,-5,z),new T.Vector3(0,1,0));
    return ray.intersectObject(root,true).filter(h=>opaque(h)&&!/tire|hub|strut|axle|piston|main_gear|nose_gear/.test(h.object.name))[0];};
  for(const p of inside){const h=firstSkin(p);assert.ok(h&&(/well/.test(h.object.name)||h.point.y>-.80),'main opening is open at '+p+' -> '+h?.object.name+' y'+h?.point.y.toFixed(3));}
  for(const p of outside){const h=firstSkin(p);assert.ok(h&&!/well/.test(h.object.name)&&h.point.y<-.80,'skin frames the opening at '+p+' -> '+h?.object.name);}
}
// Nose strut: pivot, shock and axle stay on one straight line (no kink).
for(const c of [0,1]){
  poseJ10C(root,{...rest,compression:c});
  const P=roles['gear-fold'].find(o=>o.userData.isNose).getWorldPosition(new T.Vector3());
  const S=roles.shock.find(o=>o.name==='nose_gear_shock').getWorldPosition(new T.Vector3());
  const A=roles['wheel-carrier'].find(o=>o.userData.isNose).getWorldPosition(new T.Vector3());
  const d=A.clone().sub(P).normalize(),off=S.clone().sub(P);
  assert.ok(off.sub(d.multiplyScalar(off.dot(d))).length()<1e-5,'nose strut stays straight at compression '+c);
}
// Elevons meet the fixed wing flush at the hinge; the root fairing is closed below.
poseJ10C(root,rest);
const elevonMeshes=[],fixedMeshes=[];root.traverse(o=>{if(o.isMesh&&/^elevon_/.test(o.name))elevonMeshes.push(o);if(o.isMesh&&/^wing_|^fuselage_mid/.test(o.name))fixedMeshes.push(o);});
for(const s of [1,-1])for(const x of [.95,1.05,1.5,2.5,3.5,4.4]){
  ray.set(new T.Vector3(s*x,2,4.40),new T.Vector3(0,-1,0));const e=ray.intersectObjects(elevonMeshes,false)[0];
  ray.set(new T.Vector3(s*x,2,4.33),new T.Vector3(0,-1,0));const f=ray.intersectObjects(fixedMeshes,false)[0];
  assert.ok(e&&f&&Math.abs(e.point.y-f.point.y)<.03,`elevon flush with the wing at x=${s*x}: ${e?.point.y.toFixed(3)} vs ${f?.point.y.toFixed(3)}`);
}
for(const s of [1,-1])for(const x of [.95,1.0,1.1])for(const z of [3.3,3.8,4.3]){
  ray.set(new T.Vector3(s*x,-5,z),new T.Vector3(0,1,0));const h=ray.intersectObject(root,true).filter(opaque)[0];
  assert.ok(h&&h.point.y<-.7,`wing-root fairing closed below at ${s*x},${z} -> ${h?.object.name} ${h?.point.y.toFixed(3)}`);
}
// Wing tip per the user's marks: the elevon stops at ELEVON_END, the tip
// outboard is fixed and reaches WING_TIP, its trailing corner is cut back to
// TE_CORNER_X, and the leading edge has no step at the flap/tip joint.
poseJ10C(root,rest);
for(const s of [1,-1]){
  const tag=s>0?'R':'L',tipMesh=root.getObjectByName('wing_tip_'+tag),elevon=root.getObjectByName('elevon_'+tag+'_outer');
  const tipXs=[...tipMesh.geometry.attributes.position.array].filter((_,i)=>i%3===0).map(v=>s*v);
  const elevonBox=new T.Box3().setFromObject(elevon);const elevonX=s>0?elevonBox.max.x:-elevonBox.min.x;
  assert.ok(Math.abs(elevonX-ELEVON_END)<.01,`${tag} elevon ends at the red line: ${elevonX.toFixed(3)}`);
  assert.ok(Math.abs(Math.max(...tipXs)-WING_TIP)<.003&&Math.abs(Math.min(...tipXs)-ELEVON_END)<.003,`${tag} fixed tip spans ${ELEVON_END}..${WING_TIP}`);
  const aftAt=x=>{let last=null;for(let z=4.3;z<5.2;z+=.002){ray.set(new T.Vector3(s*x,2,z),new T.Vector3(0,-1,0));if(ray.intersectObject(root,true).filter(opaque).length)last=z;}return last;};
  assert.ok(aftAt(4.80)<aftAt(TE_CORNER_X-.02)-.15,`${tag} trailing corner cut away (blue arc): aft edge ${aftAt(4.80)?.toFixed(3)} at x 4.80`);
  const le=x=>{for(let z=3.4;z<4.4;z+=.002){ray.set(new T.Vector3(s*x,2,z),new T.Vector3(0,-1,0));if(ray.intersectObject(root,true).filter(opaque).length)return z;}return null;};
  const a=le(4.53),b=le(4.575),c=le(4.62);
  assert.ok(Math.abs((b-a)-(c-b))<.012,`${tag} leading edge continuous across the flap/tip joint: ${a?.toFixed(3)} ${b?.toFixed(3)} ${c?.toFixed(3)}`);
}
// Refuelling probe: stowed it is hidden behind its closed bay door; extended
// it reaches the CAD probe tip region ahead of the windscreen.
{
  const probeNode=roles.probe[0],shaft=root.getObjectByName('refueling_probe_shaft');
  poseJ10C(root,{...rest,probe:0});
  const p=shaft.geometry.attributes.position,q=new T.Vector3();
  for(let i=0;i<p.count;i+=7){q.fromBufferAttribute(p,i).applyMatrix4(shaft.matrixWorld);
    ray.set(new T.Vector3(3,q.y,q.z),new T.Vector3(-1,0,0));const hit=ray.intersectObject(root,true).filter(opaque)[0];
    assert.ok(hit&&!/probe_shaft|probe_bay/.test(hit.object.name),'stowed probe hidden by the closed bay door at '+q.toArray().map(v=>v.toFixed(2))+' -> '+hit?.object.name);}
  poseJ10C(root,{...rest,probe:1});
  const b=new T.Box3();for(let i=0;i<p.count;i++)b.expandByPoint(q.fromBufferAttribute(p,i).applyMatrix4(shaft.matrixWorld));
  assert.ok(b.min.z<-6.3&&b.max.x>.95&&b.max.y>.6,'extended probe reaches forward of the windscreen: '+b.min.toArray().map(v=>v.toFixed(2))+' '+b.max.toArray().map(v=>v.toFixed(2)));
  assert.ok(roles['probe-door'][0].quaternion.angleTo(new T.Quaternion())>1,'bay door open with the probe out');
  poseJ10C(root,rest);
}
// Cockpit contents stay inside the closed canopy and fuselage (no clipping).
poseJ10C(root,rest);
const shell=[];root.traverse(o=>{if(o.isMesh&&/canopy_glass|fixed_windscreen|canopy_rear|fuselage_nose|fuselage_mid|refueling_probe_(door_skin|bay)/.test(o.name))shell.push(o);});
let cockpitSamples=0;
root.traverse(o=>{
  if(!o.isMesh||!/^cockpit_/.test(o.name))return;const p=o.geometry.attributes.position,q=new T.Vector3();
  for(let i=0;i<p.count;i++){q.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);cockpitSamples++;
    for(const dir of [[0,1,0],[1,0,0],[-1,0,0]]){
      ray.set(q.clone().addScaledVector(new T.Vector3(...dir),-.001),new T.Vector3(...dir));
      assert.ok(ray.intersectObjects(shell,false).length,`${o.name} vertex ${q.toArray().map(v=>v.toFixed(3))} pokes out of the canopy/fuselage towards ${dir}`);
    }
  }
});
// Down the intake the duct ends at the engine compressor face (no view through
// the empty fuselage to the rear engine parts).
for(const [x,y]of [[.02,-.30],[.25,-.30],[-.25,-.45],[0,-.05],[.15,-.6]]){ // off the lathe axis pinhole
  ray.set(new T.Vector3(x,y,1.2),new T.Vector3(0,0,1));
  const hit=ray.intersectObject(root,true).filter(opaque)[0]?.object.name;
  assert.ok(/engine_compressor_face|intake_duct/.test(hit),`duct at ${x},${y} ends at the compressor face, got ${hit}`);
}
// Looking into the intake shows only duct surfaces, never the nose-wheel well.
for(const [x,y]of [[0,-.85],[-.2,-.8],[.2,-.9],[0,-.7],[.1,-.6]])for(const pitch of [-.06,-.03,0]){
  ray.set(new T.Vector3(x,y,-4.6),new T.Vector3(0,pitch,1).normalize());
  const hit=ray.intersectObject(root,true).filter(opaque)[0];
  assert.ok(hit&&!/well$|tire|hub|strut/.test(hit.object.name),`intake view at ${x},${y},${pitch} sees ${hit?.object.name}`);
}
// Looking up the tail pipe shows the turbine face, never the duct or a void.
for(const [x,y]of [[.08,-.30],[-.3,-.30],[0,-.05],[0,-.62],[.25,-.1]]){
  ray.set(new T.Vector3(x,y,12),new T.Vector3(0,0,-1));
  const hit=ray.intersectObject(root,true).filter(opaque)[0]?.object.name;
  assert.ok(/engine_turbine_face|engine_liner/.test(hit),'engine bore closed by the turbine face, got '+hit);
}
// Looking down the intake duct never shows a stowed nose tyre.
for(const x of [-.15,0,.15]){
  ray.set(new T.Vector3(x,-.80,-4.6),new T.Vector3(0,.02,1).normalize());
  const hit=ray.intersectObject(root,true).filter(opaque)[0];
  assert.ok(hit&&!/tire|hub/.test(hit.object.name),'intake view stays clear of the nose wheels, got '+hit?.object.name);
}
// Full pose cycle restores the airframe; nothing is hidden or scaled.
for(let i=0;i<=100;i++)poseJ10C(root,{...rest,gear:i/100,canopy:1-i/100,canards:Math.sin(i),yaw:Math.cos(i)});
poseJ10C(root,rest);
assert.ok(size().distanceTo(restSize)<1e-6,'pose cycles restore the original airframe');
assert.ok(meshes.every(m=>m.visible&&m.scale.distanceTo(new T.Vector3(1,1,1))<1e-9),'no animated mesh shrinking or hiding');
await mkdir('work/j10c',{recursive:true});
await writeFile('work/j10c/model-validation.json',JSON.stringify({triangles,meshes:meshes.length,dimensions:restSize.toArray(),wheelGround:ground,
  storedTires:stored.map(s=>({name:s.name,min:s.box.min.toArray(),max:s.box.max.toArray()})),roles:Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v.length]))},null,2));
console.log(`PASS: J-10C GLB ${triangles} triangles (< F-16CM budget), CAD dimensions, ${Object.keys(roles).length} rig roles, hinge directions, ground contact, flush stowed gear, turbine face, pose restoration.`);
