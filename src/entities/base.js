// Entity framework: shared movement, perception and a Dijkstra flow
// field toward the player that every hunting entity can descend.

import * as THREE from 'three';
import { CELL, F_SOLID, F_BLOCK, F_GLITCH, F_NOAI, F_VOID } from '../world/layout.js';
import { objectMaterial } from '../world/materials.js';
import { clamp } from '../core/rng.js';

const BLOCK = F_SOLID | F_BLOCK | F_GLITCH | F_NOAI | F_VOID;

/** BFS distance field (in cells) toward a target, around the target. */
export class FlowField {
  constructor(world, size = 170) {
    this.world = world;
    this.S = size;
    this.dist = new Uint16Array(size * size);
    this.queue = new Int32Array(size * size);
    this.ox = 0;
    this.oz = 0;
    this.valid = false;
  }

  walkable(gx, gz) {
    return (this.world.flagsG(gx, gz) & BLOCK) === 0;
  }

  compute(tx, tz) {
    const S = this.S;
    const gx0 = Math.floor(tx / CELL);
    const gz0 = Math.floor(tz / CELL);
    this.ox = gx0 - (S >> 1);
    this.oz = gz0 - (S >> 1);
    const dist = this.dist;
    dist.fill(65535);
    const pass = new Uint8Array(S * S);
    const w = this.world;
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        pass[z * S + x] = (w.flagsG(this.ox + x, this.oz + z) & BLOCK) === 0 ? 1 : 0;
      }
    }
    w.lastLayout = null;
    const q = this.queue;
    let head = 0;
    let tail = 0;
    const start = (S >> 1) * S + (S >> 1);
    dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const i = q[head++];
      const d = dist[i] + 1;
      const x = i % S;
      const z = (i / S) | 0;
      if (x > 0 && pass[i - 1] && dist[i - 1] > d) {
        dist[i - 1] = d;
        q[tail++] = i - 1;
      }
      if (x < S - 1 && pass[i + 1] && dist[i + 1] > d) {
        dist[i + 1] = d;
        q[tail++] = i + 1;
      }
      if (z > 0 && pass[i - S] && dist[i - S] > d) {
        dist[i - S] = d;
        q[tail++] = i - S;
      }
      if (z < S - 1 && pass[i + S] && dist[i + S] > d) {
        dist[i + S] = d;
        q[tail++] = i + S;
      }
    }
    this.pass = pass;
    this.valid = true;
  }

  at(gx, gz) {
    const x = gx - this.ox;
    const z = gz - this.oz;
    if (x < 0 || z < 0 || x >= this.S || z >= this.S) return 65535;
    return this.dist[z * this.S + x];
  }

  /** World-space direction of steepest descent from a position (or null). */
  dir(px, pz) {
    const gx = Math.floor(px / CELL);
    const gz = Math.floor(pz / CELL);
    let best = this.at(gx, gz);
    if (best === 65535) {
      // we may be standing in an impassable sliver; look around a bit
      best = 65534;
    }
    let bx = 0;
    let bz = 0;
    // look two cells ahead for smoother paths
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dz) continue;
        const d = this.at(gx + dx, gz + dz);
        if (d === 65535) continue;
        // prefer genuine progress, normalised by step length
        const cost = d + Math.hypot(dx, dz) * 0.35;
        if (cost < best + (Math.abs(dx) + Math.abs(dz) > 2 ? -0.5 : 0)) {
          // make sure the straight hop isn't through a wall corner
          if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
            if (this.at(gx + Math.sign(dx), gz + Math.sign(dz)) === 65535) continue;
          }
          if (dx && dz && (this.at(gx + Math.sign(dx), gz) === 65535 || this.at(gx, gz + Math.sign(dz)) === 65535)) continue;
          best = cost;
          bx = dx;
          bz = dz;
        }
      }
    }
    if (!bx && !bz) return null;
    const l = Math.hypot(bx, bz);
    return [bx / l, bz / l];
  }
}

export class Entity {
  constructor(game, x, z, opts = {}) {
    this.game = game;
    this.world = game.world;
    this.x = x;
    this.z = z;
    this.y = game.world.floorG(Math.floor(x / CELL), Math.floor(z / CELL));
    this.yaw = 0;
    this.vx = 0;
    this.vz = 0;
    this.radius = opts.radius ?? 0.3;
    this.obj = new THREE.Group();
    this.mats = [];
    this.dead = false;
    this.lightT = 0;
    this.age = 0;
    this.stateT = 0;
    this.state = 'idle';
    this.name = opts.name || 'entity';
    this.lastSeenT = 99;
    this.lastSeen = null;
    this.hitCooldown = 0;
    this._l = [0, 0, 0];
    this.disturb = 0; // light flicker radius
  }

