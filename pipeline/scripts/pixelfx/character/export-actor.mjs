#!/usr/bin/env node
// T86: export the shared bare body on the stock pixelfx walk rig.
//
// A body + a gear list + a move become a sheet, frame strip, GIF and comparison montage:
//   node pipeline/scripts/pixelfx/character/export-actor.mjs
//   node pipeline/scripts/pixelfx/character/export-actor.mjs --body barebody --gear "" --move walk
//   node pipeline/scripts/pixelfx/character/export-actor.mjs --gear archer
//
// The body is the material in ./barebody.js, drawn by the vendored rig in ./core (forked from
// pixelfx: material layers instead of DUMMY_PAL tones, plus a gear pass hook). A gear module in
// ./gear/ stacks its own material layers in front of the body's and draws its equipment through
// setGearPass, so gear is never copied into the exporter. The move is ./walk.js.
//
// Writes ONLY under output/pixelfx-character/<gear or body>/ (assets/vfx-sheets is inlined into the
// game by build.mjs, so nothing goes there):
//   <name>.png / .json   the sheet: 8 frames, 8 fps, 76x76 cells, pivot [38,62]
//   walk.gif             the same frames at 6x, 8 fps, looping
//   frames-6x.png        all 8 frames at 6x with labels
//   compare.png          bare body idle | geared idle | walk 0,2,4,6, all at 6x
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { actBounds, actTiming, posed, STAND } from './core/act.js';
import { setMaterial, setGearPass } from './core/rig.js';
import { rasterText, textWidth } from './core/font.js';
// T92: the plain body and the textured (l0veyou) body are separate materials. The bare-body actor
// sheet uses the textured one; a gear export (the archer included) stacks its layers on the plain
// body and drops the overlay, so gear is out of the texture's scope and renders as before.
import { BARE_BODY, BARE_BODY_PLAIN } from './barebody.js';
import * as walkMove from './walk.js';
import * as archerGear from './gear/archer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCALE = 6;
const PAD = 6;
const ZOOM = 6;

const BODIES = { barebody: BARE_BODY };
const GEAR = { archer: archerGear }; // slot name -> gear module (layers + drawGear)
const MOVES = { walk: walkMove };

const argv = process.argv.slice(2);
const opt = { body: 'barebody', gear: [], move: 'walk', out: null };
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--body') opt.body = argv[++i];
  else if (argv[i] === '--gear') opt.gear = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  else if (argv[i] === '--move') opt.move = argv[++i];
  else if (argv[i] === '--out') opt.out = path.resolve(argv[++i]);
  else { console.error(`unknown argument ${argv[i]}`); process.exit(2); }
}
const body = BODIES[opt.body], move = MOVES[opt.move];
if (!body) { console.error(`unknown body ${opt.body} (have: ${Object.keys(BODIES).join(', ')})`); process.exit(2); }
if (!move) { console.error(`unknown move ${opt.move} (have: ${Object.keys(MOVES).join(', ')})`); process.exit(2); }
const gearMods = opt.gear.map((g) => GEAR[g]);
gearMods.forEach((g, i) => { if (!g) { console.error(`unknown gear ${opt.gear[i]} (have: ${Object.keys(GEAR).join(', ')})`); process.exit(2); } });

// the gear's material layers stack in front of the bare body, which stays the bottom layer; with
// gear on, the gear replaces the body's clothes, so the bare body's garment overlay is dropped
// (T90: the overlay now carries the shorts and chest wrap as well as the front eyes)
const material = gearMods.length
  ? {
    ...BARE_BODY_PLAIN,
    id: `${BARE_BODY_PLAIN.id}+${opt.gear.join('+')}`,
    seam: gearMods[gearMods.length - 1].seam ?? BARE_BODY_PLAIN.seam,
    layers: [...gearMods.flatMap((g) => g.layers ?? []), ...BARE_BODY_PLAIN.layers],
    overlay: null,
  }
  : body;
// the move the gear actually plays: its pose extras merged into every key (e.g. the bow hold)
const gearPose = Object.assign({}, ...gearMods.map((g) => g.pose ?? {}));
const shownMove = gearMods.length
  ? { ...move, act: { ...move.act, poses: move.act.poses.map(([t, p, how]) => [t, { ...p, ...gearPose }, ...(how ? [how] : [])]) } }
  : move;
