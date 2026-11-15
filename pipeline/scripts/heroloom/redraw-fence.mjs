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
const POST_W = 22, POST_H = 72, CAP_H = 6;
const POSTS = [{x0: 2, seed: 2}, {x0: 89, seed: 9}];
const RAIL_HI = [48, 64];  // distance above the ground line (upper rail)
const RAIL_LO = [22, 36];  // lower rail

function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

// explicit pixel cross-section for a rail of `th` rows: ink edge, lit top face,
// front face with one darker step, shadowed underside, ink edge again.
function railBands(th) {
  const b = [INK_SOFT];
  const topN = Math.max(1, Math.round(th * 0.22));
  const botN = Math.max(1, Math.round(th * 0.16));
  const midN = Math.max(1, th - 2 - topN - botN);
  for (let i = 0; i < topN; i++) b.push(i === 0 ? RAIL_TOP : RAIL_FACE);
  for (let i = 0; i < midN; i++) b.push(i < midN * 0.6 ? RAIL_MID : RAIL_DARK);
  for (let i = 0; i < botN; i++) b.push(RAIL_BOT);
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
        // long, sparse grain runs on the front face (deterministic, not speckle)
        if (t > 0.35 && t < 0.78) {
          const run = hash2(Math.floor(x / (8 * S)), 1, seed);
          if (run > 0.78 && t > 0.45 && t < 0.65) c = GRAIN_DARK;
          if (run > 0.985 && t < 0.45) c = GRAIN_LIGHT;
        }
        put(x, y, c);
      }
    }
  };
  drawRail(RAIL_HI[0], RAIL_HI[1], 3);
  drawRail(RAIL_LO[0], RAIL_LO[1], 7);

  // ── posts ─────────────────────────────────────────────────────────────────
  const drawPost = (post) => {
    const seed = post.seed;
    const x0 = post.x0 * S, x1 = (post.x0 + POST_W) * S;   // [x0, x1)
    const cx = (x0 + x1) / 2;
    const baseY = Math.round(GROUND * S - SLOPE * cx);
    const topY = baseY - POST_H * S;               // may be < 0 for the far post
    const bodyTop = Math.max(0, topY + CAP_H * S);
    const corner = x0 + Math.round((x1 - x0) * 0.58);
    // vertical body: lit left edge, front-left face, ink corner seam, shaded right
    for (let y = bodyTop; y < baseY; y++) {
      const t = Math.min(1, (y - bodyTop) / Math.max(1, baseY - bodyTop));
      for (let x = x0; x < x1; x++) {
        const fx = (x - x0) / (x1 - x0);
        let c;
        if (x === x0 || x === x1 - 1) c = INK;
        else if (fx < 0.12) c = POST_HI;
        else if (fx < 0.50) c = t < 0.34 ? POST_LIGHT : POST_MID;
        else if (fx < 0.55) c = INK_SOFT;
        else c = t < 0.40 ? POST_MID : POST_DARK;
        // sparse 1px vertical grain streaks (quantised to the art grid)
        const g = hash2(Math.floor((x - x0) / (2 * S)), Math.floor((y - topY) / (5 * S)), seed);
        if (x !== x0 && x !== x1 - 1 && Math.abs(fx - 0.53) > 0.03 && g > 0.90 && t > 0.28 && t < 0.82) c = GRAIN_DARK;
        // ambient occlusion just under the cap, darker contact at the base
        if (y < bodyTop + 2 * S) c = POST_DARK;
        if (y >= baseY - 2 * S) c = POST_DEEP;
        put(x, y, c);
      }
    }
    // rail shadows: the beams sit in front, so drop a 2-row shade where each rail
    // crosses the post (ties posts and rails together and adds depth)
    for (const [d0] of [RAIL_HI, RAIL_LO]) {
      const yBot = Math.round(GROUND * S - SLOPE * cx - d0 * S);
      for (let x = x0 + S; x < x1 - S; x++) put(x, yBot, INK_SOFT);
    }
    // ground contact: ink corners + soft shadow row
    for (let x = x0; x < x1; x++) put(x, baseY, x === x0 || x === x1 - 1 ? INK : SHADOW);
    // cap: overhanging lip, lit top face, bevel, ink bottom seam
    const capRows = [
      [2, INK, true], [1, CAP_HI, false], [-1, CAP_TOP, true], [-1, CAP_TOP, true],
      [-1, CAP_FACE, true], [-1, POST_MID, true], [-1, INK_SOFT, true],
    ];
    for (let r = 0; r < capRows.length; r++) {
      const [inset, color, endInk] = capRows[r];
      const rx0 = x0 + inset * S, rx1 = x1 - inset * S;
      for (let yy = 0; yy < S; yy++) {
        const y = topY + r * S + yy;
        if (y < 0 || y >= H) continue;
        for (let x = rx0; x < rx1; x++) {
          const c = endInk && (x === rx0 || x === rx1 - 1) ? INK_SOFT : color;
          put(x, y, c);
        }
      }
    }
    // nails where each rail crosses this post (2x2 ink + 1px lit top)
    for (const [d0, d1] of [RAIL_HI, RAIL_LO]) {
      const yTop = Math.round(GROUND * S - SLOPE * cx - d1 * S);
      const yMid = yTop + Math.round((d1 - d0) * S * 0.45);
      const nx = x0 + Math.round((x1 - x0) * 0.30);
      for (let dy = 0; dy < 2 * S; dy++) for (let dx = 0; dx < 2 * S; dx++) put(nx + dx, yMid + dy, INK);
      put(nx, yMid - 1, GRAIN_LIGHT);
    }
    // a couple of moss specks at the base (deterministic, minimal)
    for (let i = 0; i < 2; i++) {
      const mx = x0 + S + Math.round(hash2(i, seed, 31) * (x1 - x0 - 3 * S));
      const my = baseY - 1 - Math.round(hash2(i, seed + 5, 37) * 3 * S);
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
