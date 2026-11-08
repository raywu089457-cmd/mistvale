// run-hud.mjs — T107：地下城／競技場進行中、面板關掉時，主畫面要有小隊 HUD。
//   * 地下城 HUD：樓層／波數／階段＋三位獵人的職業、名字、生命條與數字（重傷轉紅）。
//   * 競技場 HUD：對手名稱＋對手生命條，同樣有小隊三人。
//   * 只有按鈕吃點擊：手機上不能蓋住 地圖／暫停／速度 三顆鈕（T96 的教訓）。
//   * 面板開著時不顯示（戰鬥畫面就在面板裡）；按「撤退」後 HUD 消失。
// Usage: node tools/checks/run-hud.mjs        (game server on 5024; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/run-hud.mjs   also writes output/run-hud/*.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [], shots = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/run-hud', { recursive: true });

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

const startDungeon = (page, frac = [0.25, 1, 1]) => page.evaluate(frac => {
  const g = globalThis.__mistvaleGame, s = g.state;
  s.buildings.dungeon = Math.max(1, s.buildings.dungeon || 0);
  const party = s.hunters.filter(h => h.hp > 0).slice(0, 3);
  party.forEach((h, i) => { h.hp = Math.round(h.maxHp * frac[i]); });
  const r = g.startDungeon(party.map(h => h.id));
  for (let i = 0; i < 30; i++) g.tick(0.1);
  return { ok: r.ok, msg: r.message, ids: party.map(h => h.id) };
}, frac);

const hudInfo = page => page.evaluate(() => {
  const el = document.querySelector('#run-hud');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const units = [...el.querySelectorAll('.rh-unit')].map(u => ({
    cls: u.querySelector('.rh-cls')?.textContent, name: u.querySelector('.rh-name')?.textContent,
    num: u.querySelector('.rh-num')?.textContent,
    fill: u.querySelector('.rh-bar>span')?.getBoundingClientRect().width,
    track: u.querySelector('.rh-bar')?.getBoundingClientRect().width,
    low: u.classList.contains('low'), down: u.classList.contains('down'),
  }));
  const foe = el.querySelector('.rh-foe') ? {
    num: el.querySelector('.rh-foe .rh-num')?.textContent,
    fill: el.querySelector('.rh-foe .rh-bar>span')?.getBoundingClientRect().width,
    track: el.querySelector('.rh-foe .rh-bar')?.getBoundingClientRect().width,
  } : null;
  const hb = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
  return { rect: [r.x, r.y, r.width, r.height], text: el.innerText.replace(/\n+/g, ' | '), units, foe, hudHit: hb && hb.closest('#run-hud') !== null };
});

