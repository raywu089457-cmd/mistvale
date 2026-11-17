// next-step.mjs — T132：「下一步建議」
//   * 只由 state 推導，條件消失就自己收起來；面板／單位小卡開著時不顯示。
//   * 優先序：委託可領 > 有買得起的訪客 > 獵人夠了可進地下城 > 可蓋新建築 > 地下城缺人 > 全員待機。
//   * 點一下要能走到對應面板。
// 2026-11-11 改寫（獵魔村風格第三階段）：舊版找「貼在底欄上方、置中的 #next-step 條」，點下去直接開面板。新版：
//   * 建議條搬到左側任務追蹤下方的 #hv-advisor（小頭像＋兩行字，仍是 #next-step 按鈕）；位置斷言改成
//     「在 #hv-advisor 裡、在任務追蹤 #hv-quest 下方不重疊、不超出畫面、不蓋底欄」。
//   * 「委託可領」不再由建議條重複顯示，改由任務追蹤 #hv-quest.ready 顯示、點下去開委託面板——這條斷言跟著換成看 #hv-quest。
//   * 點建議條先展開亮色顧問對話框（type=advisor，村長說話），再按對話框的主按鈕 [data-action=nextStepGo] 才開對應面板——斷言分兩步。
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
const setup = (page, kind) => page.evaluate(async kind => {
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
    // Z2A:閒著時「新」旅人到會自動彈出「新的獵人！」暗帶 → 先開著面板把旅人換上去(算已見過、不彈),再關掉,留下的就是左側的顧問提示
    { const b = document.createElement('button'); b.dataset.action = 'settings'; b.style.display = 'none'; document.body.append(b); b.click(); b.remove(); }
    s.visitors = [{ id: 'nv1', classId: 'archer', rarity: 'rare', trait: 'swift', cost: 120 }];
    await new Promise(r => setTimeout(r, 150));
    document.querySelector('#modal [data-action=close], #modal-foot [data-action=close]')?.click();
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
    inSlot: !!el.closest('#hv-advisor'),
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

  // 委託可領：由左側任務追蹤標示（.ready＋「獎勵可以領取了」），建議條不重複；點任務追蹤開委託面板
  await setup(page, 'quest');
  await page.waitForTimeout(600);
  const qd = await page.evaluate(() => {
    const q = document.querySelector('#hv-quest');
    return { ready: !!q?.classList.contains('ready'), goal: q?.querySelector('#hv-quest-goal')?.textContent || '', aria: q?.getAttribute('aria-label') || '', advisor: !!document.querySelector('#hv-advisor #next-step') };
  });
  if (!qd.ready) fix('情境 quest：任務追蹤沒有 .ready（可領獎勵要亮起）');
  if (!/獎勵可以領取/.test(qd.goal) || !/獎勵可以領取/.test(qd.aria)) fix(`情境 quest：任務追蹤沒寫可領取（${qd.goal}／${qd.aria}）`);
  if (qd.advisor) fix('情境 quest：顧問提示又重複了「委託可領」（應只由任務追蹤顯示）');
  // 2026-11-16:委託可領時點任務追蹤＝直接領獎(獵魔村式一鍵收下),不再先開委託清單
  const qi0 = await page.evaluate(() => globalThis.__mistvaleGame.state.quest.index);
  await page.evaluate(() => document.querySelector('#hv-quest').click());
  await page.waitForTimeout(500);
  const qAfter = await page.evaluate(() => ({ index: globalThis.__mistvaleGame.state.quest.index, toast: [...document.querySelectorAll('#toasts .toast')].some(t => /章完成/.test(t.textContent)) }));
  if (qAfter.index !== qi0 + 1 || !qAfter.toast) fix(`情境 quest：點任務追蹤應直接領獎並跳到下一章（index ${qi0} → ${qAfter.index}，吐司 ${qAfter.toast}）`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const cases = [
    ['visitor', '有 1 位旅人願意加入', 'visitor', 'hunters'],
    ['dungeon', '位獵人待機，可以派去地下城', 'dungeon', 'dungeon'],
  ];
  for (const [kind, want, wantKey, wantModal] of cases) {
    await setup(page, kind);
    await page.waitForTimeout(500);
    const pill = await readPill(page);
    if (!pill) { fix(`情境 ${kind}：沒有出現顧問提示`); continue; }
    if (!pill.visible) fix(`情境 ${kind}：顧問提示存在但不可見`);
    if (!pill.inSlot) fix(`情境 ${kind}：顧問提示不在左側 #hv-advisor 裡`);
    if (!pill.text.includes(want)) fix(`情境 ${kind}：文字是「${pill.text}」，應包含「${want}」`);
    if (pill.key !== wantKey) fix(`情境 ${kind}：data-key 是 ${pill.key}，應為 ${wantKey}`);
    if (pill.act !== wantModal) fix(`情境 ${kind}：data-act 是 ${pill.act}，應為 ${wantModal}`);
    if (!pill.aria.includes(want)) fix(`情境 ${kind}：aria-label 沒有寫出建議內容（${pill.aria}）`);
    if (!['BUTTON'].includes(pill.tag)) fix(`情境 ${kind}：顧問提示是 <${pill.tag.toLowerCase()}>，應為可聚焦的 button`);
    // 第一步：點下去展開顧問對話框，寫著同一句建議
    await page.evaluate(() => document.querySelector('#next-step').click());
    await page.waitForTimeout(500);
    const dlg = await page.evaluate(() => ({ type: document.querySelector('#modal')?.dataset.type || '', say: document.querySelector('#modal .hv-dlg-say')?.textContent || '', go: document.querySelector('#modal [data-action="nextStepGo"]')?.dataset.act || '' }));
    if (kind === 'visitor') {   // Z2A:旅人提示直接開「新的獵人！」D 暗帶(邀請／稍後)，不再先出對話框再接長清單
      if (dlg.type !== 'visitors') fix(`情境 ${kind}：點旅人提示開的是 ${dlg.type || '(沒有)'}，應為 visitors(新的獵人！暗帶)`);
      const band = await page.evaluate(() => ({ mode: document.querySelector('#modal')?.dataset.mode, btns: [...document.querySelectorAll('.z2-band-btns button')].map(b => b.textContent.trim()).join('|') }));
      if (band.mode !== 'D' || band.btns !== '邀請|稍後') fix(`情境 ${kind}：暗帶模式 ${band.mode}／按鈕 ${band.btns}（應 D／邀請|稍後）`);
    } else if (dlg.type !== 'advisor') fix(`情境 ${kind}：點顧問提示開的是 ${dlg.type || '(沒有)'}，應先展開 advisor 對話框`);
    else {
      if (!dlg.say.includes(want)) fix(`情境 ${kind}：對話框沒寫出建議「${want}」（${dlg.say.slice(0, 30)}）`);
      if (dlg.go !== wantModal) fix(`情境 ${kind}：對話框主按鈕 data-act 是 ${dlg.go}，應為 ${wantModal}`);
      // 第二步：按主按鈕才跳到對應面板
      await page.evaluate(() => document.querySelector('#modal [data-action="nextStepGo"]')?.click());
      await page.waitForTimeout(500);
      const opened = await page.evaluate(() => document.querySelector('#modal')?.dataset.type || '');
      if (opened !== wantModal) fix(`情境 ${kind}：按對話框主按鈕開的是 ${opened || '(沒有)'}，應為 ${wantModal}`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  if (!fails.length) ok('委託（任務追蹤）／訪客／地下城三種情境的文字與按鈕都對，顧問提示→對話框→主按鈕才開對應面板');

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
  await setup(page, 'visitor');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'settings'; b.style.display = 'none'; document.body.append(b); b.click(); b.remove(); });
  await page.waitForTimeout(500);
  if (await readPill(page)) fix('面板開著時顧問提示沒有收起');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (!(await readPill(page))) fix('關掉面板後顧問提示沒有回來');

  // 點單位小卡（獵人）時也收起
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    s.quest = { index: 0, claimed: false, complete: false };
    const b = document.createElement('button'); b.dataset.action = 'settings'; b.style.display = 'none'; document.body.append(b); b.click(); b.remove();
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 位置：顧問提示在左側任務追蹤下方，不重疊、不超出畫面、不蓋底欄、點得到自己
  await setup(page, 'visitor');
  await page.waitForTimeout(500);
  const geom = await page.evaluate(() => {
    const el = document.querySelector('#next-step');
    if (!el) return null;
    const p = el.getBoundingClientRect(), q = document.querySelector('#hv-quest').getBoundingClientRect();
    const bb = document.querySelector('#bottom-bar').getBoundingClientRect();
    const c = document.elementFromPoint(p.x + p.width / 2, p.y + p.height / 2);
    return {
      belowQuest: p.top - q.bottom, toBar: bb.top - p.bottom, left: p.left, right: p.right, top: p.top, h: p.height,
      ownHit: c === el || el.contains(c),
    };
  });
  if (!geom) fix('桌機：看不到顧問提示，無法量位置');
  else {
    if (geom.belowQuest < 0) fix(`桌機顧問提示壓在任務追蹤上（差 ${geom.belowQuest.toFixed(1)}px，應在其下方）`);
    if (geom.toBar < 8) fix(`桌機顧問提示距底欄只有 ${geom.toBar.toFixed(1)}px（會蓋住底欄）`);
    if (geom.left < 0 || geom.right > 1440 || geom.top < 0) fix('桌機顧問提示超出畫面');
    if (!geom.ownHit) fix('桌機顧問提示中心點被別的元素蓋住，點不到');
    if (!fails.length) ok(`顧問提示在任務追蹤下方 ${geom.belowQuest.toFixed(0)}px、離底欄 ${geom.toBar.toFixed(0)}px、點得到`);
  }

  if (process.env.SHOTS) await page.screenshot({ path: 'output/next-step/desktop.png' });
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await setup(page, 'visitor');
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const el = document.querySelector('#next-step');
    if (!el) return { missing: true };
    const p = el.getBoundingClientRect(), bb = document.querySelector('#bottom-bar').getBoundingClientRect();
    const qb = document.querySelector('#hv-quest').getBoundingClientRect().bottom;
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
      gap: +(bb.top - p.bottom).toFixed(1), belowQuest: +(p.top - qb).toFixed(1), covered,
      ownHit: centre === el || el.contains(centre),
      h: +p.height.toFixed(1),
    };
  });
  if (info.missing) fix('phone：沒有出現顧問提示');
  else {
    if (!info.inside) fix('phone：建議條超出畫面');
    if (info.gap < 4) fix(`phone：顧問提示與底欄間距 ${info.gap}px（至少 4px）`);
    if (info.belowQuest < 0) fix(`phone：顧問提示壓在任務追蹤上（${info.belowQuest}px）`);
    if (info.covered.length) fix(`phone：建議條蓋住浮動鈕 ${info.covered.join(',')}`);
    if (!info.ownHit) fix('phone：建議條中心點不是自己（被別的元素蓋住）');
    if (info.h < 44) fix(`phone：顧問提示只有 ${info.h}px 高，觸控太小（需 ≥44px）`);
    if (!fails.length) ok(`phone 402x712 顧問提示在任務追蹤下方、離底欄 ${info.gap}px、不擋浮動鈕、≥44px 可點`);
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
console.log('PASS next step: 左側任務追蹤下方的顧問提示會說「現在最該做的一件事」（委託可領由任務追蹤顯示／旅人可招募／可進地下城／可蓋新建築／派去生態區），文字與按鈕跟著 state 換、點一下展開對話框再開對應面板、面板開著時自動收起、手機 ≥44px 不擋浮動鈕');
