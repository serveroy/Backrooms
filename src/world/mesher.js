// Converts a chunk's cell grid into floor / ceiling / wall geometry grouped
// by material slot. Vertices are shared along continuous surfaces so the
// per-vertex baked lighting interpolates smoothly.

import { CN, CELL, F_SOLID, F_GLITCH, F_VOID, F_NOCEIL } from './layout.js';
import { RW } from './region.js';
import { GeoBuilder } from './geobuilder.js';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const WALL_ROW = 0.62; // max vertical spacing of wall vertices

function wallRows(y0, y1) {
  const h = y1 - y0;
  if (h <= 0.05) return [y0, y1];
  const rows = [y0];
  const edge = Math.min(0.14, h * 0.25);
  if (h > 0.5) rows.push(y0 + edge);
  const inner0 = h > 0.5 ? y0 + edge : y0;
  const inner1 = h > 0.5 ? y1 - edge : y1;
  const n = Math.max(1, Math.ceil((inner1 - inner0) / WALL_ROW));
  for (let i = 1; i < n; i++) rows.push(inner0 + ((inner1 - inner0) * i) / n);
  if (h > 0.5) rows.push(y1 - edge);
  rows.push(y1);
  return rows;
}

/**
 * @param region Region (3x3) centered on the chunk
 * @param mats   array of { w, h } texture world sizes per material slot
 * @param opts   { wallMatDefault }
 * @returns Map<slot, GeoBuilder>
 */
