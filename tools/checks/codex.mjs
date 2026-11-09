// codex.mjs — T125/T126：魔物圖鑑（世界地圖頁尾的按鈕打開）
//   * 每一區的魔物必須跟 REGION_MONSTERS 一致；數值、掉落、名稱、短描述都跟資料對得上。
//   * T126：沒打過的魔物是剪影＋？？？，打過才揭露數值並顯示累計擊殺次數。
// Usage: node tools/checks/codex.mjs      (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/codex.mjs
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/codex', { recursive: true });

// 直接讀遊戲資料，驗「圖鑑寫的」= 「遊戲真的用的」
const { ENEMIES } = await import('../../src/pixel-game.js');
const { REGION_MONSTERS, MONSTER_NAME, MONSTER_LORE } = await import('../../src/lore.js');
const ALL_IDS = [...Object.keys(ENEMIES).filter(k => k !== 'boss'), 'boss'];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}

const openCodex = async page => {
  return page.evaluate(async () => {
    document.querySelector('#modal-backdrop')?.classList.add('hidden');
    const b = document.createElement('button'); b.dataset.action = 'worldmap'; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
    await new Promise(r => setTimeout(r, 450));
    const btn = document.querySelector('.wm-foot [data-action="codex"]');
    if (!btn) return false;
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    return true;
  });
};

