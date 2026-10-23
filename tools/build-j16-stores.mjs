import {writeFile} from 'node:fs/promises';
import * as T from '../vendor/three.module.js';
import {readModelGlb,writeModelGlb} from './lib/model-glb.mjs';
import {buildJ16Weapon,buildJ16Stores,J16_STATIONS,J16_WEAPONS,J16_LOADOUTS} from '../src/visual/J16Stores.js';
const dir='assets/models/j16',library=new T.Group();library.name='J16_weapon_library';
let column=0;for(const id of Object.keys(J16_WEAPONS)){const w=buildJ16Weapon(id);w.position.x=column++*1.8;library.add(w);}
const report={library:await writeModelGlb(library,dir+'/j16-stores.glb'),presets:{}};
for(const preset of ['racks','modern','wiki','strike','sead']){
 const airframe=await readModelGlb(dir+'/j16-white.glb');airframe.add(buildJ16Stores(airframe,preset));
 report.presets[preset]=await writeModelGlb(airframe,dir+'/j16-'+preset+'.glb');
}
await writeFile(dir+'/j16-stores.json',JSON.stringify({stations:J16_STATIONS,weapons:J16_WEAPONS,loadouts:J16_LOADOUTS,...report,note:'Original visual models. Proportions and curated display presets are approximate, not certified load clearance or an exhaustive operational load chart.',sources:['https://wiki.warthunder.com/unit/j_16','https://eng.mod.gov.cn/xb/News_213114/TopStories/4816016.html','https://www.airuniversity.af.edu/Portals/10/CASI/documents/Research/Infrastructure/2020-11-%2030%20Air-to-Air%20Missiles%20and%20Guidance%20Systems.pdf']},null,2)+'\n');console.log(JSON.stringify(report,null,2));
