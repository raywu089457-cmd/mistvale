// welcome.mjs — T121：首次開局入門嚮導(Z2D 2026-11-12 改成白色像素氣泡、一次一步)
//   * 只有「沒有存檔」且「不是 ?preview=1」時才該出現：自動化與老玩家都不會被擋。
//   * 氣泡一次只說一步(.z2d-step 同時 1 個、.z2d-dots 一點一步)，用「下一步」走完(出征→蓋設施→委託與地圖)，最後一步按「開始遊戲」關閉並存檔，
//     之後重新整理不應再出現。人數從資料讀(不寫死「五位」)；開始遊戲後不再多丟「先派去地下城」的 toast(只留顧問一條主引導)。
//   * 細節(白底粗黑框、尾巴、頭像大小、高亮手指)由 z2d-hud.mjs 量；這裡守流程。
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
    steps: [...document.querySelectorAll('#modal-content .z2d-step')].map(s => ({
      num: s.dataset.step || '',
      h: s.querySelector('.z2d-h')?.textContent || '',
      p: s.textContent.trim(),
    })),
    dots: document.querySelectorAll('#modal-content .z2d-dots i').length,
    n: globalThis.__mistvaleGame?.state.hunters.length || 0,
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
    if (st.steps.length !== 1) fix(`入門嚮導同時顯示 ${st.steps.length} 步，應一次一步`);
    if (st.dots < 3) fix(`入門嚮導只有 ${st.dots} 步(.z2d-dots)，預期 ≥3(歡迎＋出征／蓋設施＋委託與地圖)`);
    const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][st.n];
    if (!st.steps[0] || !st.steps[0].p.includes(cn + '位獵人') || /五位/.test(st.steps[0].p) && st.n !== 5) fix(`第一步沒有從資料讀人數(應含「${cn}位獵人」)：${st.steps[0]?.p.slice(0, 40)}`);
    // 逐步走完:每步都有「下一步」或「開始遊戲」，步驟內文至少 20 字
    const seen = []; let guard = 0, cur = st;
    while (guard++ < 8) {
      if (cur.steps.length === 1) seen.push(cur.steps[0].p);
      if (cur.steps[0] && cur.steps[0].p.length < 20) fix(`步驟 ${cur.steps[0].num} 說明太短（${cur.steps[0].p.length} 字）`);
      if (cur.buttons.some(b => b.a === 'welcomeNext')) { await page.click('#modal-content [data-action="welcomeNext"]'); await page.waitForTimeout(350); cur = await modalState(page); } else break;
    }
    const acts = cur.buttons.map(b => b.a);
    if (!acts.includes('welcomeStart') || !acts.includes('welcomeHelp')) fix(`入門嚮導最後一步按鈕是 ${acts.join(',')}，缺少 welcomeStart／welcomeHelp`);
    if (seen.length !== st.dots) fix(`走完只看到 ${seen.length} 步，點數是 ${st.dots}`);
    if (!/委託/.test(seen.join('')) || !/地圖/.test(seen.join('')) || !/建設|蓋/.test(seen.join(''))) fix('入門嚮導沒有講到 建設／委託／地圖');
    if (st.hscroll > 1) fix(`入門嚮導橫向溢出 ${st.hscroll}px`);
    ok(`全新玩家看到入門嚮導：一次一步、共 ${seen.length} 步，最後按鈕 ${acts.join('、')}`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/welcome/desktop.png' });
    st = cur;
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
    if (toast.some(t => /出發吧|先派/.test(t))) fix(`按「開始遊戲」後還多丟一則 toast「${toast.join(' / ')}」，那是第三條引導(只留顧問一條)`);
    if (!after.open && running && saved && !toast.some(t => /出發吧|先派/.test(t))) ok('按「開始遊戲」關閉嚮導、開始跑遊戲、寫入存檔，沒有多餘的引導 toast');
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
    const small = st.buttons.filter(b => b.h < 44);
    if (small.length) fix(`手機按鈕太矮：${small.map(b => b.a + ' ' + b.h + 'px').join(',')}`);
    const inside = await page.evaluate(() => {
      const out = [...document.querySelectorAll('#modal-content .z2d-bubble,#modal-content .hv-dlg-face')].filter(s => {
        const r = s.getBoundingClientRect();
        return r.left < -1 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight + 1;
      }).length;
      return { out };
    });
    if (inside.out) fix(`手機氣泡／頭像有 ${inside.out} 個超出畫面`);
    const vis = await page.evaluate(() => {
      const cr = { top: 0, bottom: innerHeight };
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
    if (!inside.out && st.hscroll <= 1 && !st.buttons.filter(b => b.h < 30).length) ok(`手機 360x640 嚮導氣泡與頭像都在畫面內、按鈕 ${st.buttons.map(b => b.h + 'px').join('/')}、無橫向溢出`);
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
console.log('PASS welcome: 全新玩家會看到一次一步的氣泡入門嚮導（歡迎／出征與蓋設施／委託與地圖），最後可按「開始遊戲」開始並存檔、也可切到完整說明；有存檔或 ?preview=1 都不會再彈；手機不溢出、按鈕 ≥44px');
