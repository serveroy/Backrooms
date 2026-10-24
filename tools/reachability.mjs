// BFS from each level's spawn: reachable area and distance to nearest exits.
// node tools/reachability.mjs [levelId] [seeds]
import { makeLayout } from '../src/world/chunkbuild.js';
import { chunkKey, CN, CELL, F_SOLID, F_BLOCK, F_GLITCH, F_VOID } from '../src/world/layout.js';
import { getLevel, LEVELS } from '../src/levels/index.js';

const ids = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : Object.keys(LEVELS);
const nSeeds = +(process.argv[3] || 4);
const R = 4; // chunks radius => ~77m
for (const id of ids) {
  const level = getLevel(id);
  const results = [];
  for (let si = 0; si < nSeeds; si++) {
    const seed = 1000 + si * 7919;
    const layouts = new Map();
    const getL = (cx, cz) => {
      const k = chunkKey(cx, cz);
      if (!layouts.has(k)) layouts.set(k, makeLayout(level, cx, cz, seed));
      return layouts.get(k);
    };
    const S = (2 * R + 1) * CN;
    const o = -R * CN;
    const cell = (gx, gz) => {
      const cx = Math.floor(gx / CN);
      const cz = Math.floor(gz / CN);
      const L = getL(cx, cz);
      const i = (gz - cz * CN) * CN + (gx - cx * CN);
      return { f: L.flags[i], y: L.floorY[i], L };
    };
    const sp = level.spawnPoint(seed);
    const sx = Math.floor(sp.x / CELL);
    const sz = Math.floor(sp.z / CELL);
    const dist = new Int32Array(S * S).fill(-1);
    const q = [];
    const startOk = !(cell(sx, sz).f & (F_SOLID | F_BLOCK));
    dist[(sz - o) * S + (sx - o)] = 0;
    q.push([sx, sz]);
    let head = 0;
    while (head < q.length) {
      const [x, z] = q[head++];
      const d = dist[(z - o) * S + (x - o)];
      const cy = cell(x, z).y;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < o || nz < o || nx >= o + S || nz >= o + S) continue;
        const k = (nz - o) * S + (nx - o);
        if (dist[k] >= 0) continue;
        const c = cell(nx, nz);
        if (c.f & (F_SOLID | F_BLOCK)) {
          if (c.f & F_GLITCH) dist[k] = d + 1; // reachable glitch exit
          continue;
        }
        if (c.f & F_GLITCH) {
          dist[k] = d + 1;
          continue;
        }
        if (c.y > cy + 0.45 && c.y > -0.5) continue; // too high to step up (water lets you swim up)
        dist[k] = d + 1;
        q.push([nx, nz]);
      }
    }
    let reach = 0;
    for (const v of dist) if (v >= 0) reach++;
    const exits = [];
    for (const L of layouts.values()) {
      for (const e of L.exits) {
        const gx = Math.floor(e.x / CELL);
        const gz = Math.floor(e.z / CELL);
        let best = -1;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const k = (gz + dz - o) * S + (gx + dx - o);
          if (k >= 0 && k < dist.length && dist[k] >= 0 && (best < 0 || dist[k] < best)) best = dist[k];
        }
        if (best >= 0) exits.push({ t: e.target, d: +(best * CELL).toFixed(0) });
      }
    }
    exits.sort((a, b) => a.d - b.d);
    results.push({ seed, startOk, reachM2: Math.round(reach * CELL * CELL), exits: exits.slice(0, 3).map((e) => `${e.t}@${e.d}m`).join(' ') || 'NONE' });
  }
  console.log(id);
  for (const r of results) console.log('  ', JSON.stringify(r));
}
