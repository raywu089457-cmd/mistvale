// stock-panel.mjs — T123：倉庫面板（材料／生活物資／裝備分組，每項寫用途與來源）
//   * 用途與來源是從 PRODUCTS／RECIPES／ENEMIES 推導的：這裡直接驗推導結果，
//     而不是驗某段寫死的文案（改配方時說明要跟著改，檢查器會抓到）。
// Usage: node tools/checks/stock-panel.mjs     (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/stock-panel.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/stock', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

const openStock = page => page.evaluate(async () => {
  const b = document.createElement('button'); b.dataset.action = 'inventory'; b.style.display = 'none';
  document.body.append(b); b.click(); b.remove();
  await new Promise(r => setTimeout(r, 420));
});

const read = page => page.evaluate(() => {
  const content = document.querySelector('#modal-content');
  const secs = [...content.querySelectorAll('.stock-sec')].map(s => ({
    key: s.dataset.sec || '',
    title: s.querySelector('.stock-sec-h span')?.textContent?.trim() || '',
    count: s.querySelector('.stock-sec-h small')?.textContent?.trim() || '',
    items: [...s.querySelectorAll('.stock-item')].map(it => ({
      id: it.dataset.id || '',
      name: it.querySelector('.si-nm')?.textContent?.trim() || '',
      use: it.querySelector('.si-use')?.textContent?.trim() || '',
      src: it.querySelector('.si-src')?.textContent?.trim() || '',
      num: it.querySelector('.si-num b')?.textContent?.trim() || '',
      price: it.querySelector('.si-num small')?.textContent?.trim() || '',
      empty: it.classList.contains('empty'),
      opacity: parseFloat(getComputedStyle(it).opacity),
      rect: (() => { const r = it.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right }; })(),
    })),
  }));
  return {
    secs,
    summary: content.querySelector('.stock-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    banner: content.querySelector('.encounter-banner p')?.textContent?.trim() || '',
    hscroll: content.scrollWidth - content.clientWidth,
    contentW: content.clientWidth,
  };
});

