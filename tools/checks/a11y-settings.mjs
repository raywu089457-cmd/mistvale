// a11y-settings.mjs — Experiment 9 (T63–T66): an 無障礙 (accessibility) section in the existing 遊戲設定 modal.
//
// Contract the cards specify (and nothing more):
//   - the settings modal (opened by the existing [data-action="settings"] button) shows a section whose text
//     contains 無障礙, with one button per option: [data-a11y="<key>"][data-value="<value>"]
//       contrast: normal | high      motion: system | reduce      numbers: short | full
//     defaults are the first value. The chosen button has aria-pressed="true", the others "false".
//   - the current values are mirrored on <html>: data-contrast / data-motion / data-numbers, and survive a reload.
//   - part b: contrast=high makes HUD + modal text readable: >= 60% of text sits on a solid (measurable) background,
//     >= 7:1 for 95% of measured text, nothing < 4.5:1.
//   - part c: motion=reduce removes every > 100ms animation/transition in the HUD, modals and toasts even when
//     the OS asks for full motion; motion=system follows the OS and leaves normal users' motion alone.
//   - part d: numbers=full shows exact resource numbers with thousands separators in the top bar on a 375px
//     phone too, without clipping; numbers=short keeps today's abbreviation.
//
// This checker builds THIS checkout (node build.mjs → dist/), serves it on 127.0.0.1 with server.mjs on its own
// port and drives it with Playwright — it never touches the shared :5024 server.
// Usage: node tools/checks/a11y-settings.mjs [--part a|b|c|d|all]   (SKIP_BUILD=1 reuses dist/)
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pi = process.argv.indexOf('--part');
const part = (pi > 0 ? process.argv[pi + 1] || '' : 'all').toLowerCase();
const PARTS = part === 'all' ? ['a', 'b', 'c', 'd'] : part.split(',');
if (!PARTS.length || PARTS.some(p => !'abcd'.includes(p) || p.length !== 1)) { console.log('usage: node tools/checks/a11y-settings.mjs [--part a|b|c|d|all]'); process.exit(2); }
const OPTS = { contrast: ['normal', 'high'], motion: ['system', 'reduce'], numbers: ['short', 'full'] };
const DESK = { width: 1280, height: 800 }, PHONE = { width: 375, height: 812 };
const fails = [];
const fail = m => { fails.push(m); console.log('FIX: ' + m); };

// --- scope: game logic files are off limits --------------------------------------------------------------
for (const f of ['src/pixel-game.js', 'src/pixel-world.js']) {
  if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', f], { cwd: ROOT }).status !== 0) fail(`${f} was edited; it is out of scope`);
}

// --- build + serve this checkout -------------------------------------------------------------------------
if (!process.env.SKIP_BUILD) {
  const b = spawnSync(process.execPath, ['build.mjs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (b.status !== 0) { console.log((b.stdout + b.stderr).trim().split('\n').slice(-8).join('\n')); console.log('FIX: node build.mjs failed'); process.exit(1); }
}
if (path.basename(path.dirname(ROOT)) === 'work') { console.log('SKIP: this checkout builds into ../../outputs (main checkout); run it in a clone'); process.exit(2); }
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true });
const URL = `http://127.0.0.1:${PORT}/`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const { createRequire } = await import('node:module');
  for (const r of [process.env.PLAYWRIGHT_ROOT, process.env.APPDATA && path.join(process.env.APPDATA, 'npm/node_modules'), path.join(ROOT, 'node_modules')].filter(Boolean)) {
    try { return createRequire(path.join(r, 'noop.js'))('playwright'); } catch {}
  }
  return null;
}
const pw = await loadPlaywright();
if (!pw) { server.kill(); console.log('FIX: playwright not found (set PLAYWRIGHT_ROOT)'); process.exit(1); }
let browser;
try { browser = await pw.chromium.launch({ headless: true }); }
catch { for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe', process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')].filter(p => p && fs.existsSync(p))) { try { browser = await pw.chromium.launch({ headless: true, executablePath: p }); break; } catch {} } }
if (!browser) { server.kill(); console.log('FIX: no launchable Chromium/Chrome'); process.exit(1); }

