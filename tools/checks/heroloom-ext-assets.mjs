#!/usr/bin/env node
// tools/checks/heroloom-ext-assets.mjs — checkpoint for the HeroLoom extension art pack.
//
// Dependency-free (node:fs / node:path / node:zlib only; it even decodes PNGs itself). It validates
// whatever art-gen has delivered under assets/heroloom-monsters/ and assets/heroloom-buildings/
// against the reduced-format contracts in src/heroloom-monsters.js and src/heroloom-buildings.js,
// and always validates the module contracts themselves (so it is a useful early checkpoint before
// the art exists). Exit code 1 on any failure.
//
// Usage:
//   node tools/checks/heroloom-ext-assets.mjs                     # worktree root (default)
//   node tools/checks/heroloom-ext-assets.mjs <project-root>      # another checkout/worktree
//   node tools/checks/heroloom-ext-assets.mjs <dir>/heroloom-monsters
//   node tools/checks/heroloom-ext-assets.mjs <dir>/heroloom-buildings
//
// Missing pack dirs are SKIP lines, not failures (art-gen delivers in parallel; see
// docs/HEROLOOM-MONSTERS.md and docs/HEROLOOM-BUILDINGS.md). If a pack dir exists, every member it
// should contain is required, so a half-delivered pack fails instead of passing silently.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  HEROLOOM_MONSTER_CELL, HEROLOOM_MONSTER_COLUMNS, HEROLOOM_MONSTER_ROWS,
  HEROLOOM_MONSTER_SHEET_WIDTH, HEROLOOM_MONSTER_SHEET_HEIGHT,
  HEROLOOM_MONSTER_ACTION_NAMES, LOOM_MONSTERS, HEROLOOM_MONSTERS_BASE,
  monsterSheetUrl, monsterActionKey, monsterAf, monsterFrameIndex,
  canonicalMonsterMeta, validateMonsterSheet,
} from '../../src/heroloom-monsters.js';
import {
  HEROLOOM_BUILDING_IDS, HEROLOOM_TERRAIN_NAMES, HEROLOOM_BUILDING_REFERENCE_DIR,
  HEROLOOM_BUILDING_ASPECT_BAND, HEROLOOM_BUILDINGS_BASE, buildingUrl, terrainUrl,
  validateBuildingPng, seamlessTileCheck,
} from '../../src/heroloom-buildings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/') || '.';

let passed = 0, skipped = 0;
const failures = [];
const pass = (msg) => { passed++; console.log('PASS  ' + msg); };
const skip = (msg) => { skipped++; console.log('SKIP  ' + msg); };
const note = (msg) => { console.log('NOTE  ' + msg); };
const fail = (msg) => { failures.push(msg); console.log('FAIL  ' + msg); };
const ok = (cond, msg, detail) => {
  if (cond) { pass(msg); return true; }
  fail(msg + (detail ? ' -- ' + detail : ''));
  return false;
};

/* -------------------------------------------------------------------------------------------- */
/* dependency-free PNG decode (needed for full-file integrity, frame alpha and seamless tiles)   */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
};

/**
 * Decode a non-interlaced 8-bit PNG into {width, height, colorType, hasAlpha, rgba}.
 * Supports colour types 0/2/3/4/6 (tRNS honoured for greyscale/RGB/palette). Never throws.
 */
