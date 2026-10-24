// LEVEL 0 — "The Lobby" / "Tutorial Level"
// Mono-yellow wallpaper, old moist carpet, fluorescent lights at maximum
// hum-buzz and ~600 million square miles of randomly segmented rooms.

import { CN, CELL, ChunkLayout, F_SOLID, F_VOID } from '../world/layout.js';
import { Howler } from '../entities/howler.js';
import { Smiler } from '../entities/smiler.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, placeGlitchWall, findWallSpot, findOpenCell, addBox, addPart, cylGeo, chunkRng } from './common.js';
import { exitStatic, ambientEvents } from './director.js';

const U = 8; // lattice unit in cells (2.4m)
const CEIL = 2.7;

// material slots
const M = {
  wall: 0,
  carpet: 1,
  ceil: 2,
  ceilStain: 3,
  ceilHole: 4,
  glitch: 5,
  carpetWet: 6,
  plastic: 7,
  cardboard: 8,
  metal: 9,
  wallDark: 10,
};

function params(seed) {
  return {
    U,
    seed,
    doorMin: 3,
    doorMax: 5,
    doorChance: 0.4,
    halfChance: 0.12,
    thickChance: 0.16,
    density: (Lx, Lz) => {
      const n = fbm2(Lx / 6.5, Lz / 6.5, seed + 7, 3);
      // 0.12 (open halls) .. 0.66 (dense office maze)
      return 0.12 + Math.max(0, Math.min(1, (n - 0.28) * 1.9)) * 0.54;
    },
    pillar: (Lx, Lz) => {
      const n = fbm2(Lx / 6.5, Lz / 6.5, seed + 7, 3);
      return n < 0.38 ? 0.55 : 0;
    },
    pillarSize: 2,
  };
}

