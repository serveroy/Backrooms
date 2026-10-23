// Per-vertex light baking.
//
//  * Direct light: every fixture within its radius contributes with an
//    emitter cosine, receiver cosine and soft inverse-square falloff,
//    occluded by walls via a 2D grid ray cast (walls are full height).
//  * Bounce light: a screened-Poisson diffusion over open cells seeded by
//    the fixtures, so light spills around corners the way real bounce
//    light does, but never through walls.
//  * Dynamic fixtures (flickering ones) are not baked into the static term;
//    instead each vertex stores up to 4 (fixture, weight) pairs and the
//    shader multiplies by the live intensity of that fixture.

import { CN, CELL, F_SOLID, F_GLITCH } from './layout.js';
import { RW } from './region.js';

const BIN = 2.4;

export function isDynamicFixture(f) {
  // every working light gets a live slot so events can flicker / kill it
  return f.mode !== 'off' && !f.static;
}

export function prepareFixtures(region) {
  const list = region.fixtures.filter((f) => f.mode !== 'off' && f.power > 0);
  const n = list.length;
  const F = {
    list,
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    rad2: new Float32Array(n),
    soft: new Float32Array(n),
    omni: new Float32Array(n),
    ex: new Float32Array(n),
    ey: new Float32Array(n),
    ez: new Float32Array(n),
    dyn: new Uint8Array(n),
    bins: null,
    binOX: region.ogx * CELL,
    binOZ: region.ogz * CELL,
    binN: Math.ceil((RW * CELL) / BIN),
  };
  for (let i = 0; i < n; i++) {
    const f = list[i];
    F.x[i] = f.x;
    F.y[i] = f.y;
    F.z[i] = f.z;
    F.r[i] = f.color[0] * f.power;
    F.g[i] = f.color[1] * f.power;
    F.b[i] = f.color[2] * f.power;
    const rad = f.radius || 8;
    F.rad2[i] = rad * rad;
    F.soft[i] = f.soft ?? 0.7;
    F.omni[i] = f.omni ?? 0.12;
    const d = f.dir || [0, -1, 0];
    F.ex[i] = d[0];
    F.ey[i] = d[1];
    F.ez[i] = d[2];
    F.dyn[i] = isDynamicFixture(f) ? 1 : 0;
  }
  const bn = F.binN;
  const bins = Array.from({ length: bn * bn }, () => []);
  // each bin lists every fixture whose radius can reach any point of the bin
  for (let i = 0; i < n; i++) {
    const rad = Math.sqrt(F.rad2[i]);
    const bx0 = Math.max(0, Math.floor((F.x[i] - rad - F.binOX) / BIN));
    const bx1 = Math.min(bn - 1, Math.floor((F.x[i] + rad - F.binOX) / BIN));
    const bz0 = Math.max(0, Math.floor((F.z[i] - rad - F.binOZ) / BIN));
    const bz1 = Math.min(bn - 1, Math.floor((F.z[i] + rad - F.binOZ) / BIN));
    for (let bz = bz0; bz <= bz1; bz++) for (let bx = bx0; bx <= bx1; bx++) bins[bz * bn + bx].push(i);
  }
  for (let i = 0; i < bins.length; i++) bins[i] = Int32Array.from(bins[i]);
  F.bins = bins;
  return F;
}

