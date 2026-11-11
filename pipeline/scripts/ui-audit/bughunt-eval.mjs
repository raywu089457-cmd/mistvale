// bughunt-eval.mjs — 臨時探查: node bughunt-eval.mjs <desktop|tablet|phone|land|WxH> "<開啟動作,逗號分隔>" "<頁面內 JS 運算式>" [shotName]
// 開啟動作: 任一 data-action 名稱(例 build)、wait:ms、sel:<名稱>(__mistvaleSelect)、key:<按鍵>
import * as L from './bughunt-lib.mjs';
const vn = process.argv[2] || 'desktop';
const V = L.VIEWS[vn] || (() => { const [w, h] = vn.split('x').map(Number); return { w, h, mobile: Math.min(w, h) < 600 }; })();
const b = await L.launch(); const ctx = await L.newCtx(b, V); const page = await ctx.newPage();
const errs = []; L.hook(page, vn, errs);
await L.boot(page); await page.waitForTimeout(1500);
await page.evaluate(() => { document.querySelector('#title-screen')?.remove(); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999 }); g.state.paused = true; });
for (const step of (process.argv[3] || '').split(',').filter(Boolean)) {
  if (step.startsWith('wait:')) await page.waitForTimeout(Number(step.slice(5)));
  else if (step.startsWith('sel:')) await page.evaluate(id => globalThis.__mistvaleSelect(id), step.slice(4));
  else if (step.startsWith('key:')) await page.keyboard.press(step.slice(4));
  else await L.act(page, ...step.split(':'));
  await page.waitForTimeout(450);
}
if (process.argv[5]) await page.screenshot({ path: `${L.OUT}/shots/${process.argv[5]}.png` });
const r = await page.evaluate(new Function('return (' + (process.argv[4] || '1') + ')'));
console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
if (errs.length) console.log('ERRS', JSON.stringify(errs));
await b.close();
