// Skin-Stealers — something wearing a person. It calls for help in a
// voice that is almost right. It only moves while you are not looking.

import * as THREE from 'three';
import { Entity } from './base.js';
import { makeHumanoid, animateWalk } from './humanoid.js';
import { registerRecipes, getTexture } from '../world/textures.js';

registerRecipes({
  stolenFace: () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#b39a85';
    g.fillRect(0, 0, 512, 256);
    // the face sits at u = 0.75 (front of the head)
    const cx = 384;
    g.fillStyle = '#c4ab95';
    g.beginPath();
    g.ellipse(cx, 130, 70, 100, 0, 0, Math.PI * 2);
    g.fill();
    // eyes: flat, unblinking, slightly misaligned
    g.fillStyle = '#efe9df';
    g.beginPath();
    g.ellipse(cx - 30, 112, 15, 8, 0.05, 0, Math.PI * 2);
    g.ellipse(cx + 30, 116, 15, 8, -0.08, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16100c';
    g.beginPath();
    g.arc(cx - 30, 112, 6, 0, Math.PI * 2);
    g.arc(cx + 28, 116, 6, 0, Math.PI * 2);
    g.fill();
    // stitched seam down the middle
    g.strokeStyle = 'rgba(70,30,25,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, 30);
    g.lineTo(cx + 3, 230);
    g.stroke();
    for (let y = 40; y < 230; y += 14) {
      g.beginPath();
      g.moveTo(cx - 5, y);
      g.lineTo(cx + 7, y + 4);
      g.stroke();
    }
    // mouth: a thin closed line that never opens
    g.strokeStyle = '#5a2a22';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - 24, 170);
    g.quadraticCurveTo(cx, 176, cx + 24, 168);
    g.stroke();
    return { canvas: c, worldW: 1, worldH: 1 };
  },
});

export class SkinStealer extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'skinstealer', radius: 0.3 });
    const mats = {
      skin: this.mat({ tint: [0.7, 0.6, 0.52] }),
      head: this.mat({ map: getTexture('stolenFace') }),
      shirt: this.mat({ tint: [0.36, 0.4, 0.33] }),
      pants: this.mat({ tint: [0.2, 0.22, 0.28] }),
      shoes: this.mat({ tint: [0.08, 0.06, 0.05] }),
    };
    this.rig = makeHumanoid(mats, { height: 1.93, armLen: 1.3, neck: 0.18, headScale: [0.82, 1.15, 0.92] });
    this.obj.add(this.rig.root);
    this.phase = 0;
    this.callT = 2 + Math.random() * 4;
    this.setState('lure');
    this.frozen = false;
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    const sees = this.seesPlayer(30);
    const watched = sees && this.playerLookCos(1.5) > 0.82;
    this.frozen = watched;
    this.callT -= dt;
    if (this.callT <= 0 && d < 28) {
      this.callT = 6 + Math.random() * 6;
      this.sound('whisper', { gain: 0.6, dur: 1.1 });
      g.caption(d < 12 ? '["...help me... over here..."]' : '[someone calling for help]');
    }
    if (this.state === 'lure') {
      if (watched) this.move(0, 0, 0, dt, 40);
      else {
        this.chase(d < 8 ? 3.4 : 2.4, dt);
        this.turnTo(p.x, p.z, dt, 10);
      }
      if (d < 0.95 && !watched) {
        if (this.hitPlayer(48, 'Taken by a Skin-Stealer')) {
          this.sound('screech', { gain: 0.7, dur: 1.0 });
          this.setState('back');
        }
      }
      if (d > 50) this.remove();
    } else if (this.state === 'back') {
      const dx = this.x - p.x;
      const dz = this.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      this.goTo(this.x + (dx / l) * 4, this.z + (dz / l) * 4, 2.5, dt);
      if (this.stateT > 4) this.setState('lure');
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (!this.frozen) this.phase += dt * sp * 4;
    // frozen mid-stride when watched
    if (!this.frozen) animateWalk(this.rig, this.phase, sp, dt, { armSwing: 0.4 });
    this.rig.head.rotation.z = 0.12;
  }
}
