"""The Hound: a starved human that runs on all fours, grey skin pulled over
ribs and spine, long black matted hair hanging over a face with pitch-black
eye hollows.

Run:  python tools/blender/hound.py -- <out.glb> [preview_prefix] [--motion]
"""

import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib import Animator, bake_colors, bind_auto, export_glb, make_armature, preview, region_material, reset  # noqa: E402
from sdf import CLOTH_A, CLOTH_B, OTHER, SDF, SKIN  # noqa: E402

TWO_PI = 2 * math.pi


def side_bones():
    B = []
    for s, sx in (('L', 1), ('R', -1)):
        B += [
            dict(name=f'clavicle.{s}', head=(0.03 * sx, 0.64, -0.2), tail=(0.15 * sx, 0.62, -0.22), parent='spine3'),
            dict(name=f'upperarm.{s}', head=(0.15 * sx, 0.62, -0.22), tail=(0.2 * sx, 0.34, -0.25), parent=f'clavicle.{s}', connect=True),
            dict(name=f'forearm.{s}', head=(0.2 * sx, 0.34, -0.25), tail=(0.19 * sx, 0.07, -0.25), parent=f'upperarm.{s}', connect=True),
            dict(name=f'hand.{s}', head=(0.19 * sx, 0.07, -0.25), tail=(0.19 * sx, 0.02, -0.33), parent=f'forearm.{s}', connect=True),
            dict(name=f'fingers.{s}', head=(0.19 * sx, 0.02, -0.33), tail=(0.19 * sx, 0.01, -0.42), parent=f'hand.{s}', connect=True),
            dict(name=f'thigh.{s}', head=(0.1 * sx, 0.6, 0.3), tail=(0.15 * sx, 0.33, 0.06), parent='hips'),
            dict(name=f'shin.{s}', head=(0.15 * sx, 0.33, 0.06), tail=(0.14 * sx, 0.1, 0.4), parent=f'thigh.{s}', connect=True),
            dict(name=f'foot.{s}', head=(0.14 * sx, 0.1, 0.4), tail=(0.14 * sx, 0.016, 0.3), parent=f'shin.{s}', connect=True),
            dict(name=f'toes.{s}', head=(0.14 * sx, 0.016, 0.3), tail=(0.14 * sx, 0.01, 0.235), parent=f'foot.{s}', connect=True),
        ]
    return B


BONES = [
    dict(name='hips', head=(0, 0.6, 0.3), tail=(0, 0.63, 0.16)),
    dict(name='spine1', head=(0, 0.63, 0.16), tail=(0, 0.66, 0.0), parent='hips', connect=True),
    dict(name='spine2', head=(0, 0.66, 0.0), tail=(0, 0.65, -0.16), parent='spine1', connect=True),
    dict(name='spine3', head=(0, 0.65, -0.16), tail=(0, 0.62, -0.27), parent='spine2', connect=True),
    dict(name='neck', head=(0, 0.62, -0.27), tail=(0, 0.575, -0.39), parent='spine3', connect=True),
    dict(name='head', head=(0, 0.575, -0.39), tail=(0, 0.5, -0.56), parent='neck', connect=True),
    dict(name='hair1', head=(0, 0.6, -0.48), tail=(0, 0.4, -0.53), parent='head'),
    dict(name='hair2', head=(0, 0.4, -0.53), tail=(0, 0.2, -0.55), parent='hair1', connect=True),
] + side_bones()


def J(name, end='head'):
    for b in BONES:
        if b['name'] == name:
            return b[end]
    raise KeyError(name)


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def add(a, b):
    return tuple(a[i] + b[i] for i in range(3))


