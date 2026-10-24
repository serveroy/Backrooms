// Deathmoths — moths the size of a dog. They hover around lights and are
// drawn to your flashlight. Kill your light and they lose interest.

import * as THREE from 'three';
import { Entity, sphere } from './base.js';
import { registerRecipes, getTexture } from '../world/textures.js';

registerRecipes({
  mothWing: () => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    // wing shape
    g.fillStyle = '#5b4632';
    g.beginPath();
    g.moveTo(0, 128);
    g.bezierCurveTo(60, 10, 220, 0, 250, 60);
    g.bezierCurveTo(240, 140, 160, 190, 0, 150);
    g.closePath();
    g.fill();
    // dusty bands and an eye spot
    g.strokeStyle = 'rgba(30,20,12,0.6)';
    g.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(30 + i * 40, 120);
      g.quadraticCurveTo(60 + i * 45, 50, 100 + i * 40, 40);
      g.stroke();
    }
    g.fillStyle = '#c9b48a';
    g.beginPath();
    g.arc(150, 95, 26, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a120a';
    g.beginPath();
    g.arc(150, 95, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e9dcc0';
    g.beginPath();
    g.arc(145, 90, 4, 0, Math.PI * 2);
    g.fill();
    return { canvas: c, worldW: 1, worldH: 1 };
  },
});

export class Deathmoth extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'deathmoth', radius: 0.35 });
    const body = this.mat({ tint: [0.32, 0.25, 0.18] });
    const wingMat = this.mat({ map: getTexture('mothWing'), doubleSide: true, alphaTest: 0.5 });
    const root = this.obj;
    const thorax = sphere(0.12, body, 10);
    thorax.scale.set(1, 0.9, 1.6);
    const abdomen = sphere(0.11, body, 10);
    abdomen.scale.set(0.9, 0.85, 2.0);
    abdomen.position.z = 0.28;
    const head = sphere(0.08, body, 8);
    head.position.z = -0.2;
    this.core = new THREE.Group();
    this.core.add(thorax, abdomen, head);
    for (const sx of [-1, 1]) {
      const eye = sphere(0.035, this.mat({ tint: [0.1, 0.1, 0.1], emissive: [0.4, 0.15, 0.05] }), 6);
      eye.position.set(sx * 0.05, 0.02, -0.25);
      this.core.add(eye);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.3, 4), body);
      ant.position.set(sx * 0.05, 0.1, -0.35);
      ant.rotation.set(-0.9, 0, sx * 0.4);
      this.core.add(ant);
    }
    this.wings = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.08, 0.04, -0.02);
      const geo = new THREE.PlaneGeometry(0.85, 0.85);
      geo.translate(0.42, 0, 0);
      geo.rotateX(-Math.PI / 2);
      const w = new THREE.Mesh(geo, wingMat);
      if (sx < 0) w.scale.x = -1;
      pivot.add(w);
      this.core.add(pivot);
      this.wings.push({ pivot, sx });
    }
    root.add(this.core);
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
    // flight: bob and flap
    const flap = Math.sin(this.phase * (this.state === 'approach' ? 26 : 18));
    for (const w of this.wings) w.pivot.rotation.z = w.sx * (0.15 + flap * 0.75);
    const target = this.state === 'approach' ? Math.min(2.2, p.eyeY - 0.2) : this.hover;
    this.core.position.y += (target + Math.sin(this.phase * 2.1) * 0.25 - this.core.position.y) * Math.min(1, dt * 3);
    this.core.rotation.x = Math.sin(this.phase * 1.7) * 0.15;
  }

  updateLight(dt) {
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.15;
    const l = this.world.lightAt(this.x, this.y + 2, this.z, this._l);
    for (const m of this.mats) m.uniforms.uObjLight.value.set(l[0], l[1], l[2]);
  }
}
