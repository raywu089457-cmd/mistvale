// HeroLoom scene round 2 — terrain + fence + plaza checker.
// Asserts: dimensions kept, manifests/cell rects unchanged, atlas cells byte-identical outside
// the redrawn fenceRail rect, exact tile seams (lr/tb === 0 via the runtime's own edgeMismatch
// formula), per-material hue families preserved, sane colour counts / luminance.
// Usage: node tools/checks/heroloom-terrain-fence.mjs   (exit 1 on any FAIL)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../../pipeline/scripts/heroloom/png.mjs';
import { regionStats, hueDiff, coverage } from '../../pipeline/scripts/heroloom/scene-color.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (...p) => path.join(ROOT, ...p);
let checks = 0, fails = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};
const read = (p) => fs.readFileSync(p);
const png = (p) => decodePng(read(p));

const SEAM_LIMIT = 0.001;          // we force exact seams; tiny tolerance for safety
const HUE_TOL = 12;                // degrees of mean-hue drift allowed per material
const MIN_COLORS = 7;              // round-2 textures are deliberately simplified to 7-9 shades
const L_TOL = 0.16;                // mean lightness drift allowed vs the original cell

// Expected manifest rects as shipped before round 2 (assets/*.manifest.json is not modified).
const TERRAIN_RECTS = {
  village: [0, 0, 256, 256], meadow: [256, 0, 256, 256], birch: [512, 0, 256, 256], forest: [768, 0, 256, 256],
  taiga: [0, 256, 256, 256], snow: [256, 256, 256, 256], mountain: [512, 256, 256, 256], desert: [768, 256, 256, 256],
  river: [0, 512, 256, 256], ocean: [256, 512, 256, 256], ice: [512, 512, 256, 256], bridge: [768, 512, 256, 256],
};
const FENCE_RECT = {
  'details@1x': [154, 1094, 112, 104],
  'details@2x': [306, 2180, 224, 208],
};

// --- 1. details atlases: dims, fence rect unchanged, all other pixels byte-identical -------------
for (const variant of ['details@1x', 'details@2x']) {
  const refPath = P('output/heroloom-ext/scene2', `ref-round1-${variant}.png`);
  const orig = png(fs.existsSync(refPath) ? refPath : P('assets', `${variant}.png`));
  const cur = png(P('assets/heroloom-scene', `${variant}.png`));
  ok(orig.width === cur.width && orig.height === cur.height, `${variant}: dimensions unchanged`,
    `${cur.width}x${cur.height}`);
  const manifest = JSON.parse(read(P('assets', `${variant}.manifest.json`)));
  const cell = manifest.cells.fenceRail;
  const exp = FENCE_RECT[variant];
  ok(cell && cell.x === exp[0] && cell.y === exp[1] && cell.w === exp[2] && cell.h === exp[3],
    `${variant}: fenceRail manifest rect unchanged`, cell ? `[${cell.x},${cell.y},${cell.w},${cell.h}]` : 'missing');
  const [cx, cy, cw, ch] = exp;
  let changedOutside = 0, changedInside = 0, ink = 0, opaque = 0, colors = new Set();
  for (let y = 0; y < cur.height; y++) for (let x = 0; x < cur.width; x++) {
    const i = (y * cur.width + x) * 4, j = (y * orig.width + x) * 4;
    const same = cur.rgba[i] === orig.rgba[j] && cur.rgba[i + 1] === orig.rgba[j + 1] &&
      cur.rgba[i + 2] === orig.rgba[j + 2] && cur.rgba[i + 3] === orig.rgba[j + 3];
    const inside = x >= cx && x < cx + cw && y >= cy && y < cy + ch;
    if (!same) { if (inside) changedInside++; else changedOutside++; }
    if (inside) {
      if (cur.rgba[i + 3] > 0) {
        opaque++;
        const pk = (cur.rgba[i] << 16) | (cur.rgba[i + 1] << 8) | cur.rgba[i + 2];
        colors.add(pk);
        if (cur.rgba[i] < 40 && cur.rgba[i + 1] < 32 && cur.rgba[i + 2] < 44) ink++; // ~#150d1b ink family
      }
    }
  }
  ok(changedOutside === 0, `${variant}: every pixel outside fenceRail rect is byte-identical to the accepted round-1 atlas`,
    `${changedOutside} changed`);
  ok(changedInside > 0, `${variant}: fenceRail cell was actually redrawn`, `${changedInside}px changed`);
  ok(colors.size >= MIN_COLORS, `${variant}: fence cell uses >= ${MIN_COLORS} colours`, `${colors.size}`);
  ok(ink / opaque > 0.03, `${variant}: ink outline present in fence cell`, `${(100 * ink / opaque).toFixed(1)}% ink`);
  // Horizontal continuity: both rail bands must land within 3px of the analytic slope at the right edge.
  const SCALE = variant.endsWith('@2x') ? 2 : 1;
  const SLOPE = 0.35, GROUND = 107 * SCALE;
  let worst = 0;
  for (const dy of [48 * SCALE, 22 * SCALE]) { // upper / lower rail band bottoms above ground
    const rowAt = (x) => Math.round(cy + GROUND - SLOPE * x - dy);
    const findRow = (x, guess) => {
      for (let d = 0; d <= 6; d++) for (const s of [d, -d]) {
        const y = guess + s;
        if (y < cy || y >= cy + ch) continue;
        const i = (y * cur.width + x) * 4;
        if (cur.rgba[i + 3] > 0) return y;
      }
      return null;
    };
    const lx = cx + 1, rx = cx + cw - 2;
    const gl = findRow(lx, rowAt(0));
    const gr = findRow(rx, rowAt(cw - 1));
    if (gl == null || gr == null) { worst = 99; break; }
    const expect = Math.round(rowAt(cw - 2)) - Math.round(rowAt(1));
    const got = gr - gl;
    worst = Math.max(worst, Math.abs(got - expect));
  }
  ok(worst <= 3, `${variant}: rails keep their 0.35 baked slope across the cell (tiles continuously)`,
    `max row drift ${worst}px`);
}

