// Profiles the chunk build pipeline in Node: node tools/profile-chunks.mjs [levelId] [n]
import { buildChunkData, makeLayout } from '../src/world/chunkbuild.js';
import { chunkKey } from '../src/world/layout.js';
import { Region } from '../src/world/region.js';
import { meshChunk } from '../src/world/mesher.js';
import { prepareFixtures, solveAmbient, bakeBuilder } from '../src/world/bake.js';
import { getLevel } from '../src/levels/index.js';

const level = getLevel(process.argv[2] || 'level0');
const N = +(process.argv[3] || 3);
const seed = 12345;
const layouts = new Map();
const getLayout = (cx, cz) => {
  const k = chunkKey(cx, cz);
  if (!layouts.has(k)) layouts.set(k, makeLayout(level, cx, cz, seed));
  return layouts.get(k);
};
const matSizes = level.materials.map(() => ({ w: 1, h: 1 }));
const T = { layout: 0, region: 0, mesh: 0, ambient: 0, bake: 0, verts: 0 };
let t = performance.now();
for (let z = -N; z <= N; z++) for (let x = -N; x <= N; x++) getLayout(x, z);
T.layout = performance.now() - t;
let count = 0;
for (let z = -N + 1; z < N; z++) {
  for (let x = -N + 1; x < N; x++) {
    count++;
    t = performance.now();
    const R = new Region(getLayout, x, z);
    T.region += performance.now() - t;
    t = performance.now();
    const B = meshChunk(R, getLayout(x, z), matSizes, {});
    T.mesh += performance.now() - t;
    t = performance.now();
    const F = prepareFixtures(R);
    const A = solveAmbient(R, F, level.config);
    T.ambient += performance.now() - t;
    t = performance.now();
    for (const b of B.values()) {
      T.verts += b.count;
      bakeBuilder(R, F, A, level.config, b);
    }
    T.bake += performance.now() - t;
  }
}
for (const k of Object.keys(T)) if (k !== 'layout') T[k] = +(T[k] / count).toFixed(2);
console.log('chunks', count, 'per-chunk avg', T);
t = performance.now();
const d = buildChunkData(getLayout, level, 5, 5, matSizes);
console.log('full buildChunkData', (performance.now() - t).toFixed(1), 'ms', 'meshes', d.data.meshes.length, 'dyn', d.data.dynKeys.length);
