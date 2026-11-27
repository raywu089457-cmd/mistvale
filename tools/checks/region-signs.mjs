// region-signs.mjs — 2026-11-26 使用者:「怪物區域立牌移動到該區域圍欄旁邊」(同一批:拿掉環村道路)。
//   N. 純 node(位置):七區都有立牌位置(overworld 的 regionSignSpot,畫面與這裡共用),而且
//      - 在自己的狩獵區裡、在村界外 1–3 格(圍籬旁,不在魔物群中間);
//      - 離同一邊的出村口(缺口正中央)至少 SIGN_GATE_CLEAR 格;任兩塊立牌至少 6 格;
//      - 世界上真的沒有環村道路了(getRoads 沒有 kind:'ring'、村外沒有路段)。
//   B. 瀏覽器(390×844、695×800、844×390;鏡頭對準每塊立牌,縮放 ZOOM(預設 2.2,遊玩距離)):
//      - 立牌的可點矩形(signRects,跟實際 hit test 同一份)整塊在畫面內;
//      - 不壓到建築畫出來的範圍(buildingBoxes,含屋頂)與可點範圍(hitRects)、建築名牌(__mistvaleMapLabels)、其他立牌;不蓋住出村口兩根柱子的投影點;
//      - 立牌中心與四個內縮角落用 elementFromPoint 打到的都是世界畫布(= 沒有 HUD／按鈕蓋在上面);
//      - 真的點下去會打開這一區的立牌畫面(#modal[data-type=density],標題含區名),畫面裡的「區域詳情」也開得起來。
//   用法:node tools/checks/region-signs.mjs(TARGET 空 = 自己開臨時伺服器,要先 npm run build)。SHOTS_DIR=資料夾 存截圖。
// Exit 0 = PASS, 1 = FIX lines.
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { REGIONS, RING_ORDER, regionSignSpot, regionContains, inVillage, SIGN_GATE_CLEAR } from '../../src/overworld.js';
import { VILLAGE_BOUNDS, EXITS } from '../../src/village-grid.js';
import { getRoads } from '../../src/landscape-layout.js';
import { createGame } from '../../src/pixel-game.js';

const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// ── N. 位置 ──
const spots = {};
for (const id of RING_ORDER) {
  const p = regionSignSpot(id); if (!p) { fix(`N ${id}: no sign spot`); continue; }
  spots[id] = p;
  const B = VILLAGE_BOUNDS, d = Math.hypot(Math.max(B.minX - p.x, 0, p.x - B.maxX), Math.max(B.minZ - p.z, 0, p.z - B.maxZ));
  if (!regionContains(id, p.x, p.z)) fix(`N ${id}: sign (${p.x.toFixed(1)},${p.z.toFixed(1)}) is not on ${id} ground`);
  if (inVillage(p.x, p.z) || d < 1 || d > 3) fix(`N ${id}: sign is ${d.toFixed(2)} tiles from the village edge (want 1–3, next to the fence)`);
  const gate = EXITS.find(e => e.side === p.side), along = p.side === 'north' || p.side === 'south' ? Math.abs(p.x - gate.x) : Math.abs(p.z - gate.z);
  if (along < SIGN_GATE_CLEAR - 1e-6) fix(`N ${id}: sign is ${along.toFixed(2)} tiles from the ${gate.id} gate (want ≥ ${SIGN_GATE_CLEAR})`);
}
const ids = Object.keys(spots);
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = spots[ids[i]], b = spots[ids[j]], d = Math.hypot(a.x - b.x, a.z - b.z); if (d < 6) fix(`N signs ${ids[i]}/${ids[j]} only ${d.toFixed(1)} tiles apart`); }
{ const g = createGame(), roads = getRoads(g.state.layout, g.state.buildings);
  if (roads.some(r => r.kind === 'ring')) fix('N the ring road is still in getRoads');
  const outside = roads.filter(r => [r.a, r.b].some(p => !inVillage(p.x, p.z) && !EXITS.some(e => Math.hypot(p.x - e.edge.x, p.z - e.edge.z) < .01)));
  if (outside.length) fix(`N ${outside.length} road segments outside the village`); }
if (!fails.length) ok(`N: 7 signs next to the fence (${ids.map(id => `${id}@${spots[id].side}`).join(' ')}), no road outside the village`);

