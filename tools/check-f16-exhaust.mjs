import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { withBrowser } from './cdp.mjs';

await mkdir('work/exhaust',{recursive:true});
await withBrowser(async api => {
  const tab = await api.open('http://127.0.0.1:4173/tools/airframe-preview.html?loadout=clean&view=nozzle&throttle=1.1&hud=0');
  assert.ok(tab.ready,JSON.stringify(tab.page.problems));
  const result = await tab.page.evaluate(`(async()=>{
    const a=window.__AIRFRAME_PREVIEW__,T=await import('/vendor/three.module.js');
    a.paused=true;a.jet.time=2;a.setState({ab:1},2);
    const plume=a.jet.cadAfterburner.plume,n=a.jet.cadAfterburner.nozzle.userData.nozzle;
    const e=plume.userData.exhaust,checks=[];
    const check=(ok,name,data)=>checks.push({name,ok:!!ok,data});
    check(e.uniforms.uStart.value<-1&&e.uniforms.uExit.value===n.exitZ,
      'combustion begins over one metre inside the nozzle, follows its moving exit',
      {start:e.uniforms.uStart.value,exit:e.uniforms.uExit.value});
    check(plume.position.distanceTo(a.jet.cadAfterburner.nozzle.position)<1e-8,
      'volume and nozzle share the same engine coordinate frame');
    check(e.length>n.exitRadius*2*4&&e.length<n.exitRadius*2*6,
      'full AB plume has a bounded scale relative to the actual exit diameter',
      {diameter:n.exitRadius*2,length:e.length,cellSpacing:e.cellSpacing});
    check(plume.children.length===1&&e.mesh.isMesh&&!e.mesh.isPoints,
      'one bounded volume draw, zero particle objects');
    const target=new T.WebGLRenderTarget(640,400);
    target.texture.encoding=T.sRGBEncoding;
    const pixels=()=>{
      a.renderer.setRenderTarget(target);a.renderer.render(a.scene,a.camera);
      const p=new Uint8Array(640*400*4);
      a.renderer.readRenderTargetPixels(target,0,0,640,400,p);
      a.renderer.setRenderTarget(null);return p;
    };
    const difference=(before,after)=>{
      let changed=0,orange=0,total=0,max=0;const columns=new Array(640).fill(0);
      for(let k=0;k<before.length;k+=4){
        const dr=after[k]-before[k],dg=after[k+1]-before[k+1],db=after[k+2]-before[k+2];
        const d=Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db));max=Math.max(max,d);
        if(d>5){changed++;if(dr>dg&&dg>db&&after[k]>after[k+1]*1.15)orange++;}
        total+=Math.max(0,dr);columns[(k/4)%640]+=Math.max(0,dr);
      }return {changed,orange,total,max,columns};
    };
    const views=[];
    for(const view of ['nozzle','nozzle-side','nozzle-rear','front']){
      a.setView(view);plume.visible=false;const off=pixels();
      plume.visible=true;const on=pixels(),d=difference(off,on);
      check(view==='front'?d.changed<10:d.changed>250,
        'visible gas and correct opaque-aircraft occlusion: '+view,
        {changed:d.changed,orange:d.orange});
      if(view!=='front')check(d.orange>d.changed*.65,'predominantly orange flame: '+view);
      views.push({view,...d,columns:undefined});
      if(view==='nozzle-side'){
        const c=d.columns,peak=Math.max(...c),peaks=[];
        for(let i=4;i<c.length-4;i++)if(c[i]>peak*.18&&c[i]>c[i-1]&&c[i]>=c[i+1]&&(!peaks.length||i-peaks.at(-1)>15))peaks.push(i);
        check(peaks.length>=4,'multiple resolved stationary shock cells in side view',{peaks});
      }
    }
    a.setView('nozzle-side');
    // An opaque card ahead of the whole gas volume must hide it completely.
    const card=new T.Mesh(new T.PlaneGeometry(12,7),new T.MeshBasicMaterial({color:0x485566,side:T.DoubleSide}));
    card.position.set(3,-.05,8.5);card.rotation.y=Math.PI/2;a.scene.add(card);
    plume.visible=false;const blockedOff=pixels();plume.visible=true;const blockedOn=pixels();
    const blocked=difference(blockedOff,blockedOn);
    check(blocked.changed===0,'foreground metal fully occludes gas (no rectangular proxy bleed)',{changed:blocked.changed});
    a.scene.remove(card);card.geometry.dispose();card.material.dispose();
    a.setState({ab:.25},2);const partial={length:e.length,power:e.power,radius:n.exitRadius};
    a.setState({ab:1},2);const full={length:e.length,power:e.power,radius:n.exitRadius};
    check(full.length>partial.length&&full.power>partial.power&&full.radius>partial.radius,
      'AB intensity, plume dimensions and nozzle aperture increase together',{partial,full});
    const seaLength=e.length,seaCell=e.cellSpacing;
    a.flight.air.pressure=22000;a.setState({},0);
    check(e.length>seaLength&&e.cellSpacing>seaCell,'lower ambient pressure expands shock-cell spacing');
    a.flight.air.pressure=90000;a.setState({},0);
    a.jet.time=0;a.setState({},0);const frame0=pixels();
    a.jet.time=.075;a.setState({},0);const frame1=pixels();const motion=difference(frame0,frame1);
    check(motion.changed>100,'gas wisps animate within the anchored volume',{changed:motion.changed});
    a.setState({ab:0},.02);check(!plume.visible,'dry power removes external flame');
    a.setState({ab:1},2);a.setView('nozzle');a.renderer.render(a.scene,a.camera);
    const badPrograms=a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>p.diagnostics);
    check(!badPrograms.length,'all exhaust shaders compile and link',badPrograms);
    target.dispose();return {checks,views};
  })()`);
  await writeFile('work/exhaust/validation.json',JSON.stringify(result,null,2));
  const failures=result.checks.filter(c=>!c.ok);
  assert.deepEqual(failures,[],JSON.stringify(failures,null,2));
  await writeFile('work/exhaust/validated-nozzle.png',await tab.screenshot());
  assert.equal(tab.page.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0,JSON.stringify(tab.page.problems));
  console.log('PASS: '+result.checks.length+' F100 exhaust checks; orange volumetric flame, recessed origin, shock cells, multiple angles, opaque occlusion, power/pressure response, animated gas, no particles, shader compilation.');
  await tab.close();
});
