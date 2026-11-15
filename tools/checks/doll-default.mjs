// doll-default.mjs — 預設就用分層紙娃娃呈現英雄、關得掉(?doll=0)的驗收。
//
// 這個檢查驗三件事:
//   1 沒有 ?doll 參數時,紙娃娃預設就是開的(all=true / ready=true),獵人真的由紙娃娃畫出來。
//   2 ?doll=0 時紙娃娃關閉,英雄照舊用烘好的 hero sheet 畫(有 drawnFacing 但沒有 .doll)。
//   3 兩種模式都沒有 page error / console.error,而且獵人數量一致(沒有因為換渲染而少畫人)。
//
// Exit 0 = PASS, 1 = FAIL(先列 FAIL,再一行總結)。用法:node tools/checks/doll-default.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as L from './fix-a-lib.mjs';

const fails = [];
const ok = (m) => console.log('ok  ' + m);
const fix = (m) => { fails.push(m); console.log('FIX ' + m); };

const srv = await L.startServer();
const browser = await L.launch();
try {
  // ── 1 預設:沒有 ?doll 參數 ────────────────────────────────────────────────
  const ctx = await L.newCtx(browser, L.VIEWS.desktop);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 160)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/i.test(t)) errs.push('console.error: ' + t.slice(0, 160)); });
  await L.boot(page, srv.url);   // 不帶 ?doll
  const st = await page.waitForFunction(() => { const s = globalThis.__mistvaleDoll?.(); return s && s.on && s.ready ? s : null; }, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null);
  if (!st) fix('D1 預設沒有開紙娃娃(?doll 參數不在時應該預設開)');
  else if (st.all) ok('D1 預設紙娃娃上線(all=true ready=true)');
  else fix('D1 預設只開了部分職業: ' + JSON.stringify(st));
  const base = await page.evaluate(() => globalThis.PIXEL_ASSETS?.paperdollClassesBase || '');
  if (base === 'media/paperdoll-classes/') ok('D2 預設載入六部位美術包 base=' + base); else fix('D2 paperdollClassesBase 不對: "' + base + '"');

  await L.adv(page, 2, 0.25);
  await page.waitForTimeout(300);
  const face = await page.evaluate(() => globalThis.__mistvaleFacing?.() || {});
  const dolls = Object.values(face).filter((f) => f && f.doll);
  const drawn = Object.values(face).filter((f) => f && (f.f === 1 || f.f === -1));
  if (dolls.length >= 5) ok('D3 預設 ' + dolls.length + ' 位獵人由紙娃娃畫出(act=' + [...new Set(dolls.map((d) => d.doll.act))].join('/') + ')');
  else fix('D3 預設只有 ' + dolls.length + ' 位獵人由紙娃娃畫出(應 ≥5)');
  const defDrawn = drawn.length;
  fs.mkdirSync(path.join(L.ROOT, 'output/doll-default'), { recursive: true });
  await page.screenshot({ path: path.join(L.ROOT, 'output/doll-default/default.png'), clip: { x: 380, y: 180, width: 680, height: 520 } });
  ok('D4 截圖 output/doll-default/default.png');

  // ── 2 ?doll=0:回到烘好的 sheet ─────────────────────────────────────────────
  const ctx2 = await L.newCtx(browser, L.VIEWS.desktop);
  const page2 = await ctx2.newPage();
  const errs2 = [];
  page2.on('pageerror', (e) => errs2.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 160)));
  page2.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/i.test(t)) errs2.push('console.error: ' + t.slice(0, 160)); });
  await L.boot(page2, srv.url + '?doll=0');
  const off = await page2.evaluate(() => globalThis.__mistvaleDoll?.() || null);
  if (off && !off.on) ok('D5 ?doll=0 關掉紙娃娃(on=false)'); else fix('D5 ?doll=0 沒有關掉紙娃娃: ' + JSON.stringify(off));
  await L.adv(page2, 2, 0.25);
  await page2.waitForTimeout(300);
  const face2 = await page2.evaluate(() => globalThis.__mistvaleFacing?.() || {});
  const dolls2 = Object.values(face2).filter((f) => f && f.doll);
  const drawn2 = Object.values(face2).filter((f) => f && (f.f === 1 || f.f === -1));
  if (!dolls2.length) ok('D6 ?doll=0 沒有任何獵人走紙娃娃'); else fix('D6 ?doll=0 還有 ' + dolls2.length + ' 位走紙娃娃');
  if (Math.abs(drawn2.length - defDrawn) <= 2 && drawn2.length > 0) ok('D7 兩種模式畫出的獵人人數一致(' + drawn2.length + '，容差 ±2)');
  else fix('D7 獵人人數不一致: 預設 ' + defDrawn + ' / ?doll=0 ' + drawn2.length);
  if (!errs.length) ok('D8 預設模式沒有 page error'); else fix('D8 預設模式錯誤: ' + errs.slice(0, 3).join(' | '));
  if (!errs2.length) ok('D9 ?doll=0 沒有 page error'); else fix('D9 ?doll=0 錯誤: ' + errs2.slice(0, 3).join(' | '));
} finally {
  await browser.close().catch(() => {});
  srv.stop();
}

console.log('');
if (fails.length) { console.log('FAIL doll-default: ' + fails.length + ' 項'); process.exit(1); }
console.log('PASS doll-default: 預設走紙娃娃、?doll=0 回到 sheet');