const gearPass = gearMods.length ? (ctx) => gearMods.forEach((g) => g.drawGear?.(ctx)) : null;
// gear modules may recolour the rig's own stock equipment (e.g. the steel WEAPONS.bow) instead of
// redrawing it: the map is applied to the rendered pixels, so the geometry and hold stay stock
const recolour = gearMods.length ? new Map(gearMods.flatMap((g) => [...(g.recolour ?? [])])) : null;
setMaterial(material);
setGearPass(gearPass);

const name = `${opt.gear.length ? opt.gear.join('-') : opt.body}-${opt.move}`;
const outDir = opt.out ?? path.join(ROOT, 'output/pixelfx-character', opt.gear[0] ?? opt.body);
const poses = shownMove.act.poses.map(([, p]) => p);
const n = poses.length, fps = move.meta.fps;
const b = actBounds(shownMove);
const cellW = b.x1 - b.x0 + PAD * 2, cellH = b.y1 - b.y0 + PAD * 2, px = PAD - b.x0, py = PAD - b.y0;
const cols = Math.ceil(Math.sqrt((n * cellH) / cellW)), rows = Math.ceil(n / cols);

// ── RGBA canvas: paste, nearest upscale, mini-font labels, PNG
const crcT = (() => {
  const t = new Int32Array(256);
  for (let k = 0; k < 256; k++) { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[k] = c; }
  return t;
})();
const crc32 = (buf) => { let c = -1; for (const v of buf) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const BG = [12, 11, 16, 255];
function canvas(w, h, fill = BG) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return {
    w, h, data,
    paste(src, sw, sh, x, y, transparent = false) {
      for (let sy = 0; sy < sh; sy++) {
        const ty = y + sy;
        if (ty < 0 || ty >= h) continue;
        for (let sx = 0; sx < sw; sx++) {
          const tx = x + sx;
          if (tx < 0 || tx >= w) continue;
          const s = (sy * sw + sx) * 4, a = src[s + 3] / 255;
          if (!a) continue;
          const d = (ty * w + tx) * 4;
          if (transparent) { data[d] = src[s]; data[d + 1] = src[s + 1]; data[d + 2] = src[s + 2]; data[d + 3] = src[s + 3]; continue; }
          for (let c = 0; c < 3; c++) data[d + c] = src[s + c] * a + data[d + c] * (1 - a);
          data[d + 3] = Math.max(data[d + 3], src[s + 3]);
        }
      }
    },
    text(str, x, y, k = 2, rgb = [200, 196, 214], font = 'mini') {
      rasterText(str, font, (gx, gy) => {
        for (let yy = 0; yy < k; yy++)
          for (let xx = 0; xx < k; xx++) {
            const tx = x + gx * k + xx, ty = y + gy * k + yy;
            if (tx >= 0 && ty >= 0 && tx < w && ty < h) data.set([...rgb, 255], (ty * w + tx) * 4);
          }
      });
    },
    png() { return encodePNG(w, h, data); },
  };
}
const upscale = (rgba, w, h, k) => {
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
    const s = (((y / k) | 0) * w + ((x / k) | 0)) * 4, d = (y * w * k + x) * 4;
    out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
  }
  return out;
};

// ── one pose, drawn by the vendored rig with this body's material
function renderPose(pose, material) {
  const cell = new Uint8ClampedArray(cellW * cellH * 4), r = posed(pose, material);
  for (let i = 0; i < r.n; i++) {
    const x = px + r.xs[i], y = py + r.ys[i];
    if (x < 0 || y < 0 || x >= cellW || y >= cellH) continue;
    const c0 = r.color[i], c = recolour?.get(c0) ?? c0, o = (y * cellW + x) * 4;
    cell[o] = c & 255; cell[o + 1] = (c >>> 8) & 255; cell[o + 2] = (c >>> 16) & 255; cell[o + 3] = (c >>> 24) & 255;
  }
  return cell;
}

