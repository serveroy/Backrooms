// Industrial texture recipes: concrete, brick, metal, crates, signs, doors.

import { TexBuf, pfbm, pnoise, pworley, hex, texRng, stain } from './texgen.js';
import { registerRecipes } from './textures.js';

function canvasOf(buf) {
  return buf.toCanvas();
}

function overlay(cv, draw) {
  draw(cv.getContext('2d'), cv.width, cv.height);
  return cv;
}

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

function crack(buf, rng, x, y, len, dark = 0.55) {
  let a = rng() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    buf.mul(x, y, dark);
    buf.mul(x + 1, y, 0.85);
    a += (rng() - 0.5) * 0.8;
    x += Math.cos(a) * 1.2;
    y += Math.sin(a) * 1.2;
    if (rng() < 0.02) crack(buf, rng, x, y, len * 0.4, dark);
  }
}

// ---------------------------------------------------------------- concrete

function concrete(seed, base, opts = {}) {
  const S = 512;
  const b = hex(base);
  const buf = new TexBuf(S, S);
  const rng = texRng(seed);
  buf.each((x, y, c) => {
    const u = x / S;
    const v = y / S;
    const n1 = pfbm(u, v, 6, 5, seed) - 0.5;
    const n2 = pnoise(x * 0.7, y * 0.7, S * 0.7, S * 0.7, seed + 5) - 0.5;
    const pores = pworley(u, v, 90, seed + 9);
    let f = 1 + n1 * 0.22 + n2 * 0.08 - (pores < 0.12 ? 0.18 : 0);
    if (opts.boards) {
      // formwork board seams
      const by = (y % (S / 4)) / (S / 4);
      if (by < 0.012) f *= 0.8;
      f *= 1 + (pnoise(0.5, Math.floor(y / (S / 4)), 4, 4, seed + 3) - 0.5) * 0.08;
    }
    if (opts.streaks) {
      const st = pfbm(u, v, 24, 3, seed + 21, 0.5, 2) - 0.5;
      f *= 1 + st * 0.12;
    }
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  for (let i = 0; i < (opts.cracks ?? 4); i++) crack(buf, rng, rng() * S, rng() * S, 40 + rng() * 120);
  if (opts.ties) {
    for (let ty = S / 8; ty < S; ty += S / 4) {
      for (let tx = S / 8; tx < S; tx += S / 4) {
        stain(buf, tx, ty, 7, [b[0] * 0.4, b[1] * 0.4, b[2] * 0.4], 0.8, rng);
        stain(buf, tx, ty + 9, 12, [b[0] * 0.75, b[1] * 0.72, b[2] * 0.7], 0.3, rng);
      }
    }
  }
  for (let i = 0; i < (opts.stains ?? 6); i++) {
    stain(buf, rng() * S, rng() * S, 20 + rng() * 60, [b[0] * 0.7, b[1] * 0.68, b[2] * 0.62], 0.25, rng);
  }
  return canvasOf(buf);
}

function concreteWall() {
  return { canvas: concrete(31, '#8d8a84', { boards: true, ties: true, streaks: true, cracks: 3 }), worldW: 2.4, worldH: 2.4 };
}
function concreteFloor() {
  return { canvas: concrete(57, '#7c7870', { cracks: 6, stains: 10 }), worldW: 3, worldH: 3 };
}
function concreteCeil() {
  return { canvas: concrete(77, '#6f6c68', { boards: true, cracks: 2 }), worldW: 2.4, worldH: 2.4 };
}
function concreteDark() {
  return { canvas: concrete(91, '#5e5a55', { streaks: true, cracks: 4, stains: 12 }), worldW: 2.4, worldH: 2.4 };
}
function plasterGrey() {
  return { canvas: concrete(113, '#7d7b77', { streaks: true, cracks: 2, stains: 14 }), worldW: 2.4, worldH: 2.4 };
}

// ---------------------------------------------------------------- brick

function brick() {
  const S = 512; // 1.2m wide, 0.6m tall per repeat... keep square 1.2m
  const buf = new TexBuf(S, S);
  const rng = texRng(404);
  const bw = S / 5.5; // ~0.22m
  const bh = S / 17; // ~0.07m
  const mortar = hex('#6d655b');
  const rows = Math.round(S / bh);
  const bhh = S / rows;
  const cols = 5;
  const bww = S / cols;
  buf.each((x, y, c) => {
    const row = Math.floor(y / bhh);
    const off = row % 2 ? bww / 2 : 0;
    const col = Math.floor(((x + off) % S) / bww);
    const lx = (x + off) % bww;
    const ly = y % bhh;
    const isM = lx < 3 || ly < 3;
    const h = pnoise(col * 3.1, row * 1.7, 999, 999, 5);
    const base = hex(h < 0.33 ? '#6a2f22' : h < 0.66 ? '#7a3826' : '#5c2a1f');
    const n = pnoise(x * 0.8, y * 0.8, S * 0.8, S * 0.8, 7) - 0.5;
    const big = pfbm(x / S, y / S, 5, 3, 9) - 0.5;
    if (isM) {
      const f = 1 + n * 0.2;
      c[0] = mortar[0] * f;
      c[1] = mortar[1] * f;
      c[2] = mortar[2] * f;
    } else {
      const edge = Math.min(lx - 3, ly - 3, bww - lx, bhh - ly);
      const f = (1 + n * 0.25 + big * 0.2) * (edge < 3 ? 0.85 : 1);
      c[0] = base[0] * f;
      c[1] = base[1] * f;
      c[2] = base[2] * f;
    }
  });
  // soot / grime
  for (let i = 0; i < 10; i++) stain(buf, rng() * S, rng() * S, 30 + rng() * 70, [0.12, 0.1, 0.09], 0.25, rng);
  return { canvas: canvasOf(buf), worldW: 1.2, worldH: 1.2 };
}

// ---------------------------------------------------------------- metal

function rustyMetal() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const rng = texRng(808);
  const base = hex('#6e6f6d');
  const rust = hex('#7a3f1c');
  buf.each((x, y, c) => {
    const u = x / S;
    const v = y / S;
    const r = pfbm(u, v, 5, 5, 81);
    const n = pnoise(x, y, S, S, 82) - 0.5;
    const k = Math.max(0, Math.min(1, (r - 0.48) * 4));
    const f = 1 + n * 0.12;
    c[0] = (base[0] + (rust[0] - base[0]) * k) * f;
    c[1] = (base[1] + (rust[1] - base[1]) * k) * f;
    c[2] = (base[2] + (rust[2] - base[2]) * k) * f;
  });
  for (let i = 0; i < 6; i++) stain(buf, rng() * S, rng() * S, 10 + rng() * 25, rust, 0.4, rng);
  return { canvas: canvasOf(buf), worldW: 1, worldH: 1 };
}

function paintedMetal(color, seed) {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex(color);
  const rng = texRng(seed);
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.5, y * 0.5, S / 2, S / 2, seed) - 0.5;
    const chip = pfbm(x / S, y / S, 8, 4, seed + 1);
    const k = chip > 0.68 ? 0.55 : 1;
    const f = (1 + n * 0.08) * k;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  for (let i = 0; i < 5; i++) stain(buf, rng() * S, rng() * S, 8 + rng() * 20, [0.35, 0.18, 0.08], 0.35, rng);
  return canvasOf(buf);
}

