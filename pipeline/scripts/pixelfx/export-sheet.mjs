#!/usr/bin/env node
// Export one pixelfx effect into assets/vfx-sheets/<name>.png + <name>.json.
// build.mjs inlines every assets/vfx-sheets/<name>.json as PIXEL_ASSETS.vfxSheets[<name>], and
// pixel-world.js drawVfxSheet() plays it frame by frame — so the sheet name is the runtime id.
//
//   node pipeline/scripts/pixelfx/export-sheet.mjs impacts/crit-spray crit-spray
//   node pipeline/scripts/pixelfx/export-sheet.mjs --dir D:/code/pixelfx impacts/crit-spray crit-spray
//   node pipeline/scripts/pixelfx/export-sheet.mjs --opts '{"palette":["#000","#fff"]}' fire/fireball fireball
//   node pipeline/scripts/pixelfx/export-sheet.mjs --actor moves/<move> <out-name>
//
// Exports with bg:"none" and no stand-in actor, so only the effect's own pixels land in the sheet.
// With --actor an effect that exports `act` is rendered as an acted-out move instead: renderAct
// draws its rigged actor and poses, one sheet cell per pose, and the pivot becomes the feet.
// PIXELFX_DIR (or --dir) points at the pixelfx checkout; default is C:/Users/ray/pixelfx.
//
// Effects this project wrote (not upstream pixelfx ones) live in pipeline/scripts/pixelfx/vendor/<id>.js
// and are copied into the pixelfx checkout at export time, so a clean checkout can regenerate the
// sheet: the vendored file keeps pixelfx's relative imports ("../../core/index.js") valid.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT_DIR = path.join(ROOT, 'assets/vfx-sheets');

const argv = process.argv.slice(2);
let repo = process.env.PIXELFX_DIR || 'C:/Users/ray/pixelfx';
let opts = null;
let actor = false;
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dir') repo = argv[++i];
  else if (argv[i] === '--opts') opts = JSON.parse(argv[++i]);
  else if (argv[i] === '--actor') actor = true;
  else rest.push(argv[i]);
}
const [id, nameArg] = rest;
if (!id) {
  console.error('usage: node pipeline/scripts/pixelfx/export-sheet.mjs [--dir <pixelfx repo>] [--actor] <fx-id> [out-name]');
  process.exit(1);
}
const name = nameArg ?? id.split('/')[1];

const lib = await import(pathToFileURL(path.join(repo, 'tools/lib/fxlib.mjs')).href);

// our own effect? put the vendored copy where pixelfx expects it (only when it differs)
const VENDOR = path.join(ROOT, 'pipeline/scripts/pixelfx/vendor');
const vendored = path.join(VENDOR, `${id}.js`);
if (fs.existsSync(vendored)) {
  const dest = path.join(repo, 'src/fx', `${id}.js`);
  const src = fs.readFileSync(vendored, 'utf8');
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== src) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, src);
    console.log(`copied ${path.relative(ROOT, vendored)} -> ${dest}`);
  }
}

const fx = await lib.loadEffect(id);
// --actor: an act (a rigged walk/move) is one sheet cell per pose; otherwise the effect's own
// pixels, plus pixelfx's stand-in actor when the effect asks for one (meta.actor).
const acted = actor && fx.mod.act;
const r = acted
  ? lib.renderAct(fx, { fps: fx.meta.fps, bg: 'none', target: false, seconds: fx.meta.duration - 1 / fx.meta.fps })
  : lib.renderFrames(fx, { bg: 'none', actor: actor, options: opts ?? undefined });
const sheet = lib.spriteSheet(fx, r, name);
if (acted) sheet.json.meta.pixelfx = { ...sheet.json.meta.pixelfx, ...(fx.meta.sheetExtra ?? {}), pivot: r.pivot };

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), sheet.png);
fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(sheet.json, null, 1));

const px = sheet.json.meta.pixelfx;
console.log(
  `${id} -> assets/vfx-sheets/${name}.{png,json}  ${px.frameSize[0]}x${px.frameSize[1]}, ` +
    `pivot [${px.pivot}], ${px.frames} frames @ ${px.fps} fps, ${px.columns} columns`,
);
