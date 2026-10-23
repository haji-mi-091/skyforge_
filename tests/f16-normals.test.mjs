import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../vendor/three.module.js';
import {readModelGlb} from '../tools/lib/model-glb.mjs';
import {rebuildF16SkinNormals} from '../src/visual/F16Airframe.js';

function triangleData(geometry, name) {
  const attribute = geometry.attributes[name], index = geometry.index,
    out = new attribute.array.constructor((index?.count ?? attribute.count) * attribute.itemSize);
  for (let i = 0; i < (index?.count ?? attribute.count); i++) {
    const id = index ? index.getX(i) : i;
    for (let j = 0; j < attribute.itemSize; j++)
      out[i * attribute.itemSize + j] = attribute.array[id * attribute.itemSize + j];
  }
  return Buffer.from(out.buffer);
}
const hash = (data) => createHash('sha256').update(data).digest('hex');
let checked = 0, hardCorners = 0;
function verify(source) {
  const attributes = Object.keys(source.attributes).filter((name) => name !== 'normal'),
    before = attributes.map((name) => hash(triangleData(source, name))),
    originalNormals = Buffer.from(source.attributes.normal.array.buffer).toString('base64'),
    result = rebuildF16SkinNormals(source);
  attributes.forEach((name, i) => {
    assert.equal(hash(triangleData(result, name)), before[i], name + ' unchanged for every triangle corner');
    assert.equal(hash(triangleData(source, name)), before[i], 'input ' + name + ' unchanged');
  });
  assert.equal(Buffer.from(source.attributes.normal.array.buffer).toString('base64'), originalNormals);
  assert.deepEqual(result.groups, source.groups);
  assert.deepEqual(result.drawRange, source.drawRange);
  const p = result.attributes.position, n = result.attributes.normal, ix = result.index,
    a = new T.Vector3(), b = a.clone(), c = a.clone(), normal = a.clone(), vertexNormal = a.clone();
  for (let i = 0; i < ix.count; i += 3) {
    a.fromBufferAttribute(p, ix.getX(i));
    b.fromBufferAttribute(p, ix.getX(i + 1)).sub(a);
    c.fromBufferAttribute(p, ix.getX(i + 2)).sub(a);
    normal.crossVectors(b, c);
    if (normal.lengthSq() < 1e-18) continue;
    normal.normalize();
    for (let k = 0; k < 3; k++) {
      vertexNormal.fromBufferAttribute(n, ix.getX(i + k));
      assert.ok(Math.abs(vertexNormal.length() - 1) < 1e-5, 'unit normal');
      assert.ok(normal.dot(vertexNormal) >= Math.cos(Math.PI / 4) - 1e-5, 'no reversed or over-smoothed edge normal');
    }
    checked++;
  }
  hardCorners += Math.max(0, result.attributes.position.count - source.attributes.position.count);
  return result;
}
verify(new T.BoxGeometry(1, 1, 1));
verify(new T.SphereGeometry(1, 32, 16));
verify(new T.CylinderGeometry(1, 1, 2, 32).toNonIndexed());
const root = await readModelGlb('assets/models/f16/f16_flight.glb');
const parts = [];
root.traverse((object) => {
  if (object.isMesh && /cc(?:11|30|31|52)$|rear stabilizer/i.test(object.name)) parts.push(object);
});
const start = performance.now();
for (const part of parts) verify(part.geometry);
console.log(`PASS: ${parts.length} F-16 CAD parts; ${checked} faces with correct-facing unit normals; every triangle position, winding and other attributes bit-identical; input geometry unchanged; ${hardCorners} added hard-edge vertices; ${(performance.now() - start).toFixed(0)} ms including verification.`);