function decodePng(buf) {
  const errors = [];
  const out = { ok: false, errors, width: 0, height: 0, colorType: -1, hasAlpha: false, rgba: null };
  if (!Buffer.isBuffer(buf) || buf.length < 33) { errors.push('file too short for a PNG (' + (buf ? buf.length : 0) + ' bytes)'); return out; }
  if (!PNG_SIGNATURE.equals(buf.subarray(0, 8))) { errors.push('PNG signature mismatch (not a PNG file)'); return out; }
  let pos = 8, bitDepth = 8, interlace = 0, palette = null, trns = null, sawIHDR = false;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 8 + len;
    if (end + 4 > buf.length) { errors.push('truncated ' + type + ' chunk'); return out; }
    if (type === 'IHDR') {
      if (len < 13) { errors.push('IHDR chunk too short'); return out; }
      out.width = buf.readUInt32BE(pos + 8);
      out.height = buf.readUInt32BE(pos + 12);
      bitDepth = buf[pos + 16];
      out.colorType = buf[pos + 17];
      interlace = buf[pos + 20];
      sawIHDR = true;
    } else if (type === 'PLTE') palette = buf.subarray(pos + 8, end);
    else if (type === 'tRNS') trns = buf.subarray(pos + 8, end);
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, end));
    else if (type === 'IEND') break;
    pos = end + 4;
  }
  if (!sawIHDR) { errors.push('no IHDR chunk'); return out; }
  if (!(out.width > 0 && out.height > 0)) { errors.push('IHDR width/height is zero'); return out; }
  const channels = CHANNELS[out.colorType];
  if (!channels) { errors.push('unsupported PNG colour type ' + out.colorType); return out; }
  if (bitDepth !== 8) { errors.push('unsupported PNG bit depth ' + bitDepth + ' (only 8-bit is handled)'); return out; }
  if (interlace !== 0) { errors.push('interlaced PNGs are not supported'); return out; }
  if (!idat.length) { errors.push('no IDAT chunk'); return out; }
  out.hasAlpha = out.colorType === 4 || out.colorType === 6 || trns != null;
  if (out.colorType === 3 && !palette) { errors.push('palette PNG without PLTE chunk'); return out; }

  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); }
  catch (e) { errors.push('IDAT inflate failed: ' + e.message); return out; }
  const bpp = channels;
  const rowBytes = out.width * channels;
  const stride = rowBytes + 1;
  if (raw.length < out.height * stride) {
    errors.push('inflated data too short (' + raw.length + ' < ' + out.height * stride + ')');
    return out;
  }
  const pixels = Buffer.alloc(out.height * rowBytes);
  for (let y = 0; y < out.height; y++) {
    const filter = raw[y * stride];
    for (let x = 0; x < rowBytes; x++) {
      const i = y * rowBytes + x;
      const a = x >= bpp ? pixels[i - bpp] : 0;
      const b = y > 0 ? pixels[i - rowBytes] : 0;
      const c = x >= bpp && y > 0 ? pixels[i - rowBytes - bpp] : 0;
      const v = raw[y * stride + 1 + x];
      let val;
      switch (filter) {
        case 0: val = v; break;
        case 1: val = v + a; break;
        case 2: val = v + b; break;
        case 3: val = v + ((a + b) >> 1); break;
        case 4: val = v + paeth(a, b, c); break;
        default: errors.push('unknown row filter ' + filter + ' on row ' + y); return out;
      }
      pixels[i] = val & 0xff;
    }
  }

  const rgba = Buffer.alloc(out.width * out.height * 4);
  const p = (i, r, g, b, al) => { rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = al; };
  const trnsGray = trns && trns.length >= 2 ? trns.readUInt16BE(0) : null;
  const trnsRgb = trns && trns.length >= 6 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;
  for (let i = 0; i < out.width * out.height; i++) {
    if (out.colorType === 6) {
      p(i, pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], pixels[i * 4 + 3]);
    } else if (out.colorType === 2) {
      const r = pixels[i * 3], g = pixels[i * 3 + 1], b = pixels[i * 3 + 2];
      const transparent = trnsRgb && r === trnsRgb[0] && g === trnsRgb[1] && b === trnsRgb[2];
      p(i, r, g, b, transparent ? 0 : 255);
    } else if (out.colorType === 0) {
      const g = pixels[i];
      p(i, g, g, g, trnsGray != null && g === trnsGray ? 0 : 255);
    } else if (out.colorType === 4) {
      const g = pixels[i * 2];
      p(i, g, g, g, pixels[i * 2 + 1]);
    } else { // palette
      const idx = pixels[i];
      const o = idx * 3;
      if (o + 2 >= palette.length) { errors.push('palette index ' + idx + ' out of range'); return out; }
      const al = trns && idx < trns.length ? trns[idx] : 255;
      p(i, palette[o], palette[o + 1], palette[o + 2], al);
    }
  }
  out.ok = true;
  out.rgba = rgba;
  return out;
}

