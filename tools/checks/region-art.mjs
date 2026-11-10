// 區域全景插畫檢查：地圖卡片與地區詳情都要有 PixelLab 全景圖，且真的載入。
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const fails = [];

async function run(label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', isMobile: !!isMobile, hasTouch: !!isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const el = document.createElement('button');
    el.dataset.action = 'worldmap';
    document.body.append(el);
    el.click();
    el.remove();
  });
  await page.waitForTimeout(700);

  const cards = await page.evaluate(() => [...document.querySelectorAll('#modal .region-card')].map((c) => {
    const art = c.querySelector('.region-art');
    if (!art) return { id: c.dataset.region, art: false };
    const cs = getComputedStyle(art);
    return {
      id: c.dataset.region,
      art: true,
      h: Math.round(art.getBoundingClientRect().height),
      bg: /px-region-([a-z]+)\.(webp|png)/.exec(cs.backgroundImage)?.[1] || '',
      loaded: cs.backgroundImage.startsWith('url(') && cs.backgroundImage.length > 30,
    };
  }));

  if (cards.length !== 8) fails.push(`${label}: 區域卡片應 8 張，實際 ${cards.length}`);
  for (const c of cards) {
    if (!c.art) fails.push(`${label}: ${c.id} 沒有 .region-art`);
    else {
      if (!c.loaded) fails.push(`${label}: ${c.id} 全景圖未設定`);
      if (c.h < 40) fails.push(`${label}: ${c.id} 全景圖高度只有 ${c.h}px`);
      if (c.bg && c.bg !== c.id) fails.push(`${label}: ${c.id} 載到別區的圖（${c.bg}）`);
    }
  }

  // 地區詳情：卡片上的「查看」只是把鏡頭移過去，真正的詳情頁由 regionInfo 開啟
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.dataset.action = 'regionInfo';
    b.dataset.id = 'meadow';
    document.body.append(b);
    b.click();
    b.remove();
  });
  await page.waitForTimeout(600);
  const detail = await page.evaluate(() => {
    const a = document.querySelector('#modal .region-detail-art');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    const bg = getComputedStyle(a).backgroundImage;
    return { h: Math.round(r.height), bg: bg.length, id: /px-region-([a-z]+)\.(webp|png)/.exec(bg)?.[1] || '' };
  });
  if (!detail) fails.push(`${label}: 地區詳情沒有全景圖`);
  else {
    if (detail.h < 70) fails.push(`${label}: 詳情全景圖高度只有 ${detail.h}px`);
    if (detail.bg < 30) fails.push(`${label}: 詳情全景圖沒有背景圖`);
    if (detail.id && detail.id !== 'meadow') fails.push(`${label}: 詳情全景圖載到別區（${detail.id}）`);
  }
  await ctx.close();
}

await run('desktop', { width: 1440, height: 900 }, false);
await run('phone', { width: 402, height: 712 }, true);
await browser.close();
if (fails.length) { console.log('FAIL'); for (const f of fails) console.log(' -', f); process.exit(1); }
console.log('PASS 區域全景：8 張卡片圖＋地區詳情圖，桌機與手機都載入且尺寸正確');
