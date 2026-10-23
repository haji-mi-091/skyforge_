import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await mkdir('work/j16/skin',{recursive:true});
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?view=beauty&loadout=clean&gear=0&grid=0&hud=0');assert.ok(tab.ready,JSON.stringify(tab.page.problems));
 const checks=await tab.page.evaluate(`(()=>{
  const a=window.__J16_PREVIEW__,checks=[],check=(ok,name)=>checks.push({ok:!!ok,name});a.paused=true;
  check(a.root.userData.paintMode==='weathered'&&document.getElementById('paint').value==='weathered','default preview uses service livery');
  let skin=0,bad=0,triangles=0,glass=0,expected=0;const materials=new Set();a.root.traverse(o=>{if(!o.isMesh)return;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;const type=(o.userData.exportExtras||o.userData).material;if(['skin','radome'].includes(type)){expected++;if(!o.material.userData.j16Skin)bad++;}if(o.material.userData.j16Skin){skin++;materials.add(o.material);for(const name of ['j16BindPosition','j16BindNormal'])if(!o.geometry.attributes[name]||![...o.geometry.attributes[name].array].every(Number.isFinite))bad++;}if(o.material.name==='J16 coated canopy glass')glass++;});
  check(skin>=expected&&expected>0&&bad===0,'all painted shells have finite bind-pose projection attributes');check(materials.size<=4,'paint shares four shader materials');check(glass>=1,'coated canopy preserves separate transparent material');
  check(a.stats.triangles===189911,'appearance does not add aircraft triangles');   // 2026-10-23 tail/canopy rework, drag-chute housing, deck fairing: 187971 -> 189911
  a.render();check(!a.renderer.info.programs.some(p=>p.diagnostics?.runnable===false),'skin shaders compile');
  const part=a.root.getObjectByName('flaperon_skin_L'),attribute=part.geometry.attributes.j16BindPosition,values=Array.from(attribute.array.slice(0,30));a.setState({flaps:1,slats:1,pitch:.5,yaw:.6,canopy:.6});check(values.every((x,i)=>x===attribute.array[i]),'paint coordinates stay attached during animation');
  a.setPaint('white');check(!part.material.userData.j16Skin,'white inspection remains available');a.setPaint('weathered');check(part.material.userData.j16Skin,'service livery can be restored without rebuilding');a.setState({flaps:0,slats:0,pitch:0,yaw:0,canopy:0});return checks;
 })()`);
 await writeFile('work/j16/skin/checks.json',JSON.stringify(checks,null,2));for(const c of checks)assert.ok(c.ok,c.name);
 for(const view of ['beauty','top','bottom','profile','cockpit','intake','engine','tail']){await tab.page.evaluate(`window.__J16_PREVIEW__.setView('${view}')`);await writeFile('work/j16/skin/'+view+'.png',await tab.screenshot());}
 const maps=await tab.page.evaluate(`(async()=>{const {buildJ16SkinMaps}=await import('/src/visual/J16Skin.js');return Object.fromEntries(Object.entries(buildJ16SkinMaps()).filter(([k])=>k!=='reflection').map(([k,t])=>[k,t.image.toDataURL('image/png').split(',')[1]]));})()`);
 await mkdir('assets/textures/j16',{recursive:true});for(const [name,data]of Object.entries(maps))await writeFile('assets/textures/j16/'+name+'.png',Buffer.from(data,'base64'));
 assert.deepEqual(tab.page.problems,[]);console.log('PASS: J-16 service skin defaults, shader compilation, bounded materials, unchanged triangle count, bind-pose animation and inspection mode switching.');await tab.close();
});
