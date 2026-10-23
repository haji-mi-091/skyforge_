import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';
await mkdir('work/j16',{recursive:true});
await withBrowser(async api=>{
  const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?hud=0&grid=0&paint=white');
  assert.ok(tab.ready,'J-16 white model loads in the real browser renderer');
  const checks=[];
  for(const view of ['beauty','top','left','front','rear','bottom','cockpit','gear']){
    const data=await tab.page.evaluate(`(()=>{
      const a=window.__J16_PREVIEW__;a.setView('${view}');
      return {draw:a.renderer.info.render,stats:a.stats,badPrograms:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
    })()`);
    assert.ok(data.draw.calls>20&&data.draw.triangles>90000&&!data.badPrograms,view+' renders the full articulated model');
    checks.push({view,...data});
    await writeFile('work/j16/white-'+view+'.png',await tab.screenshot());
  }
  const poses=await tab.page.evaluate(`(()=>{
    const a=window.__J16_PREVIEW__,states=[];
    const set=(name,state)=>{a.setState(state);states.push({name,draws:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles});};
    set('extended',{gear:1});set('half retraction',{gear:.5});set('stored',{gear:0});
    set('open structures',{canopy:1,slats:1,flaps:1,pitch:.8,yaw:.7,airbrake:1,probe:1,ramps:1,parachute:1});
    return states;
  })()`);
  assert.ok(poses.every(s=>s.draws>100&&s.triangles>90000),'all tire/control geometry remains present during motion');
  await tab.page.evaluate("window.__J16_PREVIEW__.setView('beauty')");
  await writeFile('work/j16/movable-parts-open.png',await tab.screenshot());
  await tab.page.evaluate(`(()=>{
    const a=window.__J16_PREVIEW__;document.getElementById('reset').click();
    a.setPaint('parts');a.setView('beauty');
  })()`);
  await writeFile('work/j16/parts.png',await tab.screenshot());
  await tab.page.evaluate("window.__J16_PREVIEW__.setPaint('base')");
  await writeFile('work/j16/base-skin.png',await tab.screenshot());
  const controls=await tab.page.evaluate(`(()=>{
    const changes=[];
    for(const key of ['canopy','slats','flaps','gear','ramps','compression','steer','wheelSpin','parachute']){
      const input=document.getElementById(key);input.value=key==='gear'?'0':'.65';input.dispatchEvent(new Event('input',{bubbles:true}));
      changes.push({key,value:window.__J16_PREVIEW__.state[key]});
    }
    document.getElementById('reset').click();return changes;
  })()`);
  assert.ok(controls.every(c=>c.value===(c.key==='gear'?0:.65)),'visible sliders drive each rig state');
  const wire=await tab.page.evaluate(`(()=>{
    const a=window.__J16_PREVIEW__,checkbox=document.getElementById('wire');
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change'));a.setPaint('parts');
    let ok=true;a.root.traverse(o=>{if(o.isMesh&&!o.material.wireframe)ok=false;});
    checkbox.checked=false;checkbox.dispatchEvent(new Event('change'));return ok;
  })()`);
  assert.ok(wire,'wireframe remains enabled when changing material mode');
  const problems=tab.page.events.filter(e=>e.method==='Runtime.exceptionThrown'||(e.method==='Runtime.consoleAPICalled'&&e.params.type==='error'));
  assert.deepEqual(problems,[],JSON.stringify(problems));
  await writeFile('work/j16/browser-validation.json',JSON.stringify({checks,poses,controls,problems:[]},null,2));
  console.log('PASS: eight J-16 views; GLB shaders; four visible rig states; base/white/part materials; nine actual slider inputs; zero browser errors.');
  await tab.close();
},{width:1440,height:960});
