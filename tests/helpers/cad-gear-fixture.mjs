import * as THREE from '../../vendor/three.module.js';
import { JetModel } from '../../src/visual/JetModel.js';
import { buildHydraulicGear, updateHydraulicGear, gearDoorClosure, mainDoorClearance } from '../../src/visual/CadLandingGear.js';
import { readFile } from 'node:fs/promises';

// Load the shipped indexed GLB without DOM, canvas, textures or a browser.
const data = await readFile(new URL('../../assets/models/f16/f16_flight.glb', import.meta.url));
const jsonLength = data.readUInt32LE(12);
const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
const binary = data.subarray(28 + jsonLength);
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(index) {
  const definition = gltf.accessors[index];
  const view = gltf.bufferViews[definition.bufferView];
  const count = components[definition.type];
  const width = definition.componentType === 5123 ? 2 : 4;
  const base = (view.byteOffset || 0) + (definition.byteOffset || 0);
  const values = [];
  for (let i = 0; i < definition.count; i++) {
    for (let j = 0; j < count; j++) {
      const offset = base + i * (view.byteStride || count * width) + j * width;
      values.push(definition.componentType === 5126 ? binary.readFloatLE(offset)
        : definition.componentType === 5125 ? binary.readUInt32LE(offset) : binary.readUInt16LE(offset));
    }
  }
  return values;
}
export const cad = new THREE.Group();
export const nodes = [];
for (const node of gltf.nodes) {
  if (node.mesh === undefined) continue;
  const primitive = gltf.meshes[node.mesh].primitives[0];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(accessor(primitive.attributes.POSITION), 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(accessor(primitive.attributes.NORMAL), 3));
  geometry.setIndex(accessor(primitive.indices));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = node.name;
  mesh.userData = node.extras || {};
  if (node.matrix) {
    mesh.matrix.fromArray(node.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
  }
  cad.add(mesh);
  nodes.push(mesh);
}
const normalName = node => node.name.toLowerCase().replace(/_/g, ' ');
export const jet = Object.create(JetModel.prototype);
jet.cadSkinMaterial = new THREE.MeshStandardMaterial();
jet.cadGearDoors = [];
jet._extractCadGearDoors(nodes, normalName);
export const rigs = buildHydraulicGear(cad, nodes, normalName);
export function update(retraction) {
  for (const rig of rigs) updateHydraulicGear(rig, retraction);
  const closure = gearDoorClosure(retraction);
  for (const door of jet.cadGearDoors) {
    jet._setCadHingeAngle(door, -door.side * door.closeAngle * closure);
    mainDoorClearance(door, closure);
  }
  cad.updateMatrixWorld(true);
}
export function triangles(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index;
  const result = [];
  for (let i = 0; i < (index ? index.count : position.count); i += 3) {
    const triangle = [];
    for (let corner = 0; corner < 3; corner++) {
      triangle.push(new THREE.Vector3().fromBufferAttribute(position,
        index ? index.getX(i + corner) : i + corner).applyMatrix4(mesh.matrixWorld));
    }
    result.push(triangle);
  }
  return result;
}
export const bounds = triangle => new THREE.Box3().setFromPoints(triangle);

// A simple BVH limits exact segment/triangle tests to overlapping mesh faces.
export function tree(triangles) {
  const box = new THREE.Box3();
  for (const triangle of triangles) box.union(triangle.box);
  if (triangles.length <= 12) return { box, triangles };
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
  triangles.sort((a, b) => (a.box.min[axis] + a.box.max[axis]) - (b.box.min[axis] + b.box.max[axis]));
  const middle = triangles.length >> 1;
  return { box, left: tree(triangles.slice(0, middle)), right: tree(triangles.slice(middle)) };
}
function query(node, box, result) {
  if (!node.box.intersectsBox(box)) return;
  if (node.triangles) {
    for (const triangle of node.triangles) if (triangle.box.intersectsBox(box)) result.push(triangle);
  } else {
    query(node.left, box, result);
    query(node.right, box, result);
  }
}
const ray = new THREE.Ray();
const hit = new THREE.Vector3();
const direction = new THREE.Vector3();
function edgesAgainstTriangle(edges, triangle) {
  for (let i = 0; i < 3; i++) {
    ray.origin.copy(edges[i]);
    direction.copy(edges[(i + 1) % 3]).sub(edges[i]);
    const length = direction.length();
    if (length < 1e-10) continue;
    ray.direction.copy(direction).multiplyScalar(1 / length);
    if (ray.intersectTriangle(...triangle, false, hit)) {
      const distance = hit.distanceTo(ray.origin);
      if (distance > 1e-6 && distance < length - 1e-6) return hit.clone();
    }
  }
  return null;
}
export function intersections(mesh, collider, limit = 5) {
  const result = [];
  for (const triangle of triangles(mesh)) {
    const candidates = [];
    query(collider, bounds(triangle), candidates);
    for (const other of candidates) {
      const point = edgesAgainstTriangle(triangle, other.tri) || edgesAgainstTriangle(other.tri, triangle);
      if (point) {
        result.push({ point: point.toArray(), name: other.name });
        if (result.length >= limit) return result;
      }
    }
  }
  return result;
}
