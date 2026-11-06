// mage-attack-montage.mjs — T67: in-game montage of one sorcerer basic attack, from the
// windup (spell-charge) through the fireball-blast on a medium (boar) monster.
// Paused game, stepped with simulate(.07); each tile is labelled with the game time.
// Writes output/mage-attack/montage.png (long side <= 2000 px, >= 8 frames).
//   npm run build && node pipeline/scripts/ui-audit/mage-attack-montage.mjs
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'output/mage-attack');
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
const page = await (await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
await page.goto(URL + '?preview=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleView, null, { timeout: 180000 });
await page.evaluate(() => { const w = globalThis.__mistvaleView; for (let i = 0; i < 90; i++) w.warmupAssets(); });
await page.waitForFunction(() => !document.querySelector('#loading'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1200);

const H = 18, Z = -1;           // HUNT_ZONE centre (pixel-data.js)
const EX = 19.3, EZ = -1;       // boar, a medium monster
const setup = await page.evaluate(({ H, Z, EX, EZ }) => {
  const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, s = g.state;
  s.paused = true;
  const h = (s.hunters || []).find(x => x && x.classId === 'sorcerer' && x.hp > 0) || (s.hunters || [])[0];
  if (!h) return null;
  h.classId = 'sorcerer'; h.x = H; h.z = Z; h.hp = h.maxHp = Math.max(h.maxHp || 0, 200);
  h.status = '戰鬥中'; h.huntRegion = 'meadow'; h.targetId = 'm1'; h.range = Math.max(h.range || 0, 6);
  h.task = null; h.destination = null; h.inTown = false; h.serviceProduct = null;
  h.attackTimer = 0.5; h.lockUntil = 1e9; h.skillCd = 99; h.skillAt = -99; h.atkAt = null; h.atkX = EX; h.atkZ = EZ;
  h.route = []; h.satiety = 100; h.stamina = 100; h.mood = 100;
  s.hunters.length = 0; s.hunters.push(h);
  s.enemies.length = 0;
  s.effects.length = 0;
  s.spawnTimer = 1e9;
  s.enemies.push({ id: 'm1', type: 'boar', x: EX, z: EZ, hp: 99999, maxHp: 99999, attack: 0, attackTimer: 1e9, speed: 0, regionId: 'meadow', engaged: true, slotFor: h.id, age: 0 });
  v.lookAt(H, Z, 3);
  return { hid: h.id };
}, { H, Z, EX, EZ });
if (!setup) { console.log('no hunter in this save'); await browser.close(); server.kill(); process.exit(1); }
await page.waitForTimeout(700);

// fixed clip around the mage and the boar, big enough for the blast above the body
const clip = await page.evaluate(({ H, Z, EX, EZ }) => {
  const v = globalThis.__mistvaleView, a = v.project(H, 0, Z), b = v.project(EX, 0, EZ);
  const x0 = Math.round(Math.max(0, Math.min(a.x, b.x) - 120)), x1 = Math.round(Math.min(960, Math.max(a.x, b.x) + 120));
  const y0 = Math.round(Math.max(0, Math.min(a.y, b.y) - 165)), y1 = Math.round(Math.min(600, Math.min(a.y, b.y) + 60));
  return { x: x0, y: y0, width: Math.max(40, x1 - x0), height: Math.max(40, y1 - y0) };
}, { H, Z, EX, EZ });
console.log('clip', JSON.stringify(clip));

const all = [];
let seenBlast = false;
for (let i = 0; i < 52; i++) {
  const st = await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    g.simulate(0.07);   // game stays paused; only the simulation is stepped by hand
    const h = s.hunters[0];
    if (h.atkAt != null && s.time > h.atkAt + 0.1) h.attackTimer = Math.max(h.attackTimer, 99);   // exactly one attack
    h.lockUntil = 1e9;   // hold the mage in place: no kiting during the montage
    const fx = (s.effects || []).find(e => e.type === 'spell');
    return { t: s.time, fxAge: fx ? +(fx.age - (fx.delay || 0)).toFixed(3) : null, atk: +h.attackTimer.toFixed(2), st: h.status, tid: h.targetId };
  });
  await page.waitForFunction(id => (globalThis.__mistvaleFacing?.() || {})[id]?.t === globalThis.__mistvaleGame.state.time, setup.hid, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(30);
  const pose = await page.evaluate(id => (globalThis.__mistvaleFacing?.() || {})[id]?.pose || null, setup.hid);
  if (process.env.MAGE_DEBUG && all.length < 10) console.log('dbg', JSON.stringify({ ...st, pose }));
  const buf = await page.screenshot({ clip });
  const label = st.fxAge == null ? `${st.t.toFixed(2)}s  ${pose}` : `${st.t.toFixed(2)}s  ${pose} · blast ${st.fxAge.toFixed(2)}s`;
  all.push({ ...st, pose, label, data: 'data:image/png;base64,' + buf.toString('base64') });
  if (st.fxAge != null && st.fxAge >= 0) seenBlast = true;
  if (seenBlast && st.fxAge != null && st.fxAge > 1.95) break;   // blast has faded out (st = age*0.6 > 1.15)
}

// pick frames per phase: windup, fireball flight, blast — at least 8 tiles in the end
const pick = (arr, n) => {
  if (!arr.length) return [];
  if (arr.length <= n) return arr;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * (arr.length - 1) / (n - 1))]);
  return out;
};
const windup = all.filter(f => f.fxAge == null && f.pose === 'windup');
const flight = all.filter(f => f.fxAge != null && f.fxAge < 0);
const blast = all.filter(f => f.fxAge != null && f.fxAge >= 0);
const frames = [...pick(windup, 3), ...pick(flight, 2), ...pick(blast, 8)];
console.log(`steps ${all.length} | windup ${windup.length} flight ${flight.length} blast ${blast.length} -> ${frames.length} tiles`);
if (frames.length < 8) { console.log(`FAIL only ${frames.length} frames selected`); await browser.close(); server.kill(); process.exit(1); }

const html = `<html><body style="margin:0;background:#15110d;color:#e8d8b0;font:13px/1.3 system-ui,sans-serif">
<div style="display:grid;grid-template-columns:repeat(4,max-content);gap:10px;padding:14px">
${frames.map(f => `<figure style="margin:0"><img src="${f.data}" style="display:block;border:1px solid #6a5334"><figcaption style="padding:3px 2px">${f.label}</figcaption></figure>`).join('\n')}
</div></body></html>`;
const cp = await (await browser.newContext({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 })).newPage();
await cp.setContent(html, { waitUntil: 'load' });
await cp.waitForTimeout(300);
const out = path.join(OUT, 'montage.png');
await cp.screenshot({ path: out, fullPage: true });
await browser.close();
server.kill();

const b = fs.readFileSync(out);
const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
console.log(`montage ${out} ${w}x${h} long side ${Math.max(w, h)} frames ${frames.length}`);
if (Math.max(w, h) > 2000) { console.log('FAIL montage long side > 2000'); process.exit(1); }
if (frames.length < 8) { console.log('FAIL fewer than 8 frames'); process.exit(1); }
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
