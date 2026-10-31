// Browser checks (Chromium via Playwright). Run with the app already started (`npm start`):
//   node tests/e2e.mjs [http://127.0.0.1:5173/]
// Playwright is resolved from PLAYWRIGHT_MODULE (a path to the package's index.js) or from the normal module path.
// Software WebGL renders slowly, so the page runs in ?still mode and frames are rendered on demand.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const URL_BASE = process.argv[2] || process.env.APP_URL || 'http://127.0.0.1:5173/';
const SIZE = { width: 1280, height: 720 };

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) {
    const req = createRequire(import.meta.url);
    return req(process.env.PLAYWRIGHT_MODULE);
  }
  try {
    return await import('playwright');
  } catch {
    throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE to the playwright package entry, or `npm i -D playwright`.');
  }
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: SIZE });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
const cdp = await page.context().newCDPSession(page);

await page.goto(`${URL_BASE}${URL_BASE.includes('?') ? '&' : '?'}still`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__rcsim !== undefined, null, { timeout: 180000 });
const rs = () => page.evaluate(() => window.__rcsim);
const render = () => page.evaluate(() => window.__rcsim.renderNow(0));
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize;
};

// ------------------------------------------------------------- 1. structure and report surfaced to the page
const info = await page.evaluate(() => ({ bars: window.__rcsim.model.bars.length, couplers: window.__rcsim.model.couplers.length, members: window.__rcsim.model.members.length, report: window.__rcsim.report.map((r) => ({ id: r.id, pass: r.pass })) }));
check('model loads: 157 members, 8,037 bars, 480 couplers', info.members === 157 && info.bars === 8037 && info.couplers === 480, JSON.stringify({ members: info.members, bars: info.bars, couplers: info.couplers }));
const failingChecks = info.report.filter((r) => !r.pass).map((r) => r.id);
check('standards panel: only the flagged coupler clear cover fails', JSON.stringify(failingChecks) === '["coupler-cover"]', failingChecks.join(',') || 'none');

// ------------------------------------------------------------- 2. full frame, cutaway, exploded (screenshots for review)
await page.evaluate(() => { const r = window.__rcsim; r.setPlaying(false); r.setTime(320); r.setExplode(0); r.setCutaway(false); r.rig.applyPreset('cinematic', 0); });
await render();
await page.screenshot({ path: process.env.E2E_OUT ? `${process.env.E2E_OUT}/frame-cinematic.png` : 'frame-cinematic.png' }).catch(() => {});
check('frame renders at full timeline with bars visible', (await page.evaluate(() => window.__rcsim.stats().visible)) > 40);

// ------------------------------------------------------------- 3. picking resolves bar metadata (normal, cutaway, exploded)
async function pickBarAndCheck(label, setup) {
  await setup();
  await render();
  const sample = await page.evaluate(() => {
    const r = window.__rcsim;
    const ids = [];
    for (let i = 0; i < r.model.bars.length && ids.length < 40; i += 211) {
      const b = r.model.bars[i];
      if (b.t0 <= r.state.t) ids.push(i);
    }
    return ids;
  });
  let ok = 0, tried = 0, sampleText = '';
  for (const id of sample.slice(0, 12)) {
    const pt = await page.evaluate((bid) => window.__rcsim.projectBar(bid), id);
    if (pt.x < 0 || pt.y < 0 || pt.x > SIZE.width || pt.y > SIZE.height) continue;
    tried++;
    const hit = await page.evaluate(([x, y]) => window.__rcsim.pickAt(x, y), [pt.x, pt.y]);
    if (hit && hit.kind === 'bar') {
      ok++;
      const txt = await page.evaluate((h) => { window.__rcsim.select(h); return document.getElementById('inspectBody').innerText; }, hit);
      if (!sampleText) sampleText = txt.slice(0, 160).replace(/\n/g, ' | ');
      const meta = await page.evaluate((bid) => { const b = window.__rcsim.model.bars[bid]; return { drawing: b.drawing, rule: b.rule }; }, hit.id);
      if (!txt.includes(meta.drawing) || !txt.includes(meta.rule.slice(0, 30))) ok -= 1;
    }
  }
  check(`picking resolves drawing + rule when clicked: ${label}`, tried > 0 && ok >= Math.ceil(tried * 0.7), `${ok}/${tried} bars resolved${sampleText ? ' · e.g. ' + sampleText : ''}`);
}
// assembled: bars sit inside opaque formwork and concrete, so a click must resolve to the member volume
{
  await page.evaluate(() => { const r = window.__rcsim; r.setCutaway(false); r.setExplode(0); });
  await render();
  const pt = await page.evaluate(() => window.__rcsim.projectBar(4000));
  const hit = await page.evaluate(([x, y]) => window.__rcsim.pickAt(x, y), [pt.x, pt.y]);
  const txt = await page.evaluate((h) => { window.__rcsim.select(h); return document.getElementById('inspectBody').innerText; }, hit);
  check('assembled view: click on concrete/formwork resolves to its member with drawing context', !!hit && (hit.kind === 'member' || hit.kind === 'bar') && txt.length > 20, `${hit && hit.kind}: ${txt.split('\n')[0]}`);
}
await pickBarAndCheck('cutaway', async () => { await page.evaluate(() => { const r = window.__rcsim; r.setCutaway(true); r.setExplode(0); }); });
await pickBarAndCheck('exploded', async () => { await page.evaluate(() => { const r = window.__rcsim; r.setCutaway(true); r.setExplode(2.5); }); });
await page.evaluate(() => { const r = window.__rcsim; r.setCutaway(false); r.setExplode(0); });

