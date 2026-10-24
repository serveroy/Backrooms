"""The thing beneath Level 7: a vast eel-like body, an angular head with a
pale eye, needle teeth jutting past a closed jaw, a spined dorsal ridge,
wing-like fins and a row of faint photophores along its flanks.

Modelled at 1/10 scale (3.4 m); the game scales it up tenfold.

Run:  python tools/blender/leviathan.py -- <out.glb> [preview_prefix] [--motion]
"""

import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib import Animator, bake_colors, bind_auto, bind_rigid, export_glb, make_armature, material, mesh_from_data, preview, region_material, reset  # noqa: E402
from sdf import CLOTH_A, CLOTH_B, OTHER, SDF, SKIN  # noqa: E402

TWO_PI = 2 * math.pi
TAIL = [(-0.6 + i * 0.32) for i in range(8)]  # z of tail joints, body -> tip (1.64)

BONES = [
    dict(name='body', head=(0, 0, -0.6), tail=(0, 0, -0.9)),
    dict(name='neck', head=(0, 0, -0.9), tail=(0, 0.01, -1.15), parent='body', connect=True),
    dict(name='head', head=(0, 0.01, -1.15), tail=(0, 0.03, -1.75), parent='neck', connect=True),
    dict(name='jaw', head=(0, -0.06, -1.1), tail=(0, -0.1, -1.72), parent='head'),
    dict(name='fin.L', head=(0.2, -0.07, -0.78), tail=(0.7, -0.16, -0.55), parent='body'),
    dict(name='fin.R', head=(-0.2, -0.07, -0.78), tail=(-0.7, -0.16, -0.55), parent='body'),
]
for i in range(7):
    BONES.append(dict(name=f'tail{i}', head=(0, 0, TAIL[i]), tail=(0, 0, TAIL[i + 1]),
                      parent='body' if i == 0 else f'tail{i - 1}', connect=i > 0))


def radius(z):
    """Half-width and half-height of the body at z."""
    if z < -1.15:  # head
        t = (z + 1.6) / 0.45
        return 0.1 + 0.08 * t, 0.09 + 0.07 * t
    if z < -0.5:
        t = (z + 1.15) / 0.65
        return 0.18 + 0.1 * math.sin(t * math.pi / 2), 0.16 + 0.12 * math.sin(t * math.pi / 2)
    t = (z + 0.5) / 2.15
    return 0.28 * (1 - t) ** 1.3 + 0.012, 0.28 * (1 - t) ** 1.1 + 0.02