function pipeGrey() {
  return { canvas: paintedMetal('#7b7d7a', 901), worldW: 1, worldH: 1 };
}
function pipeRed() {
  return { canvas: paintedMetal('#7a2a20', 902), worldW: 1, worldH: 1 };
}
function pipeCopper() {
  const cv = paintedMetal('#8a5a35', 903);
  return { canvas: cv, worldW: 1, worldH: 1 };
}
function pipeYellow() {
  return { canvas: paintedMetal('#a08a2e', 904), worldW: 1, worldH: 1 };
}

function metalPanel() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex('#5d5f60');
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.6, y * 0.6, S * 0.6, S * 0.6, 77) - 0.5;
    const brushed = pnoise(x * 0.05, y * 2, S * 0.05, S * 2, 78) - 0.5;
    let f = 1 + n * 0.08 + brushed * 0.06;
    if (x % 128 < 2 || y % 128 < 2) f *= 0.55;
    const rx = x % 128;
    const ry = y % 128;
    for (const [px, py] of [
      [10, 10],
      [118, 10],
      [10, 118],
      [118, 118],
    ]) {
      const d = Math.hypot(rx - px, ry - py);
      if (d < 4) f *= d < 3 ? 1.25 : 0.7;
    }
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  return { canvas: canvasOf(buf), worldW: 1.2, worldH: 1.2 };
}

// ---------------------------------------------------------------- wood / cardboard