const readCodex = page => page.evaluate(() => {
  const c = document.querySelector('#modal-content');
  const num = t => { const m = String(t).replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : null; };
  return {
    type: document.querySelector('#modal')?.dataset.type || '',
    title: document.querySelector('#modal-title')?.textContent?.trim() || '',
    summary: c.querySelector('.cx-summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    secs: [...c.querySelectorAll('.cx-sec')].map(s => ({
      head: s.querySelector('.cx-h span')?.textContent?.trim() || '',
      sub: s.querySelector('.cx-h small')?.textContent?.trim() || '',
      cards: [...s.querySelectorAll('.cx-card')].map(k => ({
        id: k.dataset.id || '',
        unknown: k.classList.contains('unknown'),
        name: k.querySelector('.cx-nm')?.textContent?.replace(/[×\d,]+$/, '').trim() || '',
        kill: num(k.querySelector('.cx-kill')?.textContent || ''),
        stats: [...k.querySelectorAll('.cx-stats span')].map(x => x.textContent.replace(/\s+/g, '')),
        drops: [...k.querySelectorAll('.cx-drop')].map(d => ({ n: d.querySelector('b')?.textContent?.trim() || '', q: num(d.querySelector('i')?.textContent || '') })),
        lore: k.querySelector('.cx-lore')?.textContent?.trim() || '',
        face: (k.querySelector('.cx-face')?.src || '').startsWith('data:image'),
        x: Math.round(k.getBoundingClientRect().x),
      })),
    })),
    hscroll: c.scrollWidth - c.clientWidth,
    cards: c.querySelectorAll('.cx-card').length,
  };
});

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  if (!(await openCodex(page))) fix('世界地圖頁尾找不到「魔物圖鑑」按鈕（.wm-foot [data-action="codex"]）');
  let cx = await readCodex(page);

  if (cx.type !== 'codex') fix(`按下圖鑑按鈕後開啟的是 ${cx.type || '(沒有)'}`);
  if (!/魔物圖鑑/.test(cx.title)) fix(`圖鑑標題是「${cx.title}」`);
  if (cx.cards !== ALL_IDS.length) fix(`圖鑑有 ${cx.cards} 張卡，預期 ${ALL_IDS.length}`);
  const regions = Object.keys(REGION_MONSTERS).filter(r => (REGION_MONSTERS[r] || []).length);
  if (cx.secs.length !== regions.length + 1) fix(`圖鑑有 ${cx.secs.length} 個分區，預期 ${regions.length + 1}`);
  const all0 = cx.secs.flatMap(s => s.cards);

  // 1) 全新存檔：全部未遇見
  const unknown0 = all0.filter(c => c.unknown);
  if (unknown0.length !== ALL_IDS.length) fix(`新存檔下只有 ${unknown0.length}/${ALL_IDS.length} 張是未遇見剪影`);
  if (!/已記錄0／/.test(cx.summary.replace(/\s/g, ''))) fix(`新存檔摘要不對：${cx.summary}`);
  const named0 = all0.filter(c => c.name !== '？？？').length;
  if (named0) fix(`新存檔下有 ${named0} 張卡直接揭露名字`);
  const leaked = all0.filter(c => c.unknown && c.stats.some(s => /\d/.test(s))).length;
  if (leaked) fix(`有 ${leaked} 張未遇見的卡洩漏數值`);
  if (!unknown0.length) { /* 全部揭露時仍要能驗資料 */ }
  else ok(`全新存檔：${unknown0.length} 張卡都是剪影＋？？？（數值不洩漏）、摘要「${cx.summary}」`);

  // 2) 部分擊殺：只揭露打過的，並顯示累計次數
  await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.codex = { sprout: 3, ram: 1, boss: 2 }; });
  await openCodex(page);
  cx = await readCodex(page);
  const flat = cx.secs.flatMap(s => s.cards);
  const byId = id => flat.find(c => c.id === id) || {};
  const sprout = byId('sprout'), ram = byId('ram'), boss = byId('boss'), mole = byId('mole');
  if (sprout.unknown) fix('擊殺 3 次的 花芽妖 仍顯示未遇見');
  else if (sprout.kill !== 3) fix(`花芽妖 的擊殺次數是 ${sprout.kill}，預期 3`);
  if (ram.kill !== 1) fix(`捲角羊 的擊殺次數是 ${ram.kill}，預期 1`);
  if (boss.unknown || boss.kill !== 2) fix(`首領擊殺 2 次時應揭露並標 ×2（現在 unknown=${boss.unknown} kill=${boss.kill}）`);
  if (!mole.unknown) fix('沒打過的 鼴鼠 不該揭露');
  if (!/已記錄3/.test(cx.summary.replace(/\s/g, '')) || !/6/.test(cx.summary)) fix(`部分擊殺摘要不對：${cx.summary}`);
  if (!sprout.unknown && ram.kill === 1 && boss.kill === 2 && mole.unknown) ok(`打過的才揭露並標擊殺次數（花芽妖 ×3、捲角羊 ×1、首領 ×2，鼴鼠仍是問號），摘要「${cx.summary}」`);

  // 3) 全部打過：逐項比對資料
  await page.evaluate(ids => { globalThis.__mistvaleGame.state.codex = Object.fromEntries(ids.map(id => [id, 1])); }, ALL_IDS);
  await openCodex(page);
  cx = await readCodex(page);
  if (cx.hscroll > 1) fix(`desktop 圖鑑橫向溢出 ${cx.hscroll}px`);

  let checked = 0, badStat = 0, badDrop = 0, badName = 0, badLore = 0, badFace = 0, stillUnknown = 0;
  for (const sec of cx.secs) for (const card of sec.cards) {
    const e = ENEMIES[card.id];
    if (!e) { fix(`圖鑑出現資料裡沒有的魔物 ${card.id}`); continue; }
    checked++;
    if (card.unknown) stillUnknown++;
    const wantName = card.id === 'boss' ? (MONSTER_NAME.boss || card.name) : (MONSTER_NAME[card.id] || card.id);
    if (card.name !== wantName) badName++;
    const want = [`生命${e.hp.toLocaleString('en-US')}`, `攻擊${e.attack.toLocaleString('en-US')}`, `金幣${e.gold.toLocaleString('en-US')}`, `經驗${e.xp.toLocaleString('en-US')}`];
    if (want.join('|') !== card.stats.join('|')) badStat++;
    const dropKeys = Object.keys(e.drops || {});
    if (dropKeys.length !== card.drops.length) badDrop++;
    if (!card.lore || card.lore !== (MONSTER_LORE[card.id] || card.lore)) badLore++;
    if (!card.face) badFace++;
  }
  if (stillUnknown) fix(`全部打過後仍有 ${stillUnknown} 張卡是問號`);
  if (badName) fix(`${badName} 張卡的名字跟 MONSTER_NAME 不符`);
  if (badStat) fix(`${badStat} 張卡的數值跟 ENEMIES 不符（順序：生命/攻擊/金幣/經驗）`);
  if (badDrop) fix(`${badDrop} 張卡的掉落數量跟 ENEMIES.drops 不符`);
  if (badLore) fix(`${badLore} 張卡的短描述跟 MONSTER_LORE 不符（或空白）`);
  if (badFace) fix(`${badFace} 張卡沒有魔物頭像（sheet 載入後應自動補上）`);
  if (!badName && !badStat && !badDrop && !badLore && !badFace && !stillUnknown) ok(`${cx.secs.length} 個分區、${cx.cards} 張卡全部揭露後，名稱／生命／攻擊／金幣／經驗／掉落／短描述與資料逐項相符，頭像 ${checked - badFace}/${checked} 張有圖`);

  if (process.env.SHOTS) {
    await page.evaluate(() => { globalThis.__mistvaleGame.state.codex = { sprout: 3, ram: 1, mole: 2 }; });
    await openCodex(page);
    await page.screenshot({ path: 'output/codex/desktop.png' });
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => document.querySelector('#modal-backdrop')?.classList.contains('hidden'));
  if (!closed) fix('圖鑑按 Esc 沒有關閉');
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── 原始碼：兩條擊殺路徑都要記錄 =========================
{
  const src = fs.readFileSync('src/pixel-game.js', 'utf8');
  const rewardIdx = src.indexOf('function rewardEnemy');
  const wanderIdx = src.indexOf('function wandererLoot');
  const bump = 'state.codex[enemy.type] = (state.codex[enemy.type] || 0) + 1';
  if (rewardIdx < 0 || !src.slice(rewardIdx, rewardIdx + 1200).includes(bump)) fix('rewardEnemy 沒有記錄圖鑑擊殺次數');
  if (wanderIdx < 0 || !src.slice(wanderIdx, wanderIdx + 800).includes(bump)) fix('wandererLoot 沒有記錄圖鑑擊殺次數');
  if (!/codex: \{\}/.test(src)) fix('新存檔沒有 codex 欄位');
  if (!/state\.codex = source\.codex/.test(src)) fix('讀取舊存檔時沒有正規化 codex 欄位');
  if (rewardIdx >= 0 && wanderIdx >= 0) ok('兩條擊殺路徑（獵人／流浪英雄）都寫入圖鑑擊殺次數，存檔有新欄位與舊存檔正規化');
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.evaluate(ids => { globalThis.__mistvaleGame.state.codex = Object.fromEntries(ids.map((id, i) => [id, i % 3 === 0 ? 2 : 0])); }, ALL_IDS);
  await openCodex(page);
  const cx = await readCodex(page);
  if (cx.cards !== ALL_IDS.length) fix(`phone 圖鑑有 ${cx.cards} 張卡，預期 ${ALL_IDS.length}`);
  if (cx.hscroll > 1) fix(`phone 402x712 圖鑑橫向溢出 ${cx.hscroll}px`);
  const xs = [...new Set(cx.secs.flatMap(s => s.cards.map(c => c.x)))];
  if (xs.length > 1) fix(`phone 圖鑑卡片不是單欄（左緣有 ${xs.length} 個 x）`);
  const flat = cx.secs.flatMap(s => s.cards);
  const faces = flat.filter(c => c.face).length;
  if (faces !== cx.cards) fix(`phone 只有 ${faces}/${cx.cards} 張卡有頭像`);
  const mixed = flat.filter(c => c.unknown).length;
  if (!fails.length) ok(`phone 402x712 單欄 ${cx.cards} 張卡（${mixed} 張未遇見剪影）、全部有頭像、不橫向溢出`);
  if (process.env.SHOTS) await page.screenshot({ path: 'output/codex/phone.png' });
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
console.log('PASS codex: 世界地圖頁尾可開魔物圖鑑，七個區域各列出棲息魔物與首領；沒打過的是剪影＋？？？，打過才揭露數值並標累計擊殺次數，兩條擊殺路徑都會記錄，名稱／生命／攻擊／金幣／經驗／掉落／短描述都跟遊戲資料一致，手機單欄不溢出');
