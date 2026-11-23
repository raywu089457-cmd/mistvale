// buttons.mjs — 全部按鈕巡檢(2026-10-30):每個畫面把看得到的 [data-action] 都真的點一次(手機用 tap),記錄
//   被蓋住(中心點不是它自己)、太小(< 32px;手機 < 40px 另列)、沒有文字/標籤、點了沒反應(DOM 沒變、畫面也沒變)、
//   反應時間(點擊到第一個 DOM 變化)、頁面錯誤。危險的(reset、export)不點。
// 用法: node pipeline/scripts/ui-audit/buttons.mjs [desktop|phone] > report   (對象:TARGET 或 http://100.79.149.0:5024/?preview=1,先 npm run build)
import { createRequire } from 'module';
import crypto from 'node:crypto';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const MODE = process.argv[2] || 'desktop', PHONE = MODE === 'phone';
const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const ctx = await b.newContext(PHONE ? { viewport: { width: 402, height: 712 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' } : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 240)));
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
// 2026-11-13:標題畫面(#title-screen)現在會等「開始遊戲」才消失,而且它是 fixed 全螢幕、會擋住巡檢的每一顆鈕
// (整輪 411 次點擊裡 299 個 click-failed 都是它或它的遮罩)。巡檢不需要標題畫面,直接移除;再關掉新存檔的歡迎對話框。
await page.waitForSelector('#title-screen', { timeout: 4000 }).catch(() => {});
await page.evaluate(() => { document.querySelector('#title-screen')?.remove(); });
await page.waitForFunction(() => document.querySelector('#modal')?.dataset.type === 'welcome' && !document.querySelector('#modal-backdrop')?.classList.contains('hidden'), null, { timeout: 4000 }).catch(() => {});
await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close],#modal-backdrop:not(.hidden) [data-action=welcomeStart]')?.click(); });
await page.waitForTimeout(300);
await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 });
  for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
const closeAll = () => page.evaluate(() => { try { globalThis.__mistvaleGame.pilotStop?.(); } catch {} for (const k of ['leave', 'stop', 'exit', 'close']) document.querySelectorAll(`#pilotlab [data-pilot=${k}]`).forEach(b => b.offsetParent && b.click()); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); try { globalThis.__mistvaleSelect?.(null); } catch {}
  // 2026-11-13:建築詳情/#inspector 是 position:fixed,C 視窗的關閉鈕也可能在 fixed 容器裡,offsetParent 會是 null,
  // 舊寫法因此永遠不點「關閉」→ 遮罩留著把後面每一顆鈕都擋掉(按鈕巡檢 299 個 click-failed)。改用 getClientRects() 判斷有沒有畫出來。
  for (const b of document.querySelectorAll('[data-action=closeInspector]')) if (b.getClientRects().length) b.click();
  document.querySelector('#unit-card [data-action=unitCardClose]')?.click(); });
