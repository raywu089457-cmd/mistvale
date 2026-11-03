// uiscale-test.mjs — does the 介面大小 slider actually scale the UI and persist? Usage: node pipeline/scripts/ui-audit/uiscale-test.mjs
import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/';
const OUT = 'output/ui-audit/uiscale';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const fails = [], ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails.push(name); };
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-action=settings]').click());
await page.waitForTimeout(600);
const box = () => page.evaluate(() => { const r = document.querySelector('#bottom-bar').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
const slider = await page.$('[data-uiscale]');
ok('slider exists in settings', !!slider);
const base = await box();
const set = async v => { await page.evaluate(v => { const el = document.querySelector('[data-uiscale]'); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v); await page.waitForTimeout(700); };
await set(140); const big = await box(); await set(80); const small = await box();
ok('140% grows the bottom bar', big.w > base.w * 1.15 || big.h > base.h * 1.15, `${base.w}x${base.h} → ${big.w}x${big.h}`);
ok('80% shrinks the bottom bar', small.w <= base.w && small.h < base.h * 0.95, `${small.w}x${small.h}`);   // 底欄寬度是 100%，只有高度會縮
ok('slider value saved', await page.evaluate(() => globalThis.__mistvaleGame.state.settings.uiScale) === 0.8);
await set(140);
await page.screenshot({ path: `${OUT}/desktop-settings-140.png` });
const tx = (await page.evaluate(() => { const el = document.querySelector('[data-uiscale]'); el.scrollIntoView({ block: 'center' }); return el.parentElement.querySelector('b').textContent; }));
ok('label reflects the value', tx === '140%', tx);
await page.evaluate(() => document.querySelector('#modal-backdrop [data-action=close]')?.click());
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/desktop-hud-140.png` });
// 同一個頁面重新載入：change 事件已經 save() 到 localStorage，載入時 applySettings() 要套回 140%
await page.reload({ waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.waitForTimeout(2500);
ok('scale survives a reload', await page.evaluate(() => document.documentElement.dataset.uiScale) === '1.4');
await b.close();
console.log(fails.length ? `\n${fails.length} FAIL` : '\nall passed');
process.exit(fails.length ? 1 : 0);
