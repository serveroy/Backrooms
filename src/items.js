// Pickups placed by level generators: Almond Water, batteries, Royal
// Rations and notes. Meshes are built from primitives + canvas labels.

import * as THREE from 'three';
import { objectMaterial } from './world/materials.js';
import { registerRecipes, getTexture } from './world/textures.js';
import { hashf } from './core/rng.js';

// ---------------------------------------------------------------- textures

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

registerRecipes({
  almondLabel: () => ({
    canvas: canvas(256, 128, (g, w, h) => {
      g.fillStyle = '#f3efe2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#b9935a';
      g.fillRect(0, 0, w, 18);
      g.fillRect(0, h - 18, w, 18);
      g.fillStyle = '#6b4a22';
      g.font = 'bold 30px Georgia, serif';
      g.textAlign = 'center';
      g.fillText('ALMOND', w / 2, 62);
      g.font = '22px Georgia, serif';
      g.fillText('WATER', w / 2, 92);
      g.beginPath();
      g.ellipse(w * 0.12, h / 2, 10, 16, 0.4, 0, Math.PI * 2);
      g.ellipse(w * 0.88, h / 2, 10, 16, -0.4, 0, Math.PI * 2);
      g.fill();
    }),
    worldW: 1,
    worldH: 1,
  }),
  batteryTex: () => ({
    canvas: canvas(128, 128, (g, w, h) => {
      g.fillStyle = '#1b1b1b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8a33c';
      g.fillRect(0, 0, w, 34);
      g.fillStyle = '#e6e6e6';
      g.font = 'bold 22px Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('ALKALINE', w / 2, 76);
      g.font = 'bold 18px Arial, sans-serif';
      g.fillText('1.5V  AA', w / 2, 104);
    }),
    worldW: 1,
    worldH: 1,
  }),
  rationTex: () => ({
    canvas: canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#8a1f1c';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d7b45a';
      g.lineWidth = 8;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.fillStyle = '#e8c66a';
      g.font = 'bold 34px Georgia, serif';
      g.textAlign = 'center';
      g.fillText('ROYAL', w / 2, 110);
      g.fillText('RATION', w / 2, 150);
      g.font = '16px Georgia, serif';
      g.fillText('EST. ????', w / 2, 190);
      g.beginPath();
      g.moveTo(w / 2 - 30, 70);
      g.lineTo(w / 2 - 20, 45);
      g.lineTo(w / 2, 62);
      g.lineTo(w / 2 + 20, 45);
      g.lineTo(w / 2 + 30, 70);
      g.closePath();
      g.fill();
    }),
    worldW: 1,
    worldH: 1,
  }),
  noteTex: () => ({
    canvas: canvas(256, 340, (g, w, h) => {
      g.fillStyle = '#e8dfc6';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(70,90,150,0.35)';
      g.lineWidth = 1;
      for (let y = 40; y < h; y += 18) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(30,25,20,0.75)';
      g.lineWidth = 1.6;
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = 36; y < h - 30; y += 18) {
        let x = 18 + r() * 10;
        const end = w - 20 - r() * 60;
        g.beginPath();
        g.moveTo(x, y);
        while (x < end) {
          const nx = x + 4 + r() * 8;
          g.quadraticCurveTo((x + nx) / 2, y - 5 + r() * 8, nx, y - 1 + r() * 2);
          x = nx;
          if (r() < 0.12) {
            x += 6;
            g.moveTo(x, y);
          }
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(120,80,30,0.18)';
      g.beginPath();
      g.arc(w * 0.7, h * 0.75, 40, 0, Math.PI * 2);
      g.fill();
    }),
    worldW: 1,
    worldH: 1,
  }),
});

// ---------------------------------------------------------------- meshes

function makeAlmond() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.17, 14), objectMaterial({ tint: [0.86, 0.84, 0.78], rim: 0.3 }));
  body.position.y = 0.085;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0355, 0.07, 14, 1, true), objectMaterial({ map: getTexture('almondLabel') }));
  label.position.y = 0.08;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.034, 0.04, 14), objectMaterial({ tint: [0.86, 0.84, 0.78], rim: 0.3 }));
  shoulder.position.y = 0.19;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.022, 12), objectMaterial({ tint: [0.95, 0.95, 0.95] }));
  cap.position.y = 0.221;
  g.add(body, label, shoulder, cap);
  return g;
}