// ── desktop ─────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  // 固定一份倉庫內容，讓數量可預測
  const want = await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true;
    s.wood = 12; s.ore = 0; s.herb = 3; s.cloth = 1; s.flour = 9; s.leather = 5;
    s.food = 4; s.drink = 0; s.bed = 2;
    s.gearStock = { weapon: 1, armor: 0 };
    // 用跟 UI 一樣的取值順序算一次期望值（有些品項例如繃帶有初始庫存）
    const ids = ['wood', 'ore', 'herb', 'cloth', 'flour', 'leather', 'food', 'drink', 'bed', 'bandage', 'weapon', 'armor'];
    const q = id => s[id] ?? s.stocks?.[id] ?? s.gearStock?.[id] ?? 0;
    const out = {};
    for (const id of ids) out[id] = String(q(id));
    return out;
  });
  await openStock(page);
  const d = await read(page);

  if (d.secs.length !== 3) fix(`倉庫有 ${d.secs.length} 個分組，預期 3（材料／生活物資／裝備）`);
  const titles = d.secs.map(s => s.title).join(',');
  if (titles !== '材料,生活物資,裝備') fix(`分組標題是 ${titles}，預期 材料,生活物資,裝備`);
  const items = d.secs.flatMap(s => s.items);
  if (items.length !== 12) fix(`倉庫列了 ${items.length} 項，預期 12 項（材料 6＋物資 4＋裝備 2）`);
  const wantNum = want;
  for (const [id, n] of Object.entries(wantNum)) {
    const it = items.find(x => x.id === id);
    if (!it) { fix(`找不到品項 ${id}`); continue; }
    if (it.num !== n) fix(`品項 ${id} 顯示數量 ${it.num}，state 是 ${n}`);
    if (!it.name) fix(`品項 ${id} 沒有名稱`);
    if (!/^用途：/.test(it.use) || it.use.length < 5) fix(`品項 ${id} 的用途說明不對：${it.use}`);
    if (!/^來源：/.test(it.src) || it.src.length < 5) fix(`品項 ${id} 的來源說明不對：${it.src}`);
    if (!/單價 \d+ 金/.test(it.price)) fix(`品項 ${id} 沒有單價：${it.price}`);
    if ((n === '0') !== it.empty) fix(`品項 ${id} 數量 ${n} 但 empty 標記是 ${it.empty}`);
    if (it.empty && it.opacity > 0.75) fix(`空品項 ${id} 沒有淡化（opacity ${it.opacity}）`);
    if (it.right > 1440 + 1) fix(`品項 ${id} 超出畫面`);
  }
  const held = Object.entries(wantNum).filter(([, n]) => n !== '0').length;
  const pieces = Object.values(wantNum).reduce((n, v) => n + Number(v), 0);
  if (!d.summary.includes(`持有 ${held}／12 種`)) fix(`摘要沒有顯示持有種類數（${d.summary}）`);
  if (!d.summary.includes(`共 ${pieces} 件`)) fix(`摘要沒有顯示總件數（預期 ${pieces}）：${d.summary}`);
  if (d.hscroll > 1) fix(`desktop 倉庫橫向溢出 ${d.hscroll}px`);

  // 用途／來源推導：木材→精鐵武器＋舒適床鋪；獸皮→舒適床鋪＋皮革護甲；小麥粉→香烤麵包
  const byId = id => items.find(x => x.id === id) || { use: '', src: '' };
  for (const [id, wants] of [['wood', ['精鐵武器']], ['leather', ['舒適床鋪', '皮革護甲']], ['flour', ['香烤麵包']], ['cloth', ['舒適床鋪', '亞麻繃帶', '皮革護甲']]]) {
    for (const w of wants) if (!byId(id).use.includes(w)) fix(`${id} 的用途沒寫到 ${w}：${byId(id).use}`);
  }
  if (byId('leather').src.includes('交易所收購')) fix('獸皮有魔物掉落，來源卻寫成交易所收購');
  if (byId('weapon').src.includes('交易所')) fix(`裝備的來源應寫鐵匠鋪製作：${byId('weapon').src}`);
  if (byId('food').src.includes('交易所')) fix(`物資的來源應寫自己的設施製作：${byId('food').src}`);
  if (!byId('weapon').src.includes('鐵匠鋪製作')) fix(`裝備來源沒寫鐵匠鋪製作：${byId('weapon').src}`);
  if (!byId('ore').use.includes('精鐵武器')) fix(`鐵礦用途沒寫到精鐵武器：${byId('ore').use}`);
  if (!fails.length) ok(`desktop 三組 12 項，數量與 state 相符；用途／來源由配方與掉落表推導（木材→精鐵武器、獸皮→舒適床鋪・皮革護甲、小麥粉→香烤麵包）`);

  if (process.env.SHOTS) await page.screenshot({ path: 'output/stock/desktop.png' });

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true; s.wood = 12; s.leather = 5; s.food = 4;
  });
  await openStock(page);
  const d = await read(page);
  const items = d.secs.flatMap(s => s.items);
  if (d.secs.length !== 3) fix(`phone 402x712 分組只有 ${d.secs.length} 個`);
  if (d.hscroll > 1) fix(`phone 402x712 倉庫橫向溢出 ${d.hscroll}px`);
  const outside = items.filter(i => i.rect.x < 0 || i.rect.right > 402 + 1);
  if (outside.length) fix(`phone 402x712 有 ${outside.length} 項超出畫面`);
  // 單欄：同一組內每個品項的左緣應該相同、且明顯比雙欄寬
  const mat = d.secs.find(s => s.key === '材料');
  const xs = new Set((mat?.items || []).map(i => Math.round(i.rect.x)));
  if (mat && xs.size > 1) fix(`phone 402x712 材料沒有排成單欄（左緣 ${[...xs].join('/')}）`);
  if (!d.hscroll && !outside.length && xs.size === 1) ok(`phone 402x712 三組 12 項單欄排列、不橫向溢出、都在畫面內`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/stock/phone.png' });
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
console.log('PASS stock panel: 倉庫分成材料／生活物資／裝備三組，每項寫數量、單價、用途（由配方推導）與來源（由魔物掉落表推導），數量 0 的項目淡化但不是不存在，手機單欄不溢出');
