// In-game skin brightness for the F-16CM, J-16 and J-10C. For each aircraft
// and view the real game frame is shot twice (aircraft shown / hidden); the
// difference masks the airframe pixels, which tools/skin-brightness-stats.py
// turns into mean / p95 luminance and the share of near-white pixels.
// usage: node tools/measure-skin-brightness.mjs <outDir>
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {withBrowser} from './cdp.mjs';
const out=process.argv[2]||'work/skin-brightness/before';await mkdir(out,{recursive:true});
const AIRCRAFT=['f16cm-block52','j16','j10c'];
// Camera offsets in the aircraft's heading frame (right, up, back), metres, scaled by length.
const VIEWS={'sun-quarter':[.75,.35,.9],'side':[1.25,.05,0],'top':[.25,1.4,.35],'rear-low':[-.5,-.25,1.1]};
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/?hud=0');
 for(const id of AIRCRAFT){
  await tab.page.send('Page.navigate',{url:`http://127.0.0.1:4173/?autostart=test&aircraft=${id}`});
  let ready=false;for(let i=0;i<240;i++){try{ready=await tab.page.evaluate("window.__SKYFORGE__?.state==='playing'&&!!(window.__SKYFORGE__.playerJet?.airframe||window.__SKYFORGE__.playerJet?.cadRoot||window.__SKYFORGE__.playerJet?.group?.children.length)");}catch{}if(ready)break;await sleep(250);}
  await sleep(2500);
  await tab.page.evaluate(`(async()=>{const g=window.__SKYFORGE__;await g.playerJet.ready;g.pause();
   for(const el of document.querySelectorAll('#pause,#hud,#toasts,.overlay'))el.style.display='none';document.body.classList.remove('modal-open');})()`);
  for(const [view,[r,u,b]]of Object.entries(VIEWS)){
   for(const shown of [true,false]){
    await tab.page.evaluate(`(async()=>{const g=window.__SKYFORGE__,T=await import('/vendor/three.module.js'),j=g.playerJet,c=g.engine.camera;
     j.group.visible=${shown};j.group.updateMatrixWorld(true);
     const L=(g.player.config.visual.length||16),q=j.group.quaternion,p=j.group.position;
     const right=new T.Vector3(1,0,0).applyQuaternion(q),up=new T.Vector3(0,1,0),back=new T.Vector3(0,0,1).applyQuaternion(q);back.y=0;back.normalize();
     c.position.copy(p).addScaledVector(right,${r}*L).addScaledVector(up,${u}*L).addScaledVector(back,${b}*L);c.lookAt(p);c.fov=40;c.updateProjectionMatrix();
     g.world.update(0,c,p);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
    await writeFile(`${out}/${id}-${view}-${shown?'on':'off'}.png`,await tab.screenshot());
   }
  }
 }
 await tab.close();console.log('shots ->',out);
},{width:1280,height:800});
