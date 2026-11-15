// Class-gear montages: the six Mistvale classes rendered by the vendored pixelfx rig, at 6x, so the
// silhouettes and weapons can be judged at game scale.
//
//   node pipeline/scripts/pixelfx/character/gear/montage.mjs
//       -> output/pixelfx-character/gear-lineup.png      (six classes: idle | walk mid | strike, labelled)
//       -> output/pixelfx-character/<class>/compare.png  (that class's walk 8 frames at 6x, labelled)
//
//   node pipeline/scripts/pixelfx/character/gear/montage.mjs --probe sorcerer [--scale 1.83] [--sa -1.2,-.6,0,.6]
//       -> output/pixelfx-character/gear-dev/sorcerer.png  (idle + walk 0-7 + strike + sa variants)
//
// The rig draws one pose into its own depth buffer (the pixel list a sheet would be built from); this
// file pastes those pixels into RGBA canvases, upscales x6 and labels them with core/font.js. No new
// dependencies: png-io.mjs is the only writer. It never edits the exporter or the core rig.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { posed, setMaterial, setGearPass, STAND } from '../core/rig.js';
import { rasterText } from '../core/font.js';
import { BARE_BODY_PLAIN } from '../barebody.js';
import { encodePNG } from '../png-io.mjs';
import * as walkMove from '../walk.js';
import * as idleMove from '../idle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const OUT = path.join(ROOT, 'output/pixelfx-character');
const PAD = 6;
// a light-neutral sheet background: the rig inks each sprite with a near-black outline, which is
// invisible on a near-black background (lead review: "edges blend into the background")
const BG = [104, 98, 112, 255];
const BORDER = [44, 41, 56, 255];

// ── class table: the sheet slot name the exporter uses, and the label on the montage
const CLASSES = [
  { id: 'berserker', label: 'BERSERKER' },
  { id: 'paladin', label: 'PALADIN' },
  { id: 'sorcerer', label: 'SORCERER' },
  { id: 'archer', label: 'ARCHER' },
  { id: 'assassin', label: 'ASSASSIN' },
  { id: 'priest', label: 'PRIEST' },
];

// The strike pose each class is shown with in the lineup: a committed lunge (near foot forward, body
// leaning in) plus that class's weapon hold for the contact frame. These live only here — the real
// attack moves are the exporter owner's files, this is the visual check of the look.
const STRIKE = {
  berserker: { lean: 8, crouch: 1, turn: 0.34, ffx: 6, ffy: -4, fbx: -3, fby: -4, fx: 10, fy: -17, bx: -8, by: -16, sa: -0.45, wl: 0.9 },
  paladin: { lean: 7, crouch: 1, turn: 0.3, ffx: 5, ffy: -4, fbx: -3, fby: -4, fx: 7, fy: -20, bx: 6, by: -18, sa: -1.15, sb: -0.35 },
  sorcerer: { lean: 6, crouch: 1, turn: 0.3, ffx: 5, ffy: -4, fbx: -3, fby: -4, fx: 6, fy: -17, bx: 9, by: -16, sa: -0.15 },
  archer: { lean: 6, crouch: 1, turn: 0.3, ffx: 5, ffy: -4, fbx: -3, fby: -4, fx: 8, fy: -20, bx: 4, by: -19, sa: -1.2, pull: true, nocked: true },
  assassin: { lean: 8, crouch: 1, turn: 0.3, ffx: 6, ffy: -4, fbx: -3, fby: -4, fx: 10, fy: -16, bx: 9, by: -17, sa: -0.1, sb: -0.2 },
  priest: { lean: 6, crouch: 1, turn: 0.3, ffx: 5, ffy: -4, fbx: -3, fby: -4, fx: 6, fy: -18, bx: 9, by: -17, sa: -0.55 },
};

