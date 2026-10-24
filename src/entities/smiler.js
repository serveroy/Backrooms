// Smilers — nothing but glowing teeth and eyes in the dark. Don't shine a
// light on them, don't run. Back away calmly and they lose interest.
//
// Model + animations: tools/blender/human.py (smiler)

import { Entity } from './base.js';
import { glowMaterial } from '../world/materials.js';
import { instantiate, Animset, bone, markFacing, aimBone } from './models.js';

export class Smiler extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'smiler', radius: 0.25 });
    this.glow = glowMaterial({ color: [1.7, 1.68, 1.6], opacity: 0 });
    // the body is darkness given a shape: only a light shone right at it shows it
    this.body = this.mat({ tint: [0, 0, 0], transparent: true, depthWrite: true, opacity: 0 });
    this.inst = instantiate('smiler', (name) => (name === 'glow' ? this.glow : this.body));
    this.head = bone(this.inst, 'head');
    this.obj.add(this.inst.root);
    markFacing(this.head);
    this.anim = new Animset(this.inst);
    this.anim.play('idle', { fade: 0 });
    this.inst.mixer.setTime(Math.random() * 5);
    this.opacity = 0;
    this.anger = 0;
    this.unseenT = 0;
    this.setState('watch');
    this.bobT = Math.random() * 10;
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    const sees = this.seesPlayer(30);
    const dark = (this.light ?? 0) < 0.12;
    this.bobT += dt;
    // face always turns to the player
    this.turnTo(p.x, p.z, dt, 3);
    let target = 0;

    switch (this.state) {
      case 'watch': {
        target = dark ? 1 : 0.15;
        if (!sees) this.unseenT += dt;
        else this.unseenT = 0;
        const lit = this.litByFlashlight(1.75);
        if (lit) this.anger += dt * 1.6;
        if (g.noise > 0.8 && sees && d < 14) this.anger += dt * 0.9;
        if (d < 2.2) this.anger += dt * 2.5;
        this.anger = Math.max(0, this.anger - dt * 0.15);
        // creeps closer while you're not looking
        if (this.playerLookCos(1.75) < 0.6 && d > 3.5 && dark) this.chase(0.55, dt);
        else this.move(0, 0, 0, dt);
        if (this.anger > 1) {
          this.setState('charge');
          this.sound('giggle', { gain: 0.6 });
          g.caption('[wet giggling]');
          g.onEntityNoticed(this);
        }
        if (this.unseenT > 7 || (!dark && this.stateT > 2 && d > 6)) this.setState('fade');
        break;
      }
      case 'charge': {
        target = 1;
        this.disturb = 5;
        this.chase(4.3, dt);
        if (d < 0.9) {
          this.hitPlayer(38, 'Caught by a Smiler');
          this.sound('screech', { gain: 0.6, dur: 0.8 });
          this.setState('fade');
        }
        // it can't follow you into bright light
        if ((g.playerLight ?? 0) > 0.55 && d > 3) this.setState('fade');
        if (this.stateT > 9) this.setState('fade');
        break;
      }
      case 'fade':
        target = 0;
        this.disturb = 0;
        this.move(0, 0, 0, dt);
        if (this.opacity < 0.02) this.remove();
        break;
    }
    this.opacity += (target - this.opacity) * Math.min(1, dt * (target > this.opacity ? 0.8 : 2.5));
    this.glow.uniforms.uOpacity.value = this.opacity;
    this.body.uniforms.uOpacity.value = Math.min(1, this.opacity * 1.2);
    this.obj.visible = this.opacity > 0.005;
  }

  tick(dt) {
    super.tick(dt);
    const s = this.state;
    if (s === 'charge') {
      this.anim.play('charge', { fade: 0.2 });
      this.anim.speed(1.2);
    } else if (s === 'watch' && this.anger > 0.5) this.anim.play('giggle', { fade: 0.3 });
    else this.anim.play('idle', { fade: 0.6 });
    this.anim.update(dt);
    // it never stops looking at you
    this.obj.updateMatrixWorld(true);
    aimBone(this.head, this.game.camera.position, 1, 1.1);
  }

  updateLight(dt) {
    // light probe only (no shaded body)
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.2;
    const l = this.world.lightAt(this.x, 1.7, this.z, this._l);
    this.light = ((l[0] + l[1] + l[2]) / 3) * this.game.lightScale;
  }

  dispose() {
    super.dispose();
    this.glow.dispose();
  }
}
