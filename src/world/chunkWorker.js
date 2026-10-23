// Web Worker: builds chunk meshes + baked lighting off the main thread.
import { buildChunkData, makeLayout } from './chunkbuild.js';
import { chunkKey } from './layout.js';
import { getLevel } from '../levels/index.js';

let level = null;
let seed = 1;
let matSizes = [];
let gen = 0;
const layouts = new Map();

function getLayout(cx, cz) {
  const k = chunkKey(cx, cz);
  let L = layouts.get(k);
  if (!L) {
    L = makeLayout(level, cx, cz, seed);
    layouts.set(k, L);
    if (layouts.size > 120) {
      // drop the oldest entries
      const it = layouts.keys();
      for (let i = 0; i < 40; i++) layouts.delete(it.next().value);
    }
  }
  return L;
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    level = getLevel(m.levelId);
    seed = m.seed;
    matSizes = m.matSizes;
    gen = m.gen;
    layouts.clear();
  } else if (m.type === 'build') {
    if (m.gen !== gen) return;
    const t0 = performance.now();
    try {
      const { data, transfer } = buildChunkData(getLayout, level, m.cx, m.cz, matSizes);
      data.gen = gen;
      data.ms = performance.now() - t0;
      self.postMessage({ type: 'built', data }, transfer);
    } catch (err) {
      self.postMessage({ type: 'error', cx: m.cx, cz: m.cz, gen, message: String(err && err.stack ? err.stack : err) });
    }
  }
};
