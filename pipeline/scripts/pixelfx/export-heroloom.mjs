#!/usr/bin/env node
// HeroLoom-styled re-export of the pixelfx VFX sheets.
//
//   node pipeline/scripts/pixelfx/export-heroloom.mjs --all
//   node pipeline/scripts/pixelfx/export-heroloom.mjs --only fireball,hit-spark
//   node pipeline/scripts/pixelfx/export-heroloom.mjs --all --dry        (render + style, write nothing)
//   node pipeline/scripts/pixelfx/export-heroloom.mjs --all --out <dir>
//
// What it does that pipeline/scripts/pixelfx/export-sheet.mjs does not:
//   1. after renderFrames(), every frame's `clear` buffer goes through heroloom-style.mjs (ramp snap + ink rim);
//   2. the frame geometry is pinned where the pixelfx checkout has moved on, so the sheets keep the contract
//      src/pixel-world.js was tuned against (see RECIPES below);
//   3. it can render many sheets in one process.
//
// The pixelfx checkouts are read-only inputs: unlike export-sheet.mjs this script never copies vendor/*.js into
// them. If a vendored effect ever diverges from the checkout, fix the checkout or add the difference here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { styleFrames, SHEET_FAMILY, familyPalette, HERO_INK } from './heroloom-style.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SHEET_DIR = path.join(ROOT, 'assets/vfx-sheets');
const EVIDENCE = path.join(ROOT, 'output/heroloom-ext/pixelfx');

const MAIN_DIR = 'C:/Users/ray/pixelfx';
const ISO_DIR = 'C:/Users/ray/Desktop/Claude code/pixelfx';

// Historical custom options (pipeline/ASSETS.md §2-2): keep each effect's own colour structure, the ramp snap
// afterwards pulls it onto the HeroLoom palette.
const GALe = { palette: ['#1f5a2a', '#3f9a3c', '#c8f0a0', '#ffffff'], wind: '#f4ffd8' };
const DARK = { palette: ['#120818', '#2a1038', '#4a1a66', '#7a2fa0', '#a95cd6', '#d2a0f0', '#f0e0ff', '#ffffff'] };
const CHARGE = { palette: ['#1f0b10', '#4a1118', '#8c1d1c', '#cc3a1a', '#f2701f', '#ffae35', '#ffe27a', '#fff8d6'] };

// id -> pixelfx effect id, checkout, options, and (only where the checkout moved) the shipped geometry.
const RECIPES = [
  { id: 'arrow', fx: 'projectiles/arrow' },
  { id: 'berserk-hit', fx: 'impacts/berserk-hit' },
  { id: 'bird', fx: 'critters/bird' },
  { id: 'cinder-cyclone', fx: 'fire/cinder-cyclone' },
  { id: 'cinder-cyclone-iso', fx: 'fire/cinder-cyclone-iso', dir: ISO_DIR, pin: { size: [240, 400], origin: [120, 346] } },
  { id: 'crit-hit', fx: 'impacts/crit-hit' },
  { id: 'crit-spray', fx: 'impacts/crit-spray' },
  { id: 'dark-cleave', fx: 'melee/heavy-cleave', opts: DARK },
  { id: 'double-slash', fx: 'melee/double-slash' },
  { id: 'feather-burst', fx: 'holy/feather-burst' },
  { id: 'fireball-blast', fx: 'impacts/fireball-blast' },
  { id: 'fireball', fx: 'fire/fireball' },
  { id: 'flare', fx: 'projectiles/flare' },
  { id: 'gale-arrow', fx: 'projectiles/arrow', opts: GALe },
  { id: 'haste', fx: 'status/haste' },
  { id: 'hit-spark', fx: 'impacts/hit-spark' },
  { id: 'holy-hit', fx: 'impacts/holy-hit' },
  { id: 'leaf-storm', fx: 'nature/leaf-storm' },
  { id: 'parry', fx: 'impacts/parry' },
  { id: 'priest-heal', fx: 'holy/priest-heal' },
  { id: 'root-snare', fx: 'nature/root-snare' },
  { id: 'spell-charge', fx: 'arcane/spell-charge', opts: CHARGE },
  { id: 'thorn-row', fx: 'nature/thorn-row' },
  { id: 'thorns', fx: 'nature/thorns' },
];

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const flag = (name) => process.argv.includes('--' + name);