export function meshChunk(region, layout, mats, opts = {}) {
  const builders = new Map();
  const B = (slot) => {
    let b = builders.get(slot);
    if (!b) {
      b = new GeoBuilder();
      builders.set(slot, b);
    }
    return b;
  };
  const fl = region.flags;
  const fy = region.floorY;
  const cy = region.ceilY;
  const ox = CN; // chunk origin inside region
  const oz = CN;
  const gx0 = region.ogx + CN;
  const gz0 = region.ogz + CN;
  const isSolid = (ri) => (fl[ri] & (F_SOLID | F_GLITCH)) !== 0;

  // floor AO: number of solid cells around a corner
  const cornerSolid = (rx, rz) => {
    // corner at the min corner of cell (rx, rz)
    let s = 0;
    if (rx - 1 >= 0 && rz - 1 >= 0 && isSolid((rz - 1) * RW + rx - 1)) s++;
    if (rz - 1 >= 0 && isSolid((rz - 1) * RW + rx)) s++;
    if (rx - 1 >= 0 && isSolid(rz * RW + rx - 1)) s++;
    if (isSolid(rz * RW + rx)) s++;
    return s;
  };
  const aoCorner = (rx, rz) => {
    const s = cornerSolid(rx, rz);
    return s === 0 ? 1 : s === 1 ? 0.82 : s === 2 ? 0.74 : 0.6;
  };

  for (let lz = 0; lz < CN; lz++) {
    for (let lx = 0; lx < CN; lx++) {
      const rx = ox + lx;
      const rz = oz + lz;
      const ri = rz * RW + rx;
      const f = fl[ri];
      if (f & (F_SOLID | F_GLITCH)) continue;
      const li = lz * CN + lx;
      const x0 = (gx0 + lx) * CELL;
      const z0 = (gz0 + lz) * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const yF = fy[ri];
      const yC = cy[ri];

      // ---- floor
      if (!(f & F_VOID)) {
        const slot = layout.matF[li];
        const b = B('f' + slot);
        const m = mats[slot] || { w: 1, h: 1 };
        const yq = Math.round(yF * 100) + 50000;
        const key = (cx, cz) => ((cx - gx0 + 1) * 70 + (cz - gz0 + 1)) * 100000 + yq;
        const vtx = (gx, gz) =>
          b.vk(key(gx, gz), gx * CELL, yF, gz * CELL, 0, 1, 0, (gx * CELL) / m.w, (-gz * CELL) / m.h, aoCorner(gx - region.ogx, gz - region.ogz));
        const a = vtx(gx0 + lx, gz0 + lz);
        const bb = vtx(gx0 + lx, gz0 + lz + 1);
        const c = vtx(gx0 + lx + 1, gz0 + lz + 1);
        const d = vtx(gx0 + lx + 1, gz0 + lz);
        b.quad(a, bb, c, d);
      }

      // ---- ceiling
      if (!(f & F_NOCEIL)) {
        const slot = layout.matC[li];
        const b = B('c' + slot);
        const m = mats[slot] || { w: 1, h: 1 };
        const yq = Math.round(yC * 100) + 50000;
        const key = (cx, cz) => ((cx - gx0 + 1) * 70 + (cz - gz0 + 1)) * 100000 + yq;
        const vtx = (gx, gz) =>
          b.vk(key(gx, gz), gx * CELL, yC, gz * CELL, 0, -1, 0, (gx * CELL) / m.w, (gz * CELL) / m.h, 0.25 + 0.75 * aoCorner(gx - region.ogx, gz - region.ogz));
        const a = vtx(gx0 + lx, gz0 + lz);
        const bb = vtx(gx0 + lx, gz0 + lz + 1);
        const c = vtx(gx0 + lx + 1, gz0 + lz + 1);
        const d = vtx(gx0 + lx + 1, gz0 + lz);
        b.quad(a, d, c, bb);
      }

      // ---- walls and steps
      for (let di = 0; di < 4; di++) {
        const dx = DIRS[di][0];
        const dz = DIRS[di][1];
        const nri = (rz + dz) * RW + (rx + dx);
        const nf = fl[nri];
        // boundary segment endpoints (along the shared edge)
        let ax, az, bx, bz;
        if (dx === 1) {
          ax = x1; az = z0; bx = x1; bz = z1;
        } else if (dx === -1) {
          ax = x0; az = z0; bx = x0; bz = z1;
        } else if (dz === 1) {
          ax = x0; az = z1; bx = x1; bz = z1;
        } else {
          ax = x0; az = z0; bx = x1; bz = z0;
        }
        const nx = -dx; // wall normal points back into this open cell
        const nz = -dz;
        if (nf & (F_SOLID | F_GLITCH)) {
          const nl = neighbourLayoutMat(region, rx + dx, rz + dz);
          const slot = nl;
          const b = B('w' + slot);
          const m = mats[slot] || { w: 1, h: 1 };
          const rows = wallRows(yF, yC);
          // inner-corner AO: lateral neighbours solid?
          const lat = dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
          // which lateral belongs to endpoint a (lower coordinate)
          const latA = isSolid((rz + lat[0][1]) * RW + rx + lat[0][0]) ? 0.72 : 1;
          const latB = isSolid((rz + lat[1][1]) * RW + rx + lat[1][0]) ? 0.72 : 1;
          // u coordinate along wall in the viewer's right direction
          const uOf = (x, z) => (nx === 1 ? -z : nx === -1 ? z : nz === 1 ? x : -x) / m.w;
          const dirKey = di;
          const keyOf = (x, z, y) =>
            ((Math.round(x / CELL) - gx0 + 2) * 80 + (Math.round(z / CELL) - gz0 + 2)) * 4 * 100000 +
            dirKey * 100000 +
            Math.round(y * 100) +
            50000;
          const ids = [];
          for (let r = 0; r < rows.length; r++) {
            const y = rows[r];
            const vAo = r === 0 ? 0.62 : r === rows.length - 1 ? 0.8 : r === 1 ? 0.9 : 1;
            const ia = b.vk(keyOf(ax, az, y), ax, y, az, nx, 0, nz, uOf(ax, az), y / m.h, vAo * latA);
            const ib = b.vk(keyOf(bx, bz, y), bx, y, bz, nx, 0, nz, uOf(bx, bz), y / m.h, vAo * latB);
            ids.push([ia, ib]);
          }
          for (let r = 0; r < rows.length - 1; r++) {
            const [a0, b0] = ids[r];
            const [a1, b1] = ids[r + 1];
            pushQuadOriented(b, a0, b0, b1, a1, nx, 0, nz);
          }
        } else {
          // floor step down into neighbour
          const nfy = nf & F_VOID ? yF - 12 : fy[nri];
          if (nfy < yF - 0.01 && !(f & F_VOID)) {
            const slot = neighbourFloorMat(region, layout, rx + dx, rz + dz, layout.matF[li]);
            const b = B('w' + slot);
            const m = mats[slot] || { w: 1, h: 1 };
            const rows = wallRows(nfy, yF);
            const sx = dx;
            const sz = dz; // face looks toward the lower neighbour
            const uOf = (x, z) => (sx === 1 ? -z : sx === -1 ? z : sz === 1 ? x : -x) / m.w;
            const ids = [];
            for (let r = 0; r < rows.length; r++) {
              const y = rows[r];
              ids.push([
                b.v(ax, y, az, sx, 0, sz, uOf(ax, az), y / m.h, r === 0 ? 0.7 : 1),
                b.v(bx, y, bz, sx, 0, sz, uOf(bx, bz), y / m.h, r === 0 ? 0.7 : 1),
              ]);
            }
            for (let r = 0; r < rows.length - 1; r++) {
              const [a0, b0] = ids[r];
              const [a1, b1] = ids[r + 1];
              pushQuadOriented(b, a0, b0, b1, a1, sx, 0, sz);
            }
          }
          // ceiling soffit: neighbour ceiling higher than ours
          const ncy = cy[nri];
          if (!(nf & F_NOCEIL) && !(f & F_NOCEIL) && ncy > yC + 0.01) {
            const slot = opts.soffitMat ?? 0;
            const b = B('w' + slot);
            const m = mats[slot] || { w: 1, h: 1 };
            const rows = wallRows(yC, ncy);
            const sx = dx;
            const sz = dz;
            const uOf = (x, z) => (sx === 1 ? -z : sx === -1 ? z : sz === 1 ? x : -x) / m.w;
            const ids = [];
            for (let r = 0; r < rows.length; r++) {
              const y = rows[r];
              ids.push([
                b.v(ax, y, az, sx, 0, sz, uOf(ax, az), y / m.h, r === 0 ? 0.85 : 1),
                b.v(bx, y, bz, sx, 0, sz, uOf(bx, bz), y / m.h, r === 0 ? 0.85 : 1),
              ]);
            }
            for (let r = 0; r < rows.length - 1; r++) {
              const [a0, b0] = ids[r];
              const [a1, b1] = ids[r + 1];
              pushQuadOriented(b, a0, b0, b1, a1, sx, 0, sz);
            }
          }
        }
      }
    }
  }
  return builders;
}

