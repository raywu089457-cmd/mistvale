// shots-uixx.mjs — every UI screen as a raw tile for the T63 UI/UX montage (2026-11-05).
// Usage: node pipeline/scripts/ui-audit/shots-uixx.mjs [desktop|phone]
//   desktop = 1440x900 DPR1; phone = 402x712 DPR2 (the card's 390x844 stand-in).
//   Writes output/ui-audit/uiux-1105/raw-<mode>/<name>.png plus manifest.json (merged across modes).
//   hud + worldmap are full-viewport; every other tile is clipped to #modal / #inspector + 16 CSS px.
import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODE = process.argv[2] || 'desktop';
const PHONE = MODE === 'phone';
const ROOT = fileURLToPath(new URL('../../../output/ui-audit/uiux-1105/', import.meta.url));
const OUT = ROOT + 'raw-' + MODE + '/';
fs.mkdirSync(OUT, { recursive: true });
const URL_BASE = process.env.TARGET || 'http://100.79.149.0:5024/';
const SAVE_KEY = 'mistvale-pixel-v2';
const MARGIN = 16;

const VIEW = PHONE
  ? { viewport: { width: 402, height: 712 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const SCREENS = [
  ['hud', 'HUD + village', null, null, 'full'],
  ['worldmap', 'World map', 'worldmap', null, 'full'],
  ['build', 'Village build', 'build', null, 'modal'],
  ['hunters', 'Hunter roster', 'hunters', null, 'modal'],
  ['hunter', 'Hunter detail', 'hunter', 'H', 'modal'],
  ['recruit', 'Recruit visitor', 'recruit', null, 'modal'],
  ['trade', 'Trade post', 'trade', null, 'modal'],
  ['craft', 'Craft + storage', 'craft', null, 'modal'],
  ['dungeon', 'Dungeon expedition', 'dungeon', null, 'modal'],
  ['arena', 'Arena', 'arena', null, 'modal'],
  ['quests', 'Quests', 'quests', null, 'modal'],
  ['inventory', 'Village storage', 'inventory', null, 'modal'],
  ['difficulty', 'Hunt difficulty', 'difficulty', null, 'modal'],
  ['settings', 'Settings', 'settings', null, 'modal'],
  ['help', 'Help', 'help', null, 'modal'],
  ['boss', 'World boss', 'boss', null, 'modal'],
  ['dispatchHunters', 'Dispatch team', 'dispatchHunters', null, 'modal'],
  ['inspector', 'Building inspector (forge)', 'selectBuilding', 'forge', 'inspector'],
  ['region', 'Region info (snow)', 'regionInfo', 'snow', 'modal'],
  ['density', 'Region density (snow)', 'densityFor', 'snow', 'modal'],
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const context = await browser.newContext(VIEW);
const page = await context.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
await page.goto(URL_BASE + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.evaluate(() => {
  const g = globalThis.__mistvaleGame;
  Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 });
  for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]);
  for (const h of g.state.hunters) h.huntRegion = 'meadow';
});
await page.waitForTimeout(4000);

const act = (a, id) => page.evaluate(([a, id]) => {
  const el = document.createElement('button');
  el.dataset.action = a;
  if (id != null) el.dataset.id = id;
  el.style.display = 'none';
  document.body.append(el);
  el.click();
  el.remove();
}, [a, id]);
const closeAll = async () => {
  await page.evaluate(() => {
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
    document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
  });
  await page.waitForTimeout(220);
};
const hunterId = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0]?.id);

const tiles = [];
const failures = [];
const shoot = async (name, label, kind) => {
  const vp = page.viewportSize();
  let clip = null;
  if (kind !== 'full') {
    const sel = kind === 'inspector' ? '#inspector' : '#modal';
    const box = await page.locator(sel).boundingBox().catch(() => null);
    if (!box || box.width < 40 || box.height < 40) {
      failures.push({ name, label, reason: `crop missed: ${sel} box ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'null'}` });
      return;
    }
    const left = Math.max(0, Math.floor(box.x - MARGIN));
    const top = Math.max(0, Math.floor(box.y - MARGIN));
    clip = {
      x: left,
      y: top,
      width: Math.min(vp.width - left, Math.ceil(box.width + MARGIN * 2 + (box.x - left - MARGIN))),
      height: Math.min(vp.height - top, Math.ceil(box.height + MARGIN * 2 + (box.y - top - MARGIN))),
    };
    if (clip.width < 40 || clip.height < 40) {
      failures.push({ name, label, reason: `crop missed: clip ${Math.round(clip.width)}x${Math.round(clip.height)}` });
      return;
    }
  }
  const file = `raw-${MODE}/${name}.png`;
  await page.screenshot({ path: OUT + name + '.png', ...(clip ? { clip } : {}) });
  const size = fs.statSync(OUT + name + '.png').size;
  tiles.push({ name, label, file, kind, clip: clip ? { ...clip, width: Math.round(clip.width), height: Math.round(clip.height) } : null, bytes: size });
};

