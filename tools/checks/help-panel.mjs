// help-panel.mjs — T124：說明面板分段（核心循環／操作／獵人／設施／村外）
//   * 設施用途要從 BUILDINGS 推導，所以數量、名稱、作用都要跟資料對得上。
//   * 「重看開場」要真的能開回 T121 的入門嚮導。
// Usage: node tools/checks/help-panel.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/help-panel.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
// 直接讀遊戲的建築表，驗「說明面板的設施表」跟資料一致
let BUILDINGS = [];
try { ({ BUILDINGS } = await import('../../src/pixel-data.js')); } catch (e) { console.log('note: 無法載入 pixel-data.js，改用寬鬆檢查'); }
if (process.env.SHOTS) fs.mkdirSync('output/help', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const b = document.createElement('button'); b.dataset.action = 'help'; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
    await new Promise(r => setTimeout(r, 450));
  });
  return { ctx, page, errs };
}

const readHelp = page => page.evaluate(() => {
  const c = document.querySelector('#modal-content');
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const buildingIds = globalThis.__mistvaleBuildings?.length || 0;
  return {
    title: txt(c.querySelector('.encounter-banner h3')),
    sections: [...c.querySelectorAll('.help-sec')].map(s => ({
      head: txt(s.querySelector('.help-h')),
      bullets: s.querySelectorAll('.help-list li').length,
      keys: [...s.querySelectorAll('.hk-row')].map(k => ({ k: txt(k.querySelector('dt')), d: txt(k.querySelector('dd')) })),
      facilities: [...s.querySelectorAll('.hf-item')].map(f => ({ id: f.dataset.id, n: txt(f.querySelector('b')), e: txt(f.querySelector('small')) })),
    })),
    steps: [...c.querySelectorAll('.hl-step')].map(s => ({ num: txt(s.querySelector('.hl-num')), t: txt(s.querySelector('.hl-body strong')), d: txt(s.querySelector('.hl-body small')) })),
    arrows: c.querySelectorAll('.hl-arrow').length,
    gesture: (c.querySelector('.help-list li') || {}).textContent || '',
    foot: { text: txt(c.querySelector('.help-foot small')), btn: txt(c.querySelector('.help-foot .pixel-button')) },
    hscroll: c.scrollWidth - c.clientWidth,
    buildingIds,
  };
});

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const h = await readHelp(page);

  if (!/新手說明/.test(h.title)) fix(`說明面板標題是「${h.title}」，預期含新手說明`);
  if (h.hscroll > 1) fix(`desktop 說明面板橫向溢出 ${h.hscroll}px`);

  // 核心循環：4 步 + 3 個箭頭
  if (h.steps.length !== 4) fix(`核心循環有 ${h.steps.length} 步，預期 4 步`);
  if (h.steps.map(s => s.num).join('') !== '1234') fix(`核心循環編號是 ${h.steps.map(s => s.num).join('')}，預期 1234`);
  if (h.arrows !== 3) fix(`核心循環有 ${h.arrows} 個箭頭，預期 3 個`);
  if (h.steps.some(s => s.t.length < 2 || s.d.length < 2)) fix('核心循環有步驟缺少標題或說明');

  // 分段
  const heads = h.sections.map(s => s.head);
  for (const want of ['基本操作', '獵人的一天', '村莊設施與用途', '村外內容']) {
    if (!heads.some(t => t.includes(want))) fix(`缺少「${want}」分段（現有：${heads.join(' / ')}）`);
  }
  const ops = h.sections.find(s => s.head.includes('基本操作'));
  if (ops) {
    if (ops.bullets < 2) fix(`基本操作只有 ${ops.bullets} 條重點`);
    if (ops.keys.length < 4) fix(`快捷鍵表只有 ${ops.keys.length} 列，預期至少 4 列`);
    const keyNames = ops.keys.map(k => k.k).join(' ');
    for (const k of ['Space', 'M', 'Esc']) if (!keyNames.includes(k)) fix(`快捷鍵表缺少 ${k}（現有：${keyNames}）`);
    if (!/1 – 7|1-7/.test(keyNames)) fix(`快捷鍵表缺少 1–7 面板鍵（現有：${keyNames}）`);
    if (!/拖曳/.test(h.gesture) || !/縮放/.test(h.gesture)) fix(`滑鼠操作說明沒寫拖曳／縮放：${h.gesture.slice(0, 40)}`);
  }

  // 設施表要跟 BUILDINGS 對得上
  const fac = h.sections.find(s => s.head.includes('村莊設施'));
  if (!fac) fix('找不到村莊設施分段');
  else {
    if (BUILDINGS.length) {
      if (fac.facilities.length !== BUILDINGS.length) fix(`設施表 ${fac.facilities.length} 項，BUILDINGS 有 ${BUILDINGS.length} 項`);
      const missing = BUILDINGS.filter(b => !fac.facilities.some(f => f.id === b.id)).map(b => b.id);
      if (missing.length) fix(`設施表缺少 ${missing.join(',')}`);
      const wrongEff = BUILDINGS.filter(b => { const f = fac.facilities.find(x => x.id === b.id); return f && f.e !== (b.effect || b.desc || ''); }).map(b => b.id);
      if (wrongEff.length) fix(`設施作用文字與資料不同：${wrongEff.join(',')}`);
    } else if (fac.facilities.length < 8) fix(`設施表只有 ${fac.facilities.length} 項，看起來不完整`);
    const bad = fac.facilities.filter(f => !f.n || !f.e);
    if (bad.length) fix(`有 ${bad.length} 項設施沒有寫名稱或作用：${bad.map(b => b.id).join(',')}`);
    const names = fac.facilities.map(f => f.n).join(' ');
    for (const n of ['餐廳', '旅館', '鐵匠鋪', '復活聖所']) if (!names.includes(n)) fix(`設施表缺少 ${n}`);
  }

  if (!/重看開場/.test(h.foot.btn)) fix(`說明頁尾沒有「重看開場」按鈕（現有：${h.foot.btn}）`);

  // 重看開場 → 真的打開入門嚮導
  await page.evaluate(() => document.querySelector('.help-foot [data-action="welcomeReplay"]')?.click());
  await page.waitForTimeout(500);
  const reopened = await page.evaluate(() => ({
    type: document.querySelector('#modal')?.dataset.type || '',
    steps: document.querySelectorAll('#modal-content .welcome-step').length,
  }));
  if (reopened.type !== 'welcome') fix(`按「重看開場」後開啟的是 ${reopened.type || '(沒有)'}，預期 welcome`);
  else if (reopened.steps !== 3) fix(`重看開場的嚮導有 ${reopened.steps} 步，預期 3 步`);
  else ok('說明面板的分段與設施表都跟資料對得上，按「重看開場」會開回入門嚮導');

  if (process.env.SHOTS) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-action="help"]')?.click());
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'output/help/desktop.png' });
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const h = await readHelp(page);
  if (h.hscroll > 1) fix(`phone 402x712 說明面板橫向溢出 ${h.hscroll}px`);
  if (h.steps.length !== 4) fix(`phone 核心循環有 ${h.steps.length} 步，預期 4 步`);
  const stack = await page.evaluate(() => {
    const xs = [...document.querySelectorAll('#modal-content .hl-step')].map(s => Math.round(s.getBoundingClientRect().x));
    const arrows = [...document.querySelectorAll('#modal-content .hl-arrow')].map(a => getComputedStyle(a).flexDirection);
    const btn = document.querySelector('.help-foot .pixel-button')?.getBoundingClientRect();
    return { xs, uniq: [...new Set(xs)].length, arrowH: arrows.length, btnH: btn ? Math.round(btn.height) : 0 };
  });
  if (stack.uniq > 1) fix(`phone 核心循環沒有直向排列（左緣有 ${stack.uniq} 個 x）`);
  if (stack.btnH && stack.btnH < 28) fix(`phone 重看開場按鈕只有 ${stack.btnH}px 高`);
  if (!/單指|雙指/.test(h.gesture)) fix(`phone 手勢說明沒寫單指／雙指：${h.gesture.slice(0, 40)}`);
  if (!fails.length) ok(`phone 402x712 核心循環直向排列、手勢說明換成單指／雙指、不橫向溢出（按鈕 ${stack.btnH}px）`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/help/phone.png' });
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
console.log('PASS help panel: 說明面板分成核心循環／基本操作／獵人的一天／村莊設施／村外內容五段，設施用途由 BUILDINGS 推導、快捷鍵表完整、可按「重看開場」叫回入門嚮導，手機直向排列不溢出');
