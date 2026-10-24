// Shared generation helpers for maze-like levels.
//
// The "lattice maze" places thin walls along a coarse lattice (every U
// cells). Every decision is a pure hash of global lattice coordinates, so
// neighbouring chunks agree on shared walls without any coordination.

import * as THREE from 'three';
import { hashf, fbm2, RNG, hash32 } from '../core/rng.js';
import { CN, CELL, F_SOLID, F_BLOCK, F_GLITCH, F_KEEP, F_VOID } from '../world/layout.js';

/**
 * Edge state for a lattice edge.
 * returns { present, kind: 'full'|'door'|'half', a, b, thick }
 * cells along an edge are k = 1..U-1 (k = 0 and U are lattice points)
 */
export function latticeEdge(P, ori, Lx, Lz) {
  const seed = P.seed;
  const dens = P.density(Lx, Lz);
  const h = hashf(Lx, Lz, seed, ori === 'v' ? 101 : 202);
  if (h >= dens) return null;
  const U = P.U;
  const h2 = hashf(Lx, Lz, seed, ori === 'v' ? 303 : 404);
  const h3 = hashf(Lx, Lz, seed, ori === 'v' ? 505 : 606);
  const thick = hashf(Lx, Lz, seed, ori === 'v' ? 707 : 808) < (P.thickChance ?? 0.18) ? 2 : 1;
  let kind = 'full';
  let a = 0;
  let b = 0;
  const pDoor = P.doorChance ?? 0.38;
  const pHalf = P.halfChance ?? 0.1;
  if (h2 < pDoor) {
    kind = 'door';
    const w = P.doorMin + Math.floor(h3 * (P.doorMax - P.doorMin + 1));
    const off = 1 + Math.floor(hashf(Lx, Lz, seed, 909) * Math.max(1, U - 1 - w));
    a = off;
    b = Math.min(U - 1, off + w - 1);
  } else if (h2 < pDoor + pHalf) {
    kind = 'half';
    const len = 2 + Math.floor(h3 * (U - 4));
    if (hashf(Lx, Lz, seed, 919) < 0.5) {
      a = 1 + len;
      b = U - 1; // gap at the far end
    } else {
      a = 1;
      b = U - 1 - len; // gap at the near end
    }
  }
  return { present: true, kind, a, b, thick };
}

function edgeFull(P, ori, Lx, Lz) {
  const e = latticeEdge(P, ori, Lx, Lz);
  return !!e && e.kind === 'full';
}

/** Final edge state with the anti-enclosure rule applied. */
export function edgeState(P, ori, Lx, Lz) {
  const e = latticeEdge(P, ori, Lx, Lz);
  if (!e || e.kind !== 'full' || ori !== 'v') return e;
  // Each lattice cell owns its west edge (v at Lx). If the owning cell is
  // fully enclosed by solid walls, that edge becomes a doorway, so a
  // single sealed room can never exist.
  const enclosed = edgeFull(P, 'v', Lx + 1, Lz) && edgeFull(P, 'h', Lx, Lz) && edgeFull(P, 'h', Lx, Lz + 1);
  if (enclosed) return { ...e, kind: 'door', a: 2, b: Math.min(P.U - 2, 2 + P.doorMin) };
  return e;
}

