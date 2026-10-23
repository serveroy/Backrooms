// Procedural, tileable texture toolkit. Everything works on Float32 RGB
// buffers in [0,1] (sRGB space) and is converted to a canvas at the end.

import { hash32 } from '../core/rng.js';

export class TexBuf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 3);
  }
  fill(r, g, b) {
    const d = this.d;
    for (let i = 0; i < d.length; i += 3) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    return this;
  }
  /** Apply fn(x, y, rgb[3]) per pixel; fn mutates rgb. */
  each(fn) {
    const { w, h, d } = this;
    const c = [0, 0, 0];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        c[0] = d[i];
        c[1] = d[i + 1];
        c[2] = d[i + 2];
        fn(x, y, c);
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
      }
    }
    return this;
  }
  get(x, y) {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 3;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  blend(x, y, r, g, b, a) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    y = ((Math.round(y) % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 3;
    const d = this.d;
    d[i] += (r - d[i]) * a;
    d[i + 1] += (g - d[i + 1]) * a;
    d[i + 2] += (b - d[i + 2]) * a;
  }
  mul(x, y, f) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    y = ((Math.round(y) % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 3;
    this.d[i] *= f;
    this.d[i + 1] *= f;
    this.d[i + 2] *= f;
  }
  /** Wrap-around box blur (separable), radius in px. */
  blur(r) {
    if (r < 1) return this;
    const { w, h } = this;
    const src = this.d;
    const tmp = new Float32Array(src.length);
    const n = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[(y * w + ((k + w) % w)) * 3 + c];
        for (let x = 0; x < w; x++) {
          tmp[(y * w + x) * 3 + c] = acc / n;
          const xo = (x - r + w) % w;
          const xi = (x + r + 1) % w;
          acc += src[(y * w + xi) * 3 + c] - src[(y * w + xo) * 3 + c];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += tmp[(((k + h) % h) * w + x) * 3 + c];
        for (let y = 0; y < h; y++) {
          src[(y * w + x) * 3 + c] = acc / n;
          const yo = (y - r + h) % h;
          const yi = (y + r + 1) % h;
          acc += tmp[(yi * w + x) * 3 + c] - tmp[(yo * w + x) * 3 + c];
        }
      }
    }
    return this;
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    const p = img.data;
    const d = this.d;
    for (let i = 0, j = 0; i < d.length; i += 3, j += 4) {
      p[j] = Math.max(0, Math.min(255, d[i] * 255 + 0.5));
      p[j + 1] = Math.max(0, Math.min(255, d[i + 1] * 255 + 0.5));
      p[j + 2] = Math.max(0, Math.min(255, d[i + 2] * 255 + 0.5));
      p[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

function sm(t) {
  return t * t * (3 - 2 * t);
}

/** Periodic value noise: period px in x and y (integers). */
export function pnoise(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = sm(x - xi);
  const yf = sm(y - yi);
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hash32(x0, y0, seed) / 4294967296;
  const b = hash32(x1, y0, seed) / 4294967296;
  const c = hash32(x0, y1, seed) / 4294967296;
  const d = hash32(x1, y1, seed) / 4294967296;
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Periodic fBm. (u,v) in [0,1) texture space, base frequency = cells across. */
export function pfbm(u, v, freq, octaves, seed, gain = 0.5, freqY = freq) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = freq;
  let fy = freqY;
  for (let o = 0; o < octaves; o++) {
    sum += pnoise(u * fx, v * fy, fx, fy, seed + o * 1013) * amp;
    norm += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

/** Periodic worley (cellular) distance F1 in [0,~1]. */
export function pworley(u, v, freq, seed) {
  const x = u * freq;
  const y = v * freq;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const wx = ((cx % freq) + freq) % freq;
      const wy = ((cy % freq) + freq) % freq;
      const h = hash32(wx, wy, seed);
      const ox = (h & 0xffff) / 65536;
      const oy = (h >>> 16) / 65536;
      const dx = cx + ox - x;
      const dy = cy + oy - y;
      const dd = dx * dx + dy * dy;
      if (dd < best) best = dd;
    }
  }
  return Math.sqrt(best);
}

export function hex(c) {
  const n = parseInt(c.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Simple deterministic RNG for texture painting. */
export function texRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint a soft stain blob (wrapping) multiplying/tinting the buffer. */
export function stain(buf, cx, cy, radius, color, strength, rng, ring = 0.0) {
  const r2 = radius * radius;
  const wob = rng() * 100;
  for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const ang = Math.atan2(dy, dx);
      const rr = radius * (0.75 + 0.25 * Math.sin(ang * 3 + wob) * Math.cos(ang * 5 - wob));
      const d = Math.sqrt(dx * dx + dy * dy) / rr;
      if (d >= 1 || dx * dx + dy * dy > r2) continue;
      let a = (1 - d * d) * strength;
      if (ring > 0) a += Math.exp(-((d - 0.92) ** 2) / 0.004) * ring;
      buf.blend(x, y, color[0], color[1], color[2], Math.min(1, a));
    }
  }
}