const countVisible = (rgba, width, x0, y0, cell) => {
  let n = 0;
  for (let y = y0; y < y0 + cell; y++) {
    for (let x = x0; x < x0 + cell; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 0) n++;
    }
  }
  return n;
};

/* -------------------------------------------------------------------------------------------- */
/* targets (optional dir argument)                                                               */

const argvDir = process.argv[2];
const targets = {
  projectRoot: ROOT,
  monsterDir: path.join(ROOT, 'assets', 'heroloom-monsters'),
  buildingDir: path.join(ROOT, 'assets', 'heroloom-buildings'),
  refDir: path.join(ROOT, 'assets', 'xilurus'),
  argNote: null,
};
if (argvDir) {
  const p = path.resolve(process.cwd(), argvDir);
  const base = path.basename(p);
  const parent = path.dirname(p);
  if (base === 'heroloom-monsters' || base === 'heroloom-buildings') {
    targets.projectRoot = path.resolve(parent, '..');
    targets.monsterDir = base === 'heroloom-monsters' ? p : path.join(parent, 'heroloom-monsters');
    targets.buildingDir = base === 'heroloom-buildings' ? p : path.join(parent, 'heroloom-buildings');
    targets.refDir = path.join(parent, 'xilurus');
  } else {
    targets.projectRoot = p;
    targets.monsterDir = path.join(p, 'assets', 'heroloom-monsters');
    targets.buildingDir = path.join(p, 'assets', 'heroloom-buildings');
    targets.refDir = path.join(p, 'assets', 'xilurus');
  }
  if (!fs.existsSync(targets.projectRoot)) {
    console.error('heroloom-ext-assets: target directory does not exist: ' + p);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(targets.projectRoot, 'assets')) &&
      (fs.existsSync(path.join(p, 'monsters')) || fs.existsSync(path.join(p, 'buildings')))) {
    targets.argNote = 'argument looks like art-gen staging (monsters/ + buildings/), not a pack root; ' +
      'the pack must be placed at assets/heroloom-monsters/ + assets/heroloom-buildings/';
  }
}

console.log('heroloom-ext-assets: root ' + rel(targets.projectRoot));
if (targets.argNote) note(targets.argNote);

/* -------------------------------------------------------------------------------------------- */
/* 1. module contracts (always)                                                                  */