// --- 2. terrain atlas: dims, manifest rects unchanged, per-cell seam + hue ----------------------
const tOrig = png(P('assets/terrain-atlas.png'));
const tNew = png(P('assets/heroloom-scene/terrain-atlas.png'));
ok(tOrig.width === tNew.width && tOrig.height === tNew.height, 'terrain-atlas: dimensions unchanged',
  `${tNew.width}x${tNew.height}`);
const tManifest = JSON.parse(read(P('assets/terrain-atlas.manifest.json')));
ok(tManifest.cells && Object.keys(tManifest.cells).length === 12, 'terrain-atlas: manifest still has 12 cells',
  `${Object.keys(tManifest.cells || {}).length}`);
let rectOk = true, missing = [];
for (const [name, exp] of Object.entries(TERRAIN_RECTS)) {
  const c = tManifest.cells[name];
  if (!c || c.x !== exp[0] || c.y !== exp[1] || c.w !== exp[2] || c.h !== exp[3]) { rectOk = false; missing.push(name); }
}
ok(rectOk, 'terrain-atlas: all manifest cell rects unchanged (4x3 grid, tile 256)', missing.join(','));

const rows = [];
let worstHue = 0, worstHueName = '', worstSeam = 0;
for (const [name, [x, y, w, h]] of Object.entries(TERRAIN_RECTS)) {
  const so = regionStats(tOrig.rgba, tOrig.width, x, y, w, h);
  const sn = regionStats(tNew.rgba, tNew.width, x, y, w, h);
  const seamLr = seamOfRegion(tNew, x, y, w, h, 'lr');
  const seamTb = seamOfRegion(tNew, x, y, w, h, 'tb');
  const dh = hueDiff(so.meanHue, sn.meanHue);
  const cols = countOpaqueColors(tNew, x, y, w, h);
  if (dh != null && dh > worstHue) { worstHue = dh; worstHueName = name; }
  worstSeam = Math.max(worstSeam, seamLr, seamTb);
  ok(w === 256 && h === 256, `terrain/${name}: cell is 256x256`, `${w}x${h}`);
  ok(seamLr <= SEAM_LIMIT && seamTb <= SEAM_LIMIT, `terrain/${name}: seamless lr/tb`,
    `lr=${seamLr.toFixed(5)} tb=${seamTb.toFixed(5)}`);
  ok(dh == null || dh <= HUE_TOL, `terrain/${name}: hue family kept (<= ${HUE_TOL}deg)`,
    `orig ${so.meanHue} -> new ${sn.meanHue} (d=${dh == null ? 'n/a' : dh.toFixed(1)})`);
  ok(Math.abs(sn.meanL - so.meanL) <= L_TOL, `terrain/${name}: mean lightness in band`,
    `L ${so.meanL.toFixed(3)} -> ${sn.meanL.toFixed(3)}`);
  ok(cols >= MIN_COLORS, `terrain/${name}: >= ${MIN_COLORS} colours`, `${cols}`);
  rows.push({ name, seamLr, seamTb, hueOrig: so.meanHue, hueNew: sn.meanHue, dHue: dh, L: sn.meanL, cols });
}

