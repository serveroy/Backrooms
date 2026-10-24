"""Signed-distance-field sculpting for organic creatures.

Primitives (round cones, ellipsoids, boxes) are combined with a *smooth*
union, so muscle flows into bone and skin into skin the way a sculptor would
blend clay; carving (eye sockets, mouths) uses a smooth subtraction. Each
primitive carries a material tag (skin / cloth A / cloth B / other), so
clothing is modelled as real layers: a sleeve is a slightly larger shape over
the arm, and wherever it forms the surface, the surface is cloth.

The field is sampled on a voxel grid (only near each primitive), polygonised
with marching cubes and handed to Blender for decimation and rigging.

All coordinates are game coordinates (x right, y up, -z forward).
"""

import math
import time
from contextlib import contextmanager

import bpy  # noqa: F401  (must precede bmesh / mathutils users)
import numpy as np
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes

from lib import V, link, rot_matrix, select_only

SKIN, CLOTH_A, CLOTH_B, OTHER = 0, 1, 2, 3


def _rot(rot):
    """Game-space rotation matrix (3x3 numpy) for (pitch, yaw, roll)."""
    m = rot_matrix(*rot)  # Blender basis
    # convert Blender-basis rotation to game basis: G = C^-1 M C with C: game->blender
    C = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float64)
    M = np.array([[m[i][j] for j in range(3)] for i in range(3)], dtype=np.float64)
    return C.T @ M @ C


