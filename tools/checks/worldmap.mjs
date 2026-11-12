// 主世界地圖檢查(Z2C 改版):C 視窗、小地圖固定頂端、每區一行、展開後「詳情」開詳細頁、「在地圖上定位」回地圖並移動鏡頭。
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

  // Z2C(2026-11-12 決定 C4):世界地圖是 C 視窗;小地圖固定在頂端、每區一行(名稱／星數／判定標籤／前往),點行展開、展開後有「詳情」
  const lay = await page.evaluate(() => {
    const map = document.querySelector('.wm-body .wm-map');
    const grid = document.querySelector('.wm-body .region-grid');
    const canvas = document.querySelector('#world-map-canvas');
    const card = document.querySelector('.wm-body .region-card');
    const r = (n) => n ? n.getBoundingClientRect() : null;
    return {
      hasMap: !!map, hasGrid: !!grid,
      map: r(map), grid: r(grid), canvas: r(canvas), card: r(card),
      cards: document.querySelectorAll('.wm-body .region-card').length,
      mode: document.querySelector('#modal')?.dataset.mode,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  if (!lay.hasMap || !lay.hasGrid) fails.push(`${label}: 找不到 .wm-map 或 .region-grid`);
  if (lay.cards !== 8) fails.push(`${label}: 區域列應 8 列，實際 ${lay.cards}`);
  if (lay.mode !== 'C') fails.push(`${label}: 世界地圖應為 C 視窗（${lay.mode}）`);
  if (!lay.canvas || lay.canvas.height < 90) fails.push(`${label}: 小地圖高度不足（${lay.canvas?.height}）`);
  if (!lay.card || lay.card.height > 80) fails.push(`${label}: 區域列太高 ${lay.card?.height}（每區一行）`);
  if (lay.overflowX > 1) fails.push(`${label}: 面板出現橫向溢出 ${lay.overflowX}px`);
  if (lay.canvas && lay.grid && lay.canvas.bottom > lay.grid.top + 1) fails.push(`${label}: 小地圖與區域列重疊`);

  // 點行展開 → 「詳情」→ 詳細頁，且有「在地圖上定位」「返回地圖」
  await page.evaluate(() => { document.querySelectorAll('.wm-body .region-card .z2c-row-main')[1].click(); });
  await page.waitForTimeout(200);
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
console.log('PASS 主世界地圖：C 視窗／小地圖固定頂端／每區一行／展開詳情／在地圖上定位');
