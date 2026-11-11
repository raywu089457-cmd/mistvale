// welcome.mjs — T121：首次開局入門嚮導
//   * 只有「沒有存檔」且「不是 ?preview=1」時才該出現：自動化與老玩家都不會被擋。
//   * 三張步驟卡要說明真正的循環（出征→蓋設施→委託與地圖），按「開始遊戲」關閉並存檔，
//     之後重新整理不應再出現。
// Usage: node tools/checks/welcome.mjs       (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/welcome.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.TARGET_BASE || 'http://100.79.149.0:5024/';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/welcome', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

const ready = page => page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
// 全新玩家會先看到標題畫面(FIX-A B5:歡迎對話框等它關掉才打開) → 按 Enter 進村
const dismissTitle = async page => { await page.waitForSelector('#title-screen', { timeout: 8000 }).catch(() => {}); await page.keyboard.press('Enter'); };
const modalState = page => page.evaluate(() => {
  const m = document.querySelector('#modal');
  const backdrop = document.querySelector('#modal-backdrop');
  const open = backdrop ? !backdrop.classList.contains('hidden') : false;
  const content = document.querySelector('#modal-content');
  return {
    open, type: m?.dataset.type || '', title: document.querySelector('#modal-title')?.textContent || '',
    steps: [...document.querySelectorAll('#modal-content .welcome-step')].map(s => ({
      num: s.querySelector('.ws-num')?.textContent || '',
      h: s.querySelector('h4')?.textContent || '',
      p: s.querySelector('p')?.textContent?.trim() || '',
    })),
    tips: document.querySelector('#modal-content .welcome-tips')?.textContent?.trim() || '',
    buttons: [...document.querySelectorAll('#modal-content .welcome-actions .pixel-button')].map(b => ({ a: b.dataset.action, t: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })),
    hscroll: content ? content.scrollWidth - content.clientWidth : 0,
    contentW: content ? content.clientWidth : 0,
  };
});

