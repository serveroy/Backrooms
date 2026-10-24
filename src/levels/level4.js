// LEVEL 4 — "Abandoned Office"
// An empty office floor: cubicles, carpet tiles, humming troffers, water
// coolers that dispense Almond Water, and windows looking out on nothing.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, findWallSpot, findOpenCell, chunkRng, wallRuns } from './common.js';
import { troffer, partition, desk, monitor, officeChair, waterCooler, door, wallQuad } from './props.js';
import { ambientEvents } from './director.js';
import { Faceling } from '../entities/faceling.js';

const U = 16;
const CEIL = 2.75;

const M = {
  wall: 0,
  carpet: 1,
  ceil: 2,
  fabric: 3,
  metal: 4,
  wood: 5,
  plastic: 6,
  screen: 7,
  window: 8,
  door: 9,
  sign: 10,
  bottle: 11,
  frame: 12,
};

function params(seed) {
  return {
    U,
    seed,
    doorMin: 4,
    doorMax: 7,
    doorChance: 0.5,
    halfChance: 0.15,
    thickChance: 0.2,
    density: (Lx, Lz) => 0.12 + Math.max(0, fbm2(Lx / 4, Lz / 4, seed + 17, 2) - 0.45) * 1.1,
    pillar: () => 0.15,
    pillarSize: 2,
  };
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.carpet);
  L.matC.fill(M.ceil);
  const P = params(seed);
  rasterLattice(L, P);
  const rng = chunkRng(L, seed, 37);
  const per = CN / U;

  // ---- cubicle clusters in open lattice cells
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const gi = cx * per + i;
      const gj = cz * per + j;
      if (cx === 0 && cz === 0 && i === 0 && j === 0) continue;
      if (hashf(gi, gj, seed, 91) > 0.6) continue;
      const ox = i * U + 3;
      const oz = j * U + 3;
      let clear = true;
      for (let z = oz; z < oz + 11 && clear; z++) for (let x = ox; x < ox + 11; x++) if (L.get(x, z) & (F_SOLID | F_BLOCK)) clear = false;
      if (!clear) continue;
      const mx = ox + 5;
      const mz = oz + 5;
      // cross of partitions
      for (let k = 0; k < 11; k++) {
        L.or(ox + k, mz, F_BLOCK);
        L.or(mx, oz + k, F_BLOCK);
      }
      L.props.push({ type: 'cross', x: (cx * CN + ox) * CELL, z: (cz * CN + oz) * CELL, mx: (cx * CN + mx + 0.5) * CELL, mz: (cz * CN + mz + 0.5) * CELL, len: 11 * CELL });
      // a desk in each quadrant against the partition
      for (const [qx, qz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const dxc = mx + qx * 3;
        const dzc = mz + qz * 2;
        const h = hashf(gi * 4 + qx, gj * 4 + qz, seed, 92);
        if (h < 0.15) continue;
        L.rect(dxc - 2, dzc - 1, dxc + 3, dzc + 1, F_BLOCK, 'or');
        const ry = qz < 0 ? Math.PI : 0;
        L.props.push({ type: 'desk', x: L.wx(dxc), z: L.wz(dzc) + (qz < 0 ? -0.05 : 0.05) * 0, ry, mon: h > 0.3, chair: h > 0.25, tip: h > 0.92 });
      }
    }
  }

  // ---- troffers on a 2.4m grid
  for (let tz = 0; tz < CN; tz += 8) {
    for (let tx = 0; tx < CN; tx += 8) {
      const lx = tx + 5;
      const lz = tz + 4;
      if (L.get(lx, lz) & F_SOLID) continue;
      const gx = cx * CN + lx;
      const gz = cz * CN + lz;
      const h = hashf(gx, gz, seed, 33);
      if (h < 0.06) continue;
      let mode = h < 0.12 ? 'flicker' : h < 0.15 ? 'off' : 'on';
      L.fixtures.push({
        kind: 'troffer',
        x: gx * CELL,
        y: CEIL - 0.004,
        z: gz * CELL + CELL,
        rot: 0,
        w: 0.6,
        l: 1.2,
        color: [0.94, 0.97, 1.0],
        power: 3.6,
        radius: 6.5,
        soft: 0.9,
        omni: 0.1,
        mode,
        emitPower: 3.2,
      });
    }
  }

  // ---- windows along long walls
  const runs = wallRuns(L, 10);
  for (const r of runs) {
    if (hashf(cx * 97 + r.lx, cz * 89 + r.lz, seed, 94 + r.dx * 3 + r.dz) > 0.45) continue;
    const alongX = r.dz !== 0;
    for (let k = 2; k + 2 < r.len; k += 4) {
      const lx = alongX ? r.lx + k : r.lx;
      const lz = alongX ? r.lz : r.lz + k;
      L.props.push({ type: 'window', x: L.wx(lx) + r.dx * CELL * 0.5, z: L.wz(lz) + r.dz * CELL * 0.5, dx: r.dx, dz: r.dz });
      L.spawns.push({ kind: 'window', x: L.wx(lx), z: L.wz(lz), dx: r.dx, dz: r.dz });
    }
  }

  // ---- water coolers (Almond Water!)
  if (rng.next() < 0.5) {
    const s = findWallSpot(L, rng, 30);
    if (s) {
      const x = L.wx(s.lx) + s.dx * 0.02;
      const z = L.wz(s.lz) + s.dz * 0.02;
      L.props.push({ type: 'cooler', x, z });
      L.or(s.lx, s.lz, F_BLOCK);
      L.interact.push({ type: 'cooler', x, y: 1.0, z, prompt: 'Fill a bottle at the water cooler', reach: 2.0, cone: 0.7 });
    }
  }

  // ---- items
  if (rng.next() < 0.25) {
    const c = findOpenCell(L, rng, 1);
    if (c) L.items.push({ type: 'almond', x: L.wx(c[0]), z: L.wz(c[1]) });
  }
  if (rng.next() < 0.3) {
    const c = findOpenCell(L, rng, 1);
    if (c) L.items.push({ type: 'battery', x: L.wx(c[0]), z: L.wz(c[1]) });
  }
  if (rng.next() < 0.22) {
    const c = findOpenCell(L, rng, 1);
    if (c) L.items.push({ type: 'ration', x: L.wx(c[0]), z: L.wz(c[1]) });
  }
  if (rng.next() < 0.2) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }

  // ---- stairwell door
  const er = new RNG(hash32(cx, cz, seed, 4999));
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
      if (!ok) continue;
      const wx = L.wx(lx) + dx * CELL * 0.5;
      const wz = L.wz(lz) + dz * CELL * 0.5;
      L.props.push({ type: 'stairs', x: wx, z: wz, dx, dz });
      L.exits.push({ type: 'door', x: wx, z: wz, target: 'level5' });
      L.interact.push({ type: 'exit', target: 'level5', kind: 'door', x: wx - dx * 0.3, y: 1.1, z: wz - dz * 0.3, prompt: 'Take the stairs down', reach: 2.2, cone: 0.6 });
      break;
    }
  }
  return L;
}

