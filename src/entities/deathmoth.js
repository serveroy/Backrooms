// Deathmoths — moths the size of a dog. They hover around lights and are
// drawn to your flashlight. Kill your light and they lose interest.
//
// Model + animations: tools/blender/deathmoth.py

import * as THREE from 'three';
import { Entity, sphere } from './base.js';
import { instantiate, Animset, bone } from './models.js';
import { registerRecipes, getTexture } from '../world/textures.js';

// Wing atlas for the Blender-built moth (tools/blender/deathmoth.py): left
// half the forewing, right half the hindwing. In each cell x runs from the
// wing root to the tip, y from the leading edge (top) to the trailing edge.
registerRecipes({
  mothWings: () => {
    const W = 1024;
    const H = 512;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const cell = (x0, outline, paint) => {
      g.save();
      g.translate(x0, 0);
      g.beginPath();
      outline.forEach(([a, b], i) => (i ? g.lineTo(a * 512, b * H) : g.moveTo(a * 512, b * H)));
      g.closePath();
      g.save();
      g.clip();
      paint();
      g.restore();
      // veins
      g.strokeStyle = 'rgba(20,14,8,0.5)';
      g.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const [a, b] = outline[Math.floor(1 + (i / 7) * (outline.length - 2))];
        g.beginPath();
        g.moveTo(0, outline[0][1] * H + 10);
        g.quadraticCurveTo(a * 512 * 0.5, (b * H + outline[0][1] * H) / 2 - 20, a * 512, b * H);
        g.stroke();
      }
      g.restore();
    };
    const mottle = (cols, n, rmax) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = cols[i % cols.length];
        g.beginPath();
        g.ellipse(Math.random() * 512, Math.random() * H, 8 + Math.random() * rmax, 4 + Math.random() * rmax * 0.5, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    };
    // forewing: long and pointed, smoky brown, wavy pale lines, a pale eye-spot
    cell(
      0,
      [[0, 0.34], [0.35, 0.18], [0.75, 0.07], [0.99, 0.04], [0.95, 0.3], [0.82, 0.62], [0.68, 0.86], [0.35, 0.8], [0, 0.66]],
      () => {
        g.fillStyle = '#3a2c20';
        g.fillRect(0, 0, 512, H);
        mottle(['rgba(90,70,50,0.35)', 'rgba(20,14,10,0.35)', 'rgba(130,110,80,0.25)'], 160, 40);
        g.strokeStyle = 'rgba(190,170,130,0.55)';
        g.lineWidth = 5;
        for (const x of [150, 260, 380]) {
          g.beginPath();
          for (let y = 0; y <= H; y += 16) {
            const xx = x + Math.sin(y * 0.06 + x) * 12 + y * 0.12;
            y ? g.lineTo(xx, y) : g.moveTo(xx, y);
          }
          g.stroke();
        }
        g.fillStyle = '#d8cfb2';
        g.beginPath();
        g.arc(250, H * 0.42, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(15,10,6,0.6)';
        g.fillRect(0, 0, 70, H);
      }
    );
    // hindwing: yellow with two black bands following the outer margin
    cell(
      512,
      [[0, 0.06], [0.45, 0.08], [0.85, 0.2], [0.96, 0.42], [0.86, 0.7], [0.62, 0.94], [0.3, 0.9], [0, 0.6]],
      () => {
        g.fillStyle = '#c99a2e';
        g.fillRect(0, 0, 512, H);
        mottle(['rgba(220,180,60,0.3)', 'rgba(150,100,30,0.3)'], 60, 30);
        g.strokeStyle = '#120c08';
        for (const [r, w] of [[420, 46], [300, 24]]) {
          g.lineWidth = w;
          g.beginPath();
          g.arc(-40, H * 0.25, r, -0.2, 1.7);
          g.stroke();
        }
        g.fillStyle = 'rgba(25,16,10,0.85)';
        g.fillRect(0, 0, 90, H);
      }
    );
    // torn and threadbare
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const x = Math.random() < 0.5 ? 200 + Math.random() * 300 : 700 + Math.random() * 280;
      const y = H * (0.2 + Math.random() * 0.75);
      g.beginPath();
      g.arc(x, y, 3 + Math.random() * 12, 0, Math.PI * 2);
      g.fill();
    }
    return { canvas: c, flipY: false, clamp: true };
  },
});

