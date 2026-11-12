// Shared by the AI-body class generator (pixelfx tools/character-ai-body.mjs) and tools/checks/pixelfx-ai-classes.mjs: the frame list, the AI body frames
// (PixelLab "complete body v3": its own idle and walk poses, 74x74 cells, feet line y=63), the rig posed to
// fit each frame's skeleton (outfit-pose.mjs), the rig's own render of that pose (per-pixel part / rest cell /
// bone-local descriptor, via a capture material so no render behaviour of core/rig.js is touched) and the
// placement into the 74x74 cell.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { posed, setGearPass, skeleton, BONE } from './core/rig.js';
import { BARE_BODY_PLAIN } from './barebody.js';
import { readPNG } from './png-io.mjs';
import { fitFrame, trackedJoints, PLACE, SCALES } from './outfit-pose.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const OUT = path.join(ROOT, 'output/pixelfx-character/outfit');
export const CELL = 74, FOOT = 63;
export const AI_DIR = path.join(ROOT, 'output/pixellab-barebody');
export const KEYPOINTS = path.join(AI_DIR, 'v3-keypoints.json');
/** The AI body's outline colour (#251a15 in the rig-body sheets); the rig's gear outline uses the body's own ink, see inkOf. */
export const DIRS = ['down', 'up', 'right', 'left']; // left = right mirrored in the cell
export const SRC_DIRS = ['down', 'up', 'right'];
export const NFRAME = 9; // idle + 8 walk
export const SLOTS = ['head', 'body', 'legs', 'back', 'weapon'];
/** Stack order, bottom first: the legs/body garments, then the back (quiver over the tunic), head, weapon. */
export const STACK = ['legs', 'body', 'back', 'head', 'weapon'];
export const GEAR_PARTS = new Set([23, 24]); // PART.weapon, PART.offWeapon

const sheets = {};
const sheet = (name) => (sheets[name] ??= readPNG(path.join(AI_DIR, 'sheets-v3', name)));
const rowOf = { down: 0, up: 1, right: 2, left: 3 };
/** The AI body frame (74x74 RGBA) of (dir in down/up/right/left, k): k 0 = idle, 1..8 = walk 0..7. */
export function aiFrame(dir, k) {
  const sh = k === 0 ? sheet('barebody-idle-4dir.png') : sheet('walk-4dir.png');
  if (!sh) throw new Error('missing AI body sheets under output/pixellab-barebody/sheets-v3');
  const cx = k === 0 ? rowOf[dir] * CELL : (k - 1) * CELL, cy = k === 0 ? 0 : rowOf[dir] * CELL;
  const out = new Uint8ClampedArray(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) out.set(sh.data.subarray(((cy + y) * sh.w + cx) * 4, ((cy + y) * sh.w + cx + CELL) * 4), y * CELL * 4);
  return out;
}

export const keypoints = () => JSON.parse(fs.readFileSync(KEYPOINTS, 'utf8'));
let tracked = null;
/** the tracked near/far joints of every frame of a direction (right: near/far kept continuous over the cycle) */
export function joints(dir, k) {
  tracked ??= {};
  if (!tracked[dir]) tracked[dir] = trackedJoints(dir, keypoints(), (kk) => aiFrame(dir, kk));
  return tracked[dir][k];
}
/** The fitted rig pose of (dir in down/up/right, k) with its horizontal placement. */
export function poseOf(dir, k) {
  const d = dir === 'left' ? 'right' : dir;
  return fitFrame(d, joints(d, k));
}

let ids = 0;
/**
 * Render a pose with the rig and capture everything a layer needs. place = { ox } the integer shift of the
 * rig origin in the cell; pass = the gear pass (or null for the bare body). Returns
 *   px: Map 'x,y' -> { x, y, color (uint32 ABGR), ink, part, bone, src, d (material descriptor or null) }
 * in 74x74 cell coordinates, plus skel: the skeleton joints in rig px (x right, y down, feet origin).
 */
export function capture(pose, place, pass, ink) {
  const desc = new Map();
  const material = {
    ...BARE_BODY_PLAIN,
    id: `outfit-${ids++}`,
    ink: ink ?? BARE_BODY_PLAIN.ink,
    overlay: null,
    layers: [(p) => { desc.set(`${PLACE.x0 + place.ox + p.sx},${PLACE.r0 - p.sy}`, p); return null; }, ...BARE_BODY_PLAIN.layers],
  };
  setGearPass(pass ?? null);
  const r = posed(pose, material);
  setGearPass(null);
  const px = new Map();
  for (let i = 0; i < r.n; i++) {
    const x = PLACE.x0 + place.ox + r.xs[i], y = PLACE.r0 + r.ys[i];
    if (x < 0 || y < 0 || x >= CELL || y >= CELL) continue;
    const key = `${x},${y}`;
    px.set(key, { x, y, color: r.color[i] >>> 0, ink: r.ink[i] === 1, part: r.part[i], bone: BONE[r.part[i]] ?? null, src: r.src[i], d: desc.get(key) ?? null });
  }
  return { px, skel: skeleton(pose).joints, sc: pose.scale, sl: pose.scaleLimb };
}

export { SCALES, PLACE };
export const rgba = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255];
export const pack = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

// ---- correspondence helpers (the compositor and its checker share them)
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
export const MATCH_R = 3; // px: nearest rig body pixel for an AI pixel
// ---- AI pixel classes
/** outline / shadow pixels (never garment) and the shading rank 0 lit .. 3 darkest of the others */
export function classify(ai, i) {
  const r = ai[i * 4], g = ai[i * 4 + 1], b = ai[i * 4 + 2], L = lum(r, g, b);
  if (ai[i * 4 + 3] < 128) return { solid: false };
  if (L <= 40) return { solid: true, ink: true };
  // skin (L 100..215, far limbs darkest) or the AI's dark-brown cloth (shorts, wrap: L < 100)
  const tone = L >= 207 ? 0 : L >= 178 ? 1 : L >= 148 ? 2 : L >= 100 ? 3 : L >= 62 ? 1 : 2;
  return { solid: true, ink: false, tone };
}

/** nearest rig body pixel (one with a descriptor) to (x, y) within MATCH_R, else null */
export function nearestRig(list, x, y) {
  let best = null, bd = MATCH_R * MATCH_R + 0.001;
  for (const q of list) {
    const dx = q.x - x, dy = q.y - y, d = dx * dx + dy * dy;
    if (d < bd || (d === bd && best && (q.y < best.y || (q.y === best.y && q.x < best.x)))) { bd = d; best = q; }
  }
  return best;
}

