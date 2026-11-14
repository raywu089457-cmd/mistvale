#!/usr/bin/env node
// heroloom-assets.mjs -- structural checker for the Heroloom Free pack under assets/heroloom/.
//
// Dependency-free on purpose (no npm modules, no image libraries): PNG sizes are read straight
// from the IHDR chunk of the file, and the pack is verified against its own character.json, so a
// broken copy / edited spec / mis-sized sheet fails here before a build ever runs.
//
// What it checks:
//   1  pack file census: exactly 74 files (46 part sheets, 23 icons, 5 core files)
//   2  every part PNG: 8-byte signature + IHDR says 512x448 (columns*cell.w x actions*cell.h)
//   3  every icon PNG: signature + IHDR says 32x32
//   4  character.json: cell [64,56], columns 8, foot inside the cell, faces "right"
//   5  actions: 8 rows 0..7, frames 1..columns, ms > 0, loop is boolean
//   6  layers: 22 entries, every referenced slot exists, layer names known, draw order slots complete
//   7  slots/parts: every layer path in character.json exists on disk, and all 46 sheets are used
//   8  anchors: one array per action, length == frames, head/hand inside the cell
//   9  palettes: 6 hex colours per row, variant counts skin4/hair7/cloth7/leather3/eye5
//  10  looks: part ids and colour variants exist (a look is a ready-made recipe)
//  11  LICENSE.txt: present and carries the "YOU MAY NOT" redistribution/AI-training clauses
//  12  build.mjs: copies assets/heroloom into media/heroloom and exposes PIXEL_ASSETS.heroloomBase
//
// Usage: node tools/checks/heroloom-assets.mjs [packDir]
//   packDir optional (default assets/heroloom): point it at a copy to negative-test this checker.
// Exit 0 = PASS, 1 = FAIL. Prints PASS/FAIL lines and a final summary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PACK = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.join(ROOT, 'assets', 'heroloom');
const SPEC_FILE = path.join(PACK, 'character.json');
const BUILD_FILE = path.join(ROOT, 'build.mjs');

const PART_COUNT = 46;
const ICON_COUNT = 23;
const FILE_COUNT = 74; // 46 parts + 23 icons + character.json + LICENSE.txt + README.md + maker.html + runtime/js/paperdoll.js
const LAYER_COUNT = 22;
const SLOT_NAMES = ['back', 'cape', 'hair', 'hat', 'body', 'top', 'shield', 'bottom', 'shoes', 'weapon', 'face', 'acc'];
const LAYER_NAMES = ['main', 'back', 'front', 'head', 'under'];
const VARIANTS = { skin: 4, hair: 7, cloth: 7, leather: 3, eye: 5 };

const fails = [];
const fail = (msg) => { fails.push(msg); console.log('FAIL  ' + msg); };
const pass = (msg) => console.log('PASS  ' + msg);
const ok = (cond, msg, detail) => {
  if (cond) { pass(msg); return true; }
  fail(msg + (detail ? ' (' + detail + ')' : ''));
  return false;
};

// ---------------------------------------------------------------------------------------------
// helpers