function darkness(Lx, Lz, seed) {
  // never start a run in the dark: lights near the entry point always work
  const near = Math.max(0, 1 - (Math.hypot(Lx, Lz) * 2.4) / 24);
  return fbm2(Lx / 7.5 + 100, Lz / 7.5 - 50, seed + 99, 3) - near * 0.6;
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  const P = params(seed);
  L.matW.fill(M.wall);
  L.matF.fill(M.carpet);
  L.matC.fill(M.ceil);
  rasterLattice(L, P);
  const rng = chunkRng(L, seed, 17);
  const per = CN / U;

  // subdivided pockets: narrow corridors on half-lattice lines
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const Lx = cx * per + i;
      const Lz = cz * per + j;
      const sub = fbm2(Lx / 5 - 40, Lz / 5 + 20, seed + 55, 2);
      if (sub > 0.66 && hashf(Lx, Lz, seed, 77) < 0.45) {
        const vert = hashf(Lx, Lz, seed, 78) < 0.5;
        const door = 1 + Math.floor(hashf(Lx, Lz, seed, 79) * 4);
        for (let k = 1; k < U; k++) {
          if (k >= door && k < door + 3) continue;
          if (vert) L.or(i * U + 4, j * U + k, F_SOLID);
          else L.or(i * U + k, j * U + 4, F_SOLID);
        }
      }
    }
  }

  // ---- lighting: one troffer per lattice cell on the ceiling grid
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const Lx = cx * per + i;
      const Lz = cz * per + j;
      const h = hashf(Lx, Lz, seed, 31);
      if (h < 0.08) continue; // gap in the grid
      const rot = fbm2(Lx / 9, Lz / 9, seed + 3, 2) > 0.62 ? 1 : 0;
      // troffer aligned to the 0.6m tile grid
      const lx = i * U + 5;
      const lz = j * U + 4;
      const cell = L.get(lx, lz);
      if (cell & F_SOLID) continue;
      const dk = darkness(Lx, Lz, seed);
      let mode = 'on';
      const r = hashf(Lx, Lz, seed, 32);
      if (dk > 0.68) mode = r < 0.12 ? 'dying' : 'off';
      else if (dk > 0.62) mode = r < 0.5 ? 'off' : r < 0.75 ? 'flicker' : 'on';
      else if (r < 0.035) mode = 'off';
      else if (r < 0.1) mode = 'flicker';
      else if (r < 0.11) mode = 'dying';
      const x = (cx * CN + lx) * CELL;
      const z = (cz * CN + lz) * CELL + (rot ? 0 : CELL);
      L.fixtures.push({
        kind: 'troffer',
        x,
        y: CEIL - 0.004,
        z,
        rot,
        w: 0.6,
        l: 1.2,
        color: [1.0, 0.94, 0.76],
        power: 4.0,
        radius: 6.5,
        soft: 0.9,
        omni: 0.1,
        mode,
        emitPower: 3.2,
      });
      L.zone[lz * CN + lx] = dk > 0.68 ? 1 : 0;
    }
  }
  // mark dark zone cells for gameplay (entity spawns, sanity)
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const Lx = cx * per + Math.floor(lx / U);
      const Lz = cz * per + Math.floor(lz / U);
      L.zone[lz * CN + lx] = darkness(Lx, Lz, seed) > 0.66 ? 1 : 0;
    }
  }

  // ---- floor: damp carpet patches
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx;
      const gz = cz * CN + lz;
      const w = fbm2(gx / 26, gz / 26, seed + 404, 3);
      if (w > 0.66) L.matF[lz * CN + lx] = M.carpetWet;
    }
  }

  // ---- rare pit rooms: a hole in the floor that goes down forever
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const Lx = cx * per + i;
      const Lz = cz * per + j;
      if (Math.hypot(Lx, Lz) < 6 || hashf(Lx, Lz, seed, 515) > 0.012) continue;
      for (let z = j * U + 2; z < j * U + 7; z++) {
        for (let x = i * U + 2; x < i * U + 7; x++) {
          if (L.get(x, z) & F_SOLID) continue;
          L.or(x, z, F_VOID);
          L.matF[z * CN + x] = M.wallDark;
        }
      }
    }
  }

  // ---- ceiling tiles: stained ones, missing ones
  for (let tz = 0; tz < CN; tz += 2) {
    for (let tx = 0; tx < CN; tx += 2) {
      const gx = cx * CN + tx;
      const gz = cz * CN + tz;
      const h = hashf(gx, gz, seed, 61);
      let m = -1;
      if (h < 0.006) m = M.ceilHole;
      else if (h < 0.05) m = M.ceilStain;
      if (m < 0) continue;
      // don't punch holes where a light sits
      let clash = false;
      for (const f of L.fixtures) {
        if (Math.abs(f.x - (gx + 1) * CELL) < 0.7 && Math.abs(f.z - (gz + 1) * CELL) < 1.0) clash = true;
      }
      if (clash) continue;
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          L.matC[(tz + b) * CN + tx + a] = m;
        }
      }
    }
  }

  // ---- exits: noclip glitch walls
  const nearSpawn = Math.abs(cx) <= 0 && Math.abs(cz) <= 0;
  const er = new RNG(hash32(cx, cz, seed, 999));
  if (!nearSpawn && er.next() < 0.16) {
    const toPool = er.next() < 0.18;
    placeGlitchWall(L, er, M.glitch, toPool ? 'level37' : 'level1', { hue: toPool ? 'blue' : 'yellow' });
  }

  // ---- props & details
  // wall outlets
  for (let k = 0; k < 6; k++) {
    const s = findWallSpot(L, rng, 20);
    if (!s) continue;
    L.props.push({ type: 'outlet', ...cellPos(L, s), dx: s.dx, dz: s.dz });
  }
  if (rng.next() < 0.1) {
    const c = findOpenCell(L, rng, 2);
    if (c) L.props.push({ type: 'chair', x: L.wx(c[0]), z: L.wz(c[1]), ry: rng.range(0, Math.PI * 2) });
  }
  if (rng.next() < 0.12) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.props.push({ type: 'box', ...cellPos(L, s), dx: s.dx, dz: s.dz, ry: rng.range(-0.3, 0.3), n: rng.int(1, 3) });
  }
  if (rng.next() < 0.05) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.props.push({ type: 'vent', ...cellPos(L, s), dx: s.dx, dz: s.dz });
  }

  // ---- items
  if (rng.next() < 0.33) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'almond', x: L.wx(s.lx) + s.dx * 0.05, y: 0, z: L.wz(s.lz) + s.dz * 0.05 });
  }
  if (rng.next() < 0.1) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'battery', x: L.wx(s.lx), y: 0, z: L.wz(s.lz) });
  }
  if (rng.next() < 0.16) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), y: 0, z: L.wz(s.lz) });
  }

  // entity spawn hints in dark cells
  for (let k = 0; k < 3; k++) {
    const c = findOpenCell(L, rng, 1, 20, (lx, lz) => L.zone[lz * CN + lx] === 1);
    if (c) L.spawns.push({ kind: 'dark', x: L.wx(c[0]), z: L.wz(c[1]) });
  }
  return L;
}

