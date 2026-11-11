// hunters-fold.mjs — geometry assert for T49: the first hunter card must sit above the fold of the hunters roster modal on phones,
// and the desktop roster bar must stay a single row. Devices are inline so the 375x812 / 390x844 evidence is reproducible.
// 2026-11-11 改寫（獵魔村風格第三階段）：名冊改成格狀肖像卡（.hv-hgrid > .hv-hcard），篩選／排序收進標題列右側的「篩選」鈕，
//   點開才出現 .roster-bar；舊選擇器 .roster-grid .hunter-card、預設就在的 .roster-bar 已不存在。不變量不變（第一張卡不用捲就看得到、
//   手機的篩選列是 <=150px 直排、桌機是單行），現在要在「收合」與「展開篩選」兩種狀態各量一次；另加：標題列工具鈕不超出面板右緣。
// Usage: node tools/checks/hunters-fold.mjs            (needs `npm run build` + the game server; TARGET= to override)
//   SHOTS=1 also writes output/ui-audit/T49-after-phone-hunters-<w>x<h>.png for human review.
// Exit: 0 = all hold, 1 = a FIX line was printed, 2 = could not reach the page.
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
// phones = card must be above the fold and the bar must be the stacked phone variant; desktop = bar must stay one row.
const DEVICES = [
  { name: 'iphone14-390x844', w: 390, h: 844, dpr: 3, ua: IOS_UA, phone: true },
  { name: 'iphonex-375x812', w: 375, h: 812, dpr: 2, ua: IOS_UA, phone: true },
  { name: 'desktop-1280x720', w: 1280, h: 720, dpr: 1, phone: false },
];

const MEASURE = () => {
  const r = e => { const q = e.getBoundingClientRect(); return { top: Math.round(q.top), bottom: Math.round(q.bottom), h: Math.round(q.height) }; };
  const mc = document.querySelector('#modal-content');
  const bar = document.querySelector('#modal[data-type=hunters] .roster-bar');
  const card = document.querySelector('#modal[data-type=hunters] .hv-hgrid .hv-hcard');
  const rows = [...document.querySelectorAll('#modal[data-type=hunters] .roster-bar > *')].map(e => Math.round(e.getBoundingClientRect().top));
  const modal = document.querySelector('#modal').getBoundingClientRect();
  const toolsOut = [...document.querySelectorAll('#modal .hv-mtools button')].filter(b => b.offsetParent && b.getBoundingClientRect().right > modal.right + 1).map(b => b.dataset.action);
  return {
    toolsOut, nCards: document.querySelectorAll('#modal[data-type=hunters] .hv-hgrid .hv-hcard').length,
    content: mc ? r(mc) : null, bar: bar ? r(bar) : null, card: card ? r(card) : null,
    barDirection: bar ? getComputedStyle(bar).flexDirection : null,
    // the phone rules add `overflow-x:auto` to the chip rows; desktop must not inherit that (that is the desktop-unchanged assert)
    rowsOverflow: bar?.querySelector('div') ? getComputedStyle(bar.querySelector('div')).overflowX : null,
    barLines: new Set(rows).size, open: !!document.querySelector('#modal-backdrop:not(.hidden)'),
  };
};

let bad = 0, unreachable = false;
for (const dev of DEVICES) {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
  try {
    const ctx = await browser.newContext({
      viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr,
      isMobile: dev.phone, hasTouch: dev.phone, locale: 'zh-TW', ...(dev.ua ? { userAgent: dev.ua } : {}),
    });
    const page = await ctx.newPage();
    try { await page.goto(URL, { waitUntil: 'commit', timeout: 120000 }); } catch (e) { unreachable = true; console.log(`FAIL ${dev.name}: cannot load ${URL} (${String(e.message).slice(0, 90)})`); continue; }
    // the loading overlay hides the UI until the game boots; give it the same budget layout.mjs uses
    await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden'), null, { timeout: 180000 }).catch(() => {});
    await sleep(2500);
    // same modal trigger as pipeline/scripts/ui-audit/layout.mjs: fire data-action through a hidden button
    await page.evaluate(() => {
      const el = document.createElement('button'); el.dataset.action = 'hunters'; el.style.display = 'none';
      document.body.append(el); el.click(); el.remove();
    });
    await sleep(600);
    const closed = await page.evaluate(MEASURE);
    // 展開標題列的「篩選」鈕 → 篩選列出現；卡片仍要在第一屏
    await page.evaluate(() => document.querySelector('#modal .hv-mtools [data-action=rosterMenu]')?.click());
    await sleep(400);
    const m = await page.evaluate(MEASURE);
    // SHOTS=1 also writes the human-review screenshots next to the other ui-audit images
    if (process.env.SHOTS && dev.phone) await page.screenshot({ path: `output/ui-audit/T49-after-phone-hunters-${dev.w}x${dev.h}.png` }).catch(() => {});
    const rows = `closed card ${closed.card?.top}-${closed.card?.bottom}/${closed.content?.bottom} | open content ${m.content?.top}-${m.content?.bottom} bar ${m.bar?.h}px/${m.barLines} lines ${m.barDirection} card ${m.card?.top}-${m.card?.bottom}`;
    const fix = [];
    if (!closed.open || !closed.content || !closed.card) fix.push('hunters roster did not open');
    else if (closed.card.bottom > closed.content.bottom + 1) fix.push(`closed: first .hv-hcard bottom ${closed.card.bottom} > #modal-content bottom ${closed.content.bottom}`);
    if (closed.bar) fix.push('filter bar is shown before pressing the toolbar filter button (expected collapsed)');
    if (closed.toolsOut?.length) fix.push(`toolbar buttons stick out of the panel: ${closed.toolsOut.join(',')}`);
    if (!m.open || !m.content || !m.bar || !m.card) fix.push('filter bar did not open from the toolbar button');
    else if (m.card.bottom > m.content.bottom + 1) fix.push(`filter open: first .hv-hcard bottom ${m.card.bottom} > #modal-content bottom ${m.content.bottom}`);
    if (m.bar) {
      if (dev.phone && m.bar.h > 150) fix.push(`roster-bar is ${m.bar.h}px tall on a phone (expected the stacked <=150px variant)`);
      if (dev.phone && m.barDirection !== 'column') fix.push(`roster-bar flex-direction is ${m.barDirection} on a phone (expected column)`);
      if (!dev.phone && m.barDirection !== 'row') fix.push(`roster-bar flex-direction is ${m.barDirection} on desktop (expected row)`);
      if (!dev.phone && m.rowsOverflow !== 'visible') fix.push(`roster-bar chip rows overflow-x is ${m.rowsOverflow} on desktop (expected visible)`);
    }
    if (fix.length) { bad++; console.log(`FIX ${dev.name}: ${fix.join('; ')} | ${rows}`); } else console.log(`OK  ${dev.name}: ${rows}`);
  } finally { await browser.close(); }
}
if (bad) { console.log(`\n${bad} device(s) fail the hunters fold check`); process.exit(1); }
if (unreachable) process.exit(2);
console.log('\nall devices hold the hunters fold check');
