// T162 驗收：首領面板要有「我方 vs 首領」戰力對比、參戰名單、說明文字(限時)，且主按鈕不用捲動就點得到
// 2026-11-11:首領戰是即時戰鬥,面板刻意不再估算「幾輪」→ 這一條改查現在的不變量:說明文字存在且寫明「限時」。
// 沒給 TARGET 時自己在 127.0.0.1 開一台臨時 server.mjs(跟 map-labels.mjs 一樣),所以 verify:quick 也能跑。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let server = null, URL = process.env.TARGET;
if (!URL) {
  const PORT = 5900 + Math.floor(Math.random() * 300);
  server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore' });
  URL = `http://127.0.0.1:${PORT}/?preview=1`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL.replace(/\?.*/, ''))).ok) break; } catch { } await new Promise(r => setTimeout(r, 200)); }
}
const VIEWS = [
  { name: 'desktop 1440x900', width: 1440, height: 900, mobile: false },
  { name: 'phone 402x712', width: 402, height: 712, mobile: true },
];
let fails = 0, oks = 0;
const fix = m => { fails++; console.log('FIX ' + m); };
const ok = m => { oks++; console.log('ok  ' + m); };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
for (const v of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: v.mobile, isMobile: v.mobile, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  try {
    await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector('#title-screen')?.remove());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-action="boss"]')?.click());
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const g = globalThis.__mistvaleGame;
      const alive = g.state.hunters.filter(h => h.hp > 0);
      const totalAtk = alive.reduce((n, h) => n + h.attack, 0);
      const q = s => document.querySelector(s);
      const face = [...document.querySelectorAll('#modal .bf-side b')].map(e => e.textContent.trim());
      const rows = [...document.querySelectorAll('#modal .bs-hunter')].map(e => [e.querySelector('b')?.textContent.trim(), e.querySelector('img')?.getAttribute('src')?.slice(0, 12)]);
      const btn = q('#modal [data-action="startBoss"]');
      const br = btn.getBoundingClientRect();
      const rounds = q('#modal .boss-rounds')?.textContent || '';
      return {
        alive: alive.length, totalAtk, face, rows, rounds,
        btnText: btn.textContent.trim(), btnVisible: br.height > 0 && br.top >= 0 && br.bottom <= innerHeight + 1,
        modalH: Math.round(q('#modal').getBoundingClientRect().height),
        maxHp: g.state.expedition.bossMaxHp,
      };
    });
    if (r.face.length !== 2) fix(`${v.name}: 戰力對比沒有兩邊（${r.face.length}）`);
    else if (Number(r.face[0]) !== r.alive) fix(`${v.name}: 我方人數 ${r.face[0]} ≠ 存活獵人 ${r.alive}`);
    else if (Number(r.face[1].replace(/,/g, '')) !== r.maxHp) fix(`${v.name}: 首領生命 ${r.face[1]} ≠ ${r.maxHp}`);
    else ok(`${v.name}: 戰力對比 我方 ${r.face[0]} 位（總攻擊 ${r.totalAtk}） vs 首領 ${r.face[1]}`);
    if (r.rows.length !== r.alive) fix(`${v.name}: 參戰名單 ${r.rows.length} 列 ≠ ${r.alive} 位`);
    else if (r.rows.some(x => !x[1])) fix(`${v.name}: 參戰名單有頭像沒載入`);
    else ok(`${v.name}: 參戰名單 ${r.rows.length} 位都有頭像`);
    if (!r.rounds.trim()) fix(`${v.name}: 首領面板沒有說明文字（.boss-rounds 空白或不存在）`);
    else if (r.alive > 0 && !/限時/.test(r.rounds)) fix(`${v.name}: 說明文字沒寫「限時」（${r.rounds.slice(0, 30)}）`);
    else ok(`${v.name}: 說明「${r.rounds.slice(0, 26)}」`);
    if (!r.btnVisible) fix(`${v.name}: 召喚按鈕不在第一屏（要不捲動就按得到）`);
    else ok(`${v.name}: 召喚按鈕在第一屏（${r.btnText}）`);
    if (errs.length) fix(`${v.name} 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
    await page.screenshot({ path: `output/boss-${v.mobile ? 'phone' : 'desktop'}.png` });
  } catch (e) {
    fix(`${v.name}: ${String(e).slice(0, 160)}`);
  }
  await ctx.close();
}
await browser.close();
server?.kill();
console.log(fails ? `FAIL ${fails} 項` : `PASS 首領面板：戰力對比、參戰名單、限時說明、主按鈕第一屏（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
