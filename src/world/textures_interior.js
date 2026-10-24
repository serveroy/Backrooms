// Interior texture recipes: office, hotel, poolrooms, party, flooded rooms.

import { TexBuf, pfbm, pnoise, hex, texRng, stain } from './texgen.js';
import { registerRecipes, RECIPES } from './textures.js';

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

function fromCanvas(cv) {
  const buf = new TexBuf(cv.width, cv.height);
  const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0, j = 0; j < buf.d.length; i += 4, j += 3) {
    buf.d[j] = px[i] / 255;
    buf.d[j + 1] = px[i + 1] / 255;
    buf.d[j + 2] = px[i + 2] / 255;
  }
  return buf;
}

// ---------------------------------------------------------------- office

function officeCarpet() {
  // carpet tiles, 0.5m, alternating pile direction
  const S = 512; // 1m => 2x2 tiles
  const buf = new TexBuf(S, S);
  const b = hex('#4c5560');
  buf.each((x, y, c) => {
    const tile = (Math.floor(x / 256) + Math.floor(y / 256)) % 2;
    const pile = tile ? pnoise(x * 1.2, y * 0.25, S * 1.2, S * 0.25, 11) : pnoise(x * 0.25, y * 1.2, S * 0.25, S * 1.2, 12);
    const n = pnoise(x, y, S, S, 13) - 0.5;
    const blot = pfbm(x / S, y / S, 4, 3, 14) - 0.5;
    let f = 1 + (pile - 0.5) * 0.16 + n * 0.14 + blot * 0.1 + (tile ? 0.03 : -0.03);
    const e = Math.min(x % 256, y % 256, 255 - (x % 256), 255 - (y % 256));
    if (e < 2) f *= 0.85;
    // fleck pattern
    if (pnoise(x * 0.9, y * 0.9, S * 0.9, S * 0.9, 15) > 0.86) f *= 1.25;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

function officeWall() {
  const S = 512;
  const buf = new TexBuf(S, S);
  const b = hex('#c9c6bc');
  const rng = texRng(21);
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.6, y * 0.6, S * 0.6, S * 0.6, 22) - 0.5;
    const big = pfbm(x / S, y / S, 3, 3, 23) - 0.5;
    const f = 1 + n * 0.04 + big * 0.06;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  for (let i = 0; i < 4; i++) stain(buf, rng() * S, rng() * S, 30 + rng() * 50, [0.7, 0.66, 0.58], 0.15, rng);
  return { canvas: buf.toCanvas(), worldW: 2.4, worldH: 2.4 };
}

function cubicleFabric() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex('#5f6873');
  buf.each((x, y, c) => {
    const weave = ((x % 4) < 2) !== ((y % 4) < 2) ? 1.05 : 0.95;
    const n = pnoise(x, y, S, S, 31) - 0.5;
    const f = weave * (1 + n * 0.1);
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  return { canvas: buf.toCanvas(), worldW: 0.5, worldH: 0.5 };
}

function ceilingWhite() {
  const src = RECIPES.ceilingL0().canvas;
  const buf = fromCanvas(src);
  // re-tint toward neutral white
  for (let i = 0; i < buf.d.length; i += 3) {
    const l = buf.d[i] * 0.3 + buf.d[i + 1] * 0.59 + buf.d[i + 2] * 0.11;
    buf.d[i] = l * 1.02;
    buf.d[i + 1] = l * 1.02;
    buf.d[i + 2] = l * 1.04;
  }
  return { canvas: buf.toCanvas(), worldW: 1.2, worldH: 1.2 };
}

function windowNight() {
  const W = 256;
  const H = 384;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#05080e');
  grd.addColorStop(1, '#0b1018');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // rain streaks on glass
  const rng = texRng(55);
  g.strokeStyle = 'rgba(150,170,200,0.12)';
  for (let i = 0; i < 60; i++) {
    const x = rng() * W;
    const y = rng() * H;
    g.lineWidth = 1 + rng() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 6, y + 20 + rng() * 60);
    g.stroke();
  }
  // frame
  g.fillStyle = '#2a2c2e';
  g.fillRect(0, 0, W, 10);
  g.fillRect(0, H - 10, W, 10);
  g.fillRect(0, 0, 10, H);
  g.fillRect(W - 10, 0, 10, H);
  g.fillRect(W / 2 - 4, 0, 8, H);
  return { canvas: c, worldW: 1, worldH: 1 };
}

function desktopWood() {
  const S = 256;
  const buf = new TexBuf(S, S);
  const b = hex('#9b8564');
  buf.each((x, y, c) => {
    const grain = pnoise(x * 0.03, y * 0.6, 8, 154, 41) - 0.5;
    const n = pnoise(x, y, S, S, 42) - 0.5;
    const f = 1 + grain * 0.2 + n * 0.05;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

function monitorScreen() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1a14';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = 'rgba(80,220,140,0.85)';
  g.font = '9px monospace';
  const lines = ['C:\\>dir', 'LEVEL4   <DIR>', 'EXIT.TXT    0', 'C:\\>type EXIT.TXT', 'THERE IS NO EXIT', 'C:\\>_'];
  lines.forEach((l, i) => g.fillText(l, 6, 14 + i * 13));
  for (let y = 0; y < 96; y += 2) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y, 128, 1);
  }
  return { canvas: c, worldW: 1, worldH: 1 };
}

function stairsSign() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e4d8';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1d3a6b';
  g.fillRect(6, 6, 244, 116);
  g.fillStyle = '#f0f0f0';
  g.font = 'bold 44px Arial';
  g.textAlign = 'center';
  g.fillText('STAIRS', 128, 64);
  g.font = 'bold 22px Arial';
  g.fillText('▼ DOWN ▼', 128, 100);
  return { canvas: c, worldW: 1, worldH: 1 };
}

// ---------------------------------------------------------------- hotel

function hotelCarpet() {
  const S = 512; // 1.2m
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#4a1210';
  g.fillRect(0, 0, S, S);
  wrapDraw(g, S, S, (q) => {
    for (const [cx, cy] of [
      [S / 4, S / 4],
      [(3 * S) / 4, (3 * S) / 4],
      [(3 * S) / 4, S / 4],
      [S / 4, (3 * S) / 4],
    ]) {
      const alt = (cx === cy) | 0;
      q.save();
      q.translate(cx, cy);
      q.scale(0.6, 0.6);
      q.strokeStyle = alt ? 'rgba(170,120,60,0.4)' : 'rgba(20,10,8,0.45)';
      q.fillStyle = alt ? 'rgba(160,110,55,0.18)' : 'rgba(30,12,10,0.35)';
      q.lineWidth = 5;
      for (let k = 0; k < 8; k++) {
        q.rotate(Math.PI / 4);
        q.beginPath();
        q.ellipse(0, 40, 14, 38, 0, 0, Math.PI * 2);
        q.fill();
        q.stroke();
      }
      q.beginPath();
      q.arc(0, 0, 22, 0, Math.PI * 2);
      q.stroke();
      q.restore();
    }
    q.strokeStyle = 'rgba(201,152,72,0.4)';
    q.lineWidth = 3;
    q.strokeRect(6, 6, S - 12, S - 12);
  });
  const buf = fromCanvas(c);
  buf.each((x, y, col) => {
    const n = pnoise(x, y, S, S, 61) - 0.5;
    const f = 1 + n * 0.18;
    col[0] *= f;
    col[1] *= f;
    col[2] *= f;
  });
  return { canvas: buf.toCanvas(), worldW: 1.2, worldH: 1.2 };
}

function damask() {
  const S = 512; // 0.6m wide
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#26301f';
  g.fillRect(0, 0, S, S);
  wrapDraw(g, S, S, (q) => {
    for (const [cx, cy] of [
      [S / 2, S / 4],
      [0, (3 * S) / 4],
      [S, (3 * S) / 4],
    ]) {
      q.save();
      q.translate(cx, cy);
      q.scale(0.7, 0.7);
      q.fillStyle = 'rgba(78,92,52,0.42)';
      // stylised damask medallion
      q.beginPath();
      q.moveTo(0, -100);
      q.bezierCurveTo(60, -70, 70, -10, 0, 30);
      q.bezierCurveTo(-70, -10, -60, -70, 0, -100);
      q.fill();
      q.beginPath();
      q.moveTo(0, 100);
      q.bezierCurveTo(50, 70, 55, 30, 0, 40);
      q.bezierCurveTo(-55, 30, -50, 70, 0, 100);
      q.fill();
      for (const sx of [-1, 1]) {
        q.beginPath();
        q.ellipse(sx * 55, 20, 14, 34, sx * 0.6, 0, Math.PI * 2);
        q.fill();
      }
      q.restore();
    }
  });
  const buf = fromCanvas(c);
  buf.each((x, y, col) => {
    const n = pnoise(x * 0.7, y * 0.7, S * 0.7, S * 0.7, 71) - 0.5;
    const f = 1 + n * 0.08;
    col[0] *= f;
    col[1] *= f;
    col[2] *= f;
  });
  return { canvas: buf.toCanvas(), worldW: 0.6, worldH: 0.6 };
}

function woodPanel() {
  const S = 512; // 1.0m wide, 1.0 tall
  const buf = new TexBuf(S, S);
  const b = hex('#4a2c18');
  buf.each((x, y, c) => {
    const board = Math.floor(x / 128);
    const lx = x % 128;
    const grain = pnoise(x * 0.6 + board * 50, y * 0.02, 999, 999, 81 + board) - 0.5;
    const n = pnoise(x, y, S, S, 82) - 0.5;
    let f = 1 + grain * 0.4 + n * 0.06;
    if (lx < 3 || lx > 124) f *= 0.5;
    if (lx > 14 && lx < 114 && y > 40 && y < S - 40) {
      // raised panel bevel
      const e = Math.min(lx - 14, 114 - lx, y - 40, S - 40 - y);
      if (e < 5) f *= 0.75 + e * 0.05;
    }
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

function hotelDoor() {
  const W = 256;
  const H = 512;
  const buf = new TexBuf(W, H);
  const b = hex('#5a3420');
  buf.each((x, y, c) => {
    const grain = pnoise(x * 0.05, y * 0.5, 13, 256, 91) - 0.5;
    let f = 1 + grain * 0.3;
    // panels
    const inP = (x > 30 && x < 226 && ((y > 40 && y < 230) || (y > 270 && y < 470)));
    if (inP) {
      const e = Math.min(x - 30, 226 - x, y > 250 ? y - 270 : y - 40, y > 250 ? 470 - y : 230 - y);
      if (e < 8) f *= 0.7 + e * 0.04;
    }
    if (x < 6 || x > W - 7 || y < 6) f *= 0.6;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

function ornateCeiling() {
  const S = 512;
  const buf = new TexBuf(S, S);
  const b = hex('#c9b994');
  buf.each((x, y, c) => {
    const n = pnoise(x * 0.5, y * 0.5, S * 0.5, S * 0.5, 101) - 0.5;
    const big = pfbm(x / S, y / S, 3, 4, 102) - 0.5;
    let f = 1 + n * 0.05 + big * 0.12;
    const lx = x % 256;
    const ly = y % 256;
    const e = Math.min(lx, ly, 255 - lx, 255 - ly);
    if (e < 10) f *= 0.82 + e * 0.015;
    c[0] = b[0] * f;
    c[1] = b[1] * f;
    c[2] = b[2] * f;
  });
  const rng = texRng(103);
  for (let i = 0; i < 6; i++) stain(buf, rng() * S, rng() * S, 30 + rng() * 60, [0.5, 0.42, 0.3], 0.25, rng, 0.3);
  return { canvas: buf.toCanvas(), worldW: 2.4, worldH: 2.4 };
}

// ---------------------------------------------------------------- poolrooms

function poolTile() {
  const S = 512; // 0.6m => 4x4 tiles of 15cm
  const buf = new TexBuf(S, S);
  const tile = S / 4;
  buf.each((x, y, c) => {
    const lx = x % tile;
    const ly = y % tile;
    const id = Math.floor(x / tile) + Math.floor(y / tile) * 7;
    const shade = 0.96 + (pnoise(id, 3, 999, 999, 5) - 0.5) * 0.05;
    const grout = lx < 3 || ly < 3;
    const n = pnoise(x, y, S, S, 6) - 0.5;
    const e = Math.min(lx, ly, tile - lx, tile - ly);
    if (grout) {
      c[0] = 0.72 + n * 0.05;
      c[1] = 0.76 + n * 0.05;
      c[2] = 0.76 + n * 0.05;
    } else {
      const bev = e < 6 ? 0.93 + e * 0.012 : 1;
      c[0] = 0.92 * shade * bev + n * 0.015;
      c[1] = 0.95 * shade * bev + n * 0.015;
      c[2] = 0.96 * shade * bev + n * 0.015;
    }
  });
  return { canvas: buf.toCanvas(), worldW: 0.6, worldH: 0.6 };
}

function poolTileBlue() {
  const t = poolTile();
  const buf = fromCanvas(t.canvas);
  for (let i = 0; i < buf.d.length; i += 3) {
    buf.d[i] *= 0.55;
    buf.d[i + 1] *= 0.82;
    buf.d[i + 2] *= 0.92;
  }
  return { canvas: buf.toCanvas(), worldW: 0.6, worldH: 0.6 };
}

function skylight() {
  const S = 128;
  const buf = new TexBuf(S, S);
  buf.each((x, y, c) => {
    const e = Math.min(x, y, S - 1 - x, S - 1 - y);
    const v = e < 6 ? 0.55 : 1;
    c[0] = v * 0.97;
    c[1] = v;
    c[2] = v;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

// ---------------------------------------------------------------- party (Level Fun)

function partyCarpet() {
  const src = RECIPES.carpetL0().canvas;
  const buf = fromCanvas(src);
  const rng = texRng(303);
  const cols = ['#e2384d', '#3fa8e0', '#f0c419', '#5bd16c', '#c45be0', '#f07c1a'].map(hex);
  for (let i = 0; i < 380; i++) {
    const col = cols[Math.floor(rng() * cols.length)];
    const x = rng() * 512;
    const y = rng() * 512;
    const w = 3 + rng() * 4;
    const h = 2 + rng() * 3;
    for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) buf.blend(x + a, y + b, col[0], col[1], col[2], 0.95);
  }
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

function partyWallpaper() {
  const src = RECIPES.wallpaperL0().canvas;
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  const rng = texRng(304);
  const cols = ['#e2384d', '#3fa8e0', '#f0c419', '#5bd16c', '#c45be0'];
  wrapDraw(g, cv.width, cv.height, (q) => {
    for (let i = 0; i < 26; i++) {
      q.fillStyle = cols[i % cols.length];
      q.globalAlpha = 0.55;
      q.beginPath();
      q.arc(rng() * cv.width, rng() * cv.height, 6 + rng() * 6, 0, Math.PI * 2);
      q.fill();
    }
  });
  return { canvas: cv, worldW: 0.6, worldH: 0.6 };
}

function banner() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9c47a';
  g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = '#5a4a2a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 10);
  g.lineTo(1024, 10);
  g.stroke();
  const letters = 'HAPPY BIRTHDAY!'.split('');
  const cols = ['#e2384d', '#3fa8e0', '#f0c419', '#5bd16c', '#c45be0', '#f07c1a'];
  letters.forEach((ch, i) => {
    const x = 20 + i * 66;
    if (ch === ' ') return;
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.moveTo(x, 10);
    g.lineTo(x + 60, 10);
    g.lineTo(x + 30, 118);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 40px Arial';
    g.textAlign = 'center';
    g.save();
    g.translate(x + 30, 58);
    // one letter is always wrong
    if (ch === 'R') g.scale(-1, 1);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  return { canvas: c, worldW: 1, worldH: 1 };
}

function balloonTex() {
  const S = 64;
  const buf = new TexBuf(S, S);
  buf.each((x, y, c) => {
    const d = Math.hypot(x - 22, y - 20) / 40;
    const v = 0.85 + Math.max(0, 0.6 - d) * 0.6;
    c[0] = c[1] = c[2] = v;
  });
  return { canvas: buf.toCanvas(), worldW: 1, worldH: 1 };
}

// ---------------------------------------------------------------- flooded / dark

function wetWallpaper() {
  const src = RECIPES.wallpaperL0().canvas;
  const buf = fromCanvas(src);
  buf.each((x, y, c) => {
    const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
    const mold = pfbm(x / 512, y / 512, 3, 4, 506);
    const drip = pfbm(x / 512, y / 512, 9, 3, 507, 0.5, 2);
    const k = 1 - 0.55 * Math.max(0, Math.min(1, (mold - 0.5) * 3)) - 0.15 * Math.max(0, drip - 0.55) * 3;
    c[0] = l * 0.55 * k;
    c[1] = l * 0.63 * k;
    c[2] = l * 0.62 * k;
  });
  return { canvas: buf.toCanvas(), worldW: 0.6, worldH: 0.6 };
}

function textSign(text, sub, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.font = 'bold 54px Georgia, serif';
  g.fillText(text, 256, sub ? 70 : 84);
  if (sub) {
    g.font = '24px Georgia, serif';
    g.fillText(sub, 256, 104);
  }
  return { canvas: c, worldW: 1, worldH: 1 };
}

function boilerSign() {
  return textSign('BOILER ROOM', 'STAFF ONLY', '#2a120c', '#e0b070');
}

function doorSunlight() {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#d9d2c0';
  g.fillRect(24, 24, W - 48, H - 48);
  g.fillStyle = '#fff8e0';
  g.fillRect(70, 60, 116, 150);
  g.fillStyle = '#b5a98f';
  g.beginPath();
  g.arc(210, 280, 10, 0, Math.PI * 2);
  g.fill();
  return { canvas: c, worldW: 1, worldH: 1 };
}

registerRecipes({
  officeCarpet,
  officeWall,
  cubicleFabric,
  ceilingWhite,
  windowNight,
  desktopWood,
  monitorScreen,
  stairsSign,
  hotelCarpet,
  damask,
  woodPanel,
  hotelDoor,
  ornateCeiling,
  poolTile,
  poolTileBlue,
  skylight,
  partyCarpet,
  partyWallpaper,
  banner,
  balloonTex,
  wetWallpaper,
  doorSunlight,
  boilerSign,
});