// ── args
const argv = process.argv.slice(2);
const opt = { probe: null, only: null, scale: 1, zoom: 6, sa: null };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--faces') opt.faces = true;
  else if (argv[i] === '--probe') opt.probe = argv[++i];
  else if (argv[i] === '--only') opt.only = argv[++i].split(',');
  else if (argv[i] === '--scale') opt.scale = Number(argv[++i]);
  else if (argv[i] === '--zoom') opt.zoom = Number(argv[++i]);
  else if (argv[i] === '--frames') opt.frames = argv[++i].split(',');
  else if (argv[i] === '--sa') { const v = argv[++i]; opt.sa = v === 'none' ? [] : v.split(',').map(Number); }
  else if (argv[i] === '--variants') opt.variants = JSON.parse(argv[++i]);
  else if (argv[i] === '--hold') {
    // --hold "2,-21,-2.15 0,-22,-2.15"  -> fx, fy, sa per space-separated group
    opt.variants = argv[++i].trim().split(/\s+/).map((g) => {
      const [fx, fy, sa, wl] = g.split(',').map(Number);
      return { fx, fy, ...(Number.isFinite(sa) ? { sa } : {}), ...(Number.isFinite(wl) ? { wl } : {}) };
    });
  }
  else { console.error(`unknown argument ${argv[i]}`); process.exit(2); }
}

// ── the move poses, composed the way export-actor.mjs composes them: {move pose} + gear pose
const idlePoses = idleMove.act.poses.map(([, p]) => ({ ...idleMove.meta?.pose, ...p }));
const walkPoses = walkMove.act.poses.map(([, p]) => p);
const walkFps = walkMove.meta.fps;

function classFrames(id, mod) {
  const gp = mod.pose ?? {};
  const idle = { ...STAND, ...idlePoses[0], ...gp };
  const walk = walkPoses.map((p) => ({ ...p, ...gp }));
  const strike = { ...STAND, ...gp, ...(STRIKE[id] ?? {}) };
  return { idle, walk, strike, gp };
}

// ── rendering: one material per class (distinct material.id keeps posed()'s cache honest)
function materialFor(mod, slot) {
  return {
    ...BARE_BODY_PLAIN,
    id: `${BARE_BODY_PLAIN.id}+${slot}`,
    seam: mod.seam ?? BARE_BODY_PLAIN.seam,
    layers: [...(mod.layers ?? []), ...BARE_BODY_PLAIN.layers],
    overlay: null,
  };
}

function renderClass(slot, mod, poses, scale) {
  const material = materialFor(mod, slot);
  const recolour = new Map([...(mod.recolour ?? [])]);
  setMaterial(material);
  setGearPass(mod.drawGear ? (ctx) => mod.drawGear(ctx) : null);
  const outs = poses.map((p) => posed(scale ? { ...p, scale } : p, material));
  return { outs, recolour };
}

function boundsOf(outs) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of outs) {
    if (!r.n) continue;
    if (r.x0 < x0) x0 = r.x0;
    if (r.y0 < y0) y0 = r.y0;
    if (r.x1 > x1) x1 = r.x1;
    if (r.y1 > y1) y1 = r.y1;
  }
  return { x0, y0, x1, y1 };
}

function rasterize(r, recolour, cellW, cellH, px, py) {
  const buf = new Uint8ClampedArray(cellW * cellH * 4);
  for (let i = 0; i < r.n; i++) {
    const x = px + r.xs[i], y = py + r.ys[i];
    if (x < 0 || y < 0 || x >= cellW || y >= cellH) continue;
    const c0 = r.color[i], c = recolour.get(c0) ?? c0, o = (y * cellW + x) * 4;
    buf[o] = c & 255; buf[o + 1] = (c >>> 8) & 255; buf[o + 2] = (c >>> 16) & 255; buf[o + 3] = (c >>> 24) & 255;
  }
  return buf;
}

