// tools/checks/heroloom-scene-assets.mjs — verification for the HeroLoom scene restyle deliverables.
//
// Checks every restyled file in assets/heroloom-scene/ against its ORIGINAL in assets/:
//   * the file exists and keeps the exact original dimensions
//   * the alpha mask is byte-identical (no silhouette drift) and alpha coverage is within +/-5%
//   * repeating assets (plaza, 12 terrain-atlas cells, 12 biome textures) are seamless:
//     edgeMismatch() <= SEAM_LIMIT (same formula as edgeMismatch in src/heroloom-buildings.js,
//     whose seamlessTileCheck() uses a 0.05 threshold; we hold the restyle to 0.02)
//   * atlases keep enough colours to still read as pixel art (>= 12, and >= 8 per terrain cell)
//   * each material keeps its hue family: within +/-MAX_HUE_SHIFT of the original and inside an
//     explicit hue band (grass green, water/ice blue, dirt/soil brown, snow very light, ...)
//   * the mean per-pixel hue shift stays small (<= MEAN_HUE_SHIFT_LIMIT)
//   * every opaque colour in a restyled file is listed in restyle-report.json's per-file palette
//
// Exit code 0 = all PASS, 1 = at least one FAIL.
// Usage: node tools/checks/heroloom-scene-assets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { decodePng } from '../../pipeline/scripts/heroloom/png.mjs';
import {
  regionStats, uniqueOpaqueColors, edgeMismatch, coverage, paletteDistance, meanHueShift, hueDiff, packRgb,
} from '../../pipeline/scripts/heroloom/scene-color.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'assets');
const OUT = path.join(SRC, 'heroloom-scene');

const SEAM_LIMIT = 0.02;
const COVERAGE_TOLERANCE = 0.05;
const MIN_COLORS_ATLAS = 12;
const MIN_COLORS_CELL = 8;
const MIN_COLORS_PLAZA = 8;
const MAX_HUE_SHIFT = 10;
const MEAN_HUE_SHIFT_LIMIT = 12;

const ALPHA_ATLASES = ['woods', 'flora', 'props', 'details', 'cold', 'villagers'];
const BIOMES = ['desert', 'dirt', 'forest', 'grass', 'ice', 'meadow', 'mountain', 'snow', 'soil', 'stone', 'taiga', 'water'];

