// foe-card.mjs — T110：點世界裡的魔物也開一張小卡（頭像／名字／首領或魔物／區域與掉落／生命／攻擊·金幣·經驗）。
//   * 魔物以前完全不可點：只能看頭上血條，不知道牠是什麼、給多少錢、掉什麼。
//   * 小卡要跟著同一隻魔物（換目標會換內容），生命條跟 state 同步，魔物死掉（hp=0）就自動收起。
//   * 位置跟 T109 的獵人卡一致（左下、底欄上方），桌機與手機都要檢查。
// Usage: node tools/checks/foe-card.mjs        (game server on 5024 expected；TARGET 覆蓋)
//        $env:SHOTS='1'; node tools/checks/foe-card.mjs   另外寫出 output/foe-card/*.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [], shots = [];
const fix = m => fails.push(m);
const ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/foe-card', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW', hasTouch: false });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  // 村莊裡通常沒有魔物：切到草原再等世界重建與魔物 sheet 載入
  await page.evaluate(() => { try { globalThis.__mistvaleGame.exploreRegion('meadow'); } catch {} });
  await page.waitForTimeout(2600);
  return { ctx, page, errs };
}

// 用世界回報的 foeRects（這一幀實際的可點矩形）換算畫面座標
const foeRects = page => page.evaluate(() => {
  const v = globalThis.__mistvaleView, cv = document.querySelector('#world');
  if (!v?.foeRects || !cv) return [];
  const r = cv.getBoundingClientRect(), bot = v.unproject(r.right, r.bottom);
  const g = globalThis.__mistvaleGame;
  return v.foeRects().map(u => {
    const e = (g.state.enemies || []).find(x => x.id === u.id);
    return {
      id: u.id,
      x: r.left + ((u.x + u.w / 2) / bot.sx) * r.width,
      y: r.top + ((u.y + u.h * 0.6) / bot.sy) * r.height,
      inCanvas: u.x >= 0 && u.x + u.w <= bot.sx && u.y >= 0 && u.y + u.h <= bot.sy,
      type: e?.type || '', hp: e?.hp ?? 0, maxHp: e?.maxHp ?? 0, attack: e?.attack ?? 0, regionId: e?.regionId || '',
    };
  });
});

const cardInfo = page => page.evaluate(() => {
  const el = document.querySelector('#unit-card');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const bar = document.querySelector('#bottom-bar')?.getBoundingClientRect();
  const q = s => el.querySelector(s);
  const hp = q('.uc-hp'), barEl = q('.uc-bar > span'), icon = q('.uc-portrait');
  return {
    kind: el.dataset.kind || '',
    rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right },
    barTop: bar ? bar.top : null, vw: innerWidth, vh: innerHeight,
    name: q('.uc-name')?.textContent || '',
    status: q('.uc-status')?.textContent || '',
    sub: q('.uc-sub')?.textContent || '',
    hpnum: q('.uc-hpnum')?.textContent || '',
    ariaNow: hp?.getAttribute('aria-valuenow') || '',
    barW: barEl ? barEl.getBoundingClientRect().width : -1,
    trackW: q('.uc-bar') ? q('.uc-bar').getBoundingClientRect().width : -1,
    low: hp ? hp.classList.contains('low') : false,
    down: hp ? hp.classList.contains('down') : false,
    stats: [...el.querySelectorAll('.uc-stats b')].map(b => b.textContent),
    portraitSrc: icon ? icon.getAttribute('src') || '' : '',
    portraitW: icon ? icon.getBoundingClientRect().width : 0,
    actions: [...el.querySelectorAll('[data-action]')].map(b => b.dataset.action),
  };
});


// 2026-11-11 第二階段(規格 4.6):點世界裡的目標 → 腳下先出現兩顆六角鈕(資訊 i／取消 ×);按「資訊」才開詳情。
// 回傳 true = 六角鈕出現且按了資訊;false = 這一下沒點到可選目標(六角鈕沒出現)。
async function clickInfoHex(page) {
  const sel = await page.$('#hv-sel:not([hidden])');
  if (!sel) return false;
  const box = await (await sel.$('[data-action="selInfo"]'))?.boundingBox();
  if (!box || box.width < 44 || box.height < 44) return false;   // 熱區 ≥ 44px 也是不變量
  await page.click('#hv-sel [data-action="selInfo"]');
  await page.waitForTimeout(220);
  return true;
}

