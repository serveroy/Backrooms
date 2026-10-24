// Reusable procedural humanoid rig + walk cycle.

import * as THREE from 'three';
import { limb, sphere } from './base.js';

/**
 * opts: { height, skin, shirt, pants, head (material), headScale, armLen, neck, build }
 * Returns rig { root, hips, torso, chest, neck, head, arms[], legs[] }
 */
export function makeHumanoid(mats, opts = {}) {
  const H = opts.height ?? 1.75;
  const k = H / 1.75;
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.92 * k;
  root.add(hips);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32 * k, 0.18 * k, 0.2 * k), mats.pants);
  hips.add(pelvis);
  const torso = new THREE.Group();
  hips.add(torso);
  const tg = new THREE.CylinderGeometry(0.19 * k * (opts.build ?? 1), 0.16 * k, 0.56 * k, 10);
  tg.translate(0, 0.3 * k, 0);
  const tm = new THREE.Mesh(tg, mats.shirt);
  tm.scale.set(1, 1, 0.62);
  torso.add(tm);
  const chest = new THREE.Group();
  chest.position.y = 0.56 * k;
  torso.add(chest);
  const neck = new THREE.Group();
  chest.add(neck);
  const nLen = (opts.neck ?? 0.1) * k;
  const ng = new THREE.CylinderGeometry(0.05 * k, 0.06 * k, nLen + 0.04, 8);
  ng.translate(0, nLen / 2, 0);
  neck.add(new THREE.Mesh(ng, mats.skin));
  const head = new THREE.Group();
  head.position.y = nLen + 0.02;
  neck.add(head);
  const skull = sphere(0.115 * k, mats.head || mats.skin, 14);
  const hs = opts.headScale || [0.85, 1.12, 0.98];
  skull.scale.set(hs[0], hs[1], hs[2]);
  skull.position.y = 0.12 * k;
  head.add(skull);
  const arms = [];
  const armLen = opts.armLen ?? 1;
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(0.21 * k * side, -0.04 * k, 0);
    chest.add(sh);
    const upper = limb(0.3 * k * armLen, 0.055 * k, 0.045 * k, mats.sleeve || mats.shirt);
    sh.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3 * k * armLen;
    upper.add(elbow);
    const fore = limb(0.28 * k * armLen, 0.045 * k, 0.035 * k, mats.skin);
    elbow.add(fore);
    const hand = sphere(0.045 * k, mats.skin, 6);
    hand.scale.set(0.8, 1.3, 0.5);
    hand.position.y = -0.3 * k * armLen;
    fore.add(hand);
    arms.push({ sh, upper, elbow, fore, side });
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.1 * k * side, -0.04 * k, 0);
    hips.add(hip);
    const thigh = limb(0.44 * k, 0.08 * k, 0.06 * k, mats.pants);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44 * k;
    thigh.add(knee);
    const shin = limb(0.42 * k, 0.06 * k, 0.045 * k, mats.pants);
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.07 * k, 0.24 * k), mats.shoes || mats.pants);
    foot.position.set(0, -0.44 * k, -0.05 * k);
    shin.add(foot);
    legs.push({ hip, thigh, knee, shin, side });
  }
  return { root, hips, torso, chest, neck, head, arms, legs, k };
}

/** Animate a humanoid rig. speed in m/s; t accumulates phase. */
export function animateWalk(rig, phase, speed, dt, opts = {}) {
  const amp = Math.min(1, speed / 1.6);
  const run = speed > 2.6;
  const k = rig.k;
  rig.hips.position.y = 0.92 * k + Math.abs(Math.sin(phase)) * 0.04 * amp - (opts.crouch ?? 0);
  rig.torso.rotation.x = -(run ? 0.25 : 0.04) * amp - (opts.lean ?? 0);
  for (const a of rig.arms) {
    const s = Math.sin(phase + (a.side > 0 ? 0 : Math.PI));
    a.upper.rotation.x = s * 0.5 * amp * (opts.armSwing ?? 1) + (opts.armsUp ?? 0);
    a.upper.rotation.z = a.side * (0.06 + (opts.armSpread ?? 0));
    a.elbow.rotation.x = run ? 0.9 : 0.25 + Math.max(0, s) * 0.3 * amp;
  }
  for (const l of rig.legs) {
    const s = Math.sin(phase + (l.side > 0 ? Math.PI : 0));
    l.thigh.rotation.x = s * 0.55 * amp;
    l.knee.rotation.x = -(Math.max(0, -s) * 0.9 * amp + 0.05);
  }
  void dt;
}
