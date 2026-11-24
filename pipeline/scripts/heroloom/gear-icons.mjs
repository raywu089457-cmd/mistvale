// Gear item icons (32x32) for the warehouse + equip UI + hunter ring.
// Deterministic pixel art, pure Node (no image libs): every EQUIPMENT item gets a
// distinct silhouette per slot/visual variant, tinted by its class (or steel for
// the craft upgrades), with a 1px #150d1b ink outline like the HeroLoom art.
//
// Usage: node pipeline/scripts/heroloom/gear-icons.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeRgba } from './png.mjs';
import { EQUIPMENT } from '../../../src/pixel-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'assets/gear-icons');
const S = 32;
const INK = [21, 13, 27];

const CLASS_COLORS = {
  archer: { main: [79, 123, 58], light: [107, 155, 74], dark: [53, 85, 42], trim: [176, 124, 70] },
  sorcerer: { main: [108, 75, 143], light: [138, 99, 176], dark: [74, 49, 99], trim: [201, 162, 74] },
  priest: { main: [232, 226, 208], light: [251, 247, 234], dark: [191, 182, 159], trim: [201, 162, 74] },
  paladin: { main: [63, 95, 168], light: [91, 127, 199], dark: [42, 65, 118], trim: [201, 162, 74] },
  berserker: { main: [138, 90, 51], light: [176, 124, 70], dark: [92, 58, 30], trim: [140, 44, 44] },
  assassin: { main: [43, 43, 51], light: [68, 68, 79], dark: [23, 23, 28], trim: [120, 120, 132] },
  traveler: { main: [145, 96, 55], light: [176, 124, 70], dark: [95, 63, 34], trim: [120, 90, 60] },
  craft: { main: [138, 143, 150], light: [185, 191, 199], dark: [93, 97, 104], trim: [201, 162, 74] },
};
const LEATHER = { main: [138, 90, 51], light: [176, 124, 70], dark: [92, 58, 30] };
const STEEL = { main: [150, 156, 164], light: [196, 203, 211], dark: [96, 101, 108] };
const WOOD = { main: [140, 92, 48], light: [176, 124, 70], dark: [96, 62, 32] };
const GOLD = [201, 162, 74];

function makeCtx() {
  const rgba = new Uint8ClampedArray(S * S * 4);
  const px = (x, y, c) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= S || y >= S || !c) return;
    const i = (y * S + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, c); };
  const line = (x0, y0, x1, y1, c) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };
  return { rgba, px, rect, line };
}

// ---------- slot / variant shapes (32x32 canvas, slightly bottom-heavy like RPG icons)
function weapon(ctx, look, col) {
  const { rect, line, px } = ctx;
  const w = look.weapon;
  if (w === 'bow') {
    for (let y = 4; y <= 27; y++) {
      const x = 9 + Math.round(6 * Math.sin(((y - 4) / 23) * Math.PI));
      line(x, y, x + 1, y, WOOD.main); px(x, y, WOOD.light);
    }
    line(16, 4, 16, 27, GOLD);
  } else if (w === 'staff') {
    rect(14, 8, 16, 28, WOOD.main); line(15, 9, 15, 27, WOOD.light);
    for (let y = 4; y <= 10; y++) for (let x = 11; x <= 19; x++) {
      if ((x - 15) ** 2 + (y - 7) ** 2 <= 9) px(x, y, (x - 15) ** 2 + (y - 7) ** 2 <= 4 ? col.light : col.main);
    }
    px(13, 5, [255, 255, 255]);
  } else if (w === 'dagger') {
    line(8, 24, 22, 10, STEEL.main); line(9, 25, 23, 11, STEEL.light);
    line(9, 25, 23, 11, INK);
    line(8, 20, 14, 26, [120, 90, 60]);
  } else if (w === 'hammer') {
    // 2026-11-24 war hammer (paladin 戰錘 / 精鐵戰錘): wooden haft down-left, a steel head across its top, class-colour band
    line(8, 27, 19, 16, WOOD.dark); line(9, 27, 20, 16, WOOD.main); line(9, 26, 19, 16, WOOD.light);
    for (let i = -6; i <= 6; i++) for (let j = -2; j <= 2; j++) {
      const x = 21 + Math.round((i + j) * 0.7071), y = 13 + Math.round((i - j) * 0.7071);
      px(x, y, j <= -1 ? STEEL.light : j >= 2 ? STEEL.dark : STEEL.main);
      px(x + 1, y, j <= -1 ? STEEL.light : j >= 2 ? STEEL.dark : STEEL.main);
    }
    line(19, 15, 22, 12, col.trim);   // band where haft meets head
    px(17, 9, [255, 255, 255]);
  } else if (w === 'none') {
    // cloth wraps around a fist
    rect(10, 12, 21, 22, col.dark);
    for (let i = 0; i < 4; i++) line(10, 13 + i * 3, 21, 13 + i * 3, col.light);
    rect(12, 20, 19, 23, LEATHER.main);
  } else {
    // sword: blade up-left to hilt down-right
    line(9, 26, 21, 12, STEEL.dark);
    line(10, 25, 22, 11, STEEL.main);
    line(11, 24, 23, 10, STEEL.light);
    px(23, 9, [255, 255, 255]);
    line(7, 21, 14, 28, GOLD);          // guard
    line(13, 26, 19, 30, LEATHER.main); // grip
    px(20, 30, GOLD);                    // pommel
  }
}

