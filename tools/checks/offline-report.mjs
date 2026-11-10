import { createRequire } from 'node:module';

const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

const fails = [];
for (const [label, vp, shot] of [['desktop', { width: 1440, height: 900 }, 'output/offline-desktop.png'], ['phone', { width: 402, height: 712 }, 'output/offline-phone.png']]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(1600);
  const info = await page.evaluate(() => {
    document.querySelector('#title-screen')?.remove();
    globalThis.__mistvaleShowOffline?.();
    const modal = document.querySelector('#modal-backdrop:not(.hidden) #modal');
    if (!modal) return { open: false };
    const tx = (el) => (el?.textContent || '').trim();
    const tiles = [...modal.querySelectorAll('.of-tile')].map((t) => ({ k: tx(t.querySelector('small')), v: tx(t.querySelector('b')), icon: !!t.querySelector('i svg,i img') }));
    const items = [...modal.querySelectorAll('.materials-grid .material-item')].map((m) => ({ label: tx(m.querySelector('span')), value: tx(m.querySelector('b')), cls: m.className }));
    return {
      open: true,
      title: tx(modal.querySelector('h2,.modal-title')),
      tiles,
      items,
      growth: [...modal.querySelectorAll('.offline-levels li')].map(tx),
      action: tx(modal.querySelector('.encounter-actions .pixel-button')),
      innerW: Math.round(modal.getBoundingClientRect().width),
      overflowX: modal.scrollWidth > modal.clientWidth + 2,
      tileW: modal.querySelector('.of-tile') ? Math.round(modal.querySelector('.of-tile').getBoundingClientRect().width) : 0,
    };
  });
  if (!info.open) fails.push(`${label}: 離線戰報沒有開啟`);
  else {
    if (info.tiles.length !== 3) fails.push(`${label}: 摘要磚應為 3 個，實際 ${info.tiles.length}`);
    if (info.tiles.some((t) => !t.v || !t.k || !t.icon)) fails.push(`${label}: 摘要磚缺少圖示或文字 ${JSON.stringify(info.tiles)}`);
    if (!info.items.length) fails.push(`${label}: 沒有資源變化項目`);
    if (!info.items.some((m) => /lose/.test(m.cls))) fails.push(`${label}: 負數資源沒有 lose 樣式`);
    if (!info.growth.length) fails.push(`${label}: 沒有獵人成長列`);
    if (!/收下/.test(info.action)) fails.push(`${label}: 底部按鈕文字不是收下戰報`);
    if (info.overflowX) fails.push(`${label}: 面板水平溢出`);
    if (info.tileW < 60) fails.push(`${label}: 摘要磚太窄 ${info.tileW}px`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot, fullPage: false });
    console.log(label, JSON.stringify(info));
  }
  await ctx.close();
}
await browser.close();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS 離線戰報：摘要磚三格、資源增減樣式、獵人成長、收下按鈕');
