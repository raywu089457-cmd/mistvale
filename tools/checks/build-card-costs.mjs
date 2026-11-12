// build-card-costs.mjs — static assert for T51: every building card in the build modal must show its cost
// (resource icons + amounts) all the time, with unaffordable entries marked by colour, on desktop and phone.
// Usage: node tools/checks/build-card-costs.mjs       (no server needed; reads the sources)  — Z2B 2026-11-12 改寫成新的 hv-cost 結構
//   T51_ROOT=<dir> checks another checkout (used to prove this file fails on the pre-T51 tree).
// Exit: 0 = every requirement holds, 1 = at least one miss (each miss is printed as MISS ...).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.T51_ROOT || fileURLToPath(new URL('../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const misses = [];
const miss = (file, why) => misses.push(`MISS ${file}: ${why}`);

// ---- 1. src/pixel-ui.js: the build branch of modalHTML must emit a cost line for every card (Z2B 2026-11-12: hv-cost chips) ----
const ui = read('src/pixel-ui.js');
const from = ui.indexOf("if(type==='build')");
const to = ui.indexOf("if(type==='hunters')");
if (from < 0 || to < 0 || to <= from) {
  miss('src/pixel-ui.js', "cannot slice modalHTML from if(type==='build') to if(type==='hunters')");
} else {
  const branch = ui.slice(from, to);
  // the card must always carry the cost line (built and unbuilt cards alike), one .hv-cost chip per resource, `.short` on the ones you cannot afford
  if (!branch.includes('class="cost build-cost hv-costs"')) miss('src/pixel-ui.js', 'build branch has no .build-cost.hv-costs line');
  if (!/hv-cost\$\{\(s\[k\]\|\|0\)<n\?' short':''\}/.test(branch)) miss('src/pixel-ui.js', 'cost chips lost the per-resource .short marker');
  // built buildings show the next level price, so the upgrade cost lookup must be reachable (upgradeView → game.getUpgradeCost)
  if (!branch.includes('upgradeView(')) miss('src/pixel-ui.js', 'build branch does not use upgradeView()');
  if (!/function upgradeView[\s\S]{0,600}getUpgradeCost\(/.test(ui)) miss('src/pixel-ui.js', 'upgradeView does not call game.getUpgradeCost()');
  // Z2B(UX #10): the grey button names every missing resource (no「等」), unbuilt cards carry a one-line purpose
  if (/' 等'/.test(branch)) miss('src/pixel-ui.js', 'short-resource button is back to 「缺…等」');
  if (!/short-btn[^`]*缺 \$\{miss\.map\(/.test(branch)) miss('src/pixel-ui.js', 'short-resource button no longer lists every missing item');
  if (!branch.includes('class="bc-use"')) miss('src/pixel-ui.js', 'unbuilt cards lost the one-line purpose (.bc-use)');
}

// ---- 2. src/ui-hv.css (Z2B block): cost chips >=12px, short ones red ----
const css = read('src/ui-hv.css');
const z2b = css.slice(css.indexOf('/* ===== Z2B：'), css.indexOf('/* ===== Z2B end'));
if (!z2b) miss('src/ui-hv.css', 'no Z2B block');
else {
  const m = /\.hv-card \.hv-cost\{font:\d+ (\d+)px/.exec(z2b);
  if (!m || Number(m[1]) < 12) miss('src/ui-hv.css', '.hv-cost font is below 12px');
  if (!/\.hv-cost\.short b\{color:#f08a7c/.test(z2b)) miss('src/ui-hv.css', '.hv-cost.short is no longer red');
}

// ---- 3. auditing tools: the 375x812 phone size must exist and the phone shot size must stay overridable ----
const layout = read('pipeline/scripts/ui-audit/layout.mjs');
const dev = /name:\s*'iphone-375x812'[^}]*\}/.exec(layout);
if (!dev) miss('pipeline/scripts/ui-audit/layout.mjs', "DEVICES does not list iphone-375x812");
else {
  if (!/w:\s*375\b/.test(dev[0])) miss('pipeline/scripts/ui-audit/layout.mjs', 'iphone-375x812 is not w: 375');
  if (!/h:\s*812\b/.test(dev[0])) miss('pipeline/scripts/ui-audit/layout.mjs', 'iphone-375x812 is not h: 812');
}
const shots = read('pipeline/scripts/ui-audit/shots-all.mjs');
if (!/402/.test(shots) || !/712/.test(shots)) miss('pipeline/scripts/ui-audit/shots-all.mjs', 'phone viewport no longer defaults to 402x712');
if (!/process\.argv\[4\]/.test(shots)) miss('pipeline/scripts/ui-audit/shots-all.mjs', 'phone viewport size is no longer overridable (argv[4])');

if (misses.length) {
  for (const m of misses) console.log(m);
  console.log(`\n${misses.length} requirement(s) missing`);
  process.exit(1);
}
console.log('OK  build cards always show costs (icons + amounts, --cost-short for what you cannot afford); 375x812 audit size wired');
