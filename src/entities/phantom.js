// Phantoms — hallucinations. A dark figure standing at the edge of your
// vision. Look straight at it and there is nothing there.
//
// Model + animation: tools/blender/human.py (phantom)

import { Entity } from './base.js';
import { instantiate, Animset } from './models.js';

export class Phantom extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'phantom', radius: 0.25 });
    const black = this.mat({ tint: [0, 0, 0] });
    this.inst = instantiate('phantom', () => black);
    this.obj.add(this.inst.root);
    this.anim = new Animset(this.inst);
    this.anim.play('idle', { fade: 0 });
    this.inst.mixer.setTime(Math.random() * 5);
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

  tick(dt) {
    super.tick(dt);
    this.anim.update(dt);
  }

  updateLight() {}
}
