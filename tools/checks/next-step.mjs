// next-step.mjs — T132：畫面下方的「下一步建議」條
//   * 只由 state 推導，條件消失就自己收起來；面板／單位小卡開著時不顯示。
//   * 優先序：委託可領 > 有買得起的訪客 > 獵人夠了可進地下城 > 可蓋新建築 > 地下城缺人 > 全員待機。
//   * 點一下要打開對應面板。
// Usage: node tools/checks/next-step.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/next-step.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/next-step', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  return { ctx, page, errs };
}

// 把 state 調成指定情境（每次都先回到「什麼建議都沒有」的乾淨底）
const setup = (page, kind) => page.evaluate(kind => {
  const g = globalThis.__mistvaleGame, s = g.state;
  s.paused = true;
  s.quest = { index: 0, claimed: false, complete: false };
  s.visitors = [];
  s.gold = 0; s.wood = 0; s.ore = 0; s.herb = 0; s.cloth = 0; s.flour = 0; s.leather = 0;
  s.buildings = { hall: 1, house: 1, dungeon: 0 };
  s.dungeon = { ...s.dungeon, active: false, cooldown: 0, hunterIds: [] };
  s.hunters.forEach(h => { h.task = 'hunt'; h.hp = h.maxHp; });
  if (kind === 'quest') s.quest = { index: 0, claimed: false, complete: true };
  if (kind === 'visitor') {
    s.gold = 900;
    s.visitors = [{ id: 'nv1', classId: 'archer', rarity: 'rare', trait: 'swift', cost: 120 }];
  }
  if (kind === 'dungeon') {
    s.buildings = { hall: 2, house: 1, dungeon: 1 };
    s.hunters.forEach(h => { h.task = null; h.hp = h.maxHp; });
  }
  if (kind === 'dungeon2') {
    s.buildings = { hall: 2, house: 1, dungeon: 1 };
    s.hunters.forEach((h, i) => { h.task = i < 2 ? null : 'hunt'; h.hp = h.maxHp; });
  }
  if (kind === 'build') { s.gold = 5000; s.wood = 200; s.ore = 200; s.herb = 200; s.cloth = 200; s.flour = 200; s.leather = 200; }
  if (kind === 'hunt') s.hunters.forEach(h => { h.task = null; h.hp = h.maxHp; });
  if (kind === 'none') s.hunters.forEach(h => { h.task = 'hunt'; h.hp = h.maxHp; });
}, kind);

