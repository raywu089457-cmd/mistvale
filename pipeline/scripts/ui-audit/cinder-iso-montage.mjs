// cinder-iso-montage.mjs — T94: in-game montage of the sorcerer's 火龍捲 (cinder-cyclone-iso)
// about 0.4 s / 1.5 s / 3 s / 5 s after the hit, with one hero standing beside it for scale.
// Paused game; the effect age is set exactly, then the view is redrawn with update(1/60) only
// (never g.simulate, so the age never drifts). Labels each tile with the effect age.
// Writes output/cinder-iso/montage.png (2x2 tiles, long side <= 2000 px).
//   npm run build && node pipeline/scripts/ui-audit/cinder-iso-montage.mjs
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'output/cinder-iso');
fs.mkdirSync(OUT, { recursive: true });

const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT = await freePort();
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true });
const URL = `http://127.0.0.1:${PORT}/`;
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }

let pw = null;
try { pw = await import('playwright'); } catch {}
if (!pw) for (const r of [process.env.APPDATA && path.join(process.env.APPDATA, 'npm/node_modules')].filter(Boolean)) {
  try { pw = createRequire(path.join(r, 'noop.js'))('playwright'); break; } catch {}
}
let browser = null;
try {
  browser = await pw.chromium.launch({ headless: true, args: ['--headless=new'] });
} catch {
  browser = await pw.chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
}
const page = await (await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto(URL + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleView, null, { timeout: 180000 });
await page.evaluate(() => { const w = globalThis.__mistvaleView; for (let i = 0; i < 90; i++) w.warmupAssets(); });
await page.waitForFunction(() => !document.querySelector('#loading'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1200);

const H = 18, Z = -1;           // HUNT_ZONE centre (pixel-data.js)
const setup = await page.evaluate(({ H, Z }) => {
  const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
  s.paused = true;
  const h = (s.hunters || []).find(x => x && x.classId === 'sorcerer' && x.hp > 0) || (s.hunters || [])[0];
  if (!h) return null;
  h.classId = 'sorcerer'; h.x = H + 5; h.z = Z; h.hp = h.maxHp = Math.max(h.maxHp || 0, 200);
  h.status = '待機'; h.huntRegion = 'meadow'; h.targetId = null; h.range = Math.max(h.range || 0, 6);
  h.task = null; h.destination = null; h.inTown = false; h.serviceProduct = null;
  h.attackTimer = 99; h.lockUntil = 1e9; h.skillCd = 99; h.skillAt = -99; h.atkAt = null;
  h.route = []; h.satiety = 100; h.stamina = 100; h.mood = 100;
  s.hunters.length = 0; s.hunters.push(h);
  s.enemies.length = 0;
  s.effects.length = 0;
  s.spawnTimer = 1e9;
  v.lookAt(H, Z, 2.5);
  return { hid: h.id };
}, { H, Z });
if (!setup) { console.log('no hunter in this save'); await browser.close(); server.kill(); process.exit(1); }
await page.waitForTimeout(700);

// one cinder effect at the hunt zone, then fix its age per tile
const meta = await page.evaluate(({ H, Z }) => {
  const g = globalThis.__mistvaleGame, s = g.state;
  s.effects.length = 0;
  s.effects.push({ id: 'cinder-t94', type: 'skillfx', cls: 'sorcerer', fx: 'cinder', x: H, z: Z, age: 0, delay: 0 });
  return { effects: s.effects.length };
}, { H, Z });
console.log('effect', JSON.stringify(meta));

// fixed clip: the whole 240x400 cell around the caster's ground point, plus the hero beside it
const clip = await page.evaluate(({ H, Z }) => {
  const v = globalThis.__mistvaleView, a = v.project(H, 0, Z), b = v.project(H + 5, 0, Z);
  const k = (21 / 66) * 1.05 * v.getScale();         // heroArt('sorcerer') = 21/66, CINDER_TUNE = 1.05
  const x0 = Math.round(Math.max(0, Math.min(a.x - 120 * k, b.x - 30) - 10));
  const x1 = Math.round(Math.min(1000, Math.max(a.x + 120 * k, b.x + 30) + 10));
  const y0 = Math.round(Math.max(0, a.y - 346 * k - 10));
  const y1 = Math.round(Math.min(800, a.y + 54 * k + 10));
  return { x: x0, y: y0, width: Math.max(40, x1 - x0), height: Math.max(40, y1 - y0), k: +k.toFixed(4) };
}, { H, Z });
console.log('clip', JSON.stringify(clip));

// opaque bbox of the drawn cells, in art px: 66 art px = 1 sorcerer height (heroHeight 66)
const measure = await page.evaluate(async () => {
  const v = globalThis.PIXEL_ASSETS?.vfxSheets?.['cinder-cyclone-iso'];
  if (!v) return null;
  const im = new Image();
  await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = v.img; });
  const px = v.meta.meta.pixelfx, cw = px.frameSize[0], ch = px.frameSize[1], cols = px.columns;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const out = [];
  let peak = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < px.frames; i++) {
    cx.clearRect(0, 0, cw, ch);
    cx.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, 0, 0, cw, ch);
    const d = cx.getImageData(0, 0, cw, ch).data;
    let minY = ch, maxY = -1, minX = cw, maxX = -1;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3] > 16) { if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    const hpx = maxY < 0 ? 0 : maxY - minY + 1, wpx = maxX < 0 ? 0 : maxX - minX + 1;
    if ([12, 45, 90, 150].includes(i)) out.push({ age: i / px.fps, i, hpx, wpx, minX, maxX, top: minY, bottom: maxY });
    if (hpx > peak[0]) peak = [hpx, i, wpx, minX, maxX, minY, maxY];
  }
  out.push({ peak: true, hpx: peak[0], i: peak[1], age: peak[1] / px.fps, wpx: peak[2], minX: peak[3], maxX: peak[4], top: peak[5], bottom: peak[6] });
  return out;
});
if (measure) for (const m of measure) console.log(`${m.peak ? 'PEAK' : 'bbox'} age ${m.age.toFixed(2)}s frame ${m.i}: ${m.wpx}x${m.hpx} art px = ${(m.hpx / 66).toFixed(2)} sorcerer heights (x ${m.minX}..${m.maxX}, y ${m.top}..${m.bottom})`);