function woodCrate() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex('#8a6a42');
  buf.each((x, y, c) => {
    const plank = Math.floor(y / 51);
    const grain = pnoise(x * 0.04 + plank * 7, y * 0.9, 999, 999, 31 + plank) - 0.5;
    const n = pnoise(x, y, S, S, 32) - 0.5;
    let f = 1 + grain * 0.35 + n * 0.08 + (pnoise(plank, 0, 99, 99, 4) - 0.5) * 0.25;
    if (y % 51 < 3) f *= 0.45;
    if (x < 14 || x > S - 14) f *= 0.85;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  const cv = canvasOf(buf);
  overlay(cv, (g) => {
    g.fillStyle = 'rgba(30,20,10,0.6)';
    for (const [x, y] of [
      [20, 20],
      [236, 20],
      [20, 236],
      [236, 236],
      [20, 128],
      [236, 128],
    ]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.font = 'bold 26px Arial';
    g.fillStyle = 'rgba(30,25,20,0.45)';
    g.textAlign = 'center';
    g.fillText('M.E.G.', 128, 120);
    g.font = 'bold 15px Arial';
    g.fillText('SUPPLY  ↑', 128, 145);
  });
  return { canvas: cv, worldW: 1, worldH: 1 };
}

function cardboard() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex('#a4804f');
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.8, y * 0.8, S * 0.8, S * 0.8, 51) - 0.5;
    const flute = Math.sin(x * 0.9) * 0.015;
    const f = 1 + n * 0.1 + flute;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  const cv = canvasOf(buf);
  overlay(cv, (g) => {
    g.fillStyle = 'rgba(200,180,140,0.7)';
    g.fillRect(0, 112, S, 30);
    g.fillStyle = 'rgba(40,30,20,0.5)';
    g.font = 'bold 22px Arial';
    g.fillText('THIS SIDE UP', 40, 70);
    g.fillText('↑ ↑', 100, 200);
  });
  return { canvas: cv, worldW: 1, worldH: 1 };
}

// ---------------------------------------------------------------- signs / doors

function exitSign() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0c3a18';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#4dff7c';
  g.font = 'bold 74px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EXIT', 140, 66);
  // running figure
  g.lineWidth = 7;
  g.strokeStyle = '#4dff7c';
  g.beginPath();
  g.arc(30, 30, 8, 0, Math.PI * 2);
  g.moveTo(28, 40);
  g.lineTo(22, 74);
  g.moveTo(22, 74);
  g.lineTo(10, 100);
  g.moveTo(22, 74);
  g.lineTo(38, 96);
  g.moveTo(26, 50);
  g.lineTo(44, 60);
  g.moveTo(26, 50);
  g.lineTo(10, 58);
  g.stroke();
  return { canvas: c, worldW: 1, worldH: 1 };
}

function metalDoor() {
  const S = 256;
  const buf = new TexBuf(S, S * 2);
  const b = hex('#5b6260');
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.5, y * 0.5, 128, 256, 61) - 0.5;
    const chip = pfbm(x / S, y / (S * 2), 6, 4, 62);
    let f = (1 + n * 0.08) * (chip > 0.7 ? 0.6 : 1);
    // inset panel edges
    if (x < 8 || x > S - 9 || y < 8 || y > S * 2 - 9) f *= 0.7;
    if (y > 150 && y < 165 && x > 30 && x < 226) f *= 0.8;
    c[0] = b[0] * f;
    c[1] = b[1] * f * 1.02;
    c[2] = b[2] * f;
  });
  const cv = canvasOf(buf);
  overlay(cv, (g) => {
    // faded stencil
    g.fillStyle = 'rgba(210,190,90,0.55)';
    g.font = 'bold 54px Impact, Arial Black, sans-serif';
    g.textAlign = 'center';
    g.fillText('EXIT', 128, 110);
    g.font = 'bold 18px Arial';
    g.fillText('MAINTENANCE', 128, 136);
    // rust drips
    g.fillStyle = 'rgba(110,55,20,0.35)';
    for (let i = 0; i < 8; i++) g.fillRect(20 + i * 29, 300 + (i % 3) * 20, 3, 120 + (i % 4) * 30);
    // kick plate
    g.fillStyle = 'rgba(30,30,30,0.35)';
    g.fillRect(14, 430, 228, 70);
  });
  return { canvas: cv, worldW: 1, worldH: 1 };
}