async function clickFoe(page) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const list = await foeRects(page);
    const cand = list.filter(f => f.inCanvas && f.hp > 0);
    if (!cand.length) { await page.waitForTimeout(400); continue; }
    for (const f of cand) {
      await page.mouse.click(f.x, f.y);
      await page.waitForTimeout(220);
      if (!await clickInfoHex(page)) { await page.keyboard.press('Escape'); continue; }   // 點魔物 → 六角鈕 → 資訊 → 小卡
      const c = await cardInfo(page);
      if (c && c.kind === 'foe') return { f, c };
      await page.keyboard.press('Escape');
    }
  }
  return null;
}

// ── desktop ───────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const hit = await clickFoe(page);
  if (!hit) {
    fix('desktop 1440x900：點世界裡的魔物沒有打開 #unit-card（foeRects 空、魔物沒生出來，或點擊被別的元素接到？）');
  } else {
    const { f, c } = hit;
    const foeId = f.id;
    ok(`desktop 點魔物 ${c.name}（${f.type}）打開小卡 ${Math.round(c.rect.w)}x${Math.round(c.rect.h)}`);
    if (!c.name) fix('desktop 魔物卡沒有名字');
    if (!['魔物', '首領'].includes(c.status)) fix(`desktop 魔物卡狀態標籤是大寫？${c.status}`);
    if (c.kind !== 'foe') fix(`desktop #unit-card data-kind=${c.kind}，應該是 foe`);
    if (!c.portraitSrc.startsWith('data:image')) fix('desktop 魔物卡沒有畫出頭像（monsterPortrait 回空字串？）');
    if (!c.sub.includes('掉落') && !c.sub.includes('·')) fix(`desktop 魔物卡副標沒有區域／掉落：${c.sub}`);
    const st = c.stats.map(Number);
    if (st[0] !== Math.round(f.attack)) fix(`desktop 攻擊 ${st[0]} != ${Math.round(f.attack)}`);
    if (!(st[1] >= 0) || !(st[2] >= 0)) fix(`desktop 金幣／經驗沒有數字：${st}`);
    const ratio = Math.max(0, Math.min(1, f.hp / Math.max(1, f.maxHp)));
    if (Math.abs(c.barW / Math.max(1, c.trackW) - ratio) > 0.06) fix(`desktop 生命條寬度比 ${(c.barW / c.trackW).toFixed(2)} != ${ratio.toFixed(2)}`);
    if (!/^\d+\/\d+$/.test(c.hpnum)) fix(`desktop 生命數字格式 ${c.hpnum} 不是 hp/maxHp`);
    if (c.barTop != null && c.rect.bottom > c.barTop - 2) fix(`desktop 魔物卡壓到底欄：${c.rect.bottom.toFixed(1)} > ${c.barTop.toFixed(1)}`);
    if (c.barTop != null && c.rect.bottom < c.barTop - 130) fix(`desktop 魔物卡沒有貼在底欄上方（底 ${c.rect.bottom.toFixed(1)} vs 欄 ${c.barTop.toFixed(1)}）`);
    if (Math.abs(c.rect.x - 8) > 2) fix(`desktop 魔物卡沒有靠左 8px（x=${c.rect.x.toFixed(1)}）`);
    if (c.actions.includes('unitDetail')) fix('desktop 魔物卡不該有「詳細」（魔物沒有詳情面板）');
    if (!c.actions.includes('unitCardClose')) fix('desktop 魔物卡缺 ✕');
    if (process.env.SHOTS) await page.screenshot({ path: 'output/foe-card/desktop.png' });

    // 生命條：重傷轉色
    const patched = await page.evaluate(id => {
      const g = globalThis.__mistvaleGame;
      g.state.paused = true;
      const e = (g.state.enemies || []).find(x => x.id === id);
      if (!e) return null;
      e.hp = Math.round(e.maxHp * 0.2);
      return { id: e.id, hp: e.hp, maxHp: e.maxHp };
    }, foeId);
    await page.waitForTimeout(260);
    const c2 = await cardInfo(page);
    if (!patched) ok('desktop 重傷同步：找不到對應魔物（略過）');
    else if (!c2) fix('desktop 改魔物生命後卡片消失（應該留著顯示重傷）');
    else {
      if (!c2.low) fix('desktop 魔物生命 20% 沒有轉色（.uc-hp 缺 .low）');
      const want = Math.round(patched.hp) + '/' + Math.round(patched.maxHp);
      if (c2.hpnum !== want) fix(`desktop 魔物生命數字沒更新 ${c2.hpnum} != ${want}`);
      ok('desktop 魔物生命條跟 state 同步（20% 轉色）');
    }

    // 死亡 → 卡片自動收起
    await page.evaluate(id => {
      const g = globalThis.__mistvaleGame;
      const e = (g.state.enemies || []).find(x => x.id === id);
      if (e) e.hp = 0;
    }, foeId);
    await page.waitForTimeout(400);
    if (await cardInfo(page)) fix('desktop 魔物 hp=0 之後卡片還留著');
    else ok('desktop 魔物倒下後卡片自動收起');
    await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = false; });
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ─────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  const hit = await clickFoe(page);
  if (!hit) fix('phone 402x712：點魔物沒有打開 #unit-card');
  else {
    const { c } = hit;
    ok(`phone 點魔物 ${c.name} 打開小卡 ${Math.round(c.rect.w)}x${Math.round(c.rect.h)}`);
    if (c.rect.bottom > c.vh - 4) fix(`phone 魔物卡超出畫面底部（${c.rect.bottom.toFixed(1)} > ${c.vh}）`);
    if (c.rect.x < 0 || c.rect.right > c.vw + 1) fix(`phone 魔物卡左右超出畫面 ${JSON.stringify(c.rect)} vw=${c.vw}`);
    if (c.barTop != null && c.rect.bottom > c.barTop - 2) fix(`phone 魔物卡壓到底欄（${c.rect.bottom.toFixed(1)} > ${c.barTop.toFixed(1)}）`);
    const covered = await page.evaluate(() => {
      const el = document.querySelector('#unit-card');
      if (!el) return [];
      const r = el.getBoundingClientRect(), out = [];
      for (const a of ['worldmap', 'pause', 'speed']) {
        const b = document.querySelector(`#bottom-bar [data-action="${a}"], [data-action="${a}"]`);
        if (!b) continue;
        const br = b.getBoundingClientRect();
        const x = br.x + br.width / 2, y = br.y + br.height / 2;
        const top = document.elementFromPoint(x, y);
        if (!(top === b || b.contains(top))) out.push(a);
      }
      return out;
    });
    if (covered.length) fix(`phone 魔物卡蓋住浮動鈕：${covered}`);
    else ok('phone 魔物卡出現時地圖／暫停／速度仍可點');
    if (process.env.SHOTS) await page.screenshot({ path: 'output/foe-card/phone.png' });

    // ✕ 與 Esc 都能收
    await page.click('#unit-card .uc-x').catch(() => {});
    await page.waitForTimeout(200);
    if (await cardInfo(page)) fix('phone 按 ✕ 沒有收起魔物卡');
    const again = await clickFoe(page);
    if (again) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (await cardInfo(page)) fix('phone Esc 沒有收起魔物卡');
      else ok('phone ✕ 與 Esc 都能收起魔物卡');
    }
  }
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
console.log('PASS foe card: 點世界裡的魔物也能開小卡（頭像／名字／首領或魔物／區域掉落／生命／攻擊·金幣·經驗），生命條跟 state 同步、重傷轉色、倒下自動收起、✕ 與 Esc 都能收，手機不壓底欄也不擋浮動鈕');
