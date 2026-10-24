// Facelings — people without faces. Mostly harmless, mostly wandering.
// Get too close for too long and they turn to "look" at you anyway.
//
// Model + animations: tools/blender/human.py (faceling)

import { Entity } from './base.js';
import { instantiate, Animset, bone, markFacing, aimBone, locomotion } from './models.js';

const SKINS = [
  [0.78, 0.64, 0.55],
  [0.62, 0.47, 0.37],
  [0.45, 0.33, 0.25],
  [0.84, 0.72, 0.62],
];
const SHIRTS = [
  [0.34, 0.37, 0.42],
  [0.45, 0.33, 0.27],
  [0.27, 0.33, 0.29],
  [0.56, 0.54, 0.5],
  [0.52, 0.2, 0.18],
  [0.2, 0.24, 0.36],
];
const PANTS = [
  [0.14, 0.14, 0.16],
  [0.18, 0.22, 0.32],
  [0.3, 0.27, 0.22],
];
const HAIR = [
  [0.07, 0.05, 0.04],
  [0.16, 0.1, 0.06],
  [0.05, 0.05, 0.05],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Faceling extends Entity {
  constructor(game, x, z, opts = {}) {
    super(game, x, z, { name: 'faceling', radius: 0.28 });
    const child = opts.child ?? Math.random() < 0.2;
    const skin = this.mat({ vertexColors: true, regions: [pick(SKINS), pick(SHIRTS), pick(PANTS), pick(HAIR)], rim: 0.03 });
    this.inst = instantiate('faceling', () => skin);
    this.inst.root.scale.setScalar(child ? 0.64 : 0.96 + Math.random() * 0.08);
    this.head = bone(this.inst, 'head');
    this.obj.add(this.inst.root);
    markFacing(this.head);
    this.anim = new Animset(this.inst);
    this.anim.play('walk', { fade: 0 });
    this.inst.mixer.setTime(Math.random() * 2);
    this.setState('walk');
    this.whisperT = 4;
    this.speed = 0.7 + Math.random() * 0.3;
    this.lookW = 0;
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    switch (this.state) {
      case 'walk':
        this.wander(dt, this.speed);
        if (d < 3.2 && this.seesPlayer(4)) this.setState('stare');
        if (d > 45) this.remove();
        break;
      case 'stare':
        this.move(0, 0, 0, dt);
        this.turnTo(p.x, p.z, dt, 2);
        g.fear = Math.min(1, g.fear + dt * 0.08);
        this.whisperT -= dt;
        if (this.whisperT <= 0) {
          this.whisperT = 5 + Math.random() * 4;
          this.sound('whisper', { gain: 0.35, dur: 1.4 });
          g.caption('[the faceless one murmurs]');
        }
        if (d > 5 || this.stateT > 12) this.setState('walk');
        break;
    }
  }

  tick(dt) {
    super.tick(dt);
    const sp = Math.hypot(this.vx, this.vz);
    const scale = this.inst.root.scale.x;
    if (this.state === 'stare' && sp < 0.15) this.anim.play('stare', { fade: 0.6 });
    else locomotion(this.anim, sp / scale, { walk: 1.06, run: 3.6 });
    this.anim.update(dt);
    // the blank face follows you
    const want = this.state === 'stare' ? 1 : 0;
    this.lookW += (want - this.lookW) * Math.min(1, dt * 2);
    if (this.lookW > 0.01) {
      this.obj.updateMatrixWorld(true);
      aimBone(this.head, this.game.camera.position, this.lookW, 0.8);
    }
  }
}
