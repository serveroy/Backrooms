// LEVEL 1 — "Habitable Zone"
// A vast concrete warehouse: pillars, steel beams, hanging fluorescent
// strips, puddles and drifting fog. Supply crates appear here; the lights
// fail without warning and the Hounds hunt in the dark.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, findWallSpot, findOpenCell, addBox, chunkRng } from './common.js';
import { hangingTube, crateStack, cardboardStack, door, exitSign, shelf, pipe, wallQuad } from './props.js';
import { exitStatic, ambientEvents } from './director.js';
import { Hound } from '../entities/hound.js';
import { Deathmoth } from '../entities/deathmoth.js';
import { Faceling } from '../entities/faceling.js';
import { Smiler } from '../entities/smiler.js';

const U = 16; // 4.8m lattice
const CEIL = 4.6;

const M = {
  wall: 0,
  floor: 1,
  ceil: 2,
  floorWet: 3,
  door: 4,
  metal: 5,
  sign: 6,
  crate: 7,
  cardboard: 8,
  pillar: 9,
  partyDoor: 10,
  beam: 11,
  pipe: 12,
};

function params(seed) {
  return {
    U,
    seed,
    doorMin: 5,
    doorMax: 9,
    doorChance: 0.45,
    halfChance: 0.2,
    thickChance: 0.5,
    density: (Lx, Lz) => {
      const n = fbm2(Lx / 4, Lz / 4, seed + 11, 3);
      return 0.08 + Math.max(0, (n - 0.35) * 1.4) * 0.5;
    },
    pillar: (Lx, Lz) => (fbm2(Lx / 4, Lz / 4, seed + 11, 3) < 0.6 ? 0.85 : 0.3),
    pillarSize: 3,
  };
}

