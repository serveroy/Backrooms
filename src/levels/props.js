// Shared prop + fixture geometry builders. Props are baked into chunk
// geometry (and lit by the light baker); fixtures go into the emissive
// fixture mesh.
//
// Builders receive B(slot) -> GeoBuilder and a slot map S naming the
// level's material slots for the parts they need.

import * as THREE from 'three';
import { addBox, addPart, cylGeo, cachedGeo } from './common.js';

const PI = Math.PI;

function sphGeo(seg = 10) {
  return cachedGeo('sph' + seg, () => new THREE.SphereGeometry(0.5, seg, Math.max(6, seg - 2)));
}

/** Mark vertices [from, count) of a fixture builder as non-emissive. */
export function dark(fb, from) {
  for (let v = from; v < fb.count; v++) fb.emit[v] = [0, 0, 0];
}

// ---------------------------------------------------------------- fixtures

/** Recessed ceiling troffer (Level 0 / office). */
export function troffer(f, fb) {
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
  fb.quadP(p, [0, -1, 0], uv);
}

/** Industrial hanging fluorescent strip (Level 1). */
export function hangingTube(f, fb) {
  const along = f.rot ? 'x' : 'z';
  const L = f.l || 1.25;
  const y = f.y;
  const s0 = fb.count;
  // housing
  if (along === 'z') addBox(fb, f.x, y + 0.06, f.z, 0.2, 0.06, L + 0.05);
  else addBox(fb, f.x, y + 0.06, f.z, L + 0.05, 0.06, 0.2);
  // chains up to the ceiling
  const top = f.ceil ?? y + 1.4;
  for (const k of [-0.42, 0.42]) {
    const cx = along === 'z' ? f.x : f.x + k * L;
    const cz = along === 'z' ? f.z + k * L : f.z;
    addPart(fb, cylGeo(4), cx, (y + top) / 2 + 0.05, cz, 0.012, top - y, 0.012);
  }
  dark(fb, s0);
  // two glowing tubes
  for (const o of [-0.045, 0.045]) {
    const tx = along === 'z' ? f.x + o : f.x;
    const tz = along === 'z' ? f.z : f.z + o;
    addPart(fb, cylGeo(6), tx, y + 0.01, tz, 0.032, L - 0.06, 0.032, along === 'z' ? [PI / 2, 0, 0] : [0, 0, PI / 2]);
  }
}

/** Caged bulb on a short stem (Level 2 / 3 / 6). */
export function cageBulb(f, fb) {
  const y = f.y;
  const s0 = fb.count;
  const top = f.ceil ?? y + 0.3;
  addPart(fb, cylGeo(6), f.x, (y + top) / 2 + 0.06, f.z, 0.02, top - y - 0.06, 0.02);
  addPart(fb, cylGeo(8), f.x, y + 0.09, f.z, 0.07, 0.05, 0.07);
  // cage wires
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2;
    addBox(fb, f.x + Math.cos(a) * 0.065, y - 0.02, f.z + Math.sin(a) * 0.065, 0.008, 0.2, 0.008);
  }
  dark(fb, s0);
  addPart(fb, sphGeo(8), f.x, y - 0.02, f.z, 0.09, 0.11, 0.09);
}

/** Wall sconce (hotel). f.dx/f.dz point into the wall. */
export function sconce(f, fb) {
  const s0 = fb.count;
  const wx = f.x + (f.dx || 0) * 0.12;
  const wz = f.z + (f.dz || 0) * 0.12;
  addBox(fb, wx, f.y - 0.12, wz, f.dx ? 0.02 : 0.1, 0.18, f.dz ? 0.02 : 0.1);
  addPart(fb, cylGeo(6), (wx + f.x) / 2, f.y - 0.1, (wz + f.z) / 2, 0.015, 0.14, 0.015, f.dx ? [0, 0, PI / 2] : [PI / 2, 0, 0]);
  dark(fb, s0);
  // fabric shade (emissive)
  addPart(fb, cachedGeo('shade', () => new THREE.CylinderGeometry(0.06, 0.1, 0.14, 10, 1, true)), f.x, f.y, f.z, 1, 1, 1);
}

/** Chandelier (hotel ballroom). */
export function chandelier(f, fb) {
  const s0 = fb.count;
  const top = f.ceil ?? f.y + 1;
  addPart(fb, cylGeo(6), f.x, (f.y + top) / 2, f.z, 0.02, top - f.y, 0.02);
  addPart(fb, cachedGeo('torus', () => new THREE.TorusGeometry(0.5, 0.025, 6, 20)), f.x, f.y - 0.1, f.z, 1, 1, 1, [PI / 2, 0, 0]);
  dark(fb, s0);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    addPart(fb, sphGeo(6), f.x + Math.cos(a) * 0.5, f.y - 0.02, f.z + Math.sin(a) * 0.5, 0.07, 0.1, 0.07);
  }
}

