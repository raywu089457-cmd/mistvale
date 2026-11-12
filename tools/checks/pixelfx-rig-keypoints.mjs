#!/usr/bin/env node
// T93 acceptance: the rig's per-frame skeletons as PixelLab 18-joint keypoints.
//
//   node tools/checks/pixelfx-rig-keypoints.mjs
//
// Checks pipeline/scripts/pixelfx/character/data/rig-keypoints.json (override with RIG_KEYPOINTS_JSON):
//   - header: canvas 152, cell 76, pivot [38,62], scale 2; directions down, up, right
//   - every direction has idle + 8 walk skeletons, each with the 18 distinct PixelLab labels,
//     x/y strictly inside (0,1), depth an integer 0-255
//   - every ankle (LEG) and hand (ARM) point lies within 3 px (2x scale) of an opaque pixel of the rig's
//     own render of that frame
//   - down: RIGHT SHOULDER/ARM/HIP/LEG left of the LEFT ones in every frame; up: the opposite
//   - idle joints within 10 px (2x scale) of the same label in output/pixellab-rigbody/first/estimated-keypoints.json
//   - the file equals a fresh export (nothing stale)
// Prints the max distances. Exit 0 = all hold; 1 = a check failed (FAIL lines first).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHAR = path.join(ROOT, 'pipeline/scripts/pixelfx/character');
const JSON_PATH = process.env.RIG_KEYPOINTS_JSON ? path.resolve(process.env.RIG_KEYPOINTS_JSON) : path.join(CHAR, 'data/rig-keypoints.json');
const EST_PATH = path.join(ROOT, 'output/pixellab-rigbody/first/estimated-keypoints.json');
const lib = await import(pathToFileURL(path.join(CHAR, 'rig-keypoints-lib.mjs')).href);
const { DIRS, LABELS, CANVAS, posesOfDir, renderCanvas, buildKeypoints } = lib;

const fails = [];
const fail = (m) => fails.push(m);
const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const est = JSON.parse(fs.readFileSync(EST_PATH, 'utf8'));

// header
if (data.canvas !== 152 || data.cell !== 76 || data.scale !== 2 || JSON.stringify(data.pivot) !== '[38,62]') fail(`header is ${JSON.stringify({ canvas: data.canvas, cell: data.cell, pivot: data.pivot, scale: data.scale })}`);

const frames = []; // { dir, name, joints, pose }
for (const dir of DIRS) {
  const d = data.directions?.[dir];
  if (!d) { fail(`direction ${dir} missing`); continue; }
  const { idle, walk } = posesOfDir(dir);
  if (!Array.isArray(d.walk) || d.walk.length !== 8) fail(`${dir}: ${d.walk?.length} walk skeletons, want 8`);
  frames.push({ dir, name: 'idle', joints: d.idle, pose: idle });
  (d.walk ?? []).forEach((j, i) => frames.push({ dir, name: `walk${i}`, joints: j, pose: walk[i] }));
}
if (frames.length !== 27) fail(`${frames.length} skeletons, want 27`);

// structure
for (const f of frames) {
  const tag = `${f.dir} ${f.name}`;
  if (!Array.isArray(f.joints) || f.joints.length !== 18) { fail(`${tag}: ${f.joints?.length} joints, want 18`); f.bad = true; continue; }
  const labels = f.joints.map((j) => j.label);
  if (new Set(labels).size !== 18 || LABELS.some((l) => !labels.includes(l))) { fail(`${tag}: labels are not the 18 distinct PixelLab labels`); f.bad = true; continue; }
  f.by = Object.fromEntries(f.joints.map((j) => [j.label, j]));
  for (const j of f.joints) {
    if (!(j.x > 0 && j.x < 1 && j.y > 0 && j.y < 1)) fail(`${tag} ${j.label}: x/y ${j.x},${j.y} not inside (0,1)`);
    if (!Number.isInteger(j.depth) || j.depth < 0 || j.depth > 255) fail(`${tag} ${j.label}: depth ${j.depth} not an integer 0-255`);
  }
}
const good = frames.filter((f) => !f.bad);

