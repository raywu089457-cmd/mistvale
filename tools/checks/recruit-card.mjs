// recruit-card.mjs — 招募卡(2026-11-25 改寫:招募＝邀請流浪英雄,成功率看好感度;舊版 T127 檢查的是旅人卡的加入後體質)
//   * 每位流浪英雄一張 .rc-card;卡上的好感度、門檻、成功率、價格必須等於 game.recruitQuote(id)
//     (遊戲自己的函式當期望值,檢查器不另外寫一份公式)。好感度條的門檻刻度位置 = need%。
//   * 好感度到門檻(100%)可按,按了直接加入,保留名字／職業／稀有度／等級,扣的金幣 = 卡上價格;
//     門檻下方 ramp 內(0–100%)可按,但會先跳確認框;再低就停用並寫「再 +N 好感(鎖住但可點,點了在卡片上說原因)」。
//   * 金幣不足:按鈕停用並寫「缺 N 金」。手機單欄、按鈕夠高、不橫向溢出。
// Usage: node tools/checks/recruit-card.mjs      (game server on 5024 expected; TARGET=http://localhost:5032/?preview=1 for a worktree build)
//        $env:SHOTS='1'; node tools/checks/recruit-card.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/recruit', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}

const openRecruit = page => page.evaluate(async () => {
  const b = document.createElement('button'); b.dataset.action = 'recruit'; b.style.display = 'none';
  document.body.append(b); b.click(); b.remove();
  await new Promise(r => setTimeout(r, 400));
});

// 三種好感度:A 到門檻(100%)、B 門檻下方 ramp 的一半(約 50%)、C 遠低於門檻(0%,停用);其餘人好感度 0
const prepare = (page, gold) => page.evaluate(gold => {
  const g = globalThis.__mistvaleGame, s = g.state;
  s.paused = true; s.gold = gold; s.capacity = Math.max(s.capacity, s.hunters.length + 3);
  const ws = s.wanderers;
  ws.forEach(w => { w.affinity = 0; w.recruitRetryAt = 0; w.hp = w.maxHp; });
  const need = w => g.recruitQuote(w.id).need, floor = w => g.recruitQuote(w.id).floor;
  ws[0].affinity = need(ws[0]);
  ws[1].affinity = (need(ws[1]) + floor(ws[1])) / 2;
  return { a: ws[0].id, b: ws[1].id, c: ws[2].id };
}, gold);

