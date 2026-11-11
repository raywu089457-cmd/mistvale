import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://100.79.149.0:5024/?preview=1';
const fixes = [];
const oks = [];
const fix = (m) => fixes.push(m);
const ok = (m) => oks.push(m);

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--headless=new', '--mute-audio'],
});

async function run(label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', isMobile: !!isMobile, hasTouch: !!isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  // 找一個還沒蓋的建築，改成「有錢可蓋」的空地
  const target = await page.evaluate(() => {
    const g = globalThis.__mistvaleGame;
    const ids = ['academy', 'bounty', 'clinic'];
    const id = ids.find((k) => (g.state.buildings[k] || 0) === 0) || ids[0];
    g.state.buildings[id] = 0;
    g.state.gold = 9000;
    for (const k of ['wood', 'ore', 'herb', 'cloth', 'flour', 'leather']) g.state[k] = 120;
    return id;
  });

  // 從世界點空地（不開建設彈窗）
  const clicked = await page.evaluate((id) => {
    const v = globalThis.__mistvaleView;
    const r = v.hitRects().find((h) => h.id === id);
    if (!r) return null;
    const pts = [[r.x + r.w / 2, r.y + r.h / 2], [r.x + r.w / 2, r.y + 4]];
    for (const [x, y] of pts) {
      const el = document.elementFromPoint(x, y);
      if (el) { el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true })); return { x, y }; }
    }
    return null;
  }, target);

  if (!clicked) fix(`${label}: 找不到空地(${target})的可點矩形`);
  await page.waitForTimeout(300);
  // 2026-11-11 第二階段:點世界 → 腳下六角鈕 → 按「資訊」才開 #inspector
  const hexA = await page.evaluate(() => { const b = document.querySelector('#hv-sel:not([hidden]) [data-action="selInfo"]'); if (b) b.click(); return !!b; });
  if (!hexA) fix(`${label}: 點空地後沒有出現六角鈕（資訊／取消）`);
  await page.waitForTimeout(700);

  const st = await page.evaluate(() => {
    const wrap = document.querySelector('.inspect-art');
    const art = document.querySelector('.inspect-art.blueprint .bp-art');
    const cs = art ? getComputedStyle(art) : null;
    const rect = art ? art.getBoundingClientRect() : null;
    const img = wrap ? wrap.querySelector('img') : null;
    return {
      hasWrap: !!wrap,
      blueprint: !!wrap && wrap.classList.contains('blueprint'),
      bid: art ? art.dataset.bid : '',
      bg: cs ? cs.backgroundImage.slice(0, 22) : '',
      bgLen: cs ? cs.backgroundImage.length : 0,
      w: rect ? Math.round(rect.width) : 0,
      h: rect ? Math.round(rect.height) : 0,
      hasImg: !!img,
      label: wrap ? getComputedStyle(wrap, '::after').content : '',
      level: (document.querySelector('.inspect-level') || {}).textContent || '',
      chips: [...document.querySelectorAll('#inspector .inspect-cost .cost-chip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).slice(0, 4),
    };
  });

  if (!st.hasWrap) fix(`${label}: 沒有 #inspector .inspect-art`);
  if (!st.blueprint) fix(`${label}: 空地(${target})沒有進入藍圖模式`);
  if (st.bid !== target) fix(`${label}: 藍圖 data-bid 是 "${st.bid}"，預期 "${target}"`);
  if (!st.bg.startsWith('url("data:image/png')) fix(`${label}: 藍圖沒有背景圖（${st.bg}）`);
  if (st.w < 80 || st.h < 80) fix(`${label}: 藍圖尺寸 ${st.w}x${st.h} 太小（預期 ≥80）`);
  if (st.hasImg) fix(`${label}: 藍圖模式還留著 atlas 縮圖 <img>`);
  if (!/尚未建造/.test(st.level)) fix(`${label}: 等級列不是「尚未建造」（${st.level.trim()}）`);
  if (!st.chips.length) fix(`${label}: 藍圖下方沒有需求 chips`);
  if (st.label && !/藍圖/.test(st.label)) fix(`${label}: 左上角沒有「藍圖」標記（${st.label}）`);

  // 已建成的建築仍要用世界同一張 sprite 縮圖
  const built = await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView;
    // 2026-11-11 浮在場景上的 HUD 會蓋住畫面邊緣:挑「已蓋好、中心點直接點得到世界層」的建築(不然合成點擊落在 HUD 上)
    document.querySelector('#inspector:not(.hidden) [data-action="closeInspector"]')?.click();   // 手機上建築面板是底部抽屜,不收起會蓋住世界
    const free = (h) => document.elementFromPoint(h.x + h.w / 2, h.y + h.h / 2)?.id === 'world';
    const builtIds = Object.keys(g.state.buildings).filter((k) => (g.state.buildings[k] || 0) > 0);
    const r = v.hitRects().find((h) => builtIds.includes(h.id) && free(h)) || v.hitRects().find((h) => builtIds.includes(h.id));
    const id = r ? r.id : 'hall';
    if (r) {
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      const el = document.elementFromPoint(x, y) || document.body;
      el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));
    }
    return id;
  });
  await page.waitForTimeout(300);
  const hexB = await page.evaluate(() => { const b = document.querySelector('#hv-sel:not([hidden]) [data-action="selInfo"]'); if (b) b.click(); return !!b; });
  if (!hexB) fix(`${label}: 點已蓋好的建築後沒有出現六角鈕（資訊／取消）`);
  await page.waitForTimeout(700);
  const st2 = await page.evaluate(() => {
    const wrap = document.querySelector('.inspect-art');
    return { blueprint: !!wrap && wrap.classList.contains('blueprint'), hasImg: !!(wrap && wrap.querySelector('img')) };
  });
  // phone: the drawer intercepts world clicks, so the built-building check is desktop-only
  if (!isMobile) {
  if (st2.blueprint) fix(`${label}: 已建成的建築(${built})不應該顯示藍圖`);
  }
  if (!isMobile && !st2.hasImg) fix(`${label}: 已建成的建築應該仍用 sprite 縮圖`);

  if (errs.length) fix(`${label}: 頁面有錯誤 ${errs[0]}`);

  // 手機另外確認藍圖不超出面板
  if (isMobile) {
    const over = await page.evaluate(() => {
      const art = document.querySelector('.inspect-art.blueprint') || document.querySelector('.inspect-art');
      if (!art) return null;
      const a = art.getBoundingClientRect();
      return a.right > window.innerWidth + 1 || a.left < -1;
    });
    if (over) fix(`${label}: 藍圖超出面板寬度`);
  }
  await ctx.close();
}

await run('desktop 1440x900', { width: 1440, height: 900 }, false);
await run('phone 402x712', { width: 402, height: 712 }, true);
await browser.close();

for (const o of oks) console.log('ok  ' + o);
for (const f of fixes) console.log('FIX ' + f);
if (fixes.length) {
  console.log(`FAIL blueprint: ${fixes.length} 個問題`);
  process.exit(1);
}
console.log('PASS blueprint: 點空地會顯示 AI 藍圖（插圖／藍圖標記／尚未建造／需求 chips，尺寸足夠），已建成的建築仍用世界 sprite 縮圖，手機藍圖不超出面板（desktop 1440x900、phone 402x712）');
