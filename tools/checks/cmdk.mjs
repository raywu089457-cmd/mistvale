// 指令面板檢查：Ctrl/⌘+K 開啟、過濾、Enter 進面板、Esc 關閉。
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
const page = await ctx.newPage();
const fails = [];
await page.goto(URL, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.waitForTimeout(1500);

const visible = () => page.evaluate(() => !!document.querySelector('#cmdk'));
const count = () => page.evaluate(() => document.querySelector('#cmdk .cmdk-list')?.dataset.count || '0');

// 1. 開啟
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
if (!(await visible())) fails.push('Ctrl+K 沒有開啟指令面板');
else if ((await count()) !== '14') fails.push(`清單應有 14 筆，實際 ${await count()}`);

// 2. 過濾
await page.keyboard.type('委託');
await page.waitForTimeout(150);
const filtered = await count();
if (filtered !== '1') fails.push(`輸入「委託」應剩 1 筆，實際 ${filtered}`);

// 3. Enter 進面板
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const title = await page.evaluate(() => document.querySelector('#modal-title')?.textContent?.trim() || '');
if (title !== '村長委託') fails.push(`Enter 後應開啟村長委託，實際「${title}」`);
if (await visible()) fails.push('進面板後指令面板沒有關閉');

// 4. Esc 關閉（面板也關）
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
if (!(await visible())) fails.push('第二次 Ctrl+K 沒有開啟');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
if (await visible()) fails.push('Esc 沒有關閉指令面板');

// 5. 方向鍵選擇
await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(150);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
const selIdx = await page.evaluate(() => [...document.querySelectorAll('#cmdk .cmdk-row')].findIndex((r) => r.classList.contains('sel')));
if (selIdx !== 2) fails.push(`↓↓ 後選中索引應為 2，實際 ${selIdx}`);
await page.keyboard.press('Escape');

await browser.close();
if (fails.length) { console.log('FAIL'); for (const f of fails) console.log(' -', f); process.exit(1); }
console.log('PASS 指令面板：開啟／過濾／Enter 進面板／Esc／方向鍵');
