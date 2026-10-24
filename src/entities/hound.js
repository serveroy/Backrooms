// Hounds — gaunt humanoids that run on all fours with long matted hair.
// They are cowards: hold eye contact and they hesitate and flee. Turn
// your back or run, and they charge.
//
// Model + animations: tools/blender/hound.py

import { Entity } from './base.js';
import { instantiate, Animset, bone, markFacing, aimBone, locomotion } from './models.js';

export class Hound extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'hound', radius: 0.32 });
    const skin = this.mat({
      vertexColors: true,
      regions: [[0.33, 0.31, 0.29], [0.3, 0.2, 0.18], [0.03, 0.025, 0.02], [0.035, 0.03, 0.025]],
      wet: 0.45,
      rim: 0.05,
    });
    this.inst = instantiate('hound', () => skin);
    this.head = bone(this.inst, 'head');
    this.obj.add(this.inst.root);
    markFacing(this.head);
    this.anim = new Animset(this.inst);
    this.anim.play('idle', { fade: 0 });
    this.inst.mixer.setTime(Math.random() * 3);
    this.setState('roam');
    this.fearT = 0;
    this.growlT = 3 + Math.random() * 4;
    this.unwatched = 0;
    this.lookW = 0;
  }

  animate(dt) {
    const sp = Math.hypot(this.vx, this.vz);
    const s = this.state;
    if (this.anim.oneShot) {
      // let the lunge finish
    } else if (s === 'hesitate') this.anim.play('hesitate', { fade: 0.3 });
    else if (s === 'stalk' && sp < 1.4) {
      if (sp > 0.15) {
        this.anim.play('stalk', { fade: 0.35 });
        this.anim.speed(Math.min(1.8, Math.max(0.4, sp / 0.6)));
      } else this.anim.play('idle', { fade: 0.4 });
    } else locomotion(this.anim, sp, { walk: 0.8, run: 3.4, runAt: 2.2 });
    this.anim.update(dt);
    // it watches you while it decides
    const want = s === 'stalk' || s === 'hesitate' || s === 'charge' ? 1 : 0;
    this.lookW += (want - this.lookW) * Math.min(1, dt * 3);
    if (this.lookW > 0.01) {
      this.obj.updateMatrixWorld(true);
      aimBone(this.head, this.game.camera.position, this.lookW * 0.8, 0.7);
    }
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
          this.anim.play('attack', { fade: 0.08, once: true });
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
  }

  tick(dt) {
    super.tick(dt);
    this.animate(dt);
  }
}