  mat(opts) {
    const m = objectMaterial(opts);
    this.mats.push(m);
    return m;
  }

  setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.stateT = 0;
    }
  }

  get player() {
    return this.game.player;
  }

  distToPlayer() {
    const p = this.player;
    return Math.hypot(p.x - this.x, p.z - this.z);
  }

  /** Line of sight to the player (walls only) within range. */
  seesPlayer(range = 30, fovCos = -1) {
    const p = this.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (fovCos > -1) {
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      if ((dx * fx + dz * fz) / (d || 1) < fovCos) return false;
    }
    return this.world.los(this.x, this.z, p.x, p.z);
  }

  /** Is the player looking at this entity? returns cosine of view angle (or -1). */
  playerLookCos(heightOff = 1.2) {
    const g = this.game;
    const cam = g.camera;
    const dx = this.x - cam.position.x;
    const dy = this.y + heightOff - cam.position.y;
    const dz = this.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const f = g.camForward;
    return (dx * f.x + dy * f.y + dz * f.z) / d;
  }

  /** Is the player's flashlight shining on this entity? */
  litByFlashlight(heightOff = 1.2) {
    const p = this.player;
    if (!p.flashlight || p.battery <= 0) return false;
    return this.playerLookCos(heightOff) > 0.95 && this.distToPlayer() < 16 && this.seesPlayer(18);
  }

  turnTo(tx, tz, dt, rate = 6) {
    const want = Math.atan2(-(tx - this.x), -(tz - this.z));
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -rate * dt, rate * dt);
  }

  /** Move with a desired direction and speed, colliding with the grid. */
  move(dx, dz, speed, dt, accel = 8) {
    const tvx = dx * speed;
    const tvz = dz * speed;
    this.vx += (tvx - this.vx) * Math.min(1, dt * accel);
    this.vz += (tvz - this.vz) * Math.min(1, dt * accel);
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.12));
    for (let i = 0; i < steps; i++) {
      this.x += (this.vx * dt) / steps;
      this.z += (this.vz * dt) / steps;
      this.resolve();
    }
    const fy = this.world.floorG(Math.floor(this.x / CELL), Math.floor(this.z / CELL));
    if (fy > -50) this.y += (fy - this.y) * Math.min(1, dt * 10);
  }

  resolve() {
    const r = this.radius;
    const w = this.world;
    for (let it = 0; it < 2; it++) {
      const gx0 = Math.floor((this.x - r) / CELL);
      const gx1 = Math.floor((this.x + r) / CELL);
      const gz0 = Math.floor((this.z - r) / CELL);
      const gz1 = Math.floor((this.z + r) / CELL);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (!(w.flagsG(gx, gz) & (F_SOLID | F_BLOCK | F_GLITCH | F_VOID))) continue;
          const minX = gx * CELL;
          const minZ = gz * CELL;
          const cx = clamp(this.x, minX, minX + CELL);
          const cz = clamp(this.z, minZ, minZ + CELL);
          let dx = this.x - cx;
          let dz = this.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-9) {
            this.x += (Math.random() - 0.5) * 0.05;
            this.z += (Math.random() - 0.5) * 0.05;
            continue;
          }
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          this.x += dx * (r - d);
          this.z += dz * (r - d);
        }
      }
    }
  }

  /** Follow the shared flow field toward the player; falls back to direct steering. */
  chase(speed, dt) {
    const p = this.player;
    const g = this.game;
    const direct = this.distToPlayer() < 6 && this.world.los(this.x, this.z, p.x, p.z);
    let dir = null;
    if (direct) {
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const l = Math.hypot(dx, dz) || 1;
      dir = [dx / l, dz / l];
    } else {
      g.entities.needField = true;
      const f = g.entities.field;
      if (f.valid) dir = f.dir(this.x, this.z);
      if (!dir) {
        const dx = p.x - this.x;
        const dz = p.z - this.z;
        const l = Math.hypot(dx, dz) || 1;
        dir = [dx / l, dz / l];
      }
    }
    this.move(dir[0], dir[1], speed, dt);
    this.turnTo(this.x + dir[0], this.z + dir[1], dt, 8);
    return dir;
  }

  /** Walk toward a world point using a local flow toward it (straight with wall sliding). */
  goTo(tx, tz, speed, dt) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) return true;
    // probe for walls ahead and steer around them
    let ax = dx / l;
    let az = dz / l;
    const ahead = this.world.rayDist(this.x, this.z, ax, az, 1.2);
    if (ahead < 0.9) {
      const best = this.bestOpenDir(ax, az);
      if (best) {
        ax = best[0];
        az = best[1];
      }
    }
    this.move(ax, az, speed, dt);
    this.turnTo(this.x + ax, this.z + az, dt, 5);
    return false;
  }

  bestOpenDir(ax, az) {
    let best = null;
    let bs = -1e9;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const free = this.world.rayDist(this.x, this.z, cx, cz, 4);
      const s = free + (cx * ax + cz * az) * 2;
      if (s > bs) {
        bs = s;
        best = [cx, cz];
      }
    }
    return best;
  }

  wander(dt, speed = 0.9) {
    if (!this.wanderT || this.wanderT <= 0 || !this.wanderDir) {
      this.wanderT = 2 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      this.wanderDir = [Math.cos(a), Math.sin(a)];
    }
    this.wanderT -= dt;
    const [ax, az] = this.wanderDir;
    if (this.world.rayDist(this.x, this.z, ax, az, 1.0) < 0.8) {
      this.wanderDir = this.bestOpenDir(-az, ax) || [-ax, -az];
    }
    this.move(this.wanderDir[0], this.wanderDir[1], speed, dt, 3);
    this.turnTo(this.x + this.wanderDir[0], this.z + this.wanderDir[1], dt, 2.5);
  }

  updateLight(dt) {
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.12;
    const l = this.world.lightAt(this.x, this.y + 1.2, this.z, this._l);
    for (const m of this.mats) m.uniforms.uObjLight.value.set(l[0], l[1], l[2]);
    this.light = ((l[0] + l[1] + l[2]) / 3) * this.game.lightScale;
  }

  sync() {
    this.obj.position.set(this.x, this.y, this.z);
    this.obj.rotation.y = this.yaw;
  }

  /** Called every frame by the manager. */
  tick(dt) {
    this.age += dt;
    this.stateT += dt;
    this.hitCooldown -= dt;
    this.update(dt);
    this.updateLight(dt);
    this.sync();
  }

  update() {}

  sound(name, opts = {}) {
    this.game.audio.play(name, { pos: [this.x, this.y + 1.2, this.z], ...opts });
  }

  hitPlayer(dmg, cause) {
    if (this.hitCooldown > 0) return false;
    this.hitCooldown = 1.3;
    this.game.hurtPlayer(dmg, cause, this);
    return true;
  }

  remove() {
    this.dead = true;
  }

  /** Free per-entity GPU resources (the model's geometry is shared between clones). */
  dispose() {
    if (this.inst) {
      this.inst.mixer.stopAllAction();
      this.inst.mixer.uncacheRoot(this.inst.root);
      const seen = new Set();
      this.inst.root.traverse((o) => {
        if (o.isSkinnedMesh && !seen.has(o.skeleton)) {
          seen.add(o.skeleton);
          o.skeleton.dispose();
        }
      });
    }
    for (const m of this.mats) m.dispose();
  }
}

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.field = new FlowField(game.world);
    this.fieldT = 0;
    this.needField = false;
  }

  add(e) {
    this.list.push(e);
    this.group.add(e.obj);
    return e;
  }

  clear() {
    for (const e of this.list) {
      this.group.remove(e.obj);
      e.dispose();
    }
    this.list.length = 0;
    this.field.valid = false;
  }

  count(name) {
    let n = 0;
    for (const e of this.list) if (e.name === name && !e.dead) n++;
    return n;
  }

  update(dt) {
    const p = this.game.player;
    this.fieldT -= dt;
    if (this.needField && this.fieldT <= 0) {
      this.fieldT = 0.3;
      this.field.compute(p.x, p.z);
      this.needField = false;
    }
    const disturb = [];
    for (const e of this.list) {
      if (e.dead) continue;
      e.tick(dt);
      if (e.disturb > 0) disturb.push(e);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) {
        this.group.remove(e.obj);
        e.dispose();
        this.list.splice(i, 1);
      }
    }
    // nearest light-disturbing entities drive the flicker uniforms
    disturb.sort((a, b) => a.distToPlayer() - b.distToPlayer());
    return disturb.slice(0, 2);
  }
}

// ---------------------------------------------------------------- model helpers

export function sphere(r, mat, seg = 10) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat);
}