function makeBattery() {
  const g = new THREE.Group();
  const mat = objectMaterial({ map: getTexture('batteryTex') });
  for (const x of [-0.008, 0.008]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.05, 10), mat);
    b.rotation.z = Math.PI / 2;
    b.position.set(0, 0.0075, x);
    g.add(b);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, 8), objectMaterial({ tint: [0.8, 0.8, 0.8] }));
    tip.rotation.z = Math.PI / 2;
    tip.position.set(0.0265, 0.0075, x);
    g.add(tip);
  }
  g.scale.setScalar(1.6);
  return g;
}

function makeRation() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.1), objectMaterial({ map: getTexture('rationTex') }));
  m.position.y = 0.025;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function makeNote() {
  const geo = new THREE.PlaneGeometry(0.21, 0.28);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, objectMaterial({ map: getTexture('noteTex'), emissive: [0.03, 0.03, 0.025], doubleSide: true }));
  m.position.y = 0.004;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

const MAKERS = { almond: makeAlmond, battery: makeBattery, ration: makeRation, note: makeNote };

export const ITEM_NAMES = {
  almond: 'Almond Water',
  battery: 'Batteries',
  ration: 'Royal Ration',
  note: 'Read note',
};

export class Items {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.active = new Map(); // id -> item
    this.byChunk = new Map();
    this.assignedNotes = new Set();
    this._l = [0, 0, 0];
  }

  clear() {
    for (const it of this.active.values()) this.group.remove(it.obj);
    this.active.clear();
    this.byChunk.clear();
    this.assignedNotes.clear();
  }

  onChunkBuilt(chunk) {
    const L = chunk.layout;
    const g = this.game;
    const picked = g.state.picked[g.level.id] || [];
    const ids = [];
    L.items.forEach((def, i) => {
      const id = `${L.cx},${L.cz},${i}`;
      if (picked.includes(id)) return;
      let noteId = null;
      if (def.type === 'note') {
        noteId = def.noteId || g.pickNoteFor(id, this.assignedNotes);
        if (!noteId) return;
        this.assignedNotes.add(noteId);
      }
      const make = MAKERS[def.type];
      if (!make) return;
      const obj = make();
      const ry = hashf(L.cx, L.cz, i, 5) * Math.PI * 2;
      obj.rotation.y = ry;
      obj.position.set(def.x, def.y ?? g.world.floorG(Math.floor(def.x / 0.3), Math.floor(def.z / 0.3)), def.z);
      if (def.y === undefined || def.y === 0) {
        obj.position.y = g.world.floorG(Math.floor(def.x / 0.3), Math.floor(def.z / 0.3));
      }
      this.group.add(obj);
      const it = { id, type: def.type, obj, noteId, lightT: 0, mats: [] };
      obj.traverse((o) => {
        if (o.material) it.mats.push(o.material);
      });
      this.active.set(id, it);
      ids.push(id);
      this.updateLight(it);
    });
    this.byChunk.set(`${L.cx},${L.cz}`, ids);
  }

  onChunkRemoved(chunk) {
    const key = `${chunk.cx},${chunk.cz}`;
    const ids = this.byChunk.get(key);
    if (!ids) return;
    for (const id of ids) {
      const it = this.active.get(id);
      if (!it) continue;
      this.group.remove(it.obj);
      if (it.noteId) this.assignedNotes.delete(it.noteId);
      this.active.delete(id);
    }
    this.byChunk.delete(key);
  }

  updateLight(it) {
    const p = it.obj.position;
    const l = this.game.world.lightAt(p.x, p.y + 0.3, p.z, this._l);
    for (const m of it.mats) m.uniforms.uObjLight.value.set(l[0], l[1], l[2]);
  }

  update(dt) {
    for (const it of this.active.values()) {
      it.lightT -= dt;
      if (it.lightT <= 0) {
        it.lightT = 0.4 + Math.random() * 0.3;
        this.updateLight(it);
      }
    }
  }

  /** Best item under the crosshair within reach. */
  findTarget(eye, dir, reach = 2.1) {
    let best = null;
    let bestScore = 0.9;
    for (const it of this.active.values()) {
      const p = it.obj.position;
      const dx = p.x - eye.x;
      const dy = p.y + 0.08 - eye.y;
      const dz = p.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > reach) continue;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      // allow a generous cone for small objects, tighter far away
      const need = 0.93 - 0.06 / Math.max(0.4, d);
      if (dot < need) continue;
      const score = dot - d * 0.02;
      if (score > bestScore - 0.1 && (!best || score > bestScore)) {
        if (!this.game.world.los(eye.x, eye.z, p.x, p.z)) continue;
        best = it;
        bestScore = score;
      }
    }
    return best;
  }

  remove(it) {
    this.group.remove(it.obj);
    this.active.delete(it.id);
    const g = this.game;
    (g.state.picked[g.level.id] ||= []).push(it.id);
  }
}
