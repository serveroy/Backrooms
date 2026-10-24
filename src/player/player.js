// First-person player: movement, collision against the cell grid, head
// bob, footsteps, and survival stats.

import { CELL, F_SOLID, F_BLOCK, F_GLITCH } from '../world/layout.js';
import { clamp } from '../core/rng.js';

const STAND_H = 1.72;
const CROUCH_H = 1.08;
const EYE_OFF = 0.1;

export class Player {
  constructor(world) {
    this.world = world;
    this.radius = 0.24;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.height = STAND_H;
    this.crouching = false;
    this.sprinting = false;
    this.onGround = true;
    this.inWater = 0; // water depth at feet
    this.swimming = false;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.stepAcc = 0;
    this.speedNow = 0;
    this.fallSpeed = 0;
    this.sens = 0.0022;
    this.invertY = false;
    this.fovKick = 0;
    this.shake = 0;
    this.leanRoll = 0;
    this.frozen = false;
    this.noclipping = false; // walking through glitch walls
    this.resetStats();
    this.onStep = null; // (surface, intensity)
    this.onLand = null;
  }

  resetStats() {
    this.health = 100;
    this.sanity = 100;
    this.thirst = 100;
    this.stamina = 100;
    this.battery = 100;
    this.exhausted = false;
    this.flashlight = false;
    this.hurtTimer = 99;
    this.staminaDelay = 0;
  }

  get eyeY() {
    return this.y + this.height - EYE_OFF;
  }

  place(x, z, yaw = 0) {
    this.x = x;
    this.z = z;
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    this.y = this.world.floorG(gx, gz);
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw;
    this.pitch = 0;
  }

