// save-slots.mjs — Experiment 10 (T67–T71): three save slots (存檔管理), switching, export/import, delete, offline-on-switch.
//
// Contract the cards specify (and nothing more):
//   storage   slot n lives in localStorage `mistvale-pixel-v2:slot<n>` (n = 1..3), the active slot number in
//             `mistvale-pixel-v2:active` ("1".."3"). The legacy key `mistvale-pixel-v2` is never written or deleted
//             again; on a boot with no slot keys it is copied into slot 1 (active = 1). Autosave writes the active slot.
//   UI        the settings modal has a [data-action="saves"] button that opens a modal listing three
//             #modal [data-slot="1|2|3"] rows with data-empty="true|false", data-active="true|false" and, when
//             filled, data-gold (floor of the slot's gold) and data-hunters (hunter count). Row buttons:
//             [data-slot-action="load|new|export|delete"], plus an <input type="file"> in the row for import.
//   b switch  load saves the current game into its slot first, then plays the chosen slot; new starts a fresh game
//             in an empty slot; globalThis.__mistvaleGame is always the live game (a page reload is allowed).
//   c files   export downloads <...slot1...>.json holding that slot's save; import validates (JSON object with a
//             numeric gold and a hunters array) — otherwise the modal shows 無法匯入 and nothing changes.
//   d delete  asks first: [data-confirm="yes"] / [data-confirm="no"], focus on "no", Escape cancels without closing
//             the modal; the active slot cannot be deleted.
//   e offline switching to a slot saved >= 60 s ago (not paused) shows the offline-earnings modal, like a boot does;
//             leaving and coming back right away must not grant it again.
//
// Builds THIS checkout (node build.mjs → dist/), serves it on its own 127.0.0.1 port, drives Playwright.
// Usage: node tools/checks/save-slots.mjs [--part a|b|c|d|e|all]   (comma lists allowed; SKIP_BUILD=1 reuses dist/)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pi = process.argv.indexOf('--part');
const part = (pi > 0 ? process.argv[pi + 1] || '' : 'all').toLowerCase();
const PARTS = part === 'all' ? ['a', 'b', 'c', 'd', 'e'] : part.split(',');
if (!PARTS.length || PARTS.some(p => !'abcde'.includes(p) || p.length !== 1)) { console.log('usage: node tools/checks/save-slots.mjs [--part a|b|c|d|e|all]'); process.exit(2); }
const LEG = 'mistvale-pixel-v2', SLOT = n => `${LEG}:slot${n}`, ACT = `${LEG}:active`;
const DESK = { width: 1280, height: 800 }, PHONE = { width: 375, height: 812 };
const fails = [];
const fail = m => { fails.push(m); console.log('FIX: ' + m); };
const note = m => console.log(m);

for (const f of ['src/pixel-game.js', 'src/pixel-world.js', 'src/pixel-data.js']) {
  if (spawnSync('git', ['diff', '--quiet', 'HEAD', '--', f], { cwd: ROOT }).status !== 0) fail(`${f} was edited; it is out of scope`);
}

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
const AUTOSAVE = 6500;   // the game autosaves every 5 s once started
// page.evaluate that survives a navigation started by the page itself (slot switching may reload)
async function ev(page, fn, arg) {
  for (let i = 0; i < 40; i++) { try { return await page.evaluate(fn, arg); } catch (e) { if (!/context|navigat|Target/i.test(String(e))) throw e; await wait(500); } }
  throw new Error('page kept navigating');
}
async function ready(page) {
  for (let i = 0; i < 3; i++) {
    try { await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden'), null, { timeout: 180000 }); break; }
    catch (e) { if (!/context|navigat/i.test(String(e))) throw e; await wait(800); }
  }
  await wait(1200);
}
// a context whose storage is set ONCE (first load of the tab), then left to the game across reloads
async function context(viewport, seed = null) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', acceptDownloads: true });
  await ctx.addInitScript(s => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1'); localStorage.clear();
    for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v);
  }, seed);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await ready(page);
  return { ctx, page };
}
const ls = (page, k) => ev(page, key => localStorage.getItem(key), k);
const slotGold = async (page, n) => { const raw = await ls(page, SLOT(n)); try { return raw ? JSON.parse(raw).gold : null; } catch { return 'bad-json'; } };
const gold = page => ev(page, () => globalThis.__mistvaleGame?.state?.gold);
const setGold = (page, g) => ev(page, v => { globalThis.__mistvaleGame.state.gold = v; }, g);
const modalType = page => ev(page, () => document.querySelector('#modal-backdrop')?.classList.contains('hidden') ? '' : document.querySelector('#modal')?.dataset.type || '?');
const click = (page, sel) => ev(page, s => { const el = document.querySelector(s); if (!el || el.disabled) return false; el.click(); return true; }, sel);
async function openSaves(page) {
  if (await ev(page, () => !!document.querySelector('#modal [data-slot="1"]') && !document.querySelector('#modal-backdrop')?.classList.contains('hidden'))) return true;
  if (await modalType(page)) { await click(page, '#modal [data-action=close]'); await wait(250); }
  if (!await click(page, '[data-action="settings"]')) return false;
  await wait(500);
  if (!await click(page, '#modal [data-action="saves"]')) return false;
  await wait(600);
  return ev(page, () => !!document.querySelector('#modal [data-slot="1"]'));
}
const rows = page => ev(page, () => [1, 2, 3].map(n => { const r = document.querySelector(`#modal [data-slot="${n}"]`); return r ? { ...r.dataset } : null; }));
async function slotAction(page, n, action) {
  if (!await openSaves(page)) return false;
  const ok = await click(page, `#modal [data-slot="${n}"] [data-slot-action="${action}"]`);
  if (ok) { await wait(1500); await ready(page); }
  return ok;
}
async function waitFor(page, fn, arg, ms = 30000) { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(page, fn, arg)) return true; await wait(400); } return false; }

