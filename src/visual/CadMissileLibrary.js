/**
 * Shared CAD missile templates extracted from the F-16CM Body_2 assembly.
 *
 * The same meshes are used for the jet's mounted stores, the hangar catalogue
 * and the missile that actually leaves the rail. Templates are kept normalised
 * (centred on the origin, nose toward -Z) so CombatSystem can orient them with
 * the generic missile vector.
 */
const templates = new Map();
const listeners = new Set();

export function cadMissileType(storeId) {
  if (storeId === 'aim120c' || storeId === 'aim120c_chaff') return 'aim120c';
  if (storeId === 'aim9m' || storeId === 'aim9x' || storeId === 'aim9l') {
    return 'aim9m';
  }
  return null;
}

export function registerCadMissile(type, template) {
  if (!template || templates.has(type)) return;
  templates.set(type, template);
  for (const listener of listeners) {
    try { listener(type); } catch { /* keep registration independent */ }
  }
}

export function hasCadMissile(type) {
  return templates.has(type);
}

export function onCadMissileReady(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function cloneDeep(object) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child.geometry) child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else if (child.material) {
      child.material = child.material.clone();
    }
  });
  return clone;
}

export function cloneCadMissile(type) {
  const template = templates.get(type);
  return template ? cloneDeep(template) : null;
}

export function createCadStore(storeId) {
  const type = cadMissileType(storeId);
  return type ? cloneCadMissile(type) : null;
}
