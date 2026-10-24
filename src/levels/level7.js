// LEVEL 7 — "Thalassophobia"
// Flooded rooms of still, black water. In the deep sections you have to
// swim — and something enormous moves beneath you. Somewhere there is a
// door with sunlight behind it.

import * as THREE from 'three';
import { CN, CELL, ChunkLayout, F_SOLID, F_BLOCK, F_WATER } from '../world/layout.js';
import { fbm2, hashf, RNG, hash32 } from '../core/rng.js';
import { rasterLattice, findWallSpot, chunkRng } from './common.js';
import { cageBulb, door, wallQuad } from './props.js';
import { ambientEvents } from './director.js';
import { objectMaterial } from '../world/materials.js';

const U = 16;
const CEIL = 2.9;
const WATER = 0.45;
const DEEP = -4.5;

const M = { wall: 0, floor: 1, ceil: 2, metal: 3, sunDoor: 4, deep: 5, frame: 6 };

function params(seed) {
  return {
    U,
    seed,
    doorMin: 4,
    doorMax: 7,
    doorChance: 0.5,
    halfChance: 0.15,
    thickChance: 0.3,
    density: (Lx, Lz) => 0.25 + fbm2(Lx / 4, Lz / 4, seed + 19, 2) * 0.3,
    pillar: () => 0.15,
    pillarSize: 2,
  };
}

function deepAt(gx, gz, seed) {
  return fbm2(gx / 40, gz / 40, seed + 71, 3) > 0.58;
}

export function generate(cx, cz, seed) {
  const L = new ChunkLayout(cx, cz, { floorY: 0, ceilY: CEIL });
  L.matW.fill(M.wall);
  L.matF.fill(M.floor);
  L.matC.fill(M.ceil);
  rasterLattice(L, params(seed));
  const W = L.ensureWater();
  const near0 = Math.abs(cx) + Math.abs(cz) <= 0;
  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const i = lz * CN + lx;
      if (L.flags[i] & F_SOLID) continue;
      L.flags[i] |= F_WATER;
      W[i] = WATER;
      const gx = cx * CN + lx;
      const gz = cz * CN + lz;
      if (!near0 && deepAt(gx, gz, seed)) {
        L.floorY[i] = DEEP;
        L.matF[i] = M.deep;
        L.zone[i] = 3;
        L.ceilY[i] = CEIL + 1.2;
      }
    }
  }
  const rng = chunkRng(L, seed, 71);
  const per = CN / U;
  // sparse, cold bulbs
  for (let j = 0; j < per; j++) {
    for (let i = 0; i < per; i++) {
      const lx = i * U + 8;
      const lz = j * U + 8;
      if (L.get(lx, lz) & F_SOLID) continue;
      const h = hashf(cx * per + i, cz * per + j, seed, 81);
      if (h < 0.3) continue;
      const ceil = L.ceilY[lz * CN + lx];
      L.fixtures.push({
        kind: 'bulb',
        x: L.wx(lx),
        y: ceil - 0.6,
        z: L.wz(lz),
        ceil,
        color: [0.65, 0.8, 0.95],
        power: 3.0,
        radius: 10,
        omni: 0.85,
        mode: h < 0.4 ? 'flicker' : 'on',
        emitPower: 4,
      });
    }
  }
  if (rng.next() < 0.3) {
    const s = findWallSpot(L, rng, 30);
    if (s && L.floorY[s.lz * CN + s.lx] >= 0) L.items.push({ type: 'almond', x: L.wx(s.lx), z: L.wz(s.lz), y: WATER - 0.08 });
  }
  if (rng.next() < 0.25) {
    const s = findWallSpot(L, rng, 30);
    if (s && L.floorY[s.lz * CN + s.lx] >= 0) L.items.push({ type: 'battery', x: L.wx(s.lx), z: L.wz(s.lz), y: WATER - 0.02 });
  }
  if (rng.next() < 0.2) {
    const s = findWallSpot(L, rng, 30);
    if (s && L.floorY[s.lz * CN + s.lx] >= 0) L.items.push({ type: 'note', x: L.wx(s.lx), z: L.wz(s.lz), y: WATER + 0.005 });
  }
  // the door with sunlight behind it
  const er = new RNG(hash32(cx, cz, seed, 7999));
  if (Math.abs(cx) + Math.abs(cz) >= 2 && er.next() < 0.1) {
    for (let t = 0; t < 40; t++) {
      const s = findWallSpot(L, er, 20);
      if (!s) break;
      const { lx, lz, dx, dz } = s;
      if (L.floorY[lz * CN + lx] < 0) continue;
      const wx = L.wx(lx) + dx * CELL * 0.5;
      const wz = L.wz(lz) + dz * CELL * 0.5;
      L.props.push({ type: 'sundoor', x: wx, z: wz, dx, dz });
      L.exits.push({ type: 'sun', x: wx, z: wz, target: 'ending' });
      L.interact.push({ type: 'exit', target: 'ending', kind: 'door', x: wx - dx * 0.3, y: 1.1, z: wz - dz * 0.3, prompt: 'Open the door', reach: 2.4, cone: 0.55 });
      // warm light spilling from under and around the door
      L.fixtures.push({ kind: 'sun', x: wx - dx * 0.35, y: 1.2, z: wz - dz * 0.35, color: [1.0, 0.86, 0.6], power: 6, radius: 14, soft: 0.6, omni: 1, dir: [-dx, 0, -dz], mode: 'on', emitPower: 0 });
      break;
    }
  }
  return L;
}

