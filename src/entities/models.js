// Creature model library: parses the Blender-built GLBs once, then hands
// out independently animated clones (skeleton included).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const lib = new Map();
let loading = null;

function decode(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** sources: { name: dataUrl } (GLBs inlined into the bundle as base64). */
export function loadModels(sources) {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all(
    Object.entries(sources).map(
      ([name, src]) =>
        new Promise((resolve) => {
          try {
            loader.parse(
              decode(src),
              '',
              (gltf) => {
                lib.set(name, gltf);
                resolve();
              },
              (err) => {
                console.error('model failed', name, err);
                resolve();
              }
            );
          } catch (err) {
            console.error('model failed', name, err);
            resolve();
          }
        })
    )
  );
  return loading;
}

/**
 * Clone a model. matFor(materialName, mesh) returns the material to use.
 * Returns { root, mixer, actions, bones, meshes }.
 */
export function instantiate(name, matFor) {
  const gltf = lib.get(name);
  if (!gltf) return null;
  const root = SkeletonUtils.clone(gltf.scene);
  const meshes = [];
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.material = matFor(o.material?.name || '', o);
      o.frustumCulled = false;
      meshes.push(o);
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  root.updateMatrixWorld(true);
  return { root, mixer, actions, bones, meshes };
}

/** Bone lookup tolerant of glTF name sanitising ("upperarm.L" -> "upperarmL"). */
export function bone(inst, name) {
  return inst.bones[name] || inst.bones[name.replace(/[.\s]/g, '')] || inst.bones[name.replace(/\./g, '_')];
}

/**
 * Small animation state machine on top of an AnimationMixer:
 * play(name) cross-fades; one-shots return to the previous loop.
 */
export class Animset {
  constructor(inst) {
    this.inst = inst;
    this.current = null;
    this.name = '';
    this.oneShot = null;
  }

  play(name, { fade = 0.3, speed = 1, once = false } = {}) {
    const a = this.inst.actions[name];
    if (!a) return;
    if (this.name === name && !once) {
      a.timeScale = speed;
      return;
    }
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.timeScale = speed;
    if (once) {
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      this.oneShot = { name, back: this.name };
    } else {
      a.setLoop(THREE.LoopRepeat, Infinity);
    }
    a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.name = name;
  }

  speed(s) {
    if (this.current) this.current.timeScale = s;
  }

  update(dt) {
    this.inst.mixer.update(dt);
    if (this.oneShot) {
      const a = this.inst.actions[this.oneShot.name];
      if (a && !a.isRunning()) {
        const back = this.oneShot.back;
        this.oneShot = null;
        if (back) this.play(back, { fade: 0.25 });
      }
    }
  }
}

/**
 * Pick idle / walk / run from ground speed and scale playback so feet match
 * the ground. refs: { walk: m/s the walk clip covers, run: m/s for the run clip }.
 */
export function locomotion(anim, sp, refs, extra = {}) {
  if (anim.oneShot) return;
  if (sp > (refs.runAt ?? 2.4) && anim.inst.actions.run) {
    anim.play('run', { fade: 0.25 });
    anim.speed(Math.min(1.6, Math.max(0.6, sp / refs.run)));
  } else if (sp > 0.15) {
    anim.play(extra.walk || 'walk', { fade: 0.3 });
    anim.speed(Math.min(1.8, Math.max(0.35, sp / refs.walk)));
  } else {
    anim.play(extra.idle || 'idle', { fade: 0.45 });
    anim.speed(1);
  }
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();

/** Remember which way a bone "faces" in the rest pose (call right after instantiate). */
export function markFacing(b, forward = new THREE.Vector3(0, 0, -1)) {
  if (!b) return;
  b.getWorldQuaternion(_qa);
  b.userData.face = forward.clone().applyQuaternion(_qa.invert());
}

/**
 * Turn a bone (after animation has been applied) so it faces a world-space
 * target, by at most maxAngle radians, blended by weight.
 */
export function aimBone(b, target, weight = 1, maxAngle = 1.0) {
  if (!b || !b.userData.face || weight <= 0.001) return;
  b.updateWorldMatrix(true, false);
  b.getWorldQuaternion(_qa);
  const cur = _va.copy(b.userData.face).applyQuaternion(_qa).normalize();
  b.getWorldPosition(_vb);
  const want = _vb.subVectors(target, _vb).normalize();
  _qb.setFromUnitVectors(cur, want);
  // clamp the turn
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_qb.w)));
  const k = ang > maxAngle ? maxAngle / ang : 1;
  _qc.identity().slerp(_qb, k * weight);
  // world delta -> parent space, applied on top of the animated local rotation
  b.parent.getWorldQuaternion(_qa);
  const pInv = _qb.copy(_qa).invert();
  b.quaternion.premultiply(pInv.multiply(_qc).multiply(_qa));
  b.updateMatrixWorld(true);
}
