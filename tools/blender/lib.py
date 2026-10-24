"""Blender (bpy) toolkit used to build the game's creatures from code.

Coordinates passed to these helpers are GAME coordinates (three.js
convention: x right, y up, -z forward). They are converted to Blender
(Z up, +Y forward) internally, so that the glTF exporter's Y-up conversion
lands every creature facing -Z in the game.

Pipeline per creature:
  SDF sculpt (sdf.py: smooth-blended primitives, garments, carving) ->
  marching cubes -> decimate -> armature -> automatic weights -> vertex
  colours (region masks in RGB, ambient occlusion in A) -> scripted
  actions -> GLB.
"""

import math
import os
import random

import bpy  # must come first: it sets up bmesh/mathutils
import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

FPS = 30


# --------------------------------------------------------------------- basics

def V(x, y, z):
    """Game (x right, y up, -z forward) -> Blender (x right, z up, +y forward)."""
    return Vector((x, -z, y))


def G(v):
    """Blender -> game coordinates."""
    return (v.x, v.z, -v.y)


def rot_matrix(pitch=0.0, yaw=0.0, roll=0.0):
    """Rotation given as game-space Euler (about game x, y, z), as a Blender 3x3.

    Positive pitch tips a bone hanging DOWN toward the front; positive yaw
    turns to the character's left; positive roll leans to the right.
    """
    rx = Matrix.Rotation(pitch, 3, 'X')
    ry = Matrix.Rotation(yaw, 3, 'Z')
    rz = Matrix.Rotation(-roll, 3, 'Y')
    return ry @ rx @ rz


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start = 0
    sc.frame_end = 60


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def select_only(*objs, active=None):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