// ankles and hands on the rig's own render (distance from the point to the nearest opaque 2x pixel's square)
let maxOnBody = 0, maxOnBodyAt = '';
for (const f of good) {
  const rgba = renderCanvas(f.pose), opaque = [];
  for (let y = 0; y < CANVAS; y++) for (let x = 0; x < CANVAS; x++) if (rgba[(y * CANVAS + x) * 4 + 3]) opaque.push(x, y);
  for (const label of ['RIGHT LEG', 'LEFT LEG', 'RIGHT ARM', 'LEFT ARM']) {
    const j = f.by[label], X = j.x * CANVAS, Y = j.y * CANVAS;
    let best = Infinity;
    for (let i = 0; i < opaque.length; i += 2) {
      const dx = Math.max(opaque[i] - X, 0, X - (opaque[i] + 1)), dy = Math.max(opaque[i + 1] - Y, 0, Y - (opaque[i + 1] + 1));
      best = Math.min(best, Math.hypot(dx, dy));
    }
    if (best > maxOnBody) { maxOnBody = best; maxOnBodyAt = `${f.dir} ${f.name} ${label}`; }
    if (best > 3) fail(`${f.dir} ${f.name} ${label}: ${best.toFixed(2)} px from the nearest opaque pixel (limit 3)`);
  }
}

// side convention: down RIGHT < LEFT in x, up RIGHT > LEFT
let minSep = { down: Infinity, up: Infinity };
for (const f of good) {
  if (f.dir === 'right') continue;
  const sign = f.dir === 'down' ? 1 : -1; // down: (LEFT - RIGHT) > 0, up: (RIGHT - LEFT) > 0
  for (const part of ['SHOULDER', 'ARM', 'HIP', 'LEG']) {
    const sep = sign * (f.by[`LEFT ${part}`].x - f.by[`RIGHT ${part}`].x) * CANVAS;
    minSep[f.dir] = Math.min(minSep[f.dir], sep);
    if (!(sep > 0)) fail(`${f.dir} ${f.name} ${part}: RIGHT is not on the ${f.dir === 'down' ? 'viewer-left' : 'viewer-right'} of LEFT (sep ${sep.toFixed(2)} px)`);
  }
}

// idle vs PixelLab's own estimate on the rig idle silhouette
const estMax = {}; let maxEst = 0, maxEstAt = '';
for (const f of good.filter((g) => g.name === 'idle')) {
  const E = Object.fromEntries((est[f.dir] ?? []).map((j) => [j.label, j]));
  estMax[f.dir] = 0;
  for (const label of LABELS) {
    const e = E[label];
    if (!e) { fail(`estimate file has no ${f.dir} ${label}`); continue; }
    const dist = Math.hypot((f.by[label].x - e.x) * CANVAS, (f.by[label].y - e.y) * CANVAS);
    estMax[f.dir] = Math.max(estMax[f.dir], dist);
    if (dist > maxEst) { maxEst = dist; maxEstAt = `${f.dir} ${label}`; }
    if (dist > 10) fail(`${f.dir} idle ${label}: ${dist.toFixed(2)} px from the estimate (limit 10)`);
  }
}

// not stale: the file is what the exporter would write now
const fresh = buildKeypoints();
if (JSON.stringify(fresh) !== JSON.stringify(JSON.parse(JSON.stringify(data)))) fail('rig-keypoints.json differs from a fresh export (re-run export-keypoints.mjs)');

console.log(`skeletons ${frames.length} (3 directions x (1 idle + 8 walk)), joints per skeleton ${[...new Set(frames.map((f) => f.joints?.length))].join('/')}`);
console.log(`max ankle/hand distance to an opaque pixel (2x px): ${maxOnBody.toFixed(2)} (limit 3) at ${maxOnBodyAt}`);
console.log(`min left/right separation (2x px): down ${minSep.down.toFixed(2)}, up ${minSep.up.toFixed(2)} (must be > 0)`);
console.log(`max idle distance to estimate (2x px): ${maxEst.toFixed(2)} (limit 10) at ${maxEstAt}; per direction ${DIRS.map((d) => `${d} ${(estMax[d] ?? NaN).toFixed(2)}`).join(', ')}`);
if (fails.length) {
  console.error(`FAIL (${fails.length}):`);
  for (const m of fails.slice(0, 40)) console.error('  ' + m);
  process.exit(1);
}
console.log('OK');
