"""Find the rotation angle that actually closes the nose-gear door.

Builds a height field of the fuselage underside from the body mesh, then sweeps
the door's hinge rotation and reports how far the panel still hangs below the
skin. The closing angle is where that protrusion reaches zero — i.e. the panel
has rotated up onto the belly line instead of dangling under it.

    python tools/solve_door_pose.py [cc61]
"""
import re
import sys

import numpy as np

sys.path.insert(0, 'tools')
from inspect_doors import load_glb, read_accessor, trs_matrix  # noqa: E402

DOORS = {'cc61': -1, 'cc62': 1}   # side
X_RANGE = (-1.00, 1.00, 0.02)
Z_RANGE = (-2.70, -1.05, 0.02)


def verts_of(gltf, binary, nodes, pattern):
    for node in nodes:
        if re.search(pattern, node.get('name', ''), re.I) and 'mesh' in node:
            m = trs_matrix(node)
            v = read_accessor(gltf, binary,
                              gltf['meshes'][node['mesh']]['primitives'][0]
                              ['attributes']['POSITION'])
            return (np.c_[v, np.ones(len(v))] @ m.T)[:, :3]
    return None


def height_field(body):
    xs = np.arange(*X_RANGE)
    zs = np.arange(*Z_RANGE)
    field = np.full((len(xs), len(zs)), np.nan)
    low = body[body[:, 1] < -0.9]
    ix = np.clip(np.searchsorted(xs, low[:, 0]) - 1, 0, len(xs) - 1)
    iz = np.clip(np.searchsorted(zs, low[:, 2]) - 1, 0, len(zs) - 1)
    for i, j, y in zip(ix, iz, low[:, 1]):
        if np.isnan(field[i, j]) or y < field[i, j]:
            field[i, j] = y
    # Fill empty cells (the bay is a hole in the mesh) by neighbour dilation so
    # the rim height is carried across the opening.
    for _ in range(60):
        if not np.isnan(field).any():
            break
        padded = np.pad(field, 1, mode='edge')
        stack = np.stack([
            padded[0:-2, 1:-1], padded[2:, 1:-1],
            padded[1:-1, 0:-2], padded[1:-1, 2:],
        ])
        with np.errstate(invalid='ignore'):
            filled = np.nanmean(stack, axis=0)
        mask = np.isnan(field) & ~np.isnan(filled)
        field[mask] = filled[mask]
    return xs, zs, field


def sample(xs, zs, field, pts):
    ix = np.clip(np.searchsorted(xs, pts[:, 0]) - 1, 0, len(xs) - 1)
    iz = np.clip(np.searchsorted(zs, pts[:, 2]) - 1, 0, len(zs) - 1)
    return field[ix, iz]


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'cc61'
    gltf, binary = load_glb('assets/models/f16/f16_cad.glb')
    nodes = gltf['nodes']
    body = verts_of(gltf, binary, nodes, r'Body_2-1_cc52$')
    door = verts_of(gltf, binary, nodes, rf'Body_2-1_{which}$')
    xs, zs, field = height_field(body)

    # Hinge measured by the shipped code: inner/top edge, axis ~Z.
    box = np.array([door.min(axis=0), door.max(axis=0)])
    inner_x = box[1][0] if DOORS[which] < 0 else box[0][0]
    top = door[(np.abs(door[:, 1] - box[1][1]) < 0.015)
               & (np.abs(door[:, 0] - inner_x) < 0.05)]
    hinge = np.array([(top[:, 0].min() + top[:, 0].max()) / 2,
                      (top[:, 1].min() + top[:, 1].max()) / 2])
    print(f'{which}: hinge ({hinge[0]:+.4f}, {hinge[1]:+.4f})  '
          f'vertices {len(door)}')

    skin = sample(xs, zs, field, door)
    print(f'  CAD pose: panel hangs up to '
          f'{np.nanmax(skin - door[:, 1]) * 1000:.0f} mm below the skin '
          f'(mean {np.nanmean(skin - door[:, 1]) * 1000:.0f} mm)')

    print(f'\n{"angle":>7} {"max below":>10} {"mean below":>11} {"x extent":>18}')
    rows = []
    for deg in range(-120, 121, 5):
        a = np.deg2rad(deg)
        c, s = np.cos(a), np.sin(a)
        p = door[:, :2] - hinge
        rot = np.c_[p[:, 0] * c - p[:, 1] * s, p[:, 0] * s + p[:, 1] * c] + hinge
        moved = np.c_[rot, door[:, 2]]
        s_now = sample(xs, zs, field, moved)
        below = s_now - moved[:, 1]
        rows.append((deg, np.nanmax(below), np.nanmean(below),
                     moved[:, 0].min(), moved[:, 0].max()))
        print(f'{deg:7.0f} {np.nanmax(below) * 1000:9.0f}mm '
              f'{np.nanmean(below) * 1000:10.0f}mm '
              f'[{moved[:, 0].min():+.3f},{moved[:, 0].max():+.3f}]')

    # Smallest |angle| whose panel no longer hangs below the skin.
    ok = [r for r in rows if r[1] <= 0.005]
    if ok:
        best = min(ok, key=lambda r: abs(r[0]))
        print(f'\nfirst angle that clears the skin: {best[0]:+.0f} deg '
              f'({np.deg2rad(abs(best[0])):.3f} rad)')
    else:
        print('\nno angle clears the skin on this hinge line')


if __name__ == '__main__':
    main()
