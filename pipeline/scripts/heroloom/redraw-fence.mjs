// HeroLoom scene round 2 — structural redraw of the fenceRail detail cell.
//
// Deterministic, dependency-free. The cell is one isometric fence bay: two square
// timber posts joined by two thick rails with a baked 0.35 art-pixel slope (the
// engine adds +0.125 shear at draw time so the rail line lands on the 2:1 iso
// grid; src/pixel-world.js:1091-1106). Village walls repeat this bay with ~21%
// overlap, so outlines must be explicit shape edges, never a silhouette ring at
// the cell borders (a vertical ink line there would print over the neighbour).
//
// Output: assets/heroloom-scene/details@1x.png and details@2x.png with ONLY the
// fenceRail cell replaced; every other pixel of the accepted round-1 atlas is
// copied byte-for-byte. Original assets/details@*.png are never touched.
import fs from 'node:fs';
import path from 'node:path';
import {decodePng, encodeRgba} from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SCENE = path.join(ROOT, 'assets/heroloom-scene');

// ── palette (HeroLoom warm timber, ink outline #150d1b) ────────────────────────
const INK = [21, 13, 27];
const INK_SOFT = [40, 26, 32];
const SHADOW = [58, 36, 24];
const CAP_TOP = [228, 196, 132];
const CAP_HI = [240, 214, 158];
const CAP_FACE = [200, 160, 90];
const POST_LIGHT = [176, 124, 70];
const POST_HI = [196, 142, 82];
const POST_MID = [145, 96, 55];
const POST_DARK = [112, 72, 43];
const POST_DEEP = [82, 51, 30];
const RAIL_TOP = [223, 185, 138];
const RAIL_FACE = [196, 150, 94];
const RAIL_MID = [166, 116, 68];
const RAIL_DARK = [134, 88, 50];
const RAIL_BOT = [96, 60, 35];
const GRAIN_DARK = [120, 77, 45];
const GRAIN_LIGHT = [205, 163, 108];
const MOSS = [92, 115, 52];

// ── geometry, in art pixels of the 112x104 cell (multiplied by S for @2x) ─────
const CELL_W = 112, CELL_H = 104;
const SLOPE = 0.35;   // art-space slope; engine adds .125 -> .475 display vs .5 pitch
const GROUND = 107;   // ground y at x = 0
const POST_W = 26, POST_H = 88, CAP_H = 7;
// Two capped posts per bay, one at each cell edge. Adjacent bays overlap by ~19%, and the
// engine's decoration draw order differs from my offline simulator's, so the safe shape is
// a post at BOTH ends: whichever panel is painted last, the overlap region always ends in a
// post, never in a bare rail crossing over a neighbour's post. The two posts land on top of
// each other at every bay boundary and read as one thick composite post.
const POSTS = [{x0: 2, seed: 2, h: POST_H}, {x0: 85, seed: 9, h: POST_H}];
const RAIL_HI = [42, 64];  // distance above the ground line (upper rail), 22 art rows thick
const RAIL_LO = [14, 36];  // lower rail, 22 art rows thick

function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

// explicit pixel cross-section for a chunky rail of `th` rows (24 at 1x):
// 1 ink edge, lit top face (perspective surface), mid front face, dark underside,
// 1 ink edge. A rail must read as a solid plank at ~0.366 display scale, so the
// lit face is ~25% of the thickness and the body has two distinct ramp steps.
function railBands(th) {
  const b = [INK];
  const topN = Math.max(2, Math.round(th * 0.26));
  const botN = Math.max(2, Math.round(th * 0.14));
  const midN = Math.max(1, th - 2 - topN - botN);
  for (let i = 0; i < topN; i++) b.push(i === 0 ? CAP_HI : i < topN - 1 ? RAIL_TOP : RAIL_FACE);
  for (let i = 0; i < midN; i++) b.push(i < midN * 0.42 ? RAIL_FACE : i < midN * 0.75 ? RAIL_MID : RAIL_DARK);
  for (let i = 0; i < botN; i++) b.push(i === botN - 1 ? RAIL_BOT : RAIL_DARK);
  b.push(INK);
  return b;
}

