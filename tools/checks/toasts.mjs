// toasts.mjs — T116：訊息卡片化（圖示＋語意色＋滑入／淡出）
//   * 以前 toast 只是一行純文字（置中、沒有種類），玩家分不出「獲得獎勵」「升級」「失敗」。
//   * 現在每則是深色卡片：左側 4px 語意色條＋圖示（獎勵金幣／升級號角／委託卷軸／失敗骷髏／一般打勾）。
//   * 這支檢查器量：五種語意色與圖示、文字推斷種類、同時最多 4 則、3 秒後自動收起、
//     進場動畫（減少動態時關閉）、手機不蓋住右側浮動鈕。
// Usage: node tools/checks/toasts.mjs        (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/toasts.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

import { startServer } from './fix-a-lib.mjs';
const srv = await startServer();   // 沒設 TARGET(例如 verify.mjs 呼叫)→ 自己開臨時伺服器讀剛建好的版本
process.on('exit', () => srv.stop());
const URL = process.env.TARGET || (srv.url + '?preview=1');
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/toasts', { recursive: true });

const ICON = { reward: 'gold', level: 'horn', quest: 'scroll', error: 'skull' };
const COLOURS = { ok: '#8ebc5e', reward: '#e7be5e', level: '#f2c96a', quest: '#cfae6a', error: '#e0705f' };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW', ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