// ── 桌機：地下城 ────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const before = await page.evaluate(() => !!document.querySelector('#run-hud'));
  if (before) fix('沒有進行中的探索卻出現 #run-hud');
  else ok('閒置時沒有 HUD');

  const st = await startDungeon(page);
  if (!st.ok) fix(`startDungeon 失敗：${st.msg}`);
  await page.waitForTimeout(600);
  const h1 = await hudInfo(page);
  if (!h1) fix('地下城進行中卻沒有 #run-hud');
  else {
    const d = await page.evaluate(() => ({ floor: globalThis.__mistvaleGame.state.dungeon.floor, wave: globalThis.__mistvaleGame.state.dungeon.wave, phase: globalThis.__mistvaleGame.state.dungeon.phase }));
    if (!h1.text.includes('地下城') || !h1.text.includes(`第 ${d.floor} 層`) || !h1.text.includes(`${Math.max(1, d.wave)}/3 波`) || !h1.text.includes(d.phase)) fix(`HUD 標題缺樓層／波數／階段：${h1.text}`);
    if (h1.units.length !== 3) fix(`HUD 顯示 ${h1.units.length} 位獵人（應為 3）`);
    const party = await page.evaluate(ids => ids.map(id => { const h = globalThis.__mistvaleGame.state.hunters.find(x => x.id === id); return { name: h.name, classId: h.classId, hp: Math.round(h.hp), maxHp: Math.round(h.maxHp) }; }), st.ids);
    h1.units.forEach((u, i) => {
      const p = party[i];
      if (u.name !== p.name) fix(`第 ${i + 1} 位名字不符：${u.name} vs ${p.name}`);
      if (u.num !== `${p.hp}/${p.maxHp}`) fix(`${p.name} 生命數字不符：${u.num} vs ${p.hp}/${p.maxHp}`);
      if (!u.cls) fix(`${p.name} 沒有職業標籤`);
      const wantRatio = p.hp / p.maxHp, gotRatio = u.fill / u.track;
      if (Math.abs(wantRatio - gotRatio) > 0.03) fix(`${p.name} 血條寬度不符：${gotRatio.toFixed(2)} vs ${wantRatio.toFixed(2)}`);
    });
    const lowUnit = h1.units[0];
    if (!lowUnit.low) fix(`${party[0].name} 生命 25% 卻沒有轉紅（.low）`);
    if (h1.hudHit) { /* 只有按鈕吃點擊：中間血量列不該攔截 */ fix('HUD 本體攔截了點擊（pointer-events 應為 none）'); }
    else ok(`地下城 HUD：${h1.units.map(u => `${u.name} ${u.num}`).join('、')}`);
    // 三顆浮動鈕不能被 HUD 蓋住
    const covered = await page.evaluate(() => {
      const out = [];
      for (const a of ['worldmap', 'pause', 'speed']) {
        const b = document.querySelector(`[data-action="${a}"]`);
        if (!b) { out.push(`${a}:missing`); continue; }
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        if (!hit || !(hit === b || b.contains(hit))) out.push(`${a}:covered-by-${hit ? (hit.id || hit.className || hit.tagName) : 'null'}`);
      }
      return out;
    });
    if (covered.length) fix(`浮動鈕被 HUD 蓋住：${covered.join(' / ')}`); else ok('地圖／暫停／速度 三顆鈕沒被 HUD 蓋住');
    // 自動續戰切換
    const autoBefore = await page.evaluate(() => !!globalThis.__mistvaleGame.state.dungeon.auto);
    await page.click('#run-hud [data-action="runAuto"]');
    await page.waitForTimeout(200);
    const autoAfter = await page.evaluate(() => ({ auto: !!globalThis.__mistvaleGame.state.dungeon.auto, pressed: document.querySelector('#run-hud [data-action="runAuto"]')?.getAttribute('aria-pressed'), label: document.querySelector('#run-hud [data-action="runAuto"]')?.textContent }));
    if (autoAfter.auto === autoBefore) fix('按「自動續戰」狀態沒變');
    else if (autoAfter.pressed !== String(autoAfter.auto)) fix(`自動續戰 aria-pressed 不符：${autoAfter.pressed} vs ${autoAfter.auto}`);
    else ok(`自動續戰可切換（${autoAfter.label.trim()}）`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/run-hud/dungeon-1440x900.png' });
    // 面板開著時收起 HUD
    await page.evaluate(() => document.querySelector('#bottom-bar [data-action="dungeon"]')?.click());
    await page.waitForTimeout(500);
    if (await page.evaluate(() => !!document.querySelector('#run-hud'))) fix('地下城面板開著時 HUD 還顯示');
    else ok('面板開著時 HUD 收起');
    // 撤退
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => !!document.querySelector('#run-hud')))) fix('關掉面板後 HUD 沒有回來');
    else await page.click('#run-hud [data-action="runRetreat"]');
    await page.waitForTimeout(600);
    const afterRetreat = await page.evaluate(() => ({ active: !!globalThis.__mistvaleGame.state.dungeon.active, hud: !!document.querySelector('#run-hud') }));
    if (afterRetreat.active) fix('按「撤退」後地下城還在進行中');
    if (afterRetreat.hud) fix('按「撤退」後 HUD 沒有消失');
    if (!afterRetreat.active && !afterRetreat.hud) ok('撤退後 HUD 消失、探索結束');
  }
  if (errs.length) fix(`桌機頁面錯誤：${errs.join(' / ')}`);
  await ctx.close();
}