// Explicit hue bands per material (OKLab hue degrees). null = no band, only the shift limit.
const MATERIAL_HUE_BAND = {
  village: [80, 160], meadow: [80, 160], birch: [80, 160], grass: [80, 160],
  taiga: [120, 180], forest: [20, 120],
  desert: [50, 110], dirt: [30, 100], soil: [30, 100], bridge: [30, 100],
  river: [-180, -120], ocean: [-180, -120], water: [-180, -120],
  ice: [-150, -90], cold: [-180, -90],
  snow: null, mountain: null, stone: null,
};
// Materials where a very light result is required (snow / ice)
const LIGHT_MATERIALS = { snow: 0.85, ice: 0.80 };
// Materials that must stay low-chroma grey/grey-brown
const GREY_MATERIALS = { mountain: 0.05, stone: 0.05 };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${name.padEnd(52)} ${detail ?? ''}`);
}

const cache = new Map();
function load(abs) {
  if (!cache.has(abs)) {
    if (!fs.existsSync(abs)) return null;
    cache.set(abs, decodePng(fs.readFileSync(abs)));
  }
  return cache.get(abs);
}
function loadSrc(rel) { return load(path.join(SRC, rel)); }
function loadOut(rel) { return load(path.join(OUT, rel)); }

function crop(img, r) {
  const out = { width: r.w, height: r.h, rgba: new Uint8Array(r.w * r.h * 4) };
  for (let y = 0; y < r.h; y++) {
    const src = ((r.y + y) * img.width + r.x) * 4;
    out.rgba.set(img.rgba.subarray(src, src + r.w * 4), y * r.w * 4);
  }
  return out;
}

function alphaMaskEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 3; i < a.length; i += 4) if (a[i] !== b[i]) return false;
  return true;
}

function requireFile(rel) {
  const img = loadOut(rel);
  check(`${rel}: exists`, !!img, img ? `${img.width}x${img.height}` : 'missing in assets/heroloom-scene/');
  return img;
}

function verifyDims(rel, before, after) {
  check(`${rel}: dimensions`, before.width === after.width && before.height === after.height,
    `${before.width}x${before.height} -> ${after.width}x${after.height}`);
}

function verifyCoverage(rel, beforeRgba, afterRgba) {
  const cb = coverage(beforeRgba), ca = coverage(afterRgba);
  check(`${rel}: alpha coverage +/-${Math.round(COVERAGE_TOLERANCE * 100)}%`, Math.abs(ca - cb) <= COVERAGE_TOLERANCE,
    `${(cb * 100).toFixed(2)}% -> ${(ca * 100).toFixed(2)}%`);
  check(`${rel}: alpha mask identical`, alphaMaskEqual(beforeRgba, afterRgba), 'transparency map preserved byte-exact');
}

function verifySeams(rel, rgba, w, h) {
  const lr = edgeMismatch(rgba, w, h, 'lr'), tb = edgeMismatch(rgba, w, h, 'tb');
  check(`${rel}: seamless lr/tb <= ${SEAM_LIMIT}`, lr <= SEAM_LIMIT && tb <= SEAM_LIMIT,
    `lr=${lr} tb=${tb}`);
  return { lr, tb };
}

function verifyHueFamily(rel, material, before, after) {
  const band = MATERIAL_HUE_BAND[material] ?? null;
  const shift = hueDiff(before.meanHue, after.meanHue);
  if (shift != null) {
    check(`${rel}: hue shift <= ${MAX_HUE_SHIFT} deg`, shift <= MAX_HUE_SHIFT,
      `${before.meanHue} -> ${after.meanHue} (${shift} deg)`);
  }
  if (band && after.meanHue != null) {
    const inside = after.meanHue >= band[0] && after.meanHue <= band[1];
    check(`${rel}: hue band ${band[0]}..${band[1]}`, inside, `after hue ${after.meanHue}`);
  }
  if (LIGHT_MATERIALS[material] != null) {
    check(`${rel}: stays light (L* >= ${LIGHT_MATERIALS[material]})`, after.meanL >= LIGHT_MATERIALS[material],
      `L* ${before.meanL} -> ${after.meanL}`);
  }
  if (GREY_MATERIALS[material] != null) {
    check(`${rel}: stays low-chroma (C <= ${GREY_MATERIALS[material]})`, after.meanC <= GREY_MATERIALS[material],
      `C ${before.meanC} -> ${after.meanC}`);
  }
}

function verifyPaletteMembership(rel, outRgba, reportFile) {
  if (!reportFile || !reportFile.palette) {
    check(`${rel}: palette documented in restyle-report.json`, false, 'no report entry');
    return;
  }
  const allowed = new Set(reportFile.palette.map((h) => parseInt(h.slice(1), 16)));
  const counts = uniqueOpaqueColors(outRgba);
  let missing = 0;
  for (const key of counts.keys()) if (!allowed.has(key)) missing++;
  check(`${rel}: colours listed in report palette`, missing === 0,
    missing === 0 ? `${counts.size} opaque colours` : `${missing} undocumented colours`);
}

// ---------------------------------------------------------------------------------------------

const report = JSON.parse(fs.readFileSync(path.join(OUT, 'restyle-report.json'), 'utf8'));
const reportByRel = new Map(report.files.map((f) => [f.rel, f]));
const palette = JSON.parse(fs.readFileSync(path.join(OUT, 'palette.json'), 'utf8'));

console.log('HeroLoom scene asset check');
console.log(`  originals: assets/   restyled: assets/heroloom-scene/   report: ${report.files.length} files\n`);

// --- plaza ------------------------------------------------------------------------------------
{
  const rel = 'plaza.png';
  const before = loadSrc(rel);
  const after = requireFile(rel);
  if (before && after) {
    verifyDims(rel, before, after);
    verifyCoverage(rel, before.rgba, after.rgba);
    verifySeams(rel, after.rgba, after.width, after.height);
    const colors = uniqueOpaqueColors(after.rgba).size;
    check(`${rel}: colours >= ${MIN_COLORS_PLAZA} (paving, not flat)`, colors >= MIN_COLORS_PLAZA, `${colors} colours`);
    const o = regionStats(after.rgba, after.width);
    check(`${rel}: warm stone range (L* spread > 0.25)`, o.Lrange[1] - o.Lrange[0] > 0.25,
      `L* ${o.Lrange[0]}..${o.Lrange[1]}, mean C ${o.meanC}`);
    verifyPaletteMembership(rel, after.rgba, reportByRel.get(rel));
  }
}

// --- terrain atlas (per cell) -----------------------------------------------------------------
{
  const rel = 'terrain-atlas.png';
  const before = loadSrc(rel);
  const after = requireFile(rel);
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'terrain-atlas.manifest.json'), 'utf8'));
  if (before && after) {
    verifyDims(rel, before, after);
    verifyCoverage(rel, before.rgba, after.rgba);
    const colors = uniqueOpaqueColors(after.rgba).size;
    check(`${rel}: colours >= ${MIN_COLORS_ATLAS}`, colors >= MIN_COLORS_ATLAS, `${colors} colours`);
    verifyPaletteMembership(rel, after.rgba, reportByRel.get(rel));
    let cellFail = 0, worstSeam = 0, worstHue = 0;
    for (const [name, cell] of Object.entries(man.cells)) {
      const b = crop(before, cell), a = crop(after, cell);
      const lr = edgeMismatch(a.rgba, a.width, a.height, 'lr'), tb = edgeMismatch(a.rgba, a.width, a.height, 'tb');
      const sb = regionStats(b.rgba, b.width), sa = regionStats(a.rgba, a.width);
      const hue = hueDiff(sb.meanHue, sa.meanHue);
      worstSeam = Math.max(worstSeam, lr, tb);
      worstHue = Math.max(worstHue, hue ?? 0);
      const cellColors = uniqueOpaqueColors(a.rgba).size;
      const band = MATERIAL_HUE_BAND[name];
      const bandOk = !band || sa.meanHue == null || (sa.meanHue >= band[0] && sa.meanHue <= band[1]);
      const ok = lr <= SEAM_LIMIT && tb <= SEAM_LIMIT && cellColors >= MIN_COLORS_CELL
        && (hue == null || hue <= MAX_HUE_SHIFT) && bandOk;
      if (!ok) cellFail++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  terrain-atlas cell ${name.padEnd(9)} seam ${lr}/${tb}  colours ${cellColors}  hue ${sb.meanHue} -> ${sa.meanHue} (${hue ?? '-'} deg)  L* ${sb.meanL} -> ${sa.meanL}`);
      results.push({ name: `cell ${name}`, ok, detail: `seam ${lr}/${tb} hue ${hue} colours ${cellColors}` });
    }
    check(`${rel}: all 12 cells seamless (<= ${SEAM_LIMIT})`, worstSeam <= SEAM_LIMIT, `worst ${worstSeam}`);
    check(`${rel}: all 12 cells keep hue (<= ${MAX_HUE_SHIFT} deg)`, worstHue <= MAX_HUE_SHIFT, `worst ${worstHue} deg`);
    check(`${rel}: every cell has >= ${MIN_COLORS_CELL} colours`, cellFail === 0, `${cellFail} failing cell(s)`);
  }
}