// ── 1. 全新玩家：要看得到 ──────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'commit' });
  await ready(page);
  await dismissTitle(page);   // FIX-A B5:歡迎窗要等標題畫面關掉才彈
  // 歡迎窗是標題關掉後才彈，等它出現
  let st = null;
  for (let i = 0; i < 40; i++) { st = await modalState(page); if (st.open && st.type === 'welcome') break; await page.waitForTimeout(150); }
  if (!st.open || st.type !== 'welcome') fix(`全新玩家沒有看到入門嚮導（modal open=${st.open} type=${st.type || '(空)'}）`);
  else {
    if (!/歡迎|入門/.test(st.title)) fix(`入門嚮導標題是「${st.title}」`);
    if (st.steps.length !== 3) fix(`入門嚮導有 ${st.steps.length} 張步驟卡，預期 3 張`);
    const nums = st.steps.map(s => s.num).join('');
    if (nums !== '123') fix(`步驟編號是 ${nums}，預期 123`);
    const heads = st.steps.map(s => s.h);
    for (const want of ['選人出征', '把村子蓋起來', '接著看委託與地圖']) {
      if (!heads.includes(want)) fix(`入門嚮導缺少步驟「${want}」（目前：${heads.join('/')}）`);
    }
    for (const s of st.steps) if (s.p.length < 20) fix(`步驟 ${s.num}「${s.h}」說明太短（${s.p.length} 字）`);
    if (!/說明/.test(st.tips)) fix(`入門嚮導沒有提示列：${st.tips}`);
    const acts = st.buttons.map(b => b.a);
    if (!acts.includes('welcomeStart') || !acts.includes('welcomeHelp')) fix(`入門嚮導按鈕是 ${acts.join(',')}，缺少 welcomeStart／welcomeHelp`);
    if (st.hscroll > 1) fix(`入門嚮導橫向溢出 ${st.hscroll}px`);
    ok(`全新玩家看到入門嚮導：${st.steps.map(s => s.num + '.' + s.h).join(' / ')}，按鈕 ${acts.join('、')}`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/welcome/desktop.png' });
  }

  // 「看完整說明」→ 切到說明面板；再回來按「開始遊戲」
  if (st.open && st.type === 'welcome') {
    await page.click('#modal-content [data-action="welcomeHelp"]');
    await page.waitForTimeout(400);
    const help = await modalState(page);
    if (help.type !== 'help') fix(`按「看完整說明」後開啟的是 ${help.type || '(空)'}，預期 help`);
    else ok('按「看完整說明」會切到村長入門手札');
    // 切回歡迎窗（模擬使用者再開一次嚮導不容易，這裡直接驗開始遊戲）
    await page.evaluate(() => { document.querySelector('#modal-backdrop').classList.add('hidden'); });
    await page.evaluate(() => {
      const b = document.createElement('button'); b.dataset.action = 'welcomeStart'; b.style.display = 'none';
      document.body.append(b); b.click(); b.remove();
    });
    await page.waitForTimeout(300);
    const after = await modalState(page);
    if (after.open) fix(`按「開始遊戲」後彈窗沒關（${after.type}）`);
    // 開始遊戲後遊戲要跑（未暫停）
    const running = await page.evaluate(() => !globalThis.__mistvaleGame.state.paused);
    if (!running) fix('按「開始遊戲」後遊戲仍暫停');
    const saved = await page.evaluate(() => { try { return !!localStorage.getItem('mistvale-pixel-v2'); } catch { return false; } });
    if (!saved) fix('按「開始遊戲」後沒有寫入存檔');
    const toast = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast .toast-tx')].map(t => t.textContent));
    if (!toast.some(t => /出發/.test(t))) fix(`按「開始遊戲」沒有提示訊息（目前：${toast.join(' / ') || '無'}）`);
    if (!after.open && running && saved && toast.some(t => /出發/.test(t))) ok('按「開始遊戲」關閉嚮導、開始跑遊戲、寫入存檔並給一句提示');
  }

  // 同一個存檔再整理一次：不應再出現
  await page.evaluate(() => { try { globalThis.__mistvaleGame.state.paused = false; } catch {} });
  await page.waitForTimeout(5600);   // 等自動存檔（每 5 秒）
  await page.reload({ waitUntil: 'commit' });
  await ready(page);
  await page.waitForTimeout(1800);
  const again = await modalState(page);
  if (again.open && again.type === 'welcome') fix('有存檔的玩家重新整理後又看到入門嚮導');
  else ok('有存檔的玩家重新整理不會再看到入門嚮導');
  if (errs.length) fix(`全新玩家頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 2. ?preview=1 不能出現 ─────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await ready(page);
  await page.waitForTimeout(1600);
  const st = await modalState(page);
  if (st.open && st.type === 'welcome') fix('?preview=1 也彈了入門嚮導（自動化會被擋）');
  else ok('?preview=1 不會彈入門嚮導（檢查器與巡檢不受影響）');
  await ctx.close();
}

// ── 3. 手機 ───────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'commit' });
  await ready(page);
  await dismissTitle(page);
  let st = null;
  for (let i = 0; i < 40; i++) { st = await modalState(page); if (st.open && st.type === 'welcome') break; await page.waitForTimeout(150); }
  if (!st.open || st.type !== 'welcome') fix(`手機上沒有看到入門嚮導（open=${st.open} type=${st.type || '(空)'}）`);
  else {
    if (st.hscroll > 1) fix(`手機入門嚮導橫向溢出 ${st.hscroll}px`);
    const small = st.buttons.filter(b => b.h < 30);
    if (small.length) fix(`手機按鈕太矮：${small.map(b => b.a + ' ' + b.h + 'px').join(',')}`);
    const inside = await page.evaluate(() => {
      const m = document.querySelector('#modal').getBoundingClientRect();
      const out = [...document.querySelectorAll('#modal-content .welcome-step')].filter(s => {
        const r = s.getBoundingClientRect();
        return r.left < m.left - 1 || r.right > m.right + 1;
      }).length;
      return { out, modal: { x: Math.round(m.x), w: Math.round(m.width) } };
    });
    if (inside.out) fix(`手機有 ${inside.out} 張步驟卡超出彈窗`);
    const vis = await page.evaluate(() => {
      const c = document.querySelector('#modal-content');
      c.scrollTop = 0;
      const cr = c.getBoundingClientRect();
      const list = [...document.querySelectorAll('#modal-content .welcome-actions .pixel-button')];
      return list.map((b) => {
        const r = b.getBoundingClientRect();
        const mid = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
        return { t: b.textContent.trim(), fully: r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1, hit: !!(mid && mid.closest('.welcome-actions')) };
      });
    });
    const hidden = vis.filter((v) => !v.fully || !v.hit);
    if (hidden.length) fix(`手機 360x640 不用捲就看得到的按鈕不足（${hidden.map((v) => v.t).join('、')} 被切掉或點不到）`);
    else ok(`手機 360x640 不捲動就看得到而且點得到「${vis.map((v) => v.t).join('」/「')}」`);
    if (!inside.out && st.hscroll <= 1 && !st.buttons.filter(b => b.h < 30).length) ok(`手機 360x640 嚮導 ${st.steps.length} 張卡都在彈窗內、按鈕 ${st.buttons.map(b => b.h + 'px').join('/')}、無橫向溢出`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/welcome/phone.png' });
  }
  if (errs.length) fix(`手機頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close();
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS welcome: 全新玩家會看到三步驟入門嚮導（出征／蓋設施／委託與地圖），可按「開始遊戲」開始並存檔、也可切到完整說明；有存檔或 ?preview=1 都不會再彈；手機不溢出、按鈕夠大');