export function renderFenceCell(S = 1) {
  const W = CELL_W * S, H = CELL_H * S;
  const rgba = new Uint8Array(W * H * 4);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  };
  const groundAt = (x) => GROUND * S - SLOPE * (x + 0.5);

  // ── rails first (posts are drawn over them) ────────────────────────────────
  const drawRail = (d0, d1, seed) => {
    const th = (d1 - d0) * S;
    const bands = railBands(th);
    for (let x = 0; x < W; x++) {
      const yTop = Math.round(groundAt(x) - d1 * S);
      for (let k = 0; k < th; k++) {
        const y = yTop + k, t = k / Math.max(1, th - 1);
        let c = bands[Math.min(k, bands.length - 1)];
        // sparse, short grain streaks on the front face only (never on the lit top face,
        // where light specks read as dirt at 0.37 display scale)
        if (t > 0.50 && t < 0.66) {
          const run = hash2(Math.floor(x / (11 * S)), 1, seed);
          if (run > 0.93) c = GRAIN_DARK;
        }
        put(x, y, c);
      }
    }
  };
  drawRail(RAIL_HI[0], RAIL_HI[1], 3);
  drawRail(RAIL_LO[0], RAIL_LO[1], 7);

  // ── post (drawn over its own rails: chunky square post, overhanging lit cap) ──
  const drawPost = (post) => {
    const seed = post.seed;
    const x0 = post.x0 * S, x1 = (post.x0 + POST_W) * S;   // [x0, x1)
    const cx = (x0 + x1) / 2;
    const w = x1 - x0;
    const baseY = Math.round(GROUND * S - SLOPE * cx);
    const topY = baseY - post.h * S;
    const bodyTop = Math.max(0, topY + CAP_H * S);
    const seamX = x0 + Math.round(w * 0.42);
    // body: lit left face, ink corner seam, shaded right face, vertical ramp
    for (let y = bodyTop; y < baseY; y++) {
      const t = (y - bodyTop) / Math.max(1, baseY - bodyTop);
      for (let x = x0; x < x1; x++) {
        let c;
        if (x === x0 || x === x1 - 1) c = INK;
        else if (x < seamX) c = t < 0.28 ? POST_HI : t < 0.68 ? POST_LIGHT : POST_MID;
        else if (x < seamX + S) c = INK_SOFT;
        else c = t < 0.28 ? POST_MID : t < 0.78 ? POST_DARK : POST_DEEP;
        // sparse vertical grain streaks, quantised to the art grid (very few)
        const g = hash2(Math.floor((x - x0) / (3 * S)), Math.floor((y - topY) / (7 * S)), seed);
        if (x !== x0 && x !== x1 - 1 && x < seamX && g > 0.93 && t > 0.25 && t < 0.8) c = GRAIN_DARK;
        // ambient occlusion under the cap + darker contact at the base
        if (y < bodyTop + 2 * S) c = POST_DARK;
        if (y >= baseY - 2 * S) c = POST_DEEP;
        put(x, y, c);
      }
    }
    // ground contact: ink corners + soft AO strip so the post sits in the grass
    for (let x = x0; x < x1; x++) put(x, baseY, x === x0 || x === x1 - 1 ? INK : SHADOW);
    for (let x = x0 - S; x < x1 + S; x++) put(x, baseY + S, POST_DEEP);
    // cap: 2px overhang each side, lit top face, bevel, ink bottom seam
    const capRows = ['ink', 'hi', 'top', 'top', 'hi', 'face', 'mid', 'soft'];
    const over = 2 * S;
    for (let r = 0; r < CAP_H * S; r++) {
      const y = topY + r;
      if (y < 0 || y >= H) continue;
      const kind = capRows[Math.min(capRows.length - 1, Math.floor(r / S))];
      const rx0 = Math.max(0, x0 - over), rx1 = Math.min(W, x1 + over);
      for (let x = rx0; x < rx1; x++) {
        const c = kind === 'ink' ? INK : kind === 'hi' ? CAP_HI : kind === 'top' ? CAP_TOP
          : kind === 'face' ? CAP_FACE : kind === 'mid' ? POST_MID : INK_SOFT;
        put(x, y, c);
      }
    }
    // where each rail meets the post: a soft shadow band across the post face plus a
    // 2x2 ink nail with a lit pixel, so the rails read as nailed on, not floating by
    for (const [d0, d1] of [RAIL_HI, RAIL_LO]) {
      const yTop = Math.round(GROUND * S - SLOPE * cx - d1 * S);
      const yBot = Math.round(GROUND * S - SLOPE * cx - d0 * S);
      for (let y = yTop; y < yBot; y++) {
        for (let x = x0 + S; x < x1 - S; x++) {
          const i = (y * W + x) * 4;
          if (!rgba[i + 3]) continue;
          rgba[i] = Math.max(0, rgba[i] - 30);
          rgba[i + 1] = Math.max(0, rgba[i + 1] - 24);
          rgba[i + 2] = Math.max(0, rgba[i + 2] - 16);
        }
      }
      const yMid = yTop + Math.round((d1 - d0) * S * 0.46);
      const nx = x0 + Math.round(w * 0.30);
      for (let dy = 0; dy < 2 * S; dy++) for (let dx = 0; dx < 2 * S; dx++) put(nx + dx, yMid + dy, INK);
      put(nx, yMid - 1, GRAIN_LIGHT);
    }
    // a couple of moss specks at the base (deterministic, minimal)
    for (let i = 0; i < 2; i++) {
      const mx = x0 + S + Math.round(hash2(i, seed, 31) * (w - 3 * S));
      const my = baseY - 1 - Math.round(hash2(i, seed + 5, 37) * 2 * S);
      if (hash2(i, seed + 9, 41) > 0.42) put(mx, my, MOSS);
    }
  };
  for (const p of POSTS) drawPost(p);
  return {w: W, h: H, rgba};
}

