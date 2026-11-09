// settings-groups.mjs — T115：設定面板分區（畫面與效能／手感與聲音／操控與教學／存檔與資料）
//   以及隊員卡的稀有度色條（.party-pick::before 跟著 RARITIES 顏色）。
//   * 分區只是版面資訊架構，但很容易在改行時把某一列留在外面，或把摘要寫成錯的區。
//   * 稀有度色條是新顏色語言，要確認六位獵人真的拿到不同顏色，而不是全部 fallback。
// Usage: node tools/checks/settings-groups.mjs       (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/settings-groups.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/t115', { recursive: true });

const SECS = ['perf', 'feel', 'control', 'data'];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  return { ctx, page, errs };
}

// 用假的按鈕點開彈窗（不依賴 #bottom-bar 的可見狀態）
const openModal = (page, action) => page.evaluate(async a => {
  const b = document.createElement('button'); b.dataset.action = a; b.style.display = 'none';
  document.body.append(b); b.click(); b.remove();
  await new Promise(r => setTimeout(r, 450));
}, action);

const readSettings = page => page.evaluate(() => {
  const content = document.querySelector('#modal-content');
  const secs = [...content.querySelectorAll('.set-sec')].map(s => ({
    key: s.dataset.sec || '',
    title: s.querySelector('.set-sec-h span')?.textContent || '',
    summary: s.querySelector('.set-sec-h small')?.textContent?.trim() || '',
    rows: s.querySelectorAll('.setting-row').length,
    headerRect: (() => { const r = s.querySelector('.set-sec-h')?.getBoundingClientRect(); return r ? { w: r.width, h: r.height } : null; })(),
  }));
  const allRows = content.querySelectorAll('.setting-row').length;
  const rowInside = [...content.querySelectorAll('.setting-row')].filter(r => r.closest('.set-sec')).length;
  return {
    secs, allRows, rowInside,
    hscroll: content.scrollWidth - content.clientWidth,
    contentW: content.clientWidth,
  };
});

