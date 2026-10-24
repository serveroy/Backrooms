// LEVEL ! — "Run For Your Life!"
// One endless corridor. Red lights. An alarm. Something behind you that
// never gets tired. RUN. Don't stop until you see the green EXIT sign.

import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK } from '../world/layout.js';
import { hashf, RNG, hash32 } from '../core/rng.js';
import { addBox } from './common.js';
import { beacon, crateStack, pipe, door, exitSign, wallQuad } from './props.js';
import { Howler } from '../entities/howler.js';

const CEIL = 3.0;
const HALF = 5; // corridor half width in cells (3.3m wide)
const EXIT_GX = 1100; // ~330m

const M = { wall: 0, floor: 1, ceil: 2, metal: 3, crate: 4, pipe: 5, door: 6, sign: 7, hazard: 8, exitDoor: 9 };

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  L.flags.fill(F_SOLID);
  const rng = new RNG(hash32(cx, cz, seed, 909));
  for (let lz = 0; lz < CN; lz++) {
    const gz = cz * CN + lz;
    if (gz < -HALF || gz > HALF) continue;
    for (let lx = 0; lx < CN; lx++) {
      const gx = cx * CN + lx;
      if (gx < -14 || gx > EXIT_GX) continue;
      L.flags[lz * CN + lx] = 0;
    }
  }
  const inCorr = cz * CN <= HALF && (cz + 1) * CN > -HALF;
  if (!inCorr) return L;
  const lzOf = (gz) => gz - cz * CN;
  // ---- obstacles every few meters
  for (let lx = 0; lx < CN; lx += 2) {
    const gx = cx * CN + lx;
    if (gx < 30 || gx > EXIT_GX - 20) continue;
    const h = hashf(gx, 0, seed, 77);
    if (h < 0.06) {
      // crate pile blocking one side
      const side = hashf(gx, 1, seed, 78) < 0.5 ? -1 : 1;
      const gz0 = side < 0 ? -HALF : 1;
      const gz1 = side < 0 ? -1 : HALF + 1;
      let ok = true;
      for (let gz = gz0; gz < gz1; gz++) if (L.get(lx, lzOf(gz)) === undefined) ok = false;
      if (!ok) continue;
      for (let gz = gz0; gz < gz1; gz++) {
        for (let k = 0; k < 3; k++) L.or(lx + k, lzOf(gz), F_BLOCK);
      }
      L.props.push({ type: 'crates', x: (gx + 1.5) * CELL, z: ((gz0 + gz1) / 2) * CELL, w: (gz1 - gz0) * CELL });
    } else if (h < 0.1) {
      // low pipes: crouch to get under
      for (let gz = -HALF; gz <= HALF; gz++) {
        const lz = lzOf(gz);
        if (lz < 0 || lz >= CN) continue;
        for (let k = 0; k < 2; k++) {
          if (lx + k < CN) L.ceilY[lz * CN + lx + k] = 1.25;
        }
      }
      L.props.push({ type: 'lowpipe', x: (gx + 1) * CELL, z: 0.15 });
    }
  }
  // ---- red beacons along the ceiling
  for (let lx = 0; lx < CN; lx += 8) {
    const gx = cx * CN + lx;
    if (gx < -10 || gx > EXIT_GX) continue;
    for (const gz of [-HALF + 1, HALF - 1]) {
      const lz = lzOf(gz);
      if (lz < 0 || lz >= CN) continue;
      if (L.ceilY[lz * CN + lx] < 2) continue;
      L.fixtures.push({
        kind: 'beacon',
        x: (gx + 0.5) * CELL,
        y: CEIL - 0.12,
        z: (gz + 0.5) * CELL,
        color: [1.0, 0.06, 0.03],
        power: 3.2,
        radius: 8,
        omni: 0.9,
        mode: 'strobe',
        period: 0.8,
        sync: true,
        emitPower: 7,
      });
    }
  }
  // ---- side doors (all locked)
  for (let lx = 4; lx < CN; lx += 16) {
    const gx = cx * CN + lx;
    if (gx < 0 || gx > EXIT_GX - 10 || hashf(gx, 5, seed, 31) < 0.4) continue;
    const gz = hashf(gx, 6, seed, 31) < 0.5 ? -HALF : HALF;
    const lz = lzOf(gz);
    if (lz < 0 || lz >= CN) continue;
    const dz = gz < 0 ? -1 : 1;
    L.props.push({ type: 'door', x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL + dz * CELL * 0.5, dx: 0, dz });
  }
  // ---- the exit
  const exLx = EXIT_GX - cx * CN;
  if (exLx >= 0 && exLx < CN) {
    L.props.push({ type: 'exit', x: (EXIT_GX + 1) * CELL, z: 0.15, dx: 1, dz: 0 });
    L.exits.push({ type: 'run', x: (EXIT_GX - 1) * CELL, z: 0.15, target: 'level3' });
    L.fixtures.push({ kind: 'beacon', x: (EXIT_GX - 1) * CELL, y: CEIL - 0.12, z: 0.15, color: [0.2, 1.0, 0.35], power: 4, radius: 10, omni: 0.9, mode: 'on', emitPower: 6 });
  }
  return L;
}

