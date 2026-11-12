// round3-ux-lib.mjs — 第三輪 UX 設計審查共用工具(唯讀;只寫 output/ui-audit/round3-ux/)
import fs from 'node:fs';
import path from 'node:path';
import { chromium, VIEWS, launch, newCtx, act as actEl } from '../../../tools/checks/fix-a-lib.mjs';
export { VIEWS, launch, newCtx };
export const BASE = (process.env.TARGET || 'http://127.0.0.1:5191/').replace(/\/?$/, '/');
export const OUT = path.resolve('output/ui-audit/round3-ux');
export const W = ms => new Promise(r => setTimeout(r, ms));
export function session(viewName, tag) {
  const V = VIEWS[viewName]; const MOBILE = !!V.mobile;
  const dir = path.join(OUT, tag + '-' + viewName); fs.mkdirSync(dir, { recursive: true });
  const errs = []; const log = [];
  let page, ctx, b, n = 0;
  const api = {
    V, MOBILE, dir, errs, log,
    async open(initScript) {
      b = await launch(); ctx = await newCtx(b, V);
      if (initScript) await ctx.addInitScript(initScript);
      page = await ctx.newPage(); api.page = page;
      page.on('pageerror', e => errs.push('pageerror ' + (e.message || e)));
      page.on('console', m => { if (m.type() === 'error') errs.push('console.error ' + m.text().slice(0, 200)); });
      page.on('dialog', d => { errs.push('dialog ' + d.message()); d.dismiss().catch(() => {}); });
      return page;
    },
    async goto(url) { await page.goto(url || BASE, { waitUntil: 'commit', timeout: 120000 }); await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 }); await W(800); },
    async shot(name, opts = {}) { n++; const f = `${dir}/${String(n).padStart(2, '0')}-${name}.png`; try { await page.screenshot({ path: f, ...opts }); } catch (e) { errs.push('shot ' + e.message); } log.push(`${n}:${name}`); return f; },
    async tap(sel, timeout = 2500) { const loc = typeof sel === 'string' ? page.locator(sel).first() : sel; try { MOBILE ? await loc.tap({ timeout }) : await loc.click({ timeout }); await W(350); return { ok: true }; } catch (e) { return { ok: false, err: String(e.message).split('\n')[0].slice(0, 160) }; } },
    act: (a, id) => actEl(page, a, id),
    adv: (sec, dt = 0.25) => page.evaluate(([sec, dt]) => { const g = globalThis.__mistvaleGame; for (let t = 0; t < sec; t += dt) g.tick(dt); }, [sec, dt]),
    ev: (fn, arg) => page.evaluate(fn, arg),
    text: sel => page.evaluate(s => document.querySelector(s)?.innerText?.replace(/\s+/g, ' ').trim() || null, sel),
    async close() { try { await b.close(); } catch {} },
  };
  return api;
}