/** Skylight panel (poolrooms) — a big glowing ceiling square. */
export function skylight(f, fb) {
  const hw = f.w / 2;
  const hl = f.l / 2;
  const y = f.y;
  fb.quadP(
    [
      [f.x - hw, y, f.z - hl],
      [f.x + hw, y, f.z - hl],
      [f.x + hw, y, f.z + hl],
      [f.x - hw, y, f.z + hl],
    ],
    [0, -1, 0],
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
  );
}

/** Red emergency beacon (Level !). */
export function beacon(f, fb) {
  const s0 = fb.count;
  addPart(fb, cylGeo(8), f.x, f.y + 0.08, f.z, 0.14, 0.04, 0.14);
  dark(fb, s0);
  addPart(fb, sphGeo(8), f.x, f.y, f.z, 0.16, 0.13, 0.16);
}

// ---------------------------------------------------------------- props

/** Stack of wooden supply crates. */
export function crateStack(b, x, z, ry, n = 1, size = 0.7) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const s = size * (1 - i * 0.08);
    addBox(b, x + (i % 2) * 0.05, y + s / 2, z, s, s, s, ry + i * 0.2, 1);
    y += s;
  }
}

export function cardboardStack(b, x, z, ry, n = 2) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const sx = 0.5 - i * 0.07;
    const sy = 0.35 - i * 0.04;
    addBox(b, x, y + sy / 2, z, sx, sy, sx * 0.75, ry + i * 0.35, 0.6);
    y += sy;
  }
}

/** Axis-aligned pipe from a to b with flanges every `every` meters. */
export function pipe(b, axis, x, y, z, len, r, flange = null, every = 2.4) {
  const rot = axis === 'x' ? [0, 0, PI / 2] : axis === 'z' ? [PI / 2, 0, 0] : [0, 0, 0];
  addPart(b, cylGeo(10), x, y, z, r * 2, len, r * 2, rot, [r * 6, len]);
  if (flange) {
    const n = Math.floor(len / every);
    for (let i = 0; i <= n; i++) {
      const o = -len / 2 + (i / Math.max(1, n)) * len;
      const fx = axis === 'x' ? x + o : x;
      const fy = axis === 'y' ? y + o : y;
      const fz = axis === 'z' ? z + o : z;
      addPart(flange, cylGeo(10), fx, fy, fz, r * 2.6, 0.05, r * 2.6, rot);
    }
  }
}

/** Valve wheel facing along (dx, dz). */
export function valve(b, x, y, z, dx, dz) {
  const rot = dx ? [0, 0, PI / 2] : [PI / 2, 0, 0];
  addPart(b, cachedGeo('wheel', () => new THREE.TorusGeometry(0.12, 0.015, 6, 14)), x, y, z, 1, 1, 1, dx ? [0, PI / 2, 0] : [0, 0, 0]);
  addPart(b, cylGeo(6), x - dx * 0.05, y, z - dz * 0.05, 0.03, 0.12, 0.03, rot);
}

/**
 * A door set into a wall face. (x, z) is the wall surface point, (dx, dz)
 * points INTO the wall. S: { frame, slab, metal }
 */
