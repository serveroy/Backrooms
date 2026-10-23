// Smilers — nothing but glowing teeth and eyes in the dark. Don't shine a
// light on them, don't run. Back away calmly and they lose interest.

import * as THREE from 'three';
import { Entity } from './base.js';
import { glowMaterial } from '../world/materials.js';
import { registerRecipes, getTexture } from '../world/textures.js';

registerRecipes({
  smilerFace: () => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 256);
    g.shadowColor = '#fff';
    g.shadowBlur = 14;
    // eyes: thin, slightly uneven
    g.fillStyle = '#f4f2ea';
    g.beginPath();
    g.ellipse(170, 70, 30, 13, -0.15, 0, Math.PI * 2);
    g.ellipse(342, 74, 28, 12, 0.18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(172, 70, 6, 0, Math.PI * 2);
    g.arc(338, 74, 6, 0, Math.PI * 2);
    g.fill();
    // impossible grin
    g.fillStyle = '#efece0';
    g.beginPath();
    g.moveTo(40, 120);
    g.quadraticCurveTo(256, 290, 472, 118);
    g.quadraticCurveTo(256, 200, 40, 120);
    g.fill();
    // teeth gaps
    g.shadowBlur = 0;
    g.strokeStyle = '#000';
    g.lineWidth = 4;
    for (let i = 1; i < 26; i++) {
      const t = i / 26;
      const x = 40 + t * 432;
      const top = 120 + Math.sin(t * Math.PI) * 52;
      const bot = 120 + Math.sin(t * Math.PI) * 84;
      g.beginPath();
      g.moveTo(x, top - 2);
      g.lineTo(x + (t - 0.5) * 6, bot + 2);
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(60, 128);
    g.quadraticCurveTo(256, 250, 452, 126);
    g.stroke();
    return { canvas: c, worldW: 1, worldH: 1 };
  },
});

export class Smiler extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'smiler', radius: 0.25 });
    this.glow = glowMaterial({ map: getTexture('smilerFace'), color: [1.6, 1.58, 1.5], opacity: 0 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), this.glow);
    face.position.y = 1.78;
    this.face = face;
    this.obj.add(face);
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
    this.face.position.y = 1.78 + Math.sin(this.bobT * 0.9) * 0.03;
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
  }

  updateLight(dt) {
    // light probe only (no shaded body)
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.2;
    const l = this.world.lightAt(this.x, 1.7, this.z, this._l);
    this.light = (l[0] + l[1] + l[2]) / 3;
  }

  dispose() {
    this.glow.dispose();
  }
}