// --- biome textures ---------------------------------------------------------------------------
for (const name of BIOMES) {
  const rel = `xilurus/tex-${name}.png`;
  const before = loadSrc(rel);
  const after = requireFile(rel);
  if (!before || !after) continue;
  verifyDims(rel, before, after);
  verifyCoverage(rel, before.rgba, after.rgba);
  verifySeams(rel, after.rgba, after.width, after.height);
  const sb = regionStats(before.rgba, before.width), sa = regionStats(after.rgba, after.width);
  verifyHueFamily(rel, name, sb, sa);
  const shift = meanHueShift(before.rgba, after.rgba);
  if (shift != null) {
    check(`${rel}: mean per-pixel hue shift <= ${MEAN_HUE_SHIFT_LIMIT} deg`, shift <= MEAN_HUE_SHIFT_LIMIT, `${shift} deg`);
  }
  verifyPaletteMembership(rel, after.rgba, reportByRel.get(rel));
}

// --- alpha atlases ----------------------------------------------------------------------------
for (const name of ALPHA_ATLASES) {
  for (const suffix of ['@1x', '@2x']) {
    const rel = `${name}${suffix}.png`;
    const before = loadSrc(rel);
    const after = requireFile(rel);
    if (!before || !after) continue;
    verifyDims(rel, before, after);
    verifyCoverage(rel, before.rgba, after.rgba);
    const colorsBefore = uniqueOpaqueColors(before.rgba).size;
    const colorsAfter = uniqueOpaqueColors(after.rgba).size;
    check(`${rel}: colours >= ${MIN_COLORS_ATLAS}`, colorsAfter >= MIN_COLORS_ATLAS, `${colorsBefore} -> ${colorsAfter}`);
    const shift = meanHueShift(before.rgba, after.rgba);
    if (shift != null) {
      check(`${rel}: mean per-pixel hue shift <= ${MEAN_HUE_SHIFT_LIMIT} deg`, shift <= MEAN_HUE_SHIFT_LIMIT, `${shift} deg`);
    }
    verifyPaletteMembership(rel, after.rgba, reportByRel.get(rel));
  }
}