export function door(B, S, x, z, dx, dz, w = 0.95, h = 2.1, opts = {}) {
  const across = dx !== 0 ? 'z' : 'x';
  const f = B(S.frame);
  const sl = B(S.slab);
  const out = 0.03;
  const px = x - dx * out;
  const pz = z - dz * out;
  // frame
  const ft = 0.07;
  if (across === 'z') {
    addBox(f, px, h / 2, pz - w / 2 - ft / 2, 0.08, h, ft);
    addBox(f, px, h / 2, pz + w / 2 + ft / 2, 0.08, h, ft);
    addBox(f, px, h + ft / 2, pz, 0.08, ft, w + ft * 2);
  } else {
    addBox(f, px - w / 2 - ft / 2, h / 2, pz, ft, h, 0.08);
    addBox(f, px + w / 2 + ft / 2, h / 2, pz, ft, h, 0.08);
    addBox(f, px, h + ft / 2, pz, w + ft * 2, ft, 0.08);
  }
  // slab: textured quad facing out of the wall
  const n = [-dx, 0, -dz];
  const sx = x - dx * 0.012;
  const sz = z - dz * 0.012;
  const hw = w / 2;
  const p =
    across === 'z'
      ? [
          [sx, 0, sz - hw],
          [sx, 0, sz + hw],
          [sx, h, sz + hw],
          [sx, h, sz - hw],
        ]
      : [
          [sx - hw, 0, sz],
          [sx + hw, 0, sz],
          [sx + hw, h, sz],
          [sx - hw, h, sz],
        ];
  // keep texture upright & unmirrored for the viewer
  const flip = across === 'z' ? dx < 0 : dz > 0;
  const uv = flip
    ? [
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
  sl.quadP(p, n, uv);
  // handle
  if (S.metal !== undefined) {
    const m = B(S.metal);
    const side = opts.handleSide ?? 1;
    const hx = across === 'z' ? sx - dx * 0.04 : sx + side * hw * 0.75;
    const hz = across === 'z' ? sz + side * hw * 0.75 : sz - dz * 0.04;
    addBox(m, hx, 1.0, hz, across === 'z' ? 0.05 : 0.14, 0.035, across === 'z' ? 0.14 : 0.05);
  }
}

/** Flat textured quad on a wall face (signs, windows, posters). */
export function wallQuad(b, x, y, z, dx, dz, w, h, off = 0.015) {
  const across = dx !== 0 ? 'z' : 'x';
  const sx = x - dx * off;
  const sz = z - dz * off;
  const hw = w / 2;
  const p =
    across === 'z'
      ? [
          [sx, y - h / 2, sz - hw],
          [sx, y - h / 2, sz + hw],
          [sx, y + h / 2, sz + hw],
          [sx, y + h / 2, sz - hw],
        ]
      : [
          [sx - hw, y - h / 2, sz],
          [sx + hw, y - h / 2, sz],
          [sx + hw, y + h / 2, sz],
          [sx - hw, y + h / 2, sz],
        ];
  const flip = across === 'z' ? dx < 0 : dz > 0;
  const uv = flip
    ? [
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ]
    : [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
  b.quadP(p, [-dx, 0, -dz], uv);
}

/** Exit sign box mounted on a wall above a door. */
export function exitSign(B, S, x, y, z, dx, dz) {
  const across = dx !== 0 ? 'z' : 'x';
  const box = B(S.metal);
  addBox(box, x - dx * 0.05, y, z - dz * 0.05, across === 'z' ? 0.08 : 0.42, 0.22, across === 'z' ? 0.42 : 0.08);
  wallQuad(B(S.sign), x, y, z, dx, dz, 0.38, 0.19, 0.092);
}

export function shelf(B, S, x, z, ry, len = 1.8) {
  const m = B(S.metal);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const k of [-len / 2, len / 2]) {
    for (const d of [-0.25, 0.25]) {
      addBox(m, x + c * k + s * d, 1.0, z - s * k + c * d, 0.04, 2.0, 0.04);
    }
  }
  for (const y of [0.15, 0.7, 1.25, 1.8]) addBox(m, x, y, z, len, 0.03, 0.55, ry);
  if (S.box !== undefined) {
    const bx = B(S.box);
    for (const y of [0.15, 0.7, 1.25]) {
      for (let i = 0; i < 3; i++) {
        if ((i + Math.round(y * 10)) % 3 === 2) continue;
        const o = (i - 1) * len * 0.3;
        addBox(bx, x + c * o, y + 0.17, z - s * o, 0.4, 0.3, 0.4, ry + i * 0.1, 0.6);
      }
    }
  }
}

export function desk(B, S, x, z, ry) {
  const t = B(S.wood);
  const m = B(S.metal);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  addBox(t, x, 0.74, z, 1.4, 0.04, 0.7, ry);
  for (const [a, d] of [
    [-0.66, -0.3],
    [0.66, -0.3],
    [-0.66, 0.3],
    [0.66, 0.3],
  ]) {
    addBox(m, x + c * a + s * d, 0.36, z - s * a + c * d, 0.04, 0.72, 0.04, ry);
  }
  // drawer unit
  addBox(m, x + c * 0.45, 0.36, z - s * 0.45, 0.4, 0.66, 0.6, ry);
}

export function monitor(B, S, x, y, z, ry) {
  const m = B(S.plastic);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  addBox(m, x, y + 0.2, z, 0.42, 0.34, 0.36, ry);
  addBox(m, x, y + 0.02, z, 0.24, 0.04, 0.2, ry);
  if (S.screen !== undefined) {
    // screen faces local -z
    const sx = x - s * 0.181;
    const sz = z - c * 0.181;
    const b = B(S.screen);
    const hw = 0.17;
    const p = [
      [sx - c * hw, y + 0.08, sz + s * hw],
      [sx + c * hw, y + 0.08, sz - s * hw],
      [sx + c * hw, y + 0.33, sz - s * hw],
      [sx - c * hw, y + 0.33, sz + s * hw],
    ];
    b.quadP(p, [-s, 0, -c], [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  }
}

export function officeChair(B, S, x, z, ry, tipped = false) {
  const b = B(S.fabric ?? S.plastic);
  const m = B(S.metal);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  if (tipped) {
    addBox(b, x, 0.25, z, 0.46, 0.08, 0.44, ry, 1);
    addBox(b, x + s * 0.3, 0.06, z + c * 0.3, 0.42, 0.06, 0.5, ry);
    addPart(m, cylGeo(8), x - s * 0.1, 0.2, z - c * 0.1, 0.05, 0.36, 0.05, [PI / 2 - 0.2, ry, 0]);
    return;
  }
  addBox(b, x, 0.47, z, 0.46, 0.08, 0.44, ry);
  addBox(b, x + s * 0.21, 0.8, z + c * 0.21, 0.42, 0.5, 0.06, ry);
  addPart(m, cylGeo(8), x, 0.28, z, 0.05, 0.36, 0.05);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + ry;
    addBox(m, x + Math.cos(a) * 0.17, 0.06, z + Math.sin(a) * 0.17, 0.32, 0.03, 0.04, -a);
  }
}

/** Cubicle partition wall segment from (x0,z0) along axis for len meters. */
export function partition(B, S, x, z, axis, len, h = 1.45) {
  const f = B(S.fabric);
  const m = B(S.metal);
  const cx = axis === 'x' ? x + len / 2 : x;
  const cz = axis === 'z' ? z + len / 2 : z;
  addBox(f, cx, h / 2, cz, axis === 'x' ? len : 0.06, h, axis === 'z' ? len : 0.06, 0, 0.5);
  addBox(m, cx, h + 0.015, cz, axis === 'x' ? len : 0.07, 0.03, axis === 'z' ? len : 0.07);
}

export function waterCooler(B, S, x, z, ry) {
  const p = B(S.plastic);
  addBox(p, x, 0.5, z, 0.32, 1.0, 0.32, ry);
  const w = B(S.bottle ?? S.plastic);
  addPart(w, cylGeo(12), x, 1.22, z, 0.27, 0.42, 0.27);
  addPart(w, cylGeo(10), x, 1.0, z, 0.08, 0.06, 0.08);
}

export function electricalBox(B, S, x, y, z, dx, dz, w = 0.6, h = 0.8) {
  const across = dx !== 0 ? 'z' : 'x';
  const m = B(S.metal);
  addBox(m, x - dx * 0.1, y, z - dz * 0.1, across === 'z' ? 0.2 : w, h, across === 'z' ? w : 0.2);
  wallQuad(B(S.panel), x, y, z, dx, dz, w * 0.92, h * 0.92, 0.205);
  // conduit up to the ceiling
  addPart(m, cylGeo(6), x - dx * 0.05 + (across === 'x' ? w * 0.3 : 0), y + h / 2 + 0.8, z - dz * 0.05 + (across === 'z' ? w * 0.3 : 0), 0.04, 1.6, 0.04);
}

export function table(B, S, x, z, ry, w = 1.2, d = 0.7) {
  const t = B(S.top);
  const m = B(S.legs ?? S.top);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  addBox(t, x, 0.74, z, w, 0.04, d, ry);
  for (const [a, b2] of [
    [-w / 2 + 0.06, -d / 2 + 0.06],
    [w / 2 - 0.06, -d / 2 + 0.06],
    [-w / 2 + 0.06, d / 2 - 0.06],
    [w / 2 - 0.06, d / 2 - 0.06],
  ]) {
    addBox(m, x + c * a + s * b2, 0.36, z - s * a + c * b2, 0.04, 0.72, 0.04, ry);
  }
}

export function cake(B, S, x, y, z) {
  addPart(B(S.cake), cylGeo(14), x, y + 0.07, z, 0.3, 0.14, 0.3);
  addPart(B(S.icing), cylGeo(14), x, y + 0.15, z, 0.31, 0.03, 0.31);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2;
    addPart(B(S.candle), cylGeo(5), x + Math.cos(a) * 0.08, y + 0.2, z + Math.sin(a) * 0.08, 0.012, 0.08, 0.012);
  }
}

export function pianoProp(B, S, x, z, ry) {
  const b = B(S.wood);
  addBox(b, x, 0.6, z, 1.5, 1.2, 0.6, ry);
  addBox(B(S.keys), x, 0.75, z - Math.cos(ry) * 0.38, 1.3, 0.04, 0.18, ry);
}

export function bed(B, S, x, z, ry) {
  addBox(B(S.wood), x, 0.2, z, 1.0, 0.4, 2.0, ry);
  addBox(B(S.fabric), x, 0.5, z, 0.95, 0.18, 1.95, ry);
}

export function pillar(B, slot, x, z, size, h) {
  addBox(B(slot), x, h / 2, z, size, h, size, 0, 1);
}