const only = arg('only');
const want = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const outDir = path.resolve(arg('out', SHEET_DIR));
const dry = flag('dry');
const report = [];

const libs = new Map();
async function lib(dir) {
  if (!libs.has(dir)) {
    const file = path.join(dir, 'tools/lib/fxlib.mjs');
    if (!fs.existsSync(file)) throw new Error(`pixelfx checkout not found: ${dir}`);
    libs.set(dir, await import(pathToFileURL(file).href));
  }
  return libs.get(dir);
}
const inDir = (dir, fx) => fs.existsSync(path.join(dir, 'src/fx', fx + '.js'));

async function exportOne(rec) {
  const dir = rec.dir ?? (inDir(MAIN_DIR, rec.fx) ? MAIN_DIR : ISO_DIR);
  if (!inDir(dir, rec.fx)) throw new Error(`${rec.id}: ${rec.fx} not found in ${dir}`);
  if (!SHEET_FAMILY[rec.id]) throw new Error(`${rec.id}: no family in SHEET_FAMILY`);
  const t0 = Date.now();
  const l = await lib(dir);
  const fx = await l.loadEffect(rec.fx);
  if (rec.pin) { fx.meta.size = rec.pin.size; fx.meta.origin = rec.pin.origin; }
  const r = l.renderFrames(fx, { bg: 'none', actor: false, options: rec.opts });
  const family = SHEET_FAMILY[rec.id];
  const frames = r.frames.map((f) => f.clear);
  styleFrames(frames, r.w, r.h, family);
  // keep renderFrames' metadata but hand spriteSheet the styled pixels
  const styled = { ...r, frames: r.frames.map((f, i) => ({ ...f, clear: frames[i] })) };
  const sheet = l.spriteSheet(fx, styled, rec.id);
  const px = sheet.json.meta.pixelfx;
  const pngPath = path.join(outDir, rec.id + '.png'), jsonPath = path.join(outDir, rec.id + '.json');
  let before = null;
  if (fs.existsSync(pngPath)) before = fs.statSync(pngPath).size;
  if (!dry) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(pngPath, sheet.png);
    fs.writeFileSync(jsonPath, JSON.stringify(sheet.json, null, 0) + '\n');
  }
  const after = dry ? null : fs.statSync(pngPath).size;
  const row = {
    id: rec.id, family, fx: rec.fx, checkout: dir, dir: path.relative(process.cwd(), dir),
    frameSize: px.frameSize, pivot: px.pivot, frames: px.frames, fps: px.fps, loop: px.loop, columns: px.columns,
    png: [sheet.json.meta.size.w, sheet.json.meta.size.h], colors: familyPalette(family).length,
    bytesBefore: before, bytesAfter: after, ms: Date.now() - t0,
  };
  report.push(row);
  console.log(`${dry ? 'DRY ' : 'OK  '} ${rec.id.padEnd(20)} ${family.padEnd(9)} ${String(px.frameSize).padEnd(12)} p${JSON.stringify(px.pivot).padEnd(12)} ${String(px.frames).padStart(3)}f ${before} -> ${after} B  ${(row.ms / 1000).toFixed(1)}s`);
  return row;
}

const jobs = RECIPES.filter((r) => !want || want.has(r.id));
const missing = want ? [...want].filter((id) => !RECIPES.some((r) => r.id === id)) : [];
if (missing.length) { console.error('unknown ids: ' + missing.join(', ')); process.exit(2); }
if (!jobs.length) { console.error('nothing to do: pass --all or --only id,id'); process.exit(2); }

let failed = 0;
for (const rec of jobs) {
  try { await exportOne(rec); }
  catch (e) { failed++; console.error(`ERR  ${rec.id}: ${e.message}`); }
}
if (!dry) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'export-report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), ink: HERO_INK,
    checkouts: { main: MAIN_DIR, iso: ISO_DIR }, outDir, sheets: report,
  }, null, 2) + '\n');
}
console.log(`\n${jobs.length - failed}/${jobs.length} sheets ${dry ? 'styled (dry run)' : 'written to ' + outDir}`);
process.exit(failed ? 1 : 0);