// --- global hue-preservation summary -----------------------------------------------------------
// palette.json's warm HeroLoom ramp is reference metadata only. The regression guard is hue: every
// file must keep its original hue (mean per-pixel hue shift), which is what broke in v1. plaza.png is
// the one intentional exception — it is warm stone by design — so it is gated on low chroma and a
// wide slab value range instead.
{
  let worst = 0, worstRel = '', drift = [];
  for (const file of report.files) {
    if (file.rel === 'plaza.png') continue;
    const before = loadSrc(file.rel);
    const after = loadOut(file.rel);
    if (!before || !after) continue;
    const shift = meanHueShift(before.rgba, after.rgba);
    if (shift == null) continue;
    if (shift > worst) { worst = shift; worstRel = file.rel; }
    if (shift > MEAN_HUE_SHIFT_LIMIT) drift.push(`${file.rel} ${shift} deg`);
  }
  check(`every file keeps its original hue (mean shift <= ${MEAN_HUE_SHIFT_LIMIT} deg)`, drift.length === 0,
    drift.length ? `${drift.length} file(s): ${drift.slice(0, 4).join(', ')}` : `worst ${worst} deg (${worstRel})`);

  const plazaAfter = loadOut('plaza.png');
  if (plazaAfter) {
    const o = regionStats(plazaAfter.rgba, plazaAfter.width);
    check('plaza.png: warm stone, not painted wood (mean C <= 0.05)', o.meanC <= 0.05, `C ${o.meanC}, hue ${o.meanHue}`);
  }

  // informational: how far the delivered set sits from the HeroLoom reference ramp
  let dist = 0, n = 0;
  for (const file of report.files) {
    const after = loadOut(file.rel);
    if (!after) continue;
    dist += paletteDistance(after.rgba, palette.coreRamp).meanDist;
    n++;
  }
  console.log(`INFO  mean OKLab distance to the warm HeroLoom reference ramp: ${(dist / n).toFixed(4)} (info only)`);
}

// --- summary ----------------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
console.log('\n' + '-'.repeat(96));
console.log(`checks: ${results.length}   PASS: ${results.length - failed.length}   FAIL: ${failed.length}`);
if (failed.length) {
  console.log('failed checks:');
  for (const f of failed) console.log(`  FAIL ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
  process.exit(1);
}
console.log('RESULT: PASS');
