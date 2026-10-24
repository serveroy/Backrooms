"""The Howler: a ~2.55 m emaciated humanoid with a long neck, a small
elongated skull, arms that reach past its knees, and a four-limbed gallop.
(Tribute to the creature from Kane Pixels' found footage.)

Run:  python tools/blender/howler.py -- <out.glb> [preview_prefix]
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import Animator, bake_colors, bind_auto, export_glb, make_armature, preview, reset, vertex_color_material  # noqa: E402
from sdf import SDF  # noqa: E402

S = 1.0  # global scale


def P(x, y, z):
    return (x * S, y * S, z * S)


BONES = [
    dict(name='hips', head=P(0, 1.1, 0.0), tail=P(0, 1.25, 0.0)),
    dict(name='spine1', head=P(0, 1.25, 0.0), tail=P(0, 1.5, 0.03), parent='hips', connect=True),
    dict(name='spine2', head=P(0, 1.5, 0.03), tail=P(0, 1.78, 0.02), parent='spine1', connect=True),
    dict(name='spine3', head=P(0, 1.78, 0.02), tail=P(0, 1.98, -0.02), parent='spine2', connect=True),
    dict(name='neck1', head=P(0, 1.98, -0.02), tail=P(0, 2.16, -0.08), parent='spine3', connect=True),
    dict(name='neck2', head=P(0, 2.16, -0.08), tail=P(0, 2.32, -0.15), parent='neck1', connect=True),
    dict(name='head', head=P(0, 2.32, -0.15), tail=P(0, 2.55, -0.2), parent='neck2', connect=True),
    dict(name='jaw', head=P(0, 2.35, -0.17), tail=P(0, 2.26, -0.34), parent='head'),
]
for s, sx in (('L', 1), ('R', -1)):
    BONES += [
        dict(name=f'clavicle.{s}', head=P(0.03 * sx, 1.94, -0.04), tail=P(0.2 * sx, 1.96, 0.0), parent='spine3'),
        dict(name=f'upperarm.{s}', head=P(0.21 * sx, 1.95, 0.0), tail=P(0.3 * sx, 1.4, 0.02), parent=f'clavicle.{s}'),
        dict(name=f'forearm.{s}', head=P(0.3 * sx, 1.4, 0.02), tail=P(0.34 * sx, 0.84, -0.02), parent=f'upperarm.{s}', connect=True),
        dict(name=f'hand.{s}', head=P(0.34 * sx, 0.84, -0.02), tail=P(0.35 * sx, 0.73, -0.025), parent=f'forearm.{s}', connect=True),
        dict(name=f'fingers.{s}', head=P(0.35 * sx, 0.73, -0.025), tail=P(0.355 * sx, 0.5, -0.05), parent=f'hand.{s}', connect=True),
        dict(name=f'thigh.{s}', head=P(0.11 * sx, 1.1, 0.0), tail=P(0.13 * sx, 0.62, -0.03), parent='hips'),
        dict(name=f'shin.{s}', head=P(0.13 * sx, 0.62, -0.03), tail=P(0.13 * sx, 0.12, 0.04), parent=f'thigh.{s}', connect=True),
        dict(name=f'foot.{s}', head=P(0.13 * sx, 0.12, 0.04), tail=P(0.13 * sx, 0.03, -0.17), parent=f'shin.{s}', connect=True),
    ]


def sculpt():
    sc = SDF('Howler', voxel=0.0036, k=0.012)
    # ---- pelvis, waist, buttocks
    sc.ellipsoid(P(0, 1.14, 0.01), (0.15, 0.1, 0.1), k=0.03)
    sc.cone(P(0, 1.18, 0.02), P(0, 1.52, 0.045), 0.085, 0.075, k=0.03)
    for sx in (1, -1):
        sc.ellipsoid(P(0.07 * sx, 1.08, 0.065), (0.06, 0.07, 0.05))
    # ---- ribcage: a narrow barrel with ribs showing through
    sc.ellipsoid(P(0, 1.72, 0.012), (0.128, 0.2, 0.095), k=0.035)
    sc.ellipsoid(P(0, 1.9, -0.005), (0.155, 0.075, 0.085), k=0.03)
    for k in range(7):
        y = 1.56 + k * 0.058
        rx = 0.132 - abs(k - 3.5) * 0.008
        rz = 0.1 - abs(k - 3.5) * 0.004
        for sx in (1, -1):
            pts = []
            rad = []
            for i in range(9):
                a = (i / 8) * math.pi * 0.92  # from the spine round to the front
                pts.append(P(math.sin(a) * rx * sx, y - (i / 8) * 0.07, math.cos(a) * rz))
                rad.append(0.011 if 1 < i < 7 else 0.008)
            sc.tube(pts, rad, k=0.008)
    sc.cone(P(0, 1.88, -0.098), P(0, 1.6, -0.092), 0.022, 0.016)  # sternum
    # spine ridge
    for i in range(17):
        y = 1.16 + i * 0.05
        z = 0.085 + 0.018 * math.sin(i / 16 * math.pi)
        sc.ball(P(0, y, z), 0.021 - i * 0.0004, k=0.008)
    # shoulder blades jutting out of the back
    for sx in (1, -1):
        sc.ellipsoid(P(0.095 * sx, 1.82, 0.095), (0.065, 0.085, 0.022), rot=(0.2, 0.0, 0.25 * sx))
        sc.cone(P(0.02 * sx, 1.95, -0.075), P(0.19 * sx, 1.97, -0.02), 0.016, 0.014)  # clavicles
    # ---- neck with tendons
    sc.cone(P(0, 1.95, -0.01), P(0, 2.33, -0.15), 0.046, 0.038)
    for sx in (1, -1):
        sc.cone(P(0.034 * sx, 2.28, -0.13), P(0.045 * sx, 1.96, -0.08), 0.012, 0.014)
    sc.ball(P(0, 2.2, -0.135), 0.022)  # larynx
    # ---- head: small, elongated, sloping back; long jaw
    sc.ellipsoid(P(0, 2.45, -0.17), (0.078, 0.118, 0.1), rot=(0.45, 0, 0), k=0.025)
    sc.ellipsoid(P(0, 2.33, -0.265), (0.052, 0.048, 0.085), rot=(-0.35, 0, 0), k=0.02)
    sc.ellipsoid(P(0, 2.445, -0.255), (0.072, 0.024, 0.03))  # brow ridge
    for sx in (1, -1):
        sc.ball(P(0.064 * sx, 2.375, -0.24), 0.024)  # cheekbones
        sc.ellipsoid(P(0.077 * sx, 2.41, -0.15), (0.014, 0.03, 0.022))  # ears, pressed flat
    # ---- arms: very long, thin, with knobbly joints
    for sx in (1, -1):
        sc.ball(P(0.21 * sx, 1.935, 0.0), 0.05)
        sc.cone(P(0.21 * sx, 1.93, 0.0), P(0.3 * sx, 1.4, 0.02), 0.043, 0.031)
        sc.ellipsoid(P(0.255 * sx, 1.7, 0.0), (0.04, 0.12, 0.04))  # wasted biceps
        sc.ball(P(0.3 * sx, 1.4, 0.022), 0.035)
        sc.cone(P(0.3 * sx, 1.4, 0.02), P(0.34 * sx, 0.84, -0.02), 0.033, 0.021)
        sc.cone(P(0.31 * sx, 1.36, 0.035), P(0.345 * sx, 0.86, -0.005), 0.016, 0.012)  # second forearm bone
        sc.ball(P(0.34 * sx, 0.84, -0.02), 0.024)
        sc.ellipsoid(P(0.348 * sx, 0.78, -0.025), (0.022, 0.06, 0.042))  # palm
        # four long fingers, slightly curled, and a thumb
        for i in range(4):
            o = (i - 1.5) * 0.019
            base = P(0.35 * sx, 0.735, -0.025 + o)
            mid = P(0.352 * sx, 0.62, -0.035 + o * 1.15)
            tip = P(0.35 * sx, 0.515 + abs(i - 1.5) * 0.03, -0.058 + o * 1.25)
            sc.tube([base, mid, tip], [0.0095, 0.0078, 0.0062], k=0.003)
        sc.tube([P(0.335 * sx, 0.79, -0.06), P(0.335 * sx, 0.72, -0.085), P(0.34 * sx, 0.66, -0.09)], [0.009, 0.0075, 0.0062], k=0.004)
    # ---- legs
    for sx in (1, -1):
        sc.ball(P(0.11 * sx, 1.1, 0.0), 0.07)
        sc.cone(P(0.11 * sx, 1.1, 0.0), P(0.13 * sx, 0.62, -0.03), 0.064, 0.044)
        sc.ball(P(0.13 * sx, 0.62, -0.038), 0.046)  # knee
        sc.cone(P(0.13 * sx, 0.62, -0.03), P(0.13 * sx, 0.12, 0.04), 0.042, 0.026)
        sc.ellipsoid(P(0.13 * sx, 0.44, 0.012), (0.04, 0.1, 0.045))  # calf
        sc.ball(P(0.13 * sx, 0.11, 0.04), 0.032)
        sc.cone(P(0.13 * sx, 0.1, 0.05), P(0.13 * sx, 0.03, -0.12), 0.034, 0.026)
        for i in range(3):
            o = (i - 1) * 0.02
            sc.cone(P((0.13 + o) * sx, 0.03, -0.11), P((0.13 + o * 1.2) * sx, 0.018, -0.19), 0.014, 0.009, k=0.004)
    return sc.build(faces=11000, smooth_iters=2, smooth_lambda=0.4, lumpy=0.0012, lumpy_scale=14)


def animations(arm):
    A = Animator(arm)
    two_pi = 2 * math.pi

    def side(name, s):
        return f'{name}.{s}'

    # ---------- idle: hunched, breathing, head twitches, fingers flex
    def idle(t):
        br = math.sin(t * two_pi * 2) * 0.03
        twitch = 0.0
        for c, w in ((0.23, 0.5), (0.61, -0.35), (0.82, 0.25)):
            d = (t - c) / 0.03
            if 0 <= d < 1:
                twitch = w
            elif 1 <= d < 6:
                twitch = w * (1 - (d - 1) / 5)
        p = {
            'spine1': (-0.12 + br, 0, 0),
            'spine2': (-0.1 - br, 0, 0),
            'spine3': (-0.05, 0, 0),
            'neck1': (0.12, 0, 0),
            'neck2': (0.1, 0, 0),
            'head': (0.12, twitch * 0.4, twitch),
            'jaw': (-0.08 - max(0, br) * 2, 0, 0),
        }
        for s, sx in (('L', 1), ('R', -1)):
            sway = math.sin(t * two_pi + (0 if sx > 0 else 1.2)) * 0.05
            p[side('upperarm', s)] = (0.27 + sway, 0, 0.06 * sx)
            p[side('forearm', s)] = (0.12, 0, 0)
            p[side('fingers', s)] = (0.25 + 0.15 * math.sin(t * two_pi * 3 + sx), 0, 0)
            p[side('thigh', s)] = (0.12, 0, 0)
            p[side('shin', s)] = (-0.2, 0, 0)
            p[side('foot', s)] = (0.08, 0, 0)
        p['@hips'] = (0, -0.03 + br * 0.2, 0)
        return p

    A.action('idle', 120, idle)

    # ---------- stalk: hunched, slow, long strides, head low and forward
    def stalk(t):
        ph = t * two_pi
        p = {
            'spine1': (-0.35, 0, math.sin(ph) * 0.05),
            'spine2': (-0.25, math.sin(ph) * 0.06, 0),
            'spine3': (-0.15, 0, 0),
            'neck1': (0.3, 0, 0),
            'neck2': (0.2, 0, 0),
            'head': (0.15, math.sin(ph * 0.5) * 0.2, 0.15),
            'jaw': (-0.05, 0, 0),
            '@hips': (0, -0.12 + abs(math.sin(ph)) * 0.03, 0),
        }
        for s, sx, off in (('L', 1, 0.0), ('R', -1, math.pi)):
            w = math.sin(ph + off)
            p[side('thigh', s)] = (0.35 + w * 0.45, 0, 0)
            p[side('shin', s)] = (-0.35 - max(0.0, -math.cos(ph + off)) * 0.6, 0, 0)
            p[side('foot', s)] = (0.1 + w * 0.15, 0, 0)
            p[side('upperarm', s)] = (0.75 - w * 0.25, 0, 0.05 * sx)
            p[side('forearm', s)] = (0.15 + max(0.0, w) * 0.2, 0, 0)
            p[side('fingers', s)] = (0.35, 0, 0)
        return p

    A.action('stalk', 42, stalk)

    # ---------- run: torso near-horizontal, galloping on all fours
    def run(t):
        ph = t * two_pi
        flex = math.sin(ph) * 0.14
        p = {
            'spine1': (-0.68 + flex, 0, 0),
            'spine2': (-0.48 - flex * 0.5, 0, 0),
            'spine3': (-0.25, 0, 0),
            'neck1': (0.55, 0, 0),
            'neck2': (0.45, 0, 0),
            'head': (0.35 + math.sin(ph * 2) * 0.06, 0, 0.12),
            'jaw': (-0.2 - 0.15 * max(0.0, math.sin(ph)), 0, 0),
            '@hips': (0, -0.36 + abs(math.sin(ph)) * 0.08, 0),
        }
        for s, sx, off in (('L', 1, 0.0), ('R', -1, 0.55)):
            a = math.sin(ph + off)
            # arms reach far forward then drag back, like front legs
            p[side('upperarm', s)] = (1.62 + a * 0.7, 0, 0.1 * sx)
            p[side('forearm', s)] = (0.25 + max(0.0, -a) * 0.6, 0, 0)
            p[side('hand', s)] = (-0.35 - a * 0.25, 0, 0)
            p[side('fingers', s)] = (-0.2, 0, 0)
            l = math.sin(ph + off + math.pi * 0.85)
            p[side('thigh', s)] = (0.75 + l * 0.6, 0, 0.04 * sx)
            p[side('shin', s)] = (-0.95 - max(0.0, l) * 0.4, 0, 0)
            p[side('foot', s)] = (0.25 + l * 0.2, 0, 0)
        return p

    A.action('run', 17, run)

    # ---------- notice: rises, cocks its head, howls
    def notice(t):
        k = min(1.0, t * 3)
        shake = math.sin(t * two_pi * 9) * 0.04 * k
        p = {
            'spine1': (-0.05, 0, 0),
            'spine2': (0.06 * k, 0, 0),
            'spine3': (0.04 * k, 0, 0),
            'neck1': (-0.1 * k, 0, 0),
            'neck2': (0.15, 0, 0),
            'head': (0.25 * k + shake, 0.1, 0.55 * k),
            'jaw': (-0.55 * k, 0, 0),
        }
        for s, sx in (('L', 1), ('R', -1)):
            p[side('upperarm', s)] = (0.15, 0, (0.25 + shake) * sx)
            p[side('forearm', s)] = (0.35 * k, 0, 0)
            p[side('fingers', s)] = (0.5 * k, 0, 0)
            p[side('thigh', s)] = (0.05, 0, 0)
            p[side('shin', s)] = (-0.1, 0, 0)
        return p

    A.action('notice', 36, notice)

    # ---------- attack: lunge, arms swinging up and in, jaw wide
    def attack(t):
        k = math.sin(min(1.0, t * 1.4) * math.pi)
        p = {
            'spine1': (-0.45 - 0.2 * k, 0, 0),
            'spine2': (-0.3, 0, 0),
            'spine3': (-0.1, 0, 0),
            'neck1': (0.35, 0, 0),
            'neck2': (0.3, 0, 0),
            'head': (0.45 * k, 0, 0),
            'jaw': (-0.7 * k, 0, 0),
            '@hips': (0, -0.15, -0.15 * k),
        }
        for s, sx in (('L', 1), ('R', -1)):
            p[side('upperarm', s)] = (1.0 + 1.3 * k, 0, (0.35 - 0.3 * k) * sx)
            p[side('forearm', s)] = (0.6 - 0.5 * k, 0, 0)
            p[side('fingers', s)] = (-0.4 * k, 0, 0)
            p[side('thigh', s)] = (0.45, 0, 0)
            p[side('shin', s)] = (-0.6, 0, 0)
        return p

    A.action('attack', 18, attack)
    return A


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else os.path.join(os.path.dirname(__file__), '../../src/assets/creatures/howler.glb')
    prev = args[1] if len(args) > 1 else None
    reset()
    body = sculpt()
    print('howler faces', len(body.data.polygons), 'verts', len(body.data.vertices))
    arm = make_armature('HowlerRig', BONES)
    bake_colors(body, ao_dist=0.12, rays=40, ao_strength=0.9, mottle=0.12, mottle_scale=12,
                tint_fn=lambda p, n: 0.82 if p[1] < 0.95 and abs(p[0]) > 0.25 else 1.0)
    vertex_color_material(body, 'skin')
    bind_auto(body, arm)
    animations(arm)
    export_glb(out, [body, arm])
    if prev:
        preview(prev + '_rest', [body])
        for act, f in (('run', 4), ('stalk', 10), ('notice', 30), ('idle', 30)):
            preview(prev + '_' + act, [body], arm=arm, action=act, frame=f, views=((math.pi / 2, 0.1), (0.5, 0.2)))


main()
