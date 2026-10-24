// LEVEL 5 — "Terror Hotel"
// An endless 1920s hotel: red carpet, damask wallpaper, brass sconces,
// numbered doors that are all locked. A piano plays somewhere. When the
// music stops, stop moving. The boiler room leads on.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { carveNetwork, findWallSpot, findOpenCell, chunkRng, wallRuns, addBox } from './common.js';
import { sconce, chandelier, door, wallQuad, pianoProp, table } from './props.js';
import { ambientEvents, exitCue } from './director.js';

const U = 16;
const CEIL = 3.2;

const M = {
  wall: 0,
  carpet: 1,
  ceil: 2,
  wood: 3,
  door: 4,
  brass: 5,
  boiler: 6,
  sign: 7,
  cloth: 8,
  keys: 9,
  floorWood: 10,
};

function params(seed) {
  return {
    U,
    seed,
    widths: [7, 8, 8],
    edgeChance: (i, j) => 0.6 + (fbm2(i / 5, j / 5, seed + 13, 2) - 0.5) * 0.3,
    nodeSize: (i, j) => (hashf(i, j, seed, 55) < 0.1 && Math.abs(i) + Math.abs(j) > 1 ? 18 : 8),
  };
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.carpet);
  L.matC.fill(M.ceil);
  const segs = carveNetwork(L, params(seed));
  const rng = chunkRng(L, seed, 41);

  // ---- ballrooms: wooden floor, chandeliers, piano
  for (const s of segs) {
    if (!s.room) continue;
    for (let z = Math.max(0, s.z0); z < Math.min(CN, s.z1); z++) {
      for (let x = Math.max(0, s.x0); x < Math.min(CN, s.x1); x++) {
        L.matF[z * CN + x] = M.floorWood;
        L.ceilY[z * CN + x] = 4.6;
      }
    }
    const mx = (s.x0 + s.x1) / 2;
    const mz = (s.z0 + s.z1) / 2;
    if (mx >= 0 && mx < CN && mz >= 0 && mz < CN) {
      for (const [ox, oz] of [
        [-2.5, -2.5],
        [2.5, 2.5],
        [-2.5, 2.5],
        [2.5, -2.5],
      ]) {
        L.fixtures.push({
          kind: 'chandelier',
          x: (cx * CN + mx + ox) * CELL,
          y: 3.4,
          z: (cz * CN + mz + oz) * CELL,
          ceil: 4.6,
          color: [1.0, 0.78, 0.5],
          power: 3.2,
          radius: 9,
          soft: 1.2,
          omni: 0.85,
          dir: [0, -1, 0],
          mode: hashf(s.gi, s.gj, seed, ox * 3 + oz) < 0.2 ? 'flicker' : 'on',
          emitPower: 4,
        });
      }
      const px = Math.floor(mx + 4);
      const pz = Math.floor(mz - 4);
      if (px > 1 && pz > 1 && px < CN - 3 && pz < CN - 3) {
        L.rect(px - 3, pz - 1, px + 3, pz + 2, F_BLOCK, 'or');
        L.props.push({ type: 'piano', x: L.wx(px), z: L.wz(pz), ry: 0 });
        L.spawns.push({ kind: 'piano', x: L.wx(px), z: L.wz(pz) });
      }
      for (const [ox, oz] of [
        [-4, 3],
        [3, 4],
      ]) {
        const tx = Math.floor(mx + ox);
        const tz = Math.floor(mz + oz);
        if (tx > 2 && tz > 2 && tx < CN - 3 && tz < CN - 3) {
          L.rect(tx - 2, tz - 1, tx + 3, tz + 2, F_BLOCK, 'or');
          L.props.push({ type: 'table', x: L.wx(tx), z: L.wz(tz), ry: 0 });
        }
      }
    }
  }

  // ---- wall dressing: wainscot runs, sconces, room doors
  const runs = wallRuns(L, 2);
  let roomNo = 100 + Math.floor(hashf(cx, cz, seed, 3) * 800);
  for (const r of runs) {
    L.props.push({ type: 'wainscot', ...r, x: L.wx(r.lx), z: L.wz(r.lz) });
    const alongX = r.dz !== 0;
    if (r.len < 5) continue;
    for (let k = 2; k + 2 < r.len; k += 8) {
      const lx = alongX ? r.lx + k : r.lx;
      const lz = alongX ? r.lz : r.lz + k;
      const wx = L.wx(lx) + r.dx * CELL * 0.5;
      const wz = L.wz(lz) + r.dz * CELL * 0.5;
      const h = hashf(cx * CN + lx, cz * CN + lz, seed, 77);
      if (L.matF[lz * CN + lx] === M.floorWood) continue;
      // sconce
      L.fixtures.push({
        kind: 'sconce',
        x: wx - r.dx * 0.22,
        y: 1.95,
        z: wz - r.dz * 0.22,
        dx: r.dx,
        dz: r.dz,
        color: [1.0, 0.66, 0.36],
        power: 1.35,
        radius: 6,
        soft: 0.4,
        omni: 0.7,
        dir: [0, -1, 0],
        mode: h < 0.15 ? 'flicker' : h < 0.22 ? 'off' : 'on',
        emitPower: 3.5,
      });
      // a room door half way to the next sconce
      const k2 = k + 4;
      if (k2 + 2 >= r.len) continue;
      const dlx = alongX ? r.lx + k2 : r.lx;
      const dlz = alongX ? r.lz : r.lz + k2;
      const dx2 = L.wx(dlx) + r.dx * CELL * 0.5;
      const dz2 = L.wz(dlz) + r.dz * CELL * 0.5;
      roomNo += 1 + Math.floor(h * 3);
      L.props.push({ type: 'roomdoor', x: dx2, z: dz2, dx: r.dx, dz: r.dz });
      L.interact.push({ type: 'knock', x: dx2 - r.dx * 0.3, y: 1.2, z: dz2 - r.dz * 0.3, prompt: `Knock on room ${roomNo}`, reach: 1.8, cone: 0.75, no: roomNo });
    }
  }

  // ---- items
  if (rng.next() < 0.35) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'almond', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.35) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'battery', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.12) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'ration', x: L.wx(s.lx), z: L.wz(s.lz) });
  }
  if (rng.next() < 0.2) {
    const s = findWallSpot(L, rng, 30);
    if (s) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz) });
  }

  // ---- boiler room door
  const er = new RNG(hash32(cx, cz, seed, 5999));
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
      // don't overlap a room door: drop props/interactables near this spot
      L.props = L.props.filter((p) => !(p.type === 'roomdoor' && Math.hypot(p.x - wx, p.z - wz) < 1.4));
      L.interact = L.interact.filter((p) => !(p.type === 'knock' && Math.hypot(p.x - wx, p.z - wz) < 1.6));
      L.props.push({ type: 'boiler', x: wx, z: wz, dx, dz });
      L.exits.push({ type: 'door', x: wx, z: wz, target: 'level6' });
      L.interact.push({ type: 'exit', target: 'level6', kind: 'door', x: wx - dx * 0.3, y: 1.1, z: wz - dz * 0.3, prompt: 'Enter the Boiler Room', reach: 2.2, cone: 0.6 });
      L.fixtures.push({ kind: 'sconce', x: wx - dx * 0.22, y: 2.4, z: wz - dz * 0.22, dx, dz, color: [1, 0.2, 0.08], power: 1.6, radius: 5, omni: 0.8, mode: 'pulse', period: 3, emitPower: 5 });
      break;
    }
  }
  return L;
}

