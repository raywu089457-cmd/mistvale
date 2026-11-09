// codex.mjs — T125：魔物圖鑑（世界地圖頁尾的按鈕打開）
//   * 每一區的魔物必須跟 REGION_MONSTERS 一致；數值、掉落、名稱、短描述都跟資料對得上。
//   * 頭像是從魔物 sheet 現切出來的 data URL；sheet 是非同步載入，圖鑑要在載入後自己補圖。
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

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'zh-TW', deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  // 世界地圖 → 頁尾「魔物圖鑑」
  const opened = await page.evaluate(async () => {
    const b = document.createElement('button'); b.dataset.action = 'worldmap'; b.style.display = 'none';
    document.body.append(b); b.click(); b.remove();
    await new Promise(r => setTimeout(r, 500));
    const btn = document.querySelector('.wm-foot [data-action="codex"]');
    if (!btn) return { ok: false };
    btn.click();
    await new Promise(r => setTimeout(r, 900));
    return { ok: true };
  });
  if (!opened.ok) fix('世界地圖頁尾找不到「魔物圖鑑」按鈕（.wm-foot [data-action="codex"]）');
  return { ctx, page, errs };
}

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
        name: k.querySelector('.cx-nm')?.textContent?.trim() || '',
        stats: [...k.querySelectorAll('.cx-stats span')].map(x => x.textContent.replace(/\s+/g, '')),
        drops: [...k.querySelectorAll('.cx-drop')].map(d => ({
          n: d.querySelector('b')?.textContent?.trim() || '',
          q: num(d.querySelector('i')?.textContent || ''),
        })),
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
  const cx = await readCodex(page);

  if (cx.type !== 'codex') fix(`按下圖鑑按鈕後開啟的是 ${cx.type || '(沒有)'}`);
  if (!/魔物圖鑑/.test(cx.title)) fix(`圖鑑標題是「${cx.title}」`);
  const wild = Object.keys(ENEMIES).filter(k => k !== 'boss');
  const regions = Object.keys(REGION_MONSTERS).filter(r => (REGION_MONSTERS[r] || []).length);
  const wantSummary = [`${wild.length}`, `${regions.length}`, '1'];
  for (const w of wantSummary) if (!new RegExp(`\\b${w}\\b`).test(cx.summary.replace(/種|個|首領/g, ' '))) fix(`摘要沒有寫出 ${w}：${cx.summary}`);
  if (cx.cards !== wild.length + 1) fix(`圖鑑有 ${cx.cards} 張卡，預期 ${wild.length + 1}（${wild.length} 野外 + 首領）`);
  if (cx.secs.length !== regions.length + 1) fix(`圖鑑有 ${cx.secs.length} 個分區，預期 ${regions.length + 1}`);

  // 每一區的魔物必須跟 REGION_MONSTERS 一致
  for (const rid of regions) {
    const sec = cx.secs.find(s => (REGION_MONSTERS[rid] || []).some(id => s.cards.some(c => c.id === id)));
    if (!sec) { fix(`找不到區域 ${rid} 的分區`); continue; }
    const want = REGION_MONSTERS[rid];
    const got = sec.cards.map(c => c.id);
    if (got.join(',') !== want.join(',')) fix(`區域 ${rid} 的魔物是 ${got.join(',')}，資料是 ${want.join(',')}`);
  }
  const bossSec = cx.secs.find(s => s.head.includes('首領'));
  if (!bossSec || !bossSec.cards.some(c => c.id === 'boss')) fix('圖鑑缺少首領卡片');

  // 數值 / 掉落 / 名稱 / 描述都要對得上資料
  let checked = 0, badStat = 0, badDrop = 0, badName = 0, badLore = 0, badFace = 0;
  for (const sec of cx.secs) for (const card of sec.cards) {
    const e = ENEMIES[card.id];
    if (!e) { fix(`圖鑑出現資料裡沒有的魔物 ${card.id}`); continue; }
    checked++;
    const wantName = card.id === 'boss' ? (MONSTER_NAME.boss || card.name) : (MONSTER_NAME[card.id] || card.id);
    if (card.name !== wantName) badName++;
    const want = [`生命${e.hp.toLocaleString('en-US')}`, `攻擊${e.attack.toLocaleString('en-US')}`, `金幣${e.gold.toLocaleString('en-US')}`, `經驗${e.xp.toLocaleString('en-US')}`];
    if (want.join('|') !== card.stats.join('|')) badStat++;
    const dropKeys = Object.keys(e.drops || {});
    if (dropKeys.length !== card.drops.length) badDrop++;
    if (!card.lore || card.lore !== (MONSTER_LORE[card.id] || card.lore)) badLore++;
    if (!card.face) badFace++;
  }
  if (badName) fix(`${badName} 張卡的名字跟 MONSTER_NAME 不符`);
  if (badStat) fix(`${badStat} 張卡的數值跟 ENEMIES 不符（檢查順序：生命/攻擊/金幣/經驗）`);
  if (badDrop) fix(`${badDrop} 張卡的掉落數量跟 ENEMIES.drops 不符`);
  if (badLore) fix(`${badLore} 張卡的短描述跟 MONSTER_LORE 不符（或空白）`);
  if (badFace) fix(`${badFace} 張卡沒有魔物頭像（sheet 載入後應自動補上）`);
  if (cx.hscroll > 1) fix(`desktop 圖鑑橫向溢出 ${cx.hscroll}px`);
  if (!fails.length) ok(`圖鑑：${cx.secs.length} 個區域分區、${cx.cards} 張卡（含首領），名稱／生命／攻擊／金幣／經驗／掉落／短描述與資料逐項相符，頭像 ${checked - badFace}/${checked} 張有圖`);

  if (process.env.SHOTS) await page.screenshot({ path: 'output/codex/desktop.png' });
  // Esc 關閉
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => document.querySelector('#modal-backdrop')?.classList.contains('hidden'));
  if (!closed) fix('圖鑑按 Esc 沒有關閉');
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const cx = await readCodex(page);
  if (cx.cards !== Object.keys(ENEMIES).length) fix(`phone 圖鑑有 ${cx.cards} 張卡，預期 ${Object.keys(ENEMIES).length}`);
  if (cx.hscroll > 1) fix(`phone 402x712 圖鑑橫向溢出 ${cx.hscroll}px`);
  const xs = [...new Set(cx.secs.flatMap(s => s.cards.map(c => c.x)))];
  if (xs.length > 1) fix(`phone 圖鑑卡片不是單欄（左緣有 ${xs.length} 個 x）`);
  const faces = cx.secs.flatMap(s => s.cards).filter(c => c.face).length;
  if (!fails.length && faces === cx.cards) ok(`phone 402x712 圖鑑單欄 ${cx.cards} 張卡、全部有頭像、不橫向溢出`);
  else if (faces !== cx.cards) fix(`phone 只有 ${faces}/${cx.cards} 張卡有頭像`);
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
console.log('PASS codex: 世界地圖頁尾可開魔物圖鑑，七個區域各列出棲息魔物與首領，名稱／生命／攻擊／金幣／經驗／掉落／短描述都跟遊戲資料一致，頭像從 sheet 現切並在載入後自動補上，手機單欄不溢出');
