// Phantoms — hallucinations. A dark figure standing at the edge of your
// vision. Look straight at it and there is nothing there.

import { Entity } from './base.js';
import { makeHumanoid } from './humanoid.js';

export class Phantom extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'phantom', radius: 0.25 });
    const black = this.mat({ tint: [0, 0, 0] });
    this.rig = makeHumanoid({ skin: black, shirt: black, pants: black, shoes: black }, { height: 1.95, armLen: 1.2, neck: 0.15 });
    this.obj.add(this.rig.root);
    for (const a of this.rig.arms) a.upper.rotation.z = a.side * 0.08;
    this.life = 3 + Math.random() * 4;
  }

  update(dt) {
    const p = this.player;
    this.turnTo(p.x, p.z, dt, 10);
    this.life -= dt;
    // gone the moment you look at it, or come close
    if (this.playerLookCos(1.3) > 0.88 || this.distToPlayer() < 4 || this.life <= 0) {
      if (this.playerLookCos(1.3) > 0.88) this.game.audio.play('static', { gain: 0.15, dur: 0.15 });
      this.remove();
    }
  }

  updateLight() {}
}
