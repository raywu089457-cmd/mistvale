// round3-mobile-uiscale.mjs — 介面大小:各尺寸的最大可選級距、被夾住的行為,以及強制 1.5 倍(壓力測試)時小手機版面。唯讀。
// 用法: node pipeline/scripts/ui-audit/round3-mobile-uiscale.mjs m360x640,m375x667
import fs from 'node:fs';
process.env.OUT = 'output/ui-audit/round3-mobile/uiscale';
const L = await import('./round3-mobile-lib.mjs');
const names = (process.argv[2] || 'm360x640,m375x667').split(',');
const BASE = (process.env.TARGET || 'http://127.0.0.1:5192').replace(/\/$/, '');
const W = ms => new Promise(r => setTimeout(r, ms));
const b = await L.launch();
const res = [];
for (const VN of names) {
  const V = L.VIEWS[VN]; const errs = [];
  const ctx = await L.newCtx(b, V); await ctx.addInitScript(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
  const page = await ctx.newPage(); L.hook(page, VN, errs);
  await L.boot(page, BASE + '/?preview=1'); await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation-duration:0s!important}' }); await W(2500);
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
  const R = { view: VN, steps: null, used: null, stress: {} };
  await L.act(page, 'settings'); await W(500);
  R.steps = await page.evaluate(() => [...document.querySelectorAll('[data-uiscale-step]')].map(e => ({ st: e.dataset.uiscaleStep, dis: e.disabled || e.getAttribute('aria-disabled') === 'true', w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })));
  // 點最大的可選級距(含被 disabled 的,模擬「切到最大值」)
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.setSetting('uiScale', 1.5); });
  await L.act(page, 'setUiScale', '1.5'); await W(500);
  R.used = await page.evaluate(() => ({ used: document.documentElement.dataset.uiScale, cssVar: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'), setting: globalThis.__mistvaleGame.state.settings.uiScale, now: document.querySelector('[data-uiscale-now]')?.textContent }));
  await page.screenshot({ path: `${L.OUT}/shots/${VN}-settings-max.png` });
  await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await W(300);
  // 壓力測試:不管夾制,硬套 --ui-scale 1.5(模擬夾制失效、或使用者在大螢幕設定後存檔搬到小手機的 resize 前一幀)
  await page.evaluate(() => { document.documentElement.style.setProperty('--ui-scale', '1.5'); document.documentElement.dataset.uiScale = '1.5'; }); await W(500);
  const doScan = async tag => { const sc = await page.evaluate(L.SCAN); const sm = L.summarize(sc); R.stress[tag] = sm; await page.screenshot({ path: `${L.OUT}/shots/${VN}-stress-${tag}.png` }); };
  await doScan('hud');
  for (const a of ['build', 'hunters', 'trade', 'craft', 'quests', 'settings', 'worldmap']) {
    await L.act(page, a); await W(500); await doScan(a);
    R.stress[a + '_modal'] = await page.evaluate(() => { const m = document.querySelector('#modal').getBoundingClientRect(), bar = document.querySelector('#bottom-bar').getBoundingClientRect(), cc = document.querySelector('#modal-content'); const x = document.querySelector('#modal [data-action=close]'); const xr = x?.getBoundingClientRect(); const t = x && document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2); return { top: Math.round(m.top), bottom: Math.round(m.bottom), barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom), vh: innerHeight, vw: innerWidth, right: Math.round(m.right), left: Math.round(m.left), contentH: cc?.clientHeight, xHit: !!t && (t === x || x.contains(t)), hscroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
    await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await W(250);
  }
  R.stress.bar = await page.evaluate(() => { const bar = document.querySelector('#bottom-bar').getBoundingClientRect(); const tb = document.querySelector('#topbar').getBoundingClientRect(); return { barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom), barW: Math.round(bar.width), tbBottom: Math.round(tb.bottom), tbW: Math.round(tb.width), vh: innerHeight, vw: innerWidth, hscroll: document.documentElement.scrollWidth, tabs: [...document.querySelectorAll('#bottom-bar>button')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }) }; });
  R.errs = errs;
  res.push(R); console.log('done', VN, JSON.stringify(R.used));
  await ctx.close();
}
fs.writeFileSync(`${L.OUT}/uiscale-${names.join('_')}.json`, JSON.stringify(res, null, 1));
await b.close();
