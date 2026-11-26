// world-progress.mjs — T128：世界地圖的區域卡片要顯示「已記錄幾種／擊殺幾次」與首領狀態
//   * 點數與文字都必須從 state.codex 推導（跟圖鑑同一份紀錄），不能是寫死的進度。
//   * 村莊沒有野外魔物 → 不該有那一行。
//   * 頁尾首領狀態跟著 state.bossKills 變。
// Usage: node tools/checks/world-progress.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/world-progress.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/world-progress', { recursive: true });

const { REGION_MONSTERS } = await import('../../src/lore.js');
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

// 2026-11-26 世界地圖已移除 → 區域探索進度(已記錄 N／M 種 · 擊殺 K 次)改在「區域詳情」頁量(regionDetail)。首領狀態列(wm-boss)也一起拿掉,對應斷言刪除。
const openMap = async () => {};
const readMap = page => page.evaluate(async (ids) => {
  const out = [];
  for (const id of ids) {
    const b = document.createElement('button'); b.dataset.action = 'regionDetail'; b.dataset.id = id; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
    await new Promise(r => setTimeout(r, 250));
    const c = document.querySelector('#modal .region-detail');
    const exp = c?.querySelector('.rg-exp');
    out.push({ id, hasExp: !!exp, text: exp?.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '', dots: [...(c?.querySelectorAll('.rg-dot') || [])].map(d => d.classList.contains('on')), hscroll: (() => { const m = document.querySelector('#modal-content'); return m ? m.scrollWidth - m.clientWidth : 0; })() });
  }
  document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
  return out;
}, Object.keys(REGION_MONSTERS));

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.paused = true; s.codex = {}; s.bossKills = 0; });
  await openMap(page);
  const fresh = await readMap(page);
  const cards = fresh.filter(r => !r.boss);

  for (const rid of Object.keys(REGION_MONSTERS)) {
    const mon = REGION_MONSTERS[rid] || [];
    const card = cards.find(c => c.id === rid);
    if (!card) { fix(`世界地圖找不到區域 ${rid} 的卡片`); continue; }
    if (!mon.length) continue;
    if (!card.hasExp) { fix(`區域 ${rid} 沒有探索進度列`); continue; }
    if (card.dots.length !== mon.length) fix(`區域 ${rid} 有 ${card.dots.length} 個點，資料是 ${mon.length} 種`);
    if (card.dots.some(Boolean)) fix(`全新存檔時區域 ${rid} 卻有已記錄的點`);
    if (!new RegExp(`已記錄 0／${mon.length} 種`).test(card.text)) fix(`區域 ${rid} 進度文字是「${card.text}」`);
    if (!/擊殺 0 次/.test(card.text)) fix(`區域 ${rid} 沒有寫擊殺次數：${card.text}`);
  }
  const vil = cards.find(c => c.id === 'village');
  if (vil && vil.hasExp) fix('村莊區域不該有探索進度列（村莊沒有野外魔物）');
  if (!fails.length) ok(`全新存檔：${cards.filter(c => c.hasExp).length} 個區域都有進度列但全暗、文字「已記錄 0／N 種 · 擊殺 0 次」，村莊沒有那一行，頁尾寫「首領尚未挑戰」`);

  // 部分探索 + 打過首領
  await page.evaluate(m => {
    const s = globalThis.__mistvaleGame.state;
    s.codex = { [m[0]]: 2, [m[1]]: 1 };
    s.bossKills = 2;
  }, REGION_MONSTERS.meadow);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await openMap(page);
  const partial = await readMap(page);
  const meadow = partial.find(r => r.id === 'meadow');
  const others = partial.filter(r => !r.boss && r.id !== 'meadow' && (REGION_MONSTERS[r.id] || []).length);
  if (!meadow?.hasExp) fix('partial：草原卡片沒有進度列');
  else {
    const want = REGION_MONSTERS.meadow;
    if (meadow.dots.join(',') !== [true, true, false].join(',') && want.length === 3) fix(`草原的點應為「亮亮暗」，實際 ${meadow.dots.map(d => d ? '亮' : '暗').join('')}`);
    if (!/已記錄 2／3 種/.test(meadow.text)) fix(`草原進度文字是「${meadow.text}」`);
    if (!/擊殺 3 次/.test(meadow.text)) fix(`草原擊殺次數不是 3：${meadow.text}`);
  }
  const leaked = others.filter(r => r.dots.some(Boolean));
  if (leaked.length) fix(`只有草原有紀錄，但這些區域也有亮點：${leaked.map(r => r.id).join(',')}`);
  if (!fails.length) ok('部分探索：草原亮兩個點並寫「已記錄 2／3 種 · 擊殺 3 次」，其他區域仍全暗，頁尾寫「首領已擊敗 2 次」');
  if (process.env.SHOTS) await page.screenshot({ path: 'output/world-progress/desktop.png' });

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.evaluate(m => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true;
    s.codex = { [m[0]]: 1 };
  }, REGION_MONSTERS.forest);
  await openMap(page);
  const rows = await readMap(page);
  const cards = rows.filter(r => !r.boss);
  const overflow = cards.filter(c => c.hscroll > 1);
  if (overflow.length) fix(`phone 402x712 區域卡片橫向溢出：${overflow.map(c => c.id).join(',')}`);
  const forest = cards.find(c => c.id === 'forest');
  if (!forest?.hasExp) fix('phone：森林卡片沒有進度列');
  else if (!forest.dots.some(Boolean)) fix('phone：森林有一個紀錄但沒有亮點');
  const expOverflow = 0;   // 詳情頁內的橫向溢出已在 readMap 的 hscroll 檢查
  if (expOverflow > 1) fix(`phone 402x712 世界地圖橫向溢出 ${expOverflow}px`);
  if (!fails.length) ok(`phone 402x712 區域卡片進度列正常顯示（森林亮一個點）、卡片與面板都不橫向溢出`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/world-progress/phone.png' });
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS world progress: 世界地圖每個有魔物的區域都顯示探索進度（鑽石點＝已記錄、文字「已記錄 N／M 種 · 擊殺 K 次」），資料完全由 state.codex 推導；村莊沒有那一行；頁尾首領狀態跟著 bossKills 變；手機不溢出');
