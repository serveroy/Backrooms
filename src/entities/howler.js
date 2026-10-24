// The Howler — a tall, emaciated thing that runs on all fours (tribute to
// the creature in Kane Pixels' found footage). It stalks, notices, howls,
// then chases. Break line of sight and it eventually loses you.

import * as THREE from 'three';
import { Entity, limb, sphere } from './base.js';
import { clamp } from '../core/rng.js';

export class Howler extends Entity {
  constructor(game, x, z, opts = {}) {
    super(game, x, z, { name: 'howler', radius: 0.32 });
    this.chaseSpeed = opts.chaseSpeed ?? 5.0;
    this.relentless = !!opts.relentless; // Level ! variant never gives up
    this.damage = opts.damage ?? 55;
    this.build();
    this.setState(opts.state || 'stalk');
    this.gaitPhase = Math.random() * 6;
    this.lean = 0.3;
    this.howlT = 8 + Math.random() * 10;
    this.stepT = 0;
    this.memory = 4.5;
    this.searchT = 0;
  }

  build() {
    const skin = this.mat({ tint: [0.045, 0.042, 0.042], rim: 0.06 });
    const skin2 = this.mat({ tint: [0.07, 0.064, 0.062], rim: 0.08 });
    const root = this.obj;
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.95;
    root.add(hips);
    const pelvis = sphere(0.13, skin, 9);
    pelvis.scale.set(1.1, 0.8, 0.8);
    hips.add(pelvis);
    // torso pointing up from the hips
    const torso = (this.torso = new THREE.Group());
    hips.add(torso);
    const belly = new THREE.CylinderGeometry(0.11, 0.1, 0.45, 9);
    belly.translate(0, 0.24, 0);
    const bm = new THREE.Mesh(belly, skin);
    bm.scale.set(1, 1, 0.7);
    torso.add(bm);
    const cage = new THREE.CylinderGeometry(0.19, 0.12, 0.5, 10);
    cage.translate(0, 0.68, 0);
    const cm = new THREE.Mesh(cage, skin);
    cm.scale.set(1, 1, 0.72);
    torso.add(cm);
    // ribs + spine ridge for an emaciated look
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.155 - i * 0.012, 0.014, 4, 12), skin2);
      r.rotation.x = Math.PI / 2;
      r.scale.set(1, 0.75, 1);
      r.position.y = 0.5 + i * 0.075;
      torso.add(r);
    }
    for (let i = 0; i < 9; i++) {
      const v = sphere(0.028 - i * 0.0012, skin2, 6);
      v.position.set(0, 0.12 + i * 0.095, 0.085 + Math.sin(i * 0.4) * 0.02);
      torso.add(v);
    }
    // shoulder blades jutting out
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.03), skin2);
      b.position.set(0.09 * sx, 0.8, 0.09);
      b.rotation.set(-0.3, 0, 0.2 * sx);
      torso.add(b);
    }
    const chest = (this.chest = new THREE.Group());
    chest.position.y = 0.88;
    torso.add(chest);
    // long neck + small tilted head
    const neck = (this.neck = new THREE.Group());
    chest.add(neck);
    const nGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.46, 7);
    nGeo.translate(0, 0.23, 0);
    neck.add(new THREE.Mesh(nGeo, skin));
    const head = (this.head = new THREE.Group());
    head.position.y = 0.46;
    neck.add(head);
    const skull = sphere(0.11, skin2, 12);
    skull.scale.set(0.82, 1.3, 1.1);
    skull.position.set(0, 0.08, 0.01);
    head.add(skull);
    const jaw = sphere(0.075, skin, 9);
    jaw.scale.set(0.78, 1.25, 0.95);
    jaw.position.set(0, -0.04, -0.05);
    jaw.rotation.x = 0.35;
    head.add(jaw);
    // faint eyeshine — the only thing you see in the dark
    for (const sx of [-0.036, 0.036]) {
      const e = sphere(0.013, this.mat({ tint: [0.2, 0.2, 0.18], emissive: [0.55, 0.55, 0.5] }), 6);
      e.position.set(sx, 0.1, -0.095);
      head.add(e);
    }
    // arms (very long)
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(0.2 * side, -0.05, 0);
      chest.add(sh);
      const joint = sphere(0.055, skin, 7);
      sh.add(joint);
      const upper = limb(0.75, 0.055, 0.04, skin);
      sh.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.75;
      upper.add(elbow);
      elbow.add(sphere(0.042, skin2, 6));
      const fore = limb(0.82, 0.04, 0.026, skin);
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.82;
      fore.add(hand);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.025), skin);
      palm.position.y = -0.03;
      hand.add(palm);
      for (let f = 0; f < 4; f++) {
        const fing = limb(0.2, 0.011, 0.004, skin2, 4);
        fing.position.set((f - 1.5) * 0.019, -0.06, 0);
        fing.rotation.z = (f - 1.5) * 0.1;
        fing.rotation.x = 0.25;
        hand.add(fing);
      }
      this.arms.push({ sh, upper, elbow, fore, side });
    }
    // digitigrade legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(0.12 * side, 0, 0);
      hips.add(hip);
      const thigh = limb(0.55, 0.075, 0.05, skin);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.55;
      thigh.add(knee);
      knee.add(sphere(0.05, skin2, 6));
      const shin = limb(0.62, 0.05, 0.03, skin);
      knee.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.035, 0.24), skin);
      foot.position.set(0, -0.62, -0.08);
      shin.add(foot);
      this.legs.push({ hip, thigh, knee, shin, side });
    }
  }

  pose(dt) {
    const run = this.state === 'chase' || this.state === 'charge';
    const walk = this.state === 'stalk' || this.state === 'search' || this.state === 'leave';
    const speed = Math.hypot(this.vx, this.vz);
    const targetLean = run ? 1.25 : walk ? 0.55 : 0.18;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 4);
    this.gaitPhase += dt * (run ? 11 : 3.2) * Math.min(1.2, 0.25 + speed / (run ? 5 : 1.5));
    const ph = this.gaitPhase;
    const L = this.lean;
    this.torso.rotation.x = -L + Math.sin(ph * 2) * (run ? 0.06 : 0.02);
    this.hips.position.y = (run ? 0.8 : 0.98) + Math.abs(Math.sin(ph)) * (run ? 0.1 : 0.03);
    // head looks forward / tilts while listening
    this.neck.rotation.x = L * 0.75 - 0.1;
    const tilt = this.state === 'notice' || this.state === 'search' ? 0.55 * Math.sin(this.stateT * 1.3 + 0.8) : 0.12;
    this.head.rotation.z += (tilt - this.head.rotation.z) * Math.min(1, dt * 5);
    for (const a of this.arms) {
      const s = a.side;
      const swing = run ? Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.9 : walk ? Math.sin(ph + (s > 0 ? 0 : Math.PI)) * 0.35 : Math.sin(this.age * 0.8 + s) * 0.05;
      // counter the torso lean so arms reach toward the ground ahead
      a.upper.rotation.x = L * (run ? 1.1 : 0.85) + swing + (run ? 0.25 : 0);
      a.upper.rotation.z = s * (run ? 0.18 : 0.1);
      a.elbow.rotation.x = run ? -0.4 + Math.max(0, -swing) * 0.6 : -0.15;
    }
    for (const l of this.legs) {
      const s = l.side;
      const swing = run ? Math.sin(ph + (s > 0 ? Math.PI * 0.5 : Math.PI * 1.5)) * 0.85 : walk ? Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.4 : 0;
      l.thigh.rotation.x = swing + (run ? -0.35 : 0);
      l.knee.rotation.x = run ? 0.6 + Math.max(0, swing) * 0.8 : walk ? 0.2 + Math.max(0, swing) * 0.5 : 0.08;
    }
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    const sees = this.seesPlayer(28, -0.15) || (d < 5 && this.seesPlayer(5));
    const heard = g.noise > 0.6 && d < 16 * g.noise;
    if (sees || heard) {
      this.lastSeen = [p.x, p.z];
      this.lastSeenT = 0;
    } else this.lastSeenT += dt;

    switch (this.state) {
      case 'stalk': {
        this.disturb = 6;
        // it senses the general area and closes in slowly
        if (d > 9) this.chase(1.5, dt);
        else this.wander(dt, 0.8);
        this.howlT -= dt;
        if (this.howlT <= 0) {
          this.howlT = 18 + Math.random() * 20;
          this.sound('howl', { gain: 0.45, dur: 1.8 });
          g.caption('[a distant, strained howl]');
        }
        if (sees && d < 26) {
          this.setState('notice');
          this.sound('howl', { gain: 1.0, dur: 2.3 });
          g.caption('[HOWLING]');
          g.onEntityNoticed(this);
        }
        break;
      }
      case 'notice':
        this.disturb = 8;
        this.move(0, 0, 0, dt);
        this.turnTo(p.x, p.z, dt, 4);
        if (this.stateT > 1.15) this.setState('chase');
        break;
      case 'chase': {
        this.disturb = 10;
        const sp = this.chaseSpeed * clamp(0.7 + this.stateT * 0.15, 0.7, 1);
        if (this.lastSeenT < this.memory || this.relentless) this.chase(sp, dt);
        else {
          this.setState('search');
          this.searchT = 0;
        }
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = 0.36;
          this.sound('gallop', { gain: 0.8 });
        }
        if (d < 1.1 && Math.abs(p.y - this.y) < 1.5) {
          if (this.hitPlayer(this.damage, 'Torn apart by the Howler')) {
            this.sound('howl', { gain: 1.0, dur: 1.2 });
          }
        }
        break;
      }
      case 'search': {
        this.disturb = 7;
        if (sees) {
          this.setState('chase');
          break;
        }
        const arrived = this.lastSeen ? this.goTo(this.lastSeen[0], this.lastSeen[1], 2.8, dt) : true;
        if (arrived) this.wander(dt, 1.0);
        if (this.stateT > 14) this.setState('leave');
        break;
      }
      case 'leave': {
        this.disturb = 5;
        const dx = this.x - p.x;
        const dz = this.z - p.z;
        const l = Math.hypot(dx, dz) || 1;
        this.goTo(this.x + (dx / l) * 5, this.z + (dz / l) * 5, 2.2, dt);
        if (sees && d < 14) this.setState('chase');
        if (d > 32 && !sees) this.remove();
        break;
      }
    }
    this.pose(dt);
  }
}
