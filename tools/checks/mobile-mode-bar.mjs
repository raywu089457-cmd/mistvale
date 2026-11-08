// mobile-mode-bar.mjs — T96: on phones the move-building bar must not cover the
// floating top controls (地圖 / 暫停 / 速度), must stay inside the viewport and
// clear of #topbar / #bottom-bar, and its cancel button must be tappable.
// Desktop layout must stay put. Usage: node tools/checks/mobile-mode-bar.mjs
// (game server on port 5024 is expected to be running; override with TARGET)
import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const PHONE = { viewport: { width: 402, height: 712 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const fails = [];
const fix = (m) => fails.push(m);

const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

async function open(opts) {
  const ctx = await b.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 240)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  try {
    await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  } catch (e) {
    console.log(`FAIL: TARGET unreachable: ${URL} (${String(e.message).split(/\r?\n/)[0]})`);
    await b.close();
    process.exit(1);
  }
  const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
  const closeAll = () => page.evaluate(() => { try { globalThis.__mistvaleGame.pilotStop?.(); } catch {} for (const k of ['leave', 'stop', 'exit', 'close']) document.querySelectorAll(`#pilotlab [data-pilot=${k}]`).forEach(b => b.offsetParent && b.click()); document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('[data-action=closeInspector]')?.offsetParent && document.querySelector('[data-action=closeInspector]').click(); });
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
  await closeAll();
  await act('selectBuilding', 'forge');
  await page.waitForTimeout(300);
  await page.click('#inspector [data-action=moveBuilding]');
  await page.waitForTimeout(400);
  return { ctx, page, errs };
}

function overlap(r, o) { return r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top; }

// ---- phone: the actual bug ----
{
  const { ctx, page, errs } = await open(PHONE);
  const m = await page.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, hidden: e.classList.contains('hidden') }; };
    const p = document.querySelector('#placement');
    const pr = p.getBoundingClientRect();
    const ib = box('#inspector');
    const insEl = document.querySelector('#inspector');
    const bandHits = [...document.querySelectorAll('#inspector .inspect-actions [data-action]')].filter(e => {
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      if (!(r.bottom > pr.top && r.top < pr.bottom)) return false;
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === e || e.contains(at));
    }).map(e => e.dataset.action);
    const hit = (sel) => { const e = document.querySelector(sel); if (!e) return { sel, missing: true }; const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const at = document.elementFromPoint(cx, cy); return { sel, ok: !!at && (at === e || e.contains(at)), got: at ? (at.id || at.className || at.tagName || '?').toString().slice(0, 40) : 'null', cx, cy }; };
    const c = document.querySelector('#placement [data-action=cancelMove]');
    const cr = c ? c.getBoundingClientRect() : null;
    const cat = cr ? document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) : null;
    return {
      placement: { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom, width: pr.width, height: pr.height, hidden: p.classList.contains('hidden') },
      topbar: box('#topbar'), bottom: box('#bottom-bar'),
      hits: ['[data-action=worldmap]', '[data-action=pause]', '[data-action=speed]'].map(hit),
      cancel: c ? { ok: !!cat && (cat === c || c.contains(cat)), got: cat ? (cat.id || cat.className || cat.tagName || '?').toString().slice(0, 40) : 'null' } : { missing: true },
      inspector: { ...ib, display: insEl ? getComputedStyle(insEl).display : 'none' },
      bandHits,
      viewport: { w: innerWidth, h: innerHeight },
    };
  });
  const p = m.placement;
  if (p.hidden || !(p.width > 0) || !(p.height > 0)) fix(`phone: #placement not visible/non-zero (hidden=${p.hidden} w=${p.width} h=${p.height})`);
  for (const h of m.hits) {
    if (h.missing) fix(`phone: ${h.sel} missing`);
    else if (!h.ok) fix(`phone: ${h.sel} centre hit by ${h.got}`);
  }
  if (!m.cancel.ok) fix(m.cancel.missing ? 'phone: [data-action=cancelMove] missing' : `phone: cancelMove centre hit by ${m.cancel.got}`);
  if (!(m.inspector.hidden || m.inspector.display === 'none' || !(m.inspector.width > 0) || !(m.inspector.height > 0))) fix(`phone: #inspector still visible (hidden=${m.inspector.hidden} display=${m.inspector.display} ${Math.round(m.inspector.width)}x${Math.round(m.inspector.height)})`);
  if (m.bandHits.length) fix(`phone: #placement band still contains hit-testable inspector action(s): ${m.bandHits.join(',')}`);
  if (p.left < 0 || p.top < 0 || p.right > m.viewport.w || p.bottom > m.viewport.h) fix(`phone: #placement outside viewport [${p.left},${p.top},${p.right},${p.bottom}] in ${m.viewport.w}x${m.viewport.h}`);
  if (!m.topbar || m.topbar.height <= 0) fix('phone: #topbar missing/zero-height');
  else if (overlap(p, m.topbar)) fix(`phone: #placement overlaps #topbar (bar top ${p.top} < topbar bottom ${m.topbar.bottom})`);
  if (!m.bottom || m.bottom.height <= 0) fix('phone: #bottom-bar missing/zero-height');
  else if (overlap(p, m.bottom)) fix(`phone: #placement overlaps #bottom-bar (bar bottom ${p.bottom} > bottom-bar top ${m.bottom.top})`);
  if (errs.length) fix(`phone: page errors: ${errs.join(' | ')}`);
  const fmt = (r) => r ? `[${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}]` : 'none';
  console.log(`phone: #placement ${fmt(p)} topbar bottom ${m.topbar ? Math.round(m.topbar.bottom) : '?'} bottom-bar top ${m.bottom ? Math.round(m.bottom.top) : '?'} viewport ${m.viewport.w}x${m.viewport.h}`);
  await ctx.close();
}

// ---- desktop guard: layout must not change ----
{
  const { ctx, page, errs } = await open(DESKTOP);
  const m = await page.evaluate(() => {
    const p = document.querySelector('#placement');
    const r = p.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, vw: innerWidth, centre: r.left + r.width / 2, inspectorHidden: document.querySelector('#inspector').classList.contains('hidden') };
  });
  if (Math.abs(m.top - 93) > 0.5) fix(`desktop: #placement top ${m.top} != 93`);
  if (Math.abs(m.centre - m.vw / 2) > 1) fix(`desktop: #placement centre ${m.centre} != viewport centre ${m.vw / 2}`);
  if (m.inspectorHidden) fix('desktop: #inspector hidden after moveBuilding (desktop must keep it open)');
  if (errs.length) fix(`desktop: page errors: ${errs.join(' | ')}`);
  console.log(`desktop: #placement rect [${Math.round(m.left)},${Math.round(m.top)},${Math.round(m.width)}x${Math.round(m.height)}] centre ${m.centre} / ${m.vw / 2}`);
  await ctx.close();
}

await b.close();
if (fails.length) {
  for (const f of fails) console.log(`FIX: ${f}`);
  console.log(`FAIL ${fails.length}`);
  process.exit(1);
}
console.log('OK phone move bar docked, top controls reachable, desktop unchanged');
