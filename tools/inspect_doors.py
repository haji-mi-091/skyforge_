"""Offline GLB inspector: dumps node transforms and per-node local bounding
boxes for chosen node name patterns. No three.js, no browser.

Usage: python tools/inspect_doors.py <glb> <regex> [<regex> ...]
"""
import json
import re
import struct
import sys

import numpy as np

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2),
             5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
         'MAT2': 4, 'MAT3': 9, 'MAT4': 16}


def load_glb(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB'
    off = 12
    gltf = None
    binary = b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binary = chunk
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    return gltf, binary


def read_accessor(gltf, binary, index):
    acc = gltf['accessors'][index]
    n = NCOMP[acc['type']]
    fmt, size = COMPONENT[acc['componentType']]
    count = acc['count']
    if 'bufferView' not in acc:
        return np.zeros((count, n))
    view = gltf['bufferViews'][acc['bufferView']]
    base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride') or size * n
    out = np.empty((count, n))
    if stride == size * n:
        arr = np.frombuffer(binary, dtype='<' + fmt,
                            count=count * n, offset=base)
        out = arr.reshape(count, n).astype(float)
    else:
        for i in range(count):
            arr = np.frombuffer(binary, dtype='<' + fmt, count=n,
                                offset=base + i * stride)
            out[i] = arr
    return out


def quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ], dtype=float)


def trs_matrix(node):
    m = np.eye(4)
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=float).reshape(4, 4).T
    t = node.get('translation', [0, 0, 0])
    r = node.get('rotation', [0, 0, 0, 1])
    s = node.get('scale', [1, 1, 1])
    m[:3, :3] = quat_to_mat(r) @ np.diag(s)
    m[:3, 3] = t
    return m


def main():
    path = sys.argv[1]
    patterns = [re.compile(p, re.I) for p in sys.argv[2:]]
    gltf, binary = load_glb(path)
    nodes = gltf['nodes']

    def walk(idx, parent_m, parent_name):
        node = nodes[idx]
        name = node.get('name', '')
        local = trs_matrix(node)
        world = parent_m @ local
        for pat in patterns:
            if pat.search(name):
                print(f'=== node[{idx}] {name!r}  parent={parent_name!r}')
                print('  local matrix:')
                for row in np.round(local, 6):
                    print('    ', row)
                print('  world translation:', np.round(world[:3, 3], 4))
                if 'mesh' in node:
                    mesh = gltf['meshes'][node['mesh']]
                    for pi, prim in enumerate(mesh['primitives']):
                        pos_i = prim['attributes']['POSITION']
                        acc = gltf['accessors'][pos_i]
                        lo = np.array(acc['min'], dtype=float)
                        hi = np.array(acc['max'], dtype=float)
                        print(f'  prim{pi} POSITION count={acc["count"]} '
                              f'min={np.round(lo, 4)} max={np.round(hi, 4)} '
                              f'size={np.round(hi - lo, 4)}')
                        verts = read_accessor(gltf, binary, pos_i)
                        wh = np.c_[verts, np.ones(len(verts))] @ world.T
                        mw = wh[:, :3]
                        print('    local  centre', np.round((lo + hi) / 2, 4))
                        print('    world  min  ', np.round(mw.min(axis=0), 4))
                        print('    world  max  ', np.round(mw.max(axis=0), 4))
                        # thin axis in world space tells plate orientation
                        ext = mw.max(axis=0) - mw.min(axis=0)
                        ax = 'XYZ'[int(ext.argmin())]
                        print(f'    world extent {np.round(ext, 4)} '
                              f'thinnest axis = {ax}')
                print()
                break
        for child in node.get('children', []):
            walk(child, world, name)

    scene = gltf.get('scenes', [{}])[gltf.get('scene', 0)]
    for root in scene.get('nodes', []):
        walk(root, np.eye(4), 'SCENE')
    print('--- node names containing cc5/cc6:')
    for i, n in enumerate(nodes):
        if re.search(r'cc\s*0?(5|6)\d', n.get('name', ''), re.I):
            print(f'  [{i}] {n.get("name")}')


if __name__ == '__main__':
    main()