const readToasts = page => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => {
  const cs = getComputedStyle(t);
  const r = t.getBoundingClientRect();
  return {
    kind: t.dataset.kind || '',
    tk: (t.style.getPropertyValue('--tk') || '').trim(),
    txt: t.querySelector('.toast-tx')?.textContent || '',
    role: t.getAttribute('role') || '',
    // 2026-11-11:圖示渲染從 <canvas> 改成 <img class="ui-ico" data-type=名稱>(setIcons);檢查要防的是「語意種類帶對應的圖集圖示、不是打勾字」,所以改量 data-type
    iconCanvas: !!t.querySelector('.toast-ic canvas'),
    iconType: t.querySelector('.toast-ic img.ui-ico')?.dataset.type || '',
    check: t.querySelector('.toast-check')?.textContent || '',
    borderLeft: parseFloat(cs.borderLeftWidth) || 0,
    borderColour: cs.borderLeftColor,
    animation: cs.animationName,
    opacity: parseFloat(cs.opacity),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
  };
}));

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  const live = await page.evaluate(() => document.querySelector('#toasts')?.getAttribute('aria-live') || '');
  if (live !== 'polite') fix(`#toasts aria-live=${live || '(空)'}，應為 polite`);
  if (!(await page.evaluate(() => typeof globalThis.__toast === 'function'))) fix('找不到 __toast 除錯鉤子');

  // 五種語意：顏色、圖示、文字
  for (const [kind, text, glyph] of [
    ['ok', '村莊一切正常', '✓'],
    ['reward', '獲得 金幣 120、獸皮 3', ''],
    ['level', '莉雅 升級了！Lv.6', ''],
    ['quest', '委託完成：清除草原狼群', ''],
    ['error', '金幣不足，還缺 240', ''],
  ]) {
    await page.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
    await page.evaluate(({ text, kind }) => globalThis.__toast(text, kind !== 'error', kind), { text, kind });
    await page.waitForTimeout(120);
    const list = await readToasts(page);
    if (list.length !== 1) { fix(`${kind} 只丟一則訊息卻出現 ${list.length} 則`); continue; }
    const t = list[0];
    if (t.kind !== kind) fix(`${kind} 訊息 data-kind=${t.kind}`);
    if (t.txt !== text) fix(`${kind} 訊息文字被改：${t.txt}`);
    if (t.tk.toLowerCase() !== COLOURS[kind]) fix(`${kind} 語意色 ${t.tk}，預期 ${COLOURS[kind]}`);
    if (t.borderLeft < 3) fix(`${kind} 左側語意色條只有 ${t.borderLeft}px`);
    if (t.role !== 'status') fix(`${kind} 訊息沒有 role=status`);
    if (glyph ? t.check !== glyph : (t.iconType !== ICON[kind] && !t.iconCanvas)) fix(`${kind} 訊息圖示不對（check=${t.check} icon=${t.iconType || (t.iconCanvas ? 'canvas' : '無')}，預期 ${ICON[kind]}）`);
  }
  ok('五種語意訊息（一般／獎勵／升級／委託／失敗）都有對應色條、圖示與 role=status');

  // 文字推斷：不指定 kind 時，靠內容選種類
  const derived = await page.evaluate(async () => {
    const box = document.querySelector('#toasts');
    const out = {};
    for (const [msg, ok2] of [['獲得 金幣 88', true], ['莉雅 升級了！Lv.9', true], ['委託完成：巡視道路', true], ['金幣不足', false], ['村莊一切正常', true]]) {
      box.innerHTML = '';
      globalThis.__toast(msg, ok2);
      await new Promise(r => setTimeout(r, 40));
      out[msg] = box.querySelector('.toast')?.dataset.kind || '';
    }
    box.innerHTML = '';
    return out;
  });
  const want = { '獲得 金幣 88': 'reward', '莉雅 升級了！Lv.9': 'level', '委託完成：巡視道路': 'quest', '金幣不足': 'error', '村莊一切正常': 'ok' };
  for (const [msg, k] of Object.entries(want)) if (derived[msg] !== k) fix(`文字「${msg}」推斷成 ${derived[msg] || '(空)'}，預期 ${k}`);
  ok('不指定種類時會從文字推斷（金幣→獎勵、升級→升級、委託→委託、失敗→錯誤、其餘→一般）');

  // 進場動畫
  const anim = await page.evaluate(async () => {
    document.querySelector('#toasts').innerHTML = '';
    globalThis.__toast('動畫測試', true, 'ok');
    await new Promise(r => setTimeout(r, 30));
    const t = document.querySelector('#toasts .toast');
    const a = getComputedStyle(t).animationName;
    await new Promise(r => setTimeout(r, 400));
    return { a, opacity: parseFloat(getComputedStyle(t).opacity) };
  });
  if (anim.a !== 'toastIn') fix(`訊息進場動畫 ${anim.a}，預期 toastIn`);
  if (anim.opacity < 0.99) fix(`訊息進場後 opacity=${anim.opacity}，應該完全不透明`);
  if (anim.a === 'toastIn' && anim.opacity >= 0.99) ok('訊息會滑入並停在完全不透明');

  // 同時最多 4 則（舊的優先擠掉）
  const cap = await page.evaluate(async () => {
    const box = document.querySelector('#toasts');
    box.innerHTML = '';
    for (let i = 1; i <= 6; i++) globalThis.__toast('訊息 ' + i, true, 'ok');
    await new Promise(r => setTimeout(r, 80));
    return [...box.querySelectorAll('.toast .toast-tx')].map(t => t.textContent);
  });
  if (cap.length !== 4) fix(`連丟 6 則後畫面上有 ${cap.length} 則，應為 4 則`);
  if (cap.join('|') !== '訊息 3|訊息 4|訊息 5|訊息 6') fix(`保留的訊息不對：${cap.join(' / ')}`);
  if (cap.length === 4 && cap[0] === '訊息 3') ok('同時最多 4 則，超過時擠掉最舊的');

  if (process.env.SHOTS) {
    await page.evaluate(() => {
      const box = document.querySelector('#toasts'); box.innerHTML = '';
      globalThis.__toast('獲得 金幣 120、獸皮 3', true, 'reward');
      globalThis.__toast('莉雅 升級了！Lv.6', true, 'level');
      globalThis.__toast('委託完成：清除草原狼群', true, 'quest');
      globalThis.__toast('金幣不足，還缺 240', false, 'error');
    });
    await page.waitForTimeout(350);
    await page.screenshot({ path: 'output/toasts/desktop.png' });
  }

  // 3 秒後自動收起（含淡出）
  await page.waitForTimeout(3600);
  const left = await page.evaluate(() => document.querySelectorAll('#toasts .toast').length);
  if (left !== 0) fix(`訊息 3.6 秒後還有 ${left} 則沒收起`);
  else ok('訊息約 3 秒後自動淡出收起');

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 減少動態 ────────────────────────────────────────────
{
  const { ctx, page } = await boot({ width: 1440, height: 900 }, 1, { reducedMotion: 'reduce' });
  const a = await page.evaluate(async () => {
    globalThis.__toast('減少動態測試', true, 'ok');
    await new Promise(r => setTimeout(r, 60));
    return getComputedStyle(document.querySelector('#toasts .toast')).animationName;
  });
  if (a !== 'none') fix(`prefers-reduced-motion 下訊息動畫仍是 ${a}`);
  else ok('prefers-reduced-motion 下訊息不動畫');
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await page.evaluate(() => {
    globalThis.__toast('獲得 金幣 120、獸皮 3', true, 'reward');
    globalThis.__toast('金幣不足，還缺 240', false, 'error');
  });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const list = [...document.querySelectorAll('#toasts .toast')].map(t => t.getBoundingClientRect());
    const vw = innerWidth;
    const covered = [];
    for (const a of ['pause', 'speed']) {
      const b = document.querySelector(`[data-action="${a}"]`);
      if (!b) continue;
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!(top === b || b.contains(top))) covered.push(a);
    }
    return { rects: list.map(r => ({ x: r.x, right: r.right, w: r.width })), vw, covered };
  });
  if (!info.rects.length) fix('phone 402x712 沒有出現訊息卡片');
  const over = info.rects.filter(r => r.x < 0 || r.right > info.vw + 1);
  if (over.length) fix(`phone 402x712 訊息超出畫面：${JSON.stringify(over)}`);
  if (info.covered.length) fix(`phone 402x712 訊息蓋住浮動鈕：${info.covered}`);
  if (info.rects.length && !over.length && !info.covered.length) ok(`phone 402x712 ${info.rects.length} 則訊息在畫面內、${Math.round(info.rects[0].w)}px 寬，浮動鈕仍可點`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/toasts/phone.png' });
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close(); srv.stop();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS toasts: 訊息是深色卡片（左側語意色條＋圖示）、五種種類與文字推斷都正確、滑入動畫、同時最多 4 則、3 秒自動收起、減少動態時不動畫、手機不超出也不蓋浮動鈕');