export function buildFixture(f, fb) {
  if (f.kind === 'sun') return;
  cageBulb(f, fb);
}

export function buildProps(L, B) {
  for (const p of L.props) {
    if (p.type === 'sundoor') {
      door(B, { frame: M.frame, slab: M.sunDoor, metal: M.frame }, p.x, p.z, p.dx, p.dz, 0.95, 2.1);
    }
  }
}

export function spawnPoint() {
  return { x: 8.5 * CELL, z: 8.5 * CELL, yaw: 0 };
}

function makeLeviathan(game) {
  const g = new THREE.Group();
  const mat = objectMaterial({ tint: [0.01, 0.012, 0.014] });
  mat.uniforms.uObjLight.value.set(0.05, 0.05, 0.06);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
  body.scale.set(3.2, 1.8, 14);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 10), mat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 16;
  g.add(tail);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 3), mat);
    fin.position.set(s * 4, -0.5, -2);
    fin.rotation.z = s * 0.3;
    g.add(fin);
  }
  // a single pale eye, the size of a car door
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), objectMaterial({ tint: [0.2, 0.2, 0.18], emissive: [0.25, 0.27, 0.22] }));
  eye.position.set(2.6, 0.4, -9);
  g.add(eye);
  g.visible = false;
  game.addLevelObject(g);
  return g;
}

function director(game, dt, S) {
  S.t = (S.t || 0) + dt;
  const p = game.player;
  ambientEvents(game, dt, S, {
    every: [15, 35],
    events: [
      ['drip', 3],
      ['creak', 1],
      ['boom', 0.6],
    ],
  });
  // whale-like moans from the deep
  S.moanT = (S.moanT ?? 12) - dt;
  if (S.moanT <= 0) {
    S.moanT = 20 + Math.random() * 25;
    game.audio.play('drone', { gain: 0.35, dur: 7, pitch: 0.5 });
    game.caption('[a vast, distant moan beneath the water]');
  }
  // light from the sun door, heard as wind & gulls? just warmth on the face
  const deep = p.swimming;
  if (!S.lev) S.lev = makeLeviathan(game);
  const lev = S.lev;
  if (!lev.parent) game.addLevelObject(lev);
  if (deep) {
    S.swimT = (S.swimT || 0) + dt;
    game.fear = Math.min(1, game.fear + dt * 0.12);
    lev.visible = true;
    // circles below you, rising as time passes
    const a = S.t * 0.18;
    const r = Math.max(4, 22 - S.swimT * 2.2);
    lev.position.set(p.x + Math.cos(a) * r, p.y - 6 + Math.min(4.5, S.swimT * 0.4), p.z + Math.sin(a) * r);
    lev.rotation.y = -a;
    if (S.swimT > 6 && !S.warned) {
      S.warned = true;
      game.audio.play('drone', { gain: 0.6, dur: 4, pitch: 0.35 });
      game.caption('[the water beneath you shifts]');
    }
    if (S.swimT > 11) {
      S.swimT = 0;
      game.audio.play('boom', { gain: 1 });
      game.hurtPlayer(200, 'Taken by something enormous beneath the water');
    }
  } else {
    S.swimT = Math.max(0, (S.swimT || 0) - dt * 2);
    S.warned = false;
    lev.visible = false;
  }
}

