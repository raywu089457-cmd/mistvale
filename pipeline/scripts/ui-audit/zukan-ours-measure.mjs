// 量我們自己的版面(5193): 頁籤列、抽屜、X、標題列、遮罩、確認框、HUD。用法: TARGET=http://127.0.0.1:5193/?preview=1 node 本檔
import { chromium, launch, newCtx, boot, act, VIEWS } from '../../../tools/checks/fix-a-lib.mjs';
const T = process.env.TARGET || 'http://127.0.0.1:5193/?preview=1';
const b = await launch(); const out = {};
for (const vn of ['phone', 'desktop', 'land']) {
  const v = VIEWS[vn]; const ctx = await newCtx(b, v); const page = await ctx.newPage();
  await boot(page, T);
  const rect = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, bd: cs.border.slice(0, 40), rad: cs.borderRadius, fs: cs.fontSize, fam: cs.fontFamily.slice(0, 30) }; }, sel);
  const R = {};
  R.viewport = [v.w, v.h];
  R.topbar = await rect('#topbar'); R.hvLeft = await rect('#hv-left'); R.bottomBar = await rect('#bottom-bar');
  R.tabBtn = await rect('#bottom-bar>button'); R.tabCount = await page.evaluate(() => document.querySelectorAll('#bottom-bar>button').length);
  R.tabLabel = await page.evaluate(() => { const e = document.querySelector('#bottom-bar>button span, #bottom-bar>button b'); return e ? { fs: getComputedStyle(e).fontSize, c: getComputedStyle(e).color } : null; });
  R.resNum = await page.evaluate(() => { const e = document.querySelector('#topbar .hv-res b, #topbar [data-res] b, #topbar .resource b'); if (!e) return null; const c = getComputedStyle(e); return { fs: c.fontSize, c: c.color, sh: c.textShadow.slice(0, 40) }; });
  R.hudHtml = await page.evaluate(() => [...document.querySelectorAll('#topbar > *')].map(e => (e.id || e.className || e.tagName).toString().slice(0, 30) + ':' + Math.round(e.getBoundingClientRect().left) + ',' + Math.round(e.getBoundingClientRect().top) + ',' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  for (const [name, a, id] of [['hunters', 'hunters'], ['build', 'build'], ['trade', 'trade'], ['quests', 'quest'], ['settings', 'settings'], ['inspector', 'selectBuilding', 'forge'], ['hunter', 'hunter', null]]) {
    await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); });
    const aid = name === 'hunter' ? await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id) : id;
    await act(page, a, aid); await page.waitForTimeout(500);
    const P = {};
    P.modal = await rect('#modal'); P.inspector = await rect('#inspector'); P.backdrop = await rect('#modal-backdrop');
    P.close = await rect('#modal [data-action=close]'); P.inspClose = await rect('#inspector [data-action=closeInspector]');
    P.title = await rect('#modal .modal-title'); P.firstBtn = await rect('#modal-content .pixel-button');
    P.kind = await page.evaluate(() => document.querySelector('#modal')?.dataset.kind || null);
    P.tabbarVisible = await page.evaluate(() => { const e = document.querySelector('#bottom-bar'); return getComputedStyle(e).opacity + '/' + getComputedStyle(e).visibility; });
    P.topbarVis = await page.evaluate(() => getComputedStyle(document.querySelector('#topbar')).visibility + '/' + getComputedStyle(document.querySelector('#topbar')).opacity);
    R[name] = P;
  }
  await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); });
  await page.evaluate(() => globalThis.__mistvaleConfirm('確定要重置村莊嗎？'));
  await page.waitForTimeout(400);
  R.confirm = { modal: await rect('#modal'), btn: await rect('#modal .pixel-button'), bd: await page.evaluate(() => getComputedStyle(document.querySelector('#modal-backdrop')).backgroundColor) };
  out[vn] = R; await ctx.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));
