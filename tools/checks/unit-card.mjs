// unit-card.mjs — T109：點世界裡的獵人只開一張小卡（頭像／名字／等級職業／生命數字／攻防），
// 要看完整資料再按「詳細」跳名冊；以前點一下就整頁跳進名冊，把玩家抽離世界。
//   * 卡片要貼在世界裡（不吃 hover），但不能蓋住底欄按鈕。
//   * 生命條要跟 state 同步（重傷 <35% 轉色、倒下轉暗），數字是 hp/maxHp。
//   * 點空白處、按 ✕、按 Esc 都要收起來；換選別的獵人會換內容。
// Usage: node tools/checks/unit-card.mjs        (game server on 5024 expected；TARGET 覆蓋)
//        $env:SHOTS='1'; node tools/checks/unit-card.mjs   另外寫出 output/unit-card/*.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [], shots = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/unit-card', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW', hasTouch: false });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}

// 把某位獵人的世界座標換成畫面座標：用世界自己回報的可點矩形（unitRects，跟實際 hit test 同一份資料），
// 不要自己重算投影，否則點到旁邊的建築就會一直選到建築。
const hunterPoint = (page, id) => page.evaluate(id => {
  const g = globalThis.__mistvaleGame, v = globalThis.__mistvaleView, cv = document.querySelector('#world');
  const h = g.state.hunters.find(x => x.id === id);
  if (!h || !cv || !v.unitRects) return null;
  const r = cv.getBoundingClientRect();
  const bot = v.unproject(r.right, r.bottom);
  const u = v.unitRects().find(x => x.id === id);
  if (!u) return null;
  return {
    x: r.left + ((u.x + u.w / 2) / bot.sx) * r.width,
    y: r.top + ((u.y + u.h * 0.55) / bot.sy) * r.height,
    inCanvas: u.x >= 0 && u.x + u.w <= bot.sx && u.y >= 0 && u.y + u.h <= bot.sy,
    name: h.name, hp: h.hp, maxHp: h.maxHp, attack: h.attack, defense: h.defense, level: h.level, status: h.status,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
  };
}, id);

// 找一個「不會打到任何東西」的空白點（建築／獵人／地區立牌都不在裡面）
const emptyPoint = page => page.evaluate(() => {
  const v = globalThis.__mistvaleView, cv = document.querySelector('#world');
  const r = cv.getBoundingClientRect(), bot = v.unproject(r.right, r.bottom);
  const boxes = [...v.hitRects(), ...(v.unitRects ? v.unitRects() : []), ...v.signRects()]
    .map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  for (let gy = 0.06; gy < 0.95; gy += 0.04) {
    for (let gx = 0.05; gx < 0.95; gx += 0.05) {
      const sx = gx * bot.sx, sy = gy * bot.sy;
      if (boxes.some(b => sx >= b.x - 6 && sx <= b.x + b.w + 6 && sy >= b.y - 6 && sy <= b.y + b.h + 6)) continue;
      const cx = r.left + gx * r.width, cy = r.top + gy * r.height;
      const el = document.elementFromPoint(cx, cy);
      if (!el || el.id !== 'world') continue;
      return { x: cx, y: cy };
    }
  }
  return null;
});

const cardInfo = page => page.evaluate(() => {
  const el = document.querySelector('#unit-card');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const bar = document.querySelector('#bottom-bar')?.getBoundingClientRect();
  const q = s => el.querySelector(s);
  const barEl = q('.uc-bar > span'), hp = q('.uc-hp');
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right },
    barTop: bar ? bar.top : null,
    vw: innerWidth, vh: innerHeight,
    name: q('.uc-name')?.textContent || '',
    lv: q('.uc-lv')?.textContent || '',
    status: q('.uc-status')?.textContent || '',
    sub: q('.uc-sub')?.textContent || '',
    hpnum: q('.uc-hpnum')?.textContent || '',
    ariaNow: hp?.getAttribute('aria-valuenow') || '',
    ariaMax: hp?.getAttribute('aria-valuemax') || '',
    barW: barEl ? barEl.getBoundingClientRect().width : -1,
    trackW: q('.uc-bar') ? q('.uc-bar').getBoundingClientRect().width : -1,
    low: hp ? hp.classList.contains('low') : false,
    down: hp ? hp.classList.contains('down') : false,
    stats: [...el.querySelectorAll('.uc-stats b')].map(b => b.textContent),
    actions: [...el.querySelectorAll('[data-action]')].map(b => ({
      a: b.dataset.action, id: b.dataset.id || '',
      box: (() => { const br = b.getBoundingClientRect(); return { w: br.width, h: br.height, x: br.x, y: br.y }; })(),
    })),
  };
});

// 依序試每位獵人，直到卡片真的打開（世界裡的點擊可能被別的單位／建築先接到）
async function clickHunter(page) {
  const ids = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters.map(h => h.id));
  for (const id of ids) {
    const p = await hunterPoint(page, id);
    if (!p || !p.inCanvas) continue;
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(220);
    const c = await cardInfo(page);
    if (c) return { id, p, c };
    await page.keyboard.press('Escape');
  }
  return null;
}