export function buildFixture(f, fb) {
  beacon(f, fb);
}

export function buildProps(L, B) {
  const S = { frame: M.metal, slab: M.door, metal: M.metal, sign: M.sign };
  for (const p of L.props) {
    switch (p.type) {
      case 'crates':
        crateStack(B(M.crate), p.x, p.z, 0.1, 2, Math.min(0.9, p.w * 0.8));
        addBox(B(M.metal), p.x + 0.2, 0.35, p.z, 0.6, 0.7, p.w, 0.05);
        break;
      case 'lowpipe':
        pipe(B(M.pipe), 'z', p.x, 1.38, p.z, HALF * 2 * CELL + 0.6, 0.12, B(M.hazard), 0.8);
        addBox(B(M.hazard), p.x, 1.15, p.z, 0.62, 0.1, HALF * 2 * CELL + 0.3);
        break;
      case 'door':
        door(B, S, p.x, p.z, p.dx, p.dz, 0.95, 2.1);
        break;
      case 'exit':
        door(B, { ...S, slab: M.exitDoor }, p.x, p.z, p.dx, p.dz, 1.2, 2.2);
        exitSign(B, S, p.x - 0.01, 2.5, p.z, p.dx, p.dz);
        break;
    }
  }
}

export function spawnPoint() {
  return { x: 2 * CELL, z: 0.15, yaw: -Math.PI / 2 };
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const p = game.player;
  const E = game.entities;
  game.redTint = 0.22 + 0.1 * Math.sin(S.t * 7);
  // infinite adrenaline
  p.stamina = 100;
  p.exhausted = false;
  S.alarmT = (S.alarmT ?? 0) - dt;
  if (S.alarmT <= 0) {
    S.alarmT = 1.8;
    game.audio.play('alarm', { dur: 1.8, gain: 0.22 });
  }
  if (S.t > 2.5 && !S.spawned) {
    S.spawned = true;
    const h = E.add(new Howler(game, p.x - 9, p.z, { state: 'chase', chaseSpeed: 4.35, relentless: true, damage: 200 }));
    h.yaw = -Math.PI / 2;
    h.sound('howl', { gain: 1, dur: 2.4 });
    game.caption('[RUN]');
  }
  if (S.t > 45 && !S.second) {
    S.second = true;
    const h = E.add(new Howler(game, p.x - 14, p.z, { state: 'chase', chaseSpeed: 4.5, relentless: true, damage: 200 }));
    h.sound('howl', { gain: 1, dur: 2.0 });
  }
  // they keep pace no matter how far ahead you get
  for (const e of E.list) {
    if (e.name !== 'howler') continue;
    if (p.x - e.x > 22) e.x = p.x - 22;
  }
  if (p.x > (EXIT_GX - 2) * CELL && !S.done) {
    S.done = true;
    game.redTint = 0;
    game.transition('level3', 'door');
  }
}

function ambience(game, a) {
  a.setRoomTone(0.08, 140);
}

export default {
  id: 'levelrun',
  number: '!',
  name: 'Run For Your Life!',
  survival: 'Class Deadzone',
  tags: ['RUN', 'RUN', 'RUN'],
  hint: 'RUN. Crouch under the low pipes. Do not stop until the green EXIT.',
  objective: () => 'RUN.',
  config: {
    ceilY: CEIL,
    bounce: 0.2,
    bounceRange: 3,
    ambientColor: [1, 0.2, 0.15],
    ambientMin: [0.006, 0.001, 0.001],
    fogColor: [0.03, 0.0, 0.0],
    fogDensity: 0.04,
    exposure: 1.4,
    grade: { tint: [1.05, 0.95, 0.95], saturation: 1.1, contrast: 1.15 },
    footsteps: 'metal',
    reverb: { size: 1.5, decay: 1.8, wet: 0.35 },
    hum: 0,
    thirstRate: 0.03,
    sanityRate: 0.0,
  },
  materials: [
    { tex: 'metalPanel', grime: [0.3, 0.3, 0.05, 0.3], stainColor: [0.4, 0.3, 0.25] },
    { tex: 'concreteFloor', tint: [0.6, 0.6, 0.6] },
    { tex: 'metalPanel', tint: [0.6, 0.6, 0.6] },
    { tex: 'rustyMetal' },
    { tex: 'woodCrate' },
    { tex: 'pipeGrey' },
    { tex: 'metalDoorPlain' },
    { tex: 'exitSign', emissive: [3, 3, 3] },
    { tex: 'hazardStripe' },
    { tex: 'metalDoor', emissive: [0.15, 0.3, 0.15] },
  ],
  fixtureMaterial: { tex: 'cageBulb' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  defaultExit: 'level3',
  hallucinate: false,
};