class SDF:
    def __init__(self, name, voxel=0.0035, k=0.012):
        self.name = name
        self.voxel = voxel
        self.k = k
        self.tag = SKIN
        self.clip = []
        self.ops = []  # (kind, fn, bbox_lo, bbox_hi, k, tag)

    # ------------------------------------------------------------ context
    @contextmanager
    def tagged(self, tag):
        old = self.tag
        self.tag = tag
        try:
            yield
        finally:
            self.tag = old

    @contextmanager
    def blend(self, k):
        old = self.k
        self.k = k
        try:
            yield
        finally:
            self.k = old

    @contextmanager
    def clipped(self, *planes):
        """Primitives added inside are cut by planes (point, outward normal): hard
        garment edges such as hems and cuffs."""
        old = self.clip
        self.clip = old + [(np.array(p, dtype=np.float64), np.array(n, dtype=np.float64) / np.linalg.norm(n)) for p, n in planes]
        try:
            yield
        finally:
            self.clip = old

    def _add(self, kind, fn, lo, hi, k, tag):
        if self.clip:
            planes = list(self.clip)
            base = fn

            def fn(px, py, pz):
                d = base(px, py, pz)
                for p0, n in planes:
                    d = np.maximum(d, (px - p0[0]) * n[0] + (py - p0[1]) * n[1] + (pz - p0[2]) * n[2])
                return d
        if tag is None:
            tag = self.tag if kind == 'add' else -1
        self.ops.append((kind, fn, np.array(lo, dtype=np.float64), np.array(hi, dtype=np.float64),
                         self.k if k is None else k, tag))

    # ------------------------------------------------------------ primitives
    def ellipsoid(self, c, r, rot=(0, 0, 0), k=None, tag=None, carve=False):
        c = np.array(c, dtype=np.float64)
        r = np.array(r, dtype=np.float64)
        R = _rot(rot)
        RT = R.T

        def fn(px, py, pz):
            x = px - c[0]
            y = py - c[1]
            z = pz - c[2]
            lx = RT[0, 0] * x + RT[0, 1] * y + RT[0, 2] * z
            ly = RT[1, 0] * x + RT[1, 1] * y + RT[1, 2] * z
            lz = RT[2, 0] * x + RT[2, 1] * y + RT[2, 2] * z
            k0 = np.sqrt((lx / r[0]) ** 2 + (ly / r[1]) ** 2 + (lz / r[2]) ** 2)
            k1 = np.sqrt((lx / r[0] ** 2) ** 2 + (ly / r[1] ** 2) ** 2 + (lz / r[2] ** 2) ** 2)
            return k0 * (k0 - 1.0) / np.maximum(k1, 1e-9)

        m = r.max()
        self._add('sub' if carve else 'add', fn, c - m, c + m, k, tag)

    def ball(self, c, r, k=None, tag=None, carve=False, **_):
        c = np.array(c, dtype=np.float64)

        def fn(px, py, pz):
            return np.sqrt((px - c[0]) ** 2 + (py - c[1]) ** 2 + (pz - c[2]) ** 2) - r

        self._add('sub' if carve else 'add', fn, c - r, c + r, k, tag)

    def cone(self, a, b, ra, rb, k=None, tag=None, carve=False, **_):
        """Round cone (tapered capsule) from a to b with radii ra, rb."""
        a = np.array(a, dtype=np.float64)
        b = np.array(b, dtype=np.float64)
        ba = b - a
        l2 = float(ba @ ba)
        if l2 < 1e-12:
            return self.ball(a, max(ra, rb), k=k, tag=tag, carve=carve)
        rr = ra - rb
        if rr * rr >= l2:  # one end swallows the other
            return self.ball(a if ra > rb else b, max(ra, rb), k=k, tag=tag, carve=carve)
        a2 = l2 - rr * rr
        il2 = 1.0 / l2

        def fn(px, py, pz):
            pax = px - a[0]
            pay = py - a[1]
            paz = pz - a[2]
            y = pax * ba[0] + pay * ba[1] + paz * ba[2]
            z = y - l2
            qx = pax * l2 - ba[0] * y
            qy = pay * l2 - ba[1] * y
            qz = paz * l2 - ba[2] * y
            x2 = qx * qx + qy * qy + qz * qz
            y2 = y * y * l2
            z2 = z * z * l2
            kk = math.copysign(1.0, rr) * rr * rr * x2
            d_b = np.sqrt(x2 + z2) * il2 - rb
            d_a = np.sqrt(x2 + y2) * il2 - ra
            d_m = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra
            return np.where(np.sign(z) * a2 * z2 > kk, d_b, np.where(np.sign(y) * a2 * y2 < kk, d_a, d_m))

        m = max(ra, rb)
        self._add('sub' if carve else 'add', fn, np.minimum(a, b) - m, np.maximum(a, b) + m, k, tag)

    def tube(self, pts, radii, k=None, tag=None, carve=False, **_):
        for i in range(len(pts) - 1):
            self.cone(pts[i], pts[i + 1], radii[i], radii[i + 1], k=k, tag=tag, carve=carve)

    def box(self, c, half, rot=(0, 0, 0), round_=0.0, k=None, tag=None, carve=False):
        c = np.array(c, dtype=np.float64)
        h = np.array(half, dtype=np.float64) - round_
        RT = _rot(rot).T

        def fn(px, py, pz):
            x = px - c[0]
            y = py - c[1]
            z = pz - c[2]
            lx = np.abs(RT[0, 0] * x + RT[0, 1] * y + RT[0, 2] * z) - h[0]
            ly = np.abs(RT[1, 0] * x + RT[1, 1] * y + RT[1, 2] * z) - h[1]
            lz = np.abs(RT[2, 0] * x + RT[2, 1] * y + RT[2, 2] * z) - h[2]
            out = np.sqrt(np.maximum(lx, 0) ** 2 + np.maximum(ly, 0) ** 2 + np.maximum(lz, 0) ** 2)
            ins = np.minimum(np.maximum(lx, np.maximum(ly, lz)), 0)
            return out + ins - round_

        m = float(np.linalg.norm(half))
        self._add('sub' if carve else 'add', fn, c - m, c + m, k, tag)

    def ring(self, c, axis, rx, rz, thick, n=24, k=None, tag=None, wobble=0.0, seed=1):
        """Closed loop of tube around `axis` through c (cuffs, collars, belts, hems)."""
        import random
        a = np.array(axis, dtype=np.float64)
        a /= np.linalg.norm(a)
        u = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 0, 1.0])
        u = u - a * (u @ a)
        u /= np.linalg.norm(u)
        w = np.cross(a, u)
        rnd = random.Random(seed)
        pts = []
        for i in range(n):
            t = i / n * 2 * math.pi
            s = 1 + wobble * (rnd.random() - 0.5)
            pts.append(tuple(np.array(c) + u * math.cos(t) * rx * s + w * math.sin(t) * rz * s))
        pts.append(pts[0])
        self.tube(pts, [thick] * len(pts), k=k if k is not None else thick * 0.5, tag=tag)

    @contextmanager
    def group(self, k):
        """A layer (a garment, a shoe) blended internally by its own primitives'
        radii, then joined to everything before it with blend radius k."""
        outer = self.ops
        self.ops = []
        try:
            yield
        finally:
            sub = self.ops
            self.ops = outer
            if sub:
                lo = np.min([o[2] - o[4] for o in sub], axis=0)
                hi = np.max([o[3] + o[4] for o in sub], axis=0)
                self.ops.append(('group', sub, lo, hi, k, -1))

    @contextmanager
    def garment(self, thickness, blur=0.0, k=0.002):
        """Cloth hugging everything sculpted so far: the surface (smoothed by
        `blur`) pushed out by `thickness`, inside the region described by the
        primitives added in this block (they only define where the garment is)."""
        outer = self.ops
        oclip = self.clip
        self.ops = []
        self.clip = []
        try:
            yield
        finally:
            region = self.ops
            self.ops = outer
            self.clip = oclip
            if region:
                lo = np.min([o[2] for o in region], axis=0)
                hi = np.max([o[3] for o in region], axis=0)
                self.ops.append(('garment', (region, thickness, blur), lo, hi, k, self.tag))

    # ------------------------------------------------------------ evaluation
    def _apply(self, ops, field, tags, base):
        vox, lo = self.voxel, self.lo
        shape = np.array(field.shape)
        for kind, fn, blo, bhi, k, tag in ops:
            i0 = np.maximum(np.floor((blo - k - 3 * vox - lo) / vox).astype(int) - base, 0)
            i1 = np.minimum(np.ceil((bhi + k + 3 * vox - lo) / vox).astype(int) + 1 - base, shape)
            if np.any(i1 <= i0):
                continue
            sl = (slice(i0[0], i1[0]), slice(i0[1], i1[1]), slice(i0[2], i1[2]))
            if kind == 'group':
                d = np.full(tuple(i1 - i0), 1.0, dtype=np.float32)
                dt = np.full(tuple(i1 - i0), -1, dtype=np.int8)
                self._apply(fn, d, dt, base + i0)
            elif kind == 'garment':
                region, thick, blur = fn
                reg = np.full(tuple(i1 - i0), 1.0, dtype=np.float32)
                self._apply([(o[0], o[1], o[2], o[3], 0.0, -1) for o in region], reg,
                            np.zeros(tuple(i1 - i0), dtype=np.int8), base + i0)
                src = field[sl]
                if blur > 0:
                    src = gaussian_filter(src, blur / vox, mode='nearest')
                d = np.maximum(src - thick, reg)
                dt = None
            else:
                g0 = base + i0
                g1 = base + i1
                xs = (lo[0] + np.arange(g0[0], g1[0]) * vox)[:, None, None]
                ys = (lo[1] + np.arange(g0[1], g1[1]) * vox)[None, :, None]
                zs = (lo[2] + np.arange(g0[2], g1[2]) * vox)[None, None, :]
                d = np.broadcast_to(fn(xs, ys, zs).astype(np.float32), tuple(i1 - i0))
                dt = None
            f = field[sl]
            tg = tags[sl]
            if kind in ('add', 'group', 'garment'):
                win = d < f
                if k > 0:
                    h = np.clip(0.5 + 0.5 * (f - d) / k, 0.0, 1.0)
                    nf = f + (d - f) * h - k * h * (1.0 - h)
                else:
                    nf = np.minimum(f, d)
                if dt is None:
                    tg[win] = tag
                else:
                    m = win & (dt >= 0)
                    tg[m] = dt[m]
            else:
                nd = -d
                if k > 0:
                    h = np.clip(0.5 - 0.5 * (f + d) / k, 0.0, 1.0)
                    nf = f + (nd - f) * h + k * h * (1.0 - h)
                else:
                    nf = np.maximum(f, nd)
                if tag >= 0:
                    tg[nd > f] = tag
            field[sl] = nf

    def evaluate(self):
        vox = self.voxel
        lo = np.min([o[2] - o[4] for o in self.ops], axis=0) - 4 * vox
        hi = np.max([o[3] + o[4] for o in self.ops], axis=0) + 4 * vox
        shape = np.ceil((hi - lo) / vox).astype(int) + 1
        self.lo = lo
        self.shape = shape
        field = np.full(shape, 1.0, dtype=np.float32)
        tags = np.full(shape, SKIN, dtype=np.int8)
        self._apply(self.ops, field, tags, np.zeros(3, dtype=int))
        self.field, self.tags = field, tags
        return field

    def build(self, faces=10000, smooth_iters=2, smooth_lambda=0.4, lumpy=0.0, lumpy_scale=10.0):
        from mathutils import noise
        t0 = time.time()
        field = self.evaluate()
        t1 = time.time()
        verts, tris, _, _ = marching_cubes(field, level=0.0, spacing=(self.voxel,) * 3, gradient_direction='ascent')
        verts = verts + self.lo
        tris = tris[:, ::-1]  # outward-facing winding for our (x, -z, y) axis swap
        print(f'  sdf: {len(self.ops)} prims, grid {tuple(self.shape)}, eval {t1 - t0:.1f}s, '
              f'mc {len(tris)} tris {time.time() - t1:.1f}s')
        me = bpy.data.meshes.new(self.name)
        bverts = np.stack([verts[:, 0], -verts[:, 2], verts[:, 1]], axis=1)  # game -> blender
        me.vertices.add(len(bverts))
        me.vertices.foreach_set('co', bverts.astype(np.float32).ravel())
        me.loops.add(len(tris) * 3)
        me.loops.foreach_set('vertex_index', tris.astype(np.int32).ravel())
        me.polygons.add(len(tris))
        me.polygons.foreach_set('loop_start', np.arange(0, len(tris) * 3, 3, dtype=np.int32))
        me.update(calc_edges=True)
        me.validate()
        ob = link(bpy.data.objects.new(self.name, me))
        _drop_crumbs(ob)
        if lumpy > 0:
            vs = ob.data.vertices
            cos = [v.co.copy() for v in vs]
            nrm = [v.normal.copy() for v in vs]
            for i, p in enumerate(cos):
                vs[i].co = p + nrm[i] * noise.noise(p * lumpy_scale) * lumpy
        if smooth_iters:
            s = ob.modifiers.new('smooth', 'LAPLACIANSMOOTH')
            s.iterations = smooth_iters
            s.lambda_factor = smooth_lambda
            s.use_volume_preserve = True
            s.use_normalized = True
            select_only(ob)
            bpy.ops.object.modifier_apply(modifier=s.name)
        cur = len(ob.data.polygons)
        if faces and cur > faces:
            d = ob.modifiers.new('dec', 'DECIMATE')
            d.decimate_type = 'COLLAPSE'
            d.ratio = faces / cur
            d.use_collapse_triangulate = True
            select_only(ob)
            bpy.ops.object.modifier_apply(modifier=d.name)
        select_only(ob)
        bpy.ops.object.shade_smooth()
        print(f'  mesh: {len(ob.data.polygons)} tris, {len(ob.data.vertices)} verts, {time.time() - t0:.1f}s total')
        return ob

    # ------------------------------------------------------------ regions
    def region_sampler(self, soft=1):
        """fn(game_pos, normal) -> (r, g, b) masks from the tags near the surface."""
        lo, vox, tags, field, shape = self.lo, self.voxel, self.tags, self.field, self.shape
        R = soft

        def fn(p, n):
            idx = np.round((np.array(p) - lo) / vox).astype(int)
            a = np.maximum(idx - R, 0)
            b = np.minimum(idx + R + 1, shape)
            tg = tags[a[0]:b[0], a[1]:b[1], a[2]:b[2]].ravel()
            fd = np.abs(field[a[0]:b[0], a[1]:b[1], a[2]:b[2]].ravel())
            # weight voxels near the surface most
            wt = 1.0 / (fd + vox * 0.5)
            acc = np.zeros(4)
            np.add.at(acc, tg.astype(int), wt)
            acc /= max(acc.sum(), 1e-9)
            return (float(acc[0]), float(acc[1]), float(acc[2]))

        return fn


def _drop_crumbs(ob, keep=0.01):
    """Delete disconnected bits smaller than `keep` of the mesh (marching-cubes debris)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    parts = []
    for f in bm.faces:
        if f.index in seen:
            continue
        comp = []
        stack = [f]
        seen.add(f.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.edges:
                for y in e.link_faces:
                    if y.index not in seen:
                        seen.add(y.index)
                        stack.append(y)
        parts.append(comp)
    n = len(bm.faces)
    drop = [f for comp in parts if len(comp) < n * keep for f in comp]
    if drop:
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(ob.data)
        print(f'  dropped {len(parts) - sum(1 for c in parts if len(c) >= n * keep)} crumbs ({len(drop)} faces)')
    bm.free()


__all__ = ['SDF', 'SKIN', 'CLOTH_A', 'CLOTH_B', 'OTHER', 'V']
