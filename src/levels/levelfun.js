// LEVEL FUN =)
// It looks like Level 0, but someone is throwing a party. Balloons,
// confetti, cake. Nobody is here. Then somebody is.

import { CN, CELL, F_SOLID, F_BLOCK } from '../world/layout.js';
import { hashf } from '../core/rng.js';
import { findOpenCell, findWallSpot, chunkRng, addPart, cylGeo, cachedGeo } from './common.js';
import { table, cake, wallQuad } from './props.js';
import { exitStatic, ambientEvents } from './director.js';
import level0 from './level0.js';
import { Partygoer } from '../entities/partygoer.js';
import * as THREE from 'three';

const BAL = [9, 10, 11, 12, 13];

function generate(cx, cz, seed) {
  const L = level0.generate(cx, cz, seed);
  const rng = chunkRng(L, seed, 333);
  // all exits lead back to the Habitable Zone
  for (const e of L.exits) e.target = 'level1';
  // party lights
  for (const f of L.fixtures) {
    const h = hashf(Math.floor(f.x * 10), Math.floor(f.z * 10), seed, 9);
    if (h < 0.18) f.color = [1.0, 0.45, 0.75];
    else if (h < 0.3) f.color = [0.5, 0.75, 1.0];
    else if (h < 0.36) f.color = [0.6, 1.0, 0.55];
    if (f.mode === 'off' && h < 0.5) f.mode = 'pulse';
  }
  // balloons bunched at the ceiling
  const nb = rng.int(3, 7);
  for (let k = 0; k < nb; k++) {
    const c = findOpenCell(L, rng, 1);
    if (!c) continue;
    L.props.push({ type: 'balloons', x: L.wx(c[0]), z: L.wz(c[1]), n: rng.int(2, 5), seed: rng.int(0, 1e6) });
  }
  // party tables with cake
  if (rng.next() < 0.5) {
    const c = findOpenCell(L, rng, 3);
    if (c) {
      L.rect(c[0] - 2, c[1] - 1, c[0] + 3, c[1] + 2, F_BLOCK, 'or');
      L.props.push({ type: 'party', x: L.wx(c[0]), z: L.wz(c[1]) });
    }
  }
  // banners
  for (let k = 0; k < 2; k++) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.props.push({ type: 'banner', x: L.wx(s.lx) + s.dx * CELL * 0.5, z: L.wz(s.lz) + s.dz * CELL * 0.5, dx: s.dx, dz: s.dz });
  }
  // no notes from Level 0 lying around here
  L.items = L.items.filter((i) => i.type !== 'note');
  if (rng.next() < 0.25) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  return L;
}

function sph() {
  return cachedGeo('balloon', () => new THREE.SphereGeometry(0.5, 12, 10));
}

function buildProps(L, B) {
  level0.buildProps(L, B);
  for (const p of L.props) {
    switch (p.type) {
      case 'balloons': {
        let s = p.seed;
        const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < p.n; k++) {
          const bx = p.x + (r() - 0.5) * 0.6;
          const bz = p.z + (r() - 0.5) * 0.6;
          const by = 2.35 + r() * 0.15;
          addPart(B(BAL[Math.floor(r() * BAL.length)]), sph(), bx, by, bz, 0.3, 0.36, 0.3);
          addPart(B(14), cylGeo(3), bx, by - 0.75, bz, 0.004, 1.2, 0.004);
        }
        break;
      }
      case 'party':
        table(B, { top: 13, legs: 9 }, p.x, p.z, 0, 1.5, 0.8);
        cake(B, { cake: 15, icing: 16, candle: 10 }, p.x, 0.76, p.z);
        break;
      case 'banner':
        wallQuad(B(17), p.x, 2.2, p.z, p.dx, p.dz, 1.9, 0.24, 0.015);
        break;
    }
  }
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const E = game.entities;
  const p = game.player;
  exitStatic(game, dt, S);
  ambientEvents(game, dt, S, {
    every: [12, 26],
    events: [
      ['party', 2],
      ['horn', 1.5],
      ['knock', 0.5],
    ],
  });
  // the music box never stops
  S.musicT = (S.musicT ?? 2) - dt;
  if (S.musicT <= 0) {
    const a = Math.random() * Math.PI * 2;
    game.audio.play('musicBox', { pos: [p.x + Math.cos(a) * 18, 1.5, p.z + Math.sin(a) * 18], gain: 0.5, ref: 6, rolloff: 0.7 });
    S.musicT = 15 + Math.random() * 8;
  }
  S.popT = (S.popT ?? 15) - dt;
  if (S.popT <= 0) {
    S.popT = 10;
    const max = S.t > 120 ? 4 : S.t > 45 ? 3 : 2;
    if (E.count('partygoer') < max) {
      const spot = game.findSpawnSpot({ min: 18, max: 32, noLOS: true });
      if (spot) E.add(new Partygoer(game, spot.x, spot.z));
    }
  }
}

function ambience(game, a) {
  a.setRoomTone(0.04, 160);
}

export default {
  ...level0,
  id: 'levelfun',
  number: 'Fun =)',
  name: 'Happy Birthday',
  survival: 'Class 5',
  tags: ['Deadly', 'Unsecure', 'Partygoers'],
  hint: 'The Partygoers hunt by sound. Crouch to move quietly. Exits are glitching walls — find one fast.',
  objective: (g) => (g.levelTime < 40 ? 'DON\'T GO TO THE PARTY.\nCrouch. Find a glitching wall.' : ''),
  config: {
    ...level0.config,
    grade: { tint: [1.04, 0.97, 0.95], saturation: 1.2, contrast: 1.08 },
    sanityRate: 0.08,
  },
  materials: [
    { tex: 'partyWallpaper', grime: [0.3, 0.2, 0.045, 0.25], stainColor: [0.72, 0.58, 0.33], damp: 0.3 },
    { tex: 'partyCarpet', grime: [0.4, 0.3, 0.05, 0.2], stainColor: [0.6, 0.5, 0.36] },
    { tex: 'ceilingL0' },
    { tex: 'ceilingStainedL0' },
    { tex: 'black', tint: [0.2, 0.2, 0.2] },
    { tex: 'partyWallpaper', glitch: true },
    { tex: 'partyCarpet', tint: [0.72, 0.68, 0.6], spec: 0.35 },
    { tex: 'white', tint: [0.82, 0.8, 0.72] },
    { tex: 'white', tint: [0.55, 0.42, 0.26] },
    { tex: 'white', tint: [0.45, 0.45, 0.44] },
    { tex: 'balloonTex', tint: [0.85, 0.12, 0.15] },
    { tex: 'balloonTex', tint: [0.15, 0.45, 0.85] },
    { tex: 'balloonTex', tint: [0.9, 0.75, 0.1] },
    { tex: 'balloonTex', tint: [0.75, 0.25, 0.8] },
    { tex: 'white', tint: [0.85, 0.85, 0.85] },
    { tex: 'white', tint: [0.75, 0.5, 0.3] },
    { tex: 'white', tint: [0.95, 0.85, 0.9] },
    { tex: 'banner', tint: [1, 1, 1] },
  ],
  generate,
  buildProps,
  director,
  ambience,
  defaultExit: 'level1',
};