function darkness(gx, gz, seed) {
  const near = Math.max(0, 1 - (Math.hypot(gx, gz) * CELL) / 24);
  return fbm2(gx / 70 + 13, gz / 70 - 7, seed + 77, 3) - near * 0.6;
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  rasterLattice(L, params(seed));
  // pillars get their own material
  for (let i = 0; i < CN * CN; i++) if (L.flags[i] & F_SOLID) L.matW[i] = M.wall;
  const rng = chunkRng(L, seed, 19);
  const per = CN / U;

  // ---- puddles
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx;
      const gz = cz * CN + lz;
      if (fbm2(gx / 14, gz / 14, seed + 5, 3) > 0.64) L.matF[lz * CN + lx] = M.floorWet;
    }
  }

  // ---- hanging strip lights in rows
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      for (const sub of [0, 1]) {
        const lx = i * U + 8;
        const lz = j * U + (sub ? 12 : 4);
        if (L.get(lx, lz) & F_SOLID) continue;
        const gx = cx * CN + lx;
        const gz = cz * CN + lz;
        const dk = darkness(gx, gz, seed);
        const h = hashf(gx, gz, seed, 41);
        if (h < 0.15) continue;
        let mode = 'on';
        if (dk > 0.66) mode = h < 0.3 ? 'dying' : 'off';
        else if (h < 0.24) mode = 'flicker';
        else if (h < 0.27) mode = 'off';
        L.fixtures.push({
          kind: 'tube',
          x: (gx + 0.5) * CELL,
          y: 3.3,
          z: (gz + 0.5) * CELL,
          rot: 0,
          l: 1.25,
          w: 0.25,
          ceil: CEIL,
          color: [0.88, 0.95, 1.0],
          power: 6.5,
          radius: 10,
          soft: 1.2,
          omni: 0.3,
          mode,
          emitPower: 4.5,
        });
      }
    }
  }
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      if (darkness(cx * CN + lx, cz * CN + lz, seed) > 0.64) L.zone[lz * CN + lx] = 1;
    }
  }

  // ---- steel beams along lattice lines (across open space)
  for (let j = 0; j < per; j++) {
    const lz = j * U;
    let run = 0;
    for (let lx = 0; lx <= CN; lx++) {
      const open = lx < CN && !(L.get(lx, lz) & F_SOLID);
      if (open) run++;
      if ((!open || lx === CN) && run > 4) {
        L.props.push({ type: 'beam', axis: 'x', x: (cx * CN + lx - run / 2) * CELL, z: (cz * CN + lz + 0.5) * CELL, len: run * CELL });
        run = 0;
      } else if (!open) run = 0;
    }
  }

  // ---- storage: crates, boxes, shelving (blocking)
  const nStore = rng.int(2, 6);
  for (let k = 0; k < nStore; k++) {
    const c = findOpenCell(L, rng, 3);
    if (!c) continue;
    const [lx, lz] = c;
    const kind = rng.weighted([
      ['crates', 3],
      ['boxes', 3],
      ['shelf', 2],
    ]);
    if (kind === 'shelf') {
      const rot = rng.chance(0.5);
      L.props.push({ type: 'shelf', x: L.wx(lx), z: L.wz(lz), ry: rot ? Math.PI / 2 : 0 });
      const hx = rot ? 1 : 3;
      const hz = rot ? 3 : 1;
      L.rect(lx - hx, lz - hz, lx + hx + 1, lz + hz + 1, F_BLOCK, 'or');
    } else {
      L.props.push({ type: kind, x: L.wx(lx), z: L.wz(lz), ry: rng.range(-0.4, 0.4), n: rng.int(1, 3) });
      L.rect(lx - 1, lz - 1, lx + 2, lz + 2, F_BLOCK, 'or');
    }
  }
  // supply crate (lootable)
  if (rng.next() < 0.55) {
    const c = findOpenCell(L, rng, 2);
    if (c) {
      const [lx, lz] = c;
      L.props.push({ type: 'crates', x: L.wx(lx), z: L.wz(lz), ry: rng.range(-0.3, 0.3), n: 1 });
      L.rect(lx - 1, lz - 1, lx + 2, lz + 2, F_BLOCK, 'or');
      L.interact.push({ type: 'crate', x: L.wx(lx), y: 0.6, z: L.wz(lz), prompt: 'Search supply crate', reach: 2.0, cone: 0.7 });
    }
  }
  // wall pipes for texture
  for (let k = 0; k < 3; k++) {
    const s = findWallSpot(L, rng, 30);
    if (!s) continue;
    L.props.push({ type: 'wallpipe', x: L.wx(s.lx) + s.dx * 0.12, z: L.wz(s.lz) + s.dz * 0.12, dx: s.dx, dz: s.dz });
  }

  // ---- items
  if (rng.next() < 0.45) {
    const c = findOpenCell(L, rng, 1);
    if (c) L.items.push({ type: 'almond', x: L.wx(c[0]), z: L.wz(c[1]) });
  }
  if (rng.next() < 0.25) {
    const c = findOpenCell(L, rng, 1);
    if (c) L.items.push({ type: 'battery', x: L.wx(c[0]), z: L.wz(c[1]) });
  }
  if (rng.next() < 0.18) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }

  // ---- exits
  const er = new RNG(hash32(cx, cz, seed, 1999));
  const near = Math.abs(cx) <= 0 && Math.abs(cz) <= 0;
  if (!near && er.next() < 0.13) placeDoor(L, er, 'level2', 'door', 'Open maintenance door');
  if (!near && er.next() < 0.025) placeDoor(L, er, 'levelfun', 'partyDoor', 'Open the door with the balloon');
  return L;
}

function placeDoor(L, rng, target, kind, prompt) {
  for (let t = 0; t < 40; t++) {
    const s = findWallSpot(L, rng, 20);
    if (!s) return;
    const { lx, lz, dx, dz } = s;
    // need ~1.2m of wall run and floor space in front
    const ax = dz !== 0 ? 1 : 0;
    const az = dx !== 0 ? 1 : 0;
    let ok = true;
    for (let k = -2; k <= 2 && ok; k++) {
      const wf = L.get(lx + dx + ax * k, lz + dz + az * k);
      if (!(wf & F_SOLID)) ok = false;
      for (let f = 0; f <= 2; f++) {
        const of = L.get(lx - dx * f + ax * k, lz - dz * f + az * k);
        if (of === undefined || of & (F_SOLID | F_BLOCK)) ok = false;
      }
    }
    if (!ok) continue;
    const wx = L.wx(lx) + dx * CELL * 0.5;
    const wz = L.wz(lz) + dz * CELL * 0.5;
    L.props.push({ type: kind, x: wx, z: wz, dx, dz });
    L.exits.push({ type: 'door', x: wx, z: wz, target });
    L.interact.push({ type: 'exit', target, kind: 'door', x: wx - dx * 0.3, y: 1.1, z: wz - dz * 0.3, prompt, reach: 2.2, cone: 0.6 });
    return;
  }
}

