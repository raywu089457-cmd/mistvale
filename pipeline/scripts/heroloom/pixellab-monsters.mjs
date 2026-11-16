// PixelLab monster generator for the HeroLoom monster pack.
//
// For each monster id:
//   1. POST /v2/create-character-v3  (8 directions, 128 px, low top-down)
//   2. POST /v2/characters/animations (mode v3, east direction)
//      idle 4f / walk 8f / attack 6f / hurt 3f / death 5f
//   3. download frames -> output/heroloom-ext/monsters-pl/<id>/raw/<action>/
//   4. compose 1280x800 sheet (8 cols x 5 rows of 160 px cells) + meta.json
//      -> output/heroloom-ext/monsters-pl/<id>/{sheet.png,meta.json}
//
// The composed sheet satisfies tools/checks/heroloom-monsters3.mjs
// "replacement" regime: binary alpha, 5 exact action rows, baseline y=148,
// ink outline >= 1.5%, palette <= 64.
//
// Usage:
//   node pipeline/scripts/heroloom/pixellab-monsters.mjs --ids=mole,boar
//   node pipeline/scripts/heroloom/pixellab-monsters.mjs --id=mole --compose-only
//   node pipeline/scripts/heroloom/pixellab-monsters.mjs --boss      (treant, 224 cell)
//
// Token: PIXELLAB_TOKEN, else ~/.pixellab-token-2 (the backup account; the
// primary ~/.pixellab-token only has a few hundred generations left).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodePng, encodeRgba } from './png.mjs';

const API = 'https://api.pixellab.ai/v2';
const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'output/heroloom-ext/monsters-pl');
const CELL = 160;
const COLS = 8;
const ROWS = 5;
const BASELINE = 148;      // cell - footFromBottom (160 - 12)
const ART_H = 100;         // target art height for regular monsters
const ART_H_BOSS = 140;    // treant
const INK = [21, 13, 27];  // #150d1b

// HeroLoom material ramps (same hexes as restyle-monsters3.mjs, all exact entries of
// assets/heroloom-scene/palette.json). PixelLab shading is much richer than HeroLoom art,
// so every composed pixel is snapped to its nearest ramp step: the monster ends up with a
// small flat palette and the same warm ramp feel as the rest of the pack.
const RAMPS = {
  shadow: ['#19192d', '#3e2029'],
  grey: ['#353a47', '#4a4a52', '#6b6b73', '#9a9aa0'],
  leather: ['#4a2f1c', '#79553a', '#8a613f', '#a67c44'],
  skin: ['#8a5a33', '#a8753f', '#c8a05a', '#e0c080'],
  bone: ['#ad8a63', '#d1aa7d', '#e1cbbc', '#ece8da'],
  green: ['#435521', '#546a21', '#718e32', '#98aa44'],
  ice: ['#457b9f', '#84c9e5', '#aee1f6', '#d7e8ef'],
  blue: ['#1b2d4f', '#2d4b73', '#486495', '#4e7daa'],
  white: ['#c8c8c8', '#e1cbbc', '#ece8da', '#f6faf3'],
  accent: ['#6a2a17', '#be2d29', '#e69436', '#ecc35e', '#d58a76'],
};

function srgbToOklab(r, g, b) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}

const RAMP_ENTRIES = Object.entries(RAMPS).flatMap(([family, hexes]) => hexes.map((hex) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lab = srgbToOklab(r, g, b);
  return { family, hex, r, g, b, lab };
}));
const INK_ENTRIES = [[21, 13, 27]].map((rgb) => ({ hex: '#150d1b', r: rgb[0], g: rgb[1], b: rgb[2], lab: srgbToOklab(...rgb) }));
const RAMP_CACHE = new Map();

function snapToRamp(r, g, b) {
  const key = (r << 16) | (g << 8) | b;
  const hit = RAMP_CACHE.get(key);
  if (hit) return hit;
  const lab = srgbToOklab(r, g, b);
  let best = null, bestD = Infinity;
  for (const e of [...RAMP_ENTRIES, ...INK_ENTRIES]) {
    const d = (e.lab.L - lab.L) ** 2 * 2 + (e.lab.a - lab.a) ** 2 + (e.lab.b - lab.b) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  const rgb = [best.r, best.g, best.b];
  RAMP_CACHE.set(key, rgb);
  return rgb;
}

function snapSheetToRamps(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const [r, g, b] = snapToRamp(rgba[i], rgba[i + 1], rgba[i + 2]);
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b;
  }
}