/** Diffusion-based bounce light over the chunk plus a margin. */
export function solveAmbient(region, F, cfg) {
  const M = 24;
  const D = CN + M * 2;
  const o = CN - M; // region-space origin of the domain
  const open = new Uint8Array(D * D);
  const src = new Float32Array(D * D);
  const a = new Float32Array(D * D);
  const fl = region.flags;
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < D; x++) {
      const ri = (z + o) * RW + (x + o);
      open[z * D + x] = fl[ri] & (F_SOLID | F_GLITCH) ? 0 : 1;
    }
  }
  const range = (cfg.bounceRange ?? 3.2) / CELL;
  const mu = 1 / (range * range);
  const gain = (cfg.bounce ?? 0.3) * mu * 6.4;
  const ox = (region.ogx + o) * CELL;
  const oz = (region.ogz + o) * CELL;
  for (let i = 0; i < F.n; i++) {
    const f = F.list[i];
    const lum = (F.r[i] + F.g[i] + F.b[i]) / 3;
    const hw = (f.rot ? f.l || 0.6 : f.w || 0.6) * 0.5;
    const hl = (f.rot ? f.w || 0.6 : f.l || 0.6) * 0.5;
    const x0 = Math.floor((f.x - hw - ox) / CELL);
    const x1 = Math.floor((f.x + hw - ox) / CELL);
    const z0 = Math.floor((f.z - hl - oz) / CELL);
    const z1 = Math.floor((f.z + hl - oz) / CELL);
    const cells = Math.max(1, (x1 - x0 + 1) * (z1 - z0 + 1));
    const s = (lum * gain * (f.bounceMul ?? 1)) / cells;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || z < 0 || x >= D || z >= D) continue;
        src[z * D + x] += s;
      }
    }
  }
  const omega = 1.88;
  const iters = cfg.bounceIters ?? 64;
  for (let it = 0; it < iters; it++) {
    const fwd = (it & 1) === 0;
    for (let zz = 0; zz < D; zz++) {
      const z = fwd ? zz : D - 1 - zz;
      for (let xx = 0; xx < D; xx++) {
        const x = fwd ? xx : D - 1 - xx;
        const i = z * D + x;
        if (!open[i]) continue;
        let sum = src[i];
        let cnt = mu;
        if (x > 0 && open[i - 1]) {
          sum += a[i - 1];
          cnt += 1;
        }
        if (x < D - 1 && open[i + 1]) {
          sum += a[i + 1];
          cnt += 1;
        }
        if (z > 0 && open[i - D]) {
          sum += a[i - D];
          cnt += 1;
        }
        if (z < D - 1 && open[i + D]) {
          sum += a[i + D];
          cnt += 1;
        }
        a[i] += omega * (sum / cnt - a[i]);
        if (a[i] < 0) a[i] = 0;
      }
    }
  }
  return { a, open, D, ox, oz };
}

export function sampleAmbient(A, x, z) {
  const fx = (x - A.ox) / CELL - 0.5;
  const fz = (z - A.oz) / CELL - 0.5;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  let s = 0;
  let w = 0;
  const D = A.D;
  for (let k = 0; k < 4; k++) {
    const cx = ix + (k & 1);
    const cz = iz + (k >> 1);
    if (cx < 0 || cz < 0 || cx >= D || cz >= D) continue;
    const i = cz * D + cx;
    if (!A.open[i]) continue;
    const ww = (k & 1 ? tx : 1 - tx) * (k >> 1 ? tz : 1 - tz) + 1e-4;
    s += A.a[i] * ww;
    w += ww;
  }
  return w > 0 ? s / w : 0;
}

/**
 * Bake lighting into a builder's vertices.
 * Returns { stat: Float32Array(3n), dynW: Float32Array(4n), dynI: Float32Array(4n) }
 * dynI holds indices into F.list (or -1).
 */
