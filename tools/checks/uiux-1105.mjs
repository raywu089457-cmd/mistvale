// uiux-1105.mjs — T64 acceptance: four UI/UX fixes (duplicate modal titles, sticky dispatch bar overlap,
// phone team tabs, 360px horizontal overflow, map labels over the inspector).
// Static: reads src/pixel-ui.js + src/pixel-style.css and asserts the five fix points.
// Live: builds if the bundle is stale, starts the local server if it is down, then measures the real DOM
// (Playwright + installed Chrome): duplicate banner titles, dispatch padding, tab rows, modal scrollWidth,
// and elementFromPoint at the inspector corners. Prints one `FIX: ...` per failure, exit 1.
// 2026-11-11 改寫（獵魔村風格第三階段）：
//   * U2 舊版找 `.dispatch-tabs .pixel-button`（舊隊伍分頁按鈕），新版分頁是 `.dispatch-tabs>button`，所以數到 0 顆——選取器換成新的，
//     「四個隊伍分頁在 390 寬同一排、字不被切」的斷言不變。
//   * U2 新增：固定條（.dispatch-go）必須是不透明底（卡片捲到它下面不能透出來疊在按鈕上），而且捲到底時最後一張卡與固定條至少隔 8px。
//   * 靜態段 (c)/(d)：舊版斷言 pixel-style.css 裡「≤480px 的 .dispatch-tabs 是 grid、#modal-content padding 14px、.hunter-detail 96px 欄」。
//     這些規則現在被 ui-hv.css 蓋掉（實際內距是 10px），斷言的是已經不畫出來的舊 CSS，所以拿掉；它們保護的使用者可見結果由 live 段承擔：
//     U2（分頁同一排、字不切）、U3（360 寬沒有橫向溢出）、U5（新，見下：獵人詳情手機排版與「一顆主按鈕」）。
//   * U4 的「不透明底」(`#inspector` 的 background-clip:border-box 靜態斷言＋地圖隱藏前後像素相同)保留，仍然成立。
// Usage: node tools/checks/uiux-1105.mjs            (TARGET=... to use another server)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UI = path.join(ROOT, 'src/pixel-ui.js');
const CSS = path.join(ROOT, 'src/pixel-style.css');
const BUILT = path.resolve(ROOT, '../../outputs/暮影村.html');
const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [];
const fix = msg => fails.push(msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ui = fs.readFileSync(UI, 'utf8');
const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// --- tiny CSS walker: every declaration block with the @media/@supports condition it sits in ---
function walk(src, media = '') {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const prelude = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(prelude)) out.push(...walk(body, media ? `${media} and ${prelude}` : prelude));
    else if (!prelude.startsWith('@')) out.push({ media, selector: prelude.replace(/\s+/g, ' ').trim(), body });
    i = j;
  }
  return out;
}
const RULES = walk(css);
const decl = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'i'));
  return m ? m[1].trim() : null;
};
const compact = s => s.replace(/\s+/g, '');

// (a) banner headings that merely repeat the modal header were dropped. Help (新手說明) and boss
// (地圖首領：森林魔王) keep a heading because it says something the header does not.
const bannerBlocks = [...ui.matchAll(/<div class="encounter-banner[^"]*">[\s\S]*?<\/div><\/div>/g)].map(m => m[0]);
const DUPLICATE_BANNER_TITLES = ['村莊建設', '獵人名冊', '招募訪客', '交易所', '製作與庫存', '地下城遠征', '競技場模擬對戰', '村長委託', '村莊倉庫', '狩獵難度', '設定', '派遣隊伍'];
const dupBannerHeadings = bannerBlocks.flatMap(b => [...b.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1].trim()))
  .filter(t => DUPLICATE_BANNER_TITLES.includes(t));
if (dupBannerHeadings.length) fix(`banner heading repeats the modal title: ${[...new Set(dupBannerHeadings)].join(' / ')}`);

