// T143：手機第一次操作時提示手勢（只提示一次）
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = 'http://100.79.149.0:5024/?preview=1';
let fails = 0, oks = 0;
const fix = m => { fails++; console.log('FIX ' + m); };
const ok = m => { oks++; console.log('ok  ' + m); };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const boot = async (opts, storage) => {
  const ctx = await browser.newContext(storage ? { ...opts, storageState: storage } : opts);
  const page = await ctx.newPage();
  if (!storage) { await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 }); await page.evaluate(() => localStorage.clear()); }
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  return { ctx, page };
};
const waitForTip = async (page, ms = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const txt = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast .toast-tx')].map(e => e.textContent).join(' | '));
    if (/雙指縮放/.test(txt)) return txt;
    await page.waitForTimeout(250);
  }
  return '';
};
const toastText = page => page.evaluate(() => [...document.querySelectorAll('#toasts .toast .toast-tx')].map(e => e.textContent).join(' | '));

// 1) 手機：清掉存檔與提示旗標 → 應出現手勢提示
const phone = { viewport: { width: 402, height: 712 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'zh-TW' };
{
  const { ctx, page } = await boot(phone, null);
  await page.evaluate(() => { try { document.querySelector('#modal-backdrop')?.classList.add('hidden'); } catch {} });
  const txt = await waitForTip(page);
  if (!txt) fix('手機第一次進場沒有看到手勢提示');
  else ok(`手機第一次進場提示「${txt}」`);
  const flag = await page.evaluate(() => localStorage.getItem('mistvale-touch-tip'));
  if (flag !== '1') fix('提示出現後沒有寫入 mistvale-touch-tip'); else ok('已記錄 mistvale-touch-tip=1');
  // 停留時間：比一般訊息（3 秒）久；偵測到之後再等 3 秒應該還在
  await page.waitForTimeout(3000);
  const still = await toastText(page);
  if (/雙指縮放/.test(still)) ok('偵測到之後 3 秒仍在（一般訊息 3 秒就被收掉）');
  else fix('手勢提示太早消失');
  const storage = await ctx.storageState();
  await ctx.close();
  globalThis.__storage = storage;
}

// 2) 手機：再進場不該重複提示
{
  const { ctx, page } = await boot(phone, globalThis.__storage);
  await page.evaluate(() => { try { document.querySelector('#modal-backdrop')?.classList.add('hidden'); } catch {} });
  await page.waitForTimeout(2000);
  const txt = await toastText(page);
  if (/雙指縮放/.test(txt)) fix('第二次進場又提示了一次手勢'); else ok('第二次進場不再提示');
  await ctx.close();
}

// 3) 桌機：完全不出現手勢提示
{
  const { ctx, page } = await boot({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' }, null);
  await page.evaluate(() => { try { document.querySelector('#modal-backdrop')?.classList.add('hidden'); } catch {} });
  await page.waitForTimeout(2400);
  const txt = await toastText(page);
  if (/雙指縮放/.test(txt)) fix('桌機也出現手機手勢提示'); else ok('桌機不顯示手勢提示');
  await ctx.close();
}

await browser.close();
console.log(fails ? `FAIL ${fails} 項` : `PASS touch tip: 手機第一次進場會提示雙指縮放／雙擊放大／拖曳甩動（停留 7 秒、只提示一次），桌機不顯示（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