export function bakeBuilder(region, F, A, cfg, b, opts = {}) {
  const n = b.count;
  const P = b.pos;
  const N = b.nrm;
  const AO = b.ao;
  const stat = new Float32Array(n * 3);
  const dynW = new Float32Array(n * 4);
  const dynI = new Float32Array(n * 4).fill(-1);
  const amb = cfg.ambientColor || [1, 1, 1];
  const ambMin = cfg.ambientMin || [0, 0, 0];
  const bn = F.binN;
  const tw = [0, 0, 0, 0];
  const ti = [-1, -1, -1, -1];
  const skipVis = opts.skipVis === true;
  const vis = F.vis || (F.vis = new VisCache(region, F));
  for (let v = 0; v < n; v++) {
    const px = P[v * 3];
    const py = P[v * 3 + 1];
    const pz = P[v * 3 + 2];
    const nx = N[v * 3];
    const ny = N[v * 3 + 1];
    const nz = N[v * 3 + 2];
    const ao = AO[v];
    const aoD = 0.55 + 0.45 * ao;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    tw[0] = tw[1] = tw[2] = tw[3] = 0;
    ti[0] = ti[1] = ti[2] = ti[3] = -1;
    const qx = px + nx * 0.03;
    const qz = pz + nz * 0.03;
    const cbx = Math.floor((px - F.binOX) / BIN);
    const cbz = Math.floor((pz - F.binOZ) / BIN);
    const isCeil = ny < -0.5;
    if (cbx >= 0 && cbz >= 0 && cbx < bn && cbz < bn) {
      const bin = F.bins[cbz * bn + cbx];
      {
        for (let k = 0; k < bin.length; k++) {
          const j = bin[k];
          if (isCeil && F.ey[j] < -0.5 && F.y[j] >= py - 0.15) continue;
          const lx0 = F.x[j] - px;
          const ly0 = F.y[j] - py;
          const lz0 = F.z[j] - pz;
          const d2 = lx0 * lx0 + ly0 * ly0 + lz0 * lz0;
          const r2 = F.rad2[j];
          if (d2 >= r2) continue;
          const d = Math.sqrt(d2) + 1e-6;
          const lx = lx0 / d;
          const ly = ly0 / d;
          const lz = lz0 / d;
          let cr = nx * lx + ny * ly + nz * lz;
          if (cr <= -0.08) continue;
          cr = (cr + 0.08) / 1.08;
          const om = F.omni[j];
          let ce = -(lx * F.ex[j] + ly * F.ey[j] + lz * F.ez[j]);
          ce = om + (1 - om) * (ce > 0 ? ce : 0);
          if (ce <= 0) continue;
          let win = 1 - (d2 / r2) * (d2 / r2);
          win *= win;
          let w = (cr * ce * win) / (d2 + F.soft[j]);
          if (w < 1e-5) continue;
          if (!skipVis) {
            // nudge start toward the fixture so corner vertices pick the right cell
            const hd = Math.hypot(lx0, lz0) + 1e-6;
            const sx = qx + (lx0 / hd) * 0.012;
            const sz = qz + (lz0 / hd) * 0.012;
            if (!vis.get(j, sx, sz)) continue;
          }
          w *= aoD;
          if (F.dyn[j]) {
            // keep the 4 strongest dynamic contributors
            let mi = 0;
            for (let q = 1; q < 4; q++) if (tw[q] < tw[mi]) mi = q;
            const lum = w * (F.r[j] + F.g[j] + F.b[j]);
            if (lum > tw[mi]) {
              if (ti[mi] >= 0) {
                // evicted one goes into static at nominal intensity
                const e = ti[mi];
                const ew = tw[mi] / (F.r[e] + F.g[e] + F.b[e]);
                sr += F.r[e] * ew;
                sg += F.g[e] * ew;
                sb += F.b[e] * ew;
              }
              tw[mi] = lum;
              ti[mi] = j;
            } else {
              sr += F.r[j] * w;
              sg += F.g[j] * w;
              sb += F.b[j] * w;
            }
          } else {
            sr += F.r[j] * w;
            sg += F.g[j] * w;
            sb += F.b[j] * w;
          }
        }
      }
    }
    // bounce light
    let am = 0;
    if (A) am = sampleAmbient(A, px + nx * CELL * 0.5, pz + nz * CELL * 0.5);
    // ceilings receive mostly bounce light; floors a bit less of it
    const amul = ny < -0.5 ? cfg.ceilBounce ?? 1.15 : ny > 0.5 ? 0.85 : 1.0;
    am *= amul * ao;
    stat[v * 3] = sr + am * amb[0] + ambMin[0] * ao;
    stat[v * 3 + 1] = sg + am * amb[1] + ambMin[1] * ao;
    stat[v * 3 + 2] = sb + am * amb[2] + ambMin[2] * ao;
    for (let q = 0; q < 4; q++) {
      if (ti[q] >= 0) {
        const j = ti[q];
        dynW[v * 4 + q] = tw[q] / (F.r[j] + F.g[j] + F.b[j]);
        dynI[v * 4 + q] = j;
      }
    }
  }
  return { stat, dynW, dynI };
}