// --- 3. plaza ----------------------------------------------------------------------------------
const pOrig = png(P('assets/plaza.png'));
const pNew = png(P('assets/heroloom-scene/plaza.png'));
ok(pOrig.width === pNew.width && pOrig.height === pNew.height, 'plaza: dimensions unchanged',
  `${pNew.width}x${pNew.height}`);
const pLr = seamOfRegion(pNew, 0, 0, pNew.width, pNew.height, 'lr');
const pTb = seamOfRegion(pNew, 0, 0, pNew.width, pNew.height, 'tb');
ok(pLr <= SEAM_LIMIT && pTb <= SEAM_LIMIT, 'plaza: seamless lr/tb', `lr=${pLr.toFixed(5)} tb=${pTb.toFixed(5)}`);
const pStats = regionStats(pNew.rgba, pNew.width, 0, 0, pNew.width, pNew.height);
const pCols = countOpaqueColors(pNew, 0, 0, pNew.width, pNew.height);
ok(pCols >= MIN_COLORS, `plaza: >= ${MIN_COLORS} colours (paving, not a flat fill)`, `${pCols}`);
ok(pStats.meanC <= 0.06, 'plaza: reads as cool/neutral stone (low chroma)', `C=${pStats.meanC.toFixed(3)}`);
ok(pStats.meanL >= 0.45 && pStats.meanL <= 0.8, 'plaza: mid-tone luminance (sits with HeroLoom buildings)',
  `L=${pStats.meanL.toFixed(3)}`);
ok(coverage(pNew.rgba) > 0.999, 'plaza: fully opaque tile', `${(100 * coverage(pNew.rgba)).toFixed(1)}%`);

// --- 4. xilurus biome textures ----------------------------------------------------------------
const TEX = ['desert', 'dirt', 'forest', 'grass', 'ice', 'meadow', 'mountain', 'snow', 'soil', 'stone', 'taiga', 'water'];
let worstTexSeam = 0;
for (const name of TEX) {
  const img = png(P('assets/heroloom-scene/xilurus', `tex-${name}.png`));
  const lr = seamOfRegion(img, 0, 0, img.width, img.height, 'lr');
  const tb = seamOfRegion(img, 0, 0, img.width, img.height, 'tb');
  worstTexSeam = Math.max(worstTexSeam, lr, tb);
  ok(img.width === 256 && img.height === 256, `xilurus/tex-${name}: 256x256`, `${img.width}x${img.height}`);
  ok(lr <= SEAM_LIMIT && tb <= SEAM_LIMIT, `xilurus/tex-${name}: seamless lr/tb`,
    `lr=${lr.toFixed(5)} tb=${tb.toFixed(5)}`);
}

