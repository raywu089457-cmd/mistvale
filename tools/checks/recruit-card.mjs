// recruit-card.mjs — T127：招募訪客卡要寫出「加入後會是什麼體質」與金幣不足的狀態
//   * 卡片上的攻擊／防禦／生命必須等於 game.visitorPreview(v)（也就是 updateStats 的結果），
//     不能另外寫一份公式——所以檢查器是拿遊戲自己的函式當期望值。
//   * 金幣不足：整張卡 .broke + 按鈕停用 + 寫「還缺 N 金幣」；金幣夠：可按，按了真的加入且體質與預覽一致。
// Usage: node tools/checks/recruit-card.mjs      (game server on 5024 expected)
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

const VISITORS = [
  { id: 'vt1', classId: 'sorcerer', rarity: 'legendary', trait: 'brave', cost: 300 },
  { id: 'vt2', classId: 'archer', rarity: 'normal', trait: 'swift', cost: 90 },
  { id: 'vt3', classId: 'priest', rarity: 'superior', trait: 'stout', cost: 160 },
];
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

const readCards = page => page.evaluate(() => [...document.querySelectorAll('.visitor-card')].map(card => {
  const num = t => { const m = String(t).replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
  const items = [...card.querySelectorAll('.visitor-stats .vs-item')].map(i => ({
    label: i.textContent.replace(/[0-9,]/g, '').trim(),
    value: num(i.querySelector('b')?.textContent || ''),
    kind: i.querySelector('.vs-kind')?.textContent?.trim() || '',
  }));
  const btn = card.querySelector('[data-action="recruitVisitor"]');
  return {
    id: btn?.dataset.id || '',
    broke: card.classList.contains('broke'),
    name: card.querySelector('h3')?.textContent?.trim() || '',
    rarity: card.querySelector('.rarity')?.textContent?.trim() || '',
    items,
    btnDisabled: !!btn?.disabled,
    btnAria: btn?.getAttribute('aria-disabled') || '',
    btnText: btn?.textContent?.trim() || '',
    cost: num(btn?.textContent || ''),
    x: Math.round(card.getBoundingClientRect().x),
    w: Math.round(card.getBoundingClientRect().width),
  };
}));

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  await page.evaluate(vs => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true;
    s.visitors = vs.map(v => ({ ...v }));
    s.gold = 1000;
  }, VISITORS);
  await openRecruit(page);

  const info = await page.evaluate(vs => {
    const g = globalThis.__mistvaleGame;
    return vs.map(v => ({ id: v.id, cost: v.cost, pv: g.visitorPreview(v) }));
  }, VISITORS);
  const cards = await readCards(page);
  if (cards.length !== VISITORS.length) fix(`金幣充足時顯示 ${cards.length} 張招募卡，預期 ${VISITORS.length}`);

  for (const want of info) {
    const card = cards.find(c => c.id === want.id);
    if (!card) { fix(`找不到訪客 ${want.id} 的卡片`); continue; }
    if (card.broke) fix(`金幣 1000 時 ${card.id} 仍被標成 .broke`);
    if (card.btnDisabled) fix(`金幣 1000 時 ${card.id} 的按鈕仍是停用`);
    if (card.cost !== want.cost) fix(`${card.id} 按鈕上的價格 ${card.cost}，資料是 ${want.cost}`);
    const atk = card.items.find(i => i.label.includes('攻擊'));
    const def = card.items.find(i => i.label.includes('防禦'));
    const hp = card.items.find(i => i.label.includes('生命'));
    if (!atk || atk.value !== want.pv.attack) fix(`${card.id} 攻擊顯示 ${atk?.value}，visitorPreview 是 ${want.pv.attack}`);
    if (!def || def.value !== want.pv.defense) fix(`${card.id} 防禦顯示 ${def?.value}，visitorPreview 是 ${want.pv.defense}`);
    if (!hp || hp.value !== want.pv.maxHp) fix(`${card.id} 生命顯示 ${hp?.value}，visitorPreview 是 ${want.pv.maxHp}`);
    const kind = want.pv.range >= 5 ? '遠程' : '近戰';
    if (!hp || hp.kind !== kind) fix(`${card.id} 射程標籤是 ${hp?.kind || '(沒有)'}，預期 ${kind}`);
  }
  if (!fails.length) ok(`${VISITORS.length} 張招募卡顯示加入後的攻擊／防禦／生命／近戰遠程，數字與 game.visitorPreview() 一致，金幣充足時可按`);

  // 真的招募一位，體質要跟預覽相同
  const recruited = await page.evaluate(async id => {
    const g = globalThis.__mistvaleGame, s = g.state;
    const before = s.hunters.length, gold0 = s.gold, v = s.visitors.find(x => x.id === id);
    const pv = g.visitorPreview(v);
    document.querySelector(`.visitor-card [data-action="recruitVisitor"][data-id="${id}"]`).click();
    await new Promise(r => setTimeout(r, 500));
    const h = s.hunters[s.hunters.length - 1];
    return { added: s.hunters.length - before, goldDrop: gold0 - s.gold, attack: h?.attack, maxHp: h?.maxHp, defense: h?.defense, pv, cost: v?.cost };
  }, 'vt3');
  if (recruited.added !== 1) fix(`按下招募後獵人增加 ${recruited.added} 位，預期 1`);
  if (recruited.attack !== recruited.pv.attack || recruited.maxHp !== recruited.pv.maxHp || recruited.defense !== recruited.pv.defense) {
    fix(`招募進來的獵人體質（攻 ${recruited.attack}／防 ${recruited.defense}／血 ${recruited.maxHp}）跟卡片預覽（${recruited.pv.attack}/${recruited.pv.defense}/${recruited.pv.maxHp}）不一致`);
  }
  if (recruited.goldDrop !== recruited.cost) fix(`招募扣了 ${recruited.goldDrop} 金幣，卡片寫 ${recruited.cost}`);
  if (recruited.added === 1 && recruited.attack === recruited.pv.attack) ok(`按招募真的加入（攻 ${recruited.attack}／防 ${recruited.defense}／血 ${recruited.maxHp}），扣款 ${recruited.goldDrop} 金幣與卡片一致`);

  // 金幣不足：整張卡 .broke、按鈕停用、寫「還缺 N 金幣」
  await page.evaluate(vs => {
    const s = globalThis.__mistvaleGame.state;
    s.visitors = vs.map(v => ({ ...v }));
    s.gold = 50;
  }, VISITORS);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await openRecruit(page);
  await page.waitForTimeout(200);
  const poor = await readCards(page);
  const notBroke = poor.filter(c => !c.broke);
  if (notBroke.length) fix(`金幣 50 時仍有 ${notBroke.length} 張卡沒被標成 .broke（${notBroke.map(c => c.id).join(',')}）`);
  for (const c of poor) {
    if (!c.btnDisabled) fix(`金幣不足時 ${c.id} 的按鈕仍可按`);
    if (!/還缺\s*[\d,]+\s*金幣/.test(c.btnText)) fix(`${c.id} 的按鈕沒寫「還缺 N 金幣」：${c.btnText}`);
    const short = VISITORS.find(v => v.id === c.id).cost - 50;
    if (!c.btnText.includes(short.toLocaleString('en-US'))) fix(`${c.id} 寫的缺口不是 ${short}：${c.btnText}`);
  }
  if (!fails.length) ok(`金幣 50 時 ${poor.length} 張卡都標 .broke、按鈕停用並寫出「還缺 N 金幣」`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/recruit/desktop.png' });

  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.evaluate(vs => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true;
    s.visitors = vs.map(v => ({ ...v }));
    s.gold = 60;
  }, VISITORS);
  await openRecruit(page);
  const cards = await readCards(page);
  if (cards.length !== VISITORS.length) fix(`phone 顯示 ${cards.length} 張招募卡，預期 ${VISITORS.length}`);
  const xs = [...new Set(cards.map(c => c.x))];
  if (xs.length > 1) fix(`phone 402x712 招募卡不是單欄（左緣 ${xs.length} 個 x）`);
  const overflow = await page.evaluate(() => { const c = document.querySelector('#modal-content'); return c.scrollWidth - c.clientWidth; });
  if (overflow > 1) fix(`phone 402x712 招募面板橫向溢出 ${overflow}px`);
  const tall = await page.evaluate(() => [...document.querySelectorAll('.visitor-card [data-action="recruitVisitor"]')].filter(b => b.getBoundingClientRect().height < 30).length);
  if (tall) fix(`phone 有 ${tall} 顆招募按鈕高度不足 30px`);
  if (!fails.length) ok(`phone 402x712 招募卡單欄 ${cards.length} 張、按鈕高度足夠、不橫向溢出`);
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
console.log('PASS recruit card: 招募卡寫出加入後的攻擊／防禦／生命與近戰遠程，數字與 game.visitorPreview() 一致，金幣不足時整張卡淡化且按鈕停用並寫出還缺多少；按下去加入的獵人體質與預覽相同，手機單欄不溢出');
