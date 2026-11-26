// 驗收：面板重新打開時要回到最上面，但面板內操作（例如交易所數量）不能把捲動位置拉走
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
let fails = 0, oks = 0;
const fix = (m) => { fails++; console.log('FIX ' + m); };
const ok = (m) => { oks++; console.log('ok  ' + m); };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 402, height: 712 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'zh-TW' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
await page.waitForTimeout(1000);
const click = async (sel) => { await page.evaluate((s) => document.querySelector(s)?.click(), sel); await page.waitForTimeout(420); };
const openCodex = async () => { await page.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'codex'; b.style.display = 'none'; document.body.append(b); b.click(); b.remove(); }); await page.waitForTimeout(600); };   // 世界地圖已移除:圖鑑改用 data-action=codex(指令面板也有)
const scrollTop = () => page.evaluate(() => document.querySelector('#modal-content').scrollTop);
const setScroll = (v) => page.evaluate((y) => { document.querySelector('#modal-content').scrollTop = y; }, v);

await openCodex();
if (await scrollTop() !== 0) fix('剛打開圖鑑不是在最上面');
await setScroll(1800);
if (await scrollTop() < 1500) fix('圖鑑捲不到底部（測試前提不成立）');
await page.keyboard.press('Escape');
await page.waitForTimeout(420);
await openCodex();
const reopened = await scrollTop();
if (reopened !== 0) fix(`重新打開圖鑑還停在第 ${reopened}px（應該回到最上面）`);
else ok('重新打開圖鑑會回到最上面');

await page.keyboard.press('Escape');
await page.waitForTimeout(420);
await click('#bottom-bar [data-action="hunters"]');
const afterOther = await scrollTop();
if (afterOther !== 0) fix(`接著打開別的面板還帶著前一個面板的捲動（${afterOther}px）`);
else ok('換開別的面板也是從最上面開始');

// 面板內操作不能把捲動位置拉走（交易所改數量會重繪）
await page.keyboard.press('Escape');
await page.waitForTimeout(420);
await click('#bottom-bar [data-action="trade"]');
await setScroll(220);
await page.waitForTimeout(300);
const before = await scrollTop();
await page.evaluate(() => document.querySelector('.trade-row [data-action="tradeStep"][data-delta="10"]')?.click());
await page.waitForTimeout(500);
const after = await scrollTop();
if (before < 100) fix(`交易所捲不到 ${before}px（測試前提不成立）`);
else if (Math.abs(after - before) > 24) fix(`交易所改數量後捲動位置被拉走（${before} → ${after}）`);
else ok(`面板內操作不會把捲動位置拉走（${before} → ${after}）`);

if (errors.length) fix('頁面錯誤 ' + errors[0]);
await browser.close();
console.log(fails ? `FAIL ${fails} 項` : `PASS scroll reset: 重新打開面板回到最上面、換面板不繼承捲動、面板內操作不跳位（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
