// Texture recipes. Each recipe returns { canvas, worldW, worldH } where the
// world size (meters) tells the mesher how many meters one repeat covers.

import * as THREE from 'three';
import { TexBuf, pfbm, pnoise, pworley, hex, mix3, texRng, stain } from './texgen.js';

const cache = new Map();
let anisotropy = 4;

export function setAnisotropy(a) {
  anisotropy = a;
}

/** Get (and lazily build) a THREE texture for a recipe name. */
export function getTexture(name) {
  if (cache.has(name)) return cache.get(name);
  const recipe = RECIPES[name];
  if (!recipe) throw new Error('Unknown texture ' + name);
  const out = recipe();
  const tex = new THREE.CanvasTexture(out.canvas);
  tex.wrapS = tex.wrapT = out.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  // decals on glTF models use glTF's top-left UV origin
  if (out.flipY === false) tex.flipY = false;
  tex.colorSpace = out.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData.worldW = out.worldW || 1;
  tex.userData.worldH = out.worldH || 1;
  tex.needsUpdate = true;
  cache.set(name, tex);
  return tex;
}

/** Draw callback on a canvas, replicated at wrap offsets so it tiles. */
function wrapDraw(ctx, w, h, fn) {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      ctx.save();
      ctx.translate(ox, oy);
      fn(ctx);
      ctx.restore();
    }
  }
}

