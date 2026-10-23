"""Is the CAD nose-door pose flush with the fuselage, or already hanging out?

Measures the body surface under the nose-gear bay station and compares it with
the door plate, so "closed" is decided by geometry rather than by the door's
own bounding box.
"""
import re
import sys

import numpy as np

sys.path.insert(0, 'tools')
from inspect_doors import load_glb, read_accessor, trs_matrix  # noqa: E402


def main():
    gltf, binary = load_glb('assets/models/f16/f16_cad.glb')
    nodes = gltf['nodes']

    def verts_of(name_re):
        for node in nodes:
            if not re.search(name_re, node.get('name', ''), re.I):
                continue
            if 'mesh' not in node:
                continue
            m = trs_matrix(node)
            v = read_accessor(gltf, binary,
                              gltf['meshes'][node['mesh']]['primitives'][0]
                              ['attributes']['POSITION'])
            return (np.c_[v, np.ones(len(v))] @ m.T)[:, :3]
        return None

    body = verts_of(r'Body_2-1_cc52$')
    door_l = verts_of(r'Body_2-1_cc61$')
    door_r = verts_of(r'Body_2-1_cc62$')

    # Nose-gear bay station (doors span z -2.42 .. -1.32).
    z0, z1 = -2.45, -1.30
    # Only the centre fuselage, excluding wings and the intake.
    near = body[(body[:, 2] > z0) & (body[:, 2] < z1) & (np.abs(body[:, 0]) < 0.45)]

    print(f'body verts in bay station z[{z0},{z1}], |x|<0.45 : {len(near)}')
    print(f'  body  y min {near[:, 1].min():.4f}  y max {near[:, 1].max():.4f}')

    # Bottom surface profile: for x slices, the lowest body vertex near x=0.
    print('  body bottom by |x| band:')
    for lo, hi in [(0.0, 0.10), (0.10, 0.20), (0.20, 0.30), (0.30, 0.45)]:
        band = near[(np.abs(near[:, 0]) >= lo) & (np.abs(near[:, 0]) < hi)]
        if len(band):
            print(f'    |x| {lo:.2f}-{hi:.2f}: yMin {band[:, 1].min():.4f} '
                  f'(n={len(band)})')

    for label, door in (('cc61 L', door_l), ('cc62 R', door_r)):
        print(f'{label}: y min {door[:, 1].min():.4f}  y max {door[:, 1].max():.4f} '
              f' x[{door[:, 0].min():.3f},{door[:, 0].max():.3f}]')

    # The decisive comparison: does the door plate hang below the body skin?
    body_bottom = near[:, 1].min()
    door_bottom = min(door_l[:, 1].min(), door_r[:, 1].min())
    print()
    print(f'body bottom under the bay : {body_bottom:.4f}')
    print(f'door lowest point         : {door_bottom:.4f}')
    print(f'door hangs below skin by  : {body_bottom - door_bottom:.4f} m')

    # Same question per door vertex: nearest body vertex distance (crude but
    # shows whether the plate is embedded in the skin or standing off it).
    for label, door in (('cc61 L', door_l), ('cc62 R', door_r)):
        sample = door[::8]
        gaps = []
        for point in sample:
            near_z = body[np.abs(body[:, 2] - point[2]) < 0.05]
            if not len(near_z):
                continue
            d = np.linalg.norm(near_z - point, axis=1).min()
            gaps.append(d)
        gaps = np.array(gaps)
        print(f'{label}: nearest-body distance  min {gaps.min():.4f}  '
              f'median {np.median(gaps):.4f}  max {gaps.max():.4f}')


if __name__ == '__main__':
    main()
