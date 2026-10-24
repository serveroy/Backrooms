// Facelings — people without faces. Mostly harmless, mostly wandering.
// Get too close for too long and they turn to "look" at you anyway.

import { Entity } from './base.js';
import { makeHumanoid, animateWalk } from './humanoid.js';

const SHIRTS = [
  [0.32, 0.34, 0.38],
  [0.4, 0.3, 0.25],
  [0.25, 0.3, 0.27],
  [0.5, 0.48, 0.44],
];

export class Faceling extends Entity {
  constructor(game, x, z, opts = {}) {
    super(game, x, z, { name: 'faceling', radius: 0.28 });
    const child = opts.child ?? Math.random() < 0.2;
    const skinT = [0.72, 0.62, 0.55];
    const shirt = SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
    const mats = {
      skin: this.mat({ tint: skinT }),
      shirt: this.mat({ tint: shirt }),
      pants: this.mat({ tint: [0.14, 0.14, 0.16] }),
      shoes: this.mat({ tint: [0.06, 0.05, 0.05] }),
    };
    this.rig = makeHumanoid(mats, { height: child ? 1.15 : 1.72 + Math.random() * 0.12, headScale: [0.86, 1.18, 0.95] });
    this.obj.add(this.rig.root);
    this.phase = Math.random() * 6;
    this.setState('walk');
    this.whisperT = 4;
    this.speed = 0.7 + Math.random() * 0.3;
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
    const sp = Math.hypot(this.vx, this.vz);
    this.phase += dt * sp * 4.2;
    animateWalk(this.rig, this.phase, sp, dt);
    this.rig.head.rotation.x = this.state === 'stare' ? -0.15 : 0;
  }
}
