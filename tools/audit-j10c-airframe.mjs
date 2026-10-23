// Whole-airframe hole / clipping audit for the J-10C white model.
// Renders the closed aircraft (gear up, doors shut, surfaces neutral) from 14
// directions with flat ID colours: exterior skin grey, interior-only structure
// (wells, duct, engine, cockpit) red, background green. Any red pixel outside
// the intake mouth / nozzle, or green inside the silhouette, is a defect.
// Writes work/j10c/audit/*.png and audit.json (red pixel counts per view and
// the meshes responsible).
import {mkdir,writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await mkdir('work/j10c/audit',{recursive:true});
const views={front:[0,0,-1],rear:[0,0,1],left:[-1,0,0],right:[1,0,0],top:[0,1,0],bottom:[0,-1,0],
  'front-left-up':[-1,.7,-1],'front-right-down':[1,-.7,-1],'rear-left-down':[-1,-.7,1],'rear-right-up':[1,.7,1],
  'left-down':[-1,-.8,.2],'right-down':[1,-.8,-.2],'front-down':[.2,-.8,-1],'rear-down':[-.2,-.8,1]};
const poses={closed:{gear:0},'surfaces-deflected':{gear:0,slats:1,pitch:1,roll:.5,yaw:1,canards:1}};
const result={};
await withBrowser(async api=>{
  const tab=await api.open('http://127.0.0.1:4173/tools/j10c-preview.html?hud=0&grid=0&paint=white');
  if(!tab.ready)throw new Error('preview did not load');
  await tab.page.evaluate(`(async()=>{const a=window.__J10C_PREVIEW__,T=await import('/vendor/three.module.js');
    a.scene.background=new T.Color(0x00ff00);
    // runtime effects (plume, muzzle flash) are not airframe; leave them out
    const fx=a.root.getObjectByName('J10C_runtime_effects');if(fx)fx.parent.remove(fx);
    const interior=/_well|well_|probe_bay|intake_duct|engine_|cockpit_/;
    a.root.traverse(o=>{if(!o.isMesh)return;
      o.material=interior.test(o.name)?new T.MeshBasicMaterial({color:0xff0000,side:T.DoubleSide})
        :new T.MeshLambertMaterial({color:/glass|windscreen/.test(o.name)?0x8899aa:0xbfbfbf,side:T.DoubleSide});});
    window.__AUDIT__=(dir)=>{const b=new T.Box3().setFromObject(a.root),c=b.getCenter(new T.Vector3()),d=new T.Vector3(...dir).normalize();
      a.camera.fov=30;a.camera.aspect=innerWidth/innerHeight;a.camera.updateProjectionMatrix();
      a.camera.position.copy(c).addScaledVector(d,38);a.camera.up.set(0,1,0);if(Math.abs(d.y)>.99)a.camera.up.set(0,0,-1);a.camera.lookAt(c);a.render();
      // red pixel census, attributed to meshes by picking
      const gl=a.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
      const r=new T.Raycaster(),hits={};let red=0;
      for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){const i=(y*w+x)*4;if(px[i]>150&&px[i+1]<110&&px[i+2]<110&&px[i]-px[i+1]>70){red++;
        r.setFromCamera(new T.Vector2(x/w*2-1,y/h*2-1),a.camera);const shown=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
        const hit=r.intersectObject(a.root,true).find(h=>!h.object.material.transparent&&shown(h.object));
        if(hit){const k=hit.object.name;(hits[k]??=[]).push(hit.point.toArray().map(v=>+v.toFixed(2)));}}}
      return {red,hits:Object.fromEntries(Object.entries(hits).map(([k,v])=>[k,{count:v.length,samples:v.filter((_,i)=>i%Math.ceil(v.length/6)===0).slice(0,6)}]))};};
  })()`);
  for(const [pose,state]of Object.entries(poses)){
    await tab.page.evaluate(`window.__J10C_PREVIEW__.setState(${JSON.stringify({gear:1,canopy:0,canards:0,slats:0,pitch:0,roll:0,yaw:0,airbrake:0,parachute:0,...state})})`);
    for(const [name,dir]of Object.entries(views)){
      const r=await tab.page.evaluate(`window.__AUDIT__(${JSON.stringify(dir)})`);
      result[pose+'/'+name]=r;
      await writeFile(`work/j10c/audit/${pose}-${name}.png`,await tab.screenshot());
    }
  }
  await tab.close();
},{width:1200,height:800});
await writeFile('work/j10c/audit/audit.json',JSON.stringify(result,null,1));
for(const [k,v]of Object.entries(result))console.log(k.padEnd(32),'red',String(v.red).padStart(5),Object.entries(v.hits).map(([m,h])=>m+':'+h.count).join(' '));
