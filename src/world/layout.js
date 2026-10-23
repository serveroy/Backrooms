// Chunk layout: the pure data a level generator produces for one chunk.
// The world is a grid of 0.3m cells grouped into 64x64-cell chunks (19.2m).

export const CELL = 0.3;
export const CN = 64; // cells per chunk side
export const CHUNK = CELL * CN; // 19.2m

// cell flags
export const F_SOLID = 1; // full-height wall: blocks movement + light
export const F_BLOCK = 2; // blocks movement only (props, furniture)
export const F_WATER = 4; // water surface present (see waterY)
export const F_VOID = 8; // no floor: a pit / drop
export const F_NOCEIL = 16; // no ceiling quad emitted
export const F_NOAI = 32; // entities avoid
export const F_GLITCH = 64; // solid but noclip-able wall (exit)
export const F_KEEP = 128; // generator internal: protected from carving

export class ChunkLayout {
  constructor(cx, cz, defaults) {
    this.cx = cx;
    this.cz = cz;
    const n = CN * CN;
    this.flags = new Uint8Array(n);
    this.floorY = new Float32Array(n).fill(defaults.floorY ?? 0);
    this.ceilY = new Float32Array(n).fill(defaults.ceilY ?? 2.7);
    this.waterY = null; // Float32Array when the level has water
    this.matF = new Uint8Array(n); // floor material slot
    this.matC = new Uint8Array(n); // ceiling material slot
    this.matW = new Uint8Array(n); // wall material slot (for solid cells)
    this.zone = new Uint8Array(n); // level specific region tags
    this.fixtures = []; // light fixtures
    this.props = []; // static decoration
    this.items = []; // pickups
    this.exits = []; // level exits
    this.spawns = []; // entity spawn hints
    this.notes = []; // lore note positions
    this.interact = []; // interactable points (doors, coolers, crates...)
  }
  idx(lx, lz) {
    return lz * CN + lx;
  }
  inside(lx, lz) {
    return lx >= 0 && lz >= 0 && lx < CN && lz < CN;
  }
  get(lx, lz) {
    return this.flags[lz * CN + lx];
  }
  set(lx, lz, f) {
    if (lx < 0 || lz < 0 || lx >= CN || lz >= CN) return;
    this.flags[lz * CN + lx] = f;
  }
  or(lx, lz, f) {
    if (lx < 0 || lz < 0 || lx >= CN || lz >= CN) return;
    this.flags[lz * CN + lx] |= f;
  }
  clear(lx, lz, f) {
    if (lx < 0 || lz < 0 || lx >= CN || lz >= CN) return;
    this.flags[lz * CN + lx] &= ~f;
  }
  /** Fill rect (inclusive-exclusive) with flags. */
  rect(x0, z0, x1, z1, f, mode = 'set') {
    for (let z = Math.max(0, z0); z < Math.min(CN, z1); z++) {
      for (let x = Math.max(0, x0); x < Math.min(CN, x1); x++) {
        const i = z * CN + x;
        if (mode === 'set') this.flags[i] = f;
        else if (mode === 'or') this.flags[i] |= f;
        else if (mode === 'clear') this.flags[i] &= ~f;
      }
    }
  }
  fillArr(arr, x0, z0, x1, z1, v) {
    for (let z = Math.max(0, z0); z < Math.min(CN, z1); z++) {
      for (let x = Math.max(0, x0); x < Math.min(CN, x1); x++) arr[z * CN + x] = v;
    }
  }
  ensureWater() {
    if (!this.waterY) this.waterY = new Float32Array(CN * CN).fill(-999);
    return this.waterY;
  }
  /** World coordinates of a local cell center. */
  wx(lx) {
    return (this.cx * CN + lx + 0.5) * CELL;
  }
  wz(lz) {
    return (this.cz * CN + lz + 0.5) * CELL;
  }
}

export function chunkKey(cx, cz) {
  return (cx + 32768) * 65536 + (cz + 32768);
}

export function worldToCell(v) {
  return Math.floor(v / CELL);
}

export function cellToChunk(g) {
  return Math.floor(g / CN);
}