const walk = (dir, prefix = '') => {
  let out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    if (e.isDirectory()) out = out.concat(walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
};

// Parse a PNG's IHDR without any image library. Returns {w, h} or throws with a readable reason.
const pngSize = (file) => {
  const buf = fs.readFileSync(file);
  if (buf.length < 24) throw new Error('file is too short to be a PNG');
  const sig = buf.subarray(0, 8).toString('hex');
  if (sig !== '89504e470d0a1a0a') throw new Error('bad PNG signature');
  const type = buf.subarray(12, 16).toString('ascii');
  if (type !== 'IHDR') throw new Error('first chunk is not IHDR (got "' + type + '")');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};

const isHex = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

// ---------------------------------------------------------------------------------------------
// 1 + 4: pack presence and spec parse

let spec = null;
try {
  spec = JSON.parse(fs.readFileSync(SPEC_FILE, 'utf8'));
  pass('character.json parses (' + fs.statSync(SPEC_FILE).size + ' B)');
} catch (e) {
  fail('character.json missing or does not parse: ' + e.message);
}

if (!spec) {
  console.log('\nSummary: cannot continue without character.json.');
  process.exit(1);
}

const files = walk(PACK);
const partsOnDisk = files.filter((f) => /^parts\/.+\.png$/.test(f));
const iconsOnDisk = files.filter((f) => /^icons\/.+\.png$/.test(f));
const CORE_FILES = ['character.json', 'LICENSE.txt', 'README.md', 'maker.html', 'runtime/js/paperdoll.js'];

ok(files.length === FILE_COUNT, 'pack holds ' + FILE_COUNT + ' files', 'found ' + files.length);
ok(partsOnDisk.length === PART_COUNT, 'pack holds ' + PART_COUNT + ' part sheets', 'found ' + partsOnDisk.length);
ok(iconsOnDisk.length === ICON_COUNT, 'pack holds ' + ICON_COUNT + ' icons', 'found ' + iconsOnDisk.length);
for (const f of CORE_FILES) ok(files.includes(f), 'core file present: ' + f);
const extra = files.filter((f) => f !== 'character.json' && !CORE_FILES.includes(f) && !/^parts\//.test(f) && !/^icons\//.test(f));
ok(extra.length === 0, 'no stray files outside parts/, icons/ and the 5 core files', extra.slice(0, 5).join(', '));

const cell = spec.cell;
ok(Array.isArray(cell) && cell.length === 2 && cell.every((n) => Number.isInteger(n) && n > 0), 'cell is [w,h] (' + JSON.stringify(cell) + ')');
ok(spec.columns === 8, 'columns is 8', String(spec.columns));
ok(spec.faces === 'right', 'sprites face right', String(spec.faces));
ok(Array.isArray(spec.foot) && spec.foot.length === 2 && Number.isInteger(spec.foot[0]) && Number.isInteger(spec.foot[1]),
  'foot is [x,y] (' + JSON.stringify(spec.foot) + ')');
if (Array.isArray(spec.foot) && Array.isArray(cell)) {
  ok(spec.foot[0] >= 0 && spec.foot[0] < cell[0] && spec.foot[1] >= 0 && spec.foot[1] < cell[1],
    'foot lies inside the cell', JSON.stringify(spec.foot));
}

// ---------------------------------------------------------------------------------------------
// 2 + 3: PNG headers

const actions = spec.actions || {};
const actionNames = Object.keys(actions);
const rows = actionNames.length;
const wantW = spec.columns * cell[0];
const wantH = rows * cell[1];

let badParts = 0;
for (const rel of partsOnDisk) {
  try {
    const { w, h } = pngSize(path.join(PACK, rel));
    if (w !== wantW || h !== wantH) { badParts++; fail('part ' + rel + ' is ' + w + 'x' + h + ', expected ' + wantW + 'x' + wantH); }
  } catch (e) { badParts++; fail('part ' + rel + ' is not a readable PNG: ' + e.message); }
}
ok(badParts === 0, 'all ' + partsOnDisk.length + ' part sheets are ' + wantW + 'x' + wantH + ' (IHDR)');

let badIcons = 0;
for (const rel of iconsOnDisk) {
  try {
    const { w, h } = pngSize(path.join(PACK, rel));
    if (w !== 32 || h !== 32) { badIcons++; fail('icon ' + rel + ' is ' + w + 'x' + h + ', expected 32x32'); }
  } catch (e) { badIcons++; fail('icon ' + rel + ' is not a readable PNG: ' + e.message); }
}
ok(badIcons === 0, 'all ' + iconsOnDisk.length + ' icons are 32x32 (IHDR)');

// ---------------------------------------------------------------------------------------------
// 5: actions

let badActions = 0;
const seenRows = new Set();
for (const [name, a] of Object.entries(actions)) {
  const at = 'action "' + name + '": ';
  if (!Number.isInteger(a.row)) { badActions++; fail(at + 'row is not an integer'); }
  else if (a.row < 0 || a.row >= rows) { badActions++; fail(at + 'row ' + a.row + ' is outside 0..' + (rows - 1)); }
  else if (seenRows.has(a.row)) { badActions++; fail(at + 'row ' + a.row + ' is used twice'); }
  else seenRows.add(a.row);
  if (!Number.isInteger(a.frames) || a.frames < 1 || a.frames > spec.columns) { badActions++; fail(at + 'frames ' + a.frames + ' must be 1..' + spec.columns); }
  if (typeof a.ms !== 'number' || !(a.ms > 0)) { badActions++; fail(at + 'ms must be > 0'); }
  if (typeof a.loop !== 'boolean') { badActions++; fail(at + 'loop must be boolean'); }
}
ok(badActions === 0, 'actions: ' + rows + ' rows, frames 1..' + spec.columns + ', ms > 0, boolean loop');
ok(rows === 8, 'exactly 8 actions', String(rows));
for (const want of ['idle', 'walk', 'attack', 'hurt', 'jump', 'cast', 'thrust', 'shoot']) ok(actionNames.includes(want), 'action present: ' + want);
ok(seenRows.size === rows, 'every action has its own sheet row', 'unique rows ' + seenRows.size + '/' + rows);

// ---------------------------------------------------------------------------------------------
// 6 + 7: layers, slots, parts and part files

const layers = spec.layers || [];
const slots = spec.slots || {};
ok(layers.length === LAYER_COUNT, 'layers: ' + LAYER_COUNT + ' ordered entries', String(layers.length));

const usedSlots = new Set(layers.map((l) => l.slot));
let badLayers = 0;
for (const [i, l] of layers.entries()) {
  if (!slots[l.slot]) { badLayers++; fail('layer[' + i + '] references unknown slot "' + l.slot + '"'); }
  if (!LAYER_NAMES.includes(l.layer)) { badLayers++; fail('layer[' + i + '] uses unknown layer name "' + l.layer + '"'); }
}
ok(badLayers === 0, 'every layer entry names a known slot + layer');
for (const s of SLOT_NAMES) ok(usedSlots.has(s), 'draw order includes slot: ' + s);

const layerPaths = [];
let badPartsSpec = 0;
for (const [slotName, slot] of Object.entries(slots)) {
  const at = 'slot "' + slotName + '": ';
  if (typeof slot.required !== 'boolean') { badPartsSpec++; fail(at + 'required must be boolean'); }
  if (slot.color !== null && !(spec.palettes || {})[slot.color]) { badPartsSpec++; fail(at + 'color ramp "' + slot.color + '" is missing from palettes'); }
  if (slot.colorFrom) { badPartsSpec++; fail(at + 'colorFrom is only valid on a part, not a slot'); }
  const partIds = Object.keys(slot.parts || {});
  if (!partIds.length) { badPartsSpec++; fail(at + 'has no parts'); }
  for (const [partId, part] of Object.entries(slot.parts || {})) {
    if (part.colorFrom && !Object.prototype.hasOwnProperty.call(slots, part.colorFrom)) { badPartsSpec++; fail(at + partId + ' colorFrom "' + part.colorFrom + '" is not a slot'); }
    for (const [layerName, rel] of Object.entries(part.layers || {})) {
      if (!LAYER_NAMES.includes(layerName)) { badPartsSpec++; fail(at + partId + ' uses unknown layer name "' + layerName + '"'); continue; }
      if (typeof rel !== 'string') { badPartsSpec++; fail(at + partId + '.' + layerName + ' is not a path string'); continue; }
      layerPaths.push(rel);
      if (!fs.existsSync(path.join(PACK, rel))) { badPartsSpec++; fail(at + partId + '.' + layerName + ' -> missing file ' + rel); continue; }
      if (!/^parts\/.+\.png$/.test(rel)) { badPartsSpec++; fail(at + partId + '.' + layerName + ' path is outside parts/: ' + rel); }
    }
  }
}
ok(badPartsSpec === 0, 'every slot part layer path in character.json exists on disk');
const uniq = [...new Set(layerPaths)];
ok(uniq.length === PART_COUNT, 'all ' + PART_COUNT + ' sheets are referenced by the spec', 'referenced ' + uniq.length);
const unreferenced = partsOnDisk.filter((f) => !uniq.includes(f));
ok(unreferenced.length === 0, 'no orphan part sheets on disk', unreferenced.slice(0, 5).join(', '));
ok((spec.slots.body && spec.slots.body.required === true) && (spec.slots.face && spec.slots.face.required === true),
  'required slots: body + face');

// ---------------------------------------------------------------------------------------------
// 8: anchors

const anchors = spec.anchors || {};
const anchorNames = Object.keys(anchors);
let badAnchors = 0;
for (const name of actionNames) {
  const a = actions[name], arr = anchors[name];
  if (!Array.isArray(arr)) { badAnchors++; fail('anchors["' + name + '"] missing or not an array'); continue; }
  if (arr.length !== a.frames) { badAnchors++; fail('anchors["' + name + '"] has ' + arr.length + ' entries, action has ' + a.frames + ' frames'); }
}
for (const name of Object.keys(anchors)) if (!actions[name]) { badAnchors++; fail('anchors has unknown action "' + name + '"'); }
const inCell = (pt) => Array.isArray(pt) && pt.length === 2 && Number.isInteger(pt[0]) && Number.isInteger(pt[1])
  && pt[0] >= 0 && pt[0] < cell[0] && pt[1] >= 0 && pt[1] < cell[1];
for (const [name, arr] of Object.entries(anchors)) {
  if (!Array.isArray(arr)) continue;
  for (const [i, f] of arr.entries()) {
    const at = 'anchor ' + name + '[' + i + ']: ';
    if (!inCell(f && f.head)) { badAnchors++; fail(at + 'head is not an in-cell [x,y]'); }
    if (!inCell(f && f.hand)) { badAnchors++; fail(at + 'hand is not an in-cell [x,y]'); }
    if (typeof f.weaponAngle !== 'number') { badAnchors++; fail(at + 'weaponAngle is not a number'); }
    if (typeof f.smear !== 'boolean') { badAnchors++; fail(at + 'smear is not boolean'); }
  }
}
ok(badAnchors === 0, 'anchors: one entry per action frame, head/hand inside the cell, weaponAngle + smear typed');

// ---------------------------------------------------------------------------------------------
// 9: palettes

const palettes = spec.palettes || {};
const ramps = Object.keys(palettes);
ok(ramps.length === 5, 'palettes: 5 ramps', ramps.join(','));
for (const ramp of Object.keys(VARIANTS)) ok(ramps.includes(ramp), 'palette ramp present: ' + ramp);
let badPal = 0;
for (const [ramp, p] of Object.entries(palettes)) {
  const at = 'palette "' + ramp + '": ';
  if (!Array.isArray(p.base) || p.base.length !== 6 || !p.base.every(isHex)) { badPal++; fail(at + 'base must be 6 hex colours'); }
  const variants = p.variants || {};
  const names = Object.keys(variants);
  if (VARIANTS[ramp] && names.length !== VARIANTS[ramp]) { badPal++; fail(at + names.length + ' variants, expected ' + VARIANTS[ramp]); }
  for (const [v, row] of Object.entries(variants)) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(isHex)) { badPal++; fail(at + v + ' must be 6 hex colours'); }
  }
}
ok(badPal === 0, 'palette rows are exactly 6 hex colours; variant counts skin4/hair7/cloth7/leather3/eye5');

