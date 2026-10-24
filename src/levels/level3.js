// LEVEL 3 — "Electrical Station"
// Brick and concrete corridors packed with humming machinery, high-voltage
// panels and cable runs. Very dangerous. The way on is a freight elevator.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, findWallSpot, findOpenCell, chunkRng, addBox } from './common.js';
import { hangingTube, pipe, electricalBox, door, wallQuad } from './props.js';
import { ambientEvents } from './director.js';
import { Smiler } from '../entities/smiler.js';
import { Hound } from '../entities/hound.js';
import { SkinStealer } from '../entities/skinstealer.js';

const U = 8;
const CEIL = 3.0;

const M = {
  brick: 0,
  floor: 1,
  ceil: 2,
  concrete: 3,
  metal: 4,
  panel: 5,
  cable: 6,
  machine: 7,
  elevator: 8,
  hazard: 9,
  pipe: 10,
  warn: 11,
};

function params(seed) {
  return {
    U,
    seed,
    doorMin: 3,
    doorMax: 5,
    doorChance: 0.5,
    halfChance: 0.1,
    thickChance: 0.6,
    density: (Lx, Lz) => 0.35 + fbm2(Lx / 5, Lz / 5, seed + 31, 2) * 0.3,
    pillar: () => 0.2,
    pillarSize: 2,
  };
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  rasterLattice(L, params(seed));
  // brick in most places, bare concrete in others
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx;
      const gz = cz * CN + lz;
      L.matW[lz * CN + lx] = fbm2(gx / 30, gz / 30, seed + 2, 2) > 0.55 ? M.concrete : M.brick;
    }
  }
  const rng = chunkRng(L, seed, 29);
  const per = CN / U;

  // ---- machinery blocks filling some lattice cells
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const gi = cx * per + i;
      const gj = cz * per + j;
      if (hashf(gi, gj, seed, 71) < 0.16 && !(cx === 0 && cz === 0)) {
        const x0 = i * U + 2;
        const z0 = j * U + 2;
        let ok = true;
        for (let z = z0; z < z0 + 4; z++) for (let x = x0; x < x0 + 4; x++) if (L.get(x, z) & F_SOLID) ok = false;
        if (!ok) continue;
        L.rect(x0, z0, x0 + 4, z0 + 4, F_BLOCK, 'or');
        L.props.push({ type: 'machine', x: L.wx(x0) + CELL * 1.5, z: L.wz(z0) + CELL * 1.5, h: 1.6 + hashf(gi, gj, seed, 72) * 0.9 });
      }
    }
  }

  // ---- fluorescent tubes on short chains
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const lx = i * U + 4;
      const lz = j * U + 4;
      if (L.get(lx, lz) & (F_SOLID | F_BLOCK)) continue;
      const gi = cx * per + i;
      const gj = cz * per + j;
      const h = hashf(gi, gj, seed, 81);
      if (h < 0.12) continue;
      const dk = fbm2(gi / 6 - 4, gj / 6 + 2, seed + 91, 2) - Math.max(0, 1 - Math.hypot(gi, gj) / 8) * 0.6;
      let mode = 'on';
      if (dk > 0.63) mode = h < 0.3 ? 'dying' : 'off';
      else if (h < 0.36) mode = 'flicker';
      else if (h < 0.4) mode = 'dying';
      L.fixtures.push({
        kind: 'tube',
        x: (cx * CN + lx + 0.5) * CELL,
        y: CEIL - 0.3,
        z: (cz * CN + lz + 0.5) * CELL,
        rot: hashf(gi, gj, seed, 82) < 0.5 ? 1 : 0,
        l: 1.25,
        ceil: CEIL,
        color: [0.82, 1.0, 0.86],
        power: 3.6,
        radius: 7.5,
        soft: 0.8,
        omni: 0.3,
        mode,
        emitPower: 4,
      });
    }
  }
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const gi = (cx * CN + lx) / U;
      const gj = (cz * CN + lz) / U;
      if (fbm2(gi / 6 - 4, gj / 6 + 2, seed + 91, 2) > 0.6) L.zone[lz * CN + lx] = 1;
    }
  }

  // ---- electrical panels + cable runs on walls
  for (let k = 0; k < 5; k++) {
    const s = findWallSpot(L, rng, 30);
    if (!s) continue;
    const x = L.wx(s.lx) + s.dx * CELL * 0.5;
    const z = L.wz(s.lz) + s.dz * CELL * 0.5;
    L.props.push({ type: 'panel', x, z, dx: s.dx, dz: s.dz });
    L.spawns.push({ kind: 'spark', x: x - s.dx * 0.3, z: z - s.dz * 0.3 });
  }
  for (let k = 0; k < 4; k++) {
    const s = findWallSpot(L, rng, 30);
    if (!s) continue;
    L.props.push({ type: 'cables', x: L.wx(s.lx) + s.dx * 0.1, z: L.wz(s.lz) + s.dz * 0.1, dx: s.dx, dz: s.dz });
  }
  if (rng.next() < 0.4) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.props.push({ type: 'warn', x: L.wx(s.lx) + s.dx * CELL * 0.5, z: L.wz(s.lz) + s.dz * CELL * 0.5, dx: s.dx, dz: s.dz });
  }

  // ---- items
  if (rng.next() < 0.4) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'almond', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.3) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'battery', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.12) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'ration', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.18) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }

  // ---- freight elevator
  const er = new RNG(hash32(cx, cz, seed, 3999));
  if (!(cx === 0 && cz === 0) && er.next() < 0.12) {
    for (let t = 0; t < 40; t++) {
      const s = findWallSpot(L, er, 20);
      if (!s) break;
      const { lx, lz, dx, dz } = s;
      const ax = dz !== 0 ? 1 : 0;
      const az = dx !== 0 ? 1 : 0;
      let ok = true;
      for (let k = -4; k <= 4 && ok; k++) {
        if (!(L.get(lx + dx + ax * k, lz + dz + az * k) & F_SOLID)) ok = false;
        for (let f = 0; f <= 3; f++) {
          const o = L.get(lx - dx * f + ax * k, lz - dz * f + az * k);
          if (o === undefined || o & (F_SOLID | F_BLOCK)) ok = false;
        }
      }
      if (!ok) continue;
      const wx = L.wx(lx) + dx * CELL * 0.5;
      const wz = L.wz(lz) + dz * CELL * 0.5;
      L.props.push({ type: 'elevator', x: wx, z: wz, dx, dz });
      L.exits.push({ type: 'door', x: wx, z: wz, target: 'level4' });
      L.interact.push({ type: 'exit', target: 'level4', kind: 'elevator', x: wx - dx * 0.3, y: 1.2, z: wz - dz * 0.3, prompt: 'Call the freight elevator', reach: 2.4, cone: 0.55 });
      L.fixtures.push({
        kind: 'bulb',
        x: wx - dx * 0.25,
        y: 2.55,
        z: wz - dz * 0.25,
        ceil: CEIL,
        color: [1.0, 0.75, 0.3],
        power: 2.2,
        radius: 5,
        omni: 0.9,
        mode: 'pulse',
        period: 2.4,
        emitPower: 5,
      });
      break;
    }
  }
  return L;
}

