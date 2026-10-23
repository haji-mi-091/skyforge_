import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await mkdir('work/j10c',{recursive:true});
await withBrowser(async api=>{
  const tab=await api.open('http://127.0.0.1:4173/tools/j10c-preview.html?hud=0&grid=1&paint=white');
  assert.ok(tab.ready,'J-10C white model loads in the real browser renderer');
  const checks=[];
  for(const view of ['beauty','front','rear','left','top','bottom','cockpit','gear','nose-below','nozzle']){
    const data=await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__;a.setView('${view}');
      return {draw:a.renderer.info.render,stats:a.stats,badPrograms:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};})()`);
    assert.ok(data.draw.calls>20&&data.draw.triangles>40000&&!data.badPrograms,view+' renders the articulated model');
    checks.push({view,...data});
    await writeFile('work/j10c/white-'+view+'.png',await tab.screenshot());
  }
  const poses=await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__,states=[];a.setView('beauty');
    const set=(name,state)=>{a.setState(state);states.push({name,draws:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles});};
    set('extended',{gear:1});set('half retraction',{gear:.5});set('stowed',{gear:0});
    set('open structures',{gear:1,canopy:1,canards:.7,slats:1,pitch:.7,roll:.4,yaw:.7,airbrake:1,parachute:1,nozzle:1});
    return states;})()`);
  assert.ok(poses.every(s=>s.draws>60&&s.triangles>60000),'all gear and control geometry stays present during motion');
  await writeFile('work/j10c/movable-parts-open.png',await tab.screenshot());
  await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__;a.setState({gear:0,canopy:0,canards:0,slats:0,pitch:0,roll:0,yaw:0,airbrake:0,parachute:0,nozzle:.7});a.setView('bottom');})()`);
  await writeFile('work/j10c/gear-stowed-bottom.png',await tab.screenshot());
  await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__;document.getElementById('reset').click();a.setPaint('parts');a.setState({canopy:1,canards:.7,slats:1,pitch:.7,yaw:.7,airbrake:1,parachute:1});a.setView('beauty');})()`);
  await writeFile('work/j10c/parts.png',await tab.screenshot());
  await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__;document.getElementById('reset').click();a.setPaint('zones');a.setView('beauty');})()`);
  await writeFile('work/j10c/workzones-beauty.png',await tab.screenshot());
  // Ba Yi livery: every skin/radome mesh gets the livery shader, which compiles.
  const livery=await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__;a.setPaint('bayi');a.setView('beauty');a.render();
    let painted=0,skins=0;a.root.traverse(o=>{if(!o.isMesh)return;const m=(o.userData.exportExtras||o.userData).material;
      if(m==='skin'||m==='radome'){skins++;if(o.material.name==='J10C Ba Yi livery')painted++;}});
    return {painted,skins,badPrograms:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};})()`);
  assert.ok(livery.skins>40&&livery.painted===livery.skins&&!livery.badPrograms,'Ba Yi livery covers every skin mesh: '+JSON.stringify(livery));
  await writeFile('work/j10c/livery-bayi-beauty.png',await tab.screenshot());
  for(const view of ['left','top','bottom']){
    await tab.page.evaluate(`window.__J10C_PREVIEW__.setView('${view}')`);
    await writeFile('work/j10c/livery-bayi-'+view+'.png',await tab.screenshot());
  }
  const controls=await tab.page.evaluate(`(()=>{
    const changes=[];
    for(const key of ['canopy','canards','slats','pitch','roll','yaw','airbrake','gear','nozzle','compression','steer','wheelSpin','parachute','probe','afterburner']){
      const input=document.getElementById(key);input.value=key==='gear'?'0':'.65';input.dispatchEvent(new Event('input',{bubbles:true}));
      changes.push({key,value:window.__J10C_PREVIEW__.state[key]});
    }
    document.getElementById('reset').click();return changes;})()`);
  assert.ok(controls.every(c=>c.value===(c.key==='gear'?0:.65)),'visible sliders drive each rig state');
  // Runtime effects: shared afterburner shader (blue while lighting, orange at
  // full afterburner, textured Mach rings), muzzle flash on the checkbox.
  const effects=await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__,out={};
    const fire=document.getElementById('firing');fire.checked=true;fire.dispatchEvent(new Event('change'));
    const fx=a.root.userData.j10cEffects,u=fx.plume.userData.exhaust.uniforms;a.setView('nozzle');
    a.setState({afterburner:.2});a.render();out.lighting={blue:u.uBlueMix.value,firing:a.state.firing};
    a.setState({afterburner:1});a.render();out.full={blue:u.uBlueMix.value,cells:u.uCell.value};
    out.plume=fx.plume.visible;out.noise=!!u.uNoise.value;out.flashMeshes=fx.flash.children.length;return out;})()`);
  assert.ok(effects.plume&&effects.noise&&effects.lighting.firing===1&&effects.flashMeshes>=3,'afterburner plume and muzzle flash are live: '+JSON.stringify(effects));
  assert.ok(effects.lighting.blue>.8&&effects.full.blue<.05&&effects.full.cells>0,'blue while lighting, orange at full afterburner: '+JSON.stringify(effects));
  await writeFile('work/j10c/effects-afterburner.png',await tab.screenshot());
  await tab.page.evaluate(`(()=>{const a=window.__J10C_PREVIEW__;a.setState({afterburner:0,firing:0});})()`);
  const wire=await tab.page.evaluate(`(()=>{
    const a=window.__J10C_PREVIEW__,checkbox=document.getElementById('wire');
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));a.setPaint('parts');
    let ok=true;a.root.traverse(o=>{if(o.isMesh&&!o.material.wireframe)ok=false;});
    checkbox.checked=false;checkbox.dispatchEvent(new Event('change'));return ok;})()`);
  assert.ok(wire,'wireframe remains enabled when changing material mode');
  const cad=await tab.page.evaluate(`(async()=>{const a=window.__J10C_PREVIEW__;a.setPaint('white');await a.setCad(true);a.setView('left');
    let n=0;a.scene.traverse(o=>{if(o.isMesh&&o.material.wireframe&&o.visible&&!a.root.getObjectById(o.id))n++;});return n;})()`);
  assert.ok(cad>300,'CAD reference overlay loads for comparison');
  await writeFile('work/j10c/cad-overlay-left.png',await tab.screenshot());
  const problems=tab.page.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'));
  assert.deepEqual(problems,[],JSON.stringify(problems));
  await writeFile('work/j10c/browser-validation.json',JSON.stringify({checks,poses,controls,cadOverlayMeshes:cad,problems:[]},null,2));
  console.log('PASS: ten J-10C views; GLB shaders; four rig states; white/parts/zones/Ba Yi materials; fifteen slider inputs; shared afterburner shader; CAD overlay; zero browser errors.');
  await tab.close();
},{width:1440,height:960});