// ---------------------------------------------------------------------------------------------
// 10: looks (ready-made recipes)

const looks = spec.looks || {};
let badLooks = 0;
for (const [id, look] of Object.entries(looks)) {
  for (const [slotName, partId] of Object.entries((look && look.parts) || {})) {
    const slot = slots[slotName];
    if (!slot) { badLooks++; fail('look "' + id + '" uses unknown slot "' + slotName + '"'); continue; }
    const part = slot.parts[partId];
    if (!part) { badLooks++; fail('look "' + id + '" uses unknown part "' + slotName + '/' + partId + '"'); continue; }
    const colorSlot = part.colorFrom || slotName;
    const ramp = slots[colorSlot] && slots[colorSlot].color;
    const variant = (look.colors || {})[colorSlot];
    if (variant && !(palettes[ramp] && palettes[ramp].variants && palettes[ramp].variants[variant])) {
      badLooks++; fail('look "' + id + '" colour "' + colorSlot + '" = "' + variant + '" is not a palette variant of ' + ramp);
    }
  }
  for (const [colorSlot, variant] of Object.entries((look && look.colors) || {})) {
    const ramp = slots[colorSlot] && slots[colorSlot].color;
    if (!ramp) { badLooks++; fail('look "' + id + '" colours unknown slot "' + colorSlot + '"'); continue; }
    if (!(palettes[ramp] && palettes[ramp].variants && palettes[ramp].variants[variant])) {
      badLooks++; fail('look "' + id + '" colour "' + colorSlot + '" = "' + variant + '" is not a palette variant');
    }
  }
}
ok(badLooks === 0, 'looks: ' + Object.keys(looks).length + ' ready-made recipes reference real parts + palette variants');
ok(Object.keys(looks).length >= 4, 'at least the 4 shipped looks (knight/mage/rogue/villager)');

