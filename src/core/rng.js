// Deterministic hashing / random utilities. Every level is generated from a
// run seed so a world can be regenerated identically chunk by chunk.

export function hash32(a, b = 0, c = 0, d = 0) {
  let h = 0x811c9dc5 ^ (a | 0);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h ^= b | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= c | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h ^= d | 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash to float in [0, 1). */
export function hashf(a, b = 0, c = 0, d = 0) {
  return hash32(a, b, c, d) / 4294967296;
}

export function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small fast seeded PRNG (mulberry32) with helpers. */
export class RNG {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    // inclusive a..b
    return a + Math.floor(this.next() * (b - a + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [0,1], deterministic per seed. */
export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hashf(xi, yi, seed);
  const b = hashf(xi + 1, yi, seed);
  const c = hashf(xi, yi + 1, seed);
  const d = hashf(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm2(x, y, seed = 0, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise2(x * f, y * f, seed + i * 131) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return v / norm;
}

/** 1D smooth noise for flicker etc. */
export function noise1(x, seed = 0) {
  const xi = Math.floor(x);
  const t = smooth(x - xi);
  const a = hashf(xi, seed);
  const b = hashf(xi + 1, seed);
  return a + (b - a) * t;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