function fireDoor() {
  const S = 256;
  const buf = new TexBuf(S, S * 2);
  const b = hex('#8a2d22');
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.5, y * 0.5, 128, 256, 71) - 0.5;
    const chip = pfbm(x / S, y / (S * 2), 7, 4, 72);
    let f = (1 + n * 0.1) * (chip > 0.72 ? 0.5 : 1);
    if (x < 8 || x > S - 9 || y < 8 || y > S * 2 - 9) f *= 0.7;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  const cv = canvasOf(buf);
  overlay(cv, (g) => {
    g.fillStyle = 'rgba(240,235,220,0.85)';
    g.fillRect(48, 70, 160, 60);
    g.fillStyle = '#7a1d14';
    g.font = 'bold 30px Arial';
    g.textAlign = 'center';
    g.fillText('FIRE EXIT', 128, 112);
    g.fillStyle = 'rgba(30,30,30,0.6)';
    g.fillRect(20, 250, 216, 16);
  });
  return { canvas: cv, worldW: 1, worldH: 1 };
}

function elevatorDoor() {
  const S = 256;
  const buf = new TexBuf(S, S * 2);
  const b = hex('#8d9091');
  buf.each((x, y, c) => {
    const brushed = pnoise(x * 0.03, y * 3, 8, 768, 91) - 0.5;
    const n = pnoise(x, y, 256, 512, 92) - 0.5;
    let f = 1 + brushed * 0.18 + n * 0.05;
    if (Math.abs(x - 128) < 2) f *= 0.3;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f * 1.03;
  });
  const rng = texRng(93);
  for (let i = 0; i < 12; i++) stain(buf, rng() * S, rng() * S * 2, 10 + rng() * 30, [0.3, 0.28, 0.25], 0.25, rng);
  return { canvas: canvasOf(buf), worldW: 1, worldH: 1 };
}

function hazardStripe() {
  const S = 128;
  const buf = new TexBuf(S, S);
  buf.each((x, y, c) => {
    const k = Math.floor((x + y) / 32) % 2;
    const n = pnoise(x, y, S, S, 3) - 0.5;
    const col = k ? [0.85, 0.68, 0.1] : [0.06, 0.06, 0.06];
    c[0] = col[0] * (1 + n * 0.2);
    c[1] = col[1] * (1 + n * 0.2);
    c[2] = col[2] * (1 + n * 0.2);
  });
  return { canvas: canvasOf(buf), worldW: 0.6, worldH: 0.6 };
}

function cageBulb() {
  // emissive texture for bulbs / tube fixtures
  const S = 64;
  const buf = new TexBuf(S, S);
  buf.each((x, y, c) => {
    const d = Math.hypot(x - 32, y - 32) / 32;
    const v = Math.max(0.6, 1 - d * 0.4);
    c[0] = c[1] = c[2] = v;
  });
  return { canvas: canvasOf(buf), worldW: 1, worldH: 1 };
}

function tubeLamp() {
  const W = 64;
  const H = 256;
  const buf = new TexBuf(W, H);
  buf.each((x, y, c) => {
    const edge = Math.min(y, H - 1 - y);
    const v = edge < 10 ? 0.35 : 0.95 + 0.05 * Math.sin(x * 0.4);
    c[0] = c[1] = c[2] = v;
  });
  return { canvas: canvasOf(buf), worldW: 1, worldH: 1 };
}

function electricBox() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex('#6b706b');
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.5, y * 0.5, 128, 128, 41) - 0.5;
    let f = 1 + n * 0.1;
    if (x < 6 || y < 6 || x > S - 7 || y > S - 7) f *= 0.6;
    if (x > 30 && x < 226 && Math.abs(y - 200) < 2) f *= 0.6;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  const cv = canvasOf(buf);
  overlay(cv, (g) => {
    g.fillStyle = '#d8b21c';
    g.beginPath();
    g.moveTo(128, 40);
    g.lineTo(178, 130);
    g.lineTo(78, 130);
    g.closePath();
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 54px Arial';
    g.textAlign = 'center';
    g.fillText('!', 128, 122);
    g.font = 'bold 18px Arial';
    g.fillText('DANGER', 128, 160);
    g.fillText('HIGH VOLTAGE', 128, 182);
  });
  return { canvas: cv, worldW: 1, worldH: 1 };
}

registerRecipes({
  concreteWall,
  concreteFloor,
  concreteCeil,
  concreteDark,
  plasterGrey,
  brick,
  rustyMetal,
  pipeGrey,
  pipeRed,
  pipeCopper,
  pipeYellow,
  metalPanel,
  woodCrate,
  cardboard,
  exitSign,
  metalDoor,
  fireDoor,
  elevatorDoor,
  hazardStripe,
  cageBulb,
  tubeLamp,
  electricBox,
});
