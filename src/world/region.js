// A 3x3 chunk neighbourhood flattened into contiguous arrays so the mesher
// and light baker can query cells across chunk borders cheaply.

import { CN, CELL, F_SOLID, F_GLITCH } from './layout.js';

export const RW = CN * 3;

export class Region {
  constructor(getLayout, cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.ogx = (cx - 1) * CN; // global cell x of region origin
    this.ogz = (cz - 1) * CN;
    const n = RW * RW;
    this.flags = new Uint8Array(n);
    this.floorY = new Float32Array(n);
    this.ceilY = new Float32Array(n);
    this.waterY = null;
    this.opaque = new Uint8Array(n);
    this.layouts = [];
    this.fixtures = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const L = getLayout(cx + dx, cz + dz);
        this.layouts.push(L);
        const bx = (dx + 1) * CN;
        const bz = (dz + 1) * CN;
        if (L.waterY && !this.waterY) this.waterY = new Float32Array(n).fill(-999);
        for (let lz = 0; lz < CN; lz++) {
          const src = lz * CN;
          const dst = (bz + lz) * RW + bx;
          this.flags.set(L.flags.subarray(src, src + CN), dst);
          this.floorY.set(L.floorY.subarray(src, src + CN), dst);
          this.ceilY.set(L.ceilY.subarray(src, src + CN), dst);
          if (L.waterY) this.waterY.set(L.waterY.subarray(src, src + CN), dst);
        }
        for (const f of L.fixtures) this.fixtures.push(f);
      }
    }
    // water arrays may have been created after some chunks were copied
    if (this.waterY) {
      for (let i = 0; i < 9; i++) {
        const L = this.layouts[i];
        if (L.waterY) continue;
        const bx = (i % 3) * CN;
        const bz = Math.floor(i / 3) * CN;
        for (let lz = 0; lz < CN; lz++) this.waterY.fill(-999, (bz + lz) * RW + bx, (bz + lz) * RW + bx + CN);
      }
    }
    const fl = this.flags;
    const op = this.opaque;
    for (let i = 0; i < n; i++) op[i] = fl[i] & (F_SOLID | F_GLITCH) ? 1 : 0;
  }

  /** Region-local index from global cell coords, or -1 if outside. */
  ri(gx, gz) {
    const x = gx - this.ogx;
    const z = gz - this.ogz;
    if (x < 0 || z < 0 || x >= RW || z >= RW) return -1;
    return z * RW + x;
  }

  flagsG(gx, gz) {
    const i = this.ri(gx, gz);
    return i < 0 ? F_SOLID : this.flags[i];
  }

  /** 2D line-of-sight through the cell grid (Amanatides & Woo DDA). */
  visible(x0, z0, x1, z1) {
    const op = this.opaque;
    const inv = 1 / CELL;
    let gx = Math.floor(x0 * inv) - this.ogx;
    let gz = Math.floor(z0 * inv) - this.ogz;
    const tx = Math.floor(x1 * inv) - this.ogx;
    const tz = Math.floor(z1 * inv) - this.ogz;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    let tMaxX = adx < 1e-9 ? 1e9 : ((gx + this.ogx + (sx > 0 ? 1 : 0)) * CELL - x0) / dx;
    let tMaxZ = adz < 1e-9 ? 1e9 : ((gz + this.ogz + (sz > 0 ? 1 : 0)) * CELL - z0) / dz;
    const tDX = adx < 1e-9 ? 1e9 : CELL / adx;
    const tDZ = adz < 1e-9 ? 1e9 : CELL / adz;
    for (let n = 0; n < 512; n++) {
      if (gx < 0 || gz < 0 || gx >= RW || gz >= RW) return true;
      if (gx === tx && gz === tz) return true;
      if (op[gz * RW + gx]) return false;
      if (tMaxX < tMaxZ) {
        tMaxX += tDX;
        gx += sx;
      } else {
        tMaxZ += tDZ;
        gz += sz;
      }
    }
    return true;
  }
}