function checkMonsterContracts() {
  ok(HEROLOOM_MONSTER_CELL === 160 && HEROLOOM_MONSTER_COLUMNS === 8 && HEROLOOM_MONSTER_ROWS === 5,
    'monster pack geometry is 8 cols x 5 rows of 160x160 cells');
  ok(HEROLOOM_MONSTER_SHEET_WIDTH === 1280 && HEROLOOM_MONSTER_SHEET_HEIGHT === 800,
    'monster sheet size is 1280x800');
  ok(Object.keys(LOOM_MONSTERS).join(',') === 'wolfman,mummy,moss',
    'monster registry is wolfman/mummy/moss');
  ok(HEROLOOM_MONSTERS_BASE() === 'media/heroloom-monsters/',
    'monster base defaults to media/heroloom-monsters/');
  ok(monsterSheetUrl('wolfman') === 'media/heroloom-monsters/wolfman/sheet.png',
    'monsterSheetUrl() emits <base>/<id>/sheet.png');

  const meta = canonicalMonsterMeta('wolfman');
  ok(validateMonsterSheet(meta, { width: 1280, height: 800 }).ok,
    'canonical meta + 1280x800 IHDR validates');
  const drift = JSON.parse(JSON.stringify(meta));
  drift.actions.walk.y = 120;
  const driftResult = validateMonsterSheet(drift, { width: 1280, height: 800 });
  ok(!driftResult.ok && driftResult.errors.join(' ').includes('walk.y'),
    'validator rejects an action y offset that does not equal row*cell');

  const wantAf = {
    idle: [5, 10, 15, 20],
    walk: [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20],
    attack: [1.8, 3.6, 5.4, 7.2, 9, 10.8],
    hurt: [2, 4, 6],
    death: [2.8, 5.6, 8.4, 11.2, 14],
  };
  let afOk = true;
  for (const action of HEROLOOM_MONSTER_ACTION_NAMES) {
    const got = monsterAf('wolfman', action);
    if (JSON.stringify(got) !== JSON.stringify(wantAf[action])) {
      afOk = false;
      fail('monsterAf(' + action + ') is ' + JSON.stringify(got) + ', expected ' + JSON.stringify(wantAf[action]));
    }
  }
  if (afOk) pass('monsterAf tick tables match the meta frame times at tickRate 20');

  const walkAf = monsterAf('wolfman', 'walk');
  ok(monsterFrameIndex(walkAf, 0) === 0 && monsterFrameIndex(walkAf, -1) === 7 &&
    monsterFrameIndex(walkAf, 20) === 0 && monsterFrameIndex(walkAf, 19.99) === 7,
    'monsterFrameIndex() wraps/clamps like heroloomFrameIndex()');

  let keysOk = true;
  for (const key of ['idle', 'walk', 'attack', 'hurt', 'death', 'attackDownLeft', 'walkUp',
    'hurtDown', 'attackLeft', 'idleDown', 'nonsense', '', null]) {
    const mapped = monsterActionKey(key);
    if (!HEROLOOM_MONSTER_ACTION_NAMES.includes(mapped)) {
      keysOk = false;
      fail('monsterActionKey(' + JSON.stringify(key) + ') -> ' + JSON.stringify(mapped) + ' is not one of the 5 rows');
    }
  }
  if (keysOk) pass('monsterActionKey() maps DV2/directional keys onto the 5 rows (never null)');
}

function checkBuildingContracts() {
  ok(HEROLOOM_BUILDING_IDS.join(',') === 'hall,inn,tavern,forge,house',
    'building registry is hall/inn/tavern/forge/house');
  ok(HEROLOOM_TERRAIN_NAMES.join(',') === 'grass,earth,stone',
    'terrain registry is grass/earth/stone');
  ok(HEROLOOM_BUILDINGS_BASE() === 'media/heroloom-buildings/',
    'building base defaults to media/heroloom-buildings/');
  ok(buildingUrl('hall') === 'media/heroloom-buildings/hall.png',
    'buildingUrl() emits <base>/<id>.png');
  ok(terrainUrl('grass') === 'media/heroloom-buildings/terrain/grass.png',
    'terrainUrl() emits <base>/terrain/<name>.png');

  // Pixel check in the two directions the contract relies on.
  const flat = new Uint8Array(8 * 8 * 4).fill(128);
  ok(seamlessTileCheck(flat, 8, 8).ok, 'seamlessTileCheck() accepts a uniform tile');
  const seam = new Uint8Array(8 * 8 * 4).fill(128);
  for (let y = 0; y < 8; y++) {
    seam.set([0, 0, 0, 255], (y * 8) * 4);
    seam.set([255, 255, 255, 255], (y * 8 + 7) * 4);
  }
  ok(!seamlessTileCheck(seam, 8, 8).ok, 'seamlessTileCheck() rejects a hard left/right seam');
  ok(validateBuildingPng({ width: 800, height: 1200, colorType: 6 }, { id: 'hall', refWidth: 1120, refHeight: 1400 }).ok,
    'validateBuildingPng() accepts a 2:3 alpha building against the hall reference');
}

/* -------------------------------------------------------------------------------------------- */
/* 2. delivered monster pack                                                                     */

