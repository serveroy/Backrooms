// Pure chunk build pipeline (layout -> mesh -> bake). Runs inside a Web
// Worker; returns transferable typed arrays only.

import { Region } from './region.js';
import { meshChunk } from './mesher.js';
import { GeoBuilder } from './geobuilder.js';
import { prepareFixtures, solveAmbient, bakeBuilder, isDynamicFixture } from './bake.js';
import { chunkKey } from './layout.js';

/** Generate a layout and tag fixtures with stable keys. */
export function makeLayout(level, cx, cz, seed) {
  const L = level.generate(cx, cz, seed);
  const ck = chunkKey(cx, cz);
  L.fixtures.forEach((f, i) => {
    f.key = `${cx},${cz},${i}`;
    f.chunkKey = ck;
  });
  return L;
}

export function buildChunkData(getLayout, level, cx, cz, matSizes) {
  const cfg = level.config;
  const L = getLayout(cx, cz);
  const region = new Region(getLayout, cx, cz);
  const builders = meshChunk(region, L, matSizes, { soffitMat: level.soffitMat ?? 0, waterMat: level.waterMat ?? 0 });
  const getB = (key) => {
    let b = builders.get(key);
    if (!b) {
      b = new GeoBuilder();
      builders.set(key, b);
    }
    return b;
  };
  if (level.buildProps) level.buildProps(L, (slot) => getB('p' + slot), null);

  const F = prepareFixtures(region);
  const A = solveAmbient(region, F, cfg);

  const dynKeys = [];
  const dynIndex = new Map();
  const local = (f) => {
    let i = dynIndex.get(f.key);
    if (i === undefined) {
      i = dynKeys.length;
      dynKeys.push(f.key);
      dynIndex.set(f.key, i);
    }
    return i;
  };
  const meshes = [];
  const transfer = [];
  const pack = (key, b, r, extra = {}) => {
    const n = b.count;
    const m = {
      key,
      pos: new Float32Array(b.pos),
      nrm: new Float32Array(b.nrm),
      uv: new Float32Array(b.uv),
      stat: r.stat,
      dynW: r.dynW,
      dynI: r.dynI,
      idx: n > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx),
      ...extra,
    };
    transfer.push(m.pos.buffer, m.nrm.buffer, m.uv.buffer, m.stat.buffer, m.dynW.buffer, m.dynI.buffer, m.idx.buffer);
    if (m.emit) transfer.push(m.emit.buffer, m.fix.buffer);
    meshes.push(m);
  };

  for (const [key, b] of builders) {
    if (!b.idx.length) continue;
    const r = bakeBuilder(region, F, A, cfg, b);
    for (let i = 0; i < r.dynI.length; i++) {
      const j = r.dynI[i];
      if (j >= 0) r.dynI[i] = local(F.list[j]);
    }
    pack(key, b, r);
  }

  if (L.fixtures.length && level.buildFixture) {
    const fb = new GeoBuilder();
    fb.emit = [];
    const fix = [];
    for (const f of L.fixtures) {
      const before = fb.count;
      level.buildFixture(f, fb);
      const after = fb.count;
      const on = f.mode !== 'off';
      const s = on && isDynamicFixture(f) ? local(f) : -1;
      for (let v = before; v < after; v++) {
        fix.push(s);
        if (fb.emit[v] === undefined || fb.emit[v] === null) {
          const c = f.emitColor || f.color;
          const k = on ? f.emitPower ?? 4 : 0;
          fb.emit[v] = [c[0] * k, c[1] * k, c[2] * k];
        } else if (!on) {
          fb.emit[v] = [0, 0, 0];
        }
      }
    }
    if (fb.idx.length) {
      const r = bakeBuilder(region, F, A, cfg, fb, { skipVis: true });
      for (let i = 0; i < r.dynI.length; i++) {
        const j = r.dynI[i];
        if (j >= 0) r.dynI[i] = local(F.list[j]);
      }
      const n = fb.count;
      const emit = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        const e = fb.emit[v];
        emit[v * 3] = e[0];
        emit[v * 3 + 1] = e[1];
        emit[v * 3 + 2] = e[2];
      }
      pack('x0', fb, r, { emit, fix: new Float32Array(fix) });
    }
  }

  // keep only the chunk-sized part of the ambient grid for light probes
  const amb = { a: A.a, open: A.open, D: A.D, ox: A.ox, oz: A.oz };
  transfer.push(amb.a.buffer, amb.open.buffer);
  return { data: { cx, cz, meshes, dynKeys, ambient: amb }, transfer };
}