/** Rasterize the lattice maze into a chunk layout. */
export function rasterLattice(L, P) {
  const U = P.U;
  if (CN % U) throw new Error('lattice unit must divide the chunk size');
  const per = CN / U;
  const cx = L.cx;
  const cz = L.cz;
  const solidAt = (lx, lz, flag = F_SOLID) => {
    if (lx < 0 || lz < 0 || lx >= CN || lz >= CN) return;
    L.flags[lz * CN + lx] |= flag;
  };
  const cornerNeeded = new Map();
  for (let j = -1; j <= per; j++) {
    for (let i = -1; i <= per; i++) {
      const Lx = cx * per + i;
      const Lz = cz * per + j;
      // vertical edge on x = Lx*U, z from Lz*U
      const v = edgeState(P, 'v', Lx, Lz);
      if (v) {
        const x = i * U;
        for (let k = 1; k < U; k++) {
          const inGap = v.kind !== 'full' && k >= v.a && k <= v.b;
          if (inGap) continue;
          for (let t = 0; t < v.thick; t++) solidAt(x + t, j * U + k);
        }
        const touch0 = !(v.kind !== 'full' && 1 >= v.a && 1 <= v.b);
        const touch1 = !(v.kind !== 'full' && U - 1 >= v.a && U - 1 <= v.b);
        if (touch0) cornerNeeded.set(`${i},${j}`, Math.max(cornerNeeded.get(`${i},${j}`) || 0, v.thick));
        if (touch1) cornerNeeded.set(`${i},${j + 1}`, Math.max(cornerNeeded.get(`${i},${j + 1}`) || 0, v.thick));
      }
      const h = edgeState(P, 'h', Lx, Lz);
      if (h) {
        const z = j * U;
        for (let k = 1; k < U; k++) {
          const inGap = h.kind !== 'full' && k >= h.a && k <= h.b;
          if (inGap) continue;
          for (let t = 0; t < h.thick; t++) solidAt(i * U + k, z + t);
        }
        const touch0 = !(h.kind !== 'full' && 1 >= h.a && 1 <= h.b);
        const touch1 = !(h.kind !== 'full' && U - 1 >= h.a && U - 1 <= h.b);
        if (touch0) cornerNeeded.set(`${i},${j}`, Math.max(cornerNeeded.get(`${i},${j}`) || 0, h.thick));
        if (touch1) cornerNeeded.set(`${i + 1},${j}`, Math.max(cornerNeeded.get(`${i + 1},${j}`) || 0, h.thick));
      }
    }
  }
  for (const [k, t] of cornerNeeded) {
    const [i, j] = k.split(',').map(Number);
    for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) solidAt(i * U + a, j * U + b);
  }
  // pillars at empty lattice points in open regions
  if (P.pillar) {
    for (let j = 0; j < per; j++) {
      for (let i = 0; i < per; i++) {
        const Lx = cx * per + i;
        const Lz = cz * per + j;
        if (cornerNeeded.has(`${i},${j}`)) continue;
        const p = P.pillar(Lx, Lz);
        if (p > 0 && hashf(Lx, Lz, P.seed, 4242) < p) {
          const s = P.pillarSize ?? 2;
          for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) solidAt(i * U + a, j * U + b);
        }
      }
    }
  }
}

/** Iterate wall-adjacent open cells: cb(lx, lz, dirX, dirZ) where dir points at the wall. */
export function forWallCells(L, cb) {
  for (let lz = 1; lz < CN - 1; lz++) {
    for (let lx = 1; lx < CN - 1; lx++) {
      const f = L.flags[lz * CN + lx];
      if (f & (F_SOLID | F_BLOCK | F_GLITCH)) continue;
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dz] of dirs) {
        const nf = L.flags[(lz + dz) * CN + lx + dx];
        if (nf & F_SOLID) cb(lx, lz, dx, dz);
      }
    }
  }
}

/** Find a random open cell with clearance r (in cells) inside a chunk. */
export function findOpenCell(L, rng, r = 1, tries = 60, filter = null) {
  for (let t = 0; t < tries; t++) {
    const lx = rng.int(r + 1, CN - r - 2);
    const lz = rng.int(r + 1, CN - r - 2);
    let ok = true;
    for (let dz = -r; dz <= r && ok; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (L.flags[(lz + dz) * CN + lx + dx] & (F_SOLID | F_BLOCK | F_GLITCH | F_KEEP | F_VOID)) {
          ok = false;
          break;
        }
      }
    }
    if (ok && (!filter || filter(lx, lz))) return [lx, lz];
  }
  return null;
}

