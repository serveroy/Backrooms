// Skin-Stealers — something too tall, wearing a person. It calls for help
// in a voice that is almost right. It only moves while you are not looking.
//
// Model + animations: tools/blender/human.py (skinstealer)

import { Entity } from './base.js';
import { instantiate, Animset, bone, markFacing, aimBone, locomotion } from './models.js';
import { registerRecipes, getTexture } from '../world/textures.js';

// The stolen face, painted onto a decal that wraps the front of the head.
// UV: u spans +-1.25 rad around the skull (0.5 = front), v from below the
// chin (bottom) to the hairline (top). Canvas x = 0 is the wearer's left.
const SPAN = 1.25;
const U = (x, z) => 0.5 + Math.atan2(x, -z) / (2 * SPAN);
const Vy = (y) => 1 - (y + 0.075) / 0.2;

registerRecipes({
  stolenFace: () => {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const px = (u) => u * S;
    const py = (v) => v * S;
    // face patch: a little too pink, a little too smooth
    const cx = px(0.5);
    const cy = py(Vy(0.025));
    const rx = S * 0.39;
    const ry = S * 0.47;
    g.save();
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.clip();
    const grad = g.createRadialGradient(cx, cy - 40, 20, cx, cy, ry);
    grad.addColorStop(0, '#d6b3a2');
    grad.addColorStop(1, '#c09885');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    // blotches where it doesn't sit right
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.9;
      g.fillStyle = `rgba(${150 + Math.random() * 40},${90 + Math.random() * 30},${80 + Math.random() * 30},${0.05 + Math.random() * 0.08})`;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, 10 + Math.random() * 30, 8 + Math.random() * 22, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // sunken shadows round the eyes, a grey cast under them
    for (const sx of [-1, 1]) {
      const ex = px(U(0.031 * sx, -0.083));
      const ey = py(Vy(0.05));
      const sh = g.createRadialGradient(ex, ey + 6, 10, ex, ey + 6, 58);
      sh.addColorStop(0, 'rgba(70,40,40,0.55)');
      sh.addColorStop(1, 'rgba(70,40,40,0)');
      g.fillStyle = sh;
      g.fillRect(ex - 70, ey - 70, 140, 140);
      // brows: thin, slightly mismatched
      g.strokeStyle = 'rgba(60,40,30,0.85)';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      const by = py(Vy(0.071)) + (sx > 0 ? -6 : 4);
      g.moveTo(ex - 34 * sx, by + 8);
      g.quadraticCurveTo(ex, by - 8, ex + 36 * sx, by + 4);
      g.stroke();
    }
    // lips: a pale closed line that never opens
    const my = py(Vy(-0.0098));
    const mw = px(U(0.024, -0.105)) - cx;
    g.fillStyle = 'rgba(150,95,90,0.85)';
    g.beginPath();
    g.ellipse(cx, my, mw * 1.05, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#4a2420';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx - mw, my + 2);
    g.quadraticCurveTo(cx, my + 7, cx + mw, my - 3);
    g.stroke();
    // nostrils
    g.fillStyle = 'rgba(60,30,25,0.7)';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + px(U(0.011, -0.105) - 0.5) * sx, py(Vy(0.014)), 7, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // seam down the middle
    stitches(g, [
      [cx + 2, cy - ry * 0.95],
      [cx - 3, cy - ry * 0.4],
      [cx + 4, my - 30],
      [cx + 1, cy + ry * 0.95],
    ]);
    g.restore();
    // the edge, sewn on with coarse thread
    const edge = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      edge.push([cx + Math.cos(a) * (rx - 8), cy + Math.sin(a) * (ry - 8)]);
    }
    g.strokeStyle = 'rgba(120,40,35,0.6)';
    g.lineWidth = 9;
    g.beginPath();
    edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    stitches(g, edge);
    // holes for the real eyes
    g.globalCompositeOperation = 'destination-out';
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.ellipse(px(U(0.031 * sx, -0.083)), py(Vy(0.05)), 27, 22, 0, 0, Math.PI * 2);
      g.fill();
    }
    return { canvas: c, flipY: false, clamp: true };
  },
});

function stitches(g, pts) {
  g.strokeStyle = '#2a1410';
  g.lineCap = 'round';
  g.lineWidth = 3;
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  g.lineWidth = 2.5;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    const nx = -(by - ay) / L;
    const ny = (bx - ax) / L;
    for (let t = 0; t < L; t += 13) {
      const x = ax + ((bx - ax) * t) / L;
      const y = ay + ((by - ay) * t) / L;
      g.beginPath();
      g.moveTo(x - nx * 7, y - ny * 7);
      g.lineTo(x + nx * 7 + (bx - ax) / L * 3, y + ny * 7 + (by - ay) / L * 3);
      g.stroke();
    }
  }
}

export class SkinStealer extends Entity {
  constructor(game, x, z) {
    super(game, x, z, { name: 'skinstealer', radius: 0.3 });
    const skin = this.mat({
      vertexColors: true,
      regions: [[0.72, 0.6, 0.52], [0.36, 0.4, 0.33], [0.2, 0.22, 0.28], [0.52, 0.47, 0.3]],
      rim: 0.03,
    });
    const face = this.mat({ map: getTexture('stolenFace'), alphaTest: 0.5 });
    const eye = this.mat({ vertexColors: true, regions: [[0.82, 0.8, 0.74], [0.24, 0.17, 0.1], [0, 0, 0], [0.02, 0.02, 0.02]], wet: 1 });
    this.inst = instantiate('skinstealer', (name) => (name === 'face' ? face : name === 'eye' ? eye : skin));
    this.head = bone(this.inst, 'head');
    this.obj.add(this.inst.root);
    markFacing(this.head);
    this.anim = new Animset(this.inst);
    this.anim.play('idle', { fade: 0 });
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
          this.anim.play('attack', { fade: 0.08, once: true });
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
  }

  tick(dt) {
    super.tick(dt);
    if (this.frozen) {
      // caught mid-stride: everything stops, except that it keeps looking at you
      this.anim.speed(0);
    } else {
      locomotion(this.anim, Math.hypot(this.vx, this.vz), { walk: 1.2, run: 3.2, runAt: 2.6 });
    }
    this.anim.update(dt);
    this.obj.updateMatrixWorld(true);
    aimBone(this.head, this.game.camera.position, 0.85, 0.9);
  }
}
