// Live state of light fixtures: slot allocation in the shared fixture
// texture and per-frame flicker evaluation.

import { fixTexture, fixTextureData, FIX_TEX_W, FIX_TEX_H } from './materials.js';
import { noise1, hashf } from '../core/rng.js';

const MAX_SLOTS = FIX_TEX_W * FIX_TEX_H;

export class FixtureSystem {
  constructor() {
    this.byKey = new Map(); // key -> { slot, refs, f }
    this.free = [];
    for (let i = MAX_SLOTS - 1; i >= 0; i--) this.free.push(i);
    this.active = []; // slot entries
    this.overrides = new Map(); // key -> function(t) => intensity multiplier
    this.onSputter = null; // callback(fixture, intensity) when a light pops back on
  }

  acquire(f) {
    let e = this.byKey.get(f.key);
    if (e) {
      e.refs++;
      return e.slot;
    }
    if (!this.free.length) return -1;
    const slot = this.free.pop();
    e = { slot, refs: 1, f, last: 1, seed: hashf(f.key.length, f.x * 13.1, f.z * 7.7) * 1000 };
    this.byKey.set(f.key, e);
    this.active.push(e);
    return slot;
  }

  release(key) {
    const e = this.byKey.get(key);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) {
      this.byKey.delete(key);
      this.free.push(e.slot);
      const i = this.active.indexOf(e);
      if (i >= 0) this.active.splice(i, 1);
      const o = e.slot * 4;
      fixTextureData[o] = fixTextureData[o + 1] = fixTextureData[o + 2] = fixTextureData[o + 3] = 0;
    }
  }

  clear() {
    for (const e of [...this.active]) {
      e.refs = 0;
      this.release(e.f.key);
    }
    this.byKey.clear();
    this.active.length = 0;
    this.free.length = 0;
    for (let i = MAX_SLOTS - 1; i >= 0; i--) this.free.push(i);
    fixTextureData.fill(0);
    fixTexture.needsUpdate = true;
  }

  static intensity(mode, t, seed, f) {
    switch (mode) {
      case 'flicker': {
        // mostly on, with nervous drop-outs
        const slow = noise1(t * 0.7 + seed, 3);
        const fast = noise1(t * 23 + seed * 3, 5);
        let k = 0.93 + 0.07 * fast;
        if (slow < 0.28) {
          const burst = noise1(t * 31 + seed * 7, 9);
          k = burst > 0.55 ? 0.95 : burst > 0.35 ? 0.35 : 0.04;
        }
        return k;
      }
      case 'dying': {
        const s = noise1(t * 0.45 + seed, 11);
        if (s < 0.55) return 0.0;
        const b = noise1(t * 40 + seed * 5, 13);
        return b > 0.5 ? 0.9 : b > 0.4 ? 0.3 : 0.0;
      }
      case 'strobe': {
        const period = f && f.period ? f.period : 0.9;
        const ph = ((t + seed) % period) / period;
        return ph < 0.5 ? 1 : 0.05;
      }
      case 'pulse': {
        const period = f && f.period ? f.period : 2.2;
        return 0.15 + 0.85 * Math.pow(0.5 + 0.5 * Math.sin(((t + seed) / period) * Math.PI * 2), 2);
      }
      default:
        return 1;
    }
  }

  update(t) {
    const d = fixTextureData;
    for (const e of this.active) {
      const f = e.f;
      let k = FixtureSystem.intensity(f.mode, t, e.seed, f);
      if (f.level !== undefined) k *= f.level;
      const ov = this.overrides.get(f.key);
      if (ov) k *= ov(t);
      if (this.onSputter && k > 0.5 && e.last < 0.2) this.onSputter(f, k);
      e.last = k;
      const o = e.slot * 4;
      d[o] = f.color[0] * f.power * k;
      d[o + 1] = f.color[1] * f.power * k;
      d[o + 2] = f.color[2] * f.power * k;
      d[o + 3] = k;
    }
    fixTexture.needsUpdate = true;
  }
}
