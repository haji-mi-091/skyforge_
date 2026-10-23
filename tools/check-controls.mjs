import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {withBrowser} from './cdp.mjs';
import {CONTROL_ACTIONS,normalizeBindings} from '../src/data/controls.js';

const out='work/controls';await mkdir(out,{recursive:true});
await withBrowser(async api=>{
 const tab=await api.open('http://127.0.0.1:4173/tools/airframe-preview.html?hud=0');
 assert.ok(tab.ready);
 await tab.page.evaluate(`localStorage.setItem('skyforge.settings.v1',JSON.stringify({quality:'performance',volume:.24}))`);
 const wait=async expression=>{
  for(let i=0;i<240;i++){try{if(await tab.page.evaluate(expression))return;}catch{}await sleep(250);}
  throw new Error('Timed out: '+expression+' '+JSON.stringify(tab.page.problems));
 };
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/'});
 await wait(`window.__SKYFORGE__?.state==='menu'&&window.__SKYFORGE__.ready`);
 const click=async selector=>{
  let p;
  for(let i=0;i<30;i++){
   p=await tab.page.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing button');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x+r.width/2,y:r.y+r.height/2,hit:hit?.closest('button,summary')===e,cover:hit?.outerHTML.slice(0,180)};})()`);
   if(p.hit)break;
   // Wake the headless compositor after overlay visibility changes.
   if(i===0)await tab.page.send('Page.captureScreenshot',{format:'png'});
   await sleep(100);
  }
  if(!p.hit){await writeFile(out+'/click-failure.png',await tab.screenshot());throw new Error('Button obscured: '+selector+' '+JSON.stringify(p));}
  delete p.hit;delete p.cover;
  await tab.page.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
  await tab.page.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
 };
 let modifiers=0;
 const key=async(code,down=true,repeat=false)=>{
  const modifier={ControlLeft:2,ShiftLeft:8,AltLeft:1,MetaLeft:4}[code]||0;
  if(down)modifiers|=modifier;else modifiers&=~modifier;
  const name={ControlLeft:'Control',ShiftLeft:'Shift',AltLeft:'Alt',Space:' ',Escape:'Escape',ArrowUp:'ArrowUp',Enter:'Enter'}[code]||code.replace(/^Key|^Digit/,'');
  await tab.page.send('Input.dispatchKeyEvent',{type:down?'rawKeyDown':'keyUp',code,key:name,modifiers,autoRepeat:repeat});
 };
 const chord=async codes=>{for(const code of codes)await key(code);for(const code of [...codes].reverse())await key(code,false);};
 const row=id=>`[data-binding-action="${id}"]`;
 const bind=async(id,codes)=>{await click(row(id)+' .binding-edit');await chord(codes);await click(row(id)+' .binding-confirm');};
 const current=()=>tab.page.evaluate(`window.__SKYFORGE__.screens.settingsState.keyBindings`);
 const defaults=normalizeBindings();assert.deepEqual(await current(),defaults,'legacy settings use all defaults');
 await click('#menu [data-action="settings"]');await click('#binding-settings summary');
 assert.equal(await tab.page.evaluate(`document.querySelectorAll('.binding-row').length`),33);
 // Keys held before editing must still be released while capture is active.
 await key('ShiftLeft');await click(row('gear')+' .binding-edit');await key('ShiftLeft',false);
 await chord(['Enter']);await click(row('gear')+' .binding-cancel');
 assert.deepEqual(await tab.page.evaluate(`[...window.__SKYFORGE__.input.keys]`),[],'capture never leaves held keys behind');
 for(const code of ['Enter','Escape','F1']){
  await click(row('gear')+' .binding-edit');
  assert.ok(await tab.page.evaluate(`!!window.__SKYFORGE__.screens.bindingCapture`),'edit button starts capture');
  await chord([code]);
  const pending=await tab.page.evaluate(`({capture:!!window.__SKYFORGE__.screens.bindingCapture,settings:!document.getElementById('settings').classList.contains('hidden'),help:document.getElementById('help').classList.contains('hidden')})`);
  assert.deepEqual(pending,{capture:true,settings:true,help:true},code+' only captured');
  assert.deepEqual((await current()).gear,defaults.gear,'capture never auto-saves');
  await click(row('gear')+' .binding-cancel');
 }
 // Every action, including pause/help and mouse-default gun, accepts the same key.
 for(const action of CONTROL_ACTIONS)await bind(action.id,['KeyI']);
 assert.ok(Object.values(await current()).every(chords=>JSON.stringify(chords)==='[["KeyI"]]'));
 await click('#bindings-default');assert.deepEqual(await current(),defaults);
 await bind('gear',['ControlLeft','ShiftLeft','KeyU']);
 await bind('airbrake',['ControlLeft','ShiftLeft','KeyU']);
 await bind('map',['KeyW','KeyE']);
 await bind('gunFire',['KeyI']);
 await bind('pitchUp',['ArrowUp']);await bind('throttleUp',['ArrowUp']);
 await bind('pause',['KeyU']);await bind('help',['F2']);
 await bind('canopy',['KeyI']);await click(row('canopy')+' .binding-default');
 assert.deepEqual((await current()).canopy,defaults.canopy,'single default restores only its action');
 assert.deepEqual((await current()).gear,[['Control','Shift','KeyU']]);
 assert.equal(await tab.page.evaluate(`document.querySelector('#help [data-binding="gear"]').textContent`),'Ctrl + Shift + U');
 assert.equal(await tab.page.evaluate(`document.querySelector('#menu [data-binding="gunFire"]').textContent`),'I');
 await click(row('gear')+' .binding-edit');await chord(['ControlLeft','ShiftLeft','KeyU']);
 await writeFile(out+'/desktop.png',await tab.screenshot());
 await tab.page.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await tab.page.evaluate(`window.dispatchEvent(new Event('resize'));document.querySelector('.binding-row.capturing').scrollIntoView({block:'center'})`);
 const layout=await tab.page.evaluate(`(()=>{const m=document.querySelector('.settings-modal').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,rows:[...document.querySelectorAll('.binding-row')].some(e=>{const r=e.getBoundingClientRect();return r.left<m.left-1||r.right>m.right+1})};})()`);
 assert.deepEqual(layout,{overflow:false,rows:false});await writeFile(out+'/mobile.png',await tab.screenshot());
 await click(row('gear')+' .binding-cancel');
 const stored=await current();await tab.page.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await tab.page.send('Page.navigate',{url:'http://127.0.0.1:4173/'});
 await wait(`window.__SKYFORGE__?.state==='menu'&&window.__SKYFORGE__.ready`);
 assert.deepEqual(await current(),stored,'reload preserves every binding');
 assert.equal(await tab.page.evaluate(`window.__SKYFORGE__.screens.settingsState.volume`),.24,'other settings preserved');
 const aircraft=[];
 for(const id of ['f16cm-block52','j16','j10c']){
  await tab.page.evaluate(`window.__SKYFORGE__.start('test',${JSON.stringify(id)})`);
  await wait(`window.__SKYFORGE__?.state==='playing'&&window.__SKYFORGE__.player?.config.id===${JSON.stringify(id)}`);
  await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;g.pause();g.player.onGround=false;g.input.setEnabled(true);g.input.clear();})()`);
  const before=await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;return{gear:g.player.systems.gearTarget,brake:g.player.systems.airbrakeTarget};})()`);
  for(const code of ['ControlLeft','ShiftLeft','KeyU'])await key(code);
  await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;g._frameInput(0);g.input.endFrame();})()`);
  const after=await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;return{gear:g.player.systems.gearTarget,brake:g.player.systems.airbrakeTarget};})()`);
  assert.notEqual(after.gear,before.gear,id+' duplicate gear');assert.notEqual(after.brake,before.brake,id+' duplicate brake');
  await key('KeyU',true,true);
  await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;g._frameInput(0);g.input.endFrame();})()`);
  assert.deepEqual(await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;return{gear:g.player.systems.gearTarget,brake:g.player.systems.airbrakeTarget};})()`),after,id+' no repeated toggles');
  for(const code of ['KeyU','ShiftLeft','ControlLeft'])await key(code,false);
  const throttle=await tab.page.evaluate(`window.__SKYFORGE__.throttleTarget`);await key('ArrowUp');
  const axis=await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__;g.freeLook=true;g._frameInput(.1);g.input.endFrame();return{pitch:g.aimInputs.pitch,throttle:g.throttleTarget};})()`);
  assert.equal(axis.pitch,1);assert.ok(axis.throttle>throttle);await key('ArrowUp',false);
  await key('KeyW');await key('KeyE');
  const map=await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__,before=g.mapOpen;g._frameInput(0);g.input.endFrame();return{before,after:g.mapOpen,chaff:g.player.weapons.chaff};})()`);
  assert.notEqual(map.before,map.after,id+' ordinary-key chord');await key('KeyE',false);await key('KeyW',false);
  await chord(['KeyW']);await chord(['KeyE']);
  assert.equal(await tab.page.evaluate(`window.__SKYFORGE__.input.getPressedActions().has('map')`),false,id+' separate taps never form a chord');
  await tab.page.evaluate(`window.__SKYFORGE__.input.endFrame()`);
  await key('KeyF');await key('AltLeft');await key('KeyF',false);await key('AltLeft',false);
  const reverseChord=await tab.page.evaluate(`(()=>{const a=window.__SKYFORGE__.input.getPressedActions();return{takeoff:a.has('takeoffFlaps'),landing:a.has('flaps')};})()`);
  assert.deepEqual(reverseChord,{takeoff:true,landing:false},id+' modifier may complete the chord last');
  await tab.page.evaluate(`window.__SKYFORGE__.input.endFrame()`);
  await key('KeyI');
  const gun=await tab.page.evaluate(`(()=>{const g=window.__SKYFORGE__,before=g.player.weapons.ammo,held=g.input.isActionDown('gunFire'),steps=Math.ceil(((g.player.config.armament.cannon.spinUpTime||0)+.15)*120);g.state='playing';for(let i=0;i<steps;i++)g._fixedUpdate(1/120);g.state='paused';return{before,after:g.player.weapons.ammo,held,steps,altMouse:g.altMouse,alive:g.player.alive,onGround:g.player.onGround};})()`);
  assert.ok(gun.after<gun.before,id+' keyboard fires cannon '+JSON.stringify(gun));await key('KeyI',false);
  await tab.page.evaluate(`window.__SKYFORGE__.input.setEnabled(false)`);
  await chord(['F2']);assert.equal(await tab.page.evaluate(`document.getElementById('help').classList.contains('hidden')`),false,id+' remapped help');
  await chord(['KeyU']);assert.equal(await tab.page.evaluate(`window.__SKYFORGE__.state`),'paused','first pause key closes help');
  await chord(['KeyU']);assert.equal(await tab.page.evaluate(`window.__SKYFORGE__.state`),'playing','second pause key resumes');
  await key('KeyU');await wait(`window.__SKYFORGE__.state==='paused'`);await key('KeyU',false);
  aircraft.push({id,duplicates:true,heldAxes:true,ordinaryChord:true,keyboardGun:true,remappedPauseHelp:true});
  await tab.page.evaluate(`window.__SKYFORGE__.returnToMenu()`);
 }
 await click('#hangar [data-action="settings"]');
 await tab.page.evaluate(`document.getElementById('binding-settings').open=true`);await click('#bindings-default');
 assert.deepEqual(await current(),defaults,'all defaults restored after tests');
 assert.deepEqual(tab.page.problems,[]);
 await writeFile(out+'/result.json',JSON.stringify({actions:33,legacy:true,captureOnly:true,allDuplicates:true,reload:true,layout,aircraft,problems:tab.page.problems},null,2));
 console.log('PASS: all 33 editable actions, mouse-confirmed capture, Enter/Esc/F1 capture, duplicates, modifier/ordinary chords, cancel/defaults/reload, desktop/mobile layout and remapped controls in F-16/J-16/J-10C.');
 await tab.close();
},{width:1280,height:900});