// ── RGBA canvas: 1x blit, nearest upscale blit, mini-font text, PNG
function makeCanvas(w, h, fill = BG) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return {
    w, h, data,
    fillRect(x, y, rw, rh, c) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) {
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        data.set(c, (yy * w + xx) * 4);
      }
    },
    text(str, x, y, k = 2, rgb = [200, 196, 214]) {
      rasterText(str, 'mini', (gx, gy) => {
        for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
          const tx = x + gx * k + xx, ty = y + gy * k + yy;
          if (tx >= 0 && ty >= 0 && tx < w && ty < h) data.set([...rgb, 255], (ty * w + tx) * 4);
        }
      });
    },
    // blit a 1x RGBA buffer, each source pixel becoming zoom x zoom
    blit(src, sw, sh, dx, dy, zoom = 1) {
      for (let sy = 0; sy < sh; sy++) for (let sx = 0; sx < sw; sx++) {
        const s = (sy * sw + sx) * 4;
        if (!src[s + 3]) continue;
        for (let yy = 0; yy < zoom; yy++) for (let xx = 0; xx < zoom; xx++) {
          const tx = dx + sx * zoom + xx, ty = dy + sy * zoom + yy;
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const o = (ty * w + tx) * 4;
          data[o] = src[s]; data[o + 1] = src[s + 1]; data[o + 2] = src[s + 2]; data[o + 3] = src[s + 3];
        }
      }
    },
    // blit a sub-rectangle of a 1x RGBA buffer, each source pixel becoming zoom x zoom
    blitRect(src, sw, sx0, sy0, rw, rh, dx, dy, zoom = 1) {
      for (let sy = 0; sy < rh; sy++) for (let sx = 0; sx < rw; sx++) {
        const s = ((sy0 + sy) * sw + (sx0 + sx)) * 4;
        if (s < 0 || s + 3 >= src.length || !src[s + 3]) continue;
        for (let yy = 0; yy < zoom; yy++) for (let xx = 0; xx < zoom; xx++) {
          const tx = dx + sx * zoom + xx, ty = dy + sy * zoom + yy;
          if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
          const o = (ty * w + tx) * 4;
          data[o] = src[s]; data[o + 1] = src[s + 1]; data[o + 2] = src[s + 2]; data[o + 3] = src[s + 3];
        }
      }
    },
    frame(x, y, rw, rh, c = BORDER) {
      this.fillRect(x, y, rw, 2, c); this.fillRect(x, y + rh - 2, rw, 2, c);
      this.fillRect(x, y, 2, rh, c); this.fillRect(x + rw - 2, y, 2, rh, c);
    },
    png() { return encodePNG(w, h, data); },
  };
}

const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_/.,:!?+()';

// ── probe: one class, big, for eyeballing while the gear is authored
function probeSheet(id) {
  const mod = modTable[id];
  if (!mod) { console.error(`no gear module ${id}`); process.exit(2); }
  const f = classFrames(id, mod);
  const frames = [];
  frames.push({ label: `IDLE`, pose: f.idle, id: 'idle' });
  f.walk.forEach((p, i) => frames.push({ label: `WALK ${i}`, pose: p, id: `walk${i}` }));
  frames.push({ label: `STRIKE`, pose: f.strike, id: 'strike' });
  for (const sa of (opt.sa ?? [-1.4, -0.9, -0.4, 0, 0.4, 0.9]).filter(Number.isFinite)) {
    frames.push({ label: `IDLE SA ${sa.toFixed(2)}`, pose: { ...f.idle, sa }, id: `sa${sa}` });
  }
  for (const [i, v] of (opt.variants ?? []).entries()) {
    frames.push({ label: `VAR ${i} ${JSON.stringify(v)}`, pose: { ...f.idle, ...v }, id: `var${i}` });
  }
  const shown = opt.frames
    ? frames.filter((x) => opt.frames.some((sel) => x.id === sel || ((sel === 'sa' || sel === 'var') && x.id.startsWith(sel))))
    : frames;
  const { outs, recolour } = renderClass(id, mod, shown.map((x) => x.pose), opt.scale);
  const b = boundsOf(outs);
  const cellW = b.x1 - b.x0 + 1 + PAD * 2, cellH = b.y1 - b.y0 + 1 + PAD * 2, px = PAD - b.x0, py = PAD - b.y0;
  const zoom = opt.zoom;
  const cols = Math.min(4, Math.max(1, Math.min(shown.length, 4))), rows = Math.ceil(outs.length / cols);
  const pw = cellW * zoom + 10, ph = cellH * zoom + 24;
  const img = makeCanvas(12 + cols * pw, 34 + rows * ph);
  img.text(`${id.toUpperCase()} PROBE  scale ${opt.scale}  cell ${cellW}x${cellH}  pivot [${px},${py}]  ${zoom}x`, 12, 10, 2, [235, 230, 245]);
  outs.forEach((out, i) => {
    const cell = rasterize(out, recolour, cellW, cellH, px, py);
    const x = 12 + (i % cols) * pw, y = 26 + Math.floor(i / cols) * ph;
    img.text(shown[i].label, x + 4, y + 2, 2, [180, 175, 200]);
    img.blit(cell, cellW, cellH, x + 4, y + 20, zoom);
  });
  fs.mkdirSync(path.join(OUT, 'gear-dev'), { recursive: true });
  const file = path.join(OUT, 'gear-dev', `${id}.png`);
  fs.writeFileSync(file, img.png());
  console.log(`probe ${id} -> ${path.relative(ROOT, file)}  (${img.w}x${img.h}, ${outs.length} frames)`);
}