export function buildFixture(f, fb) {
  hangingTube(f, fb);
}

export function buildProps(L, B) {
  const S = { frame: M.metal, slab: M.door, metal: M.metal, sign: M.sign, box: M.cardboard };
  for (const p of L.props) {
    switch (p.type) {
      case 'beam': {
        const b = B(M.beam);
        addBox(b, p.x, CEIL - 0.18, p.z, p.len, 0.36, 0.08);
        addBox(b, p.x, CEIL - 0.35, p.z, p.len, 0.03, 0.22);
        break;
      }
      case 'crates':
        crateStack(B(M.crate), p.x, p.z, p.ry, p.n, 0.75);
        break;
      case 'boxes':
        cardboardStack(B(M.cardboard), p.x, p.z, p.ry, p.n + 1);
        cardboardStack(B(M.cardboard), p.x + 0.35, p.z + 0.2, p.ry + 0.5, p.n);
        break;
      case 'shelf':
        shelf(B, S, p.x, p.z, p.ry, 1.8);
        break;
      case 'door':
        door(B, S, p.x, p.z, p.dx, p.dz, 1.0, 2.15);
        exitSign(B, S, p.x - p.dx * 0.01, 2.55, p.z - p.dz * 0.01, p.dx, p.dz);
        break;
      case 'partyDoor': {
        door(B, { ...S, slab: M.partyDoor }, p.x, p.z, p.dx, p.dz, 0.95, 2.1);
        break;
      }
      case 'wallpipe': {
        const axis = p.dx !== 0 ? 'z' : 'x';
        pipe(B(M.pipe), axis, p.x, 2.6, p.z, 4.6, 0.07, B(M.metal), 1.2);
        pipe(B(M.pipe), axis, p.x, 2.95, p.z, 4.6, 0.045, null);
        break;
      }
    }
  }
}

export function spawnPoint() {
  return { x: 8.5 * CELL, z: 8.5 * CELL, yaw: Math.PI * 0.75 };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const E = game.entities;
  const p = game.player;
  ambientEvents(game, dt, S, {
    every: [14, 32],
    events: [
      ['drip', 3],
      ['boom', 1],
      ['clank', 1],
      ['growl', S.t > 60 ? 1 : 0],
      ['sputterBurst', 1.5],
    ],
  });
  // drips echo constantly
  S.dripT = (S.dripT ?? 2) - dt;
  if (S.dripT <= 0) {
    S.dripT = 1.5 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2;
    game.audio.play('drip', { pos: [p.x + Math.cos(a) * 6, 2, p.z + Math.sin(a) * 6], gain: 0.18 });
  }
  // ---- blackouts: the lights fail without warning
  S.blackT = S.blackT ?? 70 + Math.random() * 60;
  S.blackT -= dt;
  if (!S.blackout && S.blackT <= 0) {
    S.blackout = true;
    S.blackDur = 9 + Math.random() * 10;
    S.blackT = 0;
    game.audio.play('sputter', { gain: 0.5 });
    game.audio.play('drone', { gain: 0.25, dur: S.blackDur + 2 });
    game.caption('[the lights die]');
  }
  if (S.blackout) {
    S.blackT += dt;
    const k = S.blackT < 0.8 ? (Math.random() < 0.5 ? 0.05 : 0.6) : 0.015;
    game.setLightScale(k);
    if (S.blackT > S.blackDur) {
      S.blackout = false;
      S.blackT = 90 + Math.random() * 90;
      game.setLightScale(1);
      game.audio.play('sputter', { gain: 0.5 });
    }
    // something with a grin appears while it's dark
    if (S.blackT > 3 && !S.blackSmiler && E.count('smiler') < 1) {
      S.blackSmiler = true;
      const spot = game.findSpawnSpot({ min: 6, max: 12, los: true, notInView: true, clear: 0 });
      if (spot) E.add(new Smiler(game, spot.x, spot.z));
    }
  } else S.blackSmiler = false;

  // ---- population
  S.popT = (S.popT ?? 20) - dt;
  if (S.popT <= 0) {
    S.popT = 12;
    if (S.t > 45 && E.count('hound') < (S.blackout ? 3 : 2)) {
      const spot = game.findSpawnSpot({ min: 22, max: 34, noLOS: true });
      if (spot) E.add(new Hound(game, spot.x, spot.z));
    }
    if (E.count('deathmoth') < 1 && Math.random() < 0.3) {
      const spot = game.findSpawnSpot({ min: 18, max: 30, noLOS: true });
      if (spot) E.add(new Deathmoth(game, spot.x, spot.z));
    }
    if (E.count('faceling') < 2 && Math.random() < 0.35) {
      const spot = game.findSpawnSpot({ min: 15, max: 28, noLOS: true });
      if (spot) E.add(new Faceling(game, spot.x, spot.z));
    }
  }
  void S.unused;
}