// --- real save fixtures: serialised by the game itself ------------------------------------------------------
let BASE = null, FRESH_GOLD = 0, FRESH_HUNTERS = 0;
async function fixtures() {
  const { ctx, page } = await context(DESK, {});
  const raw = await ev(page, () => JSON.stringify(globalThis.__mistvaleGame.serialize()));
  BASE = JSON.parse(raw); FRESH_GOLD = BASE.gold; FRESH_HUNTERS = BASE.hunters.length;
  await ctx.close();
}
const save = (g, agoSec = 0) => JSON.stringify({ ...BASE, gold: g, paused: false, savedAt: Date.now() - agoSec * 1000 });

// --- part a: storage contract, legacy migration, autosave target, the slots modal ---------------------------
async function partA() {
  { // a1: an existing player's legacy save becomes slot 1; the legacy key is left exactly as it was
    const legacy = save(424242);
    const { ctx, page } = await context(DESK, { [LEG]: legacy });
    const g = await gold(page);
    if (!(g >= 424242 && g < 440000)) fail(`a(migrate): booting with only the legacy save should load it (gold 424242), game has ${g}`);
    await wait(AUTOSAVE);
    const s1 = await slotGold(page, 1);
    if (!(s1 >= 424242)) fail(`a(migrate): slot 1 (${SLOT(1)}) should hold the migrated save, has gold ${JSON.stringify(s1)}`);
    if ((await ls(page, ACT)) !== '1') fail(`a(migrate): ${ACT} should be "1", is ${JSON.stringify(await ls(page, ACT))}`);
    await setGold(page, 500000); await wait(AUTOSAVE);
    const s1b = await slotGold(page, 1);
    if (!(s1b >= 500000)) fail(`a(autosave): after gold=500000 the autosave should update slot 1, it has ${JSON.stringify(s1b)}`);
    if ((await ls(page, LEG)) !== legacy) fail('a(migrate): the legacy key mistvale-pixel-v2 was changed or deleted; it must stay exactly as it was');
    await ctx.close();
  }
  for (const [label, vp] of [['desktop', DESK], ['phone', PHONE]]) { // a2 + a3: a new player, and the slots modal
    const { ctx, page } = await context(vp, {});
    await wait(AUTOSAVE);
    if (label === 'desktop') {
      if (!(await ls(page, SLOT(1)))) fail(`a(new player): autosave should write ${SLOT(1)}`);
      if ((await ls(page, ACT)) !== '1') fail(`a(new player): ${ACT} should be "1"`);
      if ((await ls(page, LEG)) !== null) fail('a(new player): the legacy key mistvale-pixel-v2 should not be written any more');
      if ((await ls(page, SLOT(2))) || (await ls(page, SLOT(3)))) fail('a(new player): slots 2/3 should stay empty');
    }
    if (!await openSaves(page)) { fail(`a(${label}): settings modal → [data-action="saves"] does not show #modal [data-slot="1..3"]`); await ctx.close(); continue; }
    const r = await rows(page);
    if (r.some(x => !x)) fail(`a(${label}): the saves modal needs rows [data-slot="1"], [data-slot="2"], [data-slot="3"]`);
    else {
      const stored = JSON.parse(await ls(page, SLOT(1)) || '{}');
      if (r[0].empty !== 'false' || r[0].active !== 'true') fail(`a(${label}): slot 1 row should be data-empty="false" data-active="true", got ${r[0].empty}/${r[0].active}`);
      if (Math.abs(Number(r[0].gold) - Math.floor(stored.gold)) > 2000) fail(`a(${label}): slot 1 data-gold=${r[0].gold}, stored save has ${Math.floor(stored.gold)}`);
      if (Number(r[0].hunters) !== (stored.hunters || []).length) fail(`a(${label}): slot 1 data-hunters=${r[0].hunters}, stored save has ${(stored.hunters || []).length}`);
      for (const i of [1, 2]) if (r[i].empty !== 'true' || r[i].active !== 'false') fail(`a(${label}): slot ${i + 1} row should be data-empty="true" data-active="false"`);
    }
    if (label === 'phone') {
      const st = await ev(page, () => {
        const c = document.querySelector('#modal-content');
        const small = [...document.querySelectorAll('#modal [data-slot-action]')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 32 || r.height < 32); }).map(b => b.dataset.slotAction);
        return { over: c ? c.scrollWidth - c.clientWidth : 0, small };
      });
      if (st.over > 1) fail(`a(phone): the saves modal scrolls sideways by ${st.over}px`);
      if (st.small.length) fail(`a(phone): slot buttons under 32x32px: ${st.small.join(', ')}`);
    }
    await ctx.close();
  }
}

