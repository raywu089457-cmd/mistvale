// type-system.mjs — T114：字體／顏色系統（標題字體、等寬數字、稀有度色票、小字對比）
//   * --font-title 之前被引用卻沒定義 → 補上，並套到標題（modal / panel / 單位卡 / 詳情名字）。
//   * 數字改等寬（tabular-nums）：金幣／生命／材料跳動時不左右抖。
//   * 稀有度色票（RARITIES.color）延伸到卡片左緣與標籤底色，5 級要 5 個不同顏色。
//   * 小字對比：獎勵標籤 9.5px 從 4.56:1 拉到 5.5:1 以上，其餘 ≥4.5:1。
// 顏色字串一律帶回 Node 解析（不在頁面裡 eval 一大段字串——之前那裡出過 NaN 靜默通過）。
// Usage: node tools/checks/type-system.mjs    (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/type-system.mjs   寫出 output/type/*.png
// Exit: 0 = PASS line, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/type', { recursive: true });

// ── Node 端顏色工具 ─────────────────────────────────────
const parseRGB = s => {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map(v => Number(v.trim()));
  if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) return null;
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = c => 0.2126 * srgb(c.r) + 0.7152 * srgb(c.g) + 0.0722 * srgb(c.b);
const contrastOf = (fgStr, chain) => {
  const fg = parseRGB(fgStr);
  if (!fg) return null;
  let acc = null;
  for (const raw of chain || []) {
    const c = parseRGB(raw);
    if (!c || c.a === 0) continue;
    acc = acc
      ? { r: c.r * c.a + acc.r * (1 - c.a), g: c.g * c.a + acc.g * (1 - c.a), b: c.b * c.a + acc.b * (1 - c.a) }
      : { r: c.r, g: c.g, b: c.b };
    if (c.a >= 0.99) break;
  }
  if (!acc) acc = { r: 27, g: 53, b: 84 };
  const L1 = lum(fg), L2 = lum(acc);
  const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  return { r: +r.toFixed(2), fg: fgStr, bg: `rgb(${Math.round(acc.r)},${Math.round(acc.g)},${Math.round(acc.b)})` };
};

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
await page.waitForTimeout(1200);

const openModal = async action => {
  await page.evaluate(a => {
    const b = document.createElement('button');
    b.dataset.action = a; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
  }, action);
  await page.waitForTimeout(450);
};
const closeAll = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(220); };

// 量元素：字色 + 祖先底色鏈 + 字級/字重/字體
const measure = sels => page.evaluate(list => {
  const out = {};
  for (const [k, s] of Object.entries(list)) {
    const el = document.querySelector(s);
    if (!el) { out[k] = null; continue; }
    const cs = getComputedStyle(el);
    const chain = [];
    let cur = el;
    while (cur) { chain.push(getComputedStyle(cur).backgroundColor); cur = cur.parentElement; }
    out[k] = { color: cs.color, chain, size: cs.fontSize, weight: cs.fontWeight, ff: cs.fontFamily, num: cs.fontVariantNumeric || '' };
  }
  return out;
}, sels);

// ── 1) 字體 ────────────────────────────────────────────
await openModal('hunters');
const font = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const h2 = document.querySelector('.modal-title h2');
  const pt = document.querySelector('.panel-title');
  return {
    title: root.getPropertyValue('--font-title').trim(),
    h2ff: h2 ? getComputedStyle(h2).fontFamily : '',
    h2ls: h2 ? getComputedStyle(h2).letterSpacing : '',
    h2w: h2 ? getComputedStyle(h2).fontWeight : '',
    bodyNum: getComputedStyle(document.body).fontVariantNumeric || '',
  };
});
if (!font.title) fix('--font-title 還是沒有定義（#travel-veil 的 font 簡寫會整條失效）');
else ok(`--font-title = ${font.title.slice(0, 52)}…`);
const firstTitleFont = font.title.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
if (font.h2ff && firstTitleFont && !font.h2ff.toLowerCase().includes(firstTitleFont))
  fix(`.modal-title h2 沒用 --font-title（實際 ${font.h2ff}）`);