const wait = ms => new Promise(r => setTimeout(r, ms));
async function boot(page) {
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame, null, { timeout: 180000 });
  await page.evaluate(() => {
    if (document.querySelector('#game-ui')?.classList.contains('hidden')) document.querySelector('#start-screen button')?.click();
    document.querySelector('#game-ui')?.classList.remove('hidden');
    document.querySelector('#start-screen')?.classList.add('hidden');
  });
  await wait(1500);
}
const click = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
const modalType = page => page.evaluate(() => document.querySelector('#modal-backdrop')?.classList.contains('hidden') ? '' : document.querySelector('#modal')?.dataset.type || '?');
async function openSettings(page) {
  if (await modalType(page)) { await click(page, '#modal [data-action=close]'); await wait(200); }
  if (!await click(page, '[data-action="settings"]')) return false;
  await wait(500);
  return (await modalType(page)) === 'settings';
}
async function setOpt(page, key, value) {
  if ((await modalType(page)) !== 'settings' && !await openSettings(page)) return false;
  const ok = await click(page, `#modal [data-a11y="${key}"][data-value="${value}"]`);
  await wait(500);
  return ok;
}
const htmlAttr = (page, key) => page.evaluate(k => document.documentElement.dataset[k] ?? null, key);
async function closeModal(page) { await click(page, '#modal [data-action=close]'); await wait(250); }
async function context(viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', ...extra });
  const page = await ctx.newPage();
  await boot(page);
  return { ctx, page };
}

// --- part a: the section, its buttons, the <html> mirror, persistence --------------------------------------
async function partA() {
  for (const [label, vp] of [['desktop', DESK], ['phone', PHONE]]) {
    const { ctx, page } = await context(vp);
    if (!await openSettings(page)) { fail(`a(${label}): [data-action="settings"] does not open the 遊戲設定 modal`); await ctx.close(); continue; }
    const text = await page.evaluate(() => document.querySelector('#modal-content')?.textContent || '');
    if (!text.includes('無障礙')) fail(`a(${label}): the settings modal has no 無障礙 section`);
    for (const [key, values] of Object.entries(OPTS)) {
      if ((await htmlAttr(page, key)) !== values[0]) fail(`a(${label}): <html data-${key}> should start as "${values[0]}", got ${JSON.stringify(await htmlAttr(page, key))}`);
      for (const v of [...values.slice(1), values[0]]) {
        if (!await setOpt(page, key, v)) { fail(`a(${label}): no button [data-a11y="${key}"][data-value="${v}"] in the settings modal`); continue; }
        const st = await page.evaluate(([k, val]) => {
          const bs = [...document.querySelectorAll(`#modal [data-a11y="${k}"]`)];
          const me = bs.find(b => b.dataset.value === val); const r = me?.getBoundingClientRect();
          return { attr: document.documentElement.dataset[k], pressed: bs.map(b => [b.dataset.value, b.getAttribute('aria-pressed')]), h: r?.height || 0, w: r?.width || 0 };
        }, [key, v]);
        if (st.attr !== v) fail(`a(${label}): clicking ${key}=${v} leaves <html data-${key}>=${JSON.stringify(st.attr)}`);
        const bad = st.pressed.filter(([val, p]) => p !== (val === v ? 'true' : 'false'));
        if (bad.length) fail(`a(${label}): after ${key}=${v}, aria-pressed is wrong on ${bad.map(b => b[0]).join(', ')}`);
        if (label === 'phone' && (st.h < 32 || st.w < 32)) fail(`a(phone): ${key}=${v} button is ${Math.round(st.w)}x${Math.round(st.h)}px (min 32x32)`);
      }
    }
    if (label === 'phone') {
      const o = await page.evaluate(() => { const c = document.querySelector('#modal-content'); return c ? c.scrollWidth - c.clientWidth : 0; });
      if (o > 1) fail(`a(phone): the settings modal scrolls sideways by ${o}px`);
    }
    if (label === 'desktop') {   // persistence: choose the non-defaults, reload, everything must come back
      for (const [key, values] of Object.entries(OPTS)) await setOpt(page, key, values[1]);
      await page.evaluate(() => { try { globalThis.__mistvaleGame && document.dispatchEvent(new Event('visibilitychange')); } catch {} });
      await page.reload({ waitUntil: 'commit' }); await page.waitForFunction(() => globalThis.__mistvaleGame, null, { timeout: 180000 }); await wait(1500);
      for (const [key, values] of Object.entries(OPTS)) {
        const a = await htmlAttr(page, key);
        if (a !== values[1]) fail(`a(reload): ${key}=${values[1]} was not kept across a reload (<html data-${key}>=${JSON.stringify(a)})`);
      }
      await page.evaluate(() => { document.querySelector('#game-ui')?.classList.remove('hidden'); document.querySelector('#start-screen')?.classList.add('hidden'); });
      if (await openSettings(page)) {
        const p = await page.evaluate(() => [...document.querySelectorAll('#modal [data-a11y][aria-pressed="true"]')].map(b => b.dataset.a11y + '=' + b.dataset.value).sort().join(' '));
        const want = Object.entries(OPTS).map(([k, v]) => k + '=' + v[1]).sort().join(' ');
        if (p !== want) fail(`a(reload): reopened settings show ${p || 'nothing'} pressed, want ${want}`);
      }
    }
    await ctx.close();
  }
}