// (b) the sticky dispatch bar is the scroll content's last child, so at max scroll it already sits below every row.
// Extra bottom padding on the container lifts the bar off the scrollport bottom and makes it float over the rows
// (T64 review), so: no padding-bottom; scroll-padding-bottom keeps keyboard-focused rows clear of the bar.
const padRule = RULES.find(r => compact(r.selector) === '#modal-content:has(.dispatch-go)');
if (!padRule) fix('#modal-content:has(.dispatch-go) rule not found');
else {
  const sp = decl(padRule.body, 'scroll-padding-bottom');
  if (!sp || !/--dispatch-go-h/.test(sp)) fix(`dispatch scroll-padding-bottom is "${sp || 'unset'}", expected calc(var(--dispatch-go-h, 72px) + 12px)`);
  if (decl(padRule.body, 'padding-bottom')) fix('dispatch container has padding-bottom: it lifts the sticky bar off the bottom');
}
if (RULES.some(r => compact(r.selector) === '#modal-content:has(.dispatch-go)::after' && /--dispatch-go-h/.test(decl(r.body, 'height') || '')))
  fix('dispatch ::after spacer sits after the sticky bar; put the clearance in the container bottom padding instead');
if (!/function fitDispatchPad\(\)\{[^\n]*offsetHeight/.test(ui))
  fix('src/pixel-ui.js has no fitDispatchPad() setting --dispatch-go-h from .dispatch-go.offsetHeight');

// (e) layer order: the canvas is a z-index:0 layer, every panel/label DOM sits above it, and #game-ui
// must NOT be a stacking context (that trapped the modal-open bottom bar under #modal-backdrop).
const zNum = v => { const n = parseFloat(v || ''); return Number.isFinite(n) ? n : NaN; };
const zOf = sel => {
  const r = RULES.find(x => compact(x.selector) === sel && decl(x.body, 'z-index') !== null);
  return r ? zNum(decl(r.body, 'z-index')) : NaN;
};
for (const r of RULES.filter(r => compact(r.selector) === '#game-ui' && !r.media)) {
  if (decl(r.body, 'position') !== null || decl(r.body, 'z-index') !== null)
    fix('#game-ui declares position/z-index: its stacking context traps body.hud-modal #bottom-bar (z-index:32) under #modal-backdrop (30)');
}
const zWorld = zOf('#world'), zInsp = zOf('#inspector'), zBack = zOf('#modal-backdrop');
if (zWorld !== 0) fix(`#world z-index is ${Number.isNaN(zWorld) ? 'unset' : zWorld}, expected 0 (map labels must stay under the panels)`);
if (!(zInsp > zWorld)) fix(`#inspector z-index ${zInsp} is not above #world ${zWorld}`);
if (!(zBack > zWorld)) fix(`#modal-backdrop z-index ${zBack} is not above #world ${zWorld}`);
if (!RULES.some(r => compact(r.selector) === '#inspector' && /border-box/.test(decl(r.body, 'background-clip') || '')))
  fix('#inspector has no opaque backing under its border: expected background-clip:border-box');
const hudBar = RULES.find(r => /body\.hud-modal/.test(r.selector) && /#bottom-bar/.test(r.selector) && decl(r.body, 'z-index') !== null);
if (!hudBar) fix('no body.hud-modal #bottom-bar z-index rule');
else if (!(zNum(decl(hudBar.body, 'z-index')) > zBack)) fix(`body.hud-modal #bottom-bar z-index ${zNum(decl(hudBar.body, 'z-index'))} is not above #modal-backdrop ${zBack}`);

// --- live checks: stale bundle → build; no server → start one ---
function ensureBundle() {
  let newest = 0;
  for (const f of ['src/pixel-ui.js', 'src/pixel-style.css', 'src/pixel-index.html', 'src/pixel-data.js']) {
    try { newest = Math.max(newest, fs.statSync(path.join(ROOT, f)).mtimeMs); } catch { }
  }
  let builtAt = 0;
  try { builtAt = fs.statSync(BUILT).mtimeMs; } catch { }
  if (builtAt >= newest) return true;
  const r = spawnSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { fix(`build failed: ${(r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 160)}`); return false; }
  return true;
}
async function reachable() {
  try { return (await fetch(URL.replace(/\?.*/, ''), { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; }
}
async function ensureServer() {
  if (await reachable()) return true;
  const p = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, detached: true, stdio: 'ignore' });
  p.unref();
  for (let i = 0; i < 40; i++) { await sleep(500); if (await reachable()) return true; }
  return false;
}

let chromium = null;
try {
  const { createRequire } = await import('node:module');
  const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
  ({ chromium } = require('playwright'));
} catch (e) {
  fix(`playwright unavailable: ${String(e.message).slice(0, 100)}`);
}

const MODALS = [
  ['build', 'build'], ['hunters', 'hunters'], ['hunter', 'hunter', 'H'], ['recruit', 'recruit'], ['trade', 'trade'],
  ['craft', 'craft'], ['dungeon', 'dungeon'], ['arena', 'arena'], ['quests', 'quests'], ['inventory', 'inventory'],
  ['difficulty', 'difficulty'], ['settings', 'settings'], ['help', 'help'], ['boss', 'boss'],
  ['dispatch', 'dispatchHunters'], ['region', 'regionInfo', 'snow'], ['density', 'densityFor', 'snow'],
];

if (chromium) {
  if (ensureBundle() && await ensureServer()) {
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
    const boot = async (view, phone) => {
      const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone, locale: 'zh-TW' });
      const page = await ctx.newPage();
      await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden'), null, { timeout: 120000 });
      await sleep(2200);
      return { ctx, page };
    };
    const act = (page, a, id) => page.evaluate(([a, id]) => {
      const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id;
      el.style.display = 'none'; document.body.append(el); el.click(); el.remove();
    }, [a, id]);
    const closeAll = async page => { await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); }); await sleep(180); };

    try {
      // U1 — duplicate title (desktop, every banner modal)
      {
        const { ctx, page } = await boot({ width: 1280, height: 720 }, false);
        const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0]?.id);
        for (const [name, action, id] of MODALS) {
          await closeAll(page); await act(page, action, id === 'H' ? hid : id); await sleep(280);
          const st = await page.evaluate(() => {
            const c = document.querySelector('#modal-content');
            if (!c || document.querySelector('#modal-backdrop').classList.contains('hidden')) return { open: false };
            const title = document.querySelector('#modal-title').textContent.trim();
            const headings = [...c.querySelectorAll('h1,h2,h3,h4')].filter(e => e.textContent.trim() === title).length;
            return { open: true, headings, title };
          });
          if (!st.open) fix(`U1 ${name}: modal did not open`);
          else if (st.headings) fix(`U1 ${name}: "${st.title}" appears ${st.headings + 1}x (header + banner)`);
        }
        // regression guard: with a modal open the bottom tab bar must stay on top of #modal-backdrop
        await closeAll(page); await act(page, 'build'); await sleep(280);
        const bar = await page.evaluate(() => {
          const btn = document.querySelector('#bottom-bar [data-action=build]');
          if (!btn) return { ok: false, hit: 'no tab' };
          const r = btn.getBoundingClientRect();
          const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { ok: !!(e && btn.contains(e)), hit: e ? `${e.tagName}#${e.id}.${String(e.className).slice(0, 24)}` : 'null' };
        });
        if (!bar.ok) fix(`U1 bottom tab bar is covered while a modal is open: tab hit-test returned ${bar.hit}`);
        await ctx.close();
      }
      // U2 — sticky dispatch bar and four team tabs (390x844)
      {
        const { ctx, page } = await boot({ width: 390, height: 844 }, true);
        await act(page, 'dispatchHunters'); await sleep(400);
        const st = await page.evaluate(() => {
          const c = document.querySelector('#modal-content'), go = c?.querySelector('.dispatch-go');
          if (!c || !go) return { open: false };
          const tabs = [...c.querySelectorAll('.dispatch-tabs button')];
          const tops = tabs.map(e => Math.round(e.getBoundingClientRect().top));
          const cut = tabs.filter(e => {
            const b = e.getBoundingClientRect();
            return [...e.querySelectorAll('.dt-name,.dt-n')].some(x => { const r = x.getBoundingClientRect(); return r.left < b.left - 0.5 || r.right > b.right + 0.5; });
          }).map(e => e.textContent.trim());
          c.scrollTop = 0;
          const pin0 = c.getBoundingClientRect().bottom - go.getBoundingClientRect().bottom;
          c.scrollTop = c.scrollHeight;
          const lastParty = [...c.querySelectorAll('.party-pick')].at(-1);
          const lastRegion = [...c.querySelectorAll('.region-pick')].at(-1);
          const cb = c.getBoundingClientRect(), gb = go.getBoundingClientRect();
          return {
            open: true, pad: parseFloat(getComputedStyle(c).paddingBottom), goH: go.offsetHeight,
            tabs: tabs.length, lines: new Set(tops).size, cut,
            lastPartyBottom: lastParty ? lastParty.getBoundingClientRect().bottom : -1,
            lastRegionBottom: lastRegion ? lastRegion.getBoundingClientRect().bottom : -1,
            goTop: gb.top, goBottom: gb.bottom, scrollBottom: cb.bottom,
            var: c.style.getPropertyValue('--dispatch-go-h'), pin0,
            goBg: getComputedStyle(go).backgroundColor,
          };
        });
        if (!st.open) fix('U2 dispatch modal did not open');
        else {
          if (st.tabs !== 4) fix(`U2 ${st.tabs} team tabs, expected 4`);
          if (!st.var) fix('U2 --dispatch-go-h is not set on #modal-content');
          if (st.lines !== 1) fix(`U2 team tabs sit on ${st.lines} rows at 390x844 (expected 1)`);
          if (st.cut.length) fix(`U2 team tab text is cut: ${st.cut.join(' / ')}`);
          if (Math.abs(st.pin0) > 16) fix(`U2 sticky dispatch bar floats ${Math.round(st.pin0)}px above the scrollport bottom at scrollTop 0`);
          if (st.goBottom > st.scrollBottom + 1) fix(`U2 sticky dispatch bar bottom ${Math.round(st.goBottom)} is below the scrollport bottom ${Math.round(st.scrollBottom)}`);
          if (st.lastPartyBottom > st.goTop + 0.5) fix(`U2 last hunter card bottom ${Math.round(st.lastPartyBottom)} > sticky button top ${Math.round(st.goTop)}`);
          if (st.lastRegionBottom > st.goTop + 0.5) fix(`U2 last region card bottom ${Math.round(st.lastRegionBottom)} > sticky button top ${Math.round(st.goTop)}`);
          if (st.goTop - st.lastRegionBottom < 8) fix(`U2 last region card is only ${Math.round(st.goTop - st.lastRegionBottom)}px above the sticky bar at the bottom of the scroll (expected >= 8px)`);
          const alpha = (st.goBg.match(/rgba\(([^)]*)\)/) || [])[1]?.split(',').map(Number)[3];
          if (alpha !== undefined && alpha < 0.95) fix(`U2 sticky dispatch bar background is see-through (${st.goBg}): scrolled cards show behind the button`);
        }
        // phone regression guard: #game-ui's zoom must not become a stacking context that traps the
        // modal-open bottom bar (z-index:32) under #modal-backdrop (30) at ui-scale 0.85.
        const pbar = await page.evaluate(() => {
          const btn = document.querySelector('#bottom-bar [data-action=build]');
          if (!btn) return { ok: false, hit: 'no tab' };
          const r = btn.getBoundingClientRect();
          const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { ok: !!(e && btn.contains(e)), hit: e ? `${e.tagName}#${e.id}.${String(e.className).slice(0, 24)}` : 'null' };
        });
        if (!pbar.ok) fix(`U2 phone bottom tab bar is covered while a modal is open: tab hit-test returned ${pbar.hit}`);
        await ctx.close();
      }
      // U3 — no horizontal overflow in any modal at 360x640
      {
        const { ctx, page } = await boot({ width: 360, height: 640 }, true);
        const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0]?.id);
        for (const [name, action, id] of MODALS) {
          await closeAll(page); await act(page, action, id === 'H' ? hid : id); await sleep(280);
          const st = await page.evaluate(() => {
            const c = document.querySelector('#modal-content');
            if (!c || document.querySelector('#modal-backdrop').classList.contains('hidden')) return { open: false };
            return { open: true, sw: c.scrollWidth, cw: c.clientWidth };
          });
          if (!st.open) fix(`U3 ${name}: modal did not open`);
          else if (st.sw > st.cw + 1) fix(`U3 ${name}: #modal-content scrollWidth ${st.sw} > clientWidth ${st.cw} at 360x640`);
        }
        await ctx.close();
      }
      // U5 — hunter detail on a phone (390x844): nothing overflows, exactly one primary action, all action buttons >= 44px high.
      //      (replaces the old static ≤480px `.hunter-detail` grid assertion; see header)
      {
        const { ctx, page } = await boot({ width: 390, height: 844 }, true);
        const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0]?.id);
        await act(page, 'hunter', hid); await sleep(500);
        const st = await page.evaluate(() => {
          // Z2A:獵人卡改成 .z2-hc(裝備環＋子頁籤);動作鈕＝底部列 修煉(橄欖綠)＋關閉(紅)＋子頁籤清單列(細項見 z2a-hunter.mjs)
          const c = document.querySelector('#modal-content'), d = c?.querySelector('.z2-hc');
          if (!d) return { open: false };
          const cr = c.getBoundingClientRect();
          const kids = [...d.children].map(e => { const r = e.getBoundingClientRect(); return { right: r.right, left: r.left, w: r.width }; });
          const foot = [...document.querySelectorAll('#modal-foot button')];
          const btns = [...foot, ...c.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0);
          const primary = foot.filter(b => b.dataset.foot === 'primary' && ['rgb(88,104,16)', 'rgb(80,80,80)'].includes(getComputedStyle(b).backgroundColor.replace(/\s/g, '')));   // 主動作(修煉)：可用＝橄欖綠、條件不足(新存檔沒蓋修煉地)＝灰
          return {
            open: true, overflow: c.scrollWidth - c.clientWidth,
            outside: kids.filter(k => k.right > cr.right + 1 || k.left < cr.left - 1 || k.w < 40).length,
            nBtn: foot.length, nPrimary: primary.length,
            small: btns.filter(b => b.getBoundingClientRect().height < 43.5 || b.getBoundingClientRect().width < 43.5).map(b => b.dataset.action || b.className),
            actions: foot.map(b => b.dataset.action).sort(),
          };
        });
        if (!st.open) fix('U5 hunter detail did not open');
        else {
          if (st.overflow > 1) fix(`U5 hunter detail scrollWidth overflows by ${st.overflow}px at 390x844`);
          if (st.outside) fix(`U5 ${st.outside} hunter-detail column(s) outside the panel or collapsed`);
          if (st.nBtn !== 2) fix(`U5 hunter detail foot has ${st.nBtn} buttons, expected 2 (train + close: ${st.actions.join(',')})`);
          if (st.nPrimary !== 1) fix(`U5 hunter detail has ${st.nPrimary} primary buttons in the foot, expected exactly 1`);
          if (st.small.length) fix(`U5 hunter detail buttons under 44px: ${st.small.join(',')}`);
        }
        await ctx.close();
      }
      // U4 — map / region labels stay under the inspector. The map labels themselves are canvas text
      // (painted inside #world), so the real guarantee is layer order: #world is z-index:0 and every
      // panel/modal sits above it. DOM labels (#region-badge, .world-map-trigger, .world-minimap) must
      // additionally not intersect the inspector rect at all.
      {
        const { ctx, page } = await boot({ width: 402, height: 712 }, true);
        await act(page, 'selectBuilding', 'forge'); await sleep(420);
        const st = await page.evaluate(() => {
          const i = document.querySelector('#inspector'), w = document.querySelector('#world');
          if (!i || i.classList.contains('hidden')) return { open: false };
          const b = i.getBoundingClientRect();
          const pts = [[b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4]];
          const overlap = (r, q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
          const labels = [...document.querySelectorAll('#region-badge,.world-map-trigger,.world-minimap')]
            .filter(e => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; })
            .filter(e => overlap(e.getBoundingClientRect(), b))
            .map(e => e.id || e.className);
          return {
            open: true,
            hits: pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e === i || i.contains(e)) ? 'inspector' : (e ? `${e.tagName}#${e.id}.${String(e.className).slice(0, 24)}` : 'null'); }),
            labels,
            worldZ: getComputedStyle(w).zIndex,
            inspZ: getComputedStyle(i).zIndex,
          };
        });
        if (!st.open) fix('U4 inspector did not open');
        else {
          if (st.hits.some(h => h !== 'inspector')) fix(`U4 inspector corners are covered: ${st.hits.join(' / ')}`);
          if (st.labels.length) fix(`U4 map label overlaps the inspector: ${st.labels.join(' / ')}`);
          if (!(Number(st.inspZ) > Number(st.worldZ))) fix(`U4 #inspector z-index ${st.inspZ} is not above the #world label layer ${st.worldZ}`);
          // Canvas pixels, not just hit-testing: if the panel is opaque over its whole border box, hiding
          // the map canvas must not change a single pixel of the inspector. A region label painted on
          // #world showing through a transparent border would change the screenshot.
          const clip = await page.evaluate(() => {
            const b = document.querySelector('#inspector').getBoundingClientRect();
            // 內縮 3px:新版面的面板有 2–3px 圓角，四個角落的像素本來就會透出底下的場景（跟「透明底」是兩回事），
            // 不內縮的話比對結果會隨角落下方剛好是什麼地形而忽過忽不過。邊框與內容區（真正會被地圖文字穿透的地方）全部還在比對範圍內。
            const m = 3;
            return { x: Math.round(b.x) + m, y: Math.round(b.y) + m, width: Math.round(b.width) - 2 * m, height: Math.round(b.height) - 2 * m };
          });
          if (clip.width < 40 || clip.height < 40) fix(`U4 inspector clip is ${clip.width}x${clip.height}, too small to compare`);
          else {
            const withWorld = await page.screenshot({ clip });
            await page.evaluate(() => { document.querySelector('#world').style.visibility = 'hidden'; });
            await sleep(120);
            const withoutWorld = await page.screenshot({ clip });
            await page.evaluate(() => { document.querySelector('#world').style.visibility = ''; });
            if (!withWorld.equals(withoutWorld))
              fix('U4 canvas pixels show through the inspector: hiding #world changes the panel screenshot (no opaque backing under the border)');
          }
        }
        await ctx.close();
      }
    } catch (e) {
      fix(`live check crashed: ${String(e.message || e).slice(0, 140)}`);
    } finally {
      await browser.close();
    }
  } else {
    fix(`live check unavailable (server or build failed at ${URL})`);
  }
}

if (fails.length) { for (const f of fails) console.log(`FIX: ${f}`); process.exit(1); }
console.log('OK  T64: no duplicate modal titles; dispatch tabs one row + opaque sticky bar clear of the last card; no 360px modal overflow; hunter detail one primary button; inspector corners clear');