else ok(`標題字體：.modal-title h2 → ${font.h2ff.split(',')[0]}（${font.h2w}、字距 ${font.h2ls}）`);

// ── 2) 等寬數字 ────────────────────────────────────────
const digits = await page.evaluate(async () => {
  const g = globalThis.__mistvaleGame;
  const el = () => document.querySelector('#topbar .treasury b');
  const w = {};
  for (const v of [1111, 4444, 7777, 1000]) {
    g.state.gold = v;
    await new Promise(r => setTimeout(r, 110));
    w[v] = el() ? +el().getBoundingClientRect().width.toFixed(2) : -1;
  }
  g.state.gold = 5000;
  return { w, num: el() ? getComputedStyle(el()).fontVariantNumeric : '' };
});
const ws = Object.values(digits.w);
if (!ws.every(x => x > 0 && Math.abs(x - ws[0]) < 0.6)) fix(`金幣數字不是等寬：1111/4444/7777/1000 寬度 ${ws.join(' / ')}`);
else ok(`金幣數字等寬：${ws[0]}px（四個不同數字同寬）`);
if (!`${digits.num} ${font.bodyNum}`.includes('tabular-nums')) fix(`tabular-nums 沒生效（treasury: ${digits.num || 'n/a'} / body: ${font.bodyNum || 'n/a'}）`);
else ok(`tabular-nums 生效（body: ${font.bodyNum}）`);

// ── 3) 稀有度色票 ──────────────────────────────────────
const rar = await page.evaluate(async () => {
  const g = globalThis.__mistvaleGame, ids = ['normal', 'rare', 'superior', 'heroic', 'legendary'];
  g.state.hunters.forEach((h, i) => { h.rarity = ids[i % ids.length]; });
  document.querySelector('#modal .modal-title [data-action="close"]')?.click();
  await new Promise(r => setTimeout(r, 150));
  const b = document.createElement('button'); b.dataset.action = 'hunters'; b.style.display = 'none';
  document.body.append(b); b.click(); b.remove();
  await new Promise(r => setTimeout(r, 450));
  const box = document.querySelector('#modal-content').getBoundingClientRect();
  return [...document.querySelectorAll('#modal-content .hunter-card')].map(c => {
    const chip = c.querySelector('.rarity');
    const bar = getComputedStyle(c, '::before');
    const cr = c.getBoundingClientRect();
    const ch = chip ? chip.getBoundingClientRect() : null;
    const cs = chip ? getComputedStyle(chip) : null;
    const chain = [];
    let cur = chip;
    while (cur) { chain.push(getComputedStyle(cur).backgroundColor); cur = cur.parentElement; }
    return {
      rarity: c.dataset.rarity || '',
      barColor: bar.backgroundColor,
      chipText: chip ? chip.textContent.trim() : '',
      color: cs ? cs.color : '',
      inside: cr.left >= box.left - 1 && cr.right <= box.right + 1,
      chipInside: ch ? (ch.left >= cr.left - 1 && ch.right <= cr.right + 1) : false,
      chain,
    };
  });
});
const byRarity = new Map();
for (const c of rar) if (!byRarity.has(c.rarity)) byRarity.set(c.rarity, c);
if (byRarity.size < 5) fix(`稀有度只看到 ${byRarity.size} 種（應該 5 種）`);
const bars = [...byRarity.values()].map(c => c.barColor);
if (new Set(bars).size < byRarity.size) fix(`稀有度左緣色條有重複：${bars.join(' | ')}`);
else ok(`稀有度色票 ${byRarity.size} 色互不相同（${[...byRarity.keys()].join('／')}）`);
let rarBad = 0;
for (const c of byRarity.values()) {
  const cr = contrastOf(c.color, c.chain);
  if (!cr) { fix(`稀有度「${c.chipText}」算不出對比`); rarBad++; continue; }
  if (cr.r < 4.5) { fix(`稀有度標籤「${c.chipText}」對比 ${cr.r}:1 < 4.5`); rarBad++; }
  if (!c.inside || !c.chipInside) { fix(`稀有度標籤「${c.chipText}」撐破卡片或彈窗`); rarBad++; }
}
if (!rarBad) ok('稀有度標籤文字對比都 ≥4.5:1，晶片沒有撐破卡片');
if (process.env.SHOTS) await page.screenshot({ path: 'output/type/roster-1440x900.png' });
await closeAll();