// ── the sheet
const blanks = poses.map((p) => renderPose(p, material));
const sheet = canvas(cellW * cols, cellH * rows, [0, 0, 0, 0]);
const frames = [];
blanks.forEach((img, i) => {
  const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
  sheet.paste(img, cellW, cellH, x, y, true);
  frames.push({
    filename: `${name} ${i}`, frame: { x, y, w: cellW, h: cellH }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH }, sourceSize: { w: cellW, h: cellH },
    duration: Math.round(1000 / fps),
  });
});
const json = {
  frames,
  meta: {
    app: 'https://github.com/patch-gg/pixelfx', version: '1', image: `${name}.png`, format: 'RGBA8888',
    size: { w: cellW * cols, h: cellH * rows }, scale: '1',
    frameTags: [{ name, from: 0, to: n - 1, direction: 'forward' }],
    pixelfx: {
      id: `character/${name}`, name: gearMods.length ? gearMods[gearMods.length - 1].name ?? move.meta.name : move.meta.name,
      fps, loop: move.meta.loop, frames: n,
      frameSize: [cellW, cellH], pivot: [px, py], columns: cols,
      act: actTiming(shownMove),
      actor: { body: opt.body, gear: opt.gear, move: opt.move },
    },
  },
};

// ── the strips
const panel = (img, label) => {
  const c = canvas(cellW * ZOOM, cellH * ZOOM + 26);
  c.text(label, 4, 4, 2);
  c.paste(upscale(img, cellW, cellH, ZOOM), cellW * ZOOM, cellH * ZOOM, 0, 20);
  return c;
};
const strip = (items, perRow) => {
  const cols2 = Math.min(items.length, perRow), rws = Math.ceil(items.length / cols2);
  const pw = cellW * ZOOM, ph = cellH * ZOOM + 26, gap = 8;
  const img = canvas(gap + cols2 * (pw + gap), 32 + rws * (ph + gap));
  img.text(`${name}  ${n}F @ ${fps}FPS  ${cellW}x${cellH}  pivot [${px},${py}]  ${ZOOM}x`, gap, 8, 2);
  items.forEach((it, i) => {
    const x = gap + (i % cols2) * (pw + gap), y = 30 + Math.floor(i / cols2) * (ph + gap);
    img.paste(it.data, it.w, it.h, x, y);
  });
  return img;
};
const walkFrames = blanks.map((img, i) => panel(img, `walk ${i}  ${(i / fps).toFixed(3)}s`));
const frames6 = strip(walkFrames, 4);

// the comparison montage: gear runs show the same pose bare and geared, then the walk's key frames
let idles;
if (gearMods.length) {
  setGearPass(null); // the bare-body idle must not wear the gear
  const bareIdle = renderPose(STAND, body);
  setGearPass(gearPass);
  idles = [panel(bareIdle, 'bare body idle'), panel(renderPose({ ...STAND, ...gearPose }, material), `${opt.gear.join('+')} idle`)];
} else {
  setMaterial(null); // the rig's stock grey, for the before/after panel
  const greyIdle = renderPose(STAND);
  setMaterial(material);
  idles = [
    panel(greyIdle, 'stock grey idle'),
    panel(renderPose(STAND, body), 'bare body idle'),
  ];
}
const pick = [0, 2, 4, 6].map((i) => panel(blanks[i], `walk ${i}  ${(i / fps).toFixed(3)}s`));
const compare = strip([...idles, ...pick], 6);

// ── the looping GIF (ffmpeg, raw rgba frames)
function writeGif(file) {
  const W = cellW * ZOOM, H = cellH * ZOOM, parts = [];
  for (const img of blanks) parts.push(Buffer.from(upscale(img, cellW, cellH, ZOOM).buffer));
  const vf = 'split[a][b];[a]palettegen=max_colors=255:stats_mode=full[p];[b][p]paletteuse=dither=none';
  const args = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-', '-vf', vf, '-loop', '0', file];
  const res = spawnSync('ffmpeg', args, { input: Buffer.concat(parts), maxBuffer: 1 << 30 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`ffmpeg failed: ${res.stderr}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${name}.png`), sheet.png());
fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(json, null, 1));
fs.writeFileSync(path.join(outDir, 'frames-6x.png'), frames6.png());
fs.writeFileSync(path.join(outDir, 'compare.png'), compare.png());
writeGif(path.join(outDir, 'walk.gif'));

console.log(
  `${opt.body} + [${opt.gear.join(',')}] + ${opt.move} -> ${path.relative(ROOT, outDir)}/${name}.{png,json}  ` +
  `${cellW}x${cellH}, pivot [${px},${py}], ${n} frames @ ${fps} fps, ${cols} columns; walk.gif, frames-6x.png, compare.png`,
);
