// LEVEL 2 — "Pipe Dreams"
// Endless, hot, dark maintenance tunnels lined with pipes. Dim caged bulbs.
// Steam hisses. Somewhere there is a fire exit. If the lights ever turn
// red, run.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { carveNetwork, findWallSpot, findOpenCell, chunkRng, addBox } from './common.js';
import { cageBulb, pipe, valve, door, exitSign, wallQuad } from './props.js';
import { exitStatic, ambientEvents } from './director.js';
import { Smiler } from '../entities/smiler.js';
import { Hound } from '../entities/hound.js';

const U = 16; // 4.8m between junctions
const CEIL = 2.65;

const M = {
  wall: 0,
  floor: 1,
  ceil: 2,
  pipeGrey: 3,
  pipeRed: 4,
  pipeCopper: 5,
  metal: 6,
  door: 7,
  sign: 8,
  floorWet: 9,
  pipeYellow: 10,
  redSign: 11,
};

function params(seed) {
  return {
    U,
    seed,
    widths: [4, 4, 5, 6],
    edgeChance: (i, j) => 0.5 + (fbm2(i / 6, j / 6, seed + 3, 2) - 0.5) * 0.4,
    nodeSize: (i, j) => (hashf(i, j, seed, 88) < 0.06 ? 10 : 6),
  };
}