// --- part b: switching slots and starting a new game in an empty one -----------------------------------------
async function partB() {
  const { ctx, page } = await context(DESK, { [SLOT(1)]: save(111111), [SLOT(2)]: save(222222), [ACT]: '1' });
  const g0 = await gold(page);
  if (!(g0 >= 111111 && g0 < 120000)) fail(`b: booting with active slot 1 should load it (gold 111111), game has ${g0}`);
  await setGold(page, 111222);
  if (!await slotAction(page, 2, 'load')) { fail('b: no [data-slot="2"] [data-slot-action="load"] button'); await ctx.close(); return; }
  if (!await waitFor(page, () => { const g = globalThis.__mistvaleGame?.state?.gold; return g >= 222222 && g < 230000; })) fail(`b(load): after loading slot 2 the live game (__mistvaleGame) should have gold 222222, has ${await gold(page)}`);
  if ((await ls(page, ACT)) !== '2') fail(`b(load): ${ACT} should be "2" after loading slot 2`);
  const s1 = await slotGold(page, 1);
  if (!(s1 >= 111222)) fail(`b(load): slot 1 should have been saved before switching (gold 111222), has ${JSON.stringify(s1)}`);
  await setGold(page, 222333); await wait(AUTOSAVE);
  if (!((await slotGold(page, 2)) >= 222333)) fail(`b(autosave): autosave after the switch should write slot 2, it has ${JSON.stringify(await slotGold(page, 2))}`);
  if ((await slotGold(page, 1)) >= 222000) fail('b(autosave): autosave after switching overwrote slot 1 with slot 2\'s game');
  if (await openSaves(page)) { const r = await rows(page); if (r[1]?.active !== 'true' || r[0]?.active !== 'false') fail('b: the saves modal should now mark slot 2 data-active="true" and slot 1 "false"'); }
  await page.reload({ waitUntil: 'commit' }); await ready(page);
  const gr = await gold(page);
  if (!(gr >= 222333 && gr < 230000)) fail(`b(reload): after a reload the active slot 2 should be played (gold 222333), game has ${gr}`);
  if (!await slotAction(page, 3, 'new')) fail('b: no [data-slot="3"] [data-slot-action="new"] button on the empty slot');
  else {
    if (!await waitFor(page, ([fg]) => { const g = globalThis.__mistvaleGame?.state?.gold; return g < fg + 20000; }, [FRESH_GOLD])) fail(`b(new): a new game in slot 3 should start fresh (gold ~${FRESH_GOLD}), game has ${await gold(page)}`);
    if ((await ls(page, ACT)) !== '3') fail(`b(new): ${ACT} should be "3"`);
    await wait(AUTOSAVE);
    if (!(await ls(page, SLOT(3)))) fail('b(new): slot 3 should be autosaved');
    if (!((await slotGold(page, 2)) >= 222333)) fail(`b(new): slot 2 should still hold its game (222333), has ${JSON.stringify(await slotGold(page, 2))}`);
  }
  await ctx.close();
}