const hid = () => page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id);
const SCREENS = [
  ['hud', async () => { await closeAll(); }],
  ['worldmap', () => act('worldmap')], ['build', () => act('build')], ['hunters', () => act('hunters')],
  ['hunter', async () => act('hunter', await hid())], ['recruit', () => act('recruit')], ['trade', () => act('trade')],
  ['craft', () => act('craft')], ['craft-gear', async () => { await act('craft'); await act('craftTab', 'gear'); }],
  ['dungeon', () => act('dungeon')], ['arena', () => act('arena')], ['quests', () => act('quests')], ['inventory', () => act('inventory')],
  ['difficulty', () => act('difficulty')], ['settings', () => act('settings')], ['help', () => act('help')], ['boss', () => act('boss')],
  ['dispatch', () => act('dispatchHunters')], ['inspector', async () => { await closeAll(); await act('selectBuilding', 'forge'); }],
  // 2026-11-11 第二階段:世界內選取的六角鈕(資訊／取消)、亮色對話框(開場導覽、顧問)。第三格 = 只巡這個容器裡的按鈕
  ['select-building', async () => { await closeAll(); await page.evaluate(() => globalThis.__mistvaleView?.focus('home')); await page.waitForTimeout(500); await page.evaluate(() => globalThis.__mistvaleSelect('forge')); }, '#hv-sel'],
  ['select-hunter', async () => { await closeAll(); await page.evaluate(() => { const g = globalThis.__mistvaleGame, h = g.state.hunters[0]; g.state.paused = true; globalThis.__mistvaleView?.lookAt(h.x, h.z, 2.2); }); await page.waitForTimeout(900); await page.evaluate(() => globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id)); }, '#hv-sel'],
  ['dialog-welcome', async () => { await closeAll(); await act('welcomeReplay'); }, '#modal'],
];
const SKIP = new Set(['reset', 'export', 'importSave']);
const sig = () => page.evaluate(() => { const s = globalThis.__mistvaleGame.state; return JSON.stringify([document.querySelector('#modal-backdrop')?.classList.contains('hidden') ? '' : document.querySelector('#modal-title')?.textContent, s.gold, s.paused, s.speed, s.region, s.difficulty, s.hunters.map(h => h.task + h.huntRegion).join(), document.querySelectorAll('#toasts > *').length]); });
const shot = async () => crypto.createHash('md5').update(await page.screenshot()).digest('hex');
const report = [];
for (const [name, open, only] of SCREENS) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;   // ONLY=select-building,dialog-welcome 只巡這幾個畫面
  await closeAll(); await page.waitForTimeout(150); await open(); await page.waitForTimeout(350);
  const list = await page.evaluate(only => {
    const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('.hidden'); };
    const modalOpen = !document.querySelector('#modal-backdrop')?.classList.contains('hidden');
    // Z1(2026-11-12):C 置中視窗與建築詳情的遮罩會蓋住頂欄與頁籤列,只巡視窗內的鈕;A 抽屜開著頁籤列仍可點
    const inspOpen = !modalOpen && !document.querySelector('#inspector')?.classList.contains('hidden');
    return [...document.querySelectorAll('[data-action]')].filter(vis).filter(e => !only || e.closest(only)).filter(e => !modalOpen || e.closest('#modal') || (document.body.classList.contains('hud-modal') && document.body.dataset.modalMode !== 'C' && e.closest('#topbar,#bottom-bar'))).filter(e => !inspOpen || e.closest('#inspector')).map((e, i) => {
      e.dataset.auditIdx = String(i); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy), covered = !(top && (e === top || e.contains(top) || top.contains(e)));
      const off = cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight;
      const label = (e.textContent || '').trim() || e.getAttribute('aria-label') || e.getAttribute('title') || '';
      const sel = Object.entries(e.dataset).filter(([k]) => k !== 'auditIdx').map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(v)}"]`).join('');
      const scope = ['#modal', '#topbar', '#bottom-bar', '#left-panel', '#inspector', '#pilotlab'].find(q => e.closest(q)) || 'body';
      return { i, sel, scope, action: e.dataset.action, id: e.dataset.id || '', w: Math.round(r.width), h: Math.round(r.height), covered: covered ? (top?.id || top?.className || top?.tagName || '?').toString().slice(0, 40) : '', off, label: label.replace(/\s+/g, ' ').slice(0, 18), disabled: !!e.disabled };
    });
  }, only);
  for (const btn of list) {
    const row = { screen: name, ...btn, result: '', ms: null };
    if (SKIP.has(btn.action)) { row.result = 'skipped(dangerous)'; report.push(row); continue; }
    if (btn.disabled) { row.result = 'disabled'; report.push(row); continue; }
    // 回到這個畫面再點(上一顆可能開了別的彈窗)
    await closeAll(); await page.waitForTimeout(80); await open(); await page.waitForTimeout(200);
    // 面板會自己 refresh（交易所／製作／委託等 LIVE 畫面），畫面被換掉後舊 handle 就失效，所以每次重新解析
    const resolve = async () => { for (const c of await page.$$(btn.sel)) { if (!(await c.isVisible())) continue; if (await c.evaluate((e, sc) => sc === 'body' ? !e.closest('#modal,#topbar,#bottom-bar,#left-panel,#inspector,#pilotlab') : !!e.closest(sc), btn.scope)) return c; } return null; };
    let target = await resolve();
    if (!target || !(await target.isVisible())) { row.result = 'gone-after-reopen'; report.push(row); continue; }
    await page.evaluate(() => { globalThis.__aud = { t0: 0, t1: 0 }; document.addEventListener(PointerEvent ? 'pointerdown' : 'mousedown', () => { globalThis.__aud.t0 = performance.now(); }, { capture: true, once: true });
      const mo = new MutationObserver(() => { if (!globalThis.__aud.t1) globalThis.__aud.t1 = performance.now(); }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); globalThis.__audMo = mo; });
    const s0 = await sig(), h0 = await shot(), e0 = errs.length;
    // 偶發的時序問題(數字剛好在變、畫面剛好在重排)重試一次;兩次都失敗才算失敗
    for (let attempt = 0; attempt < 3; attempt++) {
      try { if (PHONE) await target.tap({ timeout: 2500 }); else await target.click({ timeout: 2500 }); row.result = ''; if (attempt) row.retried = true; break; }
      catch (e) {
        const msg = String(e.message);
        if (attempt && /not enabled/.test(msg)) { row.result = 'disabled-at-click (state changed; ok)'; break; }
        // handle 被面板重繪換掉：重新解析同一顆按鈕再點（重試同一支 handle 沒有用）
        if (attempt < 2 && /not attached|detached|not stable|Execution context was destroyed/i.test(msg)) {
          await page.waitForTimeout(250); target = await resolve();
          if (!target) { row.result = 'gone-after-reopen'; break; }
          row.retried = true; continue;
        }
        if (attempt < 2) { await page.waitForTimeout(300); continue; }
        const why = msg.split(/\r?\n/).filter(l => /intercepts|not stable|not enabled|not visible|detached|outside/.test(l)).slice(-2).map(l => l.trim()).join(' / ');
        row.result = 'click-failed: ' + msg.split(/\r?\n/)[0].slice(0, 50) + (why ? ' [' + why.slice(0, 200) + ']' : '');
      }
    }
    await page.waitForTimeout(450);
    const a = await page.evaluate(() => { globalThis.__audMo?.disconnect(); return globalThis.__aud; });
    const s1 = await sig();
    row.ms = a.t0 && a.t1 ? Math.round(a.t1 - a.t0) : null;
    if (!row.result) row.result = s1 !== s0 ? 'state/modal changed' : a.t1 ? 'dom changed' : (await shot()) !== h0 ? 'canvas changed' : 'NO REACTION';
    if (errs.length > e0) row.result += ' + ERROR ' + errs.slice(e0).join(' | ');
    report.push(row);
  }
}
const bad = report.filter(r => /NO REACTION|ERROR|click-failed/.test(r.result) || r.covered || r.off || r.w < 32 || r.h < 32 || (PHONE && (r.w < 40 || r.h < 40)) || !r.label);
console.log(JSON.stringify({ mode: MODE, total: report.length, screens: SCREENS.length, slow: report.filter(r => r.ms > 120).map(r => `${r.screen}:${r.action}${r.id ? '(' + r.id + ')' : ''} ${r.ms}ms`), errors: errs }, null, 1));
console.log('--- 有問題的按鈕(' + bad.length + ')');
for (const r of bad) console.log(`${r.screen.padEnd(11)} ${(r.action + (r.id ? '(' + r.id + ')' : '')).padEnd(28)} ${r.w}x${r.h} ${r.covered ? 'COVERED by ' + r.covered + ' ' : ''}${r.off ? 'OFFSCREEN ' : ''}${r.label ? '' : 'NO-LABEL '}"${r.label}" → ${r.result}`);
await b.close();
