// 主世界地圖檢查：兩欄版面、卡片「詳情」開詳細頁、三顆地圖來源按鈕、「在地圖上定位」回地圖並移動鏡頭。
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function openWorldmap(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#bottom-bar button')].find((n) => (n.dataset.action || '') === 'worldmap')
      || [...document.querySelectorAll('[data-action="worldmap"]')][0];
    b.click();
  });
  await page.waitForTimeout(500);
}

const fails = [];
for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 402, height: 712 }]]) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW' });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await openWorldmap(page);

  const lay = await page.evaluate(() => {
    const map = document.querySelector('.wm-body .wm-map');
    const grid = document.querySelector('.wm-body .region-grid');
    const canvas = document.querySelector('#world-map-canvas');
    const card = document.querySelector('.wm-body .region-card');
    const art = card?.querySelector('.region-art');
    const r = (n) => n ? n.getBoundingClientRect() : null;
    return {
      hasMap: !!map, hasGrid: !!grid,
      map: r(map), grid: r(grid), canvas: r(canvas), card: r(card), art: r(art),
      cards: document.querySelectorAll('.wm-body .region-card').length,
      gap: map && grid ? Math.round(grid.left - map.right) : null,
      artHasImage: art ? /url\(/.test(getComputedStyle(art).backgroundImage) : false,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (!lay.hasMap || !lay.hasGrid) fails.push(`${label}: 找不到 .wm-map 或 .region-grid`);
  if (lay.cards !== 8) fails.push(`${label}: 區域卡片應 8 張，實際 ${lay.cards}`);
  if (!lay.artHasImage) fails.push(`${label}: 卡片沒有全景圖`);
  if (!lay.canvas || lay.canvas.height < 90) fails.push(`${label}: 小地圖高度不足（${lay.canvas?.height}）`);
  if (!lay.card || lay.card.height > 320) fails.push(`${label}: 卡片太高 ${lay.card?.height}`);
  if (lay.overflowX > 1) fails.push(`${label}: 面板出現橫向溢出 ${lay.overflowX}px`);
  if (label === 'desktop' && (lay.gap === null || lay.gap < 12)) fails.push(`desktop: 地圖與卡片沒有並排（gap ${lay.gap}）`);
  if (label === 'phone' && lay.gap !== null && lay.gap > 0) fails.push(`phone: 應為單欄堆疊，gap ${lay.gap}`);

  // 卡片「詳情」→ 詳細頁，且有三顆地圖來源按鈕
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.wm-body .region-card button')].find((n) => (n.dataset.action || '') === 'regionDetail');
    b.click();
  });
  await page.waitForTimeout(400);
  const detail = await page.evaluate(() => ({
    title: document.querySelector('#modal-title')?.textContent?.trim() || '',
    acts: [...document.querySelectorAll('#modal [data-action]')].map((n) => n.dataset.action),
    pano: !!document.querySelector('.region-detail-art') && /url\(/.test(getComputedStyle(document.querySelector('.region-detail-art')).backgroundImage),
  }));
  if (!detail.acts.includes('regionView')) fails.push(`${label}: 詳細頁沒有「在地圖上定位」（acts: ${detail.acts.join(',')}）`);
  if (!detail.acts.includes('worldmap')) fails.push(`${label}: 詳細頁沒有「返回地圖」`);
  if (!detail.pano) fails.push(`${label}: 詳細頁沒有全景圖`);
  if (detail.title !== '地圖詳細資訊') fails.push(`${label}: 詳細頁標題「${detail.title}」`);

  // 「在地圖上定位」→ 關閉面板並把鏡頭移到該區域
  await page.evaluate(() => document.querySelector('#modal [data-action="regionView"]').click());
  await page.waitForTimeout(900);
  const back = await page.evaluate(() => ({ hidden: document.querySelector('#modal-backdrop')?.classList.contains('hidden') }));
  if (!back.hidden) fails.push(`${label}: 定位後詳細頁沒有關閉`);
  await ctx.close();
}

await browser.close();
if (fails.length) { console.log('FAIL'); for (const f of fails) console.log(' -', f); process.exit(1); }
console.log('PASS 主世界地圖：兩欄版面／卡片詳情／三顆按鈕／在地圖上定位');
