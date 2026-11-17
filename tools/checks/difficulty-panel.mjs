// difficulty-panel.mjs — T122：狩獵難度卡要寫出真正的倍率與「不能選的原因」
//   * 魔物生命／攻擊 ×mult（DIFFICULTIES.mult）、金幣・經驗 ×√mult（遊戲用 Math.sqrt）
//   * 解鎖條件跟 game.setDifficulty() 一樣看「全體獵人轉世次數加總」，不是村莊的 counts.rebirths
//   * 不能選的難度：卡片 .locked、aria-disabled、按鈕 disabled 並寫「未解鎖」與目前進度
// Usage: node tools/checks/difficulty-panel.mjs    (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/difficulty-panel.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/difficulty', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}

const openDiff = async page => {
  await page.evaluate(async () => {
    const b = document.createElement('button'); b.dataset.action = 'difficulty'; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
    await new Promise(r => setTimeout(r, 420));
  });
  await page.waitForTimeout(250);
};

const readCards = page => page.evaluate(() => {
  const content = document.querySelector('#modal-content');
  const cards = [...content.querySelectorAll('.difficulty-card')].map(c => {
    const rows = {};
    c.querySelectorAll('.diff-stats>div').forEach(d => { rows[d.querySelector('dt')?.textContent || ''] = (d.querySelector('dd')?.textContent || '').trim(); });
    const btn = c.querySelector('button');
    const nowTxt = c.querySelector('.diff-now')?.textContent?.trim() || '';
    const h3 = c.querySelector('h3');
    // h3 裡含「目前」徽章，卡片名稱要把徽章文字去掉再比對
    const name = (h3?.textContent || '').replace(nowTxt, '').trim();
    return {
      id: c.dataset.diff, name,
      current: c.classList.contains('current'), locked: c.classList.contains('locked'),
      ariaDisabled: c.getAttribute('aria-disabled') || '',
      now: nowTxt,
      rows, gate: c.querySelector('.diff-gate')?.textContent?.trim() || '',
      gateShort: !!c.querySelector('.diff-gate.short'),
      btnDisabled: !!btn?.disabled, btnLabel: btn?.textContent?.trim() || '',
      h: Math.round(c.getBoundingClientRect().height),
    };
  });
  return {
    cards,
    summary: content.querySelector('.diff-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    hscroll: content.scrollWidth - content.clientWidth,
  };
});

const mult = [1, 1.7, 2.8, 4.5, 7];

// ── 0 次轉世：只有初級能選 ───────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.hunters.forEach(h => { h.rebirths = 0; });
    s.counts.rebirths = 0;
    s.difficulty = 0;
    globalThis.__mistvaleGame.state.paused = true;
  });
  await openDiff(page);
  const d = await readCards(page);
  if (d.cards.length !== 5) fix(`難度卡 ${d.cards.length} 張，預期 5 張`);
  if (!/目前\s*初級/.test(d.summary)) fix(`摘要沒有寫目前難度：${d.summary}`);
  if (!/累計轉世\s*0/.test(d.summary)) fix(`摘要沒有寫累計轉世：${d.summary}`);

  d.cards.forEach((c, i) => {
    if (c.rows['魔物生命'] !== `×${mult[i]}`) fix(`${c.name} 魔物生命倍率 ${c.rows['魔物生命'] || '(缺)'}，預期 ×${mult[i]}`);
    if (c.rows['魔物攻擊'] !== `×${mult[i]}`) fix(`${c.name} 魔物攻擊倍率 ${c.rows['魔物攻擊'] || '(缺)'}，預期 ×${mult[i]}`);
    const want = `×${Math.sqrt(mult[i]).toFixed(2)}`;
    if (c.rows['金幣・經驗'] !== want) fix(`${c.name} 金幣・經驗倍率 ${c.rows['金幣・經驗'] || '(缺)'}，預期 ${want}`);
    { const wantDrop = `×${+(1 + (mult[i] - 1) / 2).toFixed(2)}`; if (c.rows['材料掉落'] !== wantDrop) fix(`${c.name} 材料掉落倍率 ${c.rows['材料掉落'] || '(缺)'}，預期 ${wantDrop}`); }   // 2026-11-16 高難度＝更多材料(pixel-game dropAmount)
    const shouldLock = i > 0;
    if (shouldLock && !c.locked) fix(`${c.name} 0 次轉世應該鎖住，但沒有 .locked`);
    if (shouldLock && !c.btnDisabled) fix(`${c.name} 鎖住但按鈕仍可按`);
    if (shouldLock && c.btnLabel !== '未解鎖') fix(`${c.name} 鎖住但按鈕寫「${c.btnLabel}」`);
    if (shouldLock && !new RegExp(`需要累計轉世${'\\s*'}${[0, 1, 3, 5, 10][i]}${'\\s*'}次（目前${'\\s*'}0）`).test(c.gate)) fix(`${c.name} 沒有寫出解鎖進度：${c.gate}`);
    if (shouldLock && !c.gateShort) fix(`${c.name} 的解鎖進度沒有標成不足（.short）`);
    if (!shouldLock) {
      if (!c.current || c.now !== '目前') fix(`初級應該標成目前（current=${c.current} badge=${c.now}）`);
      if (!c.btnDisabled || c.btnLabel !== '目前難度') fix(`目前難度的按鈕應停用並寫「目前難度」（${c.btnLabel}）`);
    }
  });
  if (!fails.length) ok(`0 次轉世：只有初級可選，其餘 4 張寫「需要累計轉世 N 次（目前 0）」並停用；倍率 生命/攻擊 ×mult、金幣經驗 ×√mult 全部相符`);
  if (d.hscroll > 1) fix(`desktop 難度面板橫向溢出 ${d.hscroll}px`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/difficulty/desktop.png' });

  // ── 3 次轉世：用「獵人加總」解鎖困難（counts.rebirths 故意留 0）──
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const s = globalThis.__mistvaleGame.state;
    s.hunters[0].rebirths = 3; s.hunters[1].rebirths = 0;
    s.counts.rebirths = 0;             // 故意跟獵人加總不一致：UI 必須跟 setDifficulty 一樣看獵人
  });
  await openDiff(page);
  const d2 = await readCards(page);
  const hard = d2.cards.find(c => c.name === '困難');
  if (!hard) fix('找不到困難難度卡');
  else {
    if (hard.locked) fix('全體獵人轉世加總 3 次，困難卻仍鎖住（是不是讀成 counts.rebirths？）');
    if (!/累計轉世\s*3/.test(d2.summary)) fix(`摘要的累計轉世沒有跟著變成 3：${d2.summary}`);
    if (hard.btnDisabled || hard.btnLabel !== '選擇') fix(`困難應可選（按鈕「${hard.btnLabel}」）`);
    else ok('全體獵人轉世加總 3 次 → 困難解鎖（跟 game.setDifficulty 同一套算法，不受 counts.rebirths 影響）');
  }
  const expert = d2.cards.find(c => c.name === '專家');
  if (expert && !expert.locked) fix('專家需要 5 次轉世，3 次時不該解鎖');

  // 真的切換一次
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.difficulty-card')].find(x => x.querySelector('h3')?.textContent.startsWith('困難'));
    c.querySelector('button').click();
  });
  await page.waitForTimeout(450);
  const after = await page.evaluate(() => ({
    diff: globalThis.__mistvaleGame.state.difficulty,
    closed: document.querySelector('#modal-backdrop')?.classList.contains('hidden') || false,
    toast: [...document.querySelectorAll('#toasts .toast .toast-tx')].map(t => t.textContent).join(' / '),
  }));
  if (after.diff !== 2) fix(`按下困難後 state.difficulty=${after.diff}，預期 2`);
  // 成功切換會關掉彈窗（原始行為）；再打開確認「目前」跟著移動
  if (!after.closed) fix('切換難度成功後彈窗沒有關閉（原本行為是關閉並留一句提示）');
  await openDiff(page);
  const d3 = await readCards(page);
  const cur = d3.cards.find(c => c.current);
  if (!cur || cur.name !== '困難') fix(`重新打開後「目前」標記在 ${cur ? cur.name : '(沒有)'}，預期困難`);
  else if (after.diff === 2) ok('切換難度後關窗並留下提示，重新打開時「目前」標記在困難');
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = true; });
  await openDiff(page);
  const d = await readCards(page);
  if (d.hscroll > 1) fix(`phone 402x712 難度面板橫向溢出 ${d.hscroll}px`);
  const outside = await page.evaluate(() => {
    const content = document.querySelector('#modal-content').getBoundingClientRect();
    return [...document.querySelectorAll('.difficulty-card')].filter(c => {
      const r = c.getBoundingClientRect();
      return r.left < content.left - 1 || r.right > content.right + 1;
    }).length;
  });
  if (outside) fix(`phone 402x712 有 ${outside} 張難度卡超出內容區`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/difficulty/phone.png' });
  if (!d.hscroll && !outside) ok(`phone 402x712 難度卡單欄排列、不橫向溢出、卡片都在內容區內（卡高 ${d.cards[0]?.h}px）`);
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
console.log('PASS difficulty panel: 每張難度卡寫出魔物生命／攻擊（×mult）與金幣經驗（×√mult）、累計轉世次數看全體獵人加總、沒解鎖的卡片標 .locked 並停用且寫出還差幾次，切換後「目前」標記跟著移動，手機不溢出');