function checkMonsterPack() {
  if (!fs.existsSync(targets.monsterDir)) {
    skip('monster pack not delivered yet: ' + rel(targets.monsterDir) + '/ (validated module contracts only)');
    return;
  }
  for (const id of Object.keys(LOOM_MONSTERS)) {
    const sheetPath = path.join(targets.monsterDir, id, 'sheet.png');
    const metaPath = path.join(targets.monsterDir, id, 'meta.json');
    const hasMeta = fs.existsSync(metaPath), hasSheet = fs.existsSync(sheetPath);
    if (!hasMeta) { fail('monster ' + id + ': meta.json missing at ' + rel(metaPath)); continue; }
    if (!hasSheet) { fail('monster ' + id + ': sheet.png missing at ' + rel(sheetPath)); continue; }

    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
    catch (e) { fail('monster ' + id + ': meta.json is not valid JSON -- ' + e.message); continue; }
    const sheetBuf = fs.readFileSync(sheetPath);
    const v = validateMonsterSheet(meta, sheetBuf);
    ok(v.ok, 'monster ' + id + ': meta.json + sheet.png match the reduced-format contract',
      v.errors.slice(0, 6).join('; '));

    if (meta && meta.actions) {
      let yOk = true;
      HEROLOOM_MONSTER_ACTION_NAMES.forEach((name, row) => {
        const a = meta.actions[name];
        if (!a || a.y !== row * HEROLOOM_MONSTER_CELL) {
          yOk = false;
          fail('monster ' + id + ': ' + name + '.y is ' + (a && a.y) + ', expected row ' + row +
            ' * ' + HEROLOOM_MONSTER_CELL + ' = ' + row * HEROLOOM_MONSTER_CELL);
        }
      });
      if (yOk) pass('monster ' + id + ': meta y offsets match row order (0/160/320/480/640)');
    }

    const png = decodePng(sheetBuf);
    if (!ok(png.ok, 'monster ' + id + ': sheet.png decodes as 8-bit non-interlaced PNG', png.errors.join('; '))) continue;
    ok(png.width === HEROLOOM_MONSTER_SHEET_WIDTH && png.height === HEROLOOM_MONSTER_SHEET_HEIGHT,
      'monster ' + id + ': decoded sheet is 1280x800', png.width + 'x' + png.height);
    ok(png.hasAlpha, 'monster ' + id + ': sheet.png carries alpha');
    if (meta && meta.actions && png.width === HEROLOOM_MONSTER_SHEET_WIDTH) {
      const empty = [];
      HEROLOOM_MONSTER_ACTION_NAMES.forEach((name) => {
        const a = meta.actions[name];
        if (!a || !(a.cell > 0) || !(a.frames > 0)) return;
        for (let f = 0; f < a.frames; f++) {
          if (countVisible(png.rgba, png.width, f * a.cell, a.y, a.cell) === 0) empty.push(name + '#' + f);
        }
      });
      ok(empty.length === 0, 'monster ' + id + ': every used frame cell has visible pixels',
        'empty frames: ' + empty.join(', '));
    }
  }
}

/* -------------------------------------------------------------------------------------------- */
/* 3. delivered buildings + terrain                                                              */

function referenceSize(refDir, id) {
  const file = path.join(refDir, id + '.png');
  if (!fs.existsSync(file)) return null;
  const png = decodePng(fs.readFileSync(file));
  if (!png.ok) return null;
  return { width: png.width, height: png.height, ratio: png.width / png.height };
}