// --- 5. texture regularity gates (round-2b: no coherent bands / blobs) -------------------------
const LOW_BAND = new Set(['ocean', 'river', 'desert', 'snow', 'ice']);
const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const bandByCell = {};
for (const [name, [x, y, w, h]] of Object.entries(TERRAIN_RECTS)) {
  const L = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const q = ((y + j) * tNew.width + x + i) * 4;
    L[j * w + i] = lumOf(tNew.rgba[q], tNew.rgba[q + 1], tNew.rgba[q + 2]);
  }
  const rowM = [], colM = [];
  for (let j = 0; j < h; j++) { let sum = 0; for (let i = 0; i < w; i++) sum += L[j * w + i]; rowM.push(sum / w); }
  for (let i = 0; i < w; i++) { let sum = 0; for (let j = 0; j < h; j++) sum += L[j * w + i]; colM.push(sum / h); }
  const std = (a) => { const m = a.reduce((q, c) => q + c, 0) / a.length; return Math.sqrt(a.reduce((q, c) => q + (c - m) ** 2, 0) / a.length); };
  const bandH = std(rowM), bandV = std(colM);
  const limit = LOW_BAND.has(name) ? 2.0 : 3.0;
  // base level = modal luminance; coherent runs of same-sign deviation from it (2.5/255 deadband).
  const hist = new Int32Array(256);
  for (const v of L) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  let mode = 0, best = -1;
  for (let k = 0; k < 256; k++) if (hist[k] > best) { best = hist[k]; mode = k; }
  const DB = 2.5;
  let maxRun = 0;
  for (let j = 0; j < h; j++) {
    let run = 0, last = 0;
    for (let i = 0; i < w; i++) {
      const d = L[j * w + i] - mode, sgn = Math.abs(d) <= DB ? 0 : Math.sign(d);
      if (sgn !== 0 && sgn === last) run++; else { if (run > maxRun) maxRun = run; last = sgn; run = sgn === 0 ? 0 : 1; }
    }
    if (run > maxRun) maxRun = run;
  }
  for (let i = 0; i < w; i++) {
    let run = 0, last = 0;
    for (let j = 0; j < h; j++) {
      const d = L[j * w + i] - mode, sgn = Math.abs(d) <= DB ? 0 : Math.sign(d);
      if (sgn !== 0 && sgn === last) run++; else { if (run > maxRun) maxRun = run; last = sgn; run = sgn === 0 ? 0 : 1; }
    }
    if (run > maxRun) maxRun = run;
  }
  let mean = 0;
  for (const v of L) mean += v;
  mean /= L.length;
  let maxPos = 0, maxNeg = 0;
  for (const v of L) { const d = v - mean; if (d > maxPos) maxPos = d; if (-d > maxNeg) maxNeg = -d; }
  bandByCell[name] = { bandH, bandV, maxRun, maxPos, maxNeg };
  ok(bandH < limit && bandV < limit, `terrain/${name}: no low-frequency banding (row/col mean std < ${limit.toFixed(1)}/255)`,
    `H=${bandH.toFixed(2)} V=${bandV.toFixed(2)}`);
  ok(maxRun <= 24, `terrain/${name}: no coherent feature > 24 px (deadband 2.5/255)`, `longest ${maxRun}px`);
}
// contrast budget for the redesigned granular materials (local deviation from the cell mean)
const BUDGET = { desert: [5, 5], snow: [6, 6], river: [10, 8], ocean: [10, 8], ice: [8, 8] };
for (const [name, [pos, neg]] of Object.entries(BUDGET)) {
  const b = bandByCell[name];
  ok(b.maxPos <= pos && b.maxNeg <= neg, `terrain/${name}: local contrast within budget (+${pos}/-${neg} of cell mean)`,
    `+${b.maxPos.toFixed(1)}/-${b.maxNeg.toFixed(1)}`);
}


// --- summary -----------------------------------------------------------------------------------
console.log('');
console.log('per-cell metrics:');
for (const r of rows) {
  console.log(`  ${r.name.padEnd(9)} seam ${r.seamLr.toFixed(4)}/${r.seamTb.toFixed(4)}  hue ${String(r.hueOrig).padStart(6)} -> ${String(r.hueNew).padStart(6)}` +
    ` (d ${r.dHue == null ? ' n/a' : r.dHue.toFixed(1)})  L ${r.L.toFixed(3)}  ${r.cols} colours`);
}
console.log(`worst terrain hue drift: ${worstHue.toFixed(1)}deg (${worstHueName}); worst seam: ${worstSeam.toFixed(5)};` +
  ` worst tex seam: ${worstTexSeam.toFixed(5)}`);
console.log('');
console.log(`${checks - fails}/${checks} checks passed — RESULT: ${fails ? 'FAIL' : 'PASS'}`);
process.exit(fails ? 1 : 0);

// --- helpers -----------------------------------------------------------------------------------
// Region-aware seam: compare column x / x+w-1 (or row y / y+h-1) inside the cell only.
function seamOfRegion(img, x, y, w, h, mode) {
  const { rgba } = img;
  let sum = 0, n = 0;
  if (mode === 'lr') {
    for (let j = 0; j < h; j++) for (let c = 0; c < 4; c++) {
      sum += Math.abs(rgba[((y + j) * img.width + x) * 4 + c] - rgba[((y + j) * img.width + x + w - 1) * 4 + c]);
      n++;
    }
  } else {
    for (let i = 0; i < w; i++) for (let c = 0; c < 4; c++) {
      sum += Math.abs(rgba[(y * img.width + x + i) * 4 + c] - rgba[((y + h - 1) * img.width + x + i) * 4 + c]);
      n++;
    }
  }
  return sum / (255 * n);
}
function countOpaqueColors(img, x, y, w, h) {
  const set = new Set();
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = ((y + j) * img.width + x + i) * 4;
    if (img.rgba[p + 3] > 0) set.add((img.rgba[p] << 16) | (img.rgba[p + 1] << 8) | img.rgba[p + 2]);
  }
  return set.size;
}