// ------------------------------------------------------------- 4. deterministic, frame-exact timeline
async function frameAt(t) {
  await page.evaluate((tt) => { window.__rcsim.setPlaying(false); window.__rcsim.setTime(tt); }, t);
  await render();
  return page.screenshot({ type: 'png' });
}
const shotA = await frameAt(150);
await frameAt(40); await frameAt(310);  // scrub far away and back
const shotB = await frameAt(150);
check('scrubbing back to the same time reproduces the same frame (pixel-identical)', Buffer.compare(shotA, shotB) === 0);
const s1 = await page.evaluate(() => { window.__rcsim.setTime(150); window.__rcsim.renderNow(0); return window.__rcsim.stats(); });
const s2 = await page.evaluate(() => { window.__rcsim.setTime(151); window.__rcsim.renderNow(0); return window.__rcsim.stats(); });
check('bars appear in time order (geometry grows monotonically with t)', s2.tris > s1.tris, `${s1.tris} → ${s2.tris} tris at t=150 → 151`);

// ------------------------------------------------------------- 5. 20 cycles: cutaway, explode, assemble, reset, filters
const beforeRes = await page.evaluate(() => window.__rcsim.renderer.info.memory);
const beforeHeap = await heap();
let cycleErrors = 0;
for (let i = 0; i < 20; i++) {
  await page.evaluate((k) => {
    const r = window.__rcsim;
    r.setCutaway(k % 2 === 0);
    r.setExplode(k % 3 === 0 ? 3 : 0);
    r.setTime(60 + (k * 13) % 240);
    r.rig.applyPreset(k % 2 ? 'aerial' : 'cinematic', 0);
    const toggles = document.querySelectorAll('#layers input');
    toggles[k % toggles.length].click();
    toggles[k % toggles.length].click();
    document.querySelectorAll('#storeys button')[k % 4].click();
    document.querySelector('#storeys button').click();
    r.renderNow(0.016);
  }, i);
  const n = await page.evaluate(() => window.__rcsim.stats().visible);
  if (!(n > 0)) cycleErrors++;
}
await page.evaluate(() => { const r = window.__rcsim; r.setCutaway(false); r.setExplode(0); r.rig.applyPreset('cinematic', 0); r.setTime(320); r.renderNow(0); });
const afterRes = await page.evaluate(() => window.__rcsim.renderer.info.memory);
const afterHeap = await heap();
const growthMB = (afterHeap - beforeHeap) / 1048576;
check('20 cycles of cutaway / explode / assemble / reset / filters: no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'none');
check('20 cycles: no geometry or texture leak (GPU resource counts unchanged)', afterRes.geometries === beforeRes.geometries && afterRes.textures === beforeRes.textures, `geometries ${beforeRes.geometries}→${afterRes.geometries}, textures ${beforeRes.textures}→${afterRes.textures}`);
check('20 cycles: JS heap growth under 25 MB after GC', growthMB < 25, `${growthMB.toFixed(1)} MB`);
check('20 cycles: every cycle still draws geometry', cycleErrors === 0, `${cycleErrors} empty frames`);

// ------------------------------------------------------------- 6. report
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
console.log('Frame-rate is not measured here: software WebGL on this host is not representative of a desktop GPU.');
await browser.close();
process.exit(failed.length ? 1 : 0);
