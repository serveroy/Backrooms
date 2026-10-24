// Partygoers — yellow figures with a crude drawn smile "=)". They have no
// eyes and hunt by sound. Sprint and they find you. Crouch and pray.

import { Entity } from './base.js';
import { makeHumanoid, animateWalk } from './humanoid.js';
import { registerRecipes, getTexture } from '../world/textures.js';

registerRecipes({
  partyFace: () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#e8c53a';
    g.fillRect(0, 0, 512, 256);
    // "=)" drawn crudely on the front (u = 0.75)
    g.strokeStyle = '#141008';
    g.lineCap = 'round';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(340, 95);
    g.lineTo(372, 97);
    g.moveTo(340, 135);
    g.lineTo(372, 133);
    g.stroke();
    g.beginPath();
    g.arc(388, 115, 52, -1.0, 1.0);
    g.stroke();
    return { canvas: c, worldW: 1, worldH: 1 };
  },
});

export class Partygoer extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'partygoer', radius: 0.3 });
    const yellow = this.mat({ tint: [0.92, 0.76, 0.22] });
    const mats = {
      skin: yellow,
      head: this.mat({ map: getTexture('partyFace') }),
      shirt: yellow,
      pants: yellow,
      shoes: this.mat({ tint: [0.7, 0.55, 0.15] }),
    };
    this.rig = makeHumanoid(mats, { height: 1.85 + Math.random() * 0.15, headScale: [0.95, 1.05, 0.95], build: 1.1 });
    this.obj.add(this.rig.root);
    this.phase = 0;
    this.target = null;
    this.setState('wander');
    this.voiceT = 3 + Math.random() * 6;
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    // hearing: sprint is loud, walking audible nearby, crouching nearly silent
    const hearR = g.noise > 0.8 ? 32 : g.noise > 0.3 ? 11 : g.noise > 0.05 ? 2.6 : 0;
    if (d < hearR) {
      this.target = [p.x, p.z];
      if (this.state !== 'hunt') {
        this.setState('hunt');
        this.sound('partyVoice', { gain: 0.7 });
        g.caption('["Hey! Want to party? =)"]');
        g.onEntityNoticed(this);
      }
    }
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = 6 + Math.random() * 8;
      this.sound(Math.random() < 0.5 ? 'partyHorn' : 'partyVoice', { gain: 0.45 });
    }
    switch (this.state) {
      case 'wander':
        this.wander(dt, 1.1);
        if (d > 55) this.remove();
        break;
      case 'hunt': {
        if (!this.target) {
          this.setState('wander');
          break;
        }
        const close = d < 7 && this.seesPlayer(7);
        if (close) this.chase(5.2, dt);
        else {
          const arrived = this.goTo(this.target[0], this.target[1], 4.6, dt);
          if (arrived) {
            this.target = null;
            this.setState('listen');
          }
        }
        if (d < 1.0 && this.hitPlayer(45, 'The Partygoers found you =)')) {
          this.sound('partyHorn', { gain: 0.9 });
          this.setState('listen');
        }
        break;
      }
      case 'listen':
        this.move(0, 0, 0, dt);
        this.rig.head.rotation.z = Math.sin(this.stateT * 2) * 0.4;
        if (this.stateT > 4) this.setState('wander');
        break;
    }
    const sp = Math.hypot(this.vx, this.vz);
    this.phase += dt * sp * 3.6;
    animateWalk(this.rig, this.phase, sp, dt, { armSpread: sp > 3 ? 0.5 : 0.1, armsUp: sp > 3 ? -0.6 : 0 });
  }
}