// ── the per-class compare: that class's walk, 8 frames at 6x, labelled
function compareSheet(id) {
  const mod = modTable[id];
  if (!mod) { console.error(`no gear module ${id}`); process.exit(2); }
  const f = classFrames(id, mod);
  const frames = f.walk.map((p, i) => ({ label: `WALK ${i}  ${(i / walkFps).toFixed(2)}S`, pose: p }));
  const { outs, recolour } = renderClass(id, mod, frames.map((x) => x.pose), opt.scale);
  const b = boundsOf(outs);
  const cellW = b.x1 - b.x0 + 1 + PAD * 2, cellH = b.y1 - b.y0 + 1 + PAD * 2, px = PAD - b.x0, py = PAD - b.y0;
  const zoom = 6, cols = 4, rows = 2;
  const pw = cellW * zoom + 10, ph = cellH * zoom + 24;
  const img = makeCanvas(12 + cols * pw, 34 + rows * ph);
  img.text(`${f.label ?? id.toUpperCase()} WALK  ${outs.length}F @ ${walkFps}FPS  ${cellW}x${cellH}  ${zoom}x  scale ${opt.scale}`, 12, 10, 2, [235, 230, 245]);
  outs.forEach((out, i) => {
    const cell = rasterize(out, recolour, cellW, cellH, px, py);
    const x = 12 + (i % cols) * pw, y = 26 + Math.floor(i / cols) * ph;
    img.text(frames[i].label, x + 4, y + 2, 2, [180, 175, 200]);
    img.blit(cell, cellW, cellH, x + 4, y + 20, zoom);
  });
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  const file = path.join(OUT, id, 'compare.png');
  fs.writeFileSync(file, img.png());
  console.log(`compare ${id} -> ${path.relative(ROOT, file)}  (${img.w}x${img.h})`);
}

// ── the face band of every class at 12x: the lead's "2 dark eyes + a highlight is what sells a
// character at 1x" check, cropped to the head so it can be judged without a 12x whole sheet
function facesSheet(ids) {
  const Z = opt.zoom >= 12 ? opt.zoom : 12, rows = 15;
  const panels = [];
  for (const id of ids) {
    const mod = modTable[id];
    if (!mod) continue;
    const f = classFrames(id, mod);
    const { outs, recolour } = renderClass(id, mod, [f.idle], opt.scale);
    const r = outs[0];
    const cellW = r.x1 - r.x0 + 1 + PAD * 2, cellH = r.y1 - r.y0 + 1 + PAD * 2;
    const cell = rasterize(r, recolour, cellW, cellH, PAD - r.x0, PAD - r.y0);
    let top = -1;
    for (let y = 0; y < cellH && top < 0; y++) for (let x = 0; x < cellW; x++) if (cell[(y * cellW + x) * 4 + 3]) { top = y; break; }
    let lx = 1e9, rx = -1e9;
    for (let y = top; y < Math.min(cellH, top + rows); y++) for (let x = 0; x < cellW; x++) {
      if (!cell[(y * cellW + x) * 4 + 3]) continue;
      if (x < lx) lx = x; if (x > rx) rx = x;
    }
    const x0 = Math.max(0, lx - 1), w = Math.min(cellW - x0, rx - lx + 3);
    panels.push({ label: CLASSES.find((c) => c.id === id).label, cell, cellW, x0, top, w });
  }
  const pw = Math.max(...panels.map((p) => p.w)) * Z + 14;
  const img = makeCanvas(12 + panels.length * pw, 36 + rows * Z + 8);
  img.text(`FACES @ ${Z}X  - the head of every class in idle (eyes + cheek highlight are the 1x tell)`, 12, 10, 2, [235, 230, 245]);
  panels.forEach((p, i) => {
    const x = 12 + i * pw;
    img.text(p.label, x + 2, 24, 1, [242, 224, 160]);
    img.blitRect(p.cell, p.cellW, p.x0, p.top, p.w, rows, x + 2, 36, Z);
  });
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'gear-faces.png');
  fs.writeFileSync(file, img.png());
  console.log(`faces -> ${path.relative(ROOT, file)}  (${img.w}x${img.h}, ${panels.length} heads)`);
}