def sculpt():
    sc = SDF('Hound', voxel=0.003, k=0.02)
    # ---- trunk: a narrow, bony barrel slung between the shoulders and hips
    with sc.blend(0.035):
        sc.ellipsoid((0, 0.6, 0.27), (0.115, 0.085, 0.1))
        sc.cone((0, 0.62, 0.24), (0, 0.65, -0.02), 0.068, 0.078)
        sc.ellipsoid((0, 0.635, -0.13), (0.121, 0.103, 0.165))
    with sc.blend(0.015):
        for sx in (1, -1):
            sc.ball((0.075 * sx, 0.63, 0.33), 0.045)  # hip bones
            sc.ellipsoid((0.085 * sx, 0.72, -0.17), (0.055, 0.016, 0.075), rot=(0.1, 0, 0.35 * sx))  # shoulder blades
    with sc.blend(0.012):
        for i in range(8):  # ribs wrapping round from the spine to the breastbone
            z = -0.24 + i * 0.04
            rx = 0.122 - abs(i - 3) * 0.006
            ry = 0.103 - abs(i - 3) * 0.004
            for sx in (1, -1):
                pts = []
                for j in range(8):
                    a = 0.12 * math.pi + (j / 7) * 0.8 * math.pi
                    pts.append((math.sin(a) * rx * sx, 0.635 + math.cos(a) * ry, z + j * 0.008))
                sc.tube(pts, [0.0075] * len(pts))
        for i in range(18):  # spine ridge
            t = i / 17
            z = 0.32 - t * 0.6
            y = 0.68 + 0.035 * math.sin(t * math.pi) + (0.02 if t < 0.15 else 0)
            sc.ball((0, y, z), 0.017 - 0.004 * t)
    # ---- neck, head (hung low, face forward and down)
    sc.cone((0, 0.66, -0.22), (0, 0.585, -0.4), 0.048, 0.042, k=0.02)
    for sx in (1, -1):
        sc.cone((0.03 * sx, 0.6, -0.4), (0.04 * sx, 0.62, -0.26), 0.01, 0.011, k=0.01)
    sc.ellipsoid((0, 0.59, -0.46), (0.07, 0.082, 0.09), rot=(0.55, 0, 0), k=0.025)  # cranium
    sc.ellipsoid((0, 0.53, -0.51), (0.055, 0.06, 0.06), rot=(0.55, 0, 0), k=0.025)  # face
    sc.ellipsoid((0, 0.49, -0.5), (0.045, 0.035, 0.045), rot=(0.4, 0, 0), k=0.02)  # jaw
    sc.ball((0, 0.47, -0.53), 0.02, k=0.015)  # chin
    with sc.tagged(CLOTH_B):
        for sx in (1, -1):  # empty black eye hollows
            sc.ellipsoid((0.028 * sx, 0.55, -0.55), (0.017, 0.013, 0.014), rot=(0.55, 0, 0), k=0.006, carve=True, tag=CLOTH_B)
        sc.cone((-0.022, 0.5, -0.555), (0.022, 0.5, -0.555), 0.003, 0.003, k=0.003, carve=True, tag=CLOTH_B)  # mouth
    # ---- front limbs: long bony arms, hands flat, fingers splayed like claws
    for s, sx in (('L', 1), ('R', -1)):
        S, E, W, Hn, F = (J(f'upperarm.{s}'), J(f'forearm.{s}'), J(f'hand.{s}'), J(f'fingers.{s}'), J(f'fingers.{s}', 'tail'))
        sc.ball(S, 0.042, k=0.02)
        sc.cone(S, E, 0.034, 0.026, k=0.012)
        sc.ball(E, 0.028, k=0.008)
        sc.cone(E, W, 0.027, 0.019, k=0.01)
        sc.ellipsoid(lerp3(E, W, 0.3), (0.028, 0.06, 0.026), k=0.012)
        sc.ball(W, 0.02, k=0.008)
        sc.box(lerp3(W, Hn, 0.6), (0.032, 0.012, 0.04), round_=0.01, k=0.01)
        for i in range(4):
            o = (i - 1.5) * 0.017
            base = add(Hn, (o * sx * -1 + o * 0.0, 0.004, 0.0))
            mid = add(base, (o * 0.6, 0.01, -0.04))
            tip = add(mid, (o * 0.5, -0.012, -0.035 - (0.008 if 0 < i < 3 else 0)))
            sc.cone(base, mid, 0.0075, 0.0065, k=0.004)
            sc.cone(mid, tip, 0.0065, 0.004, k=0.003)
            sc.ball(tip, 0.0042, k=0.002, tag=CLOTH_B)  # cracked dark nails
        sc.tube([add(W, (-0.025 * sx, -0.01, -0.04)), add(W, (-0.04 * sx, -0.035, -0.08)), add(W, (-0.045 * sx, -0.05, -0.11))],
                [0.008, 0.0065, 0.0045], k=0.005)
    # ---- hind legs: crouched, heels off the ground
    for s, sx in (('L', 1), ('R', -1)):
        Hp, K, A, Bl, T = (J(f'thigh.{s}'), J(f'shin.{s}'), J(f'foot.{s}'), J(f'toes.{s}'), J(f'toes.{s}', 'tail'))
        sc.cone(Hp, K, 0.058, 0.04, k=0.03)
        sc.ball(K, 0.04, k=0.01)
        sc.cone(K, A, 0.037, 0.023, k=0.012)
        sc.ellipsoid(lerp3(K, A, 0.3), (0.034, 0.075, 0.034), rot=(-0.95, 0, 0), k=0.015)  # calf
        sc.ball(A, 0.026, k=0.008)
        sc.cone(A, Bl, 0.026, 0.024, k=0.012)
        for i in range(5):
            o = (i - 2) * 0.013
            sc.cone(add(Bl, (o * sx, 0, 0)), add(T, (o * sx * 1.3, -0.002, 0.004 * abs(i - 2))), 0.0075, 0.005, k=0.003)
    # ---- hair: a matted black curtain from the crown to the floor
    rnd = random.Random(4)
    with sc.tagged(OTHER):
        with sc.garment(0.007, blur=0.006, k=0.003):
            sc.ellipsoid((0, 0.63, -0.45), (0.095, 0.07, 0.11), rot=(0.55, 0, 0))
        crown = (0, 0.66, -0.45)
        for c in range(17):
            # a matted lock: strands start together at the scalp and fray toward the tips
            a = (c / 17) * TWO_PI + rnd.uniform(-0.15, 0.15)
            el = rnd.uniform(0.35, 1.0)
            dx = math.sin(a) * el
            dz = -math.cos(a) * el
            back = dz > 0.3
            L = rnd.uniform(0.2, 0.3) if back else rnd.uniform(0.34, 0.5)
            for k in range(6):
                jx = rnd.uniform(-0.012, 0.012)
                jz = rnd.uniform(-0.012, 0.012)
                p0 = add(crown, (dx * 0.07 + jx, -0.02 * el, dz * 0.08 + jz))
                pts = [p0]
                x, y, z = add(p0, (dx * 0.04, 0.005, dz * 0.035 - 0.01))
                pts.append((x, y, z))
                end_y = max(0.04, p0[1] - L * rnd.uniform(0.8, 1.05))
                n = 5
                for i in range(1, n + 1):
                    u = i / n
                    spread = 1 + u * (0.5 + rnd.uniform(0, 0.4))
                    wave = 0.012 * math.sin(u * 7 + c + k)
                    pts.append((x * spread + wave + rnd.uniform(-0.006, 0.006) * u,
                                y + (end_y - y) * u,
                                z + dz * 0.03 * u + rnd.uniform(-0.008, 0.008) * u))
                r0 = rnd.uniform(0.0042, 0.0055)
                radii = [r0 * (1 - 0.75 * (i / (len(pts) - 1)) ** 1.5) for i in range(len(pts))]
                sc.tube(pts, radii, k=0.0045)
        for i in range(12):  # a few strands lying along the neck and back
            z = -0.36 + i * 0.02 + rnd.uniform(-0.01, 0.01)
            x = rnd.uniform(-0.04, 0.04)
            sc.tube([(x, 0.66, -0.42), (x * 1.5, 0.68 + rnd.uniform(0, 0.02), z + 0.1), (x * 2.5, 0.62, z + 0.2)], [0.006, 0.005, 0.003], k=0.004)
    return sc.build(faces=12000, smooth_iters=1, smooth_lambda=0.3, lumpy=0.0006, lumpy_scale=24), sc


