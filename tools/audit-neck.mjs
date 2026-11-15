// audit-neck.mjs — renders every hero frame through src/paperdoll.js (all classes × actions × 4 dirs × slots) and
// measures whether the head sits on the body: head bottom row vs torso top, head centre vs torso centre.
// usage: node tools/audit-neck.mjs [outJson]      (needs playwright; dev-only, nothing here ships)
// contact = headBottomRow - torsoTopRow at the head's centre column (stand0 = 0: the head's last row covers the
// body's first row). gap < 0 = air between head and shoulders; > 3 = head sunk into the chest.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = process.argv[2] || path.join(root, 'output/dv2fmt/action-audit/neck-audit.json');
const packJson = process.env.PACK_JSON || 'paperdoll.json';   // another pack json in assets/paperdoll-dv2/ (e.g. an old copy) to compare
const require = createRequire(process.env.PLAYWRIGHT_FROM || 'C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const MIME = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<!doctype html><body></body>'); }
  const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise(res => srv.listen(0, '127.0.0.1', res));
const b = await chromium.launch();
const p = await b.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/`);
const res = await p.evaluate(async (packJson) => {
  const PD = await import('/src/paperdoll.js');
  const base = '/assets/paperdoll-dv2/';
  const data = await (await fetch(base + packJson)).json();
  const images = {};
  await Promise.all(Object.entries(data.images).map(([k, f]) => new Promise(res => { const im = new Image(); im.onload = () => { images[k] = im; res(); }; im.onerror = res; im.src = base + f; })));
  const CLS = ['paladin', 'assassin', 'berserker', 'sorcerer', 'priest', 'archer'];
  const BASES = ['idle', 'walk', 'attack', 'attack_h', 'attack_t', 'skill', 'hurt', 'victory', 'ride_sit', 'ride_stand', 'ride_charge2'];
  const W = 80, H = 80, OX = 40, OY = 60;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const mask = (parts) => {
    c.clearRect(0, 0, W, H);
    PD.drawParts(c, parts, images, { x: OX, y: OY }, 1);
    const d = c.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    return m;
  };
  const rows = [];
  for (const cls of CLS) {
    const look = PD.lookFromHunter({ classId: cls, equipment: { weapon: true } }, data);
    for (const n of BASES) {
      const key = PD.resolveAction(data, n, look.weaponType);
      const A = data.actions[key];
      if (!A) continue;
      for (let dir = 0; dir < 4; dir++) for (let s = 0; s < A.af.length; s++) {
        const parts = PD.computeParts(data, { action: key, dir, tick: s ? A.af[s - 1] : 0, look, hideWeapon: true });
        const body = parts.filter(q => q.layer === 'body' || q.layer === 'armor' || q.layer === 'hand');
        const head = parts.filter(q => q.layer === 'head');
        if (!head.length || !body.length) continue;
        Object.assign(body, { action: parts.action }); Object.assign(head, { action: parts.action });
        const mb = mask(body), mh = mask(head);
        // head: bottom row and centre column of its lowest 3 rows
        let hb = -1; for (let y = H - 1; y >= 0 && hb < 0; y--) for (let x = 0; x < W; x++) if (mh[y * W + x]) { hb = y; break; }
        if (hb < 0) continue;
        let sx = 0, n2 = 0; for (let y = hb - 2; y <= hb; y++) for (let x = 0; x < W; x++) if (mh[y * W + x]) { sx += x; n2++; }
        const hx = Math.round(sx / n2);
        // torso centre: columns with the most body pixels in the band 4..20 px above the head bottom (chest/belly)
        const cnt = new Array(W).fill(0);
        for (let y = hb; y < Math.min(H, hb + 14); y++) for (let x = 0; x < W; x++) cnt[x] += mb[y * W + x];
        const mx = Math.max(...cnt);
        const cols = cnt.map((v, x) => (v >= 0.75 * mx && Math.abs(x - hx) <= 8 ? x : -1)).filter(x => x >= 0);
        const tx = cols.length ? cols.reduce((a, b2) => a + b2, 0) / cols.length : hx;
        // torso top under the head centre: climb from hb+6 while opaque (median over hx-1..hx+1)
        const tops = [];
        for (const x of [hx - 1, hx, hx + 1]) {
          let y = hb + 6;
          if (!mb[y * W + x]) { let f = -1; for (let yy = hb - 4; yy < Math.min(H, hb + 10); yy++) if (mb[yy * W + x]) { f = yy; break; } if (f < 0) continue; y = f; }
          while (y > 0 && mb[(y - 1) * W + x]) y--;
          tops.push(y);
        }
        tops.sort((a, b2) => a - b2);
        const top = tops.length ? tops[tops.length >> 1] : null;
        rows.push({ cls, action: n, key, dir, slot: s, contact: top == null ? null : hb - top, dx: Math.round(hx - tx) });
      }
    }
  }
  return rows;
}, packJson);
await b.close(); srv.close();
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(res, null, 0));
// contact -1 = head's last row right above the body's first row (touching). <= -2 = air gap; >= 4 = sunk; |dx| >= 4 = beside the torso
const bad = res.filter(r => r.contact == null || r.contact <= -2 || r.contact >= 4 || Math.abs(r.dx) >= 4);
const DN = ['up', 'right', 'down', 'left'];
console.log(`frames ${res.length}; head off the body: ${bad.length}`);
const by = {};
for (const r of bad) (by[r.cls] = by[r.cls] || []).push(`${r.action} ${DN[r.dir]}#${r.slot} contact=${r.contact} dx=${r.dx}`);
for (const [k, v] of Object.entries(by)) console.log(' ', k, v.length, '\n    ' + v.join('\n    '));