function ambience(game, a) {
  a.setRoomTone(0.07, 120);
  a.startBed('wind', { buf: 'pink', type: 'bandpass', freq: 400, Q: 0.6, gain: 0.025, lfo: 0.07, lfoDepth: 0.015 });
}

export default {
  id: 'level1',
  number: '1',
  name: 'Habitable Zone',
  survival: 'Class 1',
  tags: ['Safe', 'Secure', 'Low Entity Count'],
  hint: 'Find a heavy maintenance door marked EXIT. Search M.E.G. supply crates. When the lights die, stand still.',
  objective: (g) => (g.levelTime < 40 ? 'Find a maintenance door marked EXIT.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.22,
    bounceRange: 4.0,
    ambientColor: [0.75, 0.8, 0.85],
    ambientMin: [0.004, 0.0045, 0.005],
    ceilBounce: 1.2,
    fogColor: [0.03, 0.034, 0.038],
    fogDensity: 0.04,
    exposure: 1.35,
    grade: { tint: [0.96, 1.0, 1.03], saturation: 0.82, contrast: 1.08 },
    footsteps: 'concrete',
    reverb: { size: 2, decay: 2.6, wet: 0.38 },
    hum: 0.7,
    roomTone: 0.07,
    loot: [
      ['almond', 4],
      ['battery', 3],
      ['ration', 2],
    ],
  },
  materials: [
    { tex: 'concreteWall', grime: [0.3, 0.3, 0.04, 0.2], stainColor: [0.6, 0.6, 0.58], damp: 0.6 },
    { tex: 'concreteFloor', grime: [0.35, 0.3, 0.05, 0.2], stainColor: [0.55, 0.53, 0.5] },
    { tex: 'concreteCeil', grime: [0.2, 0.2, 0.05, 0.2] },
    { tex: 'concreteFloor', tint: [0.62, 0.63, 0.66], grime: [0.2, 0.2, 0.05, 0.2], spec: 0.9 },
    { tex: 'metalDoor' },
    { tex: 'rustyMetal', grime: [0.2, 0.3, 0.2, 0.6] },
    { tex: 'exitSign', emissive: [2.6, 2.6, 2.6] },
    { tex: 'woodCrate' },
    { tex: 'cardboard' },
    { tex: 'concreteWall', tint: [0.9, 0.9, 0.9] },
    { tex: 'partyWallpaper', tint: [1.1, 0.8, 0.8] },
    { tex: 'rustyMetal', tint: [0.6, 0.6, 0.62] },
    { tex: 'pipeGrey' },
  ],
  fixtureMaterial: { tex: 'tubeLamp' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  defaultExit: 'level2',
};
