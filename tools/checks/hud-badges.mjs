// hud-badges.mjs — T129：底部分頁的待處理徽章
//   * 可領取委託、可升級建設、可招募訪客、可製作項目 → 按鈕右上角數字徽章。
//   * 徽章用 CSS ::after 畫：按鈕尺寸不能變（出現／消失都不能推擠版面）。
//   * 數字要對得上真正的判斷邏輯：建設徽章要等於建設面板裡「不是 .tight 且沒滿級」的卡片數。
// Usage: node tools/checks/hud-badges.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/hud-badges.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const ACTIONS = ['build', 'hunters', 'trade', 'craft', 'dungeon', 'arena', 'quests'];
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/hud-badges', { recursive: true });

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

const readBadges = page => page.evaluate(actions => {
  const out = {};
  for (const a of actions) {
    const b = document.querySelector(`#bottom-bar [data-action="${a}"]`);
    if (!b) { out[a] = null; continue; }
    const r = b.getBoundingClientRect();
    out[a] = {
      badge: b.dataset.badge || '',
      content: getComputedStyle(b, '::after').content,
      aria: b.getAttribute('aria-label') || '',
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      label: b.querySelector('b')?.textContent || '',
    };
  }
  return out;
}, ACTIONS);

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true;
    s.gold = 0; s.wood = 0; s.ore = 0; s.herb = 0; s.cloth = 0; s.flour = 0; s.leather = 0;
    s.food = 0; s.drink = 0; s.bed = 0;
    s.quest = { ...(s.quest || {}), complete: false };
    s.visitors = [];
  });
  await page.waitForTimeout(900);
  const empty = await readBadges(page);
  const noisy = ACTIONS.filter(a => empty[a] && empty[a].badge !== '');
  if (noisy.length) fix(`資源與委託都清空後仍有徽章：${noisy.map(a => a + '=' + empty[a].badge).join(',')}`);
  const leaked = ACTIONS.filter(a => empty[a] && empty[a].content !== 'none');
  if (leaked.length) fix(`沒有徽章卻畫出 ::after 內容：${leaked.map(a => a + '=' + empty[a].content).join(',')}`);
  if (!noisy.length && !leaked.length) ok('空資源／沒有可領取委託時，底部分頁沒有任何徽章（::after 為 none）');

  // 給資源、可領取委託、有買得起的訪客
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    s.gold = 9000; s.wood = 400; s.ore = 400; s.herb = 400; s.cloth = 400; s.flour = 400; s.leather = 400;
    s.buildings = { hall: 3, house: 2, trade: 1, craft: 1, dungeon: 1, arena: 1, quests: 1 };
    s.quest = { ...(s.quest || {}), complete: true };
    s.visitors = [{ id: 'vx', classId: 'archer', rarity: 'normal', trait: 'swift', cost: 100 }];
  });
  // 重新繪製：切一下暫停再開（paint 會跑）
  await page.waitForTimeout(900);
  const rich = await readBadges(page);

  if (rich.quests?.badge !== '1') fix(`有可領取委託時 quests 徽章是 ${rich.quests?.badge}，預期 1`);
  if (!/1 件獎勵可領取/.test(rich.quests?.aria || '')) fix(`quests 的 aria-label 沒寫件數：${rich.quests?.aria}`);
  if (rich.hunters?.badge !== '1') fix(`有一位買得起的訪客時 hunters 徽章是 ${rich.hunters?.badge}，預期 1`);
  if (rich.trade?.badge !== '') fix(`交易不該有徽章，實際 ${rich.trade?.badge}`);
  if (rich.craft?.badge !== '') fix(`製作不該有徽章（日常可做不算待處理），實際 ${rich.craft?.badge}`);

  // 建設徽章必須等於「建設面板裡不是 .tight、也沒有滿級」的卡片數（超過 9 顯示 9+）
  await page.evaluate(() => {
    const b = document.createElement('button'); b.dataset.action = 'build'; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
  });
  await page.waitForTimeout(500);
  const affordable = await page.evaluate(() => [...document.querySelectorAll('.building-card.unbuilt')].filter(c => !c.classList.contains('tight')).length);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const wantBadge = affordable > 9 ? '9+' : String(affordable);
  if (rich.build?.badge !== wantBadge) fix(`建設徽章是 ${rich.build?.badge || '(空)'}，但建設面板有 ${affordable} 棟「未建造且買得起」（預期 ${wantBadge || '(空)'}）`);
  if (!fails.length) ok(`資源充足時：委託 1、訪客 1、建設 ${rich.build?.badge || '(無新可蓋)'}（= 建設面板 ${affordable} 棟未建造且買得起），交易與製作不掛徽章`);

  // 徽章不能改變按鈕尺寸
  const shifted = ACTIONS.filter(a => empty[a] && rich[a] && (Math.abs(empty[a].w - rich[a].w) > 0.6 || Math.abs(empty[a].h - rich[a].h) > 0.6));
  if (shifted.length) fix(`徽章出現後按鈕尺寸改變：${shifted.map(a => `${a} ${empty[a].w}x${empty[a].h}→${rich[a].w}x${rich[a].h}`).join('、')}`);
  else ok('徽章出現前後按鈕尺寸完全不變（::after 不佔版面）');

  // 有徽章時按鈕照樣可以按
  const opened = await page.evaluate(async () => {
    document.querySelector('#bottom-bar [data-action="quests"]').click();
    await new Promise(r => setTimeout(r, 400));
    return document.querySelector('#modal')?.dataset.type || '';
  });
  if (opened !== 'quests') fix(`有徽章時點委託打開的是 ${opened || '(沒有)'}`);
  else ok('有徽章時點按鈕仍正常開啟面板');
  await page.keyboard.press('Escape');

  if (process.env.SHOTS) {
    await page.screenshot({ path: 'output/hud-badges/desktop.png', clip: { x: 0, y: 700, width: 1440, height: 200 } });
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.paused = true;
    s.gold = 9000; s.wood = 400; s.ore = 400; s.herb = 400; s.cloth = 400; s.flour = 400; s.leather = 400;
    s.quest = { ...(s.quest || {}), complete: true };
  });
  await page.waitForTimeout(900);
  const rows = await readBadges(page);
  const withBadge = ACTIONS.filter(a => rows[a] && rows[a].badge !== '');
  if (!withBadge.length) fix('phone 402x712 資源充足時一個徽章都沒有');
  const inside = await page.evaluate(() => [...document.querySelectorAll('#bottom-bar button[data-badge]')].filter(b => b.dataset.badge).map(b => {
    const r = b.getBoundingClientRect();
    return { a: b.dataset.action, x: Math.round(r.x), right: Math.round(r.right), vw: innerWidth };
  }).filter(o => o.x < 0 || o.right > o.vw + 1));
  if (inside.length) fix(`phone 徽章讓按鈕超出畫面：${inside.map(o => o.a).join(',')}`);
  if (!fails.length) ok(`phone 402x712 ${withBadge.length} 顆按鈕有徽章（${withBadge.map(a => a + '=' + rows[a].badge).join('、')}），沒有按鈕超出畫面`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/hud-badges/phone.png' });
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
console.log('PASS hud badges: 底部分頁的「待處理」徽章（委託可領取／有買得起的訪客／有買得起的新建築）數字與真正的判斷邏輯一致、日常升級與製作不掛徽章、徽章不改變按鈕尺寸、有徽章仍可正常開啟面板，手機不超出畫面');