const readCards = page => page.evaluate(() => [...document.querySelectorAll('#modal-content .rc-card')].map(card => {
  const num = t => { const m = String(t).replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
  const btn = card.querySelector('[data-action="recruitWanderer"]'), r = card.getBoundingClientRect();
  const need = card.querySelector('.rc-need'), bar = card.querySelector('.rc-aff');
  return {
    id: card.dataset.id, btnId: btn?.dataset.id || '',
    name: card.querySelector('.rc-name')?.textContent?.trim() || '',
    aff: num(card.querySelector('.rc-af b')?.textContent || ''),
    need: num(card.querySelector('.rc-af small')?.textContent || ''),
    pct: num(card.querySelector('.rc-pct b')?.textContent || ''),
    meter: Number(bar?.getAttribute('aria-valuenow')),
    needAt: need && bar ? (need.getBoundingClientRect().left + need.getBoundingClientRect().width / 2 - bar.getBoundingClientRect().left) / bar.getBoundingClientRect().width * 100 : null,
    locate: !!card.querySelector('[data-action="locateWanderer"]'), portrait: !!card.querySelector('img[data-portrait]')?.getAttribute('src'),
    btnDisabled: !!btn?.disabled || btn?.getAttribute('aria-disabled') === 'true', btnText: btn?.textContent?.trim() || '', cost: num(btn?.textContent || ''), btnH: btn ? btn.getBoundingClientRect().height : 0,
    x: Math.round(r.x), w: Math.round(r.width),
  };
}));
const quotes = page => page.evaluate(() => { const g = globalThis.__mistvaleGame; return Object.fromEntries(g.state.wanderers.map(w => [w.id, g.recruitQuote(w.id)])); });

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const ids = await prepare(page, 99999);
  await openRecruit(page);
  const cards = await readCards(page), Q = await quotes(page);
  const nW = Object.keys(Q).length;
  if (cards.length !== nW) fix(`顯示 ${cards.length} 張招募卡，流浪英雄有 ${nW} 位`);
  for (const c of cards) {
    const q = Q[c.id];
    if (!q) { fix(`卡片 ${c.id} 不是任何一位流浪英雄`); continue; }
    if (c.btnId !== c.id) fix(`${c.id} 的邀請鈕 data-id 是 ${c.btnId}`);
    if (c.aff !== q.affinity || c.meter !== q.affinity) fix(`${c.id} 好感度顯示 ${c.aff}（條 ${c.meter}），recruitQuote 是 ${q.affinity}`);
    if (c.need !== q.need) fix(`${c.id} 門檻顯示 ${c.need}，recruitQuote 是 ${q.need}`);
    if (c.pct !== Math.round(q.chance * 100)) fix(`${c.id} 成功率顯示 ${c.pct}%，recruitQuote 是 ${Math.round(q.chance * 100)}%`);
    if (c.needAt == null || Math.abs(c.needAt - q.need) > 2) fix(`${c.id} 門檻刻度在 ${c.needAt?.toFixed(1)}%，應在 ${q.need}%`);
    if (!c.locate || !c.portrait) fix(`${c.id} 少了頭像或定位鈕`);
    if (q.chance > 0 && (c.btnDisabled || c.cost !== q.cost)) fix(`${c.id}（成功率 ${Math.round(q.chance * 100)}%）按鈕停用=${c.btnDisabled}、價格 ${c.cost}（應可按、${q.cost}）`);
    if (q.chance <= 0 && (!c.btnDisabled || !c.btnText.includes(`再 +${q.floor + 1 - q.affinity} 好感`))) fix(`${c.id}（成功率 0%）按鈕應停用並寫「再 +${q.floor + 1 - q.affinity} 好感」：停用=${c.btnDisabled}「${c.btnText}」`);
    if (c.btnH > 48 || c.w > 520) fix(`${c.id} 卡片太大：按鈕高 ${c.btnH.toFixed(0)}px、卡寬 ${c.w}px`);
  }
  if (cards[0]?.id !== ids.a) fix(`排序：成功率 100% 的 ${ids.a} 應排第一，實際 ${cards[0]?.id}`);
  const intro = await page.evaluate(() => document.querySelector('#modal-content .rc-intro')?.textContent || '');
  if (!/好感/.test(intro) || !/1 位願意加入/.test(intro)) fix(`說明列沒寫好感度或願意加入人數：「${intro}」`);
  if (!fails.length) ok(`${cards.length} 張招募卡的好感度／門檻刻度／成功率／價格與 game.recruitQuote() 一致；0% 停用寫「再 +N 好感」；100% 排第一`);

  // 成功率約 50% → 先跳確認框,不會直接招募
  const half = await page.evaluate(async id => {
    const s = globalThis.__mistvaleGame.state, n0 = s.hunters.length;
    document.querySelector(`.rc-card [data-action="recruitWanderer"][data-id="${id}"]`).click();
    await new Promise(r => setTimeout(r, 400));
    return { type: document.querySelector('#modal')?.dataset.type, added: s.hunters.length - n0, text: document.querySelector('#modal-content')?.textContent || '' };
  }, ids.b);
  if (half.type !== 'confirm' || half.added !== 0 || !/成功率/.test(half.text)) fix(`成功率未滿 100% 時應先跳確認框（實際 type=${half.type}、直接加入 ${half.added}）`);
  else ok('成功率未滿 100% 先跳確認框，寫出成功率與被婉拒的代價');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // 100% → 直接加入,保留名字／職業／稀有度／等級,扣款 = 卡上價格
  await openRecruit(page);
  const rec = await page.evaluate(async id => {
    const g = globalThis.__mistvaleGame, s = g.state, w = s.wanderers.find(x => x.id === id);
    const before = s.hunters.length, gold0 = s.gold, keep = { name: w.name, classId: w.classId, rarity: w.rarity, level: w.level }, cost = g.recruitQuote(id).cost;
    document.querySelector(`.rc-card [data-action="recruitWanderer"][data-id="${id}"]`).click();
    await new Promise(r => setTimeout(r, 500));
    const h = s.hunters[s.hunters.length - 1];
    return { added: s.hunters.length - before, goldDrop: gold0 - s.gold, cost, keep, got: { name: h?.name, classId: h?.classId, rarity: h?.rarity, level: h?.level }, gone: !s.wanderers.some(x => x.id === id), cardGone: !document.querySelector(`.rc-card[data-id="${id}"]`) };
  }, ids.a);
  if (rec.added !== 1) fix(`按下邀請後獵人增加 ${rec.added} 位，預期 1`);
  if (JSON.stringify(rec.keep) !== JSON.stringify(rec.got)) fix(`加入的獵人沒保留流浪英雄的身分：${JSON.stringify(rec.keep)} → ${JSON.stringify(rec.got)}`);
  if (rec.goldDrop !== rec.cost) fix(`招募扣了 ${rec.goldDrop} 金幣，卡上寫 ${rec.cost}`);
  if (!rec.gone || !rec.cardGone) fix(`招募後那位流浪英雄或他的卡還在（名單 ${!rec.gone}、卡 ${!rec.cardGone}）`);
  if (rec.added === 1 && rec.goldDrop === rec.cost && rec.gone) ok(`好感度到門檻按邀請直接加入（${rec.got.name} Lv.${rec.got.level}），扣款 ${rec.goldDrop} 金與卡片一致，卡片消失`);

  // 金幣不足:按鈕停用、寫「缺 N 金」
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const ids2 = await prepare(page, 50);
  await openRecruit(page);
  const poor = await readCards(page), Q2 = await quotes(page);
  const a2 = poor.find(c => c.id === ids2.a);
  if (!a2 || !a2.btnDisabled || !a2.btnText.includes(`缺 ${(Q2[ids2.a].cost - 50).toLocaleString('en-US')} 金`)) fix(`金幣 50 時好感度夠的那張卡應停用並寫「缺 N 金」：${a2?.btnText}`);
  if (poor.some(c => !c.btnDisabled)) fix(`金幣 50 時仍有 ${poor.filter(c => !c.btnDisabled).length} 顆邀請鈕可按`);
  if (!fails.length) ok(`金幣 50 時 ${poor.length} 張卡的邀請鈕都停用，好感度夠的那張寫出還缺多少`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/recruit/desktop.png' });

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await prepare(page, 99999);
  await openRecruit(page);
  const cards = await readCards(page);
  const nW = await page.evaluate(() => globalThis.__mistvaleGame.state.wanderers.length);
  if (cards.length !== nW) fix(`phone 顯示 ${cards.length} 張招募卡，流浪英雄有 ${nW} 位`);
  const xs = [...new Set(cards.map(c => c.x))];
  if (xs.length > 1) fix(`phone 402x712 招募卡不是單欄（左緣 ${xs.length} 個 x）`);
  const overflow = await page.evaluate(() => { const c = document.querySelector('#modal-content'); return c.scrollWidth - c.clientWidth; });
  if (overflow > 1) fix(`phone 402x712 招募面板橫向溢出 ${overflow}px`);
  const short = cards.filter(c => c.btnH < 40).length;
  if (short) fix(`phone 有 ${short} 顆邀請鈕高度不足 40px`);
  if (!fails.length) ok(`phone 402x712 招募卡單欄 ${cards.length} 張、邀請鈕高度足夠、不橫向溢出`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/recruit/phone.png' });
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
console.log('PASS recruit card: 每位流浪英雄一張招募卡,好感度／門檻／成功率／價格與 game.recruitQuote() 一致;到門檻直接加入並保留身分,未滿門檻先確認,太低或金幣不足停用並寫原因;手機單欄不溢出');