function cellPos(L, s) {
  // position on the wall face in front of the cell
  return {
    x: L.wx(s.lx) + s.dx * (CELL * 0.5),
    z: L.wz(s.lz) + s.dz * (CELL * 0.5),
  };
}

export function buildFixture(f, b) {
  const hw = (f.rot ? f.l : f.w) / 2;
  const hl = (f.rot ? f.w : f.l) / 2;
  const y = f.y;
  const p = [
    [f.x - hw, y, f.z - hl],
    [f.x + hw, y, f.z - hl],
    [f.x + hw, y, f.z + hl],
    [f.x - hw, y, f.z + hl],
  ];
  const uv = f.rot
    ? [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ]
    : [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
  b.quadP(p, [0, -1, 0], uv);
}

export function buildProps(L, B) {
  for (const p of L.props) {
    switch (p.type) {
      case 'outlet': {
        const b = B(M.plastic);
        const ry = p.dx !== 0 ? Math.PI / 2 : 0;
        addBox(b, p.x - p.dx * 0.004, 0.32, p.z - p.dz * 0.004, p.dx !== 0 ? 0.012 : 0.07, 0.115, p.dx !== 0 ? 0.07 : 0.012, 0, 0.3);
        const d = B(M.wallDark);
        // the two sockets
        for (const oy of [0.295, 0.345]) {
          addBox(d, p.x - p.dx * 0.011, oy, p.z - p.dz * 0.011, p.dx !== 0 ? 0.004 : 0.03, 0.022, p.dx !== 0 ? 0.03 : 0.004, 0, 1);
        }
        void ry;
        break;
      }
      case 'vent': {
        const b = B(M.metal);
        addBox(b, p.x - p.dx * 0.006, 2.25, p.z - p.dz * 0.006, p.dx !== 0 ? 0.02 : 0.45, 0.25, p.dx !== 0 ? 0.45 : 0.02, 0, 0.3);
        const d = B(M.wallDark);
        for (let k = 0; k < 5; k++) {
          addBox(d, p.x - p.dx * 0.017, 2.16 + k * 0.045, p.z - p.dz * 0.017, p.dx !== 0 ? 0.004 : 0.4, 0.02, p.dx !== 0 ? 0.4 : 0.004, 0, 1);
        }
        break;
      }
      case 'chair': {
        // old office chair, tipped slightly
        const b = B(M.plastic);
        const m = B(M.metal);
        const ry = p.ry;
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        const at = (ox, oz) => [p.x + ox * c + oz * s, p.z - ox * s + oz * c];
        let q = at(0, 0);
        addBox(b, q[0], 0.47, q[1], 0.46, 0.08, 0.44, ry);
        q = at(0, -0.21);
        addBox(b, q[0], 0.8, q[1], 0.42, 0.5, 0.06, ry);
        q = at(0, 0);
        addPart(m, cylGeo(8), q[0], 0.28, q[1], 0.05, 0.36, 0.05);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + ry;
          addBox(m, p.x + Math.cos(a) * 0.17, 0.06, p.z + Math.sin(a) * 0.17, 0.32, 0.03, 0.04, -a);
        }
        break;
      }
      case 'box': {
        const b = B(M.cardboard);
        let y = 0;
        for (let k = 0; k < p.n; k++) {
          const sx = 0.45 - k * 0.06;
          const sy = 0.32 - k * 0.04;
          addBox(b, p.x - p.dx * 0.3, y + sy / 2, p.z - p.dz * 0.3, sx, sy, sx * 0.8, p.ry + k * 0.3, 0.5);
          y += sy;
        }
        break;
      }
    }
  }
}