export function buildFixture(f, fb) {
  if (f.kind === 'chandelier') chandelier(f, fb);
  else sconce(f, fb);
}

export function buildProps(L, B) {
  const S = { frame: M.wood, slab: M.door, metal: M.brass, wood: M.wood, keys: M.keys, top: M.cloth, legs: M.wood };
  for (const p of L.props) {
    switch (p.type) {
      case 'wainscot': {
        const alongX = p.dz !== 0;
        const len = p.len * CELL;
        const ox = alongX ? p.x - CELL / 2 + len / 2 : p.x + p.dx * (CELL / 2 - 0.02);
        const oz = alongX ? p.z + p.dz * (CELL / 2 - 0.02) : p.z - CELL / 2 + len / 2;
        const sx = alongX ? len : 0.04;
        const sz = alongX ? 0.04 : len;
        addBox(B(M.wood), ox, 0.5, oz, sx, 1.0, sz, 0, 1);
        // chair rail + skirting
        addBox(B(M.wood), ox - p.dx * 0.02, 1.02, oz - p.dz * 0.02, alongX ? len : 0.06, 0.05, alongX ? 0.06 : len, 0, 0.3);
        // crown moulding
        addBox(B(M.wood), ox, CEIL - 0.06, oz, alongX ? len : 0.08, 0.12, alongX ? 0.08 : len, 0, 0.3);
        break;
      }
      case 'roomdoor':
        door(B, S, p.x, p.z, p.dx, p.dz, 0.9, 2.2);
        break;
      case 'boiler':
        door(B, { ...S, slab: M.boiler }, p.x, p.z, p.dx, p.dz, 1.0, 2.2);
        wallQuad(B(M.sign), p.x, 2.45, p.z, p.dx, p.dz, 0.7, 0.2, 0.02);
        break;
      case 'piano':
        pianoProp(B, S, p.x, p.z, p.ry);
        break;
      case 'table':
        table(B, S, p.x, p.z, p.ry, 1.4, 0.9);
        break;
    }
  }
}

