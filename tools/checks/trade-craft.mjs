// trade-craft.mjs — T101: 交易所與製作面板要把「夠不夠」寫出來。
//   craft: 每張卡的材料 chip 顯示 現有/需要（不足標紅）、最多能做幾批、做不完時主鈕 disabled，
//          「做滿」按鈕的 data-batches 要等於算出來的最大批數。
//   trade: 每列顯示這一列會花多少金（未收購顯示「未收購」）、金庫不足時標紅；
//          頁尾同時寫出 預計支出 與 金庫，超出時指出超出多少；± 鈕在 0/999 時要 disabled。
// Usage: node tools/checks/trade-craft.mjs        (game server on 5024 expected; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/trade-craft.mjs   also writes output/trade-craft/montage.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'module';
import fs from 'node:fs';
import { MATERIALS, PRODUCTS, RECIPES } from '../../src/pixel-data.js';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { label: 'desktop 1440x900', width: 1440, height: 900, phone: false },
  { label: 'phone 402x712', width: 402, height: 712, phone: true },
];
const fmt = n => Math.floor(Number(n) || 0).toLocaleString('en-US');
const fails = [], shots = [];
const fix = m => fails.push(m);

// deterministic village: food 2 batches, drink 0 (short), bed 2, bandage 1; weapon 1, armour 0 (short)
const RES = { wood: 40, ore: 20, herb: 3, cloth: 9, flour: 13, leather: 8, gold: 1500 };
const wantBatches = cost => Math.min(100, ...Object.entries(cost).map(([k, v]) => Math.floor((RES[k] || 0) / v)));

if (process.env.SHOTS) fs.mkdirSync('output/trade-craft', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

async function boot(dev) {
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.phone ? 2 : 1,
    isMobile: dev.phone, hasTouch: dev.phone, locale: 'zh-TW',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  try {
    await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  } catch (e) {
    return { ctx, page, errs, error: e };
  }
  await page.evaluate(({ res, keys }) => {
    const g = globalThis.__mistvaleGame;
    g.state.paused = true;
    for (const [k, v] of Object.entries(res)) if (k !== 'gold') g.state[k] = v;
    g.state.gold = res.gold;
    g.state.tradeRequests = Object.fromEntries(keys.map(k => [k, 0]));
  }, { res: RES, keys: Object.keys(MATERIALS) });
  return { ctx, page, errs, error: null };
}

async function act(page, action, id) {
  await page.evaluate(({ action, id }) => {
    const el = document.createElement('button');
    el.dataset.action = action; if (id) el.dataset.id = id;
    el.style.display = 'none';
    document.body.append(el); el.click(); el.remove();
  }, { action, id });
  await page.waitForTimeout(450);
}

const READ_CRAFT = () => {
  const c = document.querySelector('#modal-content');
  if (!c) return { open: false };
  const cards = [...c.querySelectorAll('.craft-card')].map(card => {
    const chips = [...card.querySelectorAll('.cost .cost-chip')].map(ch => ({
      short: ch.classList.contains('short'),
      have: ch.dataset.have, need: ch.dataset.need,
      sw: ch.scrollWidth, cw: ch.clientWidth,
    }));
    const btns = [...card.querySelectorAll('.craft-buttons .pixel-button, button.pixel-button')].map(b => ({
      action: b.dataset.action || '', batches: b.dataset.batches ?? null, text: b.textContent.trim(),
      disabled: b.disabled, insideCard: card.contains(b),
    }));
    const meta = card.querySelector('.craft-meta')?.textContent.trim() || '';
    const r = card.getBoundingClientRect();
    return {
      title: card.querySelector('h3')?.textContent.trim() || '',
      chips, meta, btns, h: r.height, sw: card.scrollWidth, cw: card.clientWidth,
      out: [...card.querySelectorAll('*')].filter(e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.right > r.right + .5; }).length,
    };
  });
  return { open: true, cards, sw: c.scrollWidth, cw: c.clientWidth, overflowY: document.querySelector('#modal')?.scrollHeight };
};

const READ_TRADE = () => {
  const c = document.querySelector('#modal-content');
  if (!c) return { open: false };
  const rows = [...c.querySelectorAll('.trade-row')].map(row => {
    const btn = d => row.querySelector(`[data-action="tradeStep"][data-d="${d}"]`);
    const q = row.querySelector('.tr-step output');
    return {
      name: row.querySelector('.tr-name b')?.textContent.trim() || '',
      q: Number(q?.textContent.replace(/[^\d-]/g, '') || 0),
      cost: row.querySelector('.tr-cost')?.textContent.trim() || '',
      over: row.querySelector('.tr-cost')?.classList.contains('over') || false,
      minus: { '-10': btn('-10')?.disabled, '-1': btn('-1')?.disabled },
      plus: { '1': btn('1')?.disabled, '10': btn('10')?.disabled },
    };
  });
  const footer = c.querySelector('.trade-summary')?.textContent.replace(/\s+/g, ' ').trim() || '';
  return { open: true, rows, footer, footerHTML: c.querySelector('.trade-summary')?.innerHTML || '' };
};

