// Streaming chunk world: generates layouts on demand, builds and bakes
// chunk meshes around the player, and answers spatial queries for
// physics, AI and lighting probes.

import * as THREE from 'three';
import { CN, CELL, CHUNK, F_SOLID, F_BLOCK, F_GLITCH, F_VOID, F_WATER, chunkKey } from './layout.js';
import { isDynamicFixture, sampleAmbient } from './bake.js';
import { buildChunkData, makeLayout } from './chunkbuild.js';
import ChunkWorker from './chunkWorker.js?worker&inline';
import { FixtureSystem } from './fixtures.js';
import { worldMaterial } from './materials.js';
import { getTexture } from './textures.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.layouts = new Map();
    this.chunks = new Map();
    this.fixtures = new FixtureSystem();
    this.level = null;
    this.seed = 1;
    this.loadRadius = 2;
    this.buildBudgetMs = 10;
    this.lastLayout = null;
    this.stats = { lastBuildMs: 0, chunks: 0 };
    this.onChunkBuilt = null;
    this.onChunkRemoved = null;
  }

  setLevel(level, seed) {
    this.clear();
    this.level = level;
    this.seed = seed;
    this.cfg = level.config;
    this.materials = [];
    this.matSizes = [];
    for (const def of level.materials) {
      const tex = getTexture(def.tex || 'white');
      const sc = def.scale || 1;
      this.matSizes.push({ w: tex.userData.worldW * sc, h: tex.userData.worldH * sc });
      this.materials.push(worldMaterial(def));
    }
    this.fixtureMaterial = worldMaterial({ ...(level.fixtureMaterial || {}), tex: level.fixtureMaterial?.tex || 'troffer', fixture: true, grime: [0, 0, 1, 1] });
    this.startStreaming();
  }

  clear() {
    if (this.pending) this.pending.clear();
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.layouts.clear();
    this.lastLayout = null;
    this.fixtures.clear();
  }

  // ------------------------------------------------------------------ layouts

  getLayout(cx, cz) {
    const L0 = this.lastLayout;
    if (L0 && L0.cx === cx && L0.cz === cz) return L0;
    const key = chunkKey(cx, cz);
    let L = this.layouts.get(key);
    if (!L) {
      L = makeLayout(this.level, cx, cz, this.seed);
      this.layouts.set(key, L);
    }
    this.lastLayout = L;
    return L;
  }

  cellIndex(gx, gz) {
    const cx = Math.floor(gx / CN);
    const cz = Math.floor(gz / CN);
    const L = this.getLayout(cx, cz);
    return { L, i: (gz - cz * CN) * CN + (gx - cx * CN) };
  }

  flagsG(gx, gz) {
    const cx = Math.floor(gx / CN);
    const cz = Math.floor(gz / CN);
    const L = this.getLayout(cx, cz);
    return L.flags[(gz - cz * CN) * CN + (gx - cx * CN)];
  }

  flagsAt(x, z) {
    return this.flagsG(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  blocksMoveG(gx, gz) {
    return (this.flagsG(gx, gz) & (F_SOLID | F_BLOCK | F_GLITCH)) !== 0;
  }

  opaqueG(gx, gz) {
    return (this.flagsG(gx, gz) & (F_SOLID | F_GLITCH)) !== 0;
  }

  floorG(gx, gz) {
    const { L, i } = this.cellIndex(gx, gz);
    if (L.flags[i] & F_VOID) return -100;
    return L.floorY[i];
  }

  ceilG(gx, gz) {
    const { L, i } = this.cellIndex(gx, gz);
    return L.ceilY[i];
  }

  waterG(gx, gz) {
    const { L, i } = this.cellIndex(gx, gz);
    if (!L.waterY || !(L.flags[i] & F_WATER)) return -999;
    return L.waterY[i];
  }

  zoneAt(x, z) {
    const { L, i } = this.cellIndex(Math.floor(x / CELL), Math.floor(z / CELL));
    return L.zone[i];
  }

  /** 2D line of sight through walls. */
  los(x0, z0, x1, z1) {
    const inv = 1 / CELL;
    let gx = Math.floor(x0 * inv);
    let gz = Math.floor(z0 * inv);
    const tx = Math.floor(x1 * inv);
    const tz = Math.floor(z1 * inv);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    let tMaxX = adx < 1e-9 ? 1e9 : ((gx + (sx > 0 ? 1 : 0)) * CELL - x0) / dx;
    let tMaxZ = adz < 1e-9 ? 1e9 : ((gz + (sz > 0 ? 1 : 0)) * CELL - z0) / dz;
    const tDX = adx < 1e-9 ? 1e9 : CELL / adx;
    const tDZ = adz < 1e-9 ? 1e9 : CELL / adz;
    for (let n = 0; n < 1024; n++) {
      if (gx === tx && gz === tz) return true;
      if (this.opaqueG(gx, gz)) return false;
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

  /** March a ray in 2D; returns distance to the first opaque cell (or max). */
  rayDist(x0, z0, dx, dz, max) {
    const step = CELL * 0.5;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    for (let t = 0; t < max; t += step) {
      if (this.opaqueG(Math.floor((x0 + dx * t) / CELL), Math.floor((z0 + dz * t) / CELL))) return t;
    }
    return max;
  }

  // ------------------------------------------------------------------ streaming

  initWorkers() {
    if (this.workers) return;
    this.workers = [];
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new ChunkWorker();
        w.busy = 0;
        w.onmessage = (e) => this.onWorkerMessage(w, e.data);
        w.onerror = (e) => {
          console.error('chunk worker error, falling back to main thread', e.message || e);
          this.failWorkers();
        };
        this.workers.push(w);
      }
    } catch (err) {
      console.warn('Workers unavailable, building chunks on the main thread', err);
      this.workers = [];
    }
  }

  failWorkers() {
    this.workersFailed = true;
    if (this.pending) this.pending.clear();
  }

  /** (Re)configure workers for the current level. */
  startStreaming() {
    this.gen = (this.gen || 0) + 1;
    this.pending = new Map();
    this.initWorkers();
    for (const w of this.workers) {
      w.busy = 0;
      w.postMessage({ type: 'init', levelId: this.level.id, seed: this.seed, matSizes: this.matSizes, gen: this.gen });
    }
  }

  onWorkerMessage(w, m) {
    w.busy = Math.max(0, w.busy - 1);
    if (m.type === 'error') {
      console.error('chunk build failed', m.cx, m.cz, m.message);
      if (m.gen === this.gen) this.pending.delete(chunkKey(m.cx, m.cz));
      return;
    }
    const d = m.data;
    if (d.gen !== this.gen) return;
    const k = chunkKey(d.cx, d.cz);
    if (!this.pending.has(k)) return;
    this.pending.delete(k);
    this.stats.lastBuildMs = d.ms;
    // drop chunks that are already too far away
    const R = this.loadRadius + 1;
    if (this.focus && (Math.abs(d.cx - this.focus[0]) > R || Math.abs(d.cz - this.focus[1]) > R)) return;
    this.addChunk(d);
  }

  update(px, pz, force = false) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    this.focus = [pcx, pcz];
    const R = this.loadRadius;
    // unload far chunks
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > R + 1 || Math.abs(c.cz - pcz) > R + 1) {
        this.disposeChunk(c);
        this.chunks.delete(k);
      }
    }
    if (this.pending) {
      for (const [k, p] of this.pending) {
        if (Math.abs(p.cx - pcx) > R + 1 || Math.abs(p.cz - pcz) > R + 1) this.pending.delete(k);
      }
    }
    // evict far layouts
    if (this.layouts.size > (R * 2 + 6) ** 2) {
      for (const [k, L] of this.layouts) {
        if (Math.abs(L.cx - pcx) > R + 3 || Math.abs(L.cz - pcz) > R + 3) this.layouts.delete(k);
      }
      this.lastLayout = null;
    }
    // collect missing chunks, nearest first
    const missing = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const k = chunkKey(cx, cz);
        if (this.chunks.has(k) || (this.pending && this.pending.has(k))) continue;
        const ccx = (cx + 0.5) * CHUNK;
        const ccz = (cz + 0.5) * CHUNK;
        missing.push({ cx, cz, k, d: Math.hypot(ccx - px, ccz - pz) });
      }
    }
    // watchdog: a worker that never answers (blocked by CSP etc.)
    if (this.pending && !this.workersFailed) {
      for (const p of this.pending.values()) {
        if (p.sent && performance.now() - p.sent > 8000) {
          console.warn('chunk worker timed out, falling back to main thread');
          this.failWorkers();
          break;
        }
      }
    }
    if (!missing.length) return this.pending ? this.pending.size : 0;
    missing.sort((a, b) => a.d - b.d);
    const useWorkers = this.workers && this.workers.length && !this.workersFailed && !force;
    if (useWorkers) {
      for (const m of missing) {
        // pick least busy worker; keep at most 2 jobs per worker queued
        let best = null;
        for (const w of this.workers) if (!best || w.busy < best.busy) best = w;
        if (best.busy >= 2) break;
        best.busy++;
        m.sent = performance.now();
        this.pending.set(m.k, m);
        best.postMessage({ type: 'build', cx: m.cx, cz: m.cz, gen: this.gen });
      }
      return missing.length + this.pending.size;
    }
    // synchronous fallback
    const t0 = performance.now();
    let built = 0;
    for (const m of missing) {
      if (!force && built > 0 && performance.now() - t0 > this.buildBudgetMs) break;
      const { data } = buildChunkData((x, z) => this.getLayout(x, z), this.level, m.cx, m.cz, this.matSizes);
      this.lastLayout = null;
      this.addChunk(data);
      built++;
    }
    this.stats.lastBuildMs = performance.now() - t0;
    return missing.length - built;
  }

  /** Number of chunks within radius r of the point that are not built yet. */
  missingNear(px, pz, r = 1) {
    const pcx = Math.floor(px / CHUNK);
    const pcz = Math.floor(pz / CHUNK);
    let n = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (!this.chunks.has(chunkKey(pcx + dx, pcz + dz))) n++;
    return n;
  }

  addChunk(d) {
    const key = chunkKey(d.cx, d.cz);
    if (this.chunks.has(key)) return;
    const chunk = { cx: d.cx, cz: d.cz, meshes: [], slotKeys: [], ambient: d.ambient, layout: this.getLayout(d.cx, d.cz) };
    // resolve dynamic fixture keys to texture slots
    const slots = new Float32Array(d.dynKeys.length);
    for (let i = 0; i < d.dynKeys.length; i++) {
      const fk = d.dynKeys[i];
      const [fx, fz, fi] = fk.split(',').map(Number);
      const f = this.getLayout(fx, fz).fixtures[fi];
      const s = f ? this.fixtures.acquire(f) : -1;
      slots[i] = s;
      if (s >= 0) chunk.slotKeys.push(fk);
    }
    this.lastLayout = null;
    const remap = (arr, wArr) => {
      for (let i = 0; i < arr.length; i++) {
        const j = arr[i];
        if (j >= 0) {
          const s = slots[j];
          arr[i] = s;
          if (s < 0 && wArr) wArr[i] = 0;
        }
      }
    };
    for (const m of d.meshes) {
      remap(m.dynI, m.dynW);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(m.nrm, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
      geo.setAttribute('aStatic', new THREE.BufferAttribute(m.stat, 3));
      geo.setAttribute('aDynW', new THREE.BufferAttribute(m.dynW, 4));
      geo.setAttribute('aDynI', new THREE.BufferAttribute(m.dynI, 4));
      geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
      let mat;
      if (m.emit) {
        remap(m.fix, null);
        geo.setAttribute('aEmit', new THREE.BufferAttribute(m.emit, 3));
        geo.setAttribute('aFix', new THREE.BufferAttribute(m.fix, 1));
        mat = this.fixtureMaterial;
      } else {
        const slot = parseInt(m.key.slice(1), 10);
        mat = this.materials[slot] || this.materials[0];
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      chunk.meshes.push(mesh);
    }
    this.chunks.set(key, chunk);
    this.stats.chunks = this.chunks.size;
    if (this.onChunkBuilt) this.onChunkBuilt(chunk);
  }

  disposeChunk(c) {
    for (const m of c.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    for (const k of c.slotKeys) this.fixtures.release(k);
    if (this.onChunkRemoved) this.onChunkRemoved(c);
  }

  isChunkReady(x, z) {
    return this.chunks.has(chunkKey(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }

  // ------------------------------------------------------------------ lighting probe

  /** Approximate light arriving at a point (for entities/items). */
  lightAt(x, y, z, out = [0, 0, 0]) {
    out[0] = out[1] = out[2] = 0;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const L = this.getLayout(cx + dx, cz + dz);
        for (const f of L.fixtures) {
          if (f.mode === 'off' || !f.power) continue;
          const lx = f.x - x;
          const ly = f.y - y;
          const lz = f.z - z;
          const d2 = lx * lx + ly * ly + lz * lz;
          const rad = f.radius || 8;
          if (d2 > rad * rad) continue;
          const d = Math.sqrt(d2) + 1e-6;
          const dir = f.dir || [0, -1, 0];
          const om = f.omni ?? 0.12;
          let ce = -(lx * dir[0] + ly * dir[1] + lz * dir[2]) / d;
          ce = om + (1 - om) * Math.max(0, ce);
          let win = 1 - (d2 / (rad * rad)) ** 2;
          win *= win;
          let w = (ce * win) / (d2 + (f.soft ?? 0.7));
          if (w < 1e-4) continue;
          if (!this.los(x, z, f.x, f.z)) continue;
          if (isDynamicFixture(f)) {
            const e = this.fixtures.byKey.get(f.key);
            w *= e ? e.last : 1;
          }
          out[0] += f.color[0] * f.power * w;
          out[1] += f.color[1] * f.power * w;
          out[2] += f.color[2] * f.power * w;
        }
      }
    }
    this.lastLayout = null;
    const ch = this.chunks.get(chunkKey(cx, cz));
    if (ch && ch.ambient) {
      const a = sampleAmbient(ch.ambient, x, z);
      const ac = this.cfg.ambientColor || [1, 1, 1];
      out[0] += a * ac[0];
      out[1] += a * ac[1];
      out[2] += a * ac[2];
    }
    const am = this.cfg.ambientMin || [0, 0, 0];
    out[0] += am[0];
    out[1] += am[1];
    out[2] += am[2];
    return out;
  }

  /** Fixtures near a point that are currently on (for audio hum). */
  nearbyFixtures(x, z, radius, out = []) {
    out.length = 0;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const L = this.getLayout(cx + dx, cz + dz);
        for (const f of L.fixtures) {
          if (f.mode === 'off') continue;
          const ddx = f.x - x;
          const ddz = f.z - z;
          if (ddx * ddx + ddz * ddz < radius * radius) out.push(f);
        }
      }
    }
    this.lastLayout = null;
    return out;
  }
}

export { CELL, CHUNK, CN };