export class Deathmoth extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'deathmoth', radius: 0.35 });
    const body = this.mat({ vertexColors: true, regions: [[0.36, 0.29, 0.22], [0.78, 0.66, 0.38], [0.05, 0.04, 0.035], [0.2, 0.15, 0.1]], rim: 0.08 });
    const wings = this.mat({ map: getTexture('mothWings'), doubleSide: true, alphaTest: 0.5 });
    this.core = new THREE.Group();
    this.obj.add(this.core);
    this.inst = instantiate('deathmoth', (name) => (name === 'wing' ? wings : body));
    this.core.add(this.inst.root);
    // a red glint in each compound eye
    const head = bone(this.inst, 'head');
    if (head) {
      const eyeMat = this.mat({ tint: [0.05, 0.03, 0.03], emissive: [0.5, 0.13, 0.05] });
      for (const sx of [-1, 1]) {
        const e = sphere(0.016, eyeMat, 6);
        e.position.copy(head.worldToLocal(new THREE.Vector3(sx * 0.07, 0.01, -0.17)));
        head.add(e);
      }
    }
    this.anim = new Animset(this.inst);
    this.anim.play('fly', { fade: 0 });
    this.inst.mixer.setTime(Math.random());
    this.core.position.y = 2.1;
    this.hover = 2.1;
    this.phase = Math.random() * 10;
    this.setState('flutter');
    this.flutterT = 0;
    this.lostT = 0;
  }

  update(dt) {
    const g = this.game;
    const p = this.player;
    const d = this.distToPlayer();
    this.phase += dt;
    const beam = p.flashlight && p.battery > 0;
    const sees = this.seesPlayer(22);
    switch (this.state) {
      case 'flutter':
        this.wander(dt, 1.4);
        if (beam && sees && d < 20) {
          this.setState('approach');
          g.caption('[heavy wings flapping]');
        }
        if (d > 45) this.remove();
        break;
      case 'approach':
        this.chase(3.6, dt);
        if (!beam) this.lostT += dt;
        else this.lostT = 0;
        if (this.lostT > 2.5) this.setState('flutter');
        if (d < 1.2 && Math.abs(p.eyeY - (this.y + this.hover)) < 1.3) {
          if (this.hitPlayer(10, 'Swarmed by a Deathmoth')) this.sound('screech', { gain: 0.3, dur: 0.4 });
        }
        break;
    }
    this.flutterT -= dt;
    if (this.flutterT <= 0) {
      this.flutterT = this.state === 'approach' ? 0.8 : 1.6;
      if (d < 18) this.sound('flutter', { gain: 0.35, dur: this.flutterT });
    }
    // flight: bob and pitch with the wingbeat
    const target = this.state === 'approach' ? Math.min(2.2, p.eyeY - 0.2) : this.hover;
    this.core.position.y += (target + Math.sin(this.phase * 2.1) * 0.25 - this.core.position.y) * Math.min(1, dt * 3);
    this.core.rotation.x = Math.sin(this.phase * 1.7) * 0.15;
  }

  tick(dt) {
    super.tick(dt);
    const close = this.state === 'approach' && this.distToPlayer() < 2.5;
    this.anim.play(close ? 'attack' : 'fly', { fade: 0.2 });
    this.anim.speed(this.state === 'approach' ? 1.5 : 1.0);
    this.anim.update(dt);
  }

  updateLight(dt) {
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.15;
    const l = this.world.lightAt(this.x, this.y + 2, this.z, this._l);
    for (const m of this.mats) m.uniforms.uObjLight.value.set(l[0], l[1], l[2]);
  }
}