// ── desktop ─────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  await openModal(page, 'settings');
  // 展開畫質群組，讓所有列都在 DOM 裡
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-action="toggleQuality"]')].find(x => x.offsetParent); if (b && b.textContent.includes('調整')) b.click(); });
  await page.waitForTimeout(300);

  const s1 = await readSettings(page);
  if (s1.secs.length !== 4) fix(`desktop 設定面板有 ${s1.secs.length} 個分區，預期 4（畫面與效能／手感與聲音／操控與教學／存檔與資料）`);
  const keys = s1.secs.map(s => s.key);
  if (keys.join(',') !== SECS.join(',')) fix(`desktop 分區順序 ${keys.join(',')}，預期 ${SECS.join(',')}`);
  for (const s of s1.secs) {
    if (!s.title) fix(`desktop 分區 ${s.key} 沒有標題`);
    if (!s.summary) fix(`desktop 分區 ${s.key} 沒有摘要小字`);
    if (!s.headerRect || s.headerRect.h < 10) fix(`desktop 分區 ${s.key} 標題沒有高度（被壓扁？）`);
  }
  const perf = s1.secs.find(s => s.key === 'perf'), feel = s1.secs.find(s => s.key === 'feel');
  if (perf && /音效|震動/.test(perf.summary)) fix(`desktop「畫面與效能」摘要混進震動／音效：${perf.summary}`);
  if (perf && !/畫質/.test(perf.summary)) fix(`desktop「畫面與效能」摘要沒有畫質：${perf.summary}`);
  if (feel && !/震動/.test(feel.summary)) fix(`desktop「手感與聲音」摘要沒有震動：${feel.summary}`);
  if (feel && !/音效/.test(feel.summary)) fix(`desktop「手感與聲音」摘要沒有音效：${feel.summary}`);
  if (s1.rowInside !== s1.allRows) fix(`desktop 有 ${s1.allRows - s1.rowInside} 列設定落在分區外（共 ${s1.allRows} 列）`);
  if (s1.allRows < 8) fix(`desktop 只量到 ${s1.allRows} 列設定，展開後應該更多`);
  if (s1.hscroll > 1) fix(`desktop 設定面板橫向溢出 ${s1.hscroll}px`);
  ok(`desktop 設定分區 ${s1.secs.map(s => s.title).join(' / ')}；${s1.allRows} 列全部落在分區內`);

  // 摘要會跟著設定變：把鏡頭震動關掉
  const before = feel ? feel.summary : '';
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-action="setOpt"][data-key="shake"]')].find(x => x.dataset.value === '0' && x.offsetParent);
    if (b) b.click();
  });
  await page.waitForTimeout(350);
  const s2 = (await readSettings(page)).secs.find(s => s.key === 'feel');
  if (!s2) fix('desktop 切換震動後找不到「手感與聲音」分區');
  else if (!/震動 關/.test(s2.summary)) fix(`desktop 關掉震動後摘要沒更新：${s2.summary}（原本 ${before}）`);
  else ok(`desktop 摘要跟著設定走（${before} → ${s2.summary}）`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/t115/settings-1440x900.png' });

  // 隊員卡的稀有度色條
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.buildings.dungeon = 3; });
  await openModal(page, 'dispatchHunters');
  await page.waitForTimeout(300);
  const picks = await page.evaluate(() => [...document.querySelectorAll('.party-pick')].map(el => {
    const cs = getComputedStyle(el, '::before');
    const r = el.getBoundingClientRect();
    return {
      rarity: el.dataset.rarity || '',
      bar: cs.backgroundColor || '',
      barW: parseFloat(cs.width) || 0,
      name: el.querySelector('.pp-name')?.textContent || '',
      w: Math.round(r.width),
    };
  }));
  const missing = picks.filter(p => !p.rarity || !p.bar || p.bar === 'rgba(0, 0, 0, 0)');
  if (!picks.length) fix('desktop 派遣面板沒有隊員卡');
  if (missing.length) fix(`desktop ${missing.length} 張隊員卡沒有稀有度色條（${missing.map(m => m.name + ':' + m.rarity).join(',')}）`);
  const colours = new Set(picks.map(p => p.bar));
  if (picks.length >= 3 && colours.size < 3) fix(`desktop 隊員卡稀有度色條只有 ${colours.size} 種顏色（${[...colours].join(' / ')}），應該跟著 5 級稀有度`);
  const thin = picks.filter(p => p.barW < 2);
  if (thin.length) fix(`desktop ${thin.length} 張隊員卡色條太細（${thin.map(t => t.barW + 'px').join(',')}）`);
  if (!missing.length && colours.size >= 3) ok(`desktop 隊員卡稀有度色條 ${colours.size} 種顏色（${picks.length} 張卡、${Math.round(picks[0].w)}px 寬）`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/t115/dispatch-1440x900.png' });

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await openModal(page, 'settings');
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-action="toggleQuality"]')].find(x => x.offsetParent); if (b && b.textContent.includes('調整')) b.click(); });
  await page.waitForTimeout(300);
  const s = await readSettings(page);
  if (s.secs.length !== 4) fix(`phone 402x712 設定面板有 ${s.secs.length} 個分區，預期 4`);
  if (s.hscroll > 1) fix(`phone 402x712 設定面板橫向溢出 ${s.hscroll}px`);
  const flat = s.secs.filter(x => !x.headerRect || x.headerRect.h < 10);
  if (flat.length) fix(`phone 402x712 分區標題被壓扁：${flat.map(f => f.key).join(',')}`);
  if (s.rowInside !== s.allRows) fix(`phone 402x712 有 ${s.allRows - s.rowInside} 列設定落在分區外`);
  if (!flat.length && s.secs.length === 4 && s.hscroll <= 1) ok(`phone 402x712 分區 ${s.secs.length} 個、${s.allRows} 列全在分區內、無橫向溢出、標題都有高度`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/t115/settings-402x712.png' });

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
console.log('PASS settings groups: 設定面板分成畫面與效能／手感與聲音／操控與教學／存檔與資料四區，每列都落在分區內、摘要跟著設定更新；派遣隊員卡的稀有度色條跟著 RARITIES 顏色，桌機與手機都不溢出');