const PIPE_MATS = [M.pipeGrey, M.pipeRed, M.pipeCopper, M.pipeGrey, M.pipeYellow];

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  const segs = carveNetwork(L, params(seed));
  const rng = chunkRng(L, seed, 23);
  const per = CN / U;

  // the rare red corridor (gateway to Level !)
  const redEdge = (gi, gj) => hashf(gi, gj, seed, 4444) < 0.03 && Math.abs(gi) + Math.abs(gj) > 6;

  // ---- pipes along corridor walls (clipped to this chunk)
  for (const s of segs) {
    if (s.room) continue;
    const h = hashf(s.gi, s.gj, seed, s.axis === 'x' ? 501 : 502);
    const count = 2 + Math.floor(h * 3);
    for (let k = 0; k < count; k++) {
      const hk = hashf(s.gi, s.gj, seed, 600 + k + (s.axis === 'x' ? 0 : 50));
      const side = k % 2 ? 1 : -1;
      const ceilingPipe = k >= 3;
      const r = 0.035 + hk * 0.07;
      const y = ceilingPipe ? CEIL - r - 0.05 : 0.5 + ((k * 0.61 + hk) % 1) * 1.7;
      const mat = PIPE_MATS[Math.floor(hk * 977) % PIPE_MATS.length];
      if (s.axis === 'x') {
        const z = ceilingPipe ? (s.z0 + s.z1) / 2 + (hk - 0.5) * 2 : side < 0 ? s.z0 : s.z1;
        const zz = (cz * CN + z) * CELL + (ceilingPipe ? 0 : -side * (r + 0.02));
        const x0 = Math.max(0, s.x0);
        const x1 = Math.min(CN, s.x1);
        if (x1 - x0 < 2) continue;
        L.props.push({ type: 'pipe', axis: 'x', x: (cx * CN + (x0 + x1) / 2) * CELL, y, z: zz, len: (x1 - x0) * CELL, r, mat });
      } else {
        const x = ceilingPipe ? (s.x0 + s.x1) / 2 + (hk - 0.5) * 2 : side < 0 ? s.x0 : s.x1;
        const xx = (cx * CN + x) * CELL + (ceilingPipe ? 0 : -side * (r + 0.02));
        const z0 = Math.max(0, s.z0);
        const z1 = Math.min(CN, s.z1);
        if (z1 - z0 < 2) continue;
        L.props.push({ type: 'pipe', axis: 'z', x: xx, y, z: (cz * CN + (z0 + z1) / 2) * CELL, len: (z1 - z0) * CELL, r, mat });
      }
    }
    // valves and steam vents
    const mid = s.axis === 'x' ? [(s.x0 + s.x1) / 2, s.z0] : [s.x0, (s.z0 + s.z1) / 2];
    if (mid[0] >= 0 && mid[0] < CN && mid[1] >= 0 && mid[1] < CN) {
      const hv = hashf(s.gi, s.gj, seed, 700);
      if (hv < 0.3) {
        const dx = s.axis === 'x' ? 0 : -1;
        const dz = s.axis === 'x' ? -1 : 0;
        L.props.push({ type: 'valve', x: (cx * CN + mid[0]) * CELL - dx * 0.15, y: 1.25, z: (cz * CN + mid[1]) * CELL - dz * 0.15, dx, dz });
      }
    }
  }

  // ---- caged bulbs at junctions and mid-corridor
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const gi = cx * per + i;
      const gj = cz * per + j;
      const spots = [[i * U + 8, j * U + 8]];
      for (const [lx, lz] of spots) {
        if (L.get(lx, lz) & F_SOLID) continue;
        const h = hashf(gi, gj, seed, 51);
        const dk = fbm2(gi / 5 + 3, gj / 5, seed + 61, 2);
        let mode = 'on';
        if (dk > 0.64) mode = h < 0.2 ? 'dying' : 'off';
        else if (h < 0.18) mode = 'flicker';
        else if (h < 0.24) mode = 'off';
        const red = redEdge(gi, gj) || redEdge(gi - 1, gj) || redEdge(gi, gj - 1);
        L.fixtures.push({
          kind: 'bulb',
          x: (cx * CN + lx + 0.5) * CELL,
          y: CEIL - 0.42,
          z: (cz * CN + lz + 0.5) * CELL,
          ceil: CEIL,
          color: red ? [1.0, 0.08, 0.04] : [1.0, 0.6, 0.3],
          power: red ? 3.5 : 2.4,
          radius: 7,
          soft: 0.5,
          omni: 0.85,
          dir: [0, -1, 0],
          mode: red ? 'pulse' : mode,
          period: 1.1,
          emitPower: 5,
        });
        if (dk > 0.62) L.zone[lz * CN + lx] = 1;
      }
    }
  }
  // zone tags: 1 = dark, 2 = red corridor
  for (const s of segs) {
    if (s.room) continue;
    const red = redEdge(s.gi, s.gj);
    if (!red) continue;
    for (let z = Math.max(0, s.z0); z < Math.min(CN, s.z1); z++) {
      for (let x = Math.max(0, s.x0); x < Math.min(CN, s.x1); x++) L.zone[z * CN + x] = 2;
    }
  }
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx;
      const gz = cz * CN + lz;
      if (fbm2(gx / 18, gz / 18, seed + 9, 3) > 0.6) L.matF[lz * CN + lx] = M.floorWet;
      if (L.zone[lz * CN + lx] === 0 && fbm2((cx * per + lx / U) / 5 + 3, (cz * per + lz / U) / 5, seed + 61, 2) > 0.64) L.zone[lz * CN + lx] = 1;
    }
  }

  // ---- items
  if (rng.next() < 0.4) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'almond', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.22) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'battery', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.08) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'ration', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.2) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }

  // ---- fire exit
  const er = new RNG(hash32(cx, cz, seed, 2999));
  if (!(cx === 0 && cz === 0) && er.next() < 0.14) {
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
      if (!ok || L.zone[lz * CN + lx] === 2) continue;
      const wx = L.wx(lx) + dx * CELL * 0.5;
      const wz = L.wz(lz) + dz * CELL * 0.5;
      L.props.push({ type: 'door', x: wx, z: wz, dx, dz });
      L.exits.push({ type: 'door', x: wx, z: wz, target: 'level3' });
      L.interact.push({ type: 'exit', target: 'level3', kind: 'door', x: wx - dx * 0.3, y: 1.1, z: wz - dz * 0.3, prompt: 'Push open the fire exit', reach: 2.2, cone: 0.6 });
      // a painted arrow trail on nearby pipes would be nice; use a sign
      break;
    }
  }
  return L;
}

export function buildFixture(f, fb) {
  cageBulb(f, fb);
}

export function buildProps(L, B) {
  const S = { frame: M.metal, slab: M.door, metal: M.metal, sign: M.sign };
  for (const p of L.props) {
    switch (p.type) {
      case 'pipe':
        pipe(B(p.mat), p.axis, p.x, p.y, p.z, p.len, p.r, B(M.metal), 1.8);
        break;
      case 'valve':
        valve(B(M.pipeRed), p.x, p.y, p.z, p.dx, p.dz);
        break;
      case 'door':
        door(B, S, p.x, p.z, p.dx, p.dz, 1.0, 2.1);
        exitSign(B, S, p.x - p.dx * 0.01, 2.4, p.z - p.dz * 0.01, p.dx, p.dz);
        break;
    }
  }
}

