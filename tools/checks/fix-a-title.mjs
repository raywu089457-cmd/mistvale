// fix-a-title.mjs — FIX-A B5 / B12:標題畫面
//   · 新玩家(開機時沒有存檔):只有「開始遊戲」與「遊戲說明」,沒有「繼續遊戲／重新開始」,也沒有存檔摘要
//   · 歡迎對話框要等標題關掉才打開(標題還在時 #modal-backdrop 必須是 hidden)
//   · 有存檔的回訪玩家:標題要有「繼續遊戲」＋「重新開始」(不能被這次修正弄丟),進村後不再彈歡迎對話框
//   · B12:標題的 Enter/Esc 監聽新增與移除都用 capture
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => fails.push(m);
const src = fs.readFileSync(new URL('../../src/pixel-ui.js', import.meta.url), 'utf8');
const add = (src.match(/addEventListener\('keydown',keyHandler,true\)/g) || []).length, rem = (src.match(/removeEventListener\('keydown',keyHandler,true\)/g) || []).length;
if (add < 1 || rem < 1) fix(`B12:標題 keydown 監聽沒有成對的 capture 新增/移除(add ${add}、remove ${rem})`);
if (/addEventListener\('keydown',function esc\(ev\)\{\s*if\(ev\.key==='Enter'\|\|ev\.key==='Escape'\)\{document\.removeEventListener/.test(src)) fix('B12:還留著舊的 esc 監聽寫法');
const state = page => page.evaluate(() => ({
  title: !!document.getElementById('title-screen'),
  btns: [...document.querySelectorAll('#title-screen [data-ts]')].map(b => b.dataset.ts + ':' + b.textContent.trim()),
  save: document.querySelector('#title-screen .ts-save')?.textContent.trim() || '',
  modalOpen: !document.querySelector('#modal-backdrop').classList.contains('hidden'), modalType: document.querySelector('#modal')?.dataset.type || '',
}));
const ctx = await L.newCtx(browser, L.VIEWS.phone);
// ── 新玩家 ──
let page = await ctx.newPage();
await page.goto(srv.url, { waitUntil: 'commit' });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.waitForSelector('#title-screen', { timeout: 8000 });
await page.waitForTimeout(1500);
let s = await state(page);
if (s.btns.some(b => /^fresh:/.test(b))) fix(`新玩家標題出現「重新開始」:${s.btns.join(' | ')}`);
if (s.btns.some(b => /繼續遊戲/.test(b))) fix(`新玩家標題出現「繼續遊戲」:${s.btns.join(' | ')}`);
if (!s.btns.some(b => /^continue:開始遊戲$/.test(b))) fix(`新玩家標題主按鈕不是「開始遊戲」:${s.btns.join(' | ')}`);
if (s.save) fix(`新玩家標題顯示了存檔摘要「${s.save}」`);
if (s.modalOpen) fix(`標題還在時,背後的對話框已經打開(${s.modalType})`);
await page.waitForTimeout(1500); s = await state(page);
if (s.modalOpen) fix(`標題停留 3 秒後,背後的對話框打開了(${s.modalType})`);
console.log('new', JSON.stringify(s));
await page.keyboard.press('Enter').catch(() => {});
await page.waitForTimeout(1500);
s = await state(page);
if (s.title) fix('按 Enter / 點畫面後標題沒關');
if (!(s.modalOpen && s.modalType === 'welcome')) fix(`標題關掉後歡迎對話框沒有打開(modal=${s.modalOpen ? s.modalType : '無'})`);
await page.evaluate(() => document.querySelector('#modal [data-action=welcomeStart]')?.click());
await page.waitForTimeout(600);
await page.close();
// ── 回訪玩家(同一個 context 的 localStorage 已有存檔;新分頁的 sessionStorage 是空的,標題會再出現)──
page = await ctx.newPage();
await page.goto(srv.url, { waitUntil: 'commit' });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.waitForSelector('#title-screen', { timeout: 8000 });
await page.waitForTimeout(800);
s = await state(page);
if (!s.btns.some(b => /^continue:繼續遊戲$/.test(b))) fix(`有存檔時標題沒有「繼續遊戲」:${s.btns.join(' | ')}`);
if (!s.btns.some(b => /^fresh:重新開始$/.test(b))) fix(`有存檔時標題沒有「重新開始」:${s.btns.join(' | ')}`);
if (!s.save) fix('有存檔時標題沒有存檔摘要');
console.log('return', JSON.stringify(s));
await page.evaluate(() => document.querySelector('#title-screen [data-ts=continue]')?.click());
await page.waitForTimeout(1200);
s = await state(page);
if (s.modalOpen && s.modalType === 'welcome') fix('回訪玩家進村後又彈出歡迎對話框');
await ctx.close(); await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS fix-a-title: 新玩家標題只有「開始遊戲」、歡迎對話框等標題關掉、回訪玩家保留繼續/重新開始、keydown capture 成對');
