// day-clock.mjs — T134：頂部晝夜時鐘（第 N 天 · 白天/夜晚 · 這半天的進度）
//   * 顯示的白天／夜晚必須跟世界用的同一個相位（state.time % 240），不能自己另外算。
//   * 第 N 天要用 time 直接算，暫停或直接改 time 也要正確。
// Usage: node tools/checks/day-clock.mjs
//        $env:SHOTS='1'; node tools/checks/day-clock.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/dayclock', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsf = 1) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

const setTime = async (page, t) => {
  await page.evaluate(v => { const s = globalThis.__mistvaleGame.state; s.paused = true; s.time = v; }, t);
  await page.waitForTimeout(700);   // paint() 約 400ms 一次
};

const read = page => page.evaluate(() => {
  const el = document.querySelector('#day-clock');
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect(), tb = document.querySelector('#topbar').getBoundingClientRect();
  const dot = getComputedStyle(el.querySelector('.dc-dot'));
  const fillEl = document.querySelector('#day-fill');
  const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.closest('[data-action]')?.dataset.action || e.closest('[id]')?.id || e.tagName) : 'null'; };
  return {
    text: el.textContent.replace(/\s+/g, ' ').trim(),
    phase: document.querySelector('#day-phase')?.textContent.trim() || '',
    dayNum: document.querySelector('#day-num')?.textContent.trim() || '',
    aria: el.getAttribute('aria-label') || '', title: el.title || '',
    fill: parseFloat(fillEl?.style.width || '0'),
    night: el.classList.contains('night'),
    dotBg: dot.backgroundColor, dotShadow: dot.boxShadow,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    topbar: { x: Math.round(tb.x), y: Math.round(tb.y), w: Math.round(tb.width), h: Math.round(tb.height), sw: document.querySelector('#topbar').scrollWidth, cw: document.querySelector('#topbar').clientWidth },
    hitSelf: hit(r.x + r.width / 2, r.y + r.height / 2),
  };
});

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const cases = [
    { t: 240 * 2 + 30, day: 3, phase: '白天', pct: 25, kind: 'day' },
    { t: 240 * 2 + 90, day: 3, phase: '白天', pct: 75, kind: 'day' },
    { t: 240 * 2 + 150, day: 3, phase: '夜晚', pct: 25, kind: 'night' },
    { t: 240 * 2 + 210, day: 3, phase: '夜晚', pct: 75, kind: 'night' },
  ];
  for (const c of cases) {
    await setTime(page, c.t);
    const r = await read(page);
    if (r.missing) { fix('找不到 #day-clock'); break; }
    if (r.dayNum !== `第 ${c.day} 天`) fix(`time=${c.t} 時顯示「${r.dayNum}」，應為「第 ${c.day} 天」`);
    if (r.phase !== c.phase) fix(`time=${c.t} 時顯示「${r.phase}」，應為「${c.phase}」`);
    if (Math.abs(r.fill - c.pct) > 3) fix(`time=${c.t} 時進度條 ${r.fill}%，應為 ${c.pct}%`);
    if (r.night !== (c.kind === 'night')) fix(`time=${c.t} 時 .night 類別是 ${r.night}，應為 ${c.kind === 'night'}`);
    if (!new RegExp(`第 ${c.day} 天 · ${c.phase}，再`).test(r.aria)) fix(`time=${c.t} 的 aria-label 不對：${r.aria}`);
    if (!/(入夜|轉白天)/.test(r.title)) fix(`time=${c.t} 的 title 沒寫下一個時段：${r.title}`);
  }
  if (!fails.length) ok('四個時間點（白天 25%／75%、夜晚 25%／75%）的第 N 天、白天/夜晚、進度與 aria 都正確');

  // 白天 / 夜晚的燈號顏色要不同
  await setTime(page, 240 * 2 + 30);
  const dayDot = (await read(page)).dotBg;
  await setTime(page, 240 * 2 + 150);
  const nightDot = (await read(page)).dotBg;
  if (dayDot === nightDot) fix(`晝夜燈號顏色一樣：${dayDot}`);
  else ok(`燈號顏色跟著時段換（白天 ${dayDot} / 夜晚 ${nightDot}）`);

  // 時鐘不能蓋住其他 HUD，topbar 也不能溢出
  const geo = await read(page);
  if (geo.topbar.sw > geo.topbar.cw + 1) fix(`topbar 橫向溢出 ${geo.topbar.sw - geo.topbar.cw}px`);
  if (geo.rect.x < geo.topbar.x || geo.rect.x + geo.rect.w > geo.topbar.x + geo.topbar.w + 1) fix('時鐘超出 topbar 範圍');
  if (geo.rect.y + geo.rect.h > geo.topbar.y + geo.topbar.h + 1) fix('時鐘超出 topbar 高度，會壓到世界畫面');
  const overlaps = await page.evaluate(() => {
    const clk = document.querySelector('#day-clock').getBoundingClientRect();
    const bad = [];
    for (const b of document.querySelectorAll('#topbar button')) {
      const r = b.getBoundingClientRect();
      if (!r.width) continue;
      const ox = Math.min(clk.x + clk.width, r.x + r.width) - Math.max(clk.x, r.x);
      const oy = Math.min(clk.y + clk.height, r.y + r.height) - Math.max(clk.y, r.y);
      if (ox > 1 && oy > 1) bad.push(b.id || b.dataset.action || b.className);
    }
    return bad;
  });
  if (overlaps.length) fix(`時鐘與 topbar 按鈕重疊：${overlaps.join(',')}`);
  if (!overlaps.length && geo.topbar.sw <= geo.topbar.cw + 1) ok(`時鐘在 topbar 內（${geo.rect.w}×${geo.rect.h}）、不與任何按鈕重疊、topbar 不溢出`);

  // 跑起來會動（不是靜止的假時鐘）
  await page.evaluate(() => { globalThis.__mistvaleGame.state.time = 240 * 2 + 20; globalThis.__mistvaleGame.state.paused = false; });
  await page.waitForTimeout(600);
  const t0 = (await read(page)).fill;
  await page.waitForTimeout(1600);
  const t1 = (await read(page)).fill;
  if (!(t1 > t0)) fix(`時鐘進度沒有隨時間前進（${t0}% → ${t1}%）`);
  else ok(`時鐘會隨時間前進（進度 ${t0}% → ${t1}%）`);
  if (process.env.SHOTS) {
    await setTime(page, 240 * 2 + 30);
    await page.screenshot({ path: 'output/dayclock/desk-day.png', clip: { x: 0, y: 0, width: 1440, height: 110 } });
    await setTime(page, 240 * 2 + 150);
    await page.screenshot({ path: 'output/dayclock/desk-night.png', clip: { x: 0, y: 0, width: 1440, height: 110 } });
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await setTime(page, 240 * 2 + 150);
  const r = await read(page);
  if (r.missing) fix('phone 找不到 #day-clock');
  else {
    if (r.phase !== '夜晚') fix(`phone 夜晚時段顯示「${r.phase}」`);
    if (r.topbar.sw > r.topbar.cw + 1) fix(`phone topbar 橫向溢出 ${r.topbar.sw - r.topbar.cw}px`);
    if (r.rect.x + r.rect.w > 402 + 1) fix(`phone 時鐘超出畫面右緣（x ${r.rect.x}, w ${r.rect.w}）`);
    const clash = await page.evaluate(() => {
      const clk = document.querySelector('#day-clock').getBoundingClientRect();
      const out = [];
      for (const b of document.querySelectorAll('#topbar button')) {
        const r = b.getBoundingClientRect();
        if (!r.width) continue;
        const ox = Math.min(clk.x + clk.width, r.x + r.width) - Math.max(clk.x, r.x);
        const oy = Math.min(clk.y + clk.height, r.y + r.height) - Math.max(clk.y, r.y);
        if (ox > 1 && oy > 1) out.push(b.dataset.action || b.className);
      }
      return out;
    });
    if (clash.length) fix(`phone 時鐘與按鈕重疊：${clash.join(',')}`);
    if (!clash.length && r.topbar.sw <= r.topbar.cw + 1) ok(`phone 402x712 時鐘在畫面內（${r.rect.w}×${r.rect.h}）、不與按鈕重疊、topbar 不溢出`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/dayclock/phone-night.png', clip: { x: 0, y: 0, width: 402, height: 100 } });
  }
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
console.log('PASS day clock: 頂部時鐘顯示第 N 天與白天／夜晚，進度條跟著同一個世界相位走、會隨時間前進，晝夜燈號換色，桌機與手機都不與其他 HUD 重疊');
