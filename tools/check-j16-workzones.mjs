import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {withBrowser} from './cdp.mjs';

await withBrowser(async api=>{
  const tab=await api.open('http://127.0.0.1:4173/tools/j16-preview.html?grid=0');
  assert.ok(tab.ready,'work areas load');
  const result=await tab.page.evaluate(`(()=>{
    const a=window.__J16_PREVIEW__,counts={},bad=[],get=o=>o.userData.exportExtras||o.userData;
    a.root.traverse(o=>{if(o.isMesh){const zone=get(o).workZone;counts[zone]=(counts[zone]||0)+1;if(!['nose','mid','tail'].includes(zone))bad.push(o.name);}});
    const groups=['nose','mid','tail'].map(id=>a.root.getObjectByName('workzone_'+id));
    const nose=a.root.getObjectByName('nose_gear_retraction'),main=a.root.getObjectByName('main_L_gear_retraction');
    const assemblyAreas=[get(nose).workZone,get(main).workZone];
    a.setState({gear:0,canopy:1,slats:1,pitch:1});
    const preserved=groups.every(group=>{let ok=true;group.traverse(o=>{if(get(o).workZone!==get(group).workZone)ok=false;});return ok;});
    a.setState({gear:1,canopy:0,slats:0,pitch:0});
    a.setPaint('base');let restored=true;a.root.traverse(o=>{if(o.isMesh&&o.material!==o.userData.baseMaterial)restored=false;});
    a.setPaint('white');const tire=a.root.getObjectByName('nose_wheel_L_tire');
    const tireRestored=!!tire&&tire.material===tire.userData.baseMaterial;
    a.setPaint('zones');
    return {counts,bad,groups:groups.map(o=>o.name),assemblyAreas,preserved,restored,tireRestored,
      legend:!document.getElementById('zones').hidden,paint:document.getElementById('paint').value,
      shaderErrors:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).length};
  })()`);
  assert.deepEqual(result.bad,[]);assert.equal(result.groups.length,3);
  assert.deepEqual(result.assemblyAreas,['nose','mid']);
  assert.ok(result.preserved&&result.restored&&result.tireRestored&&result.legend);
  assert.equal(result.paint,'zones');assert.equal(result.shaderErrors,0);
  for(const view of ['beauty','left','bottom']){
    await tab.page.evaluate(`window.__J16_PREVIEW__.setView('${view}')`);
    await writeFile('work/j16/workzones-'+view+'.png',await tab.screenshot());
  }
  assert.deepEqual(tab.page.problems,[]);
  await writeFile('work/j16/workzones-validation.json',JSON.stringify(result,null,2)+'\n');
  console.log('PASS: three complete work areas, all meshes assigned, moving gear retains its area, normal materials restore, browser legend and shaders.');
  await tab.close();
},{width:1440,height:960});