# ----------------------------------------------------------------------- animation

def swing(f, duty):
    """Limb travel in [-1 (back), 1 (front)] and lift in [0, 1] for gait phase f."""
    if f < duty:
        return 1 - 2 * f / duty, 0.0
    u = (f - duty) / (1 - duty)
    e = u * u * (3 - 2 * u)
    return -1 + 2 * e, math.sin(u * math.pi)


def gait(t, offs, duty, amp, lift, flex=0.0, head=0.0, hair=1.0, speed=1.0):
    p = {}
    ph = t * TWO_PI
    p['spine1'] = (flex * math.sin(ph * 2), 0.05 * math.sin(ph) * (1 - flex * 2), 0)
    p['spine2'] = (-flex * math.sin(ph * 2) * 0.6, -0.05 * math.sin(ph), 0)
    p['spine3'] = (0, -0.03 * math.sin(ph), 0.03 * math.sin(ph))
    p['neck'] = (head, 0.04 * math.sin(ph + 0.6), 0)
    p['head'] = (0.03 * math.sin(ph * 2), -0.04 * math.sin(ph), 0.05 * math.sin(ph))
    p['hair1'] = (0.1 * hair * math.sin(ph * 2 - 0.8) * speed, 0, 0.12 * hair * math.sin(ph - 0.9))
    p['hair2'] = (0.12 * hair * math.sin(ph * 2 - 1.4) * speed, 0, 0.15 * hair * math.sin(ph - 1.5))
    p['@hips'] = (0, 0.012 * math.cos(ph * 2) + (0.03 * flex * math.sin(ph * 2) if flex else 0), 0)
    for s, sx in (('L', 1), ('R', -1)):
        fo, ho = offs[s]
        f = (t + fo) % 1.0
        sw, lf = swing(f, duty)
        p[f'upperarm.{s}'] = (amp * 0.85 * sw + 0.05, 0, 0.03 * sx)
        p[f'forearm.{s}'] = (0.7 * lift * lf - 0.1 * max(0.0, -sw), 0, 0)
        p[f'hand.{s}'] = (-0.6 * lift * lf + 0.2 * max(0.0, -sw) * (1 - lf), 0, 0)
        p[f'fingers.{s}'] = (-0.3 * lf, 0, 0)
        f = (t + ho) % 1.0
        sw, lf = swing(f, duty)
        p[f'thigh.{s}'] = (amp * sw, 0, 0.02 * sx)
        p[f'shin.{s}'] = (-0.75 * lift * lf, 0, 0)
        p[f'foot.{s}'] = (0.45 * lift * lf - 0.2 * max(0.0, -sw) * (1 - lf), 0, 0)
        p[f'toes.{s}'] = (0.4 * max(0.0, -sw) * (1 - lf), 0, 0)
    return p