// ── splice the new cell into the accepted round-1 atlases ────────────────────
function splice(lod, S) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, `assets/details@${lod}.manifest.json`), 'utf8'));
  const cell = manifest.cells.fenceRail;
  const file = path.join(SCENE, `details@${lod}.png`);
  const atlas = decodePng(fs.readFileSync(file));
  const art = renderFenceCell(S);
  if (cell.w !== art.w || cell.h !== art.h) throw new Error(`cell size mismatch ${lod}: manifest ${cell.w}x${cell.h} vs art ${art.w}x${art.h}`);
  const before = Uint8Array.from(atlas.rgba);
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const si = (y * art.w + x) * 4, di = ((cell.y + y) * atlas.width + cell.x + x) * 4;
      for (let k = 0; k < 4; k++) atlas.rgba[di + k] = art.rgba[si + k];
    }
  }
  let changedOutside = 0;
  for (let y = 0; y < atlas.height; y++) for (let x = 0; x < atlas.width; x++) {
    if (x >= cell.x && x < cell.x + cell.w && y >= cell.y && y < cell.y + cell.h) continue;
    const i = (y * atlas.width + x) * 4;
    for (let k = 0; k < 4; k++) if (atlas.rgba[i + k] !== before[i + k]) changedOutside++;
  }
  if (changedOutside) throw new Error(`${lod}: ${changedOutside} bytes changed outside the fenceRail cell`);
  const png = encodeRgba(atlas.width, atlas.height, atlas.rgba);
  fs.writeFileSync(file, png);
  const colours = new Set();
  let opaque = 0;
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) {
    const i = (y * art.w + x) * 4;
    if (art.rgba[i + 3]) { opaque++; colours.add(art.rgba[i] << 16 | art.rgba[i + 1] << 8 | art.rgba[i + 2]); }
  }
  return {lod, file: path.relative(ROOT, file).replaceAll('\\', '/'), width: atlas.width, height: atlas.height, cell, bytes: png.length, artOpaque: opaque, artColors: colours.size, palette: [...colours].map((c) => '#' + c.toString(16).padStart(6, '0'))};
}

const results = [splice('1x', 1), splice('2x', 2)];
const report = {generator: 'pipeline/scripts/heroloom/redraw-fence.mjs', generatedAt: new Date().toISOString(), results};
fs.writeFileSync(path.join(SCENE, 'redraw-fence-report.json'), JSON.stringify(report, null, 2));
for (const r of results) console.log(`${r.file} ${r.width}x${r.height} cell[${r.cell.x},${r.cell.y},${r.cell.w},${r.cell.h}] opaque=${r.artOpaque} colours=${r.artColors} bytes=${r.bytes}`);
console.log('OK redraw-fence');