// ── 4) 小字對比 ────────────────────────────────────────
const pairs = [];
await openModal('quests');
const qm = await measure({ '獎勵標籤': '.qs-reward>small', '鎖住章節標籤': '.qs-tag.locked', '章節說明': '.quest-step p' });
for (const [k, v] of Object.entries(qm)) if (v) pairs.push([k, v, k === '獎勵標籤' ? 5.5 : 4.5]);
await closeAll();
await openModal('hunters');
const hm = await measure({ '獵人卡等級職業': '.hunter-card small', '獵人卡狀態': '.hunter-card .status', '獵人卡攻防': '.hunter-card .hunter-stats' });
for (const [k, v] of Object.entries(hm)) if (v) pairs.push([k, v, 4.5]);
await closeAll();

for (const [k, v, min] of pairs) {
  const cr = contrastOf(v.color, v.chain);
  if (!cr) { fix(`${k} 對比算不出來（${v.color}）`); continue; }
  if (cr.r < min) fix(`${k} 對比 ${cr.r}:1 < ${min}:1（${cr.fg} on ${cr.bg}，${v.size}）`);
  else ok(`${k} ${cr.r}:1（${cr.fg} on ${cr.bg}，${v.size}）`);
}


// ── 5) 手機：稀有度晶片不能撐破卡片、不要橫向捲動 ─────────
{
  const c2 = await browser.newContext({ viewport: { width: 402, height: 712 }, deviceScaleFactor: 2, locale: 'zh-TW' });
  const p2 = await c2.newPage();
  await p2.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await p2.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await p2.waitForTimeout(900);
  const phone = await p2.evaluate(async () => {
    const g = globalThis.__mistvaleGame, ids = ['normal', 'rare', 'superior', 'heroic', 'legendary'];
    g.state.hunters.forEach((h, i) => { h.rarity = ids[i % ids.length]; });
    const b = document.createElement('button'); b.dataset.action = 'hunters'; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
    await new Promise(r => setTimeout(r, 500));
    const content = document.querySelector('#modal-content');
    const box = content.getBoundingClientRect();
    const cards = [...content.querySelectorAll('.hunter-card')];
    const bad = cards.filter(c => {
      const cr = c.getBoundingClientRect(), chip = c.querySelector('.rarity');
      const ch = chip ? chip.getBoundingClientRect() : null;
      return cr.left < box.left - 1 || cr.right > box.right + 1 || !ch || ch.left < cr.left - 1 || ch.right > cr.right + 1;
    }).map(c => c.dataset.rarity);
    return { cards: cards.length, bad, hscroll: content.scrollWidth - content.clientWidth, chips: [...content.querySelectorAll('.hunter-card .rarity')].map(e => e.textContent.trim()) };
  });
  if (phone.cards < 1) fix('phone 402x712：名冊沒有卡片');
  if (phone.hscroll > 1) fix(`phone 402x712：名冊橫向溢出 ${phone.hscroll}px`);
  if (phone.bad.length) fix(`phone 402x712：稀有度晶片或卡片超出範圍（${phone.bad.join(',')}）`);
  if (!phone.bad.length && phone.cards && phone.hscroll <= 1) ok(`phone 402x712 稀有度晶片：${phone.cards} 張卡片、無橫向溢出、晶片都在卡片內（${phone.chips.slice(0, 3).join('／')}…）`);
  if (process.env.SHOTS) await p2.screenshot({ path: 'output/type/roster-402x712.png' });
  await c2.close();
}

if (errs.length) fix(`頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
await browser.close();

if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  for (const o of oks) console.log('ok  ' + o);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS type system: 標題字體（--font-title 已定義並套用）、數字等寬（tabular-nums）、稀有度 5 色色票延伸到卡片左緣與標籤、小字對比 ≥4.5:1（獎勵標籤 ≥5.5:1）');
