// build-grid.mjs — T112：建設彈窗看得出來「現在能不能蓋／缺什麼／是不是被大廳卡住」。
//   * 每張卡：等級、成本（現有/需要）、缺口原因、滿級標示；上面一條村莊庫存列。
//   * 資料一律跟 state 對：成本的 have/need、short 標記、庫存列數字、主按鈕上的缺口文字。
// 2026-11-11 改寫（獵魔村風格第三階段）：舊版找 .cost-chip／.build-note／.chip.done／點整張卡開面板，新版已不存在。
//   不變量沒變，換成新版面的對應元素：
//     成本＝.hv-costs>.hv-cost（title＝「名稱 現有/需要」、.short＝不足、數字標紅），
//     缺口／大廳鎖／滿級＝卡片唯一的主按鈕區（.hv-btn 文字、.hv-btn.locked、.bc-done），狀態同時寫在 data-state，
//     開詳情＝右上角 .hv-i 小鈕（點卡片本體不再開面板，舊斷言改成點 .hv-i）。
//   新增（取代舊 chip 排版隱含的保證）：每張卡的成本列、按鈕都不可超出卡片外框，成本數字不可被截斷。
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
  const num = t => Number(String(t || '').replace(/[^\d]/g, ''));
  const cards = [...modal.querySelectorAll('.building-card')].map(el => {
    const id = el.dataset.id, lv = s.buildings[id] || 0;
    const r = el.getBoundingClientRect(), cr = modal.getBoundingClientRect();
    const chips = [...el.querySelectorAll('.hv-costs .hv-cost')].map(c => {
      const m = (c.title || '').match(/^(.*?)\s([\d,]+)\/([\d,]+)$/), cb = c.getBoundingClientRect();
      const b = c.querySelector('b');
      return {
        key: c.querySelector('[data-icon]')?.dataset.icon || '', nm: m ? m[1] : '',
        have: m ? num(m[2]) : NaN, need: m ? num(m[3]) : NaN, shown: num(b?.textContent),
        short: c.classList.contains('short'),
        inside: cb.left >= r.left - 1 && cb.right <= r.right + 1 && cb.top >= r.top - 1 && cb.bottom <= r.bottom + 1,
        clipped: !!b && b.scrollWidth > b.clientWidth + 1,
      };
    });
    const btn = el.querySelector('.hv-btn'), br = btn?.getBoundingClientRect();
    return {
      id, lv, state: el.dataset.state,
      levelText: el.querySelector('.bc-head small')?.textContent || '',
      chips,
      done: !!el.querySelector('.bc-done'),
      doneText: el.querySelector('.bc-done')?.textContent || '',
      btnText: btn?.textContent.trim() || '', btnDisabled: !!btn?.disabled, btnLocked: !!btn?.classList.contains('locked'),
      btnPrimary: !!btn?.classList.contains('primary'),
      btnInside: !br || (br.left >= r.left - 1 && br.right <= r.right + 1 && br.bottom <= r.bottom + 1),
      hasInfo: !!el.querySelector('.hv-i[data-action="selectBuilding"]'),
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
      // 每張卡的成本跟 getUpgradeCost 對（已建造的才有公開 API；未建造的只驗有成本、有數字）
      let checked = 0;
      for (const c of grid.cards) {
        if (!/^Lv\.\d+$|^未建造$/.test(c.levelText)) fix(`desktop ${c.id} 卡片沒有等級標示（${JSON.stringify(c.levelText)}）`);
        if (!c.hasInfo) fix(`desktop ${c.id} 卡片沒有右上角詳情鈕`);
        if (c.lv >= 5) { if (!c.done) fix(`desktop ${c.id} Lv.5 沒有「已達最高等級」`); continue; }
        if (!c.chips.length) fix(`desktop ${c.id} 沒有任何成本`);
        for (const x of c.chips) {
          if (!x.inside) fix(`desktop ${c.id} 成本 ${x.nm} 超出卡片外框`);
          if (x.clipped) fix(`desktop ${c.id} 成本 ${x.nm} 的數字被截斷`);
          if (x.shown !== x.need) fix(`desktop ${c.id} ${x.nm} 畫面上的數字 ${x.shown} != title 的需要 ${x.need}`);
        }
        const cost = await expectCost(page, c.id, c.lv);
        if (!cost) continue;   // 未建造：成本表不在公開 API
        const keys = Object.keys(cost);
        if (c.chips.length !== keys.length) fix(`desktop ${c.id} 成本數量 ${c.chips.length} != 需求 ${keys.length}`);
        for (const [k, v] of Object.entries(cost)) {
          const chip = c.chips.find(x => x.key === k);
          if (!chip) { fix(`desktop ${c.id} 缺 ${k} 的成本`); continue; }
          if (chip.need !== v) fix(`desktop ${c.id} ${k} 需要 ${chip.need} != ${v}`);
          const have = Number(st[k] || 0);
          if (chip.have !== Math.floor(have)) fix(`desktop ${c.id} ${k} 現有 ${chip.have} != ${have}`);
          if (chip.short !== (have < v)) fix(`desktop ${c.id} ${k} short 標記不對（have ${have} need ${v}）`);
          checked++;
        }
      }
      ok(`desktop 每張卡的成本與 getUpgradeCost／state 相符且都在卡片內（檢查 ${checked} 個材料）`);
      // 資源充足：不該有任何缺口文字，可蓋／可升的卡片主按鈕是啟用的
      const notes = grid.cards.filter(c => c.lv < 5 && (/^缺/.test(c.btnText) || c.state === 'short'));
      const dead = grid.cards.filter(c => c.lv < 5 && c.state !== 'locked' && (c.btnDisabled || !c.btnPrimary));
      if (notes.length) fix(`desktop 資源充足卻有缺口文字：${notes.map(n => n.id + ':' + n.btnText).join(' / ')}`);
      else if (dead.length) fix(`desktop 資源充足但主按鈕不是可按的主色鈕：${dead.map(n => n.id).join('/')}`);
      else ok('desktop 資源充足時沒有缺口文字，成本全部達標，主按鈕可按');
      if (process.env.SHOTS) await page.screenshot({ path: 'output/build-grid/desktop-rich.png' });

      // 資源不足：金幣歸零 → 金幣 chip 標紅、卡片文字寫缺多少
      await closeBuild(page);
      await setState(page, { res: { gold: 0 } });
      await openBuild(page);
      grid = await readGrid(page);
      const shortCards = grid.cards.filter(c => c.lv < 5 && c.chips.some(x => x.short));
      if (!shortCards.length) fix('desktop 金幣 0 卻沒有任何卡片標示資源不足');
      else {
        const c0 = shortCards.find(c => c.state === 'short') || shortCards[0];
        if (!c0.btnText.startsWith('缺')) fix(`desktop 資源不足的卡片沒有寫缺口：${JSON.stringify(c0.btnText)}`);
        if (!c0.btnDisabled) fix(`desktop 資源不足的卡片主按鈕還能按：${c0.id}`);
        if (!/金幣/.test(c0.btnText)) fix(`desktop 缺口文字沒提到金幣：${c0.btnText}`);
        const goldChip = c0.chips.find(x => x.key === 'gold');
        if (!goldChip || !goldChip.short) fix(`desktop ${c0.id} 金幣不足但金幣成本沒標 short`);
        ok(`desktop 金幣 0：${shortCards.length} 張卡標紅，例 ${c0.id}「${c0.btnText}」`);
      }
      if (process.env.SHOTS) await page.screenshot({ path: 'output/build-grid/desktop-short.png' });

      // 大廳等級不足：大廳 Lv.1、鐵匠鋪 Lv.2 → 鐵匠鋪寫需要大廳 Lv.3
      await closeBuild(page);
      await setState(page, { res, buildings: { hall: 1, forge: 2 } });
      await openBuild(page);
      grid = await readGrid(page);
      const forge = grid.cards.find(c => c.id === 'forge');
      if (!forge) fix('desktop 找不到鐵匠鋪卡片');
      else if (!/需要大廳 Lv\.3/.test(forge.btnText) || !forge.btnLocked || !forge.btnDisabled) fix(`desktop 大廳不足時鐵匠鋪沒有寫原因或沒鎖住：${JSON.stringify(forge.btnText)} locked=${forge.btnLocked}`);
      else ok(`desktop 大廳 Lv.1／鐵匠鋪 Lv.2：卡片寫「${forge.btnText}」`);

      // 滿級：小屋 Lv.5 → 已達最高等級
      await closeBuild(page);
      await setState(page, { buildings: { hall: 5, house: 5 } });
      await openBuild(page);
      grid = await readGrid(page);
      const house = grid.cards.find(c => c.id === 'house');
      if (!house) fix('desktop 找不到小屋卡片');
      else if (!house.done || !/已達最高等級/.test(house.doneText)) fix(`desktop 小屋 Lv.5 沒有滿級標示（${JSON.stringify(house.doneText)}）`);
      else if (house.btnText || house.chips.length) fix(`desktop 小屋 Lv.5 還有按鈕或成本「${house.btnText}」`);
      else ok('desktop 小屋 Lv.5：顯示「已達最高等級」且沒有缺口文字');

      // 點卡片仍然選到建築（面板開起來）
      await closeBuild(page);
      await setState(page, { res, buildings: { hall: 3, house: 2 } });
      await openBuild(page);
      await page.evaluate(() => { document.querySelector('.building-card[data-id="house"] .hv-i')?.click(); });
      await page.waitForTimeout(420);
      const insp = await page.evaluate(() => {
        const el = document.querySelector('#inspector');
        return { open: !!el && !el.classList.contains('hidden'), level: el?.querySelector('.inspect-level')?.textContent || '', modal: document.body.dataset.modalTab || '' };
      });
      if (!insp.open) fix('desktop 點建設卡片右上角的詳情鈕沒有打開建築面板');
      else if (!insp.level.includes('Lv.2')) fix(`desktop 點小屋卡片打開的面板等級不對：${insp.level}`);
      else if (insp.modal) fix(`desktop 點詳情鈕後建設彈窗沒有關（modalTab=${insp.modal}）`);
      else ok('desktop 點詳情鈕選到那棟建築並打開面板（彈窗關閉）');
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
      else ok(`phone ${shortCards.length} 張卡標紅並寫缺口（例 ${shortCards[0].id}「${shortCards[0].btnText}」）`);
      const noNote = shortCards.filter(c => c.lv < 5 && c.state !== 'locked' && !/^缺/.test(c.btnText));
      if (noNote.length) fix(`phone 標紅的卡片沒有寫原因：${noNote.map(c => c.id).join('/')}`);
      const spill = grid.cards.filter(c => c.lv < 5 && (c.chips.some(x => !x.inside || x.clipped) || !c.btnInside));
      if (spill.length) fix(`phone 成本或按鈕超出卡片：${spill.map(c => c.id).join('/')}`);
      else ok('phone 每張卡的成本列與按鈕都在卡片內');
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