function helm(ctx, look, col, item) {
  const { rect, px, line } = ctx;
  const hat = look.hat;
  if (hat === 'wizard') {
    for (let y = 5; y <= 17; y++) {
      const half = Math.round((y - 4) * 0.85);
      for (let x = 16 - half; x <= 16 + half; x++) px(x, y, y > 12 ? col.main : col.light);
    }
    rect(5, 18, 27, 21, col.main);
    for (let x = 6; x <= 26; x++) px(x, 22, col.dark);
    rect(8, 19, 10, 20, GOLD);
  } else if (hat === 'helmet') {
    for (let y = 8; y <= 18; y++) for (let x = 8; x <= 24; x++) {
      const dy = y - 8;
      if (x >= 8 + Math.max(0, 3 - dy) && x <= 24 - Math.max(0, 3 - dy)) px(x, y, y < 12 ? STEEL.light : STEEL.main);
    }
    rect(9, 19, 23, 21, STEEL.dark);
    rect(14, 10, 18, 14, INK);      // visor slit
    px(10, 9, [255, 255, 255]);
  } else if (hat === 'band') {
    rect(6, 14, 26, 17, col.main);
    for (let x = 7; x <= 25; x++) px(x, 18, col.dark);
    rect(12, 12, 20, 13, col.light);
    line(24, 15, 28, 20, col.dark);
  } else {
    // hood
    for (let y = 6; y <= 24; y++) for (let x = 7; x <= 25; x++) {
      const k = (x - 16) ** 2 / 90 + (y - 14) ** 2 / 120;
      if (k <= 1 && !(y > 14 && x > 11 && x < 21 && y < 22)) px(x, y, y < 12 ? col.light : col.main);
    }
    rect(11, 22, 21, 24, col.dark);
  }
}

function chest(ctx, look, col) {
  const { rect, px, line } = ctx;
  const top = look.top;
  if (top === 'robe') {
    for (let y = 5; y <= 28; y++) {
      const half = Math.round(5 + (y - 5) * 0.75);
      for (let x = 16 - half; x <= 16 + half; x++) px(x, y, y < 10 ? col.light : col.main);
    }
    line(10, 8, 16, 14, GOLD); line(22, 8, 16, 14, GOLD);
    rect(6, 26, 26, 28, col.dark);
  } else if (top === 'armor') {
    for (let y = 8; y <= 24; y++) for (let x = 9; x <= 23; x++) px(x, y, y < 12 ? STEEL.light : STEEL.main);
    rect(5, 8, 9, 13, STEEL.dark); rect(23, 8, 27, 13, STEEL.dark); // pauldrons
    line(16, 12, 16, 22, STEEL.dark);
    rect(13, 16, 19, 20, GOLD);
  } else {
    // tunic / vest
    rect(11, 9, 21, 20, col.main);
    rect(8, 10, 10, 18, col.main); rect(22, 10, 24, 18, col.main); // sleeves
    line(11, 9, 16, 14, col.light); line(21, 9, 16, 14, col.light);
    rect(14, 15, 18, 18, LEATHER.dark);
    for (let x = 12; x <= 20; x += 2) px(x, 21, col.dark);
  }
}

function belt(ctx, look, col, item) {
  const { rect, px } = ctx;
  rect(5, 15, 27, 20, LEATHER.main);
  for (let x = 6; x <= 26; x++) px(x, 21, LEATHER.dark);
  rect(13, 13, 19, 22, GOLD);
  rect(15, 15, 17, 20, LEATHER.dark);
  // class-coloured pouch
  rect(20, 16, 25, 23, col.main);
  px(21, 17, col.light);
}