for (const dev of DEVICES) {
  const { ctx, page, errs, error } = await boot(dev);
  if (error) {
    fix(`${dev.label}: TARGET unreachable ${URL} (${String(error.message).split(/\r?\n/)[0].slice(0, 120)})`);
    await ctx.close();
    continue;
  }

  // ---------- 製作：生活物資 ----------
  await act(page, 'craft');
  await act(page, 'craftTab', 'goods');
  let t = `${dev.label} 製作/生活物資`;
  let res = await page.evaluate(READ_CRAFT);
  if (!res.open) fix(`${t}: modal did not open`);
  else {
    if (res.sw > res.cw + 1) fix(`${t}: #modal-content hscroll ${res.sw} > ${res.cw}`);
    const ids = Object.keys(PRODUCTS);
    if (res.cards.length !== ids.length) fix(`${t}: ${res.cards.length} craft cards, expected ${ids.length}`);
    res.cards.forEach((card, i) => {
      const id = ids[i], p = PRODUCTS[id], maxB = wantBatches(p.cost);
      const who = `${t} ${p.name}`;
      if (card.title !== p.name) fix(`${who}: card title "${card.title}" != "${p.name}"`);
      if (card.sw > card.cw + 1) fix(`${who}: card hscroll ${card.sw} > ${card.cw}`);
      if (card.out) fix(`${who}: ${card.out} children stick out of the card`);
      // chips: one per material, have/need = current / one batch
      const keys = Object.keys(p.cost);
      if (card.chips.length !== keys.length) fix(`${who}: ${card.chips.length} cost chips, expected ${keys.length} (${keys.join('/')})`);
      keys.forEach((k, ci) => {
        const ch = card.chips[ci]; if (!ch) return;
        const have = RES[k] ?? 0, need = p.cost[k];
        if (Number(ch.have) !== have) fix(`${who}: ${MATERIALS[k].name} chip have ${ch.have} != ${have}`);
        if (Number(ch.need) !== need) fix(`${who}: ${MATERIALS[k].name} chip need ${ch.need} != ${need}`);
        if (ch.short !== have < need) fix(`${who}: ${MATERIALS[k].name} chip short ${ch.short}, want ${have < need}`);
        if (ch.sw > ch.cw + 1) fix(`${who}: ${MATERIALS[k].name} chip clipped`);
      });
      if (maxB < 1) { if (!card.meta.includes('材料不足')) fix(`${who}: meta "${card.meta}" should say 材料不足 when nothing is craftable`); }
      else if (!card.meta.includes(String(maxB))) fix(`${who}: meta "${card.meta}" does not state max batches ${maxB}`);
      const main = card.btns.find(b => b.action === 'craftProduct' && b.batches === null);
      if (!main) fix(`${who}: missing the primary craft button`);
      else {
        if (main.disabled !== (maxB < 1)) fix(`${who}: primary disabled ${main.disabled}, want ${maxB < 1}`);
        { const wantLabel = maxB >= 1 ? String(p.amount) : '材料不足'; if (!main.text.includes(wantLabel)) fix(`${who}: primary label "${main.text}" should name ${wantLabel}`); }
      }
      const full = card.btns.find(b => b.action === 'craftProduct' && b.batches !== null);
      if (maxB > 1) {
        if (!full) fix(`${who}: maxB ${maxB} but no 「做滿」 button`);
        else {
          if (Number(full.batches) !== maxB) fix(`${who}: 「做滿」 data-batches ${full.batches} != ${maxB}`);
          if (!full.text.includes(String(maxB * p.amount))) fix(`${who}: 「做滿」 label "${full.text}" does not name ${maxB * p.amount} 份`);
        }
      } else if (full) fix(`${who}: maxB ${maxB} should not offer a 「做滿」 button`);
    });
    console.log(`ok  ${t}: cards ${res.cards.length}, batch caps ${res.cards.map(c => (c.meta.match(/最多可做 (\d+)/) || [, '0'])[1]).join('/')}`);
    if (process.env.SHOTS && dev.width === 1440 || dev.width === 402) shots.push({ label: `${t}（小麥粉 13、藥草 3、亞麻布 9、獸皮 8）`, buf: await page.screenshot() });
  }

  // ---------- 製作：裝備 ----------
  await act(page, 'craftTab', 'gear');
  t = `${dev.label} 製作/裝備`;
  res = await page.evaluate(READ_CRAFT);
  if (!res.open) fix(`${t}: modal did not open`);
  else {
    const ids = RECIPES.map(r => r.id);
    if (res.cards.length !== ids.length) fix(`${t}: ${res.cards.length} gear cards, expected ${ids.length}`);
    res.cards.forEach((card, i) => {
      const r = RECIPES[i], maxB = wantBatches(r.cost), who = `${t} ${r.name}`;
      if (card.title !== r.name) fix(`${who}: card title "${card.title}" != "${r.name}"`);
      if (card.out) fix(`${who}: ${card.out} children stick out of the card`);
      Object.keys(r.cost).forEach((k, ci) => {
        const ch = card.chips[ci]; if (!ch) { fix(`${who}: missing ${MATERIALS[k].name} chip`); return; }
        if (Number(ch.have) !== (RES[k] ?? 0) || Number(ch.need) !== r.cost[k]) fix(`${who}: ${MATERIALS[k].name} chip ${ch.have}/${ch.need} != ${RES[k] ?? 0}/${r.cost[k]}`);
        if (ch.short !== ((RES[k] ?? 0) < r.cost[k])) fix(`${who}: ${MATERIALS[k].name} chip short ${ch.short}`);
      });
      if (maxB < 1) { if (!card.meta.includes('材料不足')) fix(`${who}: meta "${card.meta}" should say 材料不足`); }
      else if (!card.meta.includes(String(maxB))) fix(`${who}: meta "${card.meta}" does not state max ${maxB}`);
      const btn = card.btns.find(b => b.action === 'craftGear');
      if (!btn) fix(`${who}: missing 鍛造裝備 button`);
      else if (btn.disabled !== (maxB < 1)) fix(`${who}: 鍛造裝備 disabled ${btn.disabled}, want ${maxB < 1}`);
      else if (!btn.text.includes(maxB >= 1 ? '鍛造裝備' : '材料不足')) fix(`${who}: gear button label "${btn.text}" is wrong for maxB ${maxB}`);
    });
    console.log(`ok  ${t}: cards ${res.cards.length}`);
    if (process.env.SHOTS && dev.width === 1440 || dev.width === 402) shots.push({ label: `${t}（鐵礦 20、木材 40、獸皮 8、亞麻布 9）`, buf: await page.screenshot() });
  }

  // ---------- 交易所 ----------
  await act(page, 'trade');
  t = `${dev.label} 交易所`;
  res = await page.evaluate(READ_TRADE);
  if (!res.open) fix(`${t}: modal did not open`);
  else {
    if (res.rows.length !== Object.keys(MATERIALS).length) fix(`${t}: ${res.rows.length} trade rows, expected ${Object.keys(MATERIALS).length}`);
    res.rows.forEach(row => {
      const m = Object.values(MATERIALS).find(x => x.name === row.name);
      if (!m) { fix(`${t}: unknown row "${row.name}"`); return; }
      if (row.q !== 0) fix(`${t}: ${row.name} starts at ${row.q}, expected 0`);
      if (row.cost !== '未收購') fix(`${t}: ${row.name} idle cost text "${row.cost}" != 未收購`);
      if (!row.minus['-10'] || !row.minus['-1']) fix(`${t}: ${row.name} − buttons should be disabled at 0`);
      if (row.plus['1'] || row.plus['10']) fix(`${t}: ${row.name} + buttons should be enabled at 0`);
      if (row.over) fix(`${t}: ${row.name} idle row flagged over budget`);
    });
    if (!res.footer.includes('金庫') || !res.footer.includes(fmt(RES.gold))) fix(`${t}: footer "${res.footer}" does not show 金庫 ${fmt(RES.gold)}`);
    if (!res.footer.includes('預計支出')) fix(`${t}: footer "${res.footer}" does not name 預計支出`);
    if (res.footer.includes('超出')) fix(`${t}: footer flags 超出 while nothing is requested`);
    // +10 on 木材 → q 10, cost 20 金, footer budget 20
    const wood = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#modal-content .trade-row')].find(r => r.querySelector('.tr-name b')?.textContent.trim() === '木材');
      row?.querySelector('[data-action="tradeStep"][data-d="10"]')?.click();
      return true;
    });
    await page.waitForTimeout(500);
    res = await page.evaluate(READ_TRADE);
    const woodRow = res.rows.find(r => r.name === '木材');
    if (!wood || !woodRow) fix(`${t}: 木材 row vanished after +10`);
    else {
      if (woodRow.q !== 10) fix(`${t}: 木材 qty after +10 is ${woodRow.q}, expected 10`);
      if (woodRow.cost !== `支出 ${fmt(10 * MATERIALS.wood.price)} 金`) fix(`${t}: 木材 cost "${woodRow.cost}" != "支出 ${fmt(10 * MATERIALS.wood.price)} 金"`);   // 2026-11-11 物品格版面起成本行寫「支出 N 金」
      if (!res.footer.includes(fmt(10 * MATERIALS.wood.price))) fix(`${t}: footer "${res.footer}" does not book the ${fmt(10 * MATERIALS.wood.price)} 金 spend`);
      if (woodRow.minus['-10']) fix(`${t}: 木材 −10 should be enabled once qty is 10`);
    }
    if (process.env.SHOTS && dev.width === 1440 || dev.width === 402) shots.push({ label: `${t}（金庫 1,500 金，木材 +10）`, buf: await page.screenshot() });

    // 金庫 10 金、木材收購 10 份 → 這一列與頁尾都要標紅並寫出超出金額
    await page.evaluate(() => {
      const g = globalThis.__mistvaleGame;
      g.state.gold = 10;
      g.state.tradeRequests.wood = 10;
    });
    await act(page, 'trade');
    res = await page.evaluate(READ_TRADE);
    const overRow = res.rows.find(r => r.name === '木材');
    if (!overRow) fix(`${t}: 木材 row vanished after the over-budget setup`);
    else {
      if (!overRow.over) fix(`${t}: 木材 row should be flagged .over when 20 金 > 金庫 10 金`);
      if (overRow.cost !== `支出 ${fmt(20)} 金`) fix(`${t}: 木材 over-budget cost "${overRow.cost}"`);
    }
    if (!res.footer.includes(`超出 ${fmt(10)}`)) fix(`${t}: footer "${res.footer}" should say 超出 10`);
    if (!res.footerHTML.includes('over')) fix(`${t}: footer over-budget marker missing`);
    if (process.env.SHOTS && dev.width === 1440 || dev.width === 402) shots.push({ label: `${t}（金庫 10 金、木材收購 10 份 = 20 金 → 超出）`, buf: await page.screenshot() });

    // 上限 999：+ 與 +10 都要 disabled
    await page.evaluate(() => { globalThis.__mistvaleGame.state.tradeRequests.wood = 999; });
    await act(page, 'trade');
    res = await page.evaluate(READ_TRADE);
    const capRow = res.rows.find(r => r.name === '木材');
    if (!capRow) fix(`${t}: 木材 row vanished at cap`);
    else if (!capRow.plus['1'] || !capRow.plus['10']) fix(`${t}: 木材 + buttons must be disabled at the 999 cap`);
    console.log(`ok  ${t}: rows ${res.rows.length}, footer shows 金庫/預計支出/超出`);
  }

  if (errs.length) fix(`${dev.label}: page errors: ${errs.join(' | ')}`);
  await ctx.close();
}