function rgbStr(c, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

// ---------------------------------------------------------------------------
// LEVEL 0 — mono-yellow wallpaper, moist carpet, acoustic ceiling tiles
// ---------------------------------------------------------------------------

function wallpaperL0() {
  const S = 512; // covers 0.6m x 0.6m
  const base = hex('#c9b56c');
  const buf = new TexBuf(S, S);
  buf.each((x, y, c) => {
    const u = x / S;
    const v = y / S;
    // paper grain + faint vertical streaking from the printing roller
    const grain = pnoise(x * 0.9, y * 0.9, S * 0.9, S * 0.9, 11) - 0.5;
    const streak = pfbm(u, v, 96, 2, 21, 0.5, 3) - 0.5;
    const cloud = pfbm(u, v, 3, 3, 31) - 0.5;
    const f = 1 + grain * 0.035 + streak * 0.05 + cloud * 0.05;
    c[0] = base[0] * f;
    c[1] = base[1] * f;
    c[2] = base[2] * (f + cloud * 0.04);
  });
  const cv = buf.toCanvas();
  const ctx = cv.getContext('2d');
  const ink = rgbStr(mix3(base, hex('#8a7434'), 1), 1);
  const lightInk = rgbStr(mix3(base, hex('#f2e2a0'), 1), 1);

  // The pattern: pairs of thin vertical rules every 15cm with columns of
  // little chevron / arrow motifs between them — the classic Level 0 print.
  const period = S / 4;
  wrapDraw(ctx, S, S, (g) => {
    for (let k = 0; k < 4; k++) {
      const x0 = k * period + period * 0.5;
      g.globalAlpha = 0.16;
      g.fillStyle = ink;
      g.fillRect(x0 - 22, 0, 2.2, S);
      g.fillRect(x0 + 20, 0, 2.2, S);
      g.globalAlpha = 0.1;
      g.fillRect(x0 - 17, 0, 1.2, S);
      g.fillRect(x0 + 16, 0, 1.2, S);
      // chevron column
      for (let j = 0; j < 16; j++) {
        const y0 = j * (S / 16) + (k % 2) * (S / 32);
        g.globalAlpha = 0.17;
        g.strokeStyle = ink;
        g.lineWidth = 2.1;
        g.beginPath();
        g.moveTo(x0 - 7, y0 + 6);
        g.lineTo(x0, y0 - 2);
        g.lineTo(x0 + 7, y0 + 6);
        g.stroke();
        g.globalAlpha = 0.12;
        g.beginPath();
        g.moveTo(x0, y0 - 2);
        g.lineTo(x0, y0 + 11);
        g.stroke();
        g.globalAlpha = 0.1;
        g.fillStyle = ink;
        g.beginPath();
        g.arc(x0, y0 + 17, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      // faint diamond lattice between the columns
      const xm = x0 + period * 0.5;
      for (let j = 0; j < 8; j++) {
        const y0 = j * (S / 8) + S / 16;
        g.globalAlpha = 0.06;
        g.strokeStyle = ink;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(xm, y0 - 9);
        g.lineTo(xm + 6, y0);
        g.lineTo(xm, y0 + 9);
        g.lineTo(xm - 6, y0);
        g.closePath();
        g.stroke();
      }
    }
    // the strip seam where two rolls of wallpaper meet
    g.globalAlpha = 0.22;
    g.fillStyle = lightInk;
    g.fillRect(0, 0, 1.5, S);
    g.globalAlpha = 0.18;
    g.fillStyle = ink;
    g.fillRect(1.5, 0, 1, S);
  });
  return { canvas: cv, worldW: 0.6, worldH: 0.6 };
}

function carpetL0() {
  const S = 512; // 1.0m
  const base = hex('#a68f5c');
  const buf = new TexBuf(S, S);
  const rng = texRng(77);
  buf.each((x, y, c) => {
    const u = x / S;
    const v = y / S;
    const fiber = pnoise(x, y, S, S, 5) - 0.5;
    const fiber2 = pnoise(x * 0.5 + 0.3, y * 0.5, S / 2, S / 2, 6) - 0.5;
    const loops = pfbm(u, v, 64, 2, 9) - 0.5;
    const blot = pfbm(u, v, 6, 3, 13) - 0.5;
    const f = 1 + fiber * 0.16 + fiber2 * 0.1 + loops * 0.12 + blot * 0.1;
    c[0] = base[0] * f * (1 + fiber * 0.03);
    c[1] = base[1] * f;
    c[2] = base[2] * f * (1 - fiber2 * 0.05);
  });
  // tiny dark specks / lint
  for (let i = 0; i < 900; i++) {
    const x = rng() * S;
    const y = rng() * S;
    buf.mul(x, y, 0.75 + rng() * 0.15);
  }
  for (let i = 0; i < 300; i++) {
    buf.blend(rng() * S, rng() * S, 0.75, 0.66, 0.46, 0.4);
  }
  return { canvas: buf.toCanvas(), worldW: 1.0, worldH: 1.0 };
}

function ceilingTilesL0() {
  const S = 512; // 1.2m => 2x2 tiles of 0.6m
  const T = S / 2;
  const base = hex('#cfc39a');
  const buf = new TexBuf(S, S);
  const rng = texRng(91);
  buf.each((x, y, c) => {
    const u = x / S;
    const v = y / S;
    const tile = (Math.floor(x / T) + Math.floor(y / T) * 2) | 0;
    const tileShade = [1.0, 0.965, 0.985, 0.95][tile];
    const n = pnoise(x * 0.8, y * 0.8, S * 0.8, S * 0.8, 3) - 0.5;
    const m = pfbm(u, v, 24, 3, 4) - 0.5;
    // edge bevel darkening
    const lx = x % T;
    const ly = y % T;
    const e = Math.min(lx, ly, T - lx, T - ly);
    const bevel = e < 10 ? 0.9 + 0.01 * e : 1;
    const f = tileShade * bevel * (1 + n * 0.08 + m * 0.07);
    c[0] = base[0] * f;
    c[1] = base[1] * f;
    c[2] = base[2] * f;
  });
  // fissures: short wormy dark strokes typical of mineral fiber tiles
  for (let i = 0; i < 2600; i++) {
    let x = rng() * S;
    let y = rng() * S;
    let a = rng() * Math.PI * 2;
    const len = 2 + rng() * 7;
    const dark = 0.72 + rng() * 0.16;
    for (let s = 0; s < len; s++) {
      buf.mul(x, y, dark);
      a += (rng() - 0.5) * 1.4;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  for (let i = 0; i < 1800; i++) buf.mul(rng() * S, rng() * S, 0.65 + rng() * 0.2);
  const cv = buf.toCanvas();
  const ctx = cv.getContext('2d');
  // T-bar grid
  wrapDraw(ctx, S, S, (g) => {
    for (const p of [0, T]) {
      g.globalAlpha = 1;
      g.fillStyle = '#d9d5c4';
      g.fillRect(p - 6, 0, 12, S);
      g.fillRect(0, p - 6, S, 12);
      g.fillStyle = 'rgba(90,82,60,0.45)';
      g.fillRect(p - 0.75, 0, 1.5, S);
      g.fillRect(0, p - 0.75, S, 1.5);
      g.fillStyle = 'rgba(70,60,40,0.25)';
      g.fillRect(p + 6, 0, 2, S);
      g.fillRect(0, p + 6, S, 2);
      g.fillRect(p - 8, 0, 2, S);
      g.fillRect(0, p - 8, S, 2);
    }
  });
  return { canvas: cv, worldW: 1.2, worldH: 1.2 };
}

/** A water-stained ceiling tile variant (used on a few tiles). */
function ceilingStainedL0() {
  const src = RECIPES.ceilingL0().canvas;
  const S = src.width;
  const buf = new TexBuf(S, S);
  const ctx0 = src.getContext('2d');
  const px = ctx0.getImageData(0, 0, S, S).data;
  for (let i = 0, j = 0; j < buf.d.length; i += 4, j += 3) {
    buf.d[j] = px[i] / 255;
    buf.d[j + 1] = px[i + 1] / 255;
    buf.d[j + 2] = px[i + 2] / 255;
  }
  const rng = texRng(1234);
  const T = S / 2;
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * T + T / 2;
    const oy = Math.floor(t / 2) * T + T / 2;
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      stain(
        buf,
        ox + (rng() - 0.5) * T * 0.5,
        oy + (rng() - 0.5) * T * 0.5,
        20 + rng() * 60,
        hex('#8c6a35'),
        0.35 + rng() * 0.25,
        rng,
        0.5
      );
    }
  }
  return { canvas: buf.toCanvas(), worldW: 1.2, worldH: 1.2 };
}

function troffer() {
  // 0.6m x 1.2m fluorescent troffer with prismatic acrylic lens
  const W = 128;
  const H = 256;
  const buf = new TexBuf(W, H);
  buf.each((x, y, c) => {
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (edge < 5) {
      const v = 0.42 + edge * 0.03;
      c[0] = c[1] = c[2] = v;
    } else {
      // prismatic dimples
      const px = (x % 4) - 1.5;
      const py = (y % 4) - 1.5;
      const p = 1 - (px * px + py * py) * 0.012;
      // tubes behind lens: two brighter bands
      const u = (x - 5) / (W - 10);
      const tube = 0.82 + 0.18 * (Math.exp(-((u - 0.3) ** 2) / 0.012) + Math.exp(-((u - 0.7) ** 2) / 0.012));
      // ends of tubes slightly darker
      const v = (y - 5) / (H - 10);
      const ends = 0.88 + 0.12 * Math.min(1, Math.min(v, 1 - v) * 8);
      const val = p * tube * ends;
      c[0] = val;
      c[1] = val;
      c[2] = val * 0.97;
    }
  });
  return { canvas: buf.toCanvas(), worldW: 0.6, worldH: 1.2 };
}

/** Macro grime: linear data, R = big stains, G = medium dirt, B = fine. */
function grime() {
  const S = 256;
  const buf = new TexBuf(S, S);
  buf.each((x, y, c) => {
    const u = x / S;
    const v = y / S;
    const a = pfbm(u, v, 4, 5, 101);
    const b = pfbm(u, v, 12, 4, 202);
    const d = pfbm(u, v, 40, 3, 303);
    const w = pworley(u, v, 6, 404);
    c[0] = Math.max(0, Math.min(1, (a - 0.42) * 2.4 + 0.5 * (1 - w) * 0.3));
    c[1] = b;
    c[2] = d;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1, linear: true };
}

function blackTex() {
  const buf = new TexBuf(8, 8).fill(0.02, 0.02, 0.02);
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

function whiteTex() {
  const buf = new TexBuf(8, 8).fill(1, 1, 1);
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

export const RECIPES = {
  wallpaperL0,
  carpetL0,
  ceilingL0: ceilingTilesL0,
  ceilingStainedL0,
  troffer,
  grime,
  black: blackTex,
  white: whiteTex,
};

/** Register more recipes from level modules. */
export function registerRecipes(obj) {
  Object.assign(RECIPES, obj);
}