def sculpt():
    sc = SDF('Leviathan', voxel=0.007, k=0.08)
    rnd = random.Random(7)
    # ---- body: a chain of overlapping ellipsoids
    z = -1.15
    while z < 1.66:
        rx, ry = radius(z)
        sc.ellipsoid((0, 0.0, z), (rx, ry, 0.13), k=0.1)
        with sc.tagged(CLOTH_B):  # paler belly
            sc.ellipsoid((0, -ry * 0.55, z), (rx * 0.75, ry * 0.5, 0.13), k=0.06)
        z += 0.09
    # ---- head: long, flat and angular like a pike's, heavy brows, an underbite
    HW = lambda z, w, c, L: w * math.sqrt(max(0.0, 1 - ((z - c) / L) ** 2))  # noqa: E731
    sc.ellipsoid((0, 0.03, -1.36), (0.14, 0.095, 0.34), k=0.08)
    sc.ellipsoid((0, 0.035, -1.62), (0.075, 0.045, 0.16), k=0.05)  # snout
    sc.ellipsoid((0, -0.075, -1.4), (0.125, 0.055, 0.34), k=0.03)  # jaw, jutting past the snout
    for sx in (1, -1):
        sc.ellipsoid((0.1 * sx, 0.1, -1.28), (0.055, 0.025, 0.11), rot=(0, 0.2 * sx, 0), k=0.03)  # brow
        sc.ball((0.12 * sx, 0.055, -1.28), 0.042, k=0.02, carve=True)  # eye socket
        with sc.tagged(CLOTH_A):
            sc.ball((0.11 * sx, 0.055, -1.28), 0.032, k=0.004)  # the pale eye
        for g in range(4):  # gill slits
            zg = -0.98 + g * 0.06
            sc.cone((0.19 * sx, 0.06, zg), (0.21 * sx, -0.06, zg + 0.02), 0.008, 0.008, k=0.01, carve=True)
        # the mouth: a long seam down each side
        sc.cone((0.135 * sx, -0.035, -1.1), (0.03 * sx, -0.03, -1.74), 0.009, 0.006, k=0.006, carve=True)
    # needle teeth along the seam, jutting up and down past the closed mouth
    with sc.tagged(OTHER):
        for sx in (1, -1):
            for i in range(11):
                t = i / 10
                zt = -1.7 + t * 0.55
                xt = (HW(zt, 0.125, -1.4, 0.34) + 0.004) * sx
                L = 0.04 + 0.07 * math.sin(t * math.pi) + rnd.uniform(-0.01, 0.02)
                lean = rnd.uniform(-0.2, 0.2)
                sc.cone((xt * 0.9, -0.045, zt), (xt * 1.06, -0.045 + L, zt + lean * L), 0.008, 0.0012, k=0.004)
                if i % 2:
                    sc.cone((xt * 0.88, -0.02, zt + 0.02), (xt * 1.05, -0.02 - L * 0.8, zt + lean * L), 0.007, 0.0012, k=0.004)
    # ---- dorsal ridge of spines webbed with skin
    for i in range(26):
        z = -1.05 + i * 0.1
        rx, ry = radius(z)
        h = 0.1 * math.sin(min(1.0, (i + 1) / 26) * math.pi) + 0.03
        sc.cone((0, ry * 0.85, z), (0, ry + h, z + 0.06), 0.012, 0.002, k=0.015)
    sc.ellipsoid((0, radius(0.0)[1] + 0.02, 0.0), (0.008, 0.05, 1.0), k=0.04)
    # ---- pectoral fins: long, ribbed, trailing back
    for sx in (1, -1):
        base = (0.2 * sx, -0.07, -0.78)
        tip = (0.72 * sx, -0.17, -0.5)
        sc.ellipsoid(((base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, -0.62), (0.28, 0.012, 0.16), rot=(0, -0.45 * sx, -0.2 * sx), k=0.04)
        for r in range(5):
            a = -0.4 + r * 0.2
            end = (tip[0] - 0.05 * sx * r, tip[1], tip[2] + a * 0.3 + 0.08)
            sc.cone(base, end, 0.012, 0.003, k=0.01)
    # ---- tail fin
    sc.ellipsoid((0, 0.06, 1.62), (0.012, 0.22, 0.14), rot=(-0.4, 0, 0), k=0.03)
    sc.ellipsoid((0, -0.08, 1.6), (0.012, 0.14, 0.1), rot=(0.4, 0, 0), k=0.03)
    return sc.build(faces=8000, smooth_iters=2, smooth_lambda=0.35, lumpy=0.004, lumpy_scale=12), sc


def photophores(arm):
    """Faint glowing dots along the lateral line (a separate glow mesh)."""
    verts = []
    faces = []
    owner = []
    for sx in (1, -1):
        for i in range(30):
            z = -1.0 + i * 0.085
            rx, ry = radius(z)
            c = (rx * 1.0 * sx, -ry * 0.15, z)
            s = 0.012 * (1 - i / 40)
            base = len(verts)
            # small octahedron
            for d in ((s, 0, 0), (-s, 0, 0), (0, s, 0), (0, -s, 0), (0, 0, s), (0, 0, -s)):
                verts.append((c[0] + d[0], c[1] + d[1], c[2] + d[2]))
            for f in ((0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)):
                faces.append(tuple(base + x for x in f))
            seg = 'body' if z < TAIL[0] else f'tail{min(6, int((z - TAIL[0]) / 0.32))}'
            owner += [seg] * 6
    ob = mesh_from_data('Glow', verts, faces)
    material(ob, 'glow')
    it = iter(owner)
    bind_rigid(ob, arm, lambda p: [(next(it), 1.0)])
    return ob


def animations(arm):
    A = Animator(arm)

    def swim(t, k=1.0, jaw=0.0):
        ph = t * TWO_PI
        p = {
            'body': (0.03 * math.sin(ph), 0.05 * math.sin(ph + 0.3) * k, 0.02 * math.sin(ph)),
            'neck': (0.02 * math.sin(ph + 1), -0.06 * math.sin(ph - 0.2) * k, 0),
            'head': (0.03 * math.sin(ph * 2), -0.05 * math.sin(ph - 0.5) * k, 0),
            'jaw': (-(0.04 + jaw) * (0.6 + 0.4 * math.sin(ph * 0.5)), 0, 0),
            'fin.L': (0.1 * math.sin(ph + 0.5), 0.15 * math.sin(ph), 0.35 * math.sin(ph) * k),
            'fin.R': (0.1 * math.sin(ph + 0.5), -0.15 * math.sin(ph), -0.35 * math.sin(ph) * k),
        }
        for i in range(7):
            amp = (0.1 + 0.04 * i) * k
            p[f'tail{i}'] = (0.02 * math.sin(ph - i * 0.7), amp * math.sin(ph - (i + 1) * 0.75), 0)
        return p

    A.action('swim', 120, lambda t: swim(t))
    A.action('attack', 40, lambda t: swim(t, 1.6, jaw=0.45 * math.sin(min(1.0, t * 1.5) * math.pi)))
    return A


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else os.path.join(os.path.dirname(__file__), '../../src/assets/creatures/leviathan.glb')
    prev = args[1] if len(args) > 1 and not args[1].startswith('--') else None
    reset()
    body, sc = sculpt()
    arm = make_armature('LeviathanRig', BONES)
    bake_colors(body, region=sc.region_sampler(), ao_dist=0.12, rays=32, ao_strength=0.8, mottle=0.2, mottle_scale=10)
    region_material(body, 'body', [(0.12, 0.14, 0.16), (0.75, 0.78, 0.7), (0.22, 0.24, 0.25), (0.6, 0.58, 0.5)])
    bind_auto(body, arm)
    glow = photophores(arm)
    animations(arm)
    export_glb(out, [body, glow, arm])
    if prev and '--motion' in args:
        for act in ('swim', 'attack'):
            n = int(bpy.data.actions[act].frame_range[1])
            for i in range(4):
                preview(f'{prev}_m_{act}_{i}', [body], arm=arm, action=act, frame=int(n * i / 4), views=((0.0, 1.3),), size=256)
    elif prev:
        preview(prev + '_rest', [body, glow], views=((math.pi / 2, 0.15), (0.5, 0.3), (2.5, 0.5), (0.0, 1.4)))
        preview(prev + '_head', [body], views=((0.6, 0.2), (1.4, -0.2)), focus=((0, 0, -1.3), 0.4))


main()
