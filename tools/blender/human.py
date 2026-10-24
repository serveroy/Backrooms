"""Human-shaped creatures, all built from one parametric body:

  faceling     an ordinary person in ordinary clothes, with no face at all
  skinstealer  something too tall, wearing a person's skin and clothes
  partygoer    a smooth yellow mannequin with "=)" drawn on its face
  phantom      a tall, thin silhouette at the edge of your vision

Run:  python tools/blender/human.py -- <variant> <out.glb> [preview_prefix]
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib import (Animator, bake_colors, bind_auto, bind_like, decal, export_glb, make_armature,  # noqa: E402
                 material, preview, region_material, reset)
from sdf import CLOTH_A, CLOTH_B, OTHER, SDF, SKIN  # noqa: E402

TWO_PI = 2 * math.pi

VARIANTS = {
    'faceling': dict(scale=1.0, girth=1.0, arm=1.0, neck=0.0, shoulders=0.185, head=1.0, face='blank',
                     hair=True, ears=True, shirt=True, sleeves='short', pants=True, belt=True, shoes=True,
                     fingers=1.0, finger_w=1.0, toes=1.0, belly=0.3, tris=10000,
                     preview_colors=[(0.72, 0.6, 0.52), (0.36, 0.38, 0.42), (0.16, 0.16, 0.18), (0.08, 0.06, 0.05)]),
    'skinstealer': dict(scale=1.08, girth=0.84, arm=1.28, neck=0.09, shoulders=0.19, head=0.97, face='human',
                        hair=False, ears=True, shirt=True, sleeves='long', pants=True, belt=False, shoes=False,
                        gap=True, fingers=1.75, finger_w=0.85, toes=1.9, belly=0.0, tendons=True, tris=11000,
                        preview_colors=[(0.7, 0.58, 0.5), (0.34, 0.38, 0.3), (0.2, 0.22, 0.27), (0.55, 0.5, 0.33)]),
    'partygoer': dict(scale=1.06, girth=0.95, arm=1.08, neck=0.02, shoulders=0.18, head=1.12, face='smooth',
                      hair=False, ears=False, shirt=False, sleeves=None, pants=False, belt=False, shoes=False,
                      fingers=0.85, finger_w=1.25, toes=0.0, belly=0.2, tris=8000,
                      preview_colors=[(0.92, 0.76, 0.22)] * 4),
    'smiler': dict(scale=1.12, girth=0.68, arm=1.32, neck=0.12, shoulders=0.17, head=1.6, face='smooth',
                   hair=False, ears=False, shirt=False, sleeves=None, pants=False, belt=False, shoes=False,
                   fingers=1.6, finger_w=0.8, toes=1.3, belly=0.0, tendons=True, jaw=True, tris=4500,
                   preview_colors=[(0.02, 0.02, 0.02)] * 4),
    'phantom': dict(scale=1.14, girth=0.72, arm=1.22, neck=0.07, shoulders=0.18, head=0.92, face='smooth',
                    hair=False, ears=True, shirt=False, sleeves=None, pants=False, belt=False, shoes=False,
                    fingers=1.4, finger_w=0.8, toes=1.2, belly=0.0, tendons=True, tris=5000,
                    preview_colors=[(0.03, 0.03, 0.03)] * 4),
}


class Body:
    """Joint positions (game coordinates, metres) for one variant."""

    def __init__(self, v):
        self.v = v
        k = self.k = v['scale']
        n = v['neck']
        A = v['arm']
        sh = v['shoulders']

        def P(x, y, z):
            return (x * k, y * k, z * k)

        self.P = P
        self.hipC = P(0, 0.95, 0.0)
        self.sp1 = P(0, 1.05, 0.0)
        self.sp2 = P(0, 1.2, 0.006)
        self.sp3 = P(0, 1.35, 0.0)
        self.nk = P(0, 1.465, 0.0)
        self.hd = P(0, 1.585 + n, -0.012)
        self.top = P(0, 1.585 + n + 0.17 * v['head'], -0.012)
        self.arms = {}
        self.legs = {}
        for s, sx in (('L', 1), ('R', -1)):
            S = (sh * sx, 1.42, 0.0)
            a1 = math.radians(7)
            d1 = (math.sin(a1) * sx, -math.cos(a1), 0.03)
            E = _add(S, _scale(_norm(d1), 0.285 * A))
            a2 = math.radians(12)
            d2 = _norm((math.sin(a2) * sx, -math.cos(a2), -0.12))
            W = _add(E, _scale(d2, 0.255 * A))
            Hn = _add(W, _scale(d2, 0.085))
            F = _add(Hn, _scale(d2, 0.09 * v['fingers']))
            self.arms[s] = dict(sx=sx, C=P(0.02 * sx, 1.445, -0.01), S=P(*S), E=P(*E), W=P(*W), H=P(*Hn), F=P(*F), d2=d2)
            self.legs[s] = dict(sx=sx, Hp=P(0.09 * sx, 0.93, 0.0), K=P(0.1 * sx, 0.5, -0.012), An=P(0.105 * sx, 0.085, 0.02),
                                Bl=P(0.105 * sx, 0.022, -0.112), T=P(0.105 * sx, 0.014, -0.178))

    def bones(self):
        B = [
            dict(name='hips', head=self.hipC, tail=self.sp1),
            dict(name='spine1', head=self.sp1, tail=self.sp2, parent='hips', connect=True),
            dict(name='spine2', head=self.sp2, tail=self.sp3, parent='spine1', connect=True),
            dict(name='spine3', head=self.sp3, tail=self.nk, parent='spine2', connect=True),
            dict(name='neck', head=self.nk, tail=self.hd, parent='spine3', connect=True),
            dict(name='head', head=self.hd, tail=self.top, parent='neck', connect=True),
        ]
        if self.v.get('jaw'):
            B.append(dict(name='jaw', head=self.H(0, 0.012, 0.0), tail=self.H(0, -0.05, -0.085), parent='head'))
        for s, a in self.arms.items():
            B += [
                dict(name=f'clavicle.{s}', head=a['C'], tail=a['S'], parent='spine3'),
                dict(name=f'upperarm.{s}', head=a['S'], tail=a['E'], parent=f'clavicle.{s}', connect=True),
                dict(name=f'forearm.{s}', head=a['E'], tail=a['W'], parent=f'upperarm.{s}', connect=True),
                dict(name=f'hand.{s}', head=a['W'], tail=a['H'], parent=f'forearm.{s}', connect=True),
                dict(name=f'fingers.{s}', head=a['H'], tail=a['F'], parent=f'hand.{s}', connect=True),
            ]
        for s, g in self.legs.items():
            B += [
                dict(name=f'thigh.{s}', head=g['Hp'], tail=g['K'], parent='hips'),
                dict(name=f'shin.{s}', head=g['K'], tail=g['An'], parent=f'thigh.{s}', connect=True),
                dict(name=f'foot.{s}', head=g['An'], tail=g['Bl'], parent=f'shin.{s}', connect=True),
                dict(name=f'toes.{s}', head=g['Bl'], tail=g['T'], parent=f'foot.{s}', connect=True),
            ]
        return B

    # head-local point -> game point (head features are authored relative to the skull base)
    def H(self, x, y, z):
        hs = self.v['head'] * self.k
        return (self.hd[0] + x * hs, self.hd[1] + y * hs, self.hd[2] + z * hs)

    def hr(self, r):
        return r * self.v['head'] * self.k


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _scale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def _norm(a):
    L = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1.0
    return (a[0] / L, a[1] / L, a[2] / L)


def _dir_rot(d):
    """Euler (pitch, 0, roll) that turns a down-pointing ellipsoid along direction d."""
    pitch = math.atan2(-d[2], -d[1])
    roll = math.atan2(d[0], math.hypot(d[1], d[2]))
    return (pitch, 0.0, roll)


# ----------------------------------------------------------------------- sculpt

def sculpt(b):
    """Anatomy first, then garments as layers on top. Returns (mesh, sdf)."""
    v = b.v
    k = b.k
    w = v['girth']
    P = b.P
    H = b.H
    hr = b.hr

    def r(x):
        return x * k

    sc = SDF(name_of(v), voxel=0.0032 * k, k=r(0.02))
    hide = OTHER if v.get('gap') else SKIN  # what shows where clothes don't cover
    shirt, pants = v['shirt'], v['pants']
    hem_y = (1.06 if v.get('gap') else 1.0)
    waist_y = 1.012

    # ================================================================ anatomy
    with sc.tagged(hide):
        with sc.blend(r(0.045)):
            sc.ellipsoid(P(0, 0.955, 0.005), (r(0.15 * w), r(0.1), r(0.095 * w)))
            sc.ellipsoid(P(0, 1.09, 0.0), (r(0.128 * w), r(0.13), r(0.086 * w)))
            sc.ellipsoid(P(0, 1.29, 0.004), (r(0.152 * w), r(0.158), r(0.097 * w)), tag=SKIN)
        with sc.blend(r(0.03)):
            for sx in (1, -1):
                sc.ellipsoid(P(0.064 * sx, 0.9, 0.048 * w), (r(0.068 * w), r(0.082), r(0.06 * w)))
            if v['belly'] > 0:
                sc.ellipsoid(P(0, 1.06, -0.045 * w), (r(0.105 * w), r(0.09), r((0.045 + 0.03 * v['belly']) * w)))
        with sc.blend(r(0.025)), sc.tagged(SKIN):
            for sx in (1, -1):
                sc.ellipsoid(P(0.064 * sx, 1.33, -0.058 * w), (r(0.062 * w), r(0.048), r(0.028 * w)))
                sc.ellipsoid(P(0.1 * sx, 1.26, 0.028 * w), (r(0.048 * w), r(0.115), r(0.06 * w)))
            shs = v['shoulders'] / 0.185
            sc.ellipsoid(P(0, 1.412, 0.018), (r(0.145 * shs), r(0.052), r(0.07 * w)))
            for s, a in b.arms.items():
                sx = a['sx']
                sc.ball(a['S'], r(0.05 * w))
                sc.cone(P(0.035 * sx, 1.488, 0.018), _lerp3(a['C'], a['S'], 0.85), r(0.036 * w), r(0.032 * w))
        with sc.blend(r(0.01)), sc.tagged(SKIN):
            for s, a in b.arms.items():
                sx = a['sx']
                if v['face'] != 'smooth' or v.get('tendons'):  # a mannequin has no collarbones
                    sc.cone(P(0.02 * sx, 1.442, -0.068 * w), _lerp3(a['C'], a['S'], 0.9), r(0.011), r(0.014))
            if v.get('tendons') and not shirt:
                for i in range(5):  # ribs pressing through the skin
                    y = 1.33 - i * 0.045
                    for sx in (1, -1):
                        pts = [P((0.04 + j * 0.03) * sx * w, y - j * 0.006, -(0.091 - j * j * 0.0045) * w) for j in range(4)]
                        sc.tube(pts, [r(0.007)] * 4, k=r(0.008))

    # ---- neck and head (always the visible skin)
    with sc.tagged(SKIN):
        sc.cone(P(0, 1.4, 0.006), H(0, -0.005, 0.0), r(0.05 * w), hr(0.047 * w), k=r(0.02))
        if v.get('tendons'):
            for sx in (1, -1):
                sc.cone(H(0.043 * sx, 0.0, 0.0), P(0.02 * sx, 1.44, -0.058 * w), hr(0.011), r(0.012), k=r(0.012))
        sc.ball(_lerp3(P(0, 1.45, -0.042 * w), H(0, -0.06, -0.03), 0.55), r(0.011), k=r(0.012))  # larynx
        head(sc, b)

    # ---- arms and hands
    fl = v['fingers']
    fw = v['finger_w']
    for s, a in b.arms.items():
        sx = a['sx']
        S, E, W, Hn = a['S'], a['E'], a['W'], a['H']
        d1 = _norm(_sub(E, S))
        d2 = a['d2']
        with sc.tagged(SKIN):
            sc.cone(S, E, r(0.042 * w), r(0.033 * w), k=r(0.012))
            sc.ellipsoid(_add(_lerp3(S, E, 0.45), (0, 0, r(-0.01))), (r(0.032 * w), r(0.085), r(0.034 * w)), rot=_dir_rot(d1), k=r(0.015))
            sc.ellipsoid(_add(_lerp3(S, E, 0.4), (0, 0, r(0.012))), (r(0.03 * w), r(0.09), r(0.03 * w)), rot=_dir_rot(d1), k=r(0.015))
            sc.ball(E, r(0.03 * w), k=r(0.012))
            sc.cone(E, W, r(0.033 * w), r(0.022 * max(w, 0.85)), k=r(0.01))
            sc.ellipsoid(_lerp3(E, W, 0.3), (r(0.034 * w), r(0.075), r(0.03 * w)), rot=_dir_rot(d2), k=r(0.015))
            sc.ellipsoid(W, (r(0.022), r(0.012), r(0.017)), rot=_dir_rot(d2), k=r(0.01))
            rot = _dir_rot(d2)
            pc = _add(W, _scale(d2, r(0.045)))
            sc.box(pc, (r(0.012 * fw), r(0.042), r(0.036 * min(1.15, fw))), rot=rot, round_=r(0.011), k=r(0.01))
            # four fingers, gently curled toward the palm and fanned, and a thumb
            lens = (0.078, 0.086, 0.081, 0.064)
            inward = (-sx, 0.0, 0.0)
            spread = 0.021 if fw < 1.1 else 0.017
            tips = OTHER if v.get('gap') else SKIN
            for i, L0 in enumerate(lens):
                L = r(L0 * fl)
                oz = r((i - 1.5) * spread)
                base = _add(_add(Hn, (0, 0, oz)), _scale(d2, -r(0.012)))
                fan = (0, 0, oz * 0.35)
                mid = _add(_add(_add(base, _scale(d2, L * 0.52)), _scale(inward, L * 0.07)), fan)
                tip = _add(_add(_add(base, _scale(d2, L * 0.95)), _scale(inward, L * 0.24)), _scale(fan, 1.8))
                rr = r(0.0085 * fw)
                sc.cone(base, mid, rr, rr * 0.88, k=r(0.004))
                sc.cone(mid, tip, rr * 0.88, rr * 0.72, k=r(0.003), tag=tips)
            tb = _add(_add(W, _scale(d2, r(0.02))), (r(-0.012 * sx), 0, r(-0.026)))
            tm = _add(tb, (r(-0.012 * sx), r(-0.028 * fl ** 0.5), r(-0.022)))
            tt = _add(tm, (r(-0.008 * sx), r(-0.024 * fl ** 0.5), r(-0.01)))
            sc.tube([tb, tm, tt], [r(0.0115 * fw), r(0.0092 * fw), r(0.0075 * fw)], k=r(0.006))

    # ---- legs and feet
    for s, g in b.legs.items():
        sx = g['sx']
        Hp, K, An = g['Hp'], g['K'], g['An']
        with sc.tagged(hide if pants else SKIN):
            sc.cone(Hp, K, r(0.08 * w), r(0.05 * w), k=r(0.03))
            sc.ellipsoid(_add(_lerp3(Hp, K, 0.42), (0, 0, r(-0.014))), (r(0.058 * w), r(0.16), r(0.058 * w)), k=r(0.025))
            sc.ellipsoid(_add(_lerp3(Hp, K, 0.25), (r(-0.028 * sx), 0, 0)), (r(0.042 * w), r(0.11), r(0.048 * w)), k=r(0.025))
            sc.ball(K, r(0.047 * w), k=r(0.015))
            sc.ball(_add(K, (0, r(0.004), r(-0.034 * w))), r(0.022), k=r(0.01))
            sc.cone(K, An, r(0.047 * w), r(0.029 * w), k=r(0.015))
            sc.ellipsoid(P(0.1 * sx, 0.37, 0.024 * w), (r(0.043 * w), r(0.105), r(0.045 * w)), k=r(0.02))
            for o in (-1, 1):
                sc.ball(_add(An, (r(0.019 * o), r(0.004 * o), 0)), r(0.016), k=r(0.008))
        if v['shoes']:
            continue
        with sc.tagged(OTHER if v.get('gap') else SKIN):
            x = 0.105 * sx
            sc.ball(P(x, 0.034, 0.042), r(0.031), k=r(0.015))
            sc.ellipsoid(P(x, 0.034, -0.035), (r(0.04), r(0.027), r(0.082)), k=r(0.02))
            tl = v['toes']
            if tl > 0:
                for i in range(5):
                    o = (i - 2) * 0.0168
                    L = (0.034 if i == 0 else 0.028 - i * 0.002) * tl
                    rr = 0.0105 if i == 0 else 0.0076
                    base = P(x - o * sx, 0.02, -0.104 + abs(i - 0.6) * 0.005)
                    tip = _add(base, (r(-o * 0.15 * sx), r(-0.007), r(-L)))
                    sc.cone(base, tip, r(rr), r(rr * 0.85), k=r(0.004))
            else:
                sc.ellipsoid(P(x, 0.026, -0.108), (r(0.04), r(0.022), r(0.042)), k=r(0.02))

    # ================================================================ garments
    if v['shoes']:
        for s, g in b.legs.items():
            x = 0.105 * g['sx']
            with sc.group(r(0.004)), sc.tagged(OTHER), sc.blend(r(0.012)):
                sc.box(P(x, 0.014, -0.035), (r(0.047), r(0.014), r(0.133)), round_=r(0.012))
                sc.ellipsoid(P(x, 0.048, -0.02), (r(0.045), r(0.042), r(0.112)))
                sc.ellipsoid(P(x, 0.036, -0.12), (r(0.043), r(0.03), r(0.05)))
                sc.ball(P(x, 0.05, 0.055), r(0.042))
                for i in range(4):  # laces
                    z = -0.03 - i * 0.022
                    sc.cone(P(x - 0.02, 0.087 - i * 0.008, z), P(x + 0.02, 0.087 - i * 0.008, z), r(0.0035), r(0.0035), k=r(0.002))
    if shirt:
        with sc.tagged(CLOTH_A):
            with sc.garment(r(0.006), blur=r(0.012), k=r(0.002)):
                sc.box(P(0, (hem_y + 1.33) / 2, 0), (r(0.168), r((1.33 - hem_y) / 2), r(0.2)))
                sc.box(P(0, 1.4, 0), (r(0.27), r(0.07), r(0.2)))
                for s, a in b.arms.items():
                    S, E, W = a['S'], a['E'], a['W']
                    if v['sleeves'] == 'short':
                        end = _lerp3(S, E, 0.55)
                        with sc.clipped((end, _norm(_sub(E, S)))):
                            sc.cone(S, E, r(0.085), r(0.085))
                    elif v['sleeves'] == 'long':
                        end = _lerp3(E, W, 0.88)
                        with sc.clipped((end, _norm(_sub(W, E)))):
                            sc.cone(S, E, r(0.085), r(0.07))
                            sc.cone(E, W, r(0.07), r(0.06))
            for s, a in b.arms.items():
                S, E, W = a['S'], a['E'], a['W']
                if v['sleeves'] == 'short':
                    d1 = _norm(_sub(E, S))
                    end = _lerp3(S, E, 0.55)
                    sc.ring(_sub(end, _scale(d1, r(0.004))), d1, r(0.044 * w), r(0.044 * w), r(0.0045), k=r(0.003), wobble=0.06)
                elif v['sleeves'] == 'long':
                    d2 = _norm(_sub(W, E))
                    end = _lerp3(E, W, 0.88)
                    sc.ring(_sub(end, _scale(d2, r(0.004))), d2, r(0.03 * w), r(0.028 * w), r(0.0045), k=r(0.003), wobble=0.08)
            sc.ring(P(0, 1.455, -0.004), (0, 1, -0.3), r(0.058 * w), r(0.053 * w), r(0.0055), k=r(0.003), wobble=0.04)
            sc.ring(P(0, hem_y + 0.004, 0.0), (0, 1, 0), r(0.142 * w), r(0.098 * w), r(0.0045), n=32, k=r(0.003), wobble=0.05, seed=3)
            # creases
            for i in range(3):
                y = hem_y + 0.035 + i * 0.04
                for sx in (1, -1):
                    sc.tube([P(0.07 * sx, y, -0.1 * w), P(0.14 * sx, y + 0.012, -0.03), P(0.14 * sx, y + 0.02, 0.05 * w)],
                            [r(0.0035)] * 3, k=r(0.005), carve=True)
            for sx in (1, -1):
                sc.tube([P(0.12 * sx, 1.36, -0.08 * w), P(0.06 * sx, 1.25, -0.11 * w)], [r(0.003)] * 2, k=r(0.005), carve=True)
    if pants:
        with sc.tagged(CLOTH_B):
            with sc.garment(r(0.007), blur=r(0.016), k=r(0.002)):
                sc.box(P(0, (0.8 + waist_y) / 2, 0), (r(0.2), r((waist_y - 0.8) / 2), r(0.2)))
                for s, g in b.legs.items():
                    with sc.clipped((P(0, 0.105, 0), (0, -1, 0))):
                        sc.cone(_add(g['Hp'], (0, r(0.04), 0)), g['An'], r(0.13), r(0.09))
            for s, g in b.legs.items():
                sx = g['sx']
                # straight-cut legs hanging loose over the ankle
                with sc.clipped((P(0, 0.105, 0), (0, -1, 0))):
                    sc.cone(_lerp3(g['K'], g['An'], 0.35), _add(g['An'], (0, r(-0.03), 0)), r(0.05 * max(w, 0.9)),
                            r(0.052 * max(w, 0.9)), k=r(0.03))
                for j in range(2):  # bunching above the hem
                    sc.ring(P(0.105 * sx, 0.13 + j * 0.035, 0.02), (0, 1, 0.1), r(0.052 * max(w, 0.9)), r(0.052 * max(w, 0.9)),
                            r(0.0035), k=r(0.005), wobble=0.2, seed=7 + j)
                sc.tube([_add(g['K'], (r(0.04 * sx), r(0.02), r(0.04))), _add(g['K'], (r(-0.04 * sx), r(0.03), r(0.042)))],
                        [r(0.004)] * 2, k=r(0.006), carve=True)
            sc.ring(P(0, waist_y - 0.012, 0.0), (0, 1, 0), r(0.152 * w), r(0.103 * w), r(0.0055), n=32, k=r(0.003))
    if v['belt']:
        with sc.group(r(0.002)), sc.tagged(OTHER):
            sc.ring(P(0, waist_y - 0.014, 0.0), (0, 1, 0), r(0.158 * w), r(0.108 * w), r(0.0105), n=36, k=r(0.002))
            sc.box(P(0, waist_y - 0.014, -0.115 * w), (r(0.024), r(0.018), r(0.006)), round_=r(0.003), k=r(0.002))

    mesh = sc.build(faces=v['tris'], smooth_iters=2, smooth_lambda=0.35, lumpy=0.0004 * k, lumpy_scale=20)
    return mesh, sc


def name_of(v):
    for name, vv in VARIANTS.items():
        if vv is v:
            return name.capitalize()
    return 'Human'


def head(sc, b):
    v = b.v
    H = b.H
    hr = b.hr
    face = v['face']
    sc.ellipsoid(H(0, 0.075, -0.005), (hr(0.074), hr(0.093), hr(0.096)), k=hr(0.03))  # cranium
    sc.ellipsoid(H(0, 0.05, 0.035), (hr(0.062), hr(0.063), hr(0.058)), k=hr(0.03))  # occiput
    sc.ellipsoid(H(0, 0.02, -0.045), (hr(0.06), hr(0.075), hr(0.058)), k=hr(0.025))  # face
    sc.ellipsoid(H(0, -0.025, -0.045), (hr(0.05), hr(0.04), hr(0.05)), k=hr(0.025))  # jaw
    sc.ellipsoid(H(0, -0.05, -0.074), (hr(0.022), hr(0.02), hr(0.02)), k=hr(0.015))  # chin
    if v.get('jaw'):
        # a skull too wide for its face: the grin needs room
        sc.ellipsoid(H(0, -0.005, -0.04), (hr(0.078), hr(0.05), hr(0.062)), k=hr(0.03))
    if face != 'smooth':
        for sx in (1, -1):
            sc.ball(H(0.047 * sx, -0.016, -0.014), hr(0.017), k=hr(0.02))  # jaw angle
            sc.ball(H(0.045 * sx, 0.04, -0.06), hr(0.017), k=hr(0.02))  # cheekbone
    if face == 'human':
        sc.ellipsoid(H(0, 0.07, -0.084), (hr(0.055), hr(0.014), hr(0.018)), k=hr(0.015))  # brow
        sc.cone(H(0, 0.064, -0.093), H(0, 0.026, -0.112), hr(0.009), hr(0.012), k=hr(0.007))  # nose
        sc.ball(H(0, 0.022, -0.11), hr(0.013), k=hr(0.006))
        for sx in (1, -1):
            sc.ball(H(0.012 * sx, 0.019, -0.102), hr(0.0095), k=hr(0.005))  # nostrils
            sc.ellipsoid(H(0.031 * sx, 0.05, -0.097), (hr(0.019), hr(0.014), hr(0.016)), k=hr(0.008), carve=True)
            # heavy upper lids and puffy lower lids: a fixed, unblinking stare
            sc.ellipsoid(H(0.031 * sx, 0.0585, -0.088), (hr(0.0165), hr(0.0062), hr(0.012)), k=hr(0.004))
            sc.ellipsoid(H(0.031 * sx, 0.0405, -0.0895), (hr(0.015), hr(0.0042), hr(0.0095)), k=hr(0.004))
        sc.ellipsoid(H(0, -0.004, -0.1), (hr(0.024), hr(0.0072), hr(0.011)), k=hr(0.006))  # lips
        sc.ellipsoid(H(0, -0.016, -0.098), (hr(0.021), hr(0.0078), hr(0.0105)), k=hr(0.006))
        sc.cone(H(-0.024, -0.0098, -0.112), H(0.024, -0.0098, -0.112), hr(0.0022), hr(0.0022), k=hr(0.002), carve=True)
    elif face == 'blank':
        # skin stretched smooth over where a face should be: the faintest brow,
        # a nose bridge that goes nowhere, shallow hollows instead of eyes
        sc.ellipsoid(H(0, 0.068, -0.082), (hr(0.05), hr(0.012), hr(0.014)), k=hr(0.025))
        sc.ellipsoid(H(0, 0.035, -0.094), (hr(0.009), hr(0.028), hr(0.01)), k=hr(0.02))
        for sx in (1, -1):
            sc.ellipsoid(H(0.031 * sx, 0.05, -0.101), (hr(0.017), hr(0.011), hr(0.01)), k=hr(0.016), carve=True)
    if v['ears']:
        for sx in (1, -1):
            sc.ellipsoid(H(0.074 * sx, 0.035, 0.008), (hr(0.01), hr(0.028), hr(0.018)), rot=(-0.15, 0.25 * sx, 0), k=hr(0.006))
            sc.ellipsoid(H(0.081 * sx, 0.032, 0.005), (hr(0.004), hr(0.014), hr(0.009)), k=hr(0.003), carve=True)
    if v['hair']:
        with sc.group(hr(0.004)), sc.tagged(OTHER):
            with sc.clipped((H(0, -0.012, 0), (0, -1, 0))):
                sc.ellipsoid(H(0, 0.09, 0.004), (hr(0.079), hr(0.088), hr(0.1)), k=hr(0.01))


# ----------------------------------------------------------------------- extra parts

def make_eyes(b, body, arm):
    """Two wet eyeballs with dark irises (Skin-Stealer): region R white, G iris, none pupil."""
    import bmesh
    from lib import V
    from mathutils import Matrix
    bm = bmesh.new()
    centers = []
    for sx in (1, -1):
        c = b.H(0.031 * sx, 0.05, -0.083)
        centers.append(c)
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=b.hr(0.0122), matrix=Matrix.Translation(V(*c)))
    me = __import__('bpy').data.meshes.new('Eyes')
    bm.to_mesh(me)
    bm.free()
    ob = mesh_from_data_like(me)
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    from lib import G
    for vtx in me.vertices:
        p = G(vtx.co)
        c = min(centers, key=lambda q: math.dist(p, q))
        d = _norm(_sub(p, c))
        f = -d[2] * 0.98 + d[0] * 0.0
        if f > 0.955:
            col = (0.0, 0.0, 0.0, 1.0)
        elif f > 0.86:
            col = (0.0, 1.0, 0.0, 1.0)
        else:
            col = (1.0, 0.0, 0.0, 0.85 if d[1] < -0.3 else 1.0)
        attr.data[vtx.index].color = col
    material(ob, 'eye')
    bind_like(ob, body, arm)
    return ob


def make_grin(b, body, arm):
    """Smiler: glowing almond eyes with hollow pupils, and a grin of separate
    teeth wrapped round the front of the head (lower row on the jaw). Every
    piece is placed on the sculpted head surface by ray casting."""
    import bpy as _bpy
    from lib import G, V, bind_rigid, mesh_from_data
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(body, _bpy.context.evaluated_depsgraph_get())
    hs = b.v['head'] * b.k
    cx, cz = b.hd[0], b.hd[2]

    def surf(th, y_local):
        """Point and outward normal on the head at angle th (0 = front), head-local height y."""
        y = b.hd[1] + y_local * hs
        d = (math.sin(th), 0.0, -math.cos(th))
        o = V(cx + d[0] * 0.5, y, cz + d[2] * 0.5)
        hit, nrm, _, _ = bvh.ray_cast(o, V(-d[0], 0.0, -d[2]).normalized(), 1.0)
        if hit is None:
            return None, None
        return G(hit), G(nrm)

    verts = []
    faces = []
    jaw = []

    def box(c, u, w, n, su, sw, sn, lower):
        base = len(verts)
        for i in (-1, 1):
            for j in (-1, 1):
                for k_ in (-1, 1):
                    verts.append(tuple(c[a] + u[a] * su * i + w[a] * sw * j + n[a] * sn * k_ for a in range(3)))
                    jaw.append(lower)
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            faces.append(tuple(base + x for x in f))

    span = 0.98
    n = 24
    for lower in (False, True):
        for i in range(n):
            t = (i + 0.5) / n
            th = (t - 0.5) * 2 * span
            q = (th / span) ** 2
            mouth_y = -0.018 + 0.055 * q
            h = (0.02 if not lower else 0.017) * (1 - 0.4 * abs(th / span))
            yc = mouth_y + (h / 2 + 0.0012 if not lower else -h / 2 - 0.0012)
            p, nrm = surf(th, yc)
            if p is None:
                continue
            u = (math.cos(th), 0.0, math.sin(th))
            w = (0.0, 1.0, 0.0)
            c = tuple(p[a] + nrm[a] * 0.003 * hs for a in range(3))
            arc = 2 * span * 0.1 * hs / n
            box(c, u, w, nrm, arc * 0.4, h / 2 * hs, 0.004 * hs, lower)
    # eyes: thin glowing rings, slanted down toward the nose
    for sx in (1, -1):
        th = 0.42 * sx
        p, nrm = surf(th, 0.065)
        if p is None:
            continue
        u = Vector((math.cos(th), 0.0, math.sin(th)))
        w = Vector((0.0, 1.0, 0.0))
        nv = Vector(nrm)
        c = Vector(p) + nv * 0.002 * hs
        segs = 18
        ring = []
        tilt = -0.35 * sx
        for i in range(segs):
            a = i / segs * 2 * math.pi
            for rr in (1.0, 0.42):
                x = math.cos(a) * 0.026 * rr * hs
                y = math.sin(a) * 0.0095 * rr * hs
                xr = x * math.cos(tilt) - y * math.sin(tilt)
                yr = x * math.sin(tilt) + y * math.cos(tilt)
                q = c + u * xr + w * yr + nv * (0.003 * hs * (1 - abs(xr) / (0.03 * hs)))
                verts.append(tuple(q))
                jaw.append(False)
                ring.append(len(verts) - 1)
        for i in range(segs):
            a0, a1 = ring[i * 2], ring[i * 2 + 1]
            b0, b1 = ring[((i + 1) % segs) * 2], ring[((i + 1) % segs) * 2 + 1]
            faces.append((a0, b0, b1, a1))
    ob = mesh_from_data('Glow', verts, faces)
    material(ob, 'glow')
    flags = list(jaw)
    bind_rigid(ob, arm, lambda p, it=iter(flags): [('jaw' if next(it) else 'head', 1.0)])
    return ob


def mesh_from_data_like(me):
    import bpy
    from lib import link, select_only
    ob = link(bpy.data.objects.new(me.name, me))
    select_only(ob)
    bpy.ops.object.shade_smooth()
    return ob


def make_face_decal(b, body, arm, span):
    y0 = b.H(0, -0.075, 0)[1]
    height = b.hr(0.2)
    ob = decal('Face', body, (0.0, b.hd[2]), span, height, y0, res=(48, 48), offset=0.0024)
    material(ob, 'face')
    bind_like(ob, body, arm)
    return ob


# ----------------------------------------------------------------------- animation

def bump(x, c, w):
    d = (x - c + 0.5) % 1.0 - 0.5
    return math.exp(-(d / w) ** 2)


def gait(t, g):
    """One full stride (two steps). g: style dict."""
    p = {}
    ph = t * TWO_PI
    lean = g.get('lean', 0.04)
    p['spine1'] = (-lean * 0.4, -0.05 * math.sin(ph) * g.get('twist', 1), 0)
    p['spine2'] = (-lean * 0.35, -0.04 * math.sin(ph) * g.get('twist', 1), 0)
    p['spine3'] = (-lean * 0.25, 0, 0)
    p['neck'] = (lean * 0.5 + g.get('head_down', 0), 0, 0)
    p['head'] = (lean * 0.3 + 0.03 * math.cos(2 * ph) * g.get('bob', 1), 0, g.get('tilt', 0))
    by = -g.get('bounce', 0.012) * math.cos(2 * ph) - g.get('drop', 0.0)
    p['@hips'] = (0.012 * math.sin(ph) * g.get('sway', 1), by, 0)
    p['hips'] = (0, 0.07 * math.sin(ph) * g.get('twist', 1), 0.03 * math.cos(ph) * g.get('sway', 1))
    amp = g.get('stride', 0.36)
    for s, off, sx in (('L', 0.0, 1), ('R', 0.5, -1)):
        f = (t + off) % 1.0
        c = math.cos(f * TWO_PI)
        p[f'thigh.{s}'] = (g.get('thigh_base', 0.04) + amp * c, 0, 0.02 * sx)
        p[f'shin.{s}'] = (-(g.get('load', 0.14) * bump(f, 0.1, 0.08) + g.get('knee', 1.05) * bump(f, 0.7, 0.13) + 0.04), 0, 0)
        p[f'foot.{s}'] = (0.18 * bump(f, 0.0, 0.06) - g.get('push', 0.4) * bump(f, 0.57, 0.07) + 0.12 * bump(f, 0.82, 0.1), 0, 0)
        p[f'toes.{s}'] = (0.35 * bump(f, 0.55, 0.06), 0, 0)
        sw = g.get('arm', 0.32)
        p[f'clavicle.{s}'] = (0, 0, 0)
        p[f'upperarm.{s}'] = (g.get('arm_base', 0.02) - sw * c, 0, -g.get('arm_in', 0.02) * sx + g.get('arm_out', 0.0) * sx)
        p[f'forearm.{s}'] = (g.get('elbow', 0.18) + g.get('elbow_swing', 0.22) * max(0.0, -c), 0, 0)
        p[f'hand.{s}'] = (0.05, 0, 0)
        p[f'fingers.{s}'] = (g.get('curl', 0.25), 0, 0)
    return p


def idle_pose(t, g):
    ph = t * TWO_PI
    br = math.sin(ph * 2) * 0.012
    shift = math.sin(ph) * g.get('shift', 1.0)
    p = {
        'spine1': (-g.get('lean', 0.0) * 0.4 + br, 0, 0.01 * shift),
        'spine2': (-g.get('lean', 0.0) * 0.4 - br, 0, 0),
        'spine3': (-g.get('lean', 0.0) * 0.2 - br, 0, 0),
        'neck': (g.get('lean', 0.0) * 0.5 + g.get('head_down', 0.0), 0, 0),
        'head': (0.02 * math.sin(ph * 3 + 1) * g.get('look', 1), 0.06 * math.sin(ph + 0.4) * g.get('look', 1), g.get('tilt', 0.0)),
        '@hips': (0.012 * shift, -0.004 - g.get('drop', 0.0), 0),
        'hips': (0, 0, -0.025 * shift),
    }
    for s, sx in (('L', 1), ('R', -1)):
        p[f'clavicle.{s}'] = (0, 0, -0.03 * br * 10 * sx * 0.1)
        p[f'upperarm.{s}'] = (0.03 + g.get('arm_base', 0.0), 0, -0.03 * sx + g.get('arm_out', 0.0) * sx)
        p[f'forearm.{s}'] = (g.get('elbow', 0.12), 0, 0)
        p[f'hand.{s}'] = (0.05, 0, 0)
        p[f'fingers.{s}'] = (g.get('curl', 0.3) + 0.05 * math.sin(ph * 2 + sx), 0, 0)
        p[f'thigh.{s}'] = (0.0, 0, (0.03 + 0.025 * shift * sx) * sx)
        p[f'shin.{s}'] = (-0.03 - 0.03 * max(0.0, -shift * sx), 0, 0)
        p[f'foot.{s}'] = (0.0, 0, 0)
    return p


def animations(arm, variant):
    A = Animator(arm)
    if variant == 'faceling':
        A.action('idle', 150, lambda t: idle_pose(t, dict(look=0.6)))
        A.action('walk', 32, lambda t: gait(t, dict(stride=0.34, arm=0.28)))
        A.action('run', 20, lambda t: gait(t, dict(stride=0.62, knee=1.55, lean=0.28, bounce=0.03, drop=0.03, arm=0.7, elbow=1.2,
                                                   elbow_swing=0.25, push=0.6, load=0.3, curl=0.8)))

        def stare(t):
            # stands too still, head slightly cocked, shoulders dropped
            p = idle_pose(t, dict(look=0.0, tilt=0.18, head_down=-0.08, shift=0.15))
            tw = 0.04 * bump(t, 0.3, 0.03) - 0.03 * bump(t, 0.72, 0.02)
            p['head'] = (p['head'][0] + tw, tw * 2, p['head'][2] + tw)
            return p

        A.action('stare', 90, stare)
    elif variant == 'skinstealer':
        hunch = dict(lean=0.2, head_down=0.05, tilt=0.16, arm_base=0.06, elbow=0.05, curl=0.12)
        A.action('idle', 150, lambda t: idle_pose(t, dict(hunch, look=0.25, shift=0.3)))

        def walk(t):
            # stiff, slightly wrong: a limp, the head stays tilted, arms dangle
            p = gait(t, dict(stride=0.4, knee=0.75, load=0.05, arm=0.1, arm_base=0.08, elbow=0.06, elbow_swing=0.05, lean=0.22,
                             head_down=0.05, tilt=0.2, bounce=0.02, twist=0.5, curl=0.1, push=0.25))
            lim = bump(t, 0.05, 0.08)
            p['@hips'] = (p['@hips'][0], p['@hips'][1] - 0.025 * lim, 0)
            p['spine2'] = (p['spine2'][0], p['spine2'][1], 0.06 * lim)
            return p

        A.action('walk', 40, walk)

        def run(t):
            # an awful scrambling sprint, arms reaching
            p = gait(t, dict(stride=0.7, knee=1.5, lean=0.55, bounce=0.035, drop=0.06, arm=0.25, arm_base=0.85, elbow=0.25,
                             elbow_swing=0.1, push=0.6, load=0.35, curl=-0.1, tilt=0.15, head_down=-0.25, twist=1.4))
            return p

        A.action('run', 18, run)

        def attack(t):
            k = math.sin(min(1.0, t * 1.3) * math.pi)
            p = idle_pose(0, dict(hunch))
            p['spine1'] = (-0.25 - 0.2 * k, 0, 0)
            p['spine2'] = (-0.15, 0, 0)
            p['head'] = (0.1, 0, 0.3 * k)
            for s, sx in (('L', 1), ('R', -1)):
                p[f'upperarm.{s}'] = (0.6 + 1.0 * k, 0, (0.2 - 0.25 * k) * sx)
                p[f'forearm.{s}'] = (0.3 + 0.4 * k, 0, 0)
                p[f'fingers.{s}'] = (0.6 * k, 0, 0)
            return p

        A.action('attack', 20, attack)
    elif variant == 'partygoer':
        A.action('idle', 120, lambda t: idle_pose(t, dict(look=1.2, shift=1.5, curl=0.15, tilt=0.08)))
        A.action('walk', 30, lambda t: gait(t, dict(stride=0.4, arm=0.5, arm_out=0.12, bounce=0.03, elbow=0.1, elbow_swing=0.1, curl=0.1, bob=2.5)))

        def run(t):
            # arms up, flailing: it just wants to party
            p = gait(t, dict(stride=0.6, knee=1.4, lean=0.12, bounce=0.04, drop=0.03, arm=0.0, push=0.55, load=0.25, curl=0.0))
            for s, sx, o in (('L', 1, 0.0), ('R', -1, 0.5)):
                a = math.sin((t + o) * TWO_PI * 2)
                p[f'upperarm.{s}'] = (2.35 + a * 0.3, 0, (0.35 + 0.15 * a) * sx)
                p[f'forearm.{s}'] = (0.35 + 0.3 * max(0.0, a), 0, 0)
                p[f'fingers.{s}'] = (0.0, 0, 0)
            p['head'] = (p['head'][0], 0.15 * math.sin(t * TWO_PI), 0.12 * math.sin(t * TWO_PI * 2))
            return p

        A.action('run', 20, run)

        def listen(t):
            p = idle_pose(t, dict(look=0.0, shift=0.0))
            ph = t * TWO_PI
            p['head'] = (0.08, 0.25 * math.sin(ph), 0.42 * math.sin(ph))
            p['neck'] = (0.05, 0.1 * math.sin(ph), 0.1 * math.sin(ph))
            p['spine2'] = (-0.05, 0, 0.05 * math.sin(ph))
            return p

        A.action('listen', 100, listen)

        def attack(t):
            # a hug you don't walk away from
            k = math.sin(min(1.0, t * 1.2) * math.pi * 0.5) if t < 0.6 else 1.0 - (t - 0.6) / 0.4
            p = idle_pose(0, dict())
            p['spine1'] = (-0.15 * k, 0, 0)
            for s, sx in (('L', 1), ('R', -1)):
                p[f'upperarm.{s}'] = (1.5 * k, 0, (0.6 * (1 - k) + 0.05) * sx)
                p[f'forearm.{s}'] = (0.2 + 1.0 * k, 0, 0)
            p['head'] = (0.25 * k, 0, 0.25 * k)
            return p

        A.action('attack', 24, attack)
    elif variant == 'smiler':
        def idle(t):
            ph = t * TWO_PI
            p = idle_pose(t, dict(lean=0.3, head_down=0.05, look=0.0, shift=0.4, arm_base=0.1, elbow=0.1, curl=0.2))
            p['head'] = (0.05 + 0.04 * math.sin(ph * 2), 0.06 * math.sin(ph), 0.22 * math.sin(ph))
            p['jaw'] = (-0.06 - 0.06 * (0.5 + 0.5 * math.sin(ph * 3)), 0, 0)
            return p

        A.action('idle', 150, idle)

        def giggle(t):
            ph = t * TWO_PI
            p = idle(0)
            p['head'] = (0.1 + 0.05 * math.sin(ph * 6), 0.08 * math.sin(ph * 5), 0.3 + 0.08 * math.sin(ph * 7))
            p['jaw'] = (-0.12 - 0.12 * abs(math.sin(ph * 6)), 0, 0)
            p['spine2'] = (-0.12 + 0.04 * math.sin(ph * 6), 0, 0)
            return p

        A.action('giggle', 30, giggle)

        def charge(t):
            p = gait(t, dict(stride=0.6, knee=1.3, lean=0.6, bounce=0.03, drop=0.05, arm=0.1, arm_base=1.0, elbow=0.2,
                             elbow_swing=0.05, curl=-0.2, head_down=-0.5, tilt=0.1, twist=0.6))
            p['jaw'] = (-0.32 - 0.05 * math.sin(t * TWO_PI * 2), 0, 0)
            return p

        A.action('charge', 18, charge)
    elif variant == 'phantom':
        A.action('idle', 180, lambda t: idle_pose(t, dict(lean=0.32, head_down=0.12, look=0.15, shift=0.2, arm_base=0.12, elbow=0.05, curl=0.15)))
    return A


# ----------------------------------------------------------------------- main

def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    variant = args[0] if args else 'faceling'
    out = args[1] if len(args) > 1 else os.path.join(os.path.dirname(__file__), f'../../src/assets/creatures/{variant}.glb')
    prev = args[2] if len(args) > 2 else None
    motion = '--motion' in args
    v = VARIANTS[variant]
    reset()
    b = Body(v)
    body, sc = sculpt(b)
    arm = make_armature(f'{variant}Rig', b.bones())
    bake_colors(body, region=sc.region_sampler(), ao_dist=0.1 * b.k, rays=36, ao_strength=0.85, mottle=0.06, mottle_scale=14)
    region_material(body, 'skin', v['preview_colors'], rough=0.35 if variant == 'partygoer' else 0.65)
    bind_auto(body, arm)
    parts = [body]
    if v['face'] == 'human':
        parts.append(make_eyes(b, body, arm))
        parts.append(make_face_decal(b, body, arm, span=1.25))
    elif variant == 'partygoer':
        parts.append(make_face_decal(b, body, arm, span=1.1))
    elif variant == 'smiler':
        parts.append(make_grin(b, body, arm))
    animations(arm, variant)
    export_glb(out, parts + [arm])
    if prev and motion:
        # a contact sheet of the main cycles, from the side
        for act in [a.name for a in bpy.data.actions]:
            n = int(bpy.data.actions[act].frame_range[1])
            for i in range(4):
                preview(f'{prev}_m_{act}_{i}', parts, arm=arm, action=act, frame=int(n * i / 4), views=((math.pi / 2, 0.05),), size=256)
        return
    if prev:
        preview(prev + '_rest', parts, views=((0.0, 0.1), (0.6, 0.1), (math.pi, 0.15)))
        preview(prev + '_head', parts, views=((0.0, 0.05), (0.7, 0.1)), focus=(b.H(0, 0.04, -0.02), 0.16 * b.k))
        acts = {'faceling': (('walk', 8), ('run', 5)), 'skinstealer': (('walk', 10), ('run', 4), ('attack', 10)),
                'partygoer': (('walk', 8), ('run', 5), ('attack', 12)), 'phantom': (('idle', 40),),
                'smiler': (('idle', 40), ('charge', 5), ('giggle', 8))}[variant]
        for act, f in acts:
            preview(prev + '_' + act, parts, arm=arm, action=act, frame=f, views=((math.pi / 2, 0.1), (0.5, 0.15)))


main()
