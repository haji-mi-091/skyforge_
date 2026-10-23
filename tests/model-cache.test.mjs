import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.module.js';
import {loadCachedModel} from '../src/visual/modelCache.js';

const original=GLTFLoader.prototype.loadAsync,root=new T.Group(),texture=new T.Texture();
const geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial({map:texture});
root.add(new T.Mesh(geometry,[material,material]),new T.Mesh(geometry,material));
root.userData.rig={pivot:[1,2,3]};
let calls=0,resolve;
GLTFLoader.prototype.loadAsync=()=>{calls++;return new Promise(r=>{resolve=r;});};
try{
 const pending=[loadCachedModel('https://cache.test/model.glb'),loadCachedModel('https://cache.test/model.glb')];
 assert.equal(calls,1,'concurrent requests share one loader/parse');resolve({scene:root});
 const [a,b]=await Promise.all(pending);
 assert.notEqual(a,b);assert.notEqual(a,root);
 assert.equal(a.children[0].geometry,a.children[1].geometry,'deduplicate geometry inside one instance');
 assert.equal(a.children[0].material[0],a.children[1].material,'deduplicate materials inside one instance');
 assert.notEqual(a.children[0].geometry,b.children[0].geometry);
 assert.notEqual(a.children[1].material,b.children[1].material);
 assert.notEqual(a.children[1].material.map,b.children[1].material.map);
 a.children[0].geometry.attributes.position.setX(0,999);a.children[1].material.color.set(0xff0000);a.userData.rig.pivot[0]=999;
 a.children[0].geometry.dispose();a.children[1].material.dispose();a.children[1].material.map.dispose();
 const c=await loadCachedModel('https://cache.test/model.glb');
 assert.equal(calls,1,'later instances reuse parsed template after disposal');
 assert.notEqual(c.children[0].geometry.attributes.position.getX(0),999);
 assert.equal(c.children[1].material.color.getHex(),0xffffff);assert.equal(c.userData.rig.pivot[0],1);
 let attempts=0;
 GLTFLoader.prototype.loadAsync=async()=>{if(++attempts===1)throw new Error('load failed');return{scene:root};};
 await assert.rejects(loadCachedModel('https://cache.test/retry.glb'),/load failed/);
 await loadCachedModel('https://cache.test/retry.glb');assert.equal(attempts,2,'failed load does not poison cache');
 console.log('PASS: coalesced loads, parsed-template reuse, independent geometry/materials/textures/rig metadata, disposal isolation and failed-load retry.');
}finally{GLTFLoader.prototype.loadAsync=original;}