function legs(ctx, look, col) {
  const { rect, px } = ctx;
  rect(11, 6, 21, 10, col.main);
  rect(11, 11, 15, 27, col.main);
  rect(17, 11, 21, 27, col.main);
  for (let y = 12; y <= 26; y++) { px(12, y, col.light); px(18, y, col.light); }
  rect(11, 26, 15, 28, LEATHER.dark); rect(17, 26, 21, 28, LEATHER.dark);
}

function boots(ctx, look, col) {
  const { rect, px } = ctx;
  if (look.shoes === 'sandals') {
    rect(9, 22, 23, 26, LEATHER.main);
    rect(9, 21, 23, 21, LEATHER.dark);
    for (let x = 11; x <= 21; x += 4) px(x, 24, GOLD);
    rect(12, 16, 13, 21, LEATHER.dark); rect(19, 16, 20, 21, LEATHER.dark);
  } else {
    rect(8, 9, 14, 23, LEATHER.main); rect(18, 9, 24, 23, LEATHER.main);
    rect(8, 23, 16, 27, LEATHER.dark); rect(18, 23, 26, 27, LEATHER.dark);
    for (let y = 10; y <= 21; y++) { px(9, y, LEATHER.light); px(19, y, LEATHER.light); }
    rect(8, 8, 14, 9, col.main); rect(18, 8, 24, 9, col.main);
  }
}

function gloves(ctx, look, col) {
  const { rect, px } = ctx;
  rect(9, 11, 22, 21, col.main);
  rect(9, 21, 22, 25, col.dark);
  for (let x = 10; x <= 21; x += 3) px(x, 23, col.light);
  rect(23, 13, 26, 17, col.main);   // thumb
  rect(9, 9, 22, 10, col.dark);     // cuff
  px(11, 13, col.light);
}

// ---------- per-item render
function render(item) {
  const ctx = makeCtx();
  const col = CLASS_COLORS[item.classId] || CLASS_COLORS.craft;
  const look = item.look || {};
  if (item.slot === 'weapon') weapon(ctx, look, col, item);
  else if (item.slot === 'helm') helm(ctx, look, col, item);
  else if (item.slot === 'chest') chest(ctx, look, col, item);
  else if (item.slot === 'belt') belt(ctx, look, col, item);
  else if (item.slot === 'legs') legs(ctx, look, col);
  else if (item.slot === 'boots') boots(ctx, look, col);
  else if (item.slot === 'gloves') gloves(ctx, look, col);
  // 1px ink outline on the outer alpha edge
  const { rgba } = ctx;
  const op = (x, y) => x >= 0 && y >= 0 && x < S && y < S && rgba[(y * S + x) * 4 + 3] > 0;
  const adds = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!op(x, y)) continue;
    const i = (y * S + x) * 4;
    const isInk = rgba[i] < 40 && rgba[i + 1] < 32 && rgba[i + 2] < 44;
    if (!isInk && (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1))) adds.push([x, y]);
  }
  for (const [x, y] of adds) {
    const i = (y * S + x) * 4;
    rgba[i] = INK[0]; rgba[i + 1] = INK[1]; rgba[i + 2] = INK[2]; rgba[i + 3] = 255;
  }
  return rgba;
}

const check = process.argv.includes('--check');
if (!check) fs.mkdirSync(OUT, { recursive: true });
let n = 0, missing = [], bad = [];
for (const id of Object.keys(EQUIPMENT)) {
  const file = path.join(OUT, `${id}.png`);
  if (check) {
    if (!fs.existsSync(file)) { missing.push(id); continue; }
    const st = fs.statSync(file);
    if (st.size < 80) bad.push(id);
    n++;
    continue;
  }
  fs.writeFileSync(file, encodeRgba(S, S, render(EQUIPMENT[id])));
  n++;
}
if (check) {
  console.log(`gear-icons: ${n}/${Object.keys(EQUIPMENT).length} icons present`);
  if (missing.length) { console.log('missing:', missing.join(',')); process.exit(1); }
  if (bad.length) { console.log('suspiciously small:', bad.join(',')); process.exit(1); }
  console.log('gear-icons: PASS');
} else {
  console.log(`wrote ${n} icons to assets/gear-icons/ (32x32)`);
}
