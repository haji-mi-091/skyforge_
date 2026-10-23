import {writeFile} from 'node:fs/promises';
import {J16} from '../src/data/aircraft.js';
import {J16_STORE_DATA,J16_GAME_STATIONS,J16_DEFAULT_PRESETS} from '../src/data/j16Weapons.js';
await writeFile('work/j16/integration/game-data.json',JSON.stringify({aircraft:J16,weapons:J16_STORE_DATA,stations:J16_GAME_STATIONS,presets:J16_DEFAULT_PRESETS,acceptance:'Final flight and combat tests are assigned to the user. Stat-card targets are not claimed as measured flight results.'},null,2)+'\n');
console.log('Exported complete J-16 simulation configuration, numerical Wiki facts, authored coefficients and custom upgrade data.');
