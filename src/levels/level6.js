// LEVEL 6 — "Lights Out"
// Absolute darkness. Your flashlight barely reaches. Something breathes
// nearby. Follow the cold, salty draft.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, findWallSpot, chunkRng } from './common.js';
import { cageBulb, door, wallQuad } from './props.js';

const U = 8;
const CEIL = 2.6;

const M = { wall: 0, floor: 1, ceil: 2, metal: 3, door: 4, glow: 5 };

function params(seed) {
  return {
    U,
    seed,
    doorMin: 3,
    doorMax: 4,
    doorChance: 0.4,
    halfChance: 0.1,
    thickChance: 0.3,
    density: (Lx, Lz) => 0.4 + fbm2(Lx / 5, Lz / 5, seed + 9, 2) * 0.2,
    pillar: () => 0.1,
    pillarSize: 2,
  };
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  rasterLattice(L, params(seed));
  const rng = chunkRng(L, seed, 61);
  // a single dying bulb, very rarely
  if (rng.next() < 0.12) {
    const lx = rng.int(1, 7) * U + 4;
    const lz = rng.int(1, 7) * U + 4;
    if (!(L.get(lx, lz) & F_SOLID)) {
      L.fixtures.push({ kind: 'bulb', x: L.wx(lx), y: CEIL - 0.4, z: L.wz(lz), ceil: CEIL, color: [1, 0.85, 0.6], power: 1.2, radius: 5, omni: 0.9, mode: 'dying', emitPower: 4 });
    }
  }
  if (rng.next() < 0.3) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'battery', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.25) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'almond', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.15) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  // the draft: a doorway breathing cold air (exit to Level 7)
  const er = new RNG(hash32(cx, cz, seed, 6999));
  if (!(cx === 0 && cz === 0) && er.next() < 0.12) {
    for (let t = 0; t < 40; t++) {
      const s = findWallSpot(L, er, 20);
      if (!s) break;
      const { lx, lz, dx, dz } = s;
      const ax = dz !== 0 ? 1 : 0;
      const az = dx !== 0 ? 1 : 0;
      let ok = true;
      for (let k = -2; k <= 2 && ok; k++) {
        if (!(L.get(lx + dx + ax * k, lz + dz + az * k) & F_SOLID)) ok = false;
        const o = L.get(lx + ax * k, lz + az * k);
        if (o === undefined || o & (F_SOLID | F_BLOCK)) ok = false;
      }
      if (!ok) continue;
      const wx = L.wx(lx) + dx * CELL * 0.5;
      const wz = L.wz(lz) + dz * CELL * 0.5;
      L.props.push({ type: 'draft', x: wx, z: wz, dx, dz });
      L.exits.push({ type: 'draft', x: wx, z: wz, target: 'level7' });
      L.interact.push({ type: 'exit', target: 'level7', kind: 'door', x: wx - dx * 0.3, y: 1.1, z: wz - dz * 0.3, prompt: 'Step into the cold draft', reach: 2.2, cone: 0.55 });
      break;
    }
  }
  return L;
}

export function buildFixture(f, fb) {
  cageBulb(f, fb);
}

export function buildProps(L, B) {
  for (const p of L.props) {
    if (p.type === 'draft') {
      // an opening onto blue-black water far below; faint and cold
      wallQuad(B(M.glow), p.x, 1.05, p.z, p.dx, p.dz, 1.0, 2.1, 0.01);
      door(B, { frame: M.metal, slab: M.glow }, p.x, p.z, p.dx, p.dz, 1.0, 2.1);
    }
  }
}

export function spawnPoint() {
  return { x: 4.5 * CELL, z: 4.5 * CELL, yaw: 0 };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const p = game.player;
  const E = game.entities;
  // the draft: wind you can follow by ear
  S.windT = (S.windT ?? 1) - dt;
  if (S.windT <= 0) {
    const ex = game.nearestExit(p.x, p.z, 'draft');
    S.windT = 2.2;
    if (ex) {
      const d = Math.hypot(ex.x - p.x, ex.z - p.z);
      if (d < 40) game.audio.play('breath', { pos: [ex.x, 1.2, ex.z], gain: 0.9, dur: 2.0, ref: 3, rolloff: 0.8 });
      if (d < 10 && !S.cap) {
        S.cap = true;
        game.caption('[a cold, salty draft]');
      }
    }
  }
  // breathing in the dark, sometimes right next to you
  S.breathT = (S.breathT ?? 8) - dt;
  if (S.breathT <= 0) {
    S.breathT = 9 + Math.random() * 12;
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 + Math.random() * 4;
    game.audio.play('breath', { pos: [p.x + Math.cos(a) * r, 1.6, p.z + Math.sin(a) * r], gain: 0.5, dur: 1.6 });
    game.caption('[breathing]');
    if (r < 2.2 && Math.random() < 0.35) {
      setTimeout(() => {
        if (game.mode === 'play') {
          game.hurtPlayer(8, 'Something in the dark');
          game.caption('[something brushes past you]');
        }
      }, 900);
    }
  }
  S.popT = (S.popT ?? 12) - dt;
  if (S.popT <= 0) {
    S.popT = 10;
    if (E.count('smiler') < 2 && Math.random() < 0.45) {
      const spot = game.findSpawnSpot({ min: 6, max: 14, los: true, notInView: true, clear: 0 });
      if (spot) game.spawn('smiler', spot.x, spot.z);
    }
  }
}

function ambience(game, a) {
  a.setRoomTone(0.1, 90);
  a.startBed('wind', { buf: 'pink', type: 'bandpass', freq: 300, Q: 0.5, gain: 0.02, lfo: 0.09, lfoDepth: 0.015 });
}

export default {
  id: 'level6',
  number: '6',
  name: 'Lights Out',
  survival: 'Class 4',
  tags: ['Unsafe', 'Unsecure', 'Entities: Unknown'],
  hint: 'There is no light. Save your batteries. Follow the cold draft — listen for the wind.',
  objective: (g) => (g.levelTime < 40 ? 'Follow the draft.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.2,
    bounceRange: 2,
    ambientColor: [1, 0.9, 0.8],
    ambientMin: [0.0006, 0.0006, 0.0008],
    fogColor: [0, 0, 0],
    fogDensity: 0.09,
    exposure: 1.5,
    grade: { tint: [0.95, 0.98, 1.05], saturation: 0.6, contrast: 1.12 },
    footsteps: 'concrete',
    reverb: { size: 0.9, decay: 1.2, wet: 0.3 },
    hum: 0,
    roomTone: 0.1,
    flashRange: 10,
    flashPower: 1.4,
    batteryDrain: 0.3,
    sanityRate: 0.12,
  },
  materials: [
    { tex: 'plasterGrey', grime: [0.4, 0.3, 0.04, 0.2], stainColor: [0.4, 0.4, 0.4], damp: 0.5 },
    { tex: 'concreteFloor', tint: [0.5, 0.5, 0.5] },
    { tex: 'concreteCeil', tint: [0.45, 0.45, 0.45] },
    { tex: 'rustyMetal' },
    { tex: 'black' },
    { tex: 'white', tint: [0.04, 0.09, 0.16], emissive: [0.7, 0.7, 0.7] },
  ],
  fixtureMaterial: { tex: 'cageBulb' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  defaultExit: 'level7',
  hallucinate: true,
};