// ── the lineup: the six classes side by side, idle | walk mid | strike, one shared cell
function lineupSheet(ids) {
  const perClass = [];
  for (const id of ids) {
    const mod = modTable[id];
    if (!mod) { console.error(`no gear module ${id}`); process.exit(2); }
    const f = classFrames(id, mod);
    const frames = [
      { label: 'IDLE', pose: f.idle },
      { label: `WALK 2  ${(2 / walkFps).toFixed(2)}S`, pose: f.walk[2] },
      { label: 'STRIKE', pose: f.strike },
    ];
    const { outs, recolour } = renderClass(id, mod, frames.map((x) => x.pose), opt.scale);
    perClass.push({ id, label: CLASSES.find((c) => c.id === id).label, outs, recolour, frames });
  }
  const all = perClass.flatMap((c) => c.outs);
  const b = boundsOf(all);
  const cellW = b.x1 - b.x0 + 1 + PAD * 2, cellH = b.y1 - b.y0 + 1 + PAD * 2, px = PAD - b.x0, py = PAD - b.y0;
  const zoom = 6, gutter = 14, rowGap = 6;
  const colW = cellW * zoom + 10, rowH = cellH * zoom + 22;
  const oneRow = cellH + 22; // the 1:1 row: the lead's acceptance test is "readable at 1x"
  const img = makeCanvas(14 + perClass.length * colW, 52 + 3 * rowH + oneRow);
  img.text(`MISTVALE CLASS GEAR  ${perClass.length} CLASSES  CELL ${cellW}x${cellH}  PIVOT [${px},${py}]  ${zoom}XS  SCALE ${opt.scale}`, 14, 10, 2, [235, 230, 245]);
  img.text('IDLE / WALK MID / ATTACK STRIKE  +  1:1 IDLE ROW BELOW (actual game pixel size)', 14, 28, 2, [170, 165, 190]);
  perClass.forEach((c, ci) => {
    const x0 = 14 + ci * colW;
    img.text(c.label, x0 + 4, 42, 2, [242, 224, 160]);
    c.outs.forEach((out, ri) => {
      const cell = rasterize(out, c.recolour, cellW, cellH, px, py);
      const x = x0 + 4, y = 56 + ri * rowH;
      img.text(c.frames[ri].label, x, y, 1, [170, 165, 190]);
      img.blit(cell, cellW, cellH, x, y + 8, zoom);
    });
    const y1 = 56 + 3 * rowH;
    img.text('1:1 IDLE', x0 + 4, y1, 1, [170, 165, 190]);
    img.blit(rasterize(c.outs[0], c.recolour, cellW, cellH, px, py), cellW, cellH, x0 + 4, y1 + 9, 1);
  });
  void gutter; void rowGap;
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'gear-lineup.png');
  fs.writeFileSync(file, img.png());
  console.log(`lineup -> ${path.relative(ROOT, file)}  (${img.w}x${img.h}, ${perClass.length} classes)`);
}

// ── load the gear modules (the same sibling import the exporter does: one file per class, no table edit)
const modTable = {};
for (const c of CLASSES) {
  try { modTable[c.id] = await import(new URL(`./${c.id}.js`, import.meta.url).href); }
  catch (e) { if (c.id === opt.probe) { console.error(`cannot load gear/${c.id}.js: ${e.message}`); process.exit(2); } }
}
for (const id of opt.only ?? []) if (!modTable[id]) { console.error(`no gear module ${id}`); process.exit(2); }
void alph;

if (opt.faces) facesSheet((opt.only ?? CLASSES.map((c) => c.id)).filter((id) => modTable[id]));
else if (opt.probe) probeSheet(opt.probe);
else {
  const ids = (opt.only ?? CLASSES.map((c) => c.id)).filter((id) => modTable[id]);
  lineupSheet(ids);
  for (const id of ids) compareSheet(id);
}
