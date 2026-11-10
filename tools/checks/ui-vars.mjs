// UI 素材變數檢查：--ui-px-* 必須真的有值，面板橫幅要載到圖（大圖外部 webp、小圖 data URI 都算）。
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const fails = [];

// [data-action, modal data-type]
const PANELS = [
  ['dungeon', 'dungeon'], ['arena', 'arena'], ['boss', 'boss'], ['recruit', 'recruit'],
  ['trade', 'trade'], ['quests', 'quests'], ['craft', 'craft'], ['inventory', 'inventory'],
  ['build', 'build'], ['hunters', 'hunters'], ['difficulty', 'difficulty'], ['help', 'help'],
  ['settings', 'settings'],
];

async function run(label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', isMobile: !!isMobile, hasTouch: !!isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.waitForTimeout(1400);

  const vars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const name of ['banner-dungeon', 'banner-trade', 'banner-settings', 'banner-dispatch', 'card', 'window', 'ic-gold', 'em-village']) {
      out[name] = cs.getPropertyValue('--ui-px-' + name).trim().slice(0, 12);
    }
    return out;
  });
  for (const [k, v] of Object.entries(vars)) if (!v) fails.push(`${label}: --ui-px-${k} 沒有定義`);

  for (const [action, type] of PANELS) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await page.evaluate((t) => {
      const el = document.createElement('button');
      el.dataset.action = t;
      document.body.append(el);
      el.click();
      el.remove();
    }, action);
    await page.waitForFunction((t) => document.querySelector('#modal')?.dataset.type === t, type, { timeout: 5000 }).catch(() => {});
    const info = await page.evaluate(() => {
      const m = document.querySelector('#modal');
      if (!m || getComputedStyle(document.querySelector('#modal-backdrop')).display === 'none') return null;
      const b = m.querySelector('.encounter-banner');
      if (!b) return { type: m.dataset.type, banner: false };
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return { type: m.dataset.type, banner: true, bg: cs.backgroundImage, h: Math.round(r.height), w: Math.round(r.width) };
    });
    if (!info) { fails.push(`${label}: ${action} 面板沒有開啟`); continue; }
    if (info.type !== type) { fails.push(`${label}: ${action} 開成 ${info.type} 面板`); continue; }
    if (!info.banner) { fails.push(`${label}: ${type} 面板沒有橫幅`); continue; }
    if (!/url\(/.test(info.bg)) fails.push(`${label}: ${type} 橫幅沒有背景圖`);
    const named = /px-banner-([a-z]+)\./.exec(info.bg)?.[1];
    if (named && named !== type) fails.push(`${label}: ${type} 橫幅載到 ${named} 的圖`);
    if (info.h < 60) fails.push(`${label}: ${type} 橫幅高度只有 ${info.h}px`);
  }
  await ctx.close();
}

await run('desktop', { width: 1440, height: 900 }, false);
await run('phone', { width: 402, height: 712 }, true);
await browser.close();
if (fails.length) { console.log('FAIL'); for (const f of fails) console.log(' -', f); process.exit(1); }
console.log('PASS UI 素材變數：13 個面板橫幅都載入圖，--ui-px-* 變數在桌機與手機都有值');
