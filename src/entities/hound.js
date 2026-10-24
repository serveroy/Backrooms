// Hounds — gaunt humanoids that run on all fours with long matted hair.
// They are cowards: hold eye contact and they hesitate and flee. Turn
// your back or run, and they charge.

import * as THREE from 'three';
import { Entity, limb, sphere } from './base.js';

export class Hound extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'hound', radius: 0.32 });
    this.build();
    this.setState('roam');
    this.phase = Math.random() * 6;
    this.fearT = 0;
    this.growlT = 3 + Math.random() * 4;
    this.unwatched = 0;
  }

  build() {
    const skin = this.mat({ tint: [0.42, 0.38, 0.34], rim: 0.05 });
    const hair = this.mat({ tint: [0.05, 0.045, 0.04] });
    const root = this.obj;
    const body = (this.body = new THREE.Group());
    body.position.y = 0.62;
    root.add(body);
    // torso horizontal along -z (forward)
    const tg = new THREE.CylinderGeometry(0.15, 0.12, 0.8, 9);
    tg.rotateX(Math.PI / 2);
    const torso = new THREE.Mesh(tg, skin);
    torso.scale.set(1, 0.8, 1);
    body.add(torso);
    // spine bumps
    for (let i = 0; i < 7; i++) {
      const v = sphere(0.03, skin, 5);
      v.position.set(0, 0.12, -0.3 + i * 0.1);
      body.add(v);
    }
    // head low and forward, with long hair curtain
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.02, -0.5);
    body.add(head);
    const skull = sphere(0.12, skin, 10);
    skull.scale.set(0.85, 1.05, 1.05);
    head.add(skull);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const strand = limb(0.32 + Math.random() * 0.25, 0.022, 0.006, hair, 4);
      strand.position.set(Math.cos(a) * 0.08, 0.06, Math.sin(a) * 0.08 + 0.02);
      strand.rotation.set(-0.3 + Math.random() * 0.2, 0, Math.cos(a) * 0.25);
      head.add(strand);
    }
    for (let i = 0; i < 8; i++) {
      const strand = limb(0.25 + Math.random() * 0.2, 0.02, 0.006, hair, 4);
      strand.position.set((Math.random() - 0.5) * 0.15, 0.13, -0.25 + i * 0.07);
      strand.rotation.set(0.2, 0, (Math.random() - 0.5) * 0.6);
      body.add(strand);
    }
    // limbs: humanoid arms in front, legs behind
    this.limbs = [];
    for (const [side, front] of [
      [-1, 1],
      [1, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const p = new THREE.Group();
      p.position.set(0.13 * side, -0.02, front ? -0.32 : 0.32);
      body.add(p);
      const up = limb(0.34, 0.055, 0.04, skin);
      p.add(up);
      const j = new THREE.Group();
      j.position.y = -0.34;
      up.add(j);
      const lo = limb(0.32, 0.04, 0.028, skin);
      j.add(lo);
      const hand = sphere(0.045, skin, 6);
      hand.scale.set(1, 0.6, 1.5);
      hand.position.set(0, -0.32, -0.03);
      lo.add(hand);
      this.limbs.push({ up, j, side, front, off: (front ? 0 : Math.PI) + (side > 0 ? Math.PI * 0.5 : 0) });
    }
  }

  pose(dt) {
    const sp = Math.hypot(this.vx, this.vz);
    this.phase += dt * (2 + sp * 3.2);
    const amp = Math.min(1, sp / 2);
    for (const l of this.limbs) {
      const s = Math.sin(this.phase + l.off);
      l.up.rotation.x = (l.front ? 0.35 : -0.25) + s * 0.6 * amp;
      l.j.rotation.x = l.front ? -0.4 - Math.max(0, s) * 0.5 * amp : 0.6 + Math.max(0, -s) * 0.5 * amp;
    }
    this.body.position.y = 0.6 + Math.abs(Math.sin(this.phase)) * 0.05 * amp;
    const crouch = this.state === 'stalk' || this.state === 'hesitate' ? 0.08 : 0;
    this.body.position.y -= crouch;
    this.head.rotation.x = this.state === 'hesitate' ? 0.35 : -0.1;
    this.head.rotation.z = Math.sin(this.age * 2.3) * (this.state === 'roam' ? 0.15 : 0.05);
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    const sees = this.seesPlayer(20);
    const blackout = g.lightScale < 0.2;
    const hearR = (blackout ? 28 : 18) * g.noise;
    const knows = sees || (d < hearR && g.noise > 0.15);
    const stared = sees && this.playerLookCos(0.6) > 0.94 && d < 14;
    this.growlT -= dt;

    switch (this.state) {
      case 'roam':
        this.wander(dt, 0.9);
        if (knows) this.setState('stalk');
        if (d > 45) this.remove();
        break;
      case 'stalk': {
        this.disturb = 0;
        if (d > 4) this.chase(1.9, dt);
        else this.move(0, 0, 0, dt);
        this.turnTo(p.x, p.z, dt, 4);
        if (this.growlT <= 0) {
          this.growlT = 3 + Math.random() * 3;
          this.sound('growl', { gain: 0.5 });
          g.caption('[growling]');
        }
        if (stared) {
          this.setState('hesitate');
          break;
        }
        this.unwatched = sees ? this.unwatched + dt : 0;
        if ((d < 5 && this.unwatched > 1.4) || (g.noise > 0.8 && d < 12) || this.playerLookCos(0.6) < -0.3 && d < 8) {
          this.setState('charge');
          this.sound('bark', { gain: 0.8 });
          g.caption('[snarling bark]');
          g.onEntityNoticed(this);
        }
        if (!knows && this.stateT > 10) this.setState('roam');
        break;
      }
      case 'hesitate':
        // eye contact: it freezes, then backs away
        this.move(0, 0, 0, dt);
        this.turnTo(p.x, p.z, dt, 3);
        if (stared) this.fearT += dt;
        else this.fearT = Math.max(0, this.fearT - dt * 0.5);
        if (this.fearT > 2.2) {
          this.setState('flee');
          this.sound('growl', { gain: 0.35, dur: 0.8 });
        } else if (!stared && this.stateT > 1.2) this.setState(d < 6 ? 'charge' : 'stalk');
        break;
      case 'charge': {
        this.chase(5.1, dt);
        if (stared && this.stateT > 0.6) {
          this.fearT += dt * 1.5;
          if (this.fearT > 1.2) this.setState('hesitate');
        }
        if (d < 1.0 && this.hitPlayer(22, 'Mauled by a Hound')) {
          this.sound('growl', { gain: 0.8, dur: 0.6 });
          this.setState('retreat');
        }
        if (this.stateT > 12 && !sees) this.setState('roam');
        break;
      }
      case 'retreat':
      case 'flee': {
        const dx = this.x - p.x;
        const dz = this.z - p.z;
        const l = Math.hypot(dx, dz) || 1;
        this.goTo(this.x + (dx / l) * 4, this.z + (dz / l) * 4, this.state === 'flee' ? 4.2 : 3, dt);
        if (this.stateT > (this.state === 'flee' ? 5 : 2.5)) {
          this.fearT = 0;
          this.setState(this.state === 'flee' ? 'roam' : 'stalk');
        }
        break;
      }
    }
    this.pose(dt);
  }
}