const readPill = page => page.evaluate(() => {
  const el = document.querySelector('#next-step');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    text: el.querySelector('.ns-tx')?.textContent?.trim() || '',
    go: el.querySelector('.ns-go')?.textContent?.trim() || '',
    key: el.getAttribute('data-key') || '',
    act: el.getAttribute('data-act') || '',
    aria: el.getAttribute('aria-label') || '',
    tag: el.tagName,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom },
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0,
  };
});

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });

  const cases = [
    ['quest', '村長委託的獎勵可以領了', 'quest', 'quests'],
    ['visitor', '有 1 位旅人願意加入', 'visitor', 'hunters'],
    ['dungeon', '位獵人待機，可以派去地下城', 'dungeon', 'dungeon'],
  ];
  for (const [kind, want, wantKey, wantModal] of cases) {
    await setup(page, kind);
    await page.waitForTimeout(500);
    const pill = await readPill(page);
    if (!pill) { fix(`情境 ${kind}：沒有出現下一步建議條`); continue; }
    if (!pill.visible) fix(`情境 ${kind}：建議條存在但不可見`);
    if (!pill.text.includes(want)) fix(`情境 ${kind}：文字是「${pill.text}」，應包含「${want}」`);
    if (pill.key !== wantKey) fix(`情境 ${kind}：data-key 是 ${pill.key}，應為 ${wantKey}`);
    if (pill.act !== wantModal) fix(`情境 ${kind}：data-act 是 ${pill.act}，應為 ${wantModal}`);
    if (!pill.aria.includes(want)) fix(`情境 ${kind}：aria-label 沒有寫出建議內容（${pill.aria}）`);
    if (!['BUTTON'].includes(pill.tag)) fix(`情境 ${kind}：建議條是 <${pill.tag.toLowerCase()}>，應為可聚焦的 button`);
    // 點下去要開對應面板
    await page.evaluate(() => document.querySelector('#next-step').click());
    await page.waitForTimeout(500);
    const opened = await page.evaluate(() => document.querySelector('#modal')?.dataset.type || '');
    if (opened !== wantModal) fix(`情境 ${kind}：點下去開的是 ${opened}，應為 ${wantModal}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  if (!fails.length) ok('委託／訪客／地下城三種情境的建議文字與按鈕都對，點下去開對應面板');

  // 全員待機 → 建議派去生態區
  await setup(page, 'hunt');
  await page.waitForTimeout(500);
  const hunt = await readPill(page);
  if (!hunt) fix('情境 hunt：沒有出現建議條');
  else {
    if (!hunt.text.includes('生態區')) fix(`情境 hunt：文字是「${hunt.text}」，應提到生態區`);
    if (hunt.act !== 'worldmap') fix(`情境 hunt：data-act 是 ${hunt.act}，應為 worldmap`);
  }

  // 沒有任何該做的事 → 不出現
  await setup(page, 'none');
  await page.waitForTimeout(600);
  const none = await readPill(page);
  if (none) fix(`情境 none：明明沒事可做仍顯示「${none.text}」`);

  // 開面板時收起
  await setup(page, 'quest');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'settings'; b.style.display = 'none'; document.body.append(b); b.click(); b.remove(); });
  await page.waitForTimeout(500);
  if (await readPill(page)) fix('面板開著時建議條沒有收起');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (!(await readPill(page))) fix('關掉面板後建議條沒有回來');

  // 點單位小卡（獵人）時也收起
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    s.quest = { index: 0, claimed: false, complete: false };
    const b = document.createElement('button'); b.dataset.action = 'settings'; b.style.display = 'none'; document.body.append(b); b.click(); b.remove();
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 位置：貼在底欄上方、不重疊
  await setup(page, 'quest');
  await page.waitForTimeout(500);
  const geom = await page.evaluate(() => {
    const p = document.querySelector('#next-step').getBoundingClientRect();
    const bb = document.querySelector('#bottom-bar').getBoundingClientRect();
    // 左下角是村莊日誌（canvas 文字），靠右可以避開它
    // 村莊日誌畫在 canvas 左下（大約距底欄 20–34px）；建議條要落在它上方
    return {
      pBottom: p.bottom, bbTop: bb.top, gap: bb.top - p.bottom,
      centreOff: Math.abs((p.x + p.width / 2) - innerWidth / 2),
      overLogBand: p.bottom > innerHeight - 40,
    };
  });
  if (geom.gap < 4 || geom.gap > 40) fix(`建議條與底欄的間距是 ${geom.gap.toFixed(1)}px（應 4–40px）`);
  if (geom.centreOff > 3) fix(`桌機建議條沒有置中（偏移 ${geom.centreOff.toFixed(1)}px）`);
  if (geom.overLogBand) fix('桌機建議條壓在底欄正上方那一帶（會蓋到村莊日誌）');
  if (!fails.length) ok(`建議條置中、貼在底欄上方 ${geom.gap.toFixed(0)}px（高於左下角村莊日誌）`);

  if (process.env.SHOTS) await page.screenshot({ path: 'output/next-step/desktop.png' });
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await setup(page, 'quest');
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const el = document.querySelector('#next-step');
    if (!el) return { missing: true };
    const p = el.getBoundingClientRect(), bb = document.querySelector('#bottom-bar').getBoundingClientRect();
    const covered = [];
    for (const a of ['worldmap', 'pause', 'speed', 'boss', 'help', 'zoomIn', 'zoomOut']) {
      const b = document.querySelector(`[data-action="${a}"]`);
      if (!b) continue;
      const br = b.getBoundingClientRect();
      const top = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2);
      if (!(top === b || b.contains(top))) covered.push(a);
    }
    const centre = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2);
    return {
      inside: p.x >= 0 && p.x + p.width <= innerWidth + 0.5 && p.y >= 0,
      gap: +(bb.top - p.bottom).toFixed(1), covered,
      ownHit: centre === el || el.contains(centre),
      h: +p.height.toFixed(1),
    };
  });
  if (info.missing) fix('phone：沒有出現建議條');
  else {
    if (!info.inside) fix('phone：建議條超出畫面');
    if (info.gap < 4) fix(`phone：建議條與底欄間距 ${info.gap}px（至少 4px）`);
    if (info.covered.length) fix(`phone：建議條蓋住浮動鈕 ${info.covered.join(',')}`);
    if (!info.ownHit) fix('phone：建議條中心點不是自己（被別的元素蓋住）');
    if (info.h < 26) fix(`phone：建議條只有 ${info.h}px 高，觸控太小`);
    if (!fails.length) ok(`phone 402x712 建議條貼在底欄上方 ${info.gap}px、不擋浮動鈕、可點`);
  }
  if (process.env.SHOTS) await page.screenshot({ path: 'output/next-step/phone.png' });
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
console.log('PASS next step: 畫面下方會提示「現在最該做的一件事」（委託可領／旅人可招募／可進地下城／可蓋新建築／派去生態區），文字與按鈕跟著 state 換、點一下開對應面板、面板或單位小卡開著時自動收起、手機貼在底欄上方不擋浮動鈕');