const tiles = [];
for (const age of [0.4, 1.5, 3, 5]) {
  const st = await page.evaluate(({ age }) => {
    const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
    const e = (s.effects || []).find(q => q.id === 'cinder-t94');
    if (!e) return { missing: true };
    e.age = age;                      // exact age
    v.update(1 / 60, s);              // redraw only; the world never advances effect.age
    return { age: +e.age.toFixed(2), t: +s.time.toFixed(2) };
  }, { age });
  await page.waitForTimeout(80);
  const dbg = await page.evaluate(() => globalThis.__mistvaleCinder?.() ?? null);
  const buf = await page.screenshot({ clip });
  tiles.push({ age, label: `火龍捲 age ${age.toFixed(2)}s  ·  drawn frame ${dbg?.last?.i ?? '?'}`, data: 'data:image/png;base64,' + buf.toString('base64') });
  console.log('tile', JSON.stringify({ ...st, drawn: dbg?.last ?? null }));
}

const html = `<html><body style="margin:0;background:#15110d;color:#e8d8b0;font:13px/1.3 system-ui,sans-serif">
<div style="display:grid;grid-template-columns:repeat(2,max-content);gap:10px;padding:14px">
${tiles.map(t => `<figure style="margin:0"><img src="${t.data}" style="display:block;border:1px solid #6a5334"><figcaption style="padding:3px 2px">${t.label}</figcaption></figure>`).join('\n')}
</div></body></html>`;
const cp = await (await browser.newContext({ viewport: { width: 900, height: 720 }, deviceScaleFactor: 1 })).newPage();
await cp.setContent(html, { waitUntil: 'load' });
await cp.waitForTimeout(300);
const out = path.join(OUT, 'montage.png');
await cp.screenshot({ path: out, fullPage: true });
await browser.close();
server.kill();

const b = fs.readFileSync(out);
const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
console.log(`montage ${out} ${w}x${h} long side ${Math.max(w, h)} tiles ${tiles.length} k ${clip.k}`);
if (Math.max(w, h) > 2000) { console.log('FAIL montage long side > 2000'); process.exit(1); }
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