for (const [name, label, action, id, kind] of SCREENS) {
  await closeAll();
  if (action) {
    const arg = id === 'H' ? hunterId : id;
    await act(action, arg);
    await page.waitForTimeout(name === 'worldmap' ? 900 : 550);
    if (kind === 'modal' && await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden'))) {
      failures.push({ name, label, reason: `did not open: ${action}${arg != null ? ' ' + arg : ''}` });
      continue;
    }
    if (kind === 'inspector' && await page.evaluate(() => document.querySelector('#inspector').classList.contains('hidden'))) {
      failures.push({ name, label, reason: `did not open: inspector ${action} ${arg}` });
      continue;
    }
  } else {
    await page.waitForTimeout(300);
  }
  await shoot(name, label, kind);
}

// ---- offline modal: save from the seeded preview page, then load it without ?preview ----
const offlineFailures = [];
let offlineTile = null;
try {
  const saved = await page.evaluate(() => {
    const d = globalThis.__mistvaleGame.serialize();
    d.paused = false;
    d.savedAt = Date.now() - 7200e3;
    return JSON.stringify(d);
  });
  const ctx = await browser.newContext(VIEW);
  await ctx.addInitScript(([key, json]) => { try { localStorage.setItem(key, json); } catch (e) { } }, [SAVE_KEY, saved]);
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p2.goto(URL_BASE, { waitUntil: 'commit', timeout: 120000 });
  await p2.waitForSelector('#modal[data-type="offline"]', { timeout: 120000 });
  await p2.waitForTimeout(600);
  const box = await p2.locator('#modal').boundingBox().catch(() => null);
  if (!box || box.width < 40 || box.height < 40) {
    offlineFailures.push({ name: 'offline', label: 'Offline earnings', reason: `crop missed: #modal box ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'null'}` });
  } else {
    const vp = p2.viewportSize();
    const left = Math.max(0, Math.floor(box.x - MARGIN));
    const top = Math.max(0, Math.floor(box.y - MARGIN));
    const clip = {
      x: left,
      y: top,
      width: Math.min(vp.width - left, Math.ceil(box.width + MARGIN * 2 + (box.x - left - MARGIN))),
      height: Math.min(vp.height - top, Math.ceil(box.height + MARGIN * 2 + (box.y - top - MARGIN))),
    };
    await p2.screenshot({ path: OUT + 'offline.png', clip });
    offlineTile = { name: 'offline', label: 'Offline earnings', file: `raw-${MODE}/offline.png`, kind: 'modal', clip: { ...clip, width: Math.round(clip.width), height: Math.round(clip.height) }, bytes: fs.statSync(OUT + 'offline.png').size };
    tiles.push(offlineTile);
  }
  await ctx.close();
} catch (e) {
  offlineFailures.push({ name: 'offline', label: 'Offline earnings', reason: 'failed: ' + String(e).slice(0, 200) });
}
await browser.close();

// ---- manifest (merge modes) ----
const manifestPath = ROOT + 'manifest.json';
let manifest = { generatedAt: 0, modes: {}, failures: [] };
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { }
manifest.generatedAt = Date.now();
manifest.modes[MODE] = { viewport: VIEW.viewport, dpr: VIEW.deviceScaleFactor, tiles };
manifest.failures = (manifest.failures || []).filter(f => f.mode !== MODE).concat([...failures, ...offlineFailures].map(f => ({ ...f, mode: MODE })));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log(`${MODE}: ${tiles.length} tiles, ${failures.length + offlineFailures.length} failures`);
for (const f of [...failures, ...offlineFailures]) console.log(`  FAIL ${f.name}: ${f.reason}`);
if (errs.length) console.log('page errors: ' + errs.join(' | '));