function ambience(game, a) {
  a.setRoomTone(0.06, 110);
  a.startBed('ocean', { buf: 'brown', type: 'lowpass', freq: 380, Q: 0.5, gain: 0.12, lfo: 0.08, lfoDepth: 0.08 });
}

export const ENDINGS = {
  escape: {
    title: 'SUNLIGHT',
    paragraphs: [
      'The door opens onto warm air and the smell of cut grass. Sunlight. Real sunlight, on your face, on your hands.',
      'You walk out into a parking lot behind an office building you have never seen before. A car alarm chirps. Somewhere, a radio is playing.',
      'You stand there a long time, just breathing.',
      'Behind you, through the open door, a fluorescent light buzzes. Just once.',
    ],
  },
};

export default {
  id: 'level7',
  number: '7',
  name: 'Thalassophobia',
  survival: 'Class 3',
  tags: ['Unsafe', 'Secure', 'Entity Count: One (Very Large)'],
  hint: 'Find the door with sunlight behind it. Avoid swimming in the deep water for long.',
  objective: (g) => (g.levelTime < 40 ? 'Find the door with light behind it.\nStay out of the deep water.' : ''),
  config: {
    ceilY: CEIL,
    bounce: 0.25,
    bounceRange: 3.5,
    ambientColor: [0.6, 0.75, 0.85],
    ambientMin: [0.0015, 0.002, 0.0028],
    ceilBounce: 1.6,
    fogColor: [0.01, 0.016, 0.02],
    fogDensity: 0.05,
    exposure: 2.0,
    grade: { tint: [0.92, 1.0, 1.05], saturation: 0.75, contrast: 1.08 },
    footsteps: 'water',
    reverb: { size: 1.6, decay: 2.4, wet: 0.4 },
    hum: 0.15,
    sanityRate: 0.08,
    waterLevel: WATER,
  },
  materials: [
    { tex: 'wetWallpaper', grime: [0.6, 0.35, 0.06, 0.3], stainColor: [0.25, 0.3, 0.28], damp: 1.2 },
    { tex: 'carpetL0', tint: [0.35, 0.38, 0.36] },
    { tex: 'ceilingL0', tint: [0.5, 0.55, 0.55], grime: [0.4, 0.2, 0.05, 0.2], stainColor: [0.5, 0.45, 0.35] },
    { tex: 'rustyMetal' },
    { tex: 'doorSunlight', emissive: [1.6, 1.4, 1.0] },
    { tex: 'poolTileBlue', tint: [0.15, 0.2, 0.22] },
    { tex: 'white', tint: [0.75, 0.72, 0.65] },
  ],
  water: { deep: [0.004, 0.012, 0.016], shallow: [0.03, 0.06, 0.07], reflect: [0.05, 0.065, 0.075], clarity: 0.2, specular: 1.2 },
  fixtureMaterial: { tex: 'cageBulb' },
  generate,
  buildFixture,
  buildProps,
  spawnPoint,
  director,
  ambience,
  endings: ENDINGS,
  defaultExit: 'ending',
};