// --- part b: high contrast -------------------------------------------------------------------------------
const CONTRAST = () => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + bot[i] * (1 - a)).concat(1); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const out = { measured: 0, unknown: 0, rows: [] };
  const roots = ['#topbar', '#bottom-bar', '#modal'].map(s => document.querySelector(s)).filter(Boolean);
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || parseFloat(cs.fontSize) === 0) continue;
    const layers = []; let ok = false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.opacity === '0') { layers.length = 0; ok = null; break; }
      // texture/gradient behind the text (background-image, a filled border-image, or a painted ::before/::after): cannot measure
      if ((s.backgroundImage && s.backgroundImage !== 'none') || (s.borderImageSource && s.borderImageSource !== 'none')) break;
      if (['::before', '::after'].some(p => { const ps = getComputedStyle(n, p); return ps.content !== 'none' && ps.backgroundImage !== 'none'; })) break;
      const bg = parse(s.backgroundColor); if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.999) { ok = true; break; } }
    }
    if (ok === null) continue;
    if (!ok) { out.unknown++; continue; }
    let bg = layers.pop(); while (layers.length) bg = over(layers.pop(), bg);
    const fg = over(parse(cs.color) || [0, 0, 0, 1], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    out.measured++;
    out.rows.push([ratio, (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')) + ' "' + el.textContent.trim().slice(0, 12) + '"']);
  }
  out.rows.sort((a, b) => a[0] - b[0]);
  return out;
};
async function partB() {
  for (const [label, vp] of [['desktop', DESK], ['phone', PHONE]]) {
    const { ctx, page } = await context(vp);
    // CONTRAST_BASELINE=1: measure the page as it is (calibration only), without asking for high contrast
    if (!process.env.CONTRAST_BASELINE && !await setOpt(page, 'contrast', 'high')) { fail(`b(${label}): no contrast=high button`); await ctx.close(); continue; }
    await closeModal(page);
    let all = { measured: 0, unknown: 0, rows: [] };
    for (const open of [null, 'hunters', 'settings']) {
      if (open) { await click(page, `[data-action="${open}"]`); await wait(600); }
      const r = await page.evaluate(CONTRAST);
      all.measured += r.measured; all.unknown += r.unknown; all.rows.push(...r.rows);
      if (open) await closeModal(page);
    }
    all.rows.sort((a, b) => a[0] - b[0]);
    const low7 = all.rows.filter(r => r[0] < 7), low45 = all.rows.filter(r => r[0] < 4.5);
    console.log(`b(${label}): ${all.measured} text elements measured, ${all.unknown} on unmeasurable (image/transparent) backgrounds, ${low7.length} below 7:1, worst ${all.rows[0]?.[0].toFixed(2) ?? '-'}`);
    // today almost every HUD/modal label sits on a pixel-art texture (3 of ~150 measurable), so high contrast has to swap
    // textures for solid colours behind text; 60% leaves room for icons/art that legitimately keep their image
    const total = all.measured + all.unknown;
    if (all.measured < total * 0.6) fail(`b(${label}): only ${all.measured}/${total} text elements sit on a solid background in high contrast (need 60%); textures, gradients and filled border-images behind text cannot be checked or relied on`);
    if (low45.length) fail(`b(${label}): ${low45.length} text elements below 4.5:1 in high contrast, e.g. ${low45.slice(0, 5).map(r => r[1] + ' ' + r[0].toFixed(2)).join('; ')}`);
    if (low7.length > all.measured * 0.05) fail(`b(${label}): ${low7.length}/${all.measured} text elements below 7:1 in high contrast, e.g. ${low7.slice(0, 5).map(r => r[1] + ' ' + r[0].toFixed(2)).join('; ')}`);
    await ctx.close();
  }
}

// --- part c: reduce motion override ----------------------------------------------------------------------
const MOTION = () => {
  const out = [];
  for (const a of document.getAnimations()) {
    const t = a.effect?.target, d = Number(a.effect?.getComputedTiming().duration) || 0;
    if (!t || t.tagName === 'CANVAS' || t.closest?.('#world') || a.playState === 'finished') continue;
    if (d > 100) out.push(`${t.id ? '#' + t.id : t.tagName.toLowerCase() + '.' + String(t.className).split(' ')[0]} ${a.animationName || a.transitionProperty || 'animate()'} ${Math.round(d)}ms`);
  }
  const sec = v => Math.max(0, ...String(v).split(',').map(x => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1) || 0));
  for (const el of document.querySelectorAll('#topbar *, #bottom-bar *, #modal, #modal *, #modal-backdrop, #toasts *, .pixel-button')) {
    const cs = getComputedStyle(el);
    const tr = sec(cs.transitionDuration), an = cs.animationName !== 'none' ? sec(cs.animationDuration) : 0;
    if (tr > 0.1 || an > 0.1) out.push(`${el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]} css ${Math.round(Math.max(tr, an) * 1000)}ms`);
  }
  return [...new Set(out)];
};
async function motionRun(page) {
  const seen = new Set();
  for (const step of ['hunters', 'close', 'build', 'close', 'settings', 'close']) {
    if (step === 'close') await click(page, '#modal [data-action=close]'); else await click(page, `[data-action="${step}"]`);
    await wait(60); (await page.evaluate(MOTION)).forEach(x => seen.add(x));
    await wait(300); (await page.evaluate(MOTION)).forEach(x => seen.add(x));
  }
  return [...seen];
}
async function partC() {
  { // OS wants full motion, player chose reduce → calm
    const { ctx, page } = await context(DESK, { reducedMotion: 'no-preference' });
    if (!await setOpt(page, 'motion', 'reduce')) fail('c: no motion=reduce button');
    await closeModal(page);
    const off = await motionRun(page);
    console.log(`c(reduce, OS full motion): ${off.length} offenders`);
    if (off.length) fail(`c: with motion=reduce, ${off.length} animations/transitions still run > 100ms, e.g. ${off.slice(0, 6).join('; ')}`);
    await ctx.close();
  }
  { // OS asks for reduce, setting left at system → calm too
    const { ctx, page } = await context(DESK, { reducedMotion: 'reduce' });
    const off = await motionRun(page);
    console.log(`c(system, OS reduce): ${off.length} offenders`);
    if (off.length) fail(`c: motion=system does not follow the OS reduce preference, e.g. ${off.slice(0, 6).join('; ')}`);
    await ctx.close();
  }
  { // normal player, normal OS → motion still exists somewhere
    const { ctx, page } = await context(DESK, { reducedMotion: 'no-preference' });
    const on = await motionRun(page);
    console.log(`c(system, OS full motion): ${on.length} animated things`);
    if (!on.length) fail('c: with motion=system and no OS preference nothing animates any more; normal players must see no change');
    await ctx.close();
  }
}

// --- part d: full numbers ---------------------------------------------------------------------------------
async function partD() {
  for (const [label, vp] of [['desktop', DESK], ['phone', PHONE]]) {
    const { ctx, page } = await context(vp);
    const setRes = () => page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.gold = 1234567; s.wood = 98765; s.ore = 4321; s.gems = 250000; });
    const read = () => page.evaluate(() => ['gold', 'wood', 'ore', 'gems'].map(id => {
      const el = document.getElementById(id); if (!el) return { id, text: null };
      const btn = el.closest('button') || el.parentElement, r = el.getBoundingClientRect();
      return { id, text: el.textContent.trim(), clip: Math.max(el.scrollWidth - el.clientWidth, btn.scrollWidth - btn.clientWidth), out: r.right > innerWidth + 1 || r.left < -1 };
    }));
    if (!await setOpt(page, 'numbers', 'full')) { fail(`d(${label}): no numbers=full button`); await ctx.close(); continue; }
    await closeModal(page); await setRes(); await wait(1200); await setRes(); await wait(900);
    const want = { gold: '1,234,567', wood: '98,765', ore: '4,321', gems: '250,000' };
    for (const r of await read()) {
      if (r.text !== want[r.id]) fail(`d(${label}): numbers=full shows #${r.id} as ${JSON.stringify(r.text)}, want "${want[r.id]}"`);
      else if (r.clip > 1) fail(`d(${label}): numbers=full clips #${r.id} "${r.text}" by ${r.clip}px`);
      else if (r.out) fail(`d(${label}): numbers=full pushes #${r.id} off screen`);
    }
    const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (o > 1) fail(`d(${label}): numbers=full makes the page scroll sideways by ${o}px`);
    if (label === 'phone') {
      await setOpt(page, 'numbers', 'short'); await closeModal(page); await setRes(); await wait(900);
      const g = (await read()).find(r => r.id === 'gold');
      if (!/M$/.test(g?.text || '')) fail(`d(phone): numbers=short should keep the abbreviation (1.2M), got ${JSON.stringify(g?.text)}`);
    }
    await ctx.close();
  }
}

try {
  if (PARTS.includes('a')) await partA();
  if (PARTS.includes('b')) await partB();
  if (PARTS.includes('c')) await partC();
  if (PARTS.includes('d')) await partD();
} catch (e) { fail('checker crashed: ' + String(e.message).split('\n')[0]); }
finally { await browser.close(); server.kill(); spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f']); }
if (fails.length) { console.log(`a11y-settings(${PARTS.join('')}): ${fails.length} problem(s)`); process.exit(1); }
console.log(`a11y-settings(${PARTS.join('')}): PASS`);