export function buildFixture(f, fb) {
  troffer(f, fb);
}

export function buildProps(L, B) {
  const S = { fabric: M.fabric, metal: M.metal, wood: M.wood, plastic: M.plastic, screen: M.screen, bottle: M.bottle, frame: M.frame, slab: M.door, sign: M.sign };
  for (const p of L.props) {
    switch (p.type) {
      case 'cross':
        partition(B, S, p.x, p.mz, 'x', p.len, 1.45);
        partition(B, S, p.mx, p.z, 'z', p.len, 1.45);
        break;
      case 'desk': {
        desk(B, S, p.x, p.z, p.ry);
        const c = Math.cos(p.ry);
        const s = Math.sin(p.ry);
        if (p.mon) monitor(B, S, p.x - c * 0.15 + s * 0.12, 0.76, p.z + s * 0.15 + c * 0.12, p.ry);
        if (p.chair) officeChair(B, S, p.x - s * 0.62, p.z - c * 0.62, p.ry + Math.PI + 0.3, p.tip);
        break;
      }
      case 'window':
        wallQuad(B(M.window), p.x, 1.55, p.z, p.dx, p.dz, 1.1, 1.5, 0.012);
        break;
      case 'cooler':
        waterCooler(B, S, p.x, p.z, 0);
        break;
      case 'stairs':
        door(B, S, p.x, p.z, p.dx, p.dz, 0.95, 2.1);
        wallQuad(B(M.sign), p.x, 2.35, p.z, p.dx, p.dz, 0.5, 0.25, 0.02);
        break;
    }
  }
}

