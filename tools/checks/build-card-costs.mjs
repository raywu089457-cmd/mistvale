// build-card-costs.mjs — static assert for T51: every building card in the build modal must show its cost
// (resource icons + amounts) all the time, with unaffordable entries marked by colour, on desktop and phone.
// Usage: node tools/checks/build-card-costs.mjs       (no server needed; reads the sources)
//   T51_ROOT=<dir> checks another checkout (used to prove this file fails on the pre-T51 tree).
// Exit: 0 = every requirement holds, 1 = at least one miss (each miss is printed as MISS ...).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.T51_ROOT || fileURLToPath(new URL('../../', import.meta.url));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const misses = [];
const miss = (file, why) => misses.push(`MISS ${file}: ${why}`);

// ---- 1. src/pixel-ui.js: the build branch of modalHTML must emit a cost line for every card ----
const ui = read('src/pixel-ui.js');
const from = ui.indexOf("if(type==='build')");
const to = ui.indexOf("if(type==='hunters')");
if (from < 0 || to < 0 || to <= from) {
  miss('src/pixel-ui.js', "cannot slice modalHTML from if(type==='build') to if(type==='hunters')");
} else {
  const branch = ui.slice(from, to);
  // the card must always carry the cost line (built and unbuilt cards alike)
  if (!branch.includes('class="build-cost"')) miss('src/pixel-ui.js', 'build branch has no <small class="build-cost">');
  // and it must be the shared costs() renderer, so icons and the `.short` marker come for free
  if (!branch.includes('costs(')) miss('src/pixel-ui.js', 'build branch does not call costs()');
  // built buildings show the next level price, so the upgrade cost lookup must be in the branch
  if (!branch.includes('getUpgradeCost(')) miss('src/pixel-ui.js', 'build branch does not call game.getUpgradeCost()');
  // regressions this check exists for
  if (branch.includes("l?'':`<small class=\"build-cost\"")) miss('src/pixel-ui.js', "cost line is still hidden behind the l?'': guard");
  if (branch.includes('Object.entries(b.cost')) miss('src/pixel-ui.js', 'cost line still builds its own Object.entries(b.cost) label map');
  if (/gold\s*:\s*'金'/.test(branch)) miss('src/pixel-ui.js', "cost line still maps resource keys with 金/木/鐵 labels");
}

// ---- 2. src/pixel-style.css: flex row of icon+amount chips, colour token for the short entries ----
const css = read('src/pixel-style.css');
const rule = sel => {
  const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(css);
  return m ? m[1] : null;
};
const costRule = rule('.building-card .build-cost');
if (costRule == null) miss('src/pixel-style.css', 'no .building-card .build-cost{...} rule');
else {
  if (!/flex-wrap\s*:\s*wrap/.test(costRule)) miss('src/pixel-style.css', '.build-cost lost flex-wrap:wrap (chips must wrap instead of being cut)');
  if (!/color\s*:\s*var\(/.test(costRule)) miss('src/pixel-style.css', '.build-cost lost its color token');
  if (/opacity\s*:/.test(costRule)) miss('src/pixel-style.css', '.build-cost still fades with opacity instead of colour');
}
const spanRule = rule('.building-card .build-cost>span');
if (spanRule == null) miss('src/pixel-style.css', 'no .building-card .build-cost>span{...} rule (icon + amount must sit on one line)');
else if (!/inline-flex/.test(spanRule)) miss('src/pixel-style.css', '.build-cost>span is not inline-flex');
const shortRule = rule('.building-card .build-cost .short');
if (shortRule == null) miss('src/pixel-style.css', 'no .building-card .build-cost .short{...} rule (unaffordable entries would look affordable)');
else if (!/color\s*:\s*var\(/.test(shortRule)) miss('src/pixel-style.css', '.build-cost .short does not set a colour token');
if (!/--cost-short\s*:\s*#[0-9a-f]{6}/i.test(css)) miss('src/pixel-style.css', 'no --cost-short colour token declared');

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