// `frames` is what the game sheet needs. `request` is what PixelLab v3 accepts:
// v3 only takes an even frame_count in 4..16, and it always returns
// frame_count + 1 images (the source rotation as frame 0), so we request an
// even count and later drop the leading frame(s) down to `frames`.
const ACTIONS = [
  { key: 'idle', y: 0, frames: 4, request: 4, frameTime: 0.25, loop: true },
  { key: 'walk', y: 160, frames: 8, request: 8, frameTime: 0.125, cycle: 85 },
  { key: 'attack', y: 320, frames: 6, request: 6, frameTime: 0.09, release: 3, impact: 4 },
  { key: 'hurt', y: 480, frames: 3, request: 4, frameTime: 0.1 },
  { key: 'death', y: 640, frames: 5, request: 6, frameTime: 0.14 },
];

const PROMPTS = {
  mole: 'small chunky brown mole monster with big pink claws, pink nose and tiny eyes',
  boar: 'stocky wild boar monster with tusks, bristly dark brown fur and angry eyes',
  goat: 'white mountain goat monster with curved horns, beard and hooves',
  snowhare: 'fluffy white snow hare monster with long ears and a pale blue scarf',
  shroom: 'walking red mushroom monster with cream spots and small stubby legs',
  floraspirit: 'small flower spirit monster with a green leaf body and a pink petal head',
  sprout: 'tiny green seedling monster with two leaf arms and a cheerful face',
  stag: 'brown deer stag monster with big branching antlers and sturdy legs',
  birchling: 'small birch tree monster with white bark, black marks and green leaf hair',
  kobold: 'small blue-grey kobold monster with big ears and a wooden spear',
  ram: 'grey woolly ram monster with heavy curled horns and stubby legs',
  yeti: 'big white furry yeti monster with a pale blue face and long arms',
  icebeetle: 'round ice-blue beetle monster with a crystal shell and six little legs',
  boulder: 'living grey rock golem monster with a mossy back and thick arms',
  cactus: 'green walking cactus monster with spikes and a pink flower on top',
  scorpion: 'sandy desert scorpion monster with raised stinger tail and big pincers',
  vine: 'twisting green vine monster with thorny tendrils and red berries',
  snowman: 'cheerful snowman monster with a carrot nose and twig arms',
  mummy: 'bandaged mummy monster with glowing eyes wrapped in pale grey cloth',
  wolfman: 'brown werewolf monster with claws, fangs and tufted fur',
  moss: 'round green moss slime monster with tiny eyes and soft mossy lumps',
  treant: 'huge ancient tree monster boss with mossy bark, glowing eyes and thick branch arms',
};

const STYLE = ', chunky cute pixel art game monster, side view facing right, single color thick black outline, limited 12-color palette, flat pixel shading, transparent background, full body, centered';

function token() {
  if (process.env.PIXELLAB_TOKEN) return process.env.PIXELLAB_TOKEN.trim();
  const f = path.join(os.homedir(), '.pixellab-token-2');
  return fs.readFileSync(f, 'utf8').trim();
}

const H = () => ({ authorization: 'Bearer ' + token(), 'content-type': 'application/json' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(API + p, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
      const txt = await r.text();
      if (r.status === 429) { await sleep(15000); continue; }
      if (r.status !== 200) throw new Error(`${method} ${p} -> ${r.status}\n${txt.slice(0, 600)}`);
      return JSON.parse(txt);
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(4000);
    }
  }
}

async function poll(jobId, label) {
  const t0 = Date.now();
  for (;;) {
    const j = await api('GET', '/background-jobs/' + jobId);
    if (j.status === 'completed') return j;
    if (j.status === 'failed') throw new Error(`${label} job failed: ${JSON.stringify(j).slice(0, 500)}`);
    if (Date.now() - t0 > 900000) throw new Error(`${label} timeout`);
    await sleep(4000);
  }
}

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

async function createCharacter(id, size = 128) {
  const body = {
    description: PROMPTS[id] + STYLE,
    image_size: { width: size, height: size },
    view: 'low top-down',
    outline: 'single color black outline',
    n_directions: 8,
    seed: (id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 90) + 7,
  };
  const created = await api('POST', '/create-character-v3', body);
  const jobs = created.background_job_ids || (created.background_job_id ? [created.background_job_id] : []);
  let cid = created.character_id;
  for (const job of jobs) {
    const done = await poll(job, id + ':create');
    const lr = done.last_response || {};
    log(`  create ${id} usage`, JSON.stringify(lr.billing_usage));
    cid = lr.character_id || cid;
  }
  return cid;
}