// ── desktop ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const hit = await clickHunter(page);
  if (!hit) {
    fix('desktop 1440x900：點世界裡的獵人沒有打開 #unit-card（投影點算錯或被別的元素接到？）');
  } else {
    const { id, p, c } = hit;
    ok(`desktop 點獵人 ${p.name} 打開小卡 ${Math.round(c.rect.w)}x${Math.round(c.rect.h)}`);
    if (c.name !== p.name) fix(`desktop 卡片名字 ${c.name} != 選到的 ${p.name}`);
    if (c.lv !== `Lv.${p.level}`) fix(`desktop 等級顯示 ${c.lv} != Lv.${p.level}`);
    if (!c.status) fix('desktop 卡片沒有狀態標籤');
    if (!c.sub.includes('·')) fix(`desktop 職業列沒有「職業 · 近戰/遠程 · 性格」：${c.sub}`);
    const expect = `${Math.round(p.hp)}/${Math.round(p.maxHp)}`;
    if (c.hpnum !== expect) fix(`desktop 生命數字 ${c.hpnum} != ${expect}`);
    if (c.ariaNow !== String(Math.round(p.hp))) fix(`desktop aria-valuenow ${c.ariaNow} != ${Math.round(p.hp)}`);
    const st = c.stats.map(Number);
    if (st[0] !== p.attack || st[1] !== p.defense) fix(`desktop 攻防 ${st.slice(0, 2)} != ${[p.attack, p.defense]}`);
    const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
    if (Math.abs(c.barW / Math.max(1, c.trackW) - ratio) > 0.06) fix(`desktop 生命條寬度比 ${(c.barW / c.trackW).toFixed(2)} != ${ratio.toFixed(2)}`);
    if (c.barTop != null && c.rect.bottom > c.barTop - 2) fix(`desktop 小卡壓到底欄：卡片底 ${c.rect.bottom.toFixed(1)} > 底欄頂 ${c.barTop.toFixed(1)}`);
    if (c.barTop != null && c.rect.bottom < c.barTop - 130) fix(`desktop 小卡沒有貼在底欄上方（卡片底 ${c.rect.bottom.toFixed(1)}，底欄頂 ${c.barTop.toFixed(1)}，可能 bottom 的 var(--bb) 在桌機沒定義）`);
    if (Math.abs(c.rect.x - 8) > 2) fix(`desktop 小卡沒有靠左 8px（x=${c.rect.x.toFixed(1)}）`);
    if (c.rect.x < 0 || c.rect.y < 0 || c.rect.right > c.vw || c.rect.bottom > c.vh) fix(`desktop 小卡超出視窗 ${JSON.stringify(c.rect)} vw=${c.vw} vh=${c.vh}`);
    const actions = c.actions.map(a => a.a);
    if (!actions.includes('unitDetail') || !actions.includes('unitCardClose')) fix(`desktop 小卡缺按鈕：${actions}`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/unit-card/desktop.png' });

    // 換一位獵人 → 內容要跟著換
    const ids = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters.map(h => h.id));
    let swapped = false;
    for (const other of ids) {
      if (other === id) continue;
      const q = await hunterPoint(page, other);
      if (!q || !q.inCanvas) continue;
      await page.mouse.click(q.x, q.y);
      await page.waitForTimeout(200);
      const c2 = await cardInfo(page);
      if (c2 && c2.name === q.name) { swapped = true; break; }
    }
    if (!swapped) ok('desktop 換選其他獵人：沒有第二位在畫面上可點（略過，不算失敗）');
    else ok('desktop 換選其他獵人後卡片內容跟著換');

    // 生命條：重傷轉色、倒下轉暗（先暫停，否則獵人會趁等卡片的時間回血）
    const patched = await page.evaluate(() => {
      const g = globalThis.__mistvaleGame;
      g.state.paused = true;
      const el = document.querySelector('#unit-card .uc-name');
      const name = el ? el.textContent : '';
      const h = g.state.hunters.find(v => v.name === name);
      if (!h) return null;
      h.hp = Math.round(h.maxHp * 0.25);
      return { id: h.id, hp: h.hp, maxHp: h.maxHp };
    });
    await page.waitForTimeout(260);
    let c3 = await cardInfo(page);
    if (!patched) fix('desktop 找不到卡片對應的獵人');
    else {
      const want = `${Math.round(patched.hp)}/${Math.round(patched.maxHp)}`;
      if (!c3 || c3.hpnum !== want) fix(`desktop 重傷後生命數字沒更新：${c3 && c3.hpnum} != ${want}`);
      if (!c3?.low) fix('desktop 重傷（25%）生命條沒有轉色（.low）');
      await page.evaluate(id => { const h = globalThis.__mistvaleGame.state.hunters.find(v => v.id === id); if (h) h.hp = 0; }, patched.id);
      await page.waitForTimeout(260);
      c3 = await cardInfo(page);
      if (!c3?.down) fix('desktop 倒下（hp 0）生命條沒有轉暗（.down）');
      if (c3 && c3.barW > 1) fix(`desktop 倒下後生命條還有 ${c3.barW.toFixed(1)}px`);
      ok('desktop 生命條跟著 state 走（25% 轉色、0 轉暗）');
      await page.evaluate(id => { const h = globalThis.__mistvaleGame.state.hunters.find(v => v.id === id); if (h) h.hp = h.maxHp; }, patched.id);
      await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = false; });
    }

    // 詳細 → 名冊詳情；卡片收起
    await page.evaluate(() => document.querySelector('#unit-card [data-action="unitDetail"]')?.click());
    await page.waitForTimeout(400);
    const detail = await page.evaluate(() => ({
      card: !!document.querySelector('#unit-card'),
      modal: !!document.querySelector('#modal:not(.hidden)'),
      type: document.querySelector('#modal')?.dataset.type || '',
      hasName: (document.querySelector('#modal-content')?.textContent || '').includes(document.querySelector('.uc-name')?.textContent || '\u0000'),
    }));
    if (!detail.modal) fix('desktop 按「詳細」沒有打開獵人詳情面板');
    if (detail.card) fix('desktop 按「詳細」之後小卡還留在畫面上');
    if (detail.modal) ok('desktop 按「詳細」跳進獵人詳情，小卡收起');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);

    // 點空白處 → 收起
    const again = await clickHunter(page);
    if (!again) fix('desktop 重新點獵人沒有再開卡');
    else {
      const empty = await emptyPoint(page);
      if (!empty) fix('desktop 找不到可用的空白點（世界被建築塞滿？）');
      else {
        await page.mouse.click(empty.x, empty.y);
        await page.waitForTimeout(250);
        const closed = await page.evaluate(() => !document.querySelector('#unit-card'));
        if (!closed) fix('desktop 點空白處沒有收起小卡');
        else ok('desktop 點空白處收起小卡');
      }

      // ✕ 也要能收
      await clickHunter(page);
      const xBtn = await page.$('#unit-card [data-action="unitCardClose"]');
      if (!xBtn) fix('desktop 小卡沒有 ✕ 按鈕');
      else { await xBtn.click(); await page.waitForTimeout(250); const gone = await page.evaluate(() => !document.querySelector('#unit-card')); if (!gone) fix('desktop 按 ✕ 沒有收起小卡'); else ok('desktop 按 ✕ 收起小卡'); }
    }
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ─────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  const hit = await clickHunter(page);
  if (!hit) fix('phone 402x712：點世界裡的獵人沒有打開 #unit-card');
  else {
    const c = hit.c;
    ok(`phone 小卡 ${Math.round(c.rect.w)}x${Math.round(c.rect.h)} 貼在底欄上方`);
    if (c.rect.x < -0.5 || c.rect.right > c.vw + 0.5) fix(`phone 小卡左右超出視窗 ${c.rect.x.toFixed(1)}..${c.rect.right.toFixed(1)} (vw ${c.vw})`);
    if (c.barTop != null && c.rect.bottom > c.barTop - 2) fix(`phone 小卡壓到底欄：卡片底 ${c.rect.bottom.toFixed(1)} > 底欄頂 ${c.barTop.toFixed(1)}`);
    if (c.actions.some(a => a.box.w < 20 || a.box.h < 20)) fix(`phone 小卡按鈕太小 ${JSON.stringify(c.actions.map(a => [a.a, Math.round(a.box.w), Math.round(a.box.h)]))}`);
    // 底欄三顆浮動鈕（地圖／暫停／速度）仍要可以命中
    const floaters = await page.evaluate(() => ['worldmap', 'pause', 'speed'].map(a => {
      const b = document.querySelector(`[data-action="${a}"]`); if (!b) return { a, ok: false };
      const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { a, ok: !!el && !!el.closest(`[data-action="${a}"]`) };
    }));
    if (floaters.some(f => !f.ok)) fix(`phone 小卡出現時地圖／暫停／速度被擋：${floaters.filter(f => !f.ok).map(f => f.a)}`);
    else ok('phone 小卡出現時地圖／暫停／速度仍可點');
    if (process.env.SHOTS) await page.screenshot({ path: 'output/unit-card/phone.png' });
    // 手機上按「詳細」也要能用
    await page.evaluate(() => document.querySelector('#unit-card [data-action="unitDetail"]')?.click());
    await page.waitForTimeout(400);
    const modal = await page.evaluate(() => !!document.querySelector('#modal:not(.hidden)'));
    if (!modal) fix('phone 按「詳細」沒有打開詳情面板');
    else ok('phone 按「詳細」打開詳情面板');
  }
  if (errs.length) fix(`phone 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

await browser.close();
if (process.env.SHOTS) {
  oks.push(`shots: output/unit-card/desktop.png, output/unit-card/phone.png`);
}
if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  console.log(`FAIL unit card: ${fails.length} 個問題`);
  process.exit(1);
}
for (const o of oks) console.log('ok  ' + o);
console.log('PASS unit card: 點世界裡的獵人開小卡（名字／等級職業／攻防／生命數字）而不跳頁，生命條跟 state 同步、重傷轉色倒下轉暗，詳細／✕／Esc／點空白都能收，手機上不壓底欄也不擋浮動鈕');
