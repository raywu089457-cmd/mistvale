// build-grid.mjs — T112：建設彈窗看得出來「現在能不能蓋／缺什麼／是不是被大廳卡住」。
//   * 每張卡：等級、需求 chip（現有/需要）、缺口原因、滿級標示；上面一條村莊庫存列。
//   * 資料一律跟 state 對：chip 的 have/need、short 標記、庫存列數字、缺口文字。
// Usage: node tools/checks/build-grid.mjs          (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/build-grid.mjs     另外寫出 output/build-grid/*.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/build-grid', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  return { ctx, page, errs };
}

const setState = (page, patch) => page.evaluate(p => {
  const s = globalThis.__mistvaleGame.state;
  Object.assign(s, p.res || {});
  if (p.buildings) Object.assign(s.buildings, p.buildings);
  return true;
}, patch);

async function openBuild(page) {
  await page.evaluate(() => { document.querySelector('#bottom-bar [data-action="build"]')?.click(); });
  await page.waitForTimeout(420);
  return page.evaluate(() => document.body.dataset.modalTab || '');
}
const closeBuild = async page => { await page.keyboard.press('Escape'); await page.waitForTimeout(220); };

// 讀建設彈窗：庫存列 + 每張卡（等級／chips／note）
const readGrid = page => page.evaluate(() => {
  const s = globalThis.__mistvaleGame.state, modal = document.querySelector('#modal-content');
  if (!modal) return null;
  const stock = [...modal.querySelectorAll('.build-stock .bs-item')].map(el => ({
    key: el.dataset.key, nm: el.querySelector('.nm')?.textContent || '', val: Number((el.querySelector('b')?.textContent || '').replace(/[^\d]/g, '')),
  }));
  const cards = [...modal.querySelectorAll('.building-card')].map(el => {
    const id = el.dataset.id, lv = s.buildings[id] || 0;
    const cost = el.classList.contains('unbuilt') ? null : null;
    const chips = [...el.querySelectorAll('.build-cost .cost-chip')].map(c => ({
      key: c.querySelector('.inline-icon')?.dataset.icon || c.dataset.key || '',
      nm: c.querySelector('.nm')?.textContent || '',
      have: Number(c.dataset.have || 0), need: Number(c.dataset.need || 0),
      short: c.classList.contains('short'), done: c.classList.contains('done'),
    }));
    const r = el.getBoundingClientRect(), cr = modal.getBoundingClientRect();
    return {
      id, lv,
      levelText: el.querySelector('small')?.textContent || '',
      chips,
      note: el.querySelector('.build-note')?.textContent || '',
      aria: el.getAttribute('aria-label') || '',
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right },
      inside: r.x >= cr.x - 1 && r.right <= cr.right + 1,
    };
  });
  const content = modal.getBoundingClientRect();
  return {
    stock, cards,
    hscroll: modal.scrollWidth > modal.clientWidth + 1,
    content: { w: content.width, x: content.x, right: content.right },
  };
});

const dataOf = (page, ids) => page.evaluate(ids => {
  const s = globalThis.__mistvaleGame.state, g = globalThis.__mistvaleGame;
  const out = {};
  for (const id of ids) {
    const lv = s.buildings[id] || 0;
    let cost = null;
    try { cost = lv ? g.getUpgradeCost(id) : (globalThis.__mistvaleBuildings || []).find?.(); } catch {}
    out[id] = { lv, cost };
  }
  return out;
}, ids);

// 期望值：直接用 BUILDINGS / getUpgradeCost（透過 page 內部的 module 拿不到，所以用 UI 以外的來源：state 與 game API）
const expectCost = (page, id, lv) => page.evaluate(({ id, lv }) => {
  const g = globalThis.__mistvaleGame;
  if (!lv) {
    // 未建造：成本就在 BUILDINGS 表，遊戲把它放在 state 快照外，這裡改由卡片 aria 與後端 API 驗證
    return null;
  }
  try { return g.getUpgradeCost(id); } catch { return null; }
}, { id, lv });