export function spawnPoint() {
  return { x: 6.5 * CELL, z: 6.5 * CELL, yaw: -Math.PI * 0.75 };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const E = game.entities;
  ambientEvents(game, dt, S, {
    every: [25, 60],
    events: [
      ['phone', 2],
      ['creak', 1],
      ['knock', 0.5],
      ['sputterBurst', 1],
    ],
  });
  S.popT = (S.popT ?? 15) - dt;
  if (S.popT <= 0) {
    S.popT = 20;
    if (E.count('faceling') < 2 && Math.random() < 0.5) {
      const spot = game.findSpawnSpot({ min: 14, max: 26, noLOS: true });
      if (spot) E.add(new Faceling(game, spot.x, spot.z));
    }
  }
  // something outside the windows (only when you aren't looking straight at it)
  S.winT = (S.winT ?? 60) - dt;
  if (S.winT <= 0) {
    S.winT = 50 + Math.random() * 60;
    game.caption('[tapping on glass]');
    game.audio.play('knock', { gain: 0.25, count: 4 });
  }
}

function ambience(game, a) {
  a.setRoomTone(0.035, 220);
  a.startBed('rain', { buf: 'pink', type: 'highpass', freq: 1800, Q: 0.4, gain: 0.03, lfo: 0.05, lfoDepth: 0.01 });
  a.startBed('hvac', { buf: 'brown', type: 'lowpass', freq: 240, Q: 0.6, gain: 0.05 });
}

export default {
  id: 'level4',
  number: '4',
  name: 'Abandoned Office',
  survival: 'Class 1',
  tags: ['Safe', 'Secure', 'Minimal Entity Count'],
  hint: 'A place to recover. Water coolers dispense Almond Water. Find the door marked STAIRS.',
  objective: (g) => (g.levelTime < 40 ? 'Find the stairwell.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.38,
    bounceRange: 3.6,
    ambientColor: [0.92, 0.95, 1.0],
    ambientMin: [0.006, 0.006, 0.007],
    ceilBounce: 3.0,
    fogColor: [0.05, 0.055, 0.06],
    fogDensity: 0.015,
    exposure: 1.15,
    grade: { tint: [0.98, 1.0, 1.02], saturation: 0.92, contrast: 1.08 },
    footsteps: 'carpet',
    reverb: { size: 0.8, decay: 0.9, wet: 0.18 },
    hum: 0.6,
    sanityRate: 0.0,
    loot: [['almond', 1]],
  },
  materials: [
    { tex: 'officeWall', grime: [0.25, 0.2, 0.04, 0.25], stainColor: [0.75, 0.7, 0.6], damp: 0.15 },
    { tex: 'officeCarpet', grime: [0.3, 0.2, 0.05, 0.2], stainColor: [0.6, 0.55, 0.5] },
    { tex: 'ceilingWhite', grime: [0.15, 0.1, 0.05, 0.2], stainColor: [0.8, 0.72, 0.55] },
    { tex: 'cubicleFabric' },
    { tex: 'white', tint: [0.38, 0.39, 0.4] },
    { tex: 'desktopWood' },
    { tex: 'white', tint: [0.75, 0.74, 0.7] },
    { tex: 'monitorScreen', emissive: [0.9, 0.9, 0.9] },
    { tex: 'windowNight', emissive: [0.12, 0.13, 0.16] },
    { tex: 'metalDoor', tint: [0.9, 0.95, 1.05] },
    { tex: 'stairsSign', emissive: [0.35, 0.35, 0.35] },
    { tex: 'white', tint: [0.55, 0.75, 0.85] },
    { tex: 'white', tint: [0.3, 0.3, 0.3] },
  ],
  fixtureMaterial: { tex: 'troffer' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  defaultExit: 'level5',
};