await browser.close();

if (process.env.SHOTS && shots.length) {
  const tiles = shots.map(s => `<figure><figcaption>${s.label}</figcaption><img src="data:image/png;base64,${s.buf.toString('base64')}"></figure>`).join('');
  const b2 = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
  const p = await b2.newPage({ viewport: { width: 1100, height: 800 } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#14100c;color:#f0dfb8;font:600 20px/1.4 'Microsoft JhengHei',sans-serif}figure{margin:0 auto 22px;width:fit-content;max-width:1040px;padding:0 10px}figcaption{padding:8px 2px;letter-spacing:1px}img{display:block;max-width:1000px;height:auto;border:2px solid #6b4e2a}</style></head><body>${tiles}</body></html>`, { waitUntil: 'load' });
  await p.screenshot({ path: 'output/trade-craft/montage.png', fullPage: true });
  await b2.close();
  console.log('montage output/trade-craft/montage.png');
}

if (fails.length) {
  for (const f of fails) console.log(`FIX: ${f}`);
  console.log(`FAIL ${fails.length}`);
  process.exit(1);
}
console.log('PASS trade/craft: 製作卡顯示 現有/需要 材料、最多幾批、不足時主鈕 disabled、「做滿」批數正確；交易所每列花費、頁尾 金庫/預計支出/超出 與 ± 與 999 上限都在 1440x900 與 402x712 正確');