async function animate(id, cid, action) {
  const desc = {
    idle: 'standing idle in place, gentle breathing, body rises and falls a little, no root motion',
    walk: 'walking forward on the spot, legs stepping, arms swinging, side view facing right',
    attack: 'winding up then lunging forward with claws and teeth, aggressive attack, returns to stance',
    hurt: 'hit reaction, recoiling backwards in pain, flinching',
    death: 'dying, collapsing and falling over onto the ground, staying down',
  }[action.key];
  const body = {
    character_id: cid,
    mode: 'v3',
    action_description: desc,
    frame_count: action.request,
    directions: ['east'],
    seed: 21,
  };
  const r = await api('POST', '/characters/animations', body);
  const jobs = r.background_job_ids || [];
  let frames = [];
  for (const job of jobs) {
    const done = await poll(job, `${id}:${action.key}`);
    const lr = done.last_response || {};
    log(`  anim ${id}/${action.key} usage`, JSON.stringify(lr.billing_usage), 'frames', (lr.images || []).length);
    frames = lr.images || [];
  }
  const dir = path.join(OUT, id, 'raw', action.key);
  fs.mkdirSync(dir, { recursive: true });
  frames.forEach((f, i) => {
    const buf = f.base64 ? Buffer.from(f.base64, 'base64') : null;
    if (buf) fs.writeFileSync(path.join(dir, `frame-${String(i).padStart(2, '0')}.png`), buf);
  });
  const got = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length;
  if (got !== action.request && got !== action.request + 1) log(`  WARN ${id}/${action.key}: got ${got} frames, requested ${action.request}`);
  return got;
}

async function generate(id, boss = false) {
  fs.mkdirSync(path.join(OUT, id), { recursive: true });
  const size = boss ? 256 : 128;
  let cid;
  const cidPath = path.join(OUT, id, 'character.json');
  if (fs.existsSync(cidPath)) {
    cid = JSON.parse(fs.readFileSync(cidPath, 'utf8')).character_id;
    log(`${id}: reuse character ${cid}`);
  } else {
    cid = await createCharacter(id, size);
    fs.writeFileSync(cidPath, JSON.stringify({ id, character_id: cid, size }, null, 1));
    log(`${id}: character ${cid}`);
  }
  // keep the east rotation (idle reference) too
  const ch = await api('GET', '/characters/' + cid);
  const east = (ch.rotation_urls || {}).east;
  if (east) {
    const dir = path.join(OUT, id, 'raw', 'rotation');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'east.png'), Buffer.from(await (await fetch(east)).arrayBuffer()));
  }
  for (const a of ACTIONS) {
    const dir = path.join(OUT, id, 'raw', a.key);
    const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length : 0;
    if (have >= a.frames) { log(`${id}/${a.key}: already have ${have} frames`); continue; }
    await animate(id, cid, a);
  }
}

// ------------------------------------------------------------------ composing

function bboxOf(img) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.rgba[(y * img.width + x) * 4 + 3] >= 128) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function binaryAlpha(img) {
  for (let i = 3; i < img.rgba.length; i += 4) img.rgba[i] = img.rgba[i] >= 128 ? 255 : 0;
  return img;
}

function loadFrames(id, action) {
  const dir = path.join(OUT, id, 'raw', action.key);
  let files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  // PixelLab returns request+1 frames (source rotation first); drop the leading
  // frame(s) until exactly `frames` remain, so the clip is pure motion.
  while (files.length > action.frames) files = files.slice(1);
  if (files.length < action.frames) throw new Error(`${id}/${action.key}: only ${files.length}/${action.frames} frames on disk`);
  return files.map((f) => binaryAlpha(decodePng(fs.readFileSync(path.join(dir, f)))));
}

function addInk(img) {
  // 1px inner dark outline on the silhouette edge (#150d1b) for the HeroLoom look.
  const { width: w, height: h, rgba } = img;
  const out = new Uint8Array(rgba);
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rgba[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (rgba[i + 3] === 0) continue;
    if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
      out[i] = INK[0]; out[i + 1] = INK[1]; out[i + 2] = INK[2]; out[i + 3] = 255;
    }
  }
  img.rgba = out;
  return img;
}

