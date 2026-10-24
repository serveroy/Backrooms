// Partygoers — yellow figures with a crude drawn smile "=)". They have no
// eyes and hunt by sound. Sprint and they find you. Crouch and pray.
//
// Model + animations: tools/blender/human.py (partygoer)

import { Entity } from './base.js';
import * as THREE from 'three';
import { instantiate, Animset, bone, markFacing, aimBone, locomotion } from './models.js';

const _t = new THREE.Vector3();
import { registerRecipes, getTexture } from '../world/textures.js';

// "=)" drawn in marker on a decal over the face (see stolenFace for the UV
// layout; this decal spans +-1.1 rad). Turned on its side it is a face:
// two bars for eyes, a bracket for a grin.
const SPAN = 1.1;
const U = (x, z) => 0.5 + Math.atan2(x, -z) / (2 * SPAN);
const Vy = (y) => 1 - (y + 0.075) / 0.2;

registerRecipes({
  partyFace: () => {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.strokeStyle = '#120d06';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // a felt-tip line: a few slightly offset passes
    const pen = (draw, w) => {
      for (let i = 0; i < 3; i++) {
        g.lineWidth = w - i * 3;
        g.save();
        g.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
        g.beginPath();
        draw();
        g.stroke();
        g.restore();
      }
    };
    const ey = Vy(0.05) * S;
    for (const sx of [-1, 1]) {
      const ex = U(0.03 * sx, -0.09) * S;
      pen(() => {
        g.moveTo(ex + 2 * sx, ey - 42);
        g.lineTo(ex - 1 * sx, ey + 40);
      }, 22);
    }
    const cx = S * 0.5;
    const my = Vy(-0.005) * S;
    const mw = (U(0.05, -0.08) - 0.5) * S;
    pen(() => {
      g.moveTo(cx - mw, my - 26);
      g.bezierCurveTo(cx - mw * 0.6, my + 62, cx + mw * 0.6, my + 66, cx + mw * 1.02, my - 30);
    }, 22);
    return { canvas: c, flipY: false, clamp: true };
  },
});

export class Partygoer extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'partygoer', radius: 0.3 });
    const yellow = this.mat({ vertexColors: true, regions: [[0.9, 0.74, 0.2], [0.9, 0.74, 0.2], [0.9, 0.74, 0.2], [0.9, 0.74, 0.2]], wet: 0.35, rim: 0.04 });
    const face = this.mat({ map: getTexture('partyFace'), alphaTest: 0.5, tint: [0.2, 0.2, 0.2] });
    this.inst = instantiate('partygoer', (name) => (name === 'face' ? face : yellow));
    this.inst.root.scale.setScalar(0.97 + Math.random() * 0.08);
    this.head = bone(this.inst, 'head');
    this.obj.add(this.inst.root);
    markFacing(this.head);
    this.anim = new Animset(this.inst);
    this.anim.play('idle', { fade: 0 });
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
          this.anim.play('attack', { fade: 0.1, once: true });
          this.setState('listen');
        }
        break;
      }
      case 'listen':
        this.move(0, 0, 0, dt);
        if (this.stateT > 4) this.setState('wander');
        break;
    }
  }

  tick(dt) {
    super.tick(dt);
    const sp = Math.hypot(this.vx, this.vz) / this.inst.root.scale.x;
    if (this.state === 'listen' && sp < 0.15 && !this.anim.oneShot) this.anim.play('listen', { fade: 0.4 });
    else locomotion(this.anim, sp, { walk: 1.25, run: 3.7, runAt: 2.8 });
    this.anim.update(dt);
    // no eyes: it turns its head toward whatever it heard
    if (this.state === 'hunt' && this.target) {
      this.obj.updateMatrixWorld(true);
      aimBone(this.head, _t.set(this.target[0], this.y + 1.6, this.target[1]), 0.6, 0.7);
    }
  }
}
