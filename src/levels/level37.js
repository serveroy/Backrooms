// LEVEL 37 — "Sublimity" (the Poolrooms)
// White tile, warm turquoise water, soft daylight from nowhere. No
// entities. It is the most peaceful place you have ever been, and you
// have never felt more watched. The deepest pool's drain leads on.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK, F_WATER } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, findWallSpot, chunkRng, addBox } from './common.js';
import { skylight } from './props.js';
import { ambientEvents } from './director.js';

const U = 16;
const CEIL = 4.4;
const WL = -0.14; // water surface

const M = { tile: 0, floor: 1, ceil: 2, pool: 3, deep: 4, drain: 5, low: 6 };

function params(seed) {
  return {
    U,
    seed,
    doorMin: 5,
    doorMax: 9,
    doorChance: 0.55,
    halfChance: 0.25,
    thickChance: 0.7,
    density: (Lx, Lz) => 0.1 + fbm2(Lx / 4, Lz / 4, seed + 37, 2) * 0.38,
    pillar: () => 0.55,
    pillarSize: 3,
  };
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.tile);
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  rasterLattice(L, params(seed));
  const W = L.ensureWater();
  const per = CN / U;
  const rng = chunkRng(L, seed, 83);
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const gi = cx * per + i;
      const gj = cz * per + j;
      const h = hashf(gi, gj, seed, 91);
      const start = gi === 0 && gj === 0;
      // lower, tunnel-like rooms now and then
      const low = !start && hashf(gi, gj, seed, 95) < 0.15;
      if (low) {
        for (let z = j * U; z < j * U + U; z++) for (let x = i * U; x < i * U + U; x++) {
          L.ceilY[z * CN + x] = 2.5;
          L.matC[z * CN + x] = M.low;
        }
      }
      // skylight in the middle of each room
      const sx = i * U + 8;
      const sz = j * U + 8;
      if (!(L.get(sx, sz) & F_SOLID)) {
        const ceil = L.ceilY[sz * CN + sx];
        L.fixtures.push({
          kind: 'skylight',
          x: (cx * CN + sx) * CELL,
          y: ceil - 0.01,
          z: (cz * CN + sz) * CELL,
          w: low ? 0.9 : 2.1,
          l: low ? 0.9 : 2.1,
          color: [1.0, 0.98, 0.95],
          power: low ? 3 : 9,
          radius: low ? 6 : 12,
          soft: 2.5,
          omni: 0.25,
          mode: 'on',
          emitPower: 3.2,
          bounceMul: 1.4,
        });
      }
      if (start) continue;
      // pools
      let kind = h < 0.035 ? 'drain' : h < 0.45 ? 'pool' : 'dry';
      if (kind === 'dry') continue;
      const x0 = i * U + 3;
      const z0 = j * U + 3;
      const x1 = i * U + U - 1;
      const z1 = j * U + U - 1;
      const depth = kind === 'drain' ? -4.2 : -1.25 - hashf(gi, gj, seed, 92) * 0.6;
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const k = z * CN + x;
          if (L.flags[k] & F_SOLID) continue;
          L.floorY[k] = depth;
          L.flags[k] |= F_WATER;
          W[k] = WL;
          L.matF[k] = kind === 'drain' ? M.deep : M.pool;
          L.zone[k] = kind === 'drain' ? 4 : 3;
        }
      }
      // pool steps along one edge
      for (let z = z0; z < z1; z++) {
        const k = z * CN + x0;
        if (!(L.flags[k] & F_SOLID) && kind !== 'drain') L.floorY[k] = -0.45;
        const k2 = z * CN + x0 + 1;
        if (!(L.flags[k2] & F_SOLID) && kind !== 'drain') L.floorY[k2] = -0.9;
      }
      if (kind === 'drain') {
        const dxm = Math.floor((x0 + x1) / 2);
        const dzm = Math.floor((z0 + z1) / 2);
        L.props.push({ type: 'drain', x: L.wx(dxm), z: L.wz(dzm), y: depth });
        L.exits.push({ type: 'drain', x: L.wx(dxm), z: L.wz(dzm), target: 'level4' });
        L.interact.push({ type: 'exit', target: 'level4', kind: 'noclip', x: L.wx(dxm), y: WL + 0.6, z: L.wz(dzm), prompt: 'Dive down toward the drain', reach: 4.2, cone: -1, swimOnly: true });
      }
    }
  }
  // every open cell next to a pool edge is dry walkway: nothing to do
  if (rng.next() < 0.25) {
    const s = findWallSpot(L, rng, 30);
    if (s && L.floorY[s.lz * CN + s.lx] === 0) L.items.push({ type: 'almond', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.2) {
    const s = findWallSpot(L, rng, 30);
    if (s && L.floorY[s.lz * CN + s.lx] === 0) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  return L;
}

export function buildFixture(f, fb) {
  skylight(f, fb);
}

export function buildProps(L, B) {
  for (const p of L.props) {
    if (p.type === 'drain') {
      const b = B(M.drain);
      addBox(b, p.x, p.y + 0.02, p.z, 1.2, 0.04, 1.2);
      for (let k = -2; k <= 2; k++) addBox(B(M.tile), p.x + k * 0.2, p.y + 0.05, p.z, 0.04, 0.03, 1.2);
    }
  }
}

export function spawnPoint() {
  return { x: 8.5 * CELL, z: 6.5 * CELL, yaw: Math.PI };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  ambientEvents(game, dt, S, {
    every: [12, 30],
    events: [['drip', 3]],
  });
  // soft, distant, dreamlike tones
  S.padT = (S.padT ?? 4) - dt;
  if (S.padT <= 0) {
    S.padT = 9 + Math.random() * 8;
    game.audio.play('drone', { gain: 0.12, dur: 8, pitch: 4 });
  }
}

function interactHandler(game, it) {
  if (it.swimOnly && !game.player.swimming) {
    game.toast('Get into the water first.');
    return true;
  }
  return false;
}

function ambience(game, a) {
  a.setRoomTone(0.02, 300);
  a.startBed('water', { buf: 'pink', type: 'bandpass', freq: 700, Q: 0.6, gain: 0.03, lfo: 0.3, lfoDepth: 0.015 });
}

export default {
  id: 'level37',
  number: '37',
  name: 'Sublimity (The Poolrooms)',
  survival: 'Class 0',
  tags: ['Safe', 'Secure', 'Devoid of Entities'],
  hint: 'Peaceful. To leave, swim into the deepest pool — the one with the dark drain — and dive.',
  objective: (g) => (g.levelTime < 40 ? 'Find the deepest pool.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.9,
    bounceRange: 5,
    ambientColor: [0.95, 1.0, 1.0],
    ambientMin: [0.03, 0.035, 0.038],
    ceilBounce: 1.5,
    fogColor: [0.62, 0.7, 0.72],
    fogDensity: 0.011,
    exposure: 1.15,
    grade: { tint: [0.98, 1.01, 1.02], saturation: 0.9, contrast: 0.96 },
    vignette: 0.15,
    footsteps: 'tile',
    reverb: { size: 3, decay: 3.4, wet: 0.5 },
    hum: 0,
    sanityRate: -0.06,
    thirstRate: 0.06,
    waterLevel: WL,
    flashPower: 1.0,
  },
  materials: [
    { tex: 'poolTile', grime: [0.08, 0.1, 0.04, 0.15], stainColor: [0.85, 0.85, 0.8] },
    { tex: 'poolTile', grime: [0.1, 0.1, 0.04, 0.15] },
    { tex: 'poolTile', grime: [0.06, 0.08, 0.04, 0.15] },
    { tex: 'poolTileBlue', caustic: 1.4 },
    { tex: 'poolTileBlue', tint: [0.4, 0.5, 0.6], caustic: 0.6 },
    { tex: 'black' },
    { tex: 'poolTile', tint: [0.92, 0.94, 0.95] },
  ],
  water: { deep: [0.03, 0.28, 0.36], shallow: [0.4, 0.8, 0.85], reflect: [0.85, 0.92, 0.95], clarity: 0.85, specular: 1.6 },
  fixtureMaterial: { tex: 'skylight' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  interactHandler,
  ambience,
  defaultExit: 'level4',
  hallucinate: false,
};
