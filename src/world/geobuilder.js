// Minimal growable geometry builder used by the mesher and prop builders.

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.ao = [];
    this.idx = [];
    this.emit = null; // optional per-vertex emissive rgb (fixtures)
    this.fix = null; // optional per-vertex fixture id
    this.map = new Map();
  }
  get count() {
    return this.pos.length / 3;
  }
  v(x, y, z, nx, ny, nz, u, v, ao = 1) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.ao.push(ao);
    return this.pos.length / 3 - 1;
  }
  /** Deduplicated vertex by numeric key. */
  vk(key, x, y, z, nx, ny, nz, u, v, ao = 1) {
    let i = this.map.get(key);
    if (i === undefined) {
      i = this.v(x, y, z, nx, ny, nz, u, v, ao);
      this.map.set(key, i);
    }
    return i;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  /** Quad from 4 vertex indices in CCW order (seen from front). */
  quad(a, b, c, d) {
    this.idx.push(a, b, c, a, c, d);
  }
  /**
   * Quad from 4 corner positions with explicit normal; winding is fixed up
   * automatically. uvs: array of 4 [u,v]. aos: optional 4 ao values.
   */
  quadP(p, n, uvs, aos) {
    const ax = p[1][0] - p[0][0];
    const ay = p[1][1] - p[0][1];
    const az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0];
    const by = p[2][1] - p[0][1];
    const bz = p[2][2] - p[0][2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const ids = [];
    for (let k = 0; k < 4; k++) {
      ids.push(this.v(p[k][0], p[k][1], p[k][2], n[0], n[1], n[2], uvs[k][0], uvs[k][1], aos ? aos[k] : 1));
    }
    if (flip) this.quad(ids[0], ids[3], ids[2], ids[1]);
    else this.quad(ids[0], ids[1], ids[2], ids[3]);
    return ids;
  }
  /**
   * Append a THREE.BufferGeometry transformed by a Matrix4 (elements array).
   * uvScale lets props use world-ish texture density.
   */
  addGeometry(geo, m, uvScale = [1, 1], uvOffset = [0, 0], ao = 1) {
    const P = geo.attributes.position.array;
    const N = geo.attributes.normal ? geo.attributes.normal.array : null;
    const U = geo.attributes.uv ? geo.attributes.uv.array : null;
    const e = m.elements;
    const base = this.count;
    const n = P.length / 3;
    // normal matrix (assumes uniform-ish scale; normalize after)
    for (let i = 0; i < n; i++) {
      const x = P[i * 3];
      const y = P[i * 3 + 1];
      const z = P[i * 3 + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (N) {
        const ox = N[i * 3];
        const oy = N[i * 3 + 1];
        const oz = N[i * 3 + 2];
        nx = e[0] * ox + e[4] * oy + e[8] * oz;
        ny = e[1] * ox + e[5] * oy + e[9] * oz;
        nz = e[2] * ox + e[6] * oy + e[10] * oz;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
      }
      const u = U ? U[i * 2] * uvScale[0] + uvOffset[0] : 0;
      const v = U ? U[i * 2 + 1] * uvScale[1] + uvOffset[1] : 0;
      this.v(wx, wy, wz, nx, ny, nz, u, v, ao);
    }
    if (geo.index) {
      const I = geo.index.array;
      for (let i = 0; i < I.length; i++) this.idx.push(base + I[i]);
    } else {
      for (let i = 0; i < n; i++) this.idx.push(base + i);
    }
    return base;
  }
}