/**
 * Memoized fixture visibility per (fixture, cell). A ray is cast from the
 * cell centre toward the fixture; every cell it crosses inherits the result
 * and a ray that runs into an already-resolved cell stops early. This turns
 * hundreds of thousands of long grid walks into mostly O(1) lookups.
 */
class VisCache {
  constructor(region, F) {
    this.region = region;
    this.F = F;
    this.memo = new Array(F.n);
    this.box = new Int32Array(F.n * 3); // ox, oz, size
    this.path = new Int32Array(1024);
  }
  get(j, sx, sz) {
    const region = this.region;
    const F = this.F;
    const inv = 1 / CELL;
    const rx = Math.floor(sx * inv) - region.ogx;
    const rz = Math.floor(sz * inv) - region.ogz;
    let m = this.memo[j];
    const bi = j * 3;
    if (!m) {
      const R = Math.ceil(Math.sqrt(F.rad2[j]) * inv) + 2;
      const S = R * 2 + 1;
      m = this.memo[j] = new Uint8Array(S * S);
      this.box[bi] = Math.floor(F.x[j] * inv) - region.ogx - R;
      this.box[bi + 1] = Math.floor(F.z[j] * inv) - region.ogz - R;
      this.box[bi + 2] = S;
    }
    const ox = this.box[bi];
    const oz = this.box[bi + 1];
    const S = this.box[bi + 2];
    let bx = rx - ox;
    let bz = rz - oz;
    if (bx < 0 || bz < 0 || bx >= S || bz >= S) return region.visible(sx, sz, F.x[j], F.z[j]);
    const known = m[bz * S + bx];
    if (known) return known === 1;
    // walk from this cell's centre toward the fixture
    const op = region.opaque;
    const x0 = (rx + region.ogx + 0.5) * CELL;
    const z0 = (rz + region.ogz + 0.5) * CELL;
    const x1 = F.x[j];
    const z1 = F.z[j];
    const tx = Math.floor(x1 * inv) - region.ogx - ox;
    const tz = Math.floor(z1 * inv) - region.ogz - oz;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const stx = dx > 0 ? 1 : -1;
    const stz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    let tMaxX = adx < 1e-9 ? 1e9 : (stx > 0 ? CELL * 0.5 : CELL * 0.5) / adx;
    let tMaxZ = adz < 1e-9 ? 1e9 : (stz > 0 ? CELL * 0.5 : CELL * 0.5) / adz;
    const tDX = adx < 1e-9 ? 1e9 : CELL / adx;
    const tDZ = adz < 1e-9 ? 1e9 : CELL / adz;
    const path = this.path;
    let np = 0;
    let result = 1;
    for (let it = 0; it < 1000; it++) {
      if (bx < 0 || bz < 0 || bx >= S || bz >= S) break;
      const mi = bz * S + bx;
      const k = m[mi];
      if (k) {
        result = k;
        break;
      }
      if (op[(bz + oz) * RW + (bx + ox)]) {
        result = 2;
        break;
      }
      path[np++] = mi;
      if (bx === tx && bz === tz) {
        result = 1;
        break;
      }
      if (tMaxX < tMaxZ) {
        tMaxX += tDX;
        bx += stx;
      } else {
        tMaxZ += tDZ;
        bz += stz;
      }
    }
    for (let i = 0; i < np; i++) m[path[i]] = result;
    return result === 1;
  }
}