// --- part c: export / import ---------------------------------------------------------------------------------
async function partC() {
  const { ctx, page } = await context(DESK, { [SLOT(1)]: save(111111), [SLOT(2)]: save(222222), [ACT]: '1' });
  await wait(AUTOSAVE);
  const want1 = await slotGold(page, 1);
  if (!await openSaves(page)) { fail('c: cannot open the saves modal'); await ctx.close(); return; }
  try {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), click(page, '#modal [data-slot="1"] [data-slot-action="export"]')]);
    const name = dl.suggestedFilename();
    if (!/slot-?1/i.test(name) || !/\.json$/i.test(name)) fail(`c(export): file name should mention slot1 and end in .json, got "${name}"`);
    const body = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    if (Math.abs(body.gold - want1) > 2000 || !Array.isArray(body.hunters)) fail(`c(export): exported file should be slot 1's save (gold ~${Math.floor(want1)}), has gold ${body.gold}`);
  } catch (e) { fail(`c(export): [data-slot="1"] [data-slot-action="export"] did not download a .json file (${String(e.message || e).split('\n')[0]})`); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saveslots-'));
  const file = (n, text) => { const p = path.join(tmp, n); fs.writeFileSync(p, text); return p; };
  const importInto = async (n, p) => {
    if (!await openSaves(page)) return false;
    const input = await page.$(`#modal [data-slot="${n}"] input[type=file]`);
    if (!input) return false;
    await input.setInputFiles(p); await wait(1500); await ready(page); return true;
  };
  if (!await importInto(3, file('good.json', save(333333)))) fail('c(import): no <input type="file"> in the [data-slot="3"] row');
  else {
    if (!((await slotGold(page, 3)) >= 333333)) fail(`c(import): importing a valid save into empty slot 3 should store it, slot 3 has ${JSON.stringify(await slotGold(page, 3))}`);
    if ((await ls(page, ACT)) !== '1') fail('c(import): importing into another slot must not change the active slot');
    const g = await gold(page); if (g >= 300000) fail('c(import): importing into slot 3 replaced the running game');
    if (await openSaves(page)) { const r = await rows(page); if (r[2]?.empty !== 'false' || Math.abs(Number(r[2]?.gold) - 333333) > 2) fail(`c(import): slot 3 row should now show data-empty="false" data-gold="333333", has ${r[2]?.empty}/${r[2]?.gold}`); }
  }
  for (const [label, text] of [['broken JSON', '{"gold": 5,'], ['not a save', '{"hello":1}'], ['gold not a number', JSON.stringify({ ...BASE, gold: 'lots' })]]) {
    const before = await ls(page, SLOT(2));
    if (!await importInto(2, file('bad.json', text))) { fail('c(import): no <input type="file"> in the [data-slot="2"] row'); break; }
    const msg = await ev(page, () => document.querySelector('#modal')?.textContent || '');
    if (!msg.includes('無法匯入')) fail(`c(import ${label}): the modal should say 無法匯入`);
    if ((await ls(page, SLOT(2))) !== before) fail(`c(import ${label}): slot 2 was changed by a rejected file`);
  }
  if (await importInto(1, file('active.json', save(444444)))) {
    if (!await waitFor(page, () => { const g = globalThis.__mistvaleGame?.state?.gold; return g >= 444444 && g < 460000; })) fail(`c(import active): importing into the active slot should load it into the live game (gold 444444), has ${await gold(page)}`);
    await wait(AUTOSAVE);
    if (!((await slotGold(page, 1)) >= 444444)) fail('c(import active): the autosave then overwrote the imported save in slot 1');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  await ctx.close();
}

// --- part d: delete with confirmation --------------------------------------------------------------------------
async function partD() {
  for (const [label, vp] of [['desktop', DESK], ['phone', PHONE]]) {
    const { ctx, page } = await context(vp, { [SLOT(1)]: save(111111), [SLOT(2)]: save(222222), [ACT]: '1' });
    if (!await openSaves(page)) { fail(`d(${label}): cannot open the saves modal`); await ctx.close(); continue; }
    const activeDel = await ev(page, () => { const b = document.querySelector('#modal [data-slot="1"] [data-slot-action="delete"]'); return !b ? 'absent' : b.disabled || b.getAttribute('aria-disabled') === 'true' ? 'disabled' : 'enabled'; });
    if (activeDel === 'enabled') fail(`d(${label}): the active slot's delete button must be disabled or absent`);
    if (!await click(page, '#modal [data-slot="2"] [data-slot-action="delete"]')) { fail(`d(${label}): no [data-slot="2"] [data-slot-action="delete"] button`); await ctx.close(); continue; }
    await wait(400);
    const c = await ev(page, () => ({ yes: !!document.querySelector('#modal [data-confirm="yes"]'), no: !!document.querySelector('#modal [data-confirm="no"]'), focus: !!document.activeElement?.matches?.('[data-confirm="no"]'),
      small: [...document.querySelectorAll('#modal [data-confirm]')].filter(b => { const r = b.getBoundingClientRect(); return r.width < 32 || r.height < 32; }).length }));
    if (!c.yes || !c.no) fail(`d(${label}): delete should ask first with [data-confirm="yes"] and [data-confirm="no"]`);
    if (!c.focus) fail(`d(${label}): keyboard focus should start on [data-confirm="no"]`);
    if (label === 'phone' && c.small) fail('d(phone): confirm buttons under 32x32px');
    if ((await ls(page, SLOT(2))) === null) fail(`d(${label}): slot 2 was deleted before confirming`);
    await page.keyboard.press('Escape'); await wait(400);
    const after = await ev(page, () => ({ open: !document.querySelector('#modal-backdrop')?.classList.contains('hidden') && !!document.querySelector('#modal [data-slot="1"]'), confirm: !!document.querySelector('#modal [data-confirm]') }));
    if (!after.open) fail(`d(${label}): Escape on the confirmation closed the saves modal; it should only cancel the confirmation`);
    if (after.confirm) fail(`d(${label}): Escape should cancel the confirmation`);
    if ((await ls(page, SLOT(2))) === null) fail(`d(${label}): Escape deleted slot 2`);
    if (label === 'desktop') {
      if (!await openSaves(page)) { await ctx.close(); continue; }
      await click(page, '#modal [data-slot="2"] [data-slot-action="delete"]'); await wait(400);
      if (!await click(page, '#modal [data-confirm="yes"]')) fail('d: cannot confirm the delete');
      await wait(600);
      if ((await ls(page, SLOT(2))) !== null) fail('d: confirming should remove mistvale-pixel-v2:slot2 from localStorage');
      const r = await rows(page); if (r[1]?.empty !== 'true') fail('d: after deleting, slot 2 row should be data-empty="true"');
      await wait(AUTOSAVE);
      if ((await ls(page, SLOT(2))) !== null) fail('d: slot 2 came back after the autosave');
      if (!((await slotGold(page, 1)) >= 111111)) fail('d: deleting slot 2 damaged slot 1');
    }
    await ctx.close();
  }
}

// --- part e: offline earnings when switching -------------------------------------------------------------------
async function partE() {
  const { ctx, page } = await context(DESK, { [SLOT(1)]: save(111111), [SLOT(2)]: save(222222, 2 * 3600), [ACT]: '1' });
  await wait(3000);
  if ((await modalType(page)) === 'offline') { fail('e: booting slot 1 (saved just now) showed the offline-earnings modal'); await click(page, '#modal [data-action=close]'); }
  if (!await slotAction(page, 2, 'load')) { fail('e: no [data-slot="2"] [data-slot-action="load"] button'); await ctx.close(); return; }
  if (!await waitFor(page, () => document.querySelector('#modal')?.dataset.type === 'offline' && !document.querySelector('#modal-backdrop')?.classList.contains('hidden'), null, 60000)) fail('e: loading slot 2 (saved 2 h ago) should show the offline-earnings modal (#modal[data-type="offline"])');
  const g2 = await gold(page);
  if (!(g2 >= 222222)) fail(`e: slot 2 should be playing after the switch, game gold ${g2}`);
  await click(page, '#modal [data-action=close]'); await wait(500);
  await slotAction(page, 1, 'load'); await wait(2500);
  if ((await modalType(page)) === 'offline') { fail('e: switching back to slot 1 (left seconds ago) granted offline earnings'); await click(page, '#modal [data-action=close]'); }
  await slotAction(page, 2, 'load'); await wait(4000);
  if ((await modalType(page)) === 'offline') fail('e: coming straight back to slot 2 granted offline earnings a second time');
  await ctx.close();
}

try {
  await fixtures();
  note(`fixture: fresh game gold ${FRESH_GOLD}, ${FRESH_HUNTERS} hunters`);
  for (const [k, fn] of [['a', partA], ['b', partB], ['c', partC], ['d', partD], ['e', partE]]) {
    if (!PARTS.includes(k)) continue;
    const n = fails.length;
    try { await fn(); } catch (e) { fail(`${k}: crashed: ${String(e.message || e).split('\n')[0]}`); }
    note(`${k}: ${fails.length - n ? fails.length - n + ' problem(s)' : 'ok'}`);
  }
} finally { await browser.close(); server.kill(); }
console.log(fails.length ? `save-slots(${PARTS.join('')}): ${fails.length} problem(s)` : `save-slots(${PARTS.join('')}): PASS`);
process.exit(fails.length ? 1 : 0);
