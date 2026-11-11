// round2-extra.mjs — 第二輪補測(唯讀): 離線戰報(回訪玩家流程)、選第 4 位提示、主畫面實心橫條掃描、welcome。
// 用法: TARGET=http://127.0.0.1:5186 node pipeline/scripts/ui-audit/round2-extra.mjs <desktop|tablet|phone|land>
import fs from 'node:fs';
import path from 'node:path';
process.env.OUT = process.env.OUT || 'output/ui-audit/round2/bughunt-lib';
const L = await import('./bughunt-lib.mjs');
const VN = process.argv[2] || 'desktop', V = L.VIEWS[VN], MOBILE = !!V.mobile;
const BASE = (process.env.TARGET || 'http://127.0.0.1:5186').replace(/\/$/, '');
const DIR = path.resolve('output/ui-audit/round2/new', VN); fs.mkdirSync(DIR, { recursive: true });
const F = [], errs = [], info = {};
const find = (area, msg, d) => { F.push({ area, msg, d }); console.log('FIND', VN, area, msg, d ? JSON.stringify(d).slice(0, 300) : ''); };
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await L.launch();
const ctx = await L.newCtx(b, V);
await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} try { if (localStorage.getItem('__ofl')) { localStorage.removeItem('__ofl'); const raw = JSON.parse(localStorage.getItem('mistvale-pixel-v2')); raw.savedAt = Date.now() - 3 * 3600 * 1000; raw.paused = false; localStorage.setItem('mistvale-pixel-v2', JSON.stringify(raw)); } } catch {} });
let page = await ctx.newPage(); L.hook(page, VN, errs);
const shot = async n => { try { await page.screenshot({ path: `${DIR}/${n}.png` }); } catch {} };
const tapEl = async (loc, timeout = 3000) => { try { MOBILE ? await loc.tap({ timeout }) : await loc.click({ timeout }); return { ok: true }; } catch (e) { return { ok: false, err: String(e.message || e).split('\n').slice(0, 2).join(' | ').slice(0, 200) }; } };
const act = (a, id) => L.act(page, a, id);
try {
  // ── 新玩家 → 開始 → 存檔
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#title-screen', { timeout: 90000 }); await W(800);
  await tapEl(page.locator('#title-screen [data-ts=continue]').first(), 4000); await W(2500);
  // welcome 對話
  info.welcome = await page.evaluate(() => { const m = document.querySelector('#modal'); if (!m || document.querySelector('#modal-backdrop').classList.contains('hidden')) return null; const r = m.getBoundingClientRect(); const btns = [...m.querySelectorAll('button')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const q = e.getBoundingClientRect(); return { a: e.dataset.action, w: Math.round(q.width), h: Math.round(q.height), inView: q.bottom <= innerHeight + 1 && q.top >= -1, txt: e.textContent.trim().slice(0, 8) }; }); return { type: m.dataset.type, rect: [r.left, r.top, r.width, r.height].map(Math.round), btns, vh: innerHeight }; });
  await shot('welcome');
  if (!info.welcome) find('welcome', '新玩家點開始後沒有歡迎對話', null); else { if (info.welcome.btns.some(x => !x.inView)) find('welcome', '歡迎對話按鈕在視窗外', info.welcome); if (MOBILE && info.welcome.btns.some(x => x.h < 44)) find('welcome', '歡迎對話按鈕 <44', info.welcome.btns); }
  await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelectorAll('#modal-backdrop:not(.hidden) button')[0]?.click(); });
  await W(3500);
  // ── 離線 3 小時 → 重新載入 → 標題(繼續)→ 戰報
  await page.evaluate(() => localStorage.setItem('__ofl', '1'));
  const np = await ctx.newPage(); L.hook(np, VN, errs); await page.close(); page = np;
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#title-screen', { timeout: 90000 }).catch(() => {}); await W(1000);
  const tt = await page.evaluate(() => { const t = document.querySelector('#title-screen'); if (!t) return null; return { btns: [...t.querySelectorAll('[data-ts]')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const q = e.getBoundingClientRect(); return { ts: e.dataset.ts, w: Math.round(q.width), h: Math.round(q.height), x: Math.round(q.left), y: Math.round(q.top) }; }), meta: t.innerText.replace(/\s+/g, ' ').slice(0, 100), inner: (() => { const r = t.querySelector('.ts-inner')?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.bottom), innerHeight] : null; })() }; });
  info.titleReturn = tt; await shot('title-return2');
  if (!tt) find('offline', '回訪玩家沒有標題畫面', null);
  else {
    if (MOBILE && tt.btns.some(x => x.h < 44)) find('title', '回訪標題按鈕 <44px', tt.btns);
    if (tt.inner && (tt.inner[1] > tt.inner[2] + 1 || tt.inner[0] < -1)) find('title', '回訪標題內容超出視窗', tt.inner);
    await tapEl(page.locator('#title-screen [data-ts=continue]').first(), 4000);
    await W(2500);
  }
  const off = await page.evaluate(() => { const bd = document.querySelector('#modal-backdrop'); const open = bd && !bd.classList.contains('hidden'); const ok = document.querySelector('[data-action=offlineOk]'); const r = ok?.getBoundingClientRect(); return { open, type: document.querySelector('#modal')?.dataset.type || null, title: document.querySelector('#modal .modal-title')?.textContent?.trim() || null, ok: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null, vh: innerHeight, vw: innerWidth, tsGone: !document.querySelector('#title-screen') }; });
  info.offline = off; await shot('offline-after-continue');
  if (!off.open) find('offline', '回訪(離線 3 小時)按「繼續遊戲」後沒有離線戰報', off);
  else if (off.ok && (off.ok[1] + off.ok[3] > off.vh + 1)) find('offline', `離線戰報「收下」在視窗外 (bottom ${off.ok[1] + off.ok[3]} > ${off.vh})`, off);
  else if (!off.ok) find('offline', '離線戰報沒有收下鈕', off);
  else if (MOBILE && (off.ok[2] < 44 || off.ok[3] < 44)) find('offline', '收下鈕 <44', off.ok);
  await page.evaluate(() => document.querySelector('[data-action=offlineOk]')?.click()); await W(500);
  // 之後的測試用 preview 局
  await page.goto(BASE + '/?preview=1', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 }); await W(2500);
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important}' });
  // ── 主畫面實心橫條掃描
  info.bands = await page.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('body *')) {
      if (e.closest('#modal-backdrop,#cmdk,#loading,#title-screen') || e.tagName === 'CANVAS') continue;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width < 40 || r.height < 6 || +cs.opacity < .05) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      const m = (cs.backgroundColor.match(/[\d.]+/g) || []).map(Number); const a = m.length > 3 ? m[3] : 1;
      const solid = a >= 0.5 || /gradient|url/.test(cs.backgroundImage);
      if (!solid) continue;
      if (e.closest('#bottom-bar')) continue;
      if (r.width >= innerWidth * 0.3 || (r.width * r.height > 12000)) out.push({ s: (e.id ? '#' + e.id : e.tagName) + '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.'), r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], bg: cs.backgroundColor, a, img: cs.backgroundImage.slice(0, 40) });
    }
    return out.slice(0, 20);
  });
  if (info.bands.length) find('crit1', '主畫面有實心大色塊(除頁籤列)', info.bands);
  await shot('idle-hud');
  // ── 地下城/競技場選第 4 位
  for (const [panel, tog] of [['dungeon', 'toggleDungeonHunter'], ['arena', 'toggleArenaHunter']]) {
    await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); }); await W(200);
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; try { for (let i = 0; i < 2; i++) g.recruit?.(); } catch {} });
    await act(panel); await W(500);
    const ids = await page.evaluate(t => [...document.querySelectorAll(`#modal [data-action=${t}]`)].map(e => e.dataset.id), tog);
    info[panel + 'Ids'] = ids.length;
    let msgs = [];
    for (let i = 0; i < Math.min(ids.length, 5); i++) {
      await page.evaluate(([t, id]) => { document.querySelectorAll('#toasts>*').forEach(x => x.remove()); document.querySelector(`#modal [data-action=${t}][data-id="${id}"]`)?.scrollIntoView({ block: 'center' }); }, [tog, ids[i]]);
      const loc = page.locator(`#modal [data-action=${tog}][data-id="${ids[i]}"]`).first();
      const before = await page.evaluate(([t, id]) => document.querySelector(`#modal [data-action=${t}][data-id="${id}"]`)?.className, [tog, ids[i]]);
      const r = await tapEl(loc, 2500); await W(350);
      const after = await page.evaluate(([t, id]) => ({ cls: document.querySelector(`#modal [data-action=${t}][data-id="${id}"]`)?.className, toast: document.querySelector('#toasts .toast,#toasts>*')?.textContent?.trim().slice(0, 30) || null, hint: [...document.querySelectorAll('#modal .hint,#modal .party-hint,#modal [role=status]')].map(e => e.textContent.trim().slice(0, 30)).join('|') }), [tog, ids[i]]);
      msgs.push({ i, ok: r.ok, changed: before !== after.cls, toast: after.toast, hint: after.hint });
    }
    info[panel + 'Picks'] = msgs;
    const sel = msgs.filter(m => m.changed).length;
    const fourth = msgs[3];
    if (fourth && !fourth.changed && !fourth.toast && !fourth.hint) find('pick', `${panel}: 選滿 3 人後點第 4 位沒反應也沒提示`, msgs);
    await shot('pick-' + panel);
  }
} catch (e) { find('script', '錯誤', String(e).slice(0, 300)); }
finally {
  fs.writeFileSync(`output/ui-audit/round2/extra-${VN}.json`, JSON.stringify({ view: VN, errs, findings: F, info }, null, 1));
  console.log('DONE', VN, F.length, 'errs', errs.length);
  await b.close();
}
