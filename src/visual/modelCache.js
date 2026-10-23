import { GLTFLoader } from '../../vendor/GLTFLoader.module.js';

// One immutable parsed template per URL for this page. Never return the template:
// rig builders edit geometry and live jets dispose their own resources.
const models = new Map();

export async function loadCachedModel(url) {
  const key = new URL(url, globalThis.location?.href || import.meta.url).href;
  let pending = models.get(key);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(key).then((gltf) => gltf.scene);
    models.set(key, pending);
    pending.catch(() => { if (models.get(key) === pending) models.delete(key); });
  }
  const template = await pending;
  const geometries = new Map(), materials = new Map(), textures = new Map();
  const copyMaterial = (material) => {
    if (!materials.has(material)) {
      const copy = material.clone();
      for (const [name, value] of Object.entries(material)) {
        if (!value?.isTexture) continue;
        if (!textures.has(value)) {
          const texture = value.clone();texture.needsUpdate = true;
          textures.set(value, texture);
        }
        copy[name] = textures.get(value);
      }
      materials.set(material, copy);
    }
    return materials.get(material);
  };
  const root = template.clone(true);
  root.traverse((object) => {
    if (object.geometry) {
      const geometry = object.geometry;
      if (!geometries.has(geometry)) geometries.set(geometry, geometry.clone());
      object.geometry = geometries.get(geometry);
    }
    if (object.material) object.material = Array.isArray(object.material)
      ? object.material.map(copyMaterial) : copyMaterial(object.material);
  });
  return root;
}
