// round3-mobile-primary.mjs — 各尺寸:主要按鈕不用捲動就看得到、點得到;頁籤列 7 顆中心點打得到自己;面板 X 打得到。唯讀。
// 用法: node ... m360x640,l844x390  → output/ui-audit/round3-mobile/primary/<view>.json
import fs from 'node:fs';
process.env.OUT = 'output/ui-audit/round3-mobile/primary';
const L = await import('./round3-mobile-lib.mjs');
const names = (process.argv[2] || 'm360x640').split(',');
const BASE = (process.env.TARGET || 'http://127.0.0.1:5192').replace(/\/$/, '');
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await L.launch();
const SCENES = [
  ['welcome', p => L.act(p, 'welcomeReplay'), ['welcomeStart', 'welcomeHelp']],
  ['offline', p => p.evaluate(() => globalThis.__mistvaleShowOffline()), ['offlineOk']],
  ['confirm', p => p.evaluate(() => globalThis.__mistvaleConfirm('確定要重置村莊嗎？目前的進度會全部清除，無法復原。')), ['confirmYes', 'confirmNo']],
  ['recruit', p => L.act(p, 'recruit'), ['recruitVisitor']],
  ['boss', p => L.act(p, 'boss'), ['startBoss']],
  ['dungeon', p => L.act(p, 'dungeon'), ['startDungeon']],
  ['arena', p => L.act(p, 'arena'), ['startArena']],
  ['dispatch', p => L.act(p, 'dispatchHunters'), ['startDispatch', 'dispatchAll']],
  ['hunter-detail', async p => L.act(p, 'hunter', await p.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id)), ['train', 'enhanceHunter', 'learnSkill']],
  ['region-detail', p => L.act(p, 'regionDetail', 'meadow'), ['regionTravel', 'regionView']],
  ['settings', p => L.act(p, 'settings'), ['reset', 'pilotLab']],
  ['quests', p => L.act(p, 'quests'), ['quest']],
  ['inspector-hall', p => L.act(p, 'selectBuilding', 'hall'), ['upgrade', 'moveBuilding']],
  ['codex', p => L.act(p, 'codex'), []],
  ['help', p => L.act(p, 'help'), []],
  ['inventory', p => L.act(p, 'inventory'), []],
  ['difficulty', p => L.act(p, 'difficulty'), ['setDifficulty']],
];
const PROBE = ([keys]) => {
  const vh = innerHeight, vw = innerWidth;
  const bar = document.querySelector('#bottom-bar')?.getBoundingClientRect();
  const visible = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; } return true; };
  const info = e => { const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const inV = r.top >= -0.5 && r.bottom <= vh + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5; const t = cx >= 0 && cy >= 0 && cx <= vw && cy <= vh ? document.elementFromPoint(cx, cy) : null; const hit = !!t && (t === e || e.contains(t) || t.contains(e)); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), inV, hit, hitSel: t && !hit ? (t.id ? '#' + t.id : String(t.className).split(' ')[0] || t.tagName) : null, aboveBar: bar ? r.bottom <= bar.top + 1 : null }; };
  const out = { keys: {}, vh, vw, barTop: bar ? Math.round(bar.top) : null };
  for (const k of keys) { const e = [...document.querySelectorAll(`[data-action=${k}]`)].find(visible); out.keys[k] = e ? info(e) : null; }
  const x = [...document.querySelectorAll('#modal [data-action=close],#inspector [data-action=closeInspector]')].find(visible); out.x = x ? info(x) : null;
  const cc = document.querySelector('#modal-content'); out.scroll = cc && visible(cc) ? { sh: cc.scrollHeight, ch: cc.clientHeight, scrollable: cc.scrollHeight > cc.clientHeight + 2 } : null;
  out.tabs = [...document.querySelectorAll('#bottom-bar>button')].map(e => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === e || e.contains(t)); });
  const m = document.querySelector('#modal'); out.modal = m && visible(m) ? (() => { const r = m.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), type: m.dataset.type }; })() : null;
  return out;
};
const res = {};
for (const VN of names) {
  const V = L.VIEWS[VN]; const errs = [];
  const ctx = await L.newCtx(b, V); await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
  const page = await ctx.newPage(); L.hook(page, VN, errs);
  await L.boot(page, BASE + '/?preview=1'); await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important}' }); await W(3000);
  const rich = () => page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); g.state.buildings.hall = 1; });
  const reset = async () => { await page.evaluate(() => { try { globalThis.__mistvaleSelect?.(null); } catch {} document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmNo]')?.click(); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#modal-backdrop:not(.hidden) [data-action=offlineOk]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); document.querySelectorAll('#toasts .toast').forEach(t => t.remove()); try { globalThis.__mistvaleGame.state.paused = false; } catch {} globalThis.__mistvaleView?.focus('home'); }); await rich(); await W(300); };
  const R = {};
  for (const [name, open, keys] of SCENES) {
    try { await reset(); await open(page); await W(600); R[name] = await page.evaluate(PROBE, [keys]); await page.screenshot({ path: `${L.OUT}/shots/${VN}-${name}.png` }); }
    catch (e) { R[name] = { error: String(e).slice(0, 160) }; }
  }
  res[VN] = { R, errs }; console.log('done', VN, errs.length);
  await ctx.close();
}
fs.writeFileSync(`${L.OUT}/primary-${names.join('_')}.json`, JSON.stringify(res, null, 1));
await b.close();