// ---------------------------------------------------------------------------------------------
// 11: licence

let lic = '';
try { lic = fs.readFileSync(path.join(PACK, 'LICENSE.txt'), 'utf8'); } catch {}
ok(/YOU MAY NOT/.test(lic), 'LICENSE.txt carries the "YOU MAY NOT" section');
ok(/Redistribute, resell, share or sublicense/.test(lic), 'LICENSE.txt forbids redistributing the assets as an asset pack');
ok(/training data/.test(lic), 'LICENSE.txt forbids AI-training use');
ok(/NFTs?/.test(lic), 'LICENSE.txt forbids NFT use');
ok(/as is/.test(lic), 'LICENSE.txt has the "as is" warranty clause');

// ---------------------------------------------------------------------------------------------
// 12: build wiring

let buildSrc = '';
try { buildSrc = fs.readFileSync(BUILD_FILE, 'utf8'); } catch {}
ok(/assets\/heroloom/.test(buildSrc), 'build.mjs reads assets/heroloom');
ok(/heroloomBase\s*=\s*['"]media\/heroloom\//.test(buildSrc), 'build.mjs sets window.PIXEL_ASSETS.heroloomBase = "media/heroloom/"');
ok(/maker\.html/.test(buildSrc), 'build.mjs documents/excludes the vendor maker.html from the build');

// ---------------------------------------------------------------------------------------------
// summary

const summary = [
  files.length + ' files',
  partsOnDisk.length + ' part sheets (' + wantW + 'x' + wantH + ')',
  iconsOnDisk.length + ' icons (32x32)',
  rows + ' actions',
  layers.length + ' layers',
  Object.keys(slots).length + ' slots',
  Object.keys(anchors).length + ' anchor sets',
  Object.keys(looks).length + ' looks',
].join(' · ');
console.log('');
if (fails.length) {
  console.log('Summary: FAIL -- ' + fails.length + ' problem(s). ' + summary);
  process.exit(1);
}
console.log('Summary: PASS -- ' + summary);
process.exit(0);
