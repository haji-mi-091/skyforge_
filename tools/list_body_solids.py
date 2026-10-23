"""Summarise every Body_2-1_cc* sub-solid: bbox, extent, thinnest axis."""
import re
import sys

import numpy as np

sys.path.insert(0, 'tools')
from inspect_doors import load_glb, read_accessor, trs_matrix  # noqa: E402


def main():
    gltf, binary = load_glb('assets/models/f16/f16_cad.glb')
    nodes = gltf['nodes']
    print(f'{"node":32s} {"verts":>6s}  {"X range":>18s} {"Y range":>18s} '
          f'{"Z range":>18s}  {"size":>18s} thin')
    for node in nodes:
        name = node.get('name', '')
        m = re.search(r'Body_2-1_cc(\d+)$', name)
        if not m or 'mesh' not in node:
            continue
        tf = trs_matrix(node)
        prim = gltf['meshes'][node['mesh']]['primitives'][0]
        v = read_accessor(gltf, binary, prim['attributes']['POSITION'])
        v = (np.c_[v, np.ones(len(v))] @ tf.T)[:, :3]
        lo, hi = v.min(axis=0), v.max(axis=0)
        size = hi - lo
        thin = 'XYZ'[int(size.argmin())]
        zc = (lo[2] + hi[2]) / 2
        region = ('nose' if zc < -1.2 else 'mid' if zc < 0.9 else 'aft')
        print(f'{name.replace("BodyAssy - ", ""):24s} cc{m.group(1):>3s} '
              f'{len(v):>6d}  '
              f'[{lo[0]:>6.2f},{hi[0]:>6.2f}] '
              f'[{lo[1]:>6.2f},{hi[1]:>6.2f}] '
              f'[{lo[2]:>6.2f},{hi[2]:>6.2f}]  '
              f'[{size[0]:>5.2f},{size[1]:>5.2f},{size[2]:>5.2f}] '
              f'{thin} {region}')


if __name__ == '__main__':
    main()
