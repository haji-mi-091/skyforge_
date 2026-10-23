// CAD-local station references. F-16: 1/9 tips, 2/8 light wing, 3/7 heavy
// wing, 4/6 wet wing, 5 centreline and 5R intake targeting pod.
export const F16_STATIONS = [
  {
    id: 'lt',
    number: '1',
    x: -4.995,
    y: -1.035,
    z: 1.92,
    wingY: -0.72,
    tip: true,
  },
  { id: 'lo', number: '2', x: -3.82, y: -1.24, z: 1.88, wingY: -0.735 },
  { id: 'li', number: '3', x: -2.985, y: -1.3, z: 1.72, wingY: -0.762 },
  { id: 'tl', number: '4', x: -1.88, y: -1.5, z: 1.36, wingY: -0.78 },
  { id: 'ctr', number: '5', x: 0.0075, y: -1.93, z: 1.45, wingY: -1.39 },
  { id: 'tr', number: '6', x: 1.895, y: -1.5, z: 1.36, wingY: -0.78 },
  { id: 'ri', number: '7', x: 3.0, y: -1.3, z: 1.72, wingY: -0.762 },
  { id: 'ro', number: '8', x: 3.835, y: -1.24, z: 1.88, wingY: -0.735 },
  {
    id: 'rt',
    number: '9',
    x: 5.01,
    y: -1.035,
    z: 1.92,
    wingY: -0.72,
    tip: true,
  },
  {
    id: 'pr',
    number: '5R',
    x: 0.72,
    y: -1.38,
    z: -1.08,
    wingY: -0.93,
    chin: true,
  },
];
export const F16_STATION_BY_ID = Object.fromEntries(
  F16_STATIONS.map((s) => [s.id, s]),
);
const aam = ['aim120c', 'aim9m', 'aim9x'];
const heavy = [
  'mk82',
  'mk83',
  'mk84',
  'gbu12',
  'gbu16',
  'gbu31',
  'gbu38',
  'agm65d',
  'agm65g',
  'agm88',
  'cbu87',
  'cbu97',
];
export const F16_STATION_STORES = {
  lt: aam,
  rt: aam,
  lo: aam,
  ro: aam,
  li: [...aam, ...heavy],
  ri: [...aam, ...heavy],
  tl: ['fuel370'],
  tr: ['fuel370'],
  ctr: ['fuel300'],
  pr: ['litening'],
};
export function normalizeF16Loadout(input = {}) {
  const l = { ...input };
  if (l.ctr === 'fuel370') l.ctr = 'fuel300';
  if (l.ctr === 'litening') {
    l.pr = 'litening';
    l.ctr = null;
  }
  for (const id of Object.keys(l)) {
    if (l[id] === 'aim120c_chaff') l[id] = 'aim120c';
    if (l[id] === 'aim9l') l[id] = 'aim9m';
    if (!F16_STATION_STORES[id]?.includes(l[id])) l[id] = null;
  }
  return l;
}