/** Find a spot next to a wall: returns { lx, lz, dx, dz } with dir toward wall. */
export function findWallSpot(L, rng, tries = 80) {
  for (let t = 0; t < tries; t++) {
    const lx = rng.int(2, CN - 3);
    const lz = rng.int(2, CN - 3);
    const f = L.flags[lz * CN + lx];
    if (f & (F_SOLID | F_BLOCK | F_GLITCH | F_VOID)) continue;
    const dirs = rng.shuffle([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    for (const [dx, dz] of dirs) {
      const nf = L.flags[(lz + dz) * CN + lx + dx];
      if (nf & F_SOLID && !(nf & F_GLITCH)) {
        // need the 2 lateral neighbours along the wall to also be walls
        const ax = dz !== 0 ? 1 : 0;
        const az = dx !== 0 ? 1 : 0;
        const w1 = L.flags[(lz + dz + az) * CN + lx + dx + ax];
        const w2 = L.flags[(lz + dz - az) * CN + lx + dx - ax];
        const o1 = L.flags[(lz + az) * CN + lx + ax];
        const o2 = L.flags[(lz - az) * CN + lx - ax];
        if (w1 & F_SOLID && w2 & F_SOLID && !(o1 & (F_SOLID | F_BLOCK)) && !(o2 & (F_SOLID | F_BLOCK))) {
          return { lx, lz, dx, dz };
        }
      }
    }
  }
  return null;
}

/** Convert a straight run of wall cells into a glitch (noclip) exit. */
export function placeGlitchWall(L, rng, glitchMat, target, opts = {}) {
  for (let t = 0; t < 120; t++) {
    const spot = findWallSpot(L, rng, 4);
    if (!spot) continue;
    const { lx, lz, dx, dz } = spot;
    const wx = lx + dx;
    const wz = lz + dz;
    const ax = dz !== 0 ? 1 : 0;
    const az = dx !== 0 ? 1 : 0;
    // need a run of 4 wall cells with open cells in front
    let ok = true;
    for (let k = -1; k <= 2; k++) {
      const f = L.flags[(wz + az * k) * CN + wx + ax * k] ?? 0;
      const o = L.flags[(lz + az * k) * CN + lx + ax * k] ?? F_SOLID;
      if (!(f & F_SOLID) || o & (F_SOLID | F_BLOCK)) ok = false;
      const bx = wx + ax * k;
      const bz = wz + az * k;
      if (bx < 1 || bz < 1 || bx >= CN - 1 || bz >= CN - 1) ok = false;
    }
    if (!ok) continue;
    for (let k = -1; k <= 2; k++) {
      const i = (wz + az * k) * CN + wx + ax * k;
      L.flags[i] = (L.flags[i] & ~F_SOLID) | F_GLITCH;
      L.matW[i] = glitchMat;
    }
    const ex = (L.cx * CN + wx + 0.5 + ax * 0.5) * CELL;
    const ez = (L.cz * CN + wz + 0.5 + az * 0.5) * CELL;
    L.exits.push({ type: 'noclip', x: ex, z: ez, nx: -dx, nz: -dz, target, ...opts });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- prop helpers

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const geoCache = new Map();

export function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export function boxGeo() {
  return cachedGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
}

export function cylGeo(seg = 10) {
  return cachedGeo('cyl' + seg, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1));
}

/** Add a transformed unit geometry. rot = [rx, ry, rz]. uvMode 'world' scales uv by size. */
export function addPart(b, geo, x, y, z, sx, sy, sz, rot = [0, 0, 0], uvScale = [1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  return b.addGeometry(geo, _m, uvScale);
}

/** Box helper; uv scaled roughly by dimensions so textures keep density. */
export function addBox(b, x, y, z, sx, sy, sz, ry = 0, texScale = 1) {
  return addPart(b, boxGeo(), x, y, z, sx, sy, sz, [0, ry, 0], [Math.max(sx, sz) / texScale, sy / texScale]);
}

export function chunkRng(L, seed, salt) {
  return new RNG(hash32(L.cx, L.cz, seed, salt));
}

export { fbm2, hashf };

// ---------------------------------------------------------------- corridor network
//
// Everything starts solid; corridors are carved between lattice nodes.
// Edge decisions hash global node coordinates so chunks agree, and an
// isolated node always opens its own east edge.

function rawEdge(P, ori, i, j) {
  return hashf(i, j, P.seed, ori === 'e' ? 1301 : 1302) < P.edgeChance(i, j);
}

export function netEdge(P, ori, i, j) {
  if (rawEdge(P, ori, i, j)) return true;
  if (ori === 'e') {
    const isolated = !rawEdge(P, 'e', i - 1, j) && !rawEdge(P, 'n', i, j) && !rawEdge(P, 'n', i, j - 1);
    if (isolated) return true;
  }
  return false;
}

export function netEdgeWidth(P, ori, i, j) {
  const h = hashf(i, j, P.seed, ori === 'e' ? 1401 : 1402);
  return P.widths[Math.floor(h * P.widths.length)];
}

/**
 * Carve a corridor network into a layout.
 * P: { U, seed, edgeChance(i,j), widths:[cells], nodeSize(i,j) -> cells, roomChance }
 * Returns the list of carved straight segments (local cell rects) for decoration.
 */
export function carveNetwork(L, P) {
  const U = P.U;
  if (CN % U) throw new Error('lattice unit must divide the chunk size');
  const per = CN / U;
  L.flags.fill(F_SOLID);
  const segs = [];
  const carve = (x0, z0, x1, z1) => {
    for (let z = Math.max(0, z0); z < Math.min(CN, z1); z++) {
      for (let x = Math.max(0, x0); x < Math.min(CN, x1); x++) L.flags[z * CN + x] &= ~F_SOLID;
    }
  };
  const c = Math.floor(U / 2);
  for (let j = -1; j <= per; j++) {
    for (let i = -1; i <= per; i++) {
      const gi = L.cx * per + i;
      const gj = L.cz * per + j;
      const nx = i * U + c;
      const nz = j * U + c;
      // node
      const ns = P.nodeSize ? P.nodeSize(gi, gj) : 6;
      const h = Math.floor(ns / 2);
      carve(nx - h, nz - h, nx - h + ns, nz - h + ns);
      if (ns > 6) segs.push({ room: true, x0: nx - h, z0: nz - h, x1: nx - h + ns, z1: nz - h + ns, gi, gj });
      // east edge
      if (netEdge(P, 'e', gi, gj)) {
        const w = netEdgeWidth(P, 'e', gi, gj);
        const hw = Math.floor(w / 2);
        carve(nx, nz - hw, nx + U, nz - hw + w);
        segs.push({ axis: 'x', x0: nx, z0: nz - hw, x1: nx + U, z1: nz - hw + w, gi, gj });
      }
      // north edge
      if (netEdge(P, 'n', gi, gj)) {
        const w = netEdgeWidth(P, 'n', gi, gj);
        const hw = Math.floor(w / 2);
        carve(nx - hw, nz, nx - hw + w, nz + U);
        segs.push({ axis: 'z', x0: nx - hw, z0: nz, x1: nx - hw + w, z1: nz + U, gi, gj });
      }
    }
  }
  return segs;
}

/**
 * Straight runs of wall faces inside the chunk.
 * Returns [{ lx, lz, dx, dz, len }] where (lx, lz) is the first open cell
 * of the run, (dx, dz) points into the wall and the run extends along +x
 * (for walls facing z) or +z (for walls facing x).
 */
export function wallRuns(L, minLen = 3, blockMask = F_SOLID | F_BLOCK | F_GLITCH) {
  const runs = [];
  const open = (x, z) => x >= 0 && z >= 0 && x < CN && z < CN && !(L.flags[z * CN + x] & blockMask);
  const solid = (x, z) => x < 0 || z < 0 || x >= CN || z >= CN || (L.flags[z * CN + x] & F_SOLID) !== 0;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const alongX = dz !== 0;
    for (let a = 0; a < CN; a++) {
      let start = -1;
      for (let b = 0; b <= CN; b++) {
        const x = alongX ? b : a;
        const z = alongX ? a : b;
        const ok = b < CN && open(x, z) && solid(x + dx, z + dz) && x + dx >= 0 && z + dz >= 0 && x + dx < CN && z + dz < CN;
        if (ok && start < 0) start = b;
        if (!ok && start >= 0) {
          const len = b - start;
          if (len >= minLen) runs.push({ lx: alongX ? start : a, lz: alongX ? a : start, dx, dz, len });
          start = -1;
        }
      }
    }
  }
  return runs;
}
