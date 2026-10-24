"""The Deathmoth: a death's-head hawkmoth the size of a dog. Fuzzy body with
the pale skull on its back, banded abdomen, black compound eyes, feathered
antennae, six dangling legs, and four painted wings (texture drawn in game:
see src/entities/deathmoth.js, 'mothWings').

The model's origin is the thorax; the game floats it at hover height.

Run:  python tools/blender/deathmoth.py -- <out.glb> [preview_prefix] [--motion]
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib import (V, Animator, bake_colors, bind_auto, bind_rigid, export_glb, link, make_armature,  # noqa: E402
                 material, preview, region_material, reset, select_only)
from sdf import CLOTH_A, CLOTH_B, OTHER, SDF, SKIN  # noqa: E402

TWO_PI = 2 * math.pi

# wing rectangles (wing-local x outward, z back) and their atlas cells (u0, u1)
FORE = dict(x=(0.03, 0.84), z=(-0.24, 0.24), u=(0.0, 0.5))
HIND = dict(x=(0.03, 0.54), z=(-0.02, 0.38), u=(0.5, 1.0))

BONES = [
    dict(name='body', head=(0, 0, 0.05), tail=(0, 0, -0.08)),
    dict(name='abdomen1', head=(0, 0, 0.09), tail=(0, -0.01, 0.24), parent='body'),
    dict(name='abdomen2', head=(0, -0.01, 0.24), tail=(0, -0.03, 0.42), parent='abdomen1', connect=True),
    dict(name='head', head=(0, 0.0, -0.1), tail=(0, 0.0, -0.21), parent='body'),
]
for s, sx in (('L', 1), ('R', -1)):
    BONES += [
        dict(name=f'fore.{s}', head=(0.06 * sx, 0.04, -0.03), tail=(0.5 * sx, 0.04, -0.06), parent='body'),
        dict(name=f'hind.{s}', head=(0.06 * sx, 0.03, 0.06), tail=(0.36 * sx, 0.03, 0.16), parent='body'),
        dict(name=f'antenna.{s}', head=(0.03 * sx, 0.04, -0.19), tail=(0.12 * sx, 0.12, -0.38), parent='head'),
    ]
    for i, z in enumerate((-0.05, 0.0, 0.05)):
        hip = (0.04 * sx, -0.06, z)
        knee = (0.13 * sx, -0.1, z - 0.06 + i * 0.03)
        foot = (0.16 * sx, -0.24, z - 0.1 + i * 0.07)
        BONES += [
            dict(name=f'leg{i}a.{s}', head=hip, tail=knee, parent='body'),
            dict(name=f'leg{i}b.{s}', head=knee, tail=foot, parent=f'leg{i}a.{s}', connect=True),
        ]


def J(name, end='head'):
    for b in BONES:
        if b['name'] == name:
            return b[end]
    raise KeyError(name)


def sculpt():
    sc = SDF('Deathmoth', voxel=0.0025, k=0.02)
    # ---- thorax: fuzzy, with the pale skull on its back
    sc.ellipsoid((0, 0.0, -0.01), (0.115, 0.1, 0.125), k=0.03)
    with sc.tagged(CLOTH_A):
        sc.ellipsoid((0, 0.072, -0.02), (0.058, 0.035, 0.07), k=0.004)
    with sc.tagged(CLOTH_B):
        for sx in (1, -1):  # the skull's eye sockets
            sc.ellipsoid((0.024 * sx, 0.1, -0.04), (0.016, 0.009, 0.014), k=0.002)
        sc.ellipsoid((0, 0.101, 0.002), (0.009, 0.008, 0.012), k=0.002)
    # ---- abdomen: broad segments, yellow at the sides, black bands and a dark spine
    segs = 7
    for i in range(segs):
        t = i / (segs - 1)
        z = 0.1 + t * 0.32
        r = 0.09 * (1 - 0.55 * t ** 1.6)
        y = -0.01 - 0.035 * t
        sc.ellipsoid((0, y, z), (r, r * 0.92, 0.04), k=0.012, tag=CLOTH_A if i % 2 == 0 else CLOTH_B)
    sc.cone((0, 0.0, 0.08), (0, -0.04, 0.42), 0.075, 0.025, k=0.02, tag=CLOTH_B)
    with sc.tagged(CLOTH_B):  # dorsal stripe
        sc.cone((0, 0.07, 0.1), (0, 0.02, 0.4), 0.02, 0.008, k=0.01)
    # ---- head, eyes, palps, antennae
    sc.ellipsoid((0, -0.005, -0.135), (0.07, 0.062, 0.055), k=0.02)
    with sc.tagged(CLOTH_B):
        for sx in (1, -1):
            sc.ball((0.048 * sx, 0.0, -0.155), 0.036, k=0.004)  # compound eyes
    sc.ellipsoid((0, -0.04, -0.17), (0.025, 0.03, 0.02), k=0.01)  # palps
    sc.tube([(0, -0.06, -0.165), (0, -0.09, -0.15), (0, -0.095, -0.12), (0, -0.08, -0.115)], [0.006, 0.005, 0.004, 0.003], k=0.003,
            tag=OTHER)  # curled proboscis
    with sc.tagged(OTHER):
        for sx in (1, -1):
            a, b = J(f'antenna.{sx > 0 and "L" or "R"}'), J(f'antenna.{sx > 0 and "L" or "R"}', 'tail')
            sc.cone(a, b, 0.006, 0.003, k=0.004)
            for j in range(10):  # feathered comb
                t = 0.1 + j * 0.085
                p = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
                L = 0.028 * math.sin(math.pi * min(1.0, t * 1.1))
                for side in (-1, 1):
                    q = (p[0] + 0.25 * L * side * sx, p[1] - 0.6 * L, p[2] + 0.5 * L * side)
                    sc.cone(p, q, 0.0022, 0.0012, k=0.0015)
    # ---- legs: thin, jointed, spiny
    with sc.tagged(OTHER):
        for s in ('L', 'R'):
            for i in range(3):
                h, k_, f = J(f'leg{i}a.{s}'), J(f'leg{i}b.{s}'), J(f'leg{i}b.{s}', 'tail')
                sc.cone(h, k_, 0.012, 0.009, k=0.008)
                sc.ball(k_, 0.01, k=0.004)
                sc.cone(k_, f, 0.008, 0.004, k=0.004)
                for j in range(3):
                    t = 0.3 + j * 0.22
                    p = tuple(k_[n] + (f[n] - k_[n]) * t for n in range(3))
                    sc.cone(p, (p[0] * 1.08, p[1] - 0.012, p[2] + 0.01), 0.0025, 0.001, k=0.001)
    body = sc.build(faces=7000, smooth_iters=1, smooth_lambda=0.3, lumpy=0.0025, lumpy_scale=90)
    return body, sc


def wing_mesh(name, spec, sx, camber):
    """Rectangle grid (the texture's alpha cuts the real outline), slightly cupped."""
    nx, nz = 10, 7
    x0, x1 = spec['x']
    z0, z1 = spec['z']
    u0, u1 = spec['u']
    verts = []
    uvs = []
    for j in range(nz + 1):
        for i in range(nx + 1):
            a = i / nx
            c = j / nz
            x = x0 + (x1 - x0) * a
            z = z0 + (z1 - z0) * c
            y = camber * math.sin(a * math.pi) * math.sin(c * math.pi) - 0.02 * a * a
            verts.append((x * sx, y + spec.get('y', 0.04), z))
            uvs.append((u0 + (u1 - u0) * a, 1 - c))
    faces = []
    for j in range(nz):
        for i in range(nx):
            q = j * (nx + 1) + i
            quad = (q, q + 1, q + nx + 2, q + nx + 1)
            faces.append(quad if sx < 0 else quad[::-1])
    me = bpy.data.meshes.new(name)
    me.from_pydata([V(*p) for p in verts], [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    for li, loop in enumerate(me.loops):
        uvl.data[li].uv = uvs[loop.vertex_index]
    me.validate()
    ob = link(bpy.data.objects.new(name, me))
    select_only(ob)
    bpy.ops.object.shade_smooth()
    return ob


def make_wings(arm):
    obs = []
    for s, sx in (('L', 1), ('R', -1)):
        for spec, bone, camber in ((dict(FORE, y=0.045), f'fore.{s}', 0.025), (dict(HIND, y=0.035), f'hind.{s}', 0.015)):
            ob = wing_mesh(f'Wing_{bone}', spec, sx, camber)
            material(ob, 'wing')
            bind_rigid(ob, arm, lambda p, b=bone: [(b, 1.0)])
            obs.append(ob)
    # merge into one mesh (one draw call in game)
    select_only(*obs, active=obs[0])
    bpy.ops.object.join()
    obs[0].name = 'Wings'
    return obs[0]


# ----------------------------------------------------------------------- animation

def animations(arm):
    A = Animator(arm)

    def flight(t, k=1.0, reach=0.0):
        ph = t * TWO_PI
        flap = math.sin(ph)
        p = {
            'body': (0.06 * math.sin(ph + 1.0), 0, 0),
            'abdomen1': (-0.12 * math.sin(ph + 0.6) * k - 0.25 * reach, 0, 0),
            'abdomen2': (-0.1 * math.sin(ph + 0.2) * k - 0.3 * reach, 0, 0),
            'head': (0.05 * math.sin(ph + 1.6), 0, 0),
            '@body': (0, -0.03 * flap * k, 0),
        }
        for s, sx in (('L', 1), ('R', -1)):
            up = 0.15 + 0.85 * flap * k
            p[f'fore.{s}'] = (0.05 * math.cos(ph), 0.15 * math.cos(ph) * sx, up * sx)
            p[f'hind.{s}'] = (0, 0.1 * math.cos(ph - 0.4) * sx, (0.12 + 0.75 * math.sin(ph - 0.35) * k) * sx)
            p[f'antenna.{s}'] = (0.1 * math.sin(ph * 2 + sx), 0.08 * math.sin(ph + sx) * sx, 0)
            for i in range(3):
                sway = 0.15 * math.sin(ph + i * 0.8)
                p[f'leg{i}a.{s}'] = (0.3 * reach + sway * 0.5, 0, (-0.25 + 0.4 * reach) * sx)
                p[f'leg{i}b.{s}'] = (0.7 * reach + sway, 0, 0)
        return p

    A.action('fly', 12, lambda t: flight(t))
    A.action('attack', 10, lambda t: flight(t, 1.15, reach=1.0))

    def glide(t):
        # a slow drift on outstretched wings with an occasional shiver
        p = flight(t * 0.0 + 0.25, 0.25)
        ph = t * TWO_PI
        shiver = math.exp(-((t - 0.7) / 0.04) ** 2)
        for s, sx in (('L', 1), ('R', -1)):
            p[f'fore.{s}'] = (0, 0, (0.08 + 0.1 * math.sin(ph) + 0.2 * shiver * math.sin(ph * 30)) * sx)
            p[f'hind.{s}'] = (0, 0, (0.05 + 0.08 * math.sin(ph - 0.3)) * sx)
        return p

    A.action('glide', 60, glide)
    return A


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else os.path.join(os.path.dirname(__file__), '../../src/assets/creatures/deathmoth.glb')
    prev = args[1] if len(args) > 1 and not args[1].startswith('--') else None
    reset()
    body, sc = sculpt()
    arm = make_armature('MothRig', BONES)
    bake_colors(body, region=sc.region_sampler(), ao_dist=0.05, rays=32, ao_strength=0.7, mottle=0.18, mottle_scale=40)
    region_material(body, 'body', [(0.36, 0.29, 0.22), (0.78, 0.68, 0.4), (0.05, 0.04, 0.035), (0.2, 0.15, 0.1)])
    bind_auto(body, arm)
    wings = make_wings(arm)
    animations(arm)
    export_glb(out, [body, wings, arm])
    if prev and '--motion' in args:
        for act in ('fly', 'attack'):
            n = int(bpy.data.actions[act].frame_range[1])
            for i in range(4):
                preview(f'{prev}_m_{act}_{i}', [body, wings], arm=arm, action=act, frame=int(n * i / 4), views=((0.0, 0.3),), size=256)
    elif prev:
        preview(prev + '_rest', [body, wings], views=((0.0, 0.5), (0.8, 0.25), (math.pi / 2, 0.05), (math.pi, 1.2)))
        preview(prev + '_head', [body], views=((0.3, 0.3), (2.6, 0.6)), focus=((0, 0, -0.05), 0.2))


main()