export function spawnPoint() {
  return { x: 8.5 * CELL, z: 8.5 * CELL, yaw: 0 };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const p = game.player;
  const E = game.entities;
  ambientEvents(game, dt, S, {
    every: [9, 22],
    events: [
      ['clank', 3],
      ['drip', 2],
      ['spark', 0.5],
      ['boom', 1],
      ['growl', S.t > 90 ? 0.6 : 0],
      ['sputterBurst', 1],
    ],
  });
  // steam bursts
  S.steamT = (S.steamT ?? 5) - dt;
  if (S.steamT <= 0) {
    S.steamT = 4 + Math.random() * 8;
    const a = Math.random() * Math.PI * 2;
    game.audio.play('static', { pos: [p.x + Math.cos(a) * 5, 2.4, p.z + Math.sin(a) * 5], gain: 0.25, dur: 1.2 });
  }
  // the red corridor: step in and the alarm takes you
  if (game.world.zoneAt(p.x, p.z) === 2 && !S.red) {
    S.red = true;
    game.audio.play('alarm', { dur: 2.5, gain: 0.35 });
    game.caption('[ALARM]');
    game.redTint = 0.6;
    game.transition('levelrun', 'noclip');
  }
  S.popT = (S.popT ?? 10) - dt;
  if (S.popT <= 0) {
    S.popT = 9;
    const inDark = game.playerLight < 0.12;
    if (inDark && E.count('smiler') < 2 && Math.random() < 0.5) {
      const spot = game.findSpawnSpot({ min: 6, max: 13, los: true, dark: 0.07, notInView: true, clear: 0 });
      if (spot) E.add(new Smiler(game, spot.x, spot.z));
    }
    if (S.t > 80 && E.count('hound') < 1 && Math.random() < 0.3) {
      const spot = game.findSpawnSpot({ min: 18, max: 30, noLOS: true });
      if (spot) E.add(new Hound(game, spot.x, spot.z));
    }
  }
}

function ambience(game, a) {
  a.setRoomTone(0.08, 140);
  a.startBed('steam', { buf: 'white', type: 'highpass', freq: 3500, Q: 0.5, gain: 0.008, lfo: 0.13, lfoDepth: 0.006 });
  a.startBed('rumble', { buf: 'brown', type: 'lowpass', freq: 90, Q: 0.7, gain: 0.09 });
}

export default {
  id: 'level2',
  number: '2',
  name: 'Pipe Dreams',
  survival: 'Class 2',
  tags: ['Unsafe', 'Secure', 'Medium Entity Count'],
  hint: 'Find a red fire exit door. It is hot here: you get thirsty faster. If the lights turn red, run.',
  objective: (g) => (g.levelTime < 40 ? 'Find the fire exit.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.16,
    bounceRange: 3.2,
    ambientColor: [1.0, 0.7, 0.45],
    ambientMin: [0.003, 0.0022, 0.0015],
    ceilBounce: 1.4,
    fogColor: [0.025, 0.017, 0.012],
    fogDensity: 0.05,
    exposure: 1.6,
    grade: { tint: [1.04, 0.97, 0.9], saturation: 0.95, contrast: 1.08 },
    footsteps: 'concrete',
    reverb: { size: 1.2, decay: 1.8, wet: 0.3 },
    hum: 0.25,
    thirstRate: 0.16,
    loot: [['almond', 1]],
  },
  materials: [
    { tex: 'concreteDark', grime: [0.4, 0.35, 0.04, 0.2], stainColor: [0.45, 0.4, 0.35], damp: 0.8 },
    { tex: 'concreteFloor', tint: [0.75, 0.7, 0.66], grime: [0.4, 0.3, 0.05, 0.2], stainColor: [0.5, 0.45, 0.4] },
    { tex: 'concreteCeil', tint: [0.7, 0.68, 0.66], grime: [0.3, 0.2, 0.05, 0.2] },
    { tex: 'pipeGrey', grime: [0.3, 0.3, 0.3, 1] },
    { tex: 'pipeRed', grime: [0.3, 0.3, 0.3, 1] },
    { tex: 'pipeCopper', grime: [0.3, 0.3, 0.3, 1] },
    { tex: 'rustyMetal', grime: [0.2, 0.3, 0.2, 0.6] },
    { tex: 'fireDoor' },
    { tex: 'exitSign', emissive: [2.6, 2.6, 2.6] },
    { tex: 'concreteFloor', tint: [0.5, 0.48, 0.46], grime: [0.2, 0.2, 0.05, 0.2], spec: 1.1 },
    { tex: 'pipeYellow', grime: [0.3, 0.3, 0.3, 1] },
    { tex: 'white', tint: [1, 0.1, 0.05], emissive: [1.5, 0.1, 0.05] },
  ],
  fixtureMaterial: { tex: 'cageBulb' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  defaultExit: 'level3',
};
