"""Replicate JetModel._extractCadGearDoors maths offline so hinge/axis/angle
can be inspected without a browser."""
import re
import sys

import numpy as np

sys.path.insert(0, 'tools')
from inspect_doors import load_glb, read_accessor, trs_matrix  # noqa: E402


def main():
    gltf, binary = load_glb('assets/models/f16/f16_cad.glb')
    nodes = gltf['nodes']

    def find(cc):
        pat = re.compile(rf'cc0?{cc}(?!\d)', re.I)
        for i, n in enumerate(nodes):
            if pat.search(n.get('name', '')):
                return i, n
        return None, None

    specs = [
        (51, 'main', -1), (53, 'main', 1), (61, 'front', -1), (62, 'front', 1),
    ]
    for cc, kind, side in specs:
        idx, node = find(cc)
        if node is None:
            print(f'cc{cc}: MISSING')
            continue
        m = trs_matrix(node)
        prim = gltf['meshes'][node['mesh']]['primitives'][0]
        verts = read_accessor(gltf, binary, prim['attributes']['POSITION'])
        verts = (np.c_[verts, np.ones(len(verts))] @ m.T)[:, :3]
        lo, hi = verts.min(axis=0), verts.max(axis=0)
        inner_x = hi[0] if side < 0 else lo[0]
        outer_x = lo[0] if side < 0 else hi[0]

        top = verts[(np.abs(verts[:, 1] - hi[1]) < 0.015)
                    & (np.abs(verts[:, 0] - inner_x) < 0.05)]
        bottom = verts[(np.abs(verts[:, 1] - lo[1]) < 0.015)
                       & (np.abs(verts[:, 0] - outer_x) < 0.05)]

        print(f'--- cc{cc}  {kind} side={side}  verts={len(verts)}')
        print(f'    bbox min {np.round(lo, 4)} max {np.round(hi, 4)}')
        print(f'    size     {np.round(hi - lo, 4)}')
        print(f'    innerX {inner_x:.4f}  outerX {outer_x:.4f}')
        print(f'    top-edge verts    n={len(top)}')
        print(f'    bottom-edge verts n={len(bottom)}')
        if len(top) >= 2:
            lo_z = top[top[:, 2].argmin()]
            hi_z = top[top[:, 2].argmax()]
            hinge = (lo_z + hi_z) / 2
            axis = hi_z - lo_z
            axis = axis / np.linalg.norm(axis)
            if axis[2] < 0:
                axis = -axis
            path = 'measured top edge'
        else:
            hinge = np.array([inner_x, hi[1] - 0.005, (lo[2] + hi[2]) / 2])
            axis = np.array([0.0, 0.0, 1.0])
            path = 'FALLBACK'
        if len(bottom):
            free = bottom.mean(axis=0)
        else:
            free = np.array([outer_x, lo[1], (lo[2] + hi[2]) / 2])
        closed = np.arctan2(max(abs(free[1] - hinge[1]), 0.001),
                            max(abs(free[0] - hinge[0]), 0.001))
        print(f'    hinge {np.round(hinge, 4)}  axis {np.round(axis, 4)}')
        print(f'    free  {np.round(free, 4)}  delta {np.round(free - hinge, 4)}')
        print(f'    angle path={path}  closedAngle={closed:.4f} rad '
              f'({np.degrees(closed):.1f} deg)')
        # which way does a positive rotation about the axis move the free edge?
        h = hinge
        r = axis
        c, s = np.cos(0.2), np.sin(0.2)
        v = free - h
        rot = (v * c + np.cross(r, v) * s + r * np.dot(r, v) * (1 - c))
        print(f'    +0.2 rad moves free edge by {np.round(rot - v, 4)} '
              f'(dy={rot[1] - v[1]:+.4f})')
        print()


if __name__ == '__main__':
    main()