function checkBuildingPack() {
  if (!fs.existsSync(targets.buildingDir)) {
    skip('building pack not delivered yet: ' + rel(targets.buildingDir) + '/ (validated module contracts only)');
    return;
  }
  for (const id of HEROLOOM_BUILDING_IDS) {
    const file = path.join(targets.buildingDir, id + '.png');
    if (!fs.existsSync(file)) { fail('building ' + id + ': expected ' + rel(file)); continue; }
    const buf = fs.readFileSync(file);
    const ref = referenceSize(targets.refDir, id);
    if (!ref) skip('building ' + id + ': no ' + HEROLOOM_BUILDING_REFERENCE_DIR + '/' + id + '.png reference -- aspect gate skipped for this id');
    const v = validateBuildingPng(buf, ref
      ? { id, refWidth: ref.width, refHeight: ref.height }
      : { id, skipAspect: true });
    ok(v.ok, 'building ' + id + ': PNG satisfies alpha/height/aspect contract',
      v.errors.slice(0, 5).join('; '));
    if (v.ok && v.relative != null) {
      note('building ' + id + ': ' + v.width + 'x' + v.height + ' ratio ' + v.ratio.toFixed(3) +
        ' = ' + v.relative.toFixed(3) + ' of the xilurus reference (' + v.refRatio.toFixed(3) + ', accepted ' +
        HEROLOOM_BUILDING_ASPECT_BAND.min + '-' + HEROLOOM_BUILDING_ASPECT_BAND.max + ')');
    }
    const png = decodePng(buf);
    if (!ok(png.ok, 'building ' + id + ': PNG decodes', png.errors.join('; '))) continue;
    const visible = countVisible(png.rgba, png.width, 0, 0, Math.min(png.width, png.height)) > 0;
    ok(visible, 'building ' + id + ': PNG is not fully transparent');
  }

  const terrainDir = path.join(targets.buildingDir, 'terrain');
  if (!fs.existsSync(terrainDir)) {
    skip('terrain tiles not delivered yet: ' + rel(terrainDir) + '/ (grass/earth/stone)');
    return;
  }
  for (const name of HEROLOOM_TERRAIN_NAMES) {
    const file = path.join(terrainDir, name + '.png');
    if (!fs.existsSync(file)) { fail('terrain ' + name + ': expected ' + rel(file)); continue; }
    const png = decodePng(fs.readFileSync(file));
    if (!ok(png.ok, 'terrain ' + name + ': PNG decodes', png.errors.join('; '))) continue;
    ok(png.width >= 64 && png.height >= 64, 'terrain ' + name + ': tile is at least 64x64',
      png.width + 'x' + png.height);
    const seam = seamlessTileCheck(png.rgba, png.width, png.height);
    ok(seam.ok, 'terrain ' + name + ': tile is seamless (' + png.width + 'x' + png.height + ')',
      seam.errors.join('; '));
    if (seam.ok) note('terrain ' + name + ': edge mismatch lr=' + seam.leftRight.toFixed(4) +
      ' tb=' + seam.topBottom.toFixed(4) + ' (threshold ' + seam.threshold + ')');
  }
}

/* -------------------------------------------------------------------------------------------- */
/* 4. staged art inventory + integration hook (informational only)                                */

function checkStagingAndHooks() {
  const staging = path.join(targets.projectRoot, 'output', 'heroloom-ext');
  if (fs.existsSync(staging)) {
    for (const sub of ['monsters', 'buildings']) {
      const dir = path.join(staging, sub);
      if (!fs.existsSync(dir)) continue;
      let files = 0;
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p); else files++;
        }
      };
      try { walk(dir); } catch { /* staging may be written concurrently */ }
      note('art-gen staging ' + rel(dir) + '/ has ' + files + ' file(s); the pack must be copied to ' +
        (sub === 'monsters' ? rel(targets.monsterDir) : rel(targets.buildingDir)) + '/');
    }
  }
  const buildPath = path.join(targets.projectRoot, 'build.mjs');
  if (fs.existsSync(buildPath)) {
    let src = '';
    try { src = fs.readFileSync(buildPath, 'utf8'); } catch { /* ignore */ }
    if (/loomMonsters|heroloomMonstersBase|heroloom-buildings/.test(src)) {
      note('build.mjs already references the loom monster/building pack');
    } else {
      skip('build.mjs not wired yet -- Lead adds PIXEL_ASSETS.loomMonsters / heroloomMonstersBase and the ' +
        'prefer-if-present building+terrain step (see docs/HEROLOOM-MONSTERS.md, docs/HEROLOOM-BUILDINGS.md)');
    }
  }
}

/* -------------------------------------------------------------------------------------------- */

checkMonsterContracts();
checkBuildingContracts();
checkMonsterPack();
checkBuildingPack();
checkStagingAndHooks();

const total = passed + failures.length;
if (failures.length) {
  console.log('\nSummary: FAIL -- ' + failures.length + ' problem(s); ' + passed + ' passed, ' + skipped + ' skipped (of ' + total + ' checks).');
  process.exit(1);
}
console.log('\nSummary: PASS -- ' + passed + ' checks passed, ' + skipped + ' skipped.');
process.exit(0);