function pushQuadOriented(b, a, c, d, e, nx, ny, nz) {
  // positions of a, c, e to determine winding
  const P = b.pos;
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const ux = P[c * 3] - ax, uy = P[c * 3 + 1] - ay, uz = P[c * 3 + 2] - az;
  const vx = P[e * 3] - ax, vy = P[e * 3 + 1] - ay, vz = P[e * 3 + 2] - az;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  // front normal of quad(a, c, d, e) is (c-a)x(e-a)
  const s = cx * nx + cy * ny + cz * nz;
  if (s > 0) b.quad(a, c, d, e);
  else b.quad(a, e, d, c);
}

function neighbourLayoutMat(region, rx, rz) {
  // find which layout the region cell belongs to, return matW
  const bx = Math.floor(rx / CN);
  const bz = Math.floor(rz / CN);
  const L = region.layouts[bz * 3 + bx];
  if (!L) return 0;
  return L.matW[(rz - bz * CN) * CN + (rx - bx * CN)];
}

function neighbourFloorMat(region, layout, rx, rz, fallback) {
  const bx = Math.floor(rx / CN);
  const bz = Math.floor(rz / CN);
  const L = region.layouts[bz * 3 + bx];
  if (!L) return fallback;
  const i = (rz - bz * CN) * CN + (rx - bx * CN);
  return L.stepMat ? L.stepMat[i] : L.matF[i];
}