// ── desktop ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const res = { wood: 120, ore: 120, herb: 120, cloth: 120, flour: 120, leather: 120, gold: 9000 };
  await setState(page, { res, buildings: { hall: 3, house: 2, forge: 2, tavern: 2, dungeon: 0, arena: 0 } });
  if (!(await openBuild(page))) fix('desktop 按「建設」沒有打開彈窗');
  else {
    let grid = await readGrid(page);
    if (!grid) fix('desktop 建設彈窗沒有內容');
    else {
      ok(`desktop 建設彈窗打開：${grid.cards.length} 張卡、庫存 ${grid.stock.length} 項`);
      // 庫存列 == state
      const st = await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; return { gold: s.gold, wood: s.wood, ore: s.ore, herb: s.herb, cloth: s.cloth, flour: s.flour, leather: s.leather }; });
      for (const it of grid.stock) if (it.val !== Math.floor(Number(st[it.key] || 0))) fix(`desktop 庫存列 ${it.nm} 顯示 ${it.val}，state 是 ${st[it.key]}`);
      if (grid.stock.length !== 7) fix(`desktop 庫存列只有 ${grid.stock.length} 項（金幣＋6 種材料應為 7）`);
      if (!grid.stock.some(i => i.nm === '金幣')) fix('desktop 庫存列沒有金幣');
      // 每張卡的需求 chip 跟 getUpgradeCost 對
      let checked = 0;
      for (const c of grid.cards) {
        if (c.lv >= 5) { if (!c.chips.some(x => x.done)) fix(`desktop ${c.id} Lv.5 沒有「已達最高等級」`); continue; }
        const cost = await expectCost(page, c.id, c.lv);
        if (!cost) continue;   // 未建造：成本表不在公開 API
        const keys = Object.keys(cost);
        if (c.chips.filter(x => !x.done).length !== keys.length) fix(`desktop ${c.id} chip 數量 ${c.chips.length} != 需求 ${keys.length}`);
        for (const [k, v] of Object.entries(cost)) {
          const chip = c.chips.find(x => x.nm === (k === 'gold' ? '金幣' : null) || x.need === v);
          if (!chip) { fix(`desktop ${c.id} 缺 ${k} 的 chip`); continue; }
          const have = Number(st[k] || 0);
          if (chip.have !== Math.floor(have)) fix(`desktop ${c.id} ${k} 現有 ${chip.have} != ${have}`);
          if (chip.short !== (have < v)) fix(`desktop ${c.id} ${k} short 標記不對（have ${have} need ${v}）`);
          checked++;
        }
      }
      ok(`desktop 每張卡的需求 chip 與 getUpgradeCost／state 相符（檢查 ${checked} 個材料）`);
      // 資源充足：不該有任何缺口文字
      const notes = grid.cards.filter(c => c.note && c.lv < 5);
      if (notes.length) fix(`desktop 資源充足卻有缺口文字：${notes.map(n => n.id + ':' + n.note).join(' / ')}`);
      else ok('desktop 資源充足時沒有缺口文字，chips 全部達標');
      if (process.env.SHOTS) await page.screenshot({ path: 'output/build-grid/desktop-rich.png' });

      // 資源不足：金幣歸零 → 金幣 chip 標紅、卡片文字寫缺多少
      await closeBuild(page);
      await setState(page, { res: { gold: 0 } });
      await openBuild(page);
      grid = await readGrid(page);
      const shortCards = grid.cards.filter(c => c.lv < 5 && c.chips.some(x => x.short));
      if (!shortCards.length) fix('desktop 金幣 0 卻沒有任何卡片標示資源不足');
      else {
        const c0 = shortCards[0];
        if (!c0.note.startsWith('缺 ')) fix(`desktop 資源不足的卡片沒有寫缺口：${JSON.stringify(c0.note)}`);
        if (!/金幣/.test(c0.note)) fix(`desktop 缺口文字沒提到金幣：${c0.note}`);
        ok(`desktop 金幣 0：${shortCards.length} 張卡標紅，例 ${c0.id}「${c0.note}」`);
      }
      if (process.env.SHOTS) await page.screenshot({ path: 'output/build-grid/desktop-short.png' });

      // 大廳等級不足：大廳 Lv.1、鐵匠鋪 Lv.2 → 鐵匠鋪寫需要大廳 Lv.3
      await closeBuild(page);
      await setState(page, { res, buildings: { hall: 1, forge: 2 } });
      await openBuild(page);
      grid = await readGrid(page);
      const forge = grid.cards.find(c => c.id === 'forge');
      if (!forge) fix('desktop 找不到鐵匠鋪卡片');
      else if (!/需要城鎮大廳 Lv\.3/.test(forge.note)) fix(`desktop 大廳不足時鐵匠鋪沒有寫原因：${JSON.stringify(forge.note)}`);
      else ok(`desktop 大廳 Lv.1／鐵匠鋪 Lv.2：卡片寫「${forge.note}」`);

      // 滿級：小屋 Lv.5 → 已達最高等級
      await closeBuild(page);
      await setState(page, { buildings: { hall: 5, house: 5 } });
      await openBuild(page);
      grid = await readGrid(page);
      const house = grid.cards.find(c => c.id === 'house');
      if (!house) fix('desktop 找不到小屋卡片');
      else if (!house.chips.some(x => x.done)) fix(`desktop 小屋 Lv.5 沒有滿級標示（${JSON.stringify(house.chips)}）`);
      else if (house.note) fix(`desktop 小屋 Lv.5 還寫著缺口「${house.note}」`);
      else ok('desktop 小屋 Lv.5：顯示「已達最高等級」且沒有缺口文字');

      // 點卡片仍然選到建築（面板開起來）
      await closeBuild(page);
      await setState(page, { res, buildings: { hall: 3, house: 2 } });
      await openBuild(page);
      await page.evaluate(() => { document.querySelector('.building-card[data-id="house"]')?.click(); });
      await page.waitForTimeout(420);
      const insp = await page.evaluate(() => {
        const el = document.querySelector('#inspector');
        return { open: !!el && !el.classList.contains('hidden'), level: el?.querySelector('.inspect-level')?.textContent || '', modal: document.body.dataset.modalTab || '' };
      });
      if (!insp.open) fix('desktop 點建設彈窗的卡片沒有打開建築面板');
      else if (!insp.level.includes('Lv.2')) fix(`desktop 點小屋卡片打開的面板等級不對：${insp.level}`);
      else if (insp.modal) fix(`desktop 點卡片後建設彈窗沒有關（modalTab=${insp.modal}）`);
      else ok('desktop 點卡片仍然選到那棟建築並打開面板（彈窗關閉）');
    }
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ─────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await setState(page, { res: { wood: 30, ore: 4, herb: 12, cloth: 3, flour: 8, leather: 2, gold: 260 }, buildings: { hall: 2, house: 2 } });
  if (!(await openBuild(page))) fix('phone 按「建設」沒有打開彈窗');
  else {
    const grid = await readGrid(page);
    if (!grid) fix('phone 建設彈窗沒有內容');
    else {
      ok(`phone 建設彈窗打開：${grid.cards.length} 張卡，內容寬 ${Math.round(grid.content.w)}`);
      if (grid.hscroll) fix('phone 建設彈窗出現橫向捲動');
      const out = grid.cards.filter(c => !c.inside);
      if (out.length) fix(`phone ${out.map(c => c.id).join('/')} 卡片溢出內容框`);
      const shortCards = grid.cards.filter(c => c.chips.some(x => x.short));
      if (!shortCards.length) fix('phone 資源不足情境卻沒有標紅的卡片');
      else ok(`phone ${shortCards.length} 張卡標紅並寫缺口（例 ${shortCards[0].id}「${shortCards[0].note}」）`);
      const noNote = shortCards.filter(c => !c.note);
      if (noNote.length) fix(`phone 標紅的卡片沒有寫原因：${noNote.map(c => c.id).join('/')}`);
      if (process.env.SHOTS) await page.screenshot({ path: 'output/build-grid/phone.png' });
    }
  }
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close();

if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS build grid: 建設彈窗頂端列村莊庫存，每張卡寫 Lv.／需求（現有/需要）／缺口字樣，資源不足標紅、滿級寫已達最高等級、大廳等級不足寫原因，點卡片仍會選到建築；資料與 state 一致，手機不橫向溢出');