export function spawnPoint() {
  return { x: (4.5 + 0.5) * CELL, z: (4.5 - 1.5) * CELL, yaw: -Math.PI * 0.75 };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const p = game.player;
  const E = game.entities;
  exitStatic(game, dt, S);
  ambientEvents(game, dt, S, {
    every: [22, 55],
    events: [
      ['boom', 1],
      ['sputterBurst', 2],
      ['distantGallop', S.t > 150 ? 1 : 0],
      ['knock', 0.5],
      ['creak', 0.6],
    ],
  });
  // The Howler: rare, and it takes a while before it notices you're here.
  if (S.howlerAt === undefined) S.howlerAt = 240 + Math.random() * 180;
  if (!E.count('howler') && (S.t > S.howlerAt || (p.sanity < 25 && S.t > 120 && !S.panicSpawn))) {
    if (p.sanity < 25) S.panicSpawn = true;
    const spot = game.findSpawnSpot({ min: 26, max: 38, noLOS: true, clear: 1 });
    if (spot) {
      E.add(new Howler(game, spot.x, spot.z));
      S.howlerAt = S.t + 320 + Math.random() * 260;
    }
  }
  // Smilers live in the dead-light zones
  S.smT = (S.smT ?? 5) - dt;
  if (S.smT <= 0) {
    S.smT = 7;
    const inDark = game.playerLight < 0.16 || game.world.zoneAt(p.x, p.z) === 1;
    if (inDark && E.count('smiler') < 2 && Math.random() < 0.4) {
      const spot = game.findSpawnSpot({ min: 7, max: 15, los: true, dark: 0.06, notInView: true, clear: 0 });
      if (spot) E.add(new Smiler(game, spot.x, spot.z));
    }
  }
}

function ambience(game, a) {
  a.setRoomTone(0.045, 160);
}

export function surfaceAt(game, x, z) {
  const { L, i } = game.world.cellIndex(Math.floor(x / CELL), Math.floor(z / CELL));
  return L.matF[i] === M.carpetWet ? 'wetcarpet' : 'carpet';
}

export default {
  id: 'level0',
  hint: 'Find a way out. Exits here are glitching walls — listen for static and walk into them.',
  objective: (g) => (g.levelTime < 40 ? 'Find a way out.\nListen for static.' : ''),
  director,
  ambience,
  surfaceAt,
  defaultExit: 'level1',
  fallTarget: 'level1',
  number: '0',
  name: 'The Lobby',
  survival: 'Class 1',
  tags: ['Safe', 'Secure', 'Minimal Entity Count'],
  config: {
    ceilY: CEIL,
    bounce: 0.34,
    bounceRange: 3.6,
    ambientColor: [1.0, 0.88, 0.56],
    ambientMin: [0.004, 0.0035, 0.002],
    ceilBounce: 3.2,
    fogColor: [0.035, 0.029, 0.014],
    fogDensity: 0.014,
    exposure: 1.45,
    grade: { tint: [1.0, 0.985, 0.9], saturation: 1.04, contrast: 1.04 },
    footsteps: 'carpet',
    reverb: { size: 0.9, decay: 1.1, wet: 0.22 },
    hum: 1.0,
    maxLightRadius: 8.5,
  },
  materials: [
    { tex: 'wallpaperL0', tint: [1, 1, 1], grime: [0.38, 0.22, 0.045, 0.25], stainColor: [0.72, 0.58, 0.33], damp: 0.55 },
    { tex: 'carpetL0', tint: [1, 1, 1], grime: [0.45, 0.3, 0.05, 0.2], stainColor: [0.6, 0.5, 0.36] },
    { tex: 'ceilingL0', tint: [1, 1, 1], grime: [0.15, 0.12, 0.05, 0.2], stainColor: [0.8, 0.68, 0.45] },
    { tex: 'ceilingStainedL0', tint: [1, 1, 1], grime: [0.1, 0.1, 0.05, 0.2] },
    { tex: 'black', tint: [0.2, 0.2, 0.2], grime: [0, 0, 0.05, 0.2] },
    { tex: 'wallpaperL0', tint: [1, 1, 1], grime: [0.3, 0.2, 0.045, 0.25], glitch: true },
    { tex: 'carpetL0', tint: [0.72, 0.68, 0.6], grime: [0.6, 0.3, 0.05, 0.2], stainColor: [0.6, 0.52, 0.4], spec: 0.35 },
    { tex: 'white', tint: [0.82, 0.8, 0.72], grime: [0.1, 0.15, 0.2, 0.6] },
    { tex: 'white', tint: [0.55, 0.42, 0.26], grime: [0.3, 0.3, 0.6, 1.2] },
    { tex: 'white', tint: [0.45, 0.45, 0.44], grime: [0.2, 0.3, 0.4, 1.0] },
    { tex: 'white', tint: [0.05, 0.045, 0.035], grime: [0, 0, 0.1, 0.1] },
  ],
  fixtureMaterial: { tex: 'troffer' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
};