def apply_modifier(ob, mod):
    select_only(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


# --------------------------------------------------------------------- meshes

def decal(name, body, center, span, height, y0, res=(28, 28), offset=0.0018, ray_from=0.35):
    """Thin UV-mapped skin hugging the body, for painted faces.

    A cylindrical grid around a vertical axis through `center` (game x/z),
    covering `span` radians either side of the front and `height` metres up
    from y0, is shrunk onto the body by ray casting toward the axis.
    UV (0.5, v) is the centre of the front.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body, dg)
    cx, cz = center
    nu, nv = res
    verts = []
    uvs = []
    ok = []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u = i / nu
            v = j / nv
            th = (u - 0.5) * 2 * span
            y = y0 + v * height
            d = Vector((math.sin(th), 0.0, -math.cos(th)))  # game: outward from the axis
            o = V(cx + d.x * ray_from, y, cz + d.z * ray_from)
            dirb = V(-d.x, 0.0, -d.z).normalized()
            hit, nrm, _, _ = bvh.ray_cast(o, dirb, ray_from * 1.5)
            if hit is None:
                verts.append((cx + d.x * 0.05, y, cz + d.z * 0.05))
                ok.append(False)
            else:
                q = hit + nrm * offset
                verts.append(G(q))
                ok.append(True)
            uvs.append((u, v))
    faces = []
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            quad = (a, a + nu + 1, a + nu + 2, a + 1)  # counter-clockwise seen from outside
            if all(ok[k] for k in quad):
                faces.append(quad)
    ob = mesh_from_data(name, verts, faces, uvs)
    # drop the vertices that missed the body
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def mesh_from_data(name, verts, faces, uvs=None):
    """Build a mesh object from game-space vertices and faces (optional per-loop uvs)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([V(*p) for p in verts], [], faces)
    me.validate()
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for li, loop in enumerate(me.loops):
            uvl.data[li].uv = uvs[loop.vertex_index]
    ob = link(bpy.data.objects.new(name, me))
    select_only(ob)
    bpy.ops.object.shade_smooth()
    return ob


# --------------------------------------------------------------------- rigging

def make_armature(name, bones):
    """bones: [{name, head, tail, parent?, connect?, deform?}] in game coords."""
    data = bpy.data.armatures.new(name)
    ob = link(bpy.data.objects.new(name, data))
    select_only(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for b in bones:
        e = data.edit_bones.new(b['name'])
        e.head = V(*b['head'])
        e.tail = V(*b['tail'])
        e.use_deform = b.get('deform', True)
        # consistent roll: local Z toward the front (or up for bones that point forward)
        d = (e.tail - e.head).normalized()
        fwd = Vector((0, 1, 0))
        e.align_roll(fwd if abs(d.dot(fwd)) < 0.8 else Vector((0, 0, 1)))
        eb[b['name']] = e
    for b in bones:
        if b.get('parent'):
            eb[b['name']].parent = eb[b['parent']]
            eb[b['name']].use_connect = b.get('connect', False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (a + ab * t - p).length


def bind_auto(mesh_ob, arm_ob):
    """Automatic (bone heat) weights, repairing any vertex the solver missed."""
    select_only(mesh_ob, arm_ob, active=arm_ob)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    bones = [(b.name, b.head_local, b.tail_local) for b in arm_ob.data.bones if b.use_deform]
    groups = {g.name: g for g in mesh_ob.vertex_groups}
    missed = 0
    for v in mesh_ob.data.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot < 1e-4:
            missed += 1
            best = min(bones, key=lambda b: _seg_dist(v.co, b[1], b[2]))
            g = groups.get(best[0]) or mesh_ob.vertex_groups.new(name=best[0])
            groups[best[0]] = g
            g.add([v.index], 1.0, 'REPLACE')
    if missed:
        print(f'  repaired {missed} unweighted vertices on {mesh_ob.name}')


def bind_like(dst, src, arm_ob):
    """Copy skin weights to dst from the nearest vertex of src (decals, eyes)."""
    from mathutils.kdtree import KDTree
    kd = KDTree(len(src.data.vertices))
    for v in src.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = {g.index: g.name for g in src.vertex_groups}
    for v in dst.data.vertices:
        _, idx, _ = kd.find(v.co)
        for ge in src.data.vertices[idx].groups:
            nm = names[ge.group]
            g = dst.vertex_groups.get(nm) or dst.vertex_groups.new(name=nm)
            g.add([v.index], ge.weight, 'REPLACE')
    dst.parent = arm_ob
    mod = dst.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm_ob


def bind_rigid(mesh_ob, arm_ob, pick):
    """Weights chosen per vertex by pick(game_pos) -> [(bone, weight), ...]."""
    for v in mesh_ob.data.vertices:
        for bone, w in pick(G(v.co)):
            g = mesh_ob.vertex_groups.get(bone) or mesh_ob.vertex_groups.new(name=bone)
            g.add([v.index], w, 'ADD')
    mesh_ob.parent = arm_ob
    mod = mesh_ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm_ob


def nearest_bone_pick(arm_ob, names=None):
    bones = [(b.name, b.head_local, b.tail_local) for b in arm_ob.data.bones if b.use_deform and (names is None or b.name in names)]

    def pick(p):
        pv = V(*p)
        best = min(bones, key=lambda b: _seg_dist(pv, b[1], b[2]))
        return [(best[0], 1.0)]

    return pick


# --------------------------------------------------------------------- vertex colours

def _hemisphere_dirs(n, seed=7):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        u = (i + rnd.random()) / n
        v = rnd.random()
        r = math.sqrt(u)
        th = 2 * math.pi * v
        out.append((r * math.cos(th), r * math.sin(th), math.sqrt(max(0.0, 1 - u))))
    return out


def bake_colors(ob, region=None, ao_dist=0.25, rays=32, ao_strength=0.85, mottle=0.12, mottle_scale=9.0, tint_fn=None):
    """RGB = region masks (skin, cloth A, cloth B; all zero = 4th region), A = AO * mottling.

    region(game_pos, game_normal) -> (r, g, b) masks.
    tint_fn(game_pos, game_normal) -> extra multiplier folded into A (e.g. darker joints).
    """
    me = ob.data
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(ob, dg)
    dirs = _hemisphere_dirs(rays)
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    for v in me.vertices:
        p = v.co
        n = v.normal
        t = n.orthogonal().normalized()
        b = n.cross(t)
        occ = 0.0
        origin = p + n * 0.002
        for dx, dy, dz in dirs:
            d = t * dx + b * dy + n * dz
            hit, _, _, dist = bvh.ray_cast(origin, d, ao_dist)
            if hit is not None:
                occ += 1.0 - 0.6 * (dist / ao_dist)
        ao = 1.0 - ao_strength * occ / rays
        m = 1.0 + mottle * noise.noise(p * mottle_scale) + mottle * 0.5 * noise.noise(p * mottle_scale * 3.1)
        gp = G(p)
        gn = G(n)
        r, g, bb = region(gp, gn) if region else (1.0, 0.0, 0.0)
        extra = tint_fn(gp, gn) if tint_fn else 1.0
        a = max(0.04, min(1.0, ao * m * extra))
        attr.data[v.index].color = (r, g, bb, a)


def material(ob, name, color=(0.5, 0.5, 0.5, 1)):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    if not ob.data.materials:
        ob.data.materials.append(mat)
    else:
        ob.data.materials[0] = mat
    return mat


# --------------------------------------------------------------------- animation

class Animator:
    """Writes keyframed actions. Poses are given as game-space Euler
    rotations per bone (pitch, yaw, roll) relative to the rest pose and
    expressed in the rest frame (standard forward-kinematics convention),
    plus optional root offsets."""

    def __init__(self, arm_ob):
        self.arm = arm_ob
        arm_ob.animation_data_create()
        self.rest = {pb.name: pb.bone.matrix_local.to_3x3() for pb in arm_ob.pose.bones}
        for pb in arm_ob.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.actions = []

    def _apply(self, pose, frame):
        for pb in self.arm.pose.bones:
            r = pose.get(pb.name)
            rest = self.rest[pb.name]
            if r:
                R = rot_matrix(*r)
                local = rest.inverted() @ R @ rest
                pb.rotation_quaternion = local.to_quaternion()
            else:
                pb.rotation_quaternion = (1, 0, 0, 0)
            off = pose.get('@' + pb.name)
            if off:
                pb.location = rest.inverted() @ V(*off)
            else:
                pb.location = (0, 0, 0)
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('location', frame=frame)

    def action(self, name, frames, fn):
        """fn(t in [0,1]) -> pose dict. frames = length of the clip in frames."""
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        self.arm.animation_data.action = act
        for f in range(frames + 1):
            self._apply(fn(f / frames), f)
        # keep each action reachable for the exporter
        track = self.arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        strip.name = name
        track.mute = True
        self.actions.append(act)
        self.arm.animation_data.action = None
        return act


def wave(t, phase=0.0, k=1.0):
    return math.sin((t * k + phase) * 2 * math.pi)


def lerp(a, b, t):
    return a + (b - a) * t


def ease(t):
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------- export / preview

def export_glb(path, objects):
    for o in objects:
        if o.type == 'MESH':
            o.data.validate(clean_customdata=False)
    select_only(*objects)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_image_quality=85,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_morph=False,
    )
    print('exported', path, os.path.getsize(path) // 1024, 'KB')


def preview(path, objects, arm=None, action=None, frame=0, views=((0.0, 0.15), (math.pi / 2, 0.15), (math.pi * 0.8, 0.3)), size=320, focus=None):
    """Cycles CPU renders of the creature from several yaw/pitch angles, saved as path_<i>.png."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 12
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.film_transparent = False
    world = bpy.data.worlds.get('W') or bpy.data.worlds.new('W')
    sc.world = world
    world.color = (0.12, 0.12, 0.11)
    if arm is not None and action:
        act = bpy.data.actions[action]
        arm.animation_data.action = act
        sc.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objects:
        if o.type != 'MESH':
            continue
        e = o.evaluated_get(dg)
        mw = e.matrix_world
        for v in e.data.vertices:
            pts.append(mw @ v.co)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) * 0.5
    rad = (hi - lo).length * 0.62
    if focus:
        c = V(*focus[0])
        rad = focus[1]
    cam = bpy.data.objects.get('PreviewCam')
    if not cam:
        cam = link(bpy.data.objects.new('PreviewCam', bpy.data.cameras.new('PreviewCam')))
        for i, (rot, energy) in enumerate((((0.9, 0.0, 0.6), 3.0), ((1.2, 0.0, -2.2), 1.2))):
            ld = bpy.data.lights.new(f'PL{i}', 'SUN')
            ld.energy = energy
            lo_ = link(bpy.data.objects.new(f'PL{i}', ld))
            lo_.rotation_euler = rot
    cam.data.lens = 50
    sc.camera = cam
    out = []
    for i, (yaw, pitch) in enumerate(views):
        d = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
        dist = rad / math.tan(math.radians(18))
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = f'{path}_{i}.png'
        bpy.ops.render.render(write_still=True)
        out.append(sc.render.filepath)
    if arm is not None:
        arm.animation_data.action = None
    return out


def region_material(ob, name, colors, rough=0.6):
    """Preview material: the four region colours mixed by the RGB masks, times AO (alpha)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(attr.outputs['Color'], sep.inputs[0])
    # 4th weight = 1 - r - g - b
    s1 = nt.nodes.new('ShaderNodeMath')
    s1.operation = 'ADD'
    nt.links.new(sep.outputs[0], s1.inputs[0])
    nt.links.new(sep.outputs[1], s1.inputs[1])
    s2 = nt.nodes.new('ShaderNodeMath')
    s2.operation = 'ADD'
    nt.links.new(s1.outputs[0], s2.inputs[0])
    nt.links.new(sep.outputs[2], s2.inputs[1])
    w4 = nt.nodes.new('ShaderNodeMath')
    w4.operation = 'SUBTRACT'
    w4.use_clamp = True
    w4.inputs[0].default_value = 1.0
    nt.links.new(s2.outputs[0], w4.inputs[1])
    weights = [sep.outputs[0], sep.outputs[1], sep.outputs[2], w4.outputs[0]]
    acc = None
    for c, w in zip(colors, weights):
        sc = nt.nodes.new('ShaderNodeVectorMath')
        sc.operation = 'SCALE'
        sc.inputs[0].default_value = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2)
        nt.links.new(w, sc.inputs['Scale'])
        if acc is None:
            acc = sc.outputs[0]
        else:
            ad = nt.nodes.new('ShaderNodeVectorMath')
            ad.operation = 'ADD'
            nt.links.new(acc, ad.inputs[0])
            nt.links.new(sc.outputs[0], ad.inputs[1])
            acc = ad.outputs[0]
    ao = nt.nodes.new('ShaderNodeVectorMath')
    ao.operation = 'SCALE'
    nt.links.new(acc, ao.inputs[0])
    nt.links.new(attr.outputs['Alpha'], ao.inputs['Scale'])
    nt.links.new(ao.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    if not ob.data.materials:
        ob.data.materials.append(mat)
    else:
        ob.data.materials[0] = mat
    return mat


def vertex_color_material(ob, name):
    """A material that displays the baked vertex colour (for previews)."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf and 'Col' in ob.data.color_attributes:
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMath')
        mix.operation = 'MULTIPLY'
        nt.links.new(attr.outputs['Alpha'], mix.inputs[0])
        mix.inputs[1].default_value = 0.35
        nt.links.new(mix.outputs[0], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.55
    if not ob.data.materials:
        ob.data.materials.append(mat)
    else:
        ob.data.materials[0] = mat
    return mat