function compose(id, boss = false) {
  const target = boss ? ART_H_BOSS : ART_H;
  const frames = Object.fromEntries(ACTIONS.map((a) => [a.key, loadFrames(id, a)]));
  for (const a of ACTIONS) {
    if (frames[a.key].length !== a.frames) throw new Error(`${id}/${a.key}: need ${a.frames} frames, have ${frames[a.key].length}`);
  }
  // scale from the idle frame (largest, most representative)
  const baseBox = bboxOf(frames.idle[0]);
  if (!baseBox) throw new Error(`${id}: idle frame 0 is empty`);
  let scale = target / baseBox.h;
  const maxBox = Math.max(...ACTIONS.flatMap((a) => frames[a.key].map((f) => bboxOf(f)?.h || 0)));
  if (maxBox * scale > target * 1.18) scale = (target * 1.18) / maxBox;

  const sheetW = COLS * CELL, sheetH = ROWS * CELL;
  const sheet = new Uint8Array(sheetW * sheetH * 4);
  let artSize = 0;
  for (const a of ACTIONS) {
    frames[a.key].forEach((frame, idx) => {
      const box = bboxOf(frame);
      if (!box) return;
      const sw = Math.max(1, Math.round(box.w * scale));
      const sh = Math.max(1, Math.round(box.h * scale));
      artSize = Math.max(artSize, sh);
      const cx = Math.floor((idx % COLS) * CELL + CELL / 2);
      const rowTop = a.y;
      const baseY = rowTop + BASELINE;
      const ox = cx - Math.floor(sw / 2);
      const oy = baseY - sh;
      for (let y = 0; y < sh; y++) {
        const sy = box.minY + Math.min(box.h - 1, Math.floor((y + 0.5) / scale));
        for (let x = 0; x < sw; x++) {
          const sx = box.minX + Math.min(box.w - 1, Math.floor((x + 0.5) / scale));
          const si = (sy * frame.width + sx) * 4;
          if (frame.rgba[si + 3] === 0) continue;
          const tx = ox + x, ty = oy + y;
          if (tx < 0 || ty < 0 || tx >= sheetW || ty >= sheetH) continue;
          const di = (ty * sheetW + tx) * 4;
          sheet[di] = frame.rgba[si]; sheet[di + 1] = frame.rgba[si + 1];
          sheet[di + 2] = frame.rgba[si + 2]; sheet[di + 3] = 255;
        }
      }
    });
  }
  const img = { width: sheetW, height: sheetH, rgba: sheet };
  snapSheetToRamps(img.rgba);
  addInk(img);
  const p = path.join(OUT, id);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'sheet.png'), encodeRgba(sheetW, sheetH, img.rgba));
  const meta = {
    hero: id,
    id,
    heroHeight: 72,
    footFromBottom: 12,
    artSize: Math.min(140, artSize),
    cell: CELL,
    actions: Object.fromEntries(ACTIONS.map((a) => [a.key, {
      y: a.y, cell: CELL, frames: a.frames, frameTime: a.frameTime,
      ...(a.loop ? { loop: true } : {}),
      ...(a.cycle ? { cycle: a.cycle } : {}),
      ...(a.release ? { release: a.release } : {}),
      ...(a.impact ? { impact: a.impact } : {}),
    }])),
  };
  fs.writeFileSync(path.join(p, 'meta.json'), JSON.stringify(meta, null, 1));
  log(`${id}: composed sheet ${sheetW}x${sheetH}, artSize ${meta.artSize}, scale ${scale.toFixed(2)}`);
}

// ------------------------------------------------------------------ main

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return [m[1], m[2] === '' ? true : m[2]];
}));
const ids = args.ids ? args.ids.split(',').map((s) => s.trim()).filter(Boolean)
  : args.id ? [args.id] : [];

const boss = !!args.boss;
if (!ids.length) {
  console.error('usage: --ids=mole,boar | --id=mole | --ids=... --compose-only | --id=treant --boss');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const summary = [];
for (const id of ids) {
  const isBoss = boss || id === 'treant';
  try {
    if (!args['compose-only']) {
      if (!PROMPTS[id]) throw new Error('unknown monster id ' + id);
      await generate(id, isBoss);
    }
    compose(id, isBoss);
    summary.push({ id, ok: true });
  } catch (e) {
    console.error(`FAIL ${id}: ${e.message}`);
    summary.push({ id, ok: false, error: e.message.split('\n')[0] });
  }
}
console.log(JSON.stringify(summary, null, 1));
const failed = summary.filter((s) => !s.ok);
process.exit(failed.length ? 1 : 0);