def animations(arm):
    A = Animator(arm)
    walk_offs = {'L': (0.25, 0.0), 'R': (0.75, 0.5)}  # lateral sequence: LH, LF, RH, RF

    def idle(t):
        ph = t * TWO_PI
        br = math.sin(ph * 3) * 0.02
        p = {
            'spine1': (br, 0, 0),
            'spine2': (-br, 0, 0),
            'neck': (0.05 * math.sin(ph) - 0.05, 0.12 * math.sin(ph + 1), 0),
            'head': (0.04 * math.sin(ph * 2), 0.1 * math.sin(ph * 1 + 2), 0.18 * math.sin(ph)),
            'hair1': (0.03 * math.sin(ph * 2 - 0.5), 0, -0.1 * math.sin(ph - 0.5)),
            'hair2': (0.04 * math.sin(ph * 2 - 1.0), 0, -0.12 * math.sin(ph - 1.0)),
        }
        for s, sx in (('L', 1), ('R', -1)):
            p[f'fingers.{s}'] = (0.08 * math.sin(ph * 4 + sx), 0, 0)
        return p

    A.action('idle', 120, idle)
    A.action('walk', 36, lambda t: gait(t, walk_offs, 0.68, 0.32, 1.0, head=-0.05))
    A.action('stalk', 54, lambda t: gait(t, walk_offs, 0.75, 0.22, 0.7, head=-0.28, hair=0.6, speed=0.6))
    A.action('run', 16, lambda t: gait(t, {'L': (0.0, 0.5), 'R': (0.1, 0.6)}, 0.42, 0.55, 1.3, flex=0.16, head=0.1, hair=1.6))

    def hesitate(t):
        ph = t * TWO_PI
        tr = 0.02 * math.sin(ph * 11)
        p = idle(t)
        p['neck'] = (0.3 + tr, 0.05 * math.sin(ph), 0)
        p['head'] = (0.25, 0.08 * math.sin(ph * 2), 0.12)
        p['spine1'] = (0.06, 0, 0)
        p['spine2'] = (0.04, 0, 0)
        for s in ('L', 'R'):
            p[f'upperarm.{s}'] = (-0.12, 0, 0)
            p[f'fingers.{s}'] = (0.3, 0, 0)
        p['@hips'] = (0, -0.02, 0.03)
        return p

    A.action('hesitate', 60, hesitate)

    def attack(t):
        k = math.sin(min(1.0, t * 1.3) * math.pi)
        p = {
            'spine1': (0.12 * k, 0, 0),
            'spine2': (0.16 * k, 0, 0),
            'spine3': (0.1 * k, 0, 0),
            'neck': (0.45 * k, 0, 0),
            'head': (0.2 * k, 0, 0.15 * k),
            'hair1': (-0.3 * k, 0, 0),
            'hair2': (-0.25 * k, 0, 0),
            '@hips': (0, 0.04 * k, -0.18 * k),
        }
        for s, sx in (('L', 1), ('R', -1)):
            p[f'upperarm.{s}'] = (1.0 * k, 0, 0.12 * k * sx)
            p[f'forearm.{s}'] = (0.5 * k, 0, 0)
            p[f'hand.{s}'] = (-0.3 * k, 0, 0)
            p[f'fingers.{s}'] = (0.5 * k, 0, 0)
            p[f'thigh.{s}'] = (-0.3 * k, 0, 0)
            p[f'shin.{s}'] = (0.25 * k, 0, 0)
        return p

    A.action('attack', 18, attack)
    return A


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else os.path.join(os.path.dirname(__file__), '../../src/assets/creatures/hound.glb')
    prev = args[1] if len(args) > 1 and not args[1].startswith('--') else None
    reset()
    body, sc = sculpt()
    arm = make_armature('HoundRig', BONES)
    bake_colors(body, region=sc.region_sampler(), ao_dist=0.08, rays=36, ao_strength=0.85, mottle=0.12, mottle_scale=16)
    region_material(body, 'skin', [(0.42, 0.39, 0.36), (0.3, 0.2, 0.18), (0.03, 0.025, 0.02), (0.04, 0.035, 0.03)])
    bind_auto(body, arm)
    animations(arm)
    export_glb(out, [body, arm])
    if prev and '--motion' in args:
        for act in [a.name for a in bpy.data.actions]:
            n = int(bpy.data.actions[act].frame_range[1])
            for i in range(4):
                preview(f'{prev}_m_{act}_{i}', [body], arm=arm, action=act, frame=int(n * i / 4), views=((math.pi / 2, 0.15),), size=256)
    elif prev:
        preview(prev + '_rest', [body], views=((0.0, 0.25), (0.7, 0.3), (math.pi / 2, 0.1), (math.pi * 0.85, 0.35)))
        preview(prev + '_head', [body], views=((0.0, 0.0), (0.5, -0.3)), focus=((0, 0.52, -0.5), 0.2))


main()