export function buildFixture(f, fb) {
  if (f.kind === 'bulb') {
    const s0 = fb.count;
    addBox(fb, f.x, f.y + 0.06, f.z, 0.16, 0.06, 0.16);
    for (let v = s0; v < fb.count; v++) fb.emit[v] = [0, 0, 0];
    addBox(fb, f.x, f.y, f.z, 0.12, 0.06, 0.12);
    return;
  }
  hangingTube(f, fb);
}

export function buildProps(L, B) {
  const S = { metal: M.metal, panel: M.panel };
  for (const p of L.props) {
    switch (p.type) {
      case 'machine': {
        const b = B(M.machine);
        addBox(b, p.x, p.h / 2, p.z, 1.15, p.h, 1.15, 0, 1);
        addBox(B(M.metal), p.x, p.h + 0.05, p.z, 0.8, 0.1, 0.8);
        addBox(B(M.hazard), p.x, 0.1, p.z, 1.2, 0.2, 1.2, 0, 0.6);
        pipe(B(M.pipe), 'y', p.x + 0.3, p.h + (CEIL - p.h) / 2, p.z + 0.3, CEIL - p.h, 0.06, null);
        pipe(B(M.cable), 'y', p.x - 0.35, p.h + (CEIL - p.h) / 2, p.z - 0.2, CEIL - p.h, 0.03, null);
        break;
      }
      case 'panel':
        electricalBox(B, S, p.x, 1.3, p.z, p.dx, p.dz, 0.55, 0.75);
        break;
      case 'cables': {
        const axis = p.dx !== 0 ? 'z' : 'x';
        for (let k = 0; k < 3; k++) pipe(B(M.cable), axis, p.x - p.dx * k * 0.03, 2.55 - k * 0.07, p.z - p.dz * k * 0.03, 3.6, 0.018, null);
        break;
      }
      case 'warn':
        wallQuad(B(M.warn), p.x, 1.6, p.z, p.dx, p.dz, 0.45, 0.45);
        break;
      case 'elevator': {
        door(B, { frame: M.metal, slab: M.elevator }, p.x, p.z, p.dx, p.dz, 1.7, 2.3);
        // hazard frame
        const across = p.dx !== 0 ? 'z' : 'x';
        const hz = B(M.hazard);
        if (across === 'z') {
          addBox(hz, p.x - p.dx * 0.03, 2.48, p.z, 0.06, 0.2, 2.1);
        } else {
          addBox(hz, p.x, 2.48, p.z - p.dz * 0.03, 2.1, 0.2, 0.06);
        }
        break;
      }
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
  ambientEvents(game, dt, S, {
    every: [8, 18],
    events: [
      ['spark', 3],
      ['clank', 2],
      ['boom', 1],
      ['growl', 1],
      ['sputterBurst', 2],
      ['whisper', 0.5],
    ],
  });
  // arcs from nearby electrical panels
  S.arcT = (S.arcT ?? 3) - dt;
  if (S.arcT <= 0) {
    S.arcT = 2 + Math.random() * 6;
    let best = null;
    let bd = 14;
    for (const c of game.world.chunks.values()) {
      for (const s of c.layout.spawns) {
        if (s.kind !== 'spark') continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bd && Math.random() < 0.6) {
          bd = d;
          best = s;
        }
      }
    }
    if (best) {
      game.audio.play('spark', { pos: [best.x, 1.4, best.z], gain: 0.6 });
      game.flashPoint(best.x, 1.4, best.z, [3.5, 3.2, 5], 6, 0.25);
      if (bd < 1.4) game.hurtPlayer(12, 'Electrocuted', best);
    }
  }
  S.popT = (S.popT ?? 6) - dt;
  if (S.popT <= 0) {
    S.popT = 8;
    if (S.t > 25 && E.count('hound') < 2 && Math.random() < 0.6) {
      const spot = game.findSpawnSpot({ min: 18, max: 30, noLOS: true });
      if (spot) E.add(new Hound(game, spot.x, spot.z));
    }
    if (S.t > 60 && E.count('skinstealer') < 1 && Math.random() < 0.35) {
      const spot = game.findSpawnSpot({ min: 14, max: 26, noLOS: true });
      if (spot) E.add(new SkinStealer(game, spot.x, spot.z));
    }
    if (game.playerLight < 0.12 && E.count('smiler') < 2 && Math.random() < 0.4) {
      const spot = game.findSpawnSpot({ min: 6, max: 13, los: true, dark: 0.07, notInView: true, clear: 0 });
      if (spot) E.add(new Smiler(game, spot.x, spot.z));
    }
  }
}

function ambience(game, a) {
  a.setRoomTone(0.06, 200);
  a.startBed('machines', { buf: 'brown', type: 'lowpass', freq: 160, Q: 2, gain: 0.12, lfo: 0.5, lfoDepth: 0.04 });
  a.startBed('buzz', { buf: 'pink', type: 'bandpass', freq: 2200, Q: 3, gain: 0.02 });
}

export default {
  id: 'level3',
  number: '3',
  name: 'Electrical Station',
  survival: 'Class 4',
  tags: ['Unsafe', 'Unsecure', 'High Entity Count'],
  hint: 'Find the freight elevator (hazard stripes, an amber light). Avoid sparking panels. Look at anyone who calls for help.',
  objective: (g) => (g.levelTime < 40 ? 'Find the freight elevator.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.2,
    bounceRange: 3.0,
    ambientColor: [0.85, 0.95, 0.85],
    ambientMin: [0.003, 0.0035, 0.003],
    ceilBounce: 1.3,
    fogColor: [0.02, 0.024, 0.02],
    fogDensity: 0.045,
    exposure: 1.45,
    grade: { tint: [0.97, 1.02, 0.96], saturation: 0.9, contrast: 1.1 },
    footsteps: 'concrete',
    reverb: { size: 1.4, decay: 1.6, wet: 0.3 },
    hum: 1.0,
    loot: [
      ['almond', 2],
      ['battery', 2],
    ],
  },
  materials: [
    { tex: 'brick', grime: [0.3, 0.3, 0.05, 0.25], stainColor: [0.4, 0.35, 0.3], damp: 0.4 },
    { tex: 'concreteFloor', tint: [0.7, 0.7, 0.68], grime: [0.35, 0.3, 0.05, 0.2] },
    { tex: 'concreteCeil', tint: [0.6, 0.6, 0.6] },
    { tex: 'concreteDark', grime: [0.3, 0.3, 0.05, 0.2] },
    { tex: 'rustyMetal', tint: [0.8, 0.8, 0.8] },
    { tex: 'electricBox' },
    { tex: 'white', tint: [0.05, 0.05, 0.05] },
    { tex: 'metalPanel', grime: [0.25, 0.3, 0.2, 0.6] },
    { tex: 'elevatorDoor' },
    { tex: 'hazardStripe' },
    { tex: 'pipeGrey' },
    { tex: 'electricBox' },
  ],
  fixtureMaterial: { tex: 'tubeLamp' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  defaultExit: 'level4',
};