export function spawnPoint() {
  return { x: 8.5 * CELL, z: 8.5 * CELL, yaw: 0 };
}

function nearestPiano(game) {
  const p = game.player;
  let best = null;
  let bd = 1e9;
  for (const c of game.world.chunks.values()) {
    for (const s of c.layout.spawns) {
      if (s.kind !== 'piano') continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
  }
  return best;
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const p = game.player;
  const E = game.entities;
  exitCue(game, dt, S, { type: 'door', sound: 'boom', opts: { gain: 0.45 }, every: 6, caption: '[a boiler rumbling]' });
  ambientEvents(game, dt, S, {
    every: [20, 45],
    events: [
      ['creak', 2],
      ['knock', 1],
      ['whisper', 0.6],
      ['boom', 0.5],
    ],
  });
  // ---- the piano, and the silence
  S.musicT = (S.musicT ?? 3) - dt;
  if (!S.silence && S.musicT <= 0) {
    S.musicT = 6 + Math.random() * 3;
    const pn = nearestPiano(game);
    const pos = pn ? [pn.x, 1.2, pn.z] : [p.x + 30, 1.5, p.z + 30];
    game.audio.play('piano', { pos, gain: 0.5, notes: 7, ref: 6, rolloff: 0.6 });
    S.phrases = (S.phrases || 0) + 1;
    if (S.phrases > 3 && Math.random() < 0.22) {
      S.silence = true;
      S.silenceT = 0;
      S.silenceDur = 6 + Math.random() * 4;
      S.wrath = 0;
      game.caption('[the music stops]');
    }
  }
  if (S.silence) {
    S.silenceT += dt;
    if (S.silenceT > 1.2 && game.noise > 0.2) S.wrath += dt * (game.noise > 0.6 ? 2 : 1);
    if (S.wrath > 1.4 && !S.struck) {
      S.struck = true;
      game.audio.play('growl', { gain: 0.9, dur: 1.6 });
      game.audio.play('boom', { gain: 0.8 });
      game.player.shake = 1.5;
      game.hurtPlayer(35, 'Found by the Beast of Level 5');
      game.caption('[something in the walls ROARS]');
    }
    if (S.silenceT > S.silenceDur) {
      S.silence = false;
      S.struck = false;
      S.musicT = 0.5;
      S.phrases = 0;
    }
  }
  S.popT = (S.popT ?? 20) - dt;
  if (S.popT <= 0) {
    S.popT = 25;
    if (E.count('faceling') < 2 && Math.random() < 0.4) {
      const spot = game.findSpawnSpot({ min: 14, max: 26, noLOS: true });
      if (spot) game.spawn('faceling', spot.x, spot.z);
    }
  }
}

function interactHandler(game, it) {
  if (it.type !== 'knock') return false;
  game.audio.play('knock', { pos: [it.x, 1.2, it.z], gain: 0.45, count: 3 });
  const r = Math.random();
  setTimeout(() => {
    if (r < 0.35) {
      game.audio.play('knock', { pos: [it.x, 1.2, it.z], gain: 0.55, count: 3 });
      game.caption('[something knocks back]');
      game.player.sanity = Math.max(0, game.player.sanity - 6);
    } else if (r < 0.5) {
      game.audio.play('breath', { pos: [it.x, 1.6, it.z], gain: 0.5, dur: 1.4 });
      game.caption('[breathing behind the door]');
      game.player.sanity = Math.max(0, game.player.sanity - 4);
    } else if (r < 0.53) {
      game.audio.play('screech', { pos: [it.x, 1.6, it.z], gain: 0.6, dur: 0.8 });
      game.hurtPlayer(15, 'Whatever was in room ' + it.no);
    } else {
      game.toast('Locked. No answer.');
    }
  }, 1300);
  return true;
}

function ambience(game, a) {
  a.setRoomTone(0.03, 160);
  a.startBed('vinyl', { buf: 'white', type: 'bandpass', freq: 3200, Q: 0.6, gain: 0.004, lfo: 7, lfoDepth: 0.003 });
}

export default {
  id: 'level5',
  number: '5',
  name: 'Terror Hotel',
  survival: 'Class 3',
  tags: ['Unsafe', 'Secure', 'Entities: Few, Dangerous'],
  hint: 'Find the Boiler Room door (red light). When the piano stops, stop moving until it plays again.',
  objective: (g) => (g.levelTime < 40 ? 'Find the Boiler Room.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.24,
    bounceRange: 3.2,
    ambientColor: [1.0, 0.72, 0.48],
    ambientMin: [0.003, 0.0022, 0.0016],
    ceilBounce: 2.0,
    fogColor: [0.03, 0.02, 0.014],
    fogDensity: 0.03,
    exposure: 1.6,
    grade: { tint: [1.03, 0.98, 0.9], saturation: 0.82, contrast: 1.06 },
    footsteps: 'carpet',
    reverb: { size: 1.3, decay: 1.5, wet: 0.26 },
    hum: 0.05,
    loot: [['almond', 1]],
  },
  materials: [
    { tex: 'damask', grime: [0.3, 0.2, 0.04, 0.25], stainColor: [0.6, 0.5, 0.35] },
    { tex: 'hotelCarpet', grime: [0.25, 0.2, 0.05, 0.2], stainColor: [0.6, 0.45, 0.4] },
    { tex: 'ornateCeiling', grime: [0.25, 0.15, 0.05, 0.2], stainColor: [0.7, 0.6, 0.42] },
    { tex: 'woodPanel', grime: [0.1, 0.15, 0.1, 0.4] },
    { tex: 'hotelDoor' },
    { tex: 'white', tint: [0.75, 0.55, 0.25] },
    { tex: 'metalDoor', tint: [0.8, 0.55, 0.5] },
    { tex: 'boilerSign', emissive: [0.25, 0.2, 0.15] },
    { tex: 'white', tint: [0.85, 0.82, 0.74] },
    { tex: 'white', tint: [0.9, 0.88, 0.82] },
    { tex: 'desktopWood', tint: [0.6, 0.45, 0.32] },
  ],
  fixtureMaterial: { tex: 'cageBulb' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  interactHandler,
  ambience,
  defaultExit: 'level6',
};