// ── B. 瀏覽器 ──
const ZOOM = Number(process.env.ZOOM || 2.2);   // 遊玩時的縮放(使用者截圖那種看得到「II」的距離);ZOOM=0.01 = 拉到最遠(zoomFloor)
const VIEWS = { phone: { w: 390, h: 844, mobile: true }, mid: { w: 695, h: 800, mobile: true }, land: { w: 844, h: 390, mobile: true } };
const srv = await L.startServer(); const browser = await L.launch();
const url = srv.url.replace(/\?.*/, '') + '?preview=1';
try {
  for (const [vname, v] of Object.entries(VIEWS)) {
    const ctx = await L.newCtx(browser, v), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await L.boot(page, url);
    // 暫停、清掉魔物、流浪英雄移到遠處:立牌就在圍籬邊,魔物/英雄剛好走過時點到的是牠們(那是正常的點擊優先序,不是立牌壞了)
    await page.evaluate(() => { const s = __mistvaleGame.state; s.paused = true; s.enemies = []; s.spawnTimer = -1e9; s.regionSpawn = Object.fromEntries(Object.keys(s.regionSpawn || {}).map(k => [k, -1e9]));
      for (const w of s.wanderers || []) { w.x = -60; w.z = -60; w.route = []; } });
    let good = 0;
    for (const id of RING_ORDER) {
      const sp = spots[id]; if (!sp) continue;
      await page.evaluate(([x, z, zoom]) => __mistvaleView.lookAt(x, z, zoom), [sp.x, sp.z, ZOOM]);
      await page.waitForTimeout(450);
      const m = await page.evaluate(([id, gates]) => {
        const V = __mistvaleView, cv = document.querySelector('#world'), r = cv.getBoundingClientRect(), bot = V.unproject(r.right, r.bottom);
        const k = { x: r.width / bot.sx, y: r.height / bot.sy };
        const toClient = b => ({ l: r.left + b.x * k.x, t: r.top + b.y * k.y, r: r.left + (b.x + b.w) * k.x, b: r.top + (b.y + b.h) * k.y });
        const signs = V.signRects(), me = signs.find(s => s.id === 'region:' + id);
        if (!me) return { missing: true };
        const box = toClient(me), inter = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        const hitB = V.hitRects().map(h => ({ id: h.id, ...toClient(h) })).filter(h => inter(h, box) > 0).map(h => h.id);
        const art = (V.buildingBoxes?.() || []).map(h => ({ id: h.id, ...toClient(h) })).filter(h => inter(h, box) > 0).map(h => h.id);   // 建築這一幀畫出的可見範圍(屋頂、煙囪都算)
        const ml = globalThis.__mistvaleMapLabels?.(); const lk = ml ? { x: r.width / ml.width, y: r.height / ml.height } : k;
        const labels = (ml?.labels || []).map(l => ({ id: l.id, l: r.left + l.x * lk.x, t: r.top + l.y * lk.y, r: r.left + (l.x + l.w) * lk.x, b: r.top + (l.y + l.h) * lk.y })).filter(l => inter(l, box) > 0).map(l => l.id);
        const others = signs.filter(s => s !== me).map(s => ({ id: s.id, ...toClient(s) })).filter(s => inter(s, box) > 0).map(s => s.id);
        const gateHit = gates.filter(([gx, gz]) => { const p = V.project(gx, 0, gz); const c = { x: r.left + p.x * k.x, y: r.top + p.y * k.y }; return c.x > box.l && c.x < box.r && c.y > box.t && c.y < box.b; }).length;
        const inView = box.l >= 0 && box.t >= 0 && box.r <= innerWidth && box.b <= innerHeight;
        const pts = [[.5, .5], [.2, .2], [.8, .2], [.2, .8], [.8, .8]].map(([u, w]) => [box.l + (box.r - box.l) * u, box.t + (box.b - box.t) * w]);
        const covered = pts.map(([x, y]) => document.elementFromPoint(x, y)).filter(e => e && e.tagName !== 'CANVAS').map(e => (e.id ? '#' + e.id : '') + (typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') || e.tagName);
        return { box, hitB, art, labels, others, gateHit, inView, covered: [...new Set(covered)], click: { x: (box.l + box.r) / 2, y: box.t + (box.b - box.t) * 0.45 } };
      }, [id, EXITS.flatMap(e => e.side === 'north' || e.side === 'south' ? [[e.x - 1.5, e.z], [e.x + 1.5, e.z]] : [[e.x, e.z - 1.5], [e.x, e.z + 1.5]])]);
      const tag = `B ${vname} ${id}`;
      if (m.missing) { fix(`${tag}: sign not drawn / not clickable after centring on it`); continue; }
      let bad = 0;
      if (!m.inView) { fix(`${tag}: sign box ${JSON.stringify(m.box)} leaves the screen`); bad++; }
      if (m.hitB.length) { fix(`${tag}: sign overlaps building hit areas ${m.hitB.join(',')}`); bad++; }
      if (m.art.length) { fix(`${tag}: sign overlaps the drawn building ${m.art.join(',')}`); bad++; }
      if (m.labels.length) { fix(`${tag}: sign overlaps map labels ${m.labels.join(',')}`); bad++; }
      if (m.others.length) { fix(`${tag}: sign overlaps other signs ${m.others.join(',')}`); bad++; }
      if (m.gateHit) { fix(`${tag}: sign covers a gate post`); bad++; }
      if (m.covered.length) { fix(`${tag}: HUD covers the sign (${m.covered.join(',')})`); bad++; }
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `sign-${vname}-${id}.png`) });
      // 點下去:開這一區的立牌畫面,再開區域詳情
      await page.mouse.click(m.click.x, m.click.y); await page.waitForTimeout(350);
      const modal = await page.evaluate(name => { const md = document.querySelector('#modal'), open = !document.querySelector('#modal-backdrop')?.classList.contains('hidden');
        return { open, type: md?.dataset.type, hasName: (md?.textContent || '').includes(name) }; }, REGIONS.find(r => r.id === id).name);
      if (!modal.open || modal.type !== 'density' || !modal.hasName) { fix(`${tag}: clicking the sign opened ${JSON.stringify(modal)} (want the ${id} density panel)`); bad++; }
      else {
        const det = await page.evaluate(() => { const b = [...document.querySelectorAll('#modal [data-action]')].find(e => /區域詳情/.test(e.textContent || '')); if (!b) return 'no-button'; b.click(); return document.querySelector('#modal')?.dataset.type || '?'; });
        if (det !== 'region') { fix(`${tag}: 區域詳情 from the sign panel gave ${det}`); bad++; }
      }
      await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await page.waitForTimeout(200);
      if (!bad) good++;
    }
    if (errs.length) fix(`B ${vname}: page errors ${errs.join(' | ')}`);
    if (good === RING_ORDER.length) ok(`B ${vname}: all 7 signs on screen, clear of buildings/labels/gates/HUD, open their panel`);
    await ctx.close();
  }
} finally { await browser.close(); srv.stop(); }
for (const m of fails) console.log('FIX ' + m);
if (!fails.length) console.log('PASS region-signs: ' + oks.join(' | '));
process.exit(fails.length ? 1 : 0);
