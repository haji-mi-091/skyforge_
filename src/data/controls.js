// One action list for input, settings and the labels shown to the pilot.
// Each action may have alternative chords; a chord contains simultaneous keys.
export const CONTROL_ACTIONS = [
  {id:'pitchDown',label:'下压机头',group:'飞行操纵',keys:[['KeyW']]},
  {id:'pitchUp',label:'上抬机头',group:'飞行操纵',keys:[['KeyS']]},
  {id:'rollLeft',label:'向左滚转',group:'飞行操纵',keys:[['KeyA']]},
  {id:'rollRight',label:'向右滚转',group:'飞行操纵',keys:[['KeyD']]},
  {id:'yawLeft',label:'左方向舵',group:'飞行操纵',keys:[['KeyQ']]},
  {id:'yawRight',label:'右方向舵',group:'飞行操纵',keys:[['KeyY']]},
  {id:'throttleUp',label:'增加油门',group:'飞行操纵',keys:[['Shift']]},
  {id:'throttleDown',label:'减小油门',group:'飞行操纵',keys:[['Control']]},
  {id:'gear',label:'起落架收放',group:'飞机系统',keys:[['KeyG']]},
  {id:'flaps',label:'着陆襟翼收放',group:'飞机系统',keys:[['KeyF']]},
  {id:'takeoffFlaps',label:'起飞襟翼',group:'飞机系统',keys:[['Alt','KeyF']]},
  {id:'airbrake',label:'减速板 / 地面刹车',group:'飞机系统',keys:[['KeyH']]},
  {id:'canopy',label:'座舱盖开关',group:'飞机系统',keys:[['KeyP']]},
  {id:'dragChute',label:'地面减速伞',group:'飞机系统',keys:[['KeyB']]},
  {id:'fuelDump',label:'放油开关',group:'飞机系统',keys:[['KeyJ']]},
  {id:'jettisonTanks',label:'抛弃全部副油箱',group:'飞机系统',keys:[['KeyO']]},
  {id:'gunFire',label:'机炮射击',group:'武器与对抗',keys:[['Mouse0']]},
  {id:'weaponFire',label:'锁定 / 发射 / 投弹',group:'武器与对抗',keys:[['Space']]},
  {id:'weaponNext',label:'切换挂载武器',group:'武器与对抗',keys:[['Alt','Digit1']]},
  {id:'cannonBelt',label:'切换机炮弹链',group:'武器与对抗',keys:[['KeyK']]},
  {id:'targetNext',label:'切换锁定目标',group:'武器与对抗',keys:[['KeyR'],['Mouse4']]},
  {id:'radarRange',label:'切换雷达量程',group:'武器与对抗',keys:[['Alt','Digit2']]},
  {id:'flares',label:'投放热焰弹',group:'武器与对抗',keys:[['KeyZ']]},
  {id:'chaff',label:'投放箔条',group:'武器与对抗',keys:[['KeyE']]},
  {id:'camera',label:'座舱 / 追尾视角',group:'视角与显示',keys:[['KeyX']]},
  {id:'freeLook',label:'自由视角 / 鼠标瞄准',group:'视角与显示',keys:[['KeyC']]},
  {id:'pitchLadder',label:'姿态指示线',group:'视角与显示',keys:[['KeyV']]},
  {id:'telemetry',label:'飞行遥测',group:'视角与显示',keys:[['KeyT']]},
  {id:'map',label:'战术地图',group:'视角与显示',keys:[['KeyM']]},
  {id:'mouseCapture',label:'释放 / 锁定鼠标',group:'视角与显示',keys:[['KeyL']]},
  {id:'mute',label:'静音 / 恢复',group:'界面',keys:[['KeyN']]},
  {id:'pause',label:'暂停 / 继续 / 返回',group:'界面',keys:[['Escape']]},
  {id:'help',label:'操作说明',group:'界面',keys:[['F1']]},
];

export function normalizeKeyCode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(code) ||
      code === 'Unidentified' || code === 'Process') return null;
  return code.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
}

const modifiers = ['Control','Alt','Shift','Meta'];
export function normalizeChord(chord) {
  if (!Array.isArray(chord) || !chord.length) return null;
  const keys = chord.map(normalizeKeyCode);
  if (keys.some((key) => !key)) return null;
  return [...new Set(keys)].sort((a,b) => {
    const ai = modifiers.indexOf(a), bi = modifiers.indexOf(b);
    return (ai < 0 ? 4 : ai) - (bi < 0 ? 4 : bi) || a.localeCompare(b);
  });
}

export function normalizeBindings(stored) {
  return Object.fromEntries(CONTROL_ACTIONS.map((action) => {
    const value = stored?.[action.id], chords = Array.isArray(value) ? value.map(normalizeChord) : [];
    return [action.id, chords.length && chords.every(Boolean) ? chords : action.keys.map((keys) => [...keys])];
  }));
}

export function eventKeyCodes(event, held = []) {
  const codes = new Set([...held, event.code].map(normalizeKeyCode).filter(Boolean));
  for (const [flag,key] of [['ctrlKey','Control'],['altKey','Alt'],['shiftKey','Shift'],['metaKey','Meta']])
    if (event[flag]) codes.add(key);
  return codes;
}

export function activeControlActions(bindings, codes) {
  const matches = [];
  for (const action of CONTROL_ACTIONS)
    for (const chord of bindings[action.id])
      if (chord.every((code) => codes.has(code))) matches.push({id:action.id,chord});
  // A complete chord wins over its strict subsets. Identical chords all fire;
  // unrelated controls (e.g. Shift + W + A) still operate together.
  return new Set(matches.filter(({chord}) => !matches.some((other) =>
    other.chord.length > chord.length && chord.every((code) => other.chord.includes(code)),
  )).map(({id}) => id));
}

export function formatChord(chord) {
  const names = {Control:'Ctrl',Space:'空格',Escape:'Esc',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',
    Mouse0:'鼠标左键',Mouse1:'鼠标中键',Mouse2:'鼠标右键',Mouse3:'鼠标侧键 3',Mouse4:'鼠标侧键 4',
    Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/'};
  return chord.map((code) => names[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, '小键盘 ')).join(' + ');
}

export function formatBinding(bindings, id) {
  const chords = bindings?.[id] || CONTROL_ACTIONS.find((action) => action.id === id)?.keys;
  return chords ? chords.map(formatChord).join(' / ') : '—';
}