  look(dx, dy) {
    this.yaw -= dx * this.sens;
    this.pitch -= dy * this.sens * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.45, 1.45);
  }

  /** Cell blocks movement for a body standing at floor y. */
  blocked(gx, gz, y) {
    const w = this.world;
    const f = w.flagsG(gx, gz);
    if (f & (F_SOLID | F_BLOCK)) return true;
    if (f & F_GLITCH) return !this.noclipping;
    const fy = w.floorG(gx, gz);
    if (fy > y + 0.42 && !(this.swimming && fy < w.waterG(gx, gz) + 0.3)) return true;
    const cy = w.ceilG(gx, gz);
    if (cy - Math.max(fy, y) < (this.crouching ? CROUCH_H : STAND_H) + 0.02) return true;
    return false;
  }

  /** Push the player circle out of blocking cells. */
  resolve() {
    const r = this.radius;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const gx0 = Math.floor((this.x - r) / CELL);
      const gx1 = Math.floor((this.x + r) / CELL);
      const gz0 = Math.floor((this.z - r) / CELL);
      const gz1 = Math.floor((this.z + r) / CELL);
      for (let gz = gz0; gz <= gz1; gz++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (!this.blocked(gx, gz, this.y)) continue;
          const minX = gx * CELL;
          const minZ = gz * CELL;
          const cx = clamp(this.x, minX, minX + CELL);
          const cz = clamp(this.z, minZ, minZ + CELL);
          let dx = this.x - cx;
          let dz = this.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-10) {
            // center inside the cell: push out along the shallowest axis
            const ox = Math.min(this.x - minX, minX + CELL - this.x);
            const oz = Math.min(this.z - minZ, minZ + CELL - this.z);
            if (ox < oz) this.x = this.x - minX < CELL / 2 ? minX - r : minX + CELL + r;
            else this.z = this.z - minZ < CELL / 2 ? minZ - r : minZ + CELL + r;
          } else {
            const d = Math.sqrt(d2);
            const push = r - d;
            dx /= d;
            dz /= d;
            this.x += dx * push;
            this.z += dz * push;
            // kill velocity into the wall
            const vn = this.vx * dx + this.vz * dz;
            if (vn < 0) {
              this.vx -= vn * dx;
              this.vz -= vn * dz;
            }
          }
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  groundAt(x, z) {
    // highest floor under the body circle (so we don't sink at pit edges)
    const w = this.world;
    const r = this.radius * 0.6;
    let g = -1e9;
    for (const [ox, oz] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ]) {
      const gx = Math.floor((x + ox) / CELL);
      const gz = Math.floor((z + oz) / CELL);
      const f = w.flagsG(gx, gz);
      if (f & (F_SOLID | F_GLITCH)) continue;
      const fy = w.floorG(gx, gz);
      if (fy <= this.y + 0.45) g = Math.max(g, fy);
    }
    if (g < -1e8) g = w.floorG(Math.floor(x / CELL), Math.floor(z / CELL));
    return g;
  }

  update(dt, input, opts = {}) {
    const moveScale = opts.moveScale ?? 1;
    // ---- input
    let fx = 0;
    let fz = 0;
    if (!this.frozen && input) {
      if (input.is('forward')) fz += 1;
      if (input.is('back')) fz -= 1;
      if (input.is('left')) fx -= 1;
      if (input.is('right')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) {
      fx /= len;
      fz /= len;
    }
    const wantCrouch = !this.frozen && input && input.is('crouch');
    if (wantCrouch) this.crouching = true;
    else if (this.crouching) {
      // stand up only if there's head room
      const gx = Math.floor(this.x / CELL);
      const gz = Math.floor(this.z / CELL);
      if (this.world.ceilG(gx, gz) - this.y > STAND_H + 0.02) this.crouching = false;
    }
    const targetH = this.crouching ? CROUCH_H : STAND_H;
    this.height += (targetH - this.height) * Math.min(1, dt * 10);

    const moving = len > 0.01;
    const canSprint = !this.exhausted && !this.crouching && fz > 0.1 && this.stamina > 0;
    this.sprinting = !!(input && !this.frozen && input.is('sprint') && moving && canSprint);
    let speed = this.crouching ? 1.25 : this.sprinting ? 4.7 : 2.35;
    if (this.inWater > 0.25) speed *= this.swimming ? 0.55 : 0.68;
    if (this.health < 30) speed *= 0.85;
    speed *= moveScale;

    // world-space desired velocity
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // forward is -z rotated by yaw
    const dvx = (fx * c - fz * s) * speed;
    const dvz = (-fx * s - fz * c) * speed;
    const accel = this.onGround || this.swimming ? 11 : 2;
    this.vx += (dvx - this.vx) * Math.min(1, dt * accel);
    this.vz += (dvz - this.vz) * Math.min(1, dt * accel);

    // ---- jump
    if (input && !this.frozen && input.hit('jump') && this.onGround && !this.crouching && !this.swimming) {
      this.vy = 3.4;
      this.onGround = false;
      this.stamina = Math.max(0, this.stamina - 6);
    }

    // ---- integrate horizontal with collision (sub-stepped)
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.1));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.x += this.vx * sdt;
      this.z += this.vz * sdt;
      this.resolve();
    }

    // ---- vertical
    const ground = this.groundAt(this.x, this.z);
    const gx = Math.floor(this.x / CELL);
    const gz = Math.floor(this.z / CELL);
    const wy = this.world.waterG(gx, gz);
    this.inWater = Math.max(0, wy - ground);
    const swimDepth = 1.35;
    this.swimming = this.inWater > swimDepth;
    const wasGround = this.onGround;
    if (this.swimming) {
      // float with the head above the surface
      const target = wy - (this.height - 0.28);
      this.vy += (target - this.y) * dt * 6 - this.vy * dt * 3;
      this.y += this.vy * dt;
      this.onGround = false;
      if (this.y < ground) {
        this.y = ground;
        this.vy = 0;
      }
    } else if (this.y > ground + 0.02 || this.vy > 0) {
      this.vy -= 9.81 * dt;
      if (this.inWater > 0.3) this.vy *= 1 - Math.min(1, dt * 3);
      this.y += this.vy * dt;
      this.onGround = false;
      if (this.y <= ground) {
        const impact = -this.vy;
        this.y = ground;
        this.vy = 0;
        this.onGround = true;
        if (!wasGround && impact > 2.5 && this.onLand) this.onLand(impact);
      }
    } else {
      // step up / down smoothly
      this.y += (ground - this.y) * Math.min(1, dt * 18);
      if (Math.abs(ground - this.y) < 0.003) this.y = ground;
      this.vy = 0;
      this.onGround = true;
    }
    // head vs ceiling
    const ceil = this.world.ceilG(gx, gz);
    if (this.y + this.height > ceil - 0.02 && !this.swimming) {
      if (this.vy > 0) this.vy = 0;
    }

    // ---- head bob + footsteps
    const hs = Math.hypot(this.vx, this.vz);
    this.speedNow = hs;
    if ((this.onGround || this.inWater > 0.2) && hs > 0.3) {
      const stride = this.sprinting ? 0.95 : this.crouching ? 0.55 : 0.78;
      this.stepAcc += hs * dt;
      this.bobPhase += (hs * dt * Math.PI) / stride;
      if (this.stepAcc >= stride) {
        this.stepAcc -= stride;
        if (this.onStep) this.onStep(this.sprinting ? 1.25 : this.crouching ? 0.45 : 0.85);
      }
      this.bobAmt += (Math.min(1, hs / 4) - this.bobAmt) * Math.min(1, dt * 6);
    } else {
      this.bobAmt += (0 - this.bobAmt) * Math.min(1, dt * 4);
    }
    this.fovKick += ((this.sprinting ? 1 : 0) - this.fovKick) * Math.min(1, dt * 4);
    this.shake = Math.max(0, this.shake - dt * 1.5);

    // ---- stamina
    if (this.sprinting) {
      this.stamina -= 15 * dt;
      this.staminaDelay = 1.1;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + (this.crouching ? 16 : 11) * dt * (this.thirst < 20 ? 0.5 : 1));
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    this.hurtTimer += dt;
  }

  /** Camera transform values: eye position + rotation with bob. */
  cameraPose(out) {
    const b = this.bobAmt;
    const ph = this.bobPhase;
    const bobY = Math.abs(Math.sin(ph)) * 0.055 * b - 0.02 * b;
    const bobX = Math.cos(ph) * 0.03 * b;
    const roll = Math.cos(ph) * 0.007 * b + this.leanRoll;
    const sh = this.shake;
    const sx = sh > 0 ? (Math.random() - 0.5) * sh * 0.05 : 0;
    const sy = sh > 0 ? (Math.random() - 0.5) * sh * 0.05 : 0;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    out.x = this.x + bobX * c;
    out.y = this.eyeY + bobY;
    out.z = this.z - bobX * s;
    out.yaw = this.yaw + sx;
    out.pitch = this.pitch + sy;
    out.roll = roll;
    return out;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtTimer = 0;
    this.shake = Math.min(1.5, this.shake + amount / 25);
  }
}
