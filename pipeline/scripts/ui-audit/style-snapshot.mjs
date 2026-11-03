// style-snapshot.mjs — 「畫面一個像素都不變」的驗收(2026-11-03,實驗 5 的 CSS token 化用)。
// 對 3 種裝置 × 每個彈窗,把所有看得到的元素(含 ::before/::after)的 computed style 存成 JSON;--compare 跟基準比,有差異 exit 1。
// 只比樣式屬性(顏色、背景、框線、陰影、字級、行高…),不比位置大小:金幣數字等動態文字會改寬度,那不是 CSS 的錯。
// 動畫與 transition 先關掉,拍到的是最終值,不會因為時間點不同而有差異。
// 用法:node pipeline/scripts/ui-audit/style-snapshot.mjs [--save | --compare] [--no-build] [--devices all] [--dir output/ui-audit/style-baseline]
//   --save:存成基準(改 CSS 之前跑一次);--compare(預設):建置後拍一次、跟基準比,印前 30 筆差異
//   --tol-de N:顏色變動 ΔE ≤ N(肉眼分不出,JND≈2.3)不算差異;近色合併成 token 時用 --tol-de 2
import { createRequire } from 'module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const SAVE = args.includes('--save');
const DIR = path.resolve(ROOT, opt('dir') || 'output/ui-audit/style-baseline');
const OUT = SAVE ? DIR : DIR + '-now';
// --devices all: one size inside every @media region of pixel-style.css (min-width 1600 / max-height 780 / ≤1100 / 761–900 / tablet /
// ≤380 / max-height 520 with and without max-width 700); needed when declarations are removed, not only renamed
const DEVICES = Object.fromEntries(Object.entries({ 'desktop-1440x900': [1440, 900, false], 'iphone-402x712': [402, 712, true], 'android-360x640': [360, 640, true],
  'wide-1680x1000': [1680, 1000, false], 'laptop-1366x700': [1366, 700, false], 'small-1024x768': [1024, 768, false], 'narrow-820x600': [820, 600, false],
  'tablet-768x1024': [768, 1024, true], 'land-812x360': [812, 360, true], 'land-640x360': [640, 360, true] }).slice(0, opt('devices') === 'all' ? 10 : 3));
const SCREENS = ['village', 'worldmap', 'build', 'hunters', 'hunter', 'recruit', 'trade', 'craft', 'dungeon', 'arena', 'quests', 'inventory', 'difficulty', 'settings', 'help', 'boss', 'dispatchHunters', 'inspector'];
const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'box-shadow', 'text-shadow', 'filter', 'opacity', 'fill', 'stroke', 'caret-color', 'text-decoration-color',
  'font-size', 'line-height', 'font-weight', 'font-family', 'letter-spacing', 'border-top-width', 'border-radius', 'padding', 'margin', 'gap', 'display', 'content'];

if (!args.includes('--no-build')) execSync('node build.mjs', { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
for (const [dev, [w, h, phone]] of Object.entries(DEVICES)) {
  const page = await (await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } })).newPage();
  await page.goto(process.env.TARGET || 'http://100.79.149.0:5024/?preview=1', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
  const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
  const close = () => page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); });
  const snap = {};
  for (const s of SCREENS) {
    await close(); await page.waitForTimeout(200);
    if (s === 'inspector') await act('selectBuilding', 'forge');
    else if (s === 'hunter') await act('hunter', await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id));
    else if (s !== 'village') await act(s);
    await page.waitForTimeout(400);
    snap[s] = await page.evaluate(props => {
      const out = {};
      const key = e => { const p = []; for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
        const sib = x.parentElement ? [...x.parentElement.children].filter(c => c.tagName === x.tagName) : [];
        p.unshift(x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).sort().join('.') : '') + (sib.length > 1 ? `:${sib.indexOf(x)}` : ''));
      } return p.join('>'); };
      const pick = cs => props.map(p => cs.getPropertyValue(p)).join('|');
      for (const e of document.body.querySelectorAll('*')) {
        if (e.closest('canvas, #loading') || !e.checkVisibility?.({ visibilityProperty: true })) continue;
        const k = key(e); out[k] = pick(getComputedStyle(e));
        for (const ps of ['::before', '::after']) { const cs = getComputedStyle(e, ps); if (cs.content && cs.content !== 'none' && cs.content !== 'normal') out[k + ps] = pick(cs); }
      }
      return out;
    }, PROPS);
  }
  fs.writeFileSync(path.join(OUT, dev + '.json'), JSON.stringify(snap));
  await page.context().close();
}
await b.close();
if (SAVE) { console.log(`style-snapshot: baseline saved → ${path.relative(ROOT, DIR)}`); process.exit(0); }

// --tol-de N: colours that moved by at most ΔE76 N (same alpha, same surrounding text) are not diffs; for near-colour token merges
const TOL = Number(opt('tol-de')) || 0;
const COL = /rgba?\(([^)]*)\)/g;
const lab = ([r, g, b]) => { const f = c => { c /= 255; return c > .04045 ? ((c + .055) / 1.055) ** 2.4 : c / 12.92; }; const [R, G, B] = [f(r), f(g), f(b)];
  const t = v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const x = t((R * .4124 + G * .3576 + B * .1805) / .95047), y = t(R * .2126 + G * .7152 + B * .0722), z = t((R * .0193 + G * .1192 + B * .9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]; };
const near = (a, b) => {
  if (!TOL || a.replace(COL, 'C') !== b.replace(COL, 'C')) return false;
  const ca = [...a.matchAll(COL)].map(m => m[1].split(/[ ,/]+/).map(Number)), cb = [...b.matchAll(COL)].map(m => m[1].split(/[ ,/]+/).map(Number));
  return ca.every((c, i) => (c[3] ?? 1) === (cb[i][3] ?? 1) && Math.hypot(...lab(c).map((v, k) => v - lab(cb[i])[k])) <= TOL);
};
// compare: only elements present in both runs count (toasts and notices come and go); a changed value is a diff
let diffs = [], compared = 0, missing = 0, tolerated = 0;
for (const dev of Object.keys(DEVICES)) {
  const base = JSON.parse(fs.readFileSync(path.join(DIR, dev + '.json'), 'utf8')), now = JSON.parse(fs.readFileSync(path.join(OUT, dev + '.json'), 'utf8'));
  for (const s of SCREENS) for (const [k, v] of Object.entries(base[s] || {})) {
    const n = now[s]?.[k]; if (n == null) { missing++; continue; }
    compared++; if (n === v) continue;
    const a = v.split('|'), c = n.split('|');
    if (a.every((x, i) => x === c[i] || near(x, c[i]))) { tolerated++; continue; }
    diffs.push(`${dev} ${s} ${k.split('>').slice(-2).join('>')}: ` + PROPS.map((p, i) => a[i] !== c[i] ? `${p} ${a[i]} → ${c[i]}` : '').filter(Boolean).join('; '));
  }
}
console.log(`style-snapshot: ${diffs.length} diffs in ${compared} compared elements (${missing} only in baseline, ignored${TOL ? `; ${tolerated} within ΔE ${TOL}` : ''})`);
for (const d of diffs.slice(0, 30)) console.log('  ' + d.slice(0, 300));
process.exit(diffs.length ? 1 : 0);