// ── 桌機：競技場 ────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const st = await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    s.buildings.training = Math.max(1, s.buildings.training || 0);
    const party = s.hunters.filter(h => h.hp > 0).slice(0, 3);
    const r = g.startArena(party.map(h => h.id));
    for (let i = 0; i < 20; i++) g.tick(0.1);
    return { ok: r.ok, msg: r.message };
  });
  if (!st.ok) fix(`startArena 失敗：${st.msg}`);
  await page.waitForTimeout(600);
  const h = await hudInfo(page);
  if (!h) fix('競技場進行中卻沒有 #run-hud');
  else {
    const a = await page.evaluate(() => ({ opponent: globalThis.__mistvaleGame.state.arena.opponent, hp: Math.round(globalThis.__mistvaleGame.state.arena.enemyHp), max: Math.round(globalThis.__mistvaleGame.state.arena.enemyMaxHp) }));
    if (!h.text.includes('競技場') || !h.text.includes('vs')) fix(`競技場 HUD 標題不對：${h.text}`);
    if (!h.foe) fix('競技場 HUD 沒有對手血條');
    else if (h.foe.num !== `${a.hp}/${a.max}`) fix(`對手生命數字不符：${h.foe.num} vs ${a.hp}/${a.max}`);
    else {
      const ratio = h.foe.fill / h.foe.track;
      if (Math.abs(ratio - a.hp / a.max) > 0.03) fix(`對手血條寬度不符：${ratio.toFixed(2)} vs ${(a.hp / a.max).toFixed(2)}`);
      else ok(`競技場 HUD：vs ${a.opponent} 對手 ${h.foe.num}`);
    }
    if (h.units.length !== 3) fix(`競技場 HUD 顯示 ${h.units.length} 位獵人（應為 3）`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/run-hud/arena-1440x900.png' });
  }
  if (errs.length) fix(`競技場頁面錯誤：${errs.join(' / ')}`);
  await ctx.close();
}

// ── 手機 ──────────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await startDungeon(page);
  await page.waitForTimeout(600);
  const h = await hudInfo(page);
  if (!h) fix('手機上地下城進行中卻沒有 #run-hud');
  else {
    const v = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight, top: document.querySelector('#topbar').getBoundingClientRect().bottom, hscroll: document.documentElement.scrollWidth > innerWidth + 1 }));
    const [x, y, w, hh] = h.rect;
    if (x < 0 || y < v.top || x + w > v.vw + 1 || y + hh > v.vh) fix(`手機 HUD 超出畫面或壓到頂欄：${h.rect} topbar=${v.top} vp=${v.vw}x${v.vh}`);
    if (v.hscroll) fix('手機 HUD 造成水平捲動');
    if (h.units.length !== 3) fix(`手機 HUD 顯示 ${h.units.length} 位獵人（應為 3）`);
    const covered = await page.evaluate(() => {
      const out = [];
      for (const a of ['worldmap', 'pause', 'speed']) {
        const b = document.querySelector(`[data-action="${a}"]`);
        if (!b) { out.push(`${a}:missing`); continue; }
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        if (!hit || !(hit === b || b.contains(hit))) out.push(`${a}:covered`);
      }
      return out;
    });
    if (covered.length) fix(`手機 HUD 蓋住浮動鈕：${covered.join(' / ')}`);
    else ok(`手機 HUD 在頂欄下、沒蓋住地圖／暫停／速度：${Math.round(w)}x${Math.round(hh)}`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/run-hud/dungeon-402x712.png' });
  }
  if (errs.length) fix(`手機頁面錯誤：${errs.join(' / ')}`);
  await ctx.close();
}

await browser.close();
for (const m of oks) console.log('ok  ' + m);
for (const m of fails) console.log('FIX ' + m);
if (fails.length) { console.log(`\nFAIL run hud: ${fails.length} 個問題`); process.exit(1); }
console.log('\nPASS run hud: 地下城與競技場進行中、面板關掉時主畫面有小隊 HUD（樓層／波數／階段、三人生命條與數字、競技場對手血量、自動續戰與撤退可操作），只有按鈕吃點擊、手機不蓋住浮動鈕');
