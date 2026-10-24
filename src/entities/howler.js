// The Howler — a tall, emaciated thing that runs on all fours (tribute to
// the creature in Kane Pixels' found footage). It stalks, notices, howls,
// then chases. Break line of sight and it eventually loses you.
//
// Model + animations: tools/blender/howler.py

import * as THREE from 'three';
import { Entity, sphere } from './base.js';
import { instantiate, Animset, bone, markFacing, aimBone } from './models.js';
import { clamp } from '../core/rng.js';

const _t = new THREE.Vector3();

export class Howler extends Entity {
  constructor(game, x, z, opts = {}) {
    super(game, x, z, { name: 'howler', radius: 0.32 });
    this.chaseSpeed = opts.chaseSpeed ?? 5.0;
    this.relentless = !!opts.relentless; // Level ! variant never gives up
    this.damage = opts.damage ?? 55;
    this.build();
    this.setState(opts.state || 'stalk');
    this.howlT = 8 + Math.random() * 10;
    this.stepT = 0;
    this.memory = 4.5;
    this.searchT = 0;
    this.lookW = 0;
  }

  build() {
    const skin = this.mat({ vertexColors: true, regions: [[0.16, 0.15, 0.15], [0, 0, 0], [0, 0, 0], [0.1, 0.1, 0.1]], wet: 0.8, rim: 0.05 });
    this.inst = instantiate('howler', () => skin);
    this.head = bone(this.inst, 'head');
    // faint eyeshine set deep in the sockets: the only thing you see in the dark.
    // Placed in model space, before the model joins the entity transform.
    if (this.head) {
      const eyeMat = this.mat({ tint: [0.25, 0.25, 0.22], emissive: [0.65, 0.65, 0.58] });
      for (const sx of [-0.033, 0.033]) {
        const e = sphere(0.011, eyeMat, 6);
        e.position.copy(this.head.worldToLocal(_t.set(sx, 2.42, -0.288)));
        this.head.add(e);
      }
    }
    this.obj.add(this.inst.root);
    markFacing(this.head);
    this.anim = new Animset(this.inst);
    this.anim.play('stalk', { fade: 0 });
  }

  animate(dt) {
    const sp = Math.hypot(this.vx, this.vz);
    const s = this.state;
    if (this.anim.oneShot) {
      // let the lunge play out
    } else if (s === 'notice') this.anim.play('notice', { fade: 0.2 });
    else if (s === 'chase') {
      this.anim.play('run', { fade: 0.25 });
      this.anim.speed(clamp(sp / 4.6, 0.6, 1.4));
    } else if (sp > 0.35) {
      this.anim.play('stalk', { fade: 0.35 });
      this.anim.speed(clamp(sp / 1.5, 0.5, 1.8));
    } else this.anim.play('idle', { fade: 0.5 });
    this.anim.update(dt);
    // the head turns to follow you when it knows where you are
    const want = s === 'notice' || s === 'chase' || (this.lastSeenT < 1 && this.distToPlayer() < 20) ? 1 : 0;
    this.lookW += (want - this.lookW) * Math.min(1, dt * 3);
    if (this.lookW > 0.01) {
      this.obj.updateMatrixWorld(true);
      const cam = this.game.camera.position;
      aimBone(this.head, _t.copy(cam), this.lookW, 0.9);
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
            this.anim.play('attack', { fade: 0.08, once: true, speed: 1.3 });
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
  }

  tick(dt) {
    super.tick(dt);
    // animation runs after the entity has moved and synced its transform
    this.animate(dt);
  }
}
