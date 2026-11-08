// T106 驗收:重擊停格(hitstop)。
// 驗的是行為,不是長相:重擊請求進來後世界端要「停止重畫」,時間到要自動恢復,
// 關掉鏡頭震動或系統 reduced-motion 時完全不停格,而且停格不會寫進存檔。
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://100.79.149.0:5024/?preview=1';
const BROWSER = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
const ok = (msg) => console.log('ok  ' + msg);
const fix = (msg) => { fails.push(msg); console.log('FIX ' + msg); };

const GAME_READY = () => globalThis.__mistvaleGame && !document.querySelector('#loading');
// 從遊戲那一端丟一筆停格請求(和 effect() 裡寫的形狀完全一樣)
const REQ = (ms) => { const g = globalThis.__mistvaleGame; g.state.hitstop = { ms, seq: (g.state.hitstop?.seq || 0) + 1, t: g.state.time }; return g.state.hitstop.seq; };

async function boot(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-TW', ...opts });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'commit' });
  await page.waitForFunction(GAME_READY, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--headless=new', '--mute-audio'] });
try {
  // ── 1. 基本行為 ───────────────────────────────────────────────────────
  {
    const { ctx, page } = await boot(browser);
    const shape = await page.evaluate(() => typeof globalThis.__mistvaleHitstop === 'function' ? globalThis.__mistvaleHitstop() : null);
    if (!shape) fix('沒有 __mistvaleHitstop 驗收 hook');
    else ok(`hook: count=${shape.count} skipped=${shape.skipped}`);

    const base = await page.evaluate(() => globalThis.__mistvaleHitstop());
    const seq = await page.evaluate(REQ, 260);
    await sleep(40);
    const a = await page.evaluate(() => globalThis.__mistvaleHitstop());
    const leftA = a.left;
    await sleep(90);
    const b = await page.evaluate(() => globalThis.__mistvaleHitstop());
    if (a.seq !== seq) fix(`請求沒有被世界端收到(seq ${seq} → ${a.seq})`);
    if (!(a.frozen && b.frozen)) fix(`260ms 的停格在 130ms 內就結束了(frozen ${a.frozen}/${b.frozen})`);
    if (!(leftA > 120 && leftA <= 300)) fix(`停格長度不對(left=${leftA}, 期待 120–300ms)`);
    const skippedDelta = b.skipped - base.skipped;
    if (skippedDelta < 3) fix(`停格期間沒有跳過重畫(skipped +${skippedDelta}, 期待 >=3 幀)`);
    else ok(`停格 260ms:跳過 ${skippedDelta} 幀重畫,剩 ${leftA}ms`);

    await sleep(260);
    const c = await page.evaluate(() => globalThis.__mistvaleHitstop());
    if (c.frozen) fix('時間到之後還卡在停格');
    else if (c.skipped <= b.skipped) fix('恢復後沒有繼續重畫(skipped 沒有再增加)');
    else ok(`自動恢復:之後又多跳過 ${c.skipped - b.skipped} 幀,現在 frozen=${c.frozen}`);

    // 真的戰鬥會不會自己觸發(預覽模式的獵人正在打怪;暴擊 15% 會在幾秒內出現)
    const real = await page.evaluate(async (base) => {
      const g = globalThis.__mistvaleGame;
      const t0 = performance.now(); let crits = 0; const seen = new Set();
      while (performance.now() - t0 < 30000) {
        for (const e of g.state.effects) { const k = e.id; if (!seen.has(k)) { seen.add(k); if (e.crit) crits++; } }
        if (globalThis.__mistvaleHitstop().count > base) return { hit: true, crits, ms: Math.round(performance.now() - t0) };
        await new Promise(r => setTimeout(r, 50));
      }
      return { hit: false, crits, ms: 30000 };
    }, c.count);
    if (!real.hit) fix(`30 秒內實戰沒有觸發停格(期間暴擊 ${real.crits} 次)`);
    else if (real.crits === 0) fix('有停格但沒看到暴擊特效(停格可能不是暴擊觸發的)');
    else ok(`實戰觸發:${real.ms}ms 後暴擊 ${real.crits} 次、停格 count 自己增加`);

    // 停格不進存檔
    const saved = await page.evaluate(() => { const o = globalThis.__mistvaleGame.serialize(); return { has: 'hitstop' in o, val: o.hitstop ?? null }; });
    if (saved.has && saved.val !== null) fix('serialize() 還帶著停格內容(停格會寫進存檔)');
    else ok('serialize() 的停格欄位是 null(不會寫進存檔)');
    await ctx.close();
  }

  // ── 2. 鏡頭震動關掉就不停格 ────────────────────────────────────────────
  {
    const { ctx, page } = await boot(browser);
    const r = await page.evaluate(async () => {
      const g = globalThis.__mistvaleGame; g.state.settings.shake = false;
      const before = globalThis.__mistvaleHitstop().count;
      g.state.hitstop = { ms: 200, seq: (g.state.hitstop?.seq || 0) + 1, t: g.state.time };
      await new Promise(r => setTimeout(r, 60));
      const s = globalThis.__mistvaleHitstop();
      return { frozen: s.frozen, count: s.count - before };
    });
    if (r.frozen || r.count !== 0) fix(`關掉震動還在停格(frozen=${r.frozen}, count+${r.count})`);
    else ok('設定關掉鏡頭震動:不停格');
    await ctx.close();
  }

  // ── 3. reduced-motion 不停格 ───────────────────────────────────────────
  {
    const { ctx, page } = await boot(browser, { reducedMotion: 'reduce' });
    const r = await page.evaluate(async () => {
      const g = globalThis.__mistvaleGame;
      const before = globalThis.__mistvaleHitstop().count;
      g.state.hitstop = { ms: 200, seq: (g.state.hitstop?.seq || 0) + 1, t: g.state.time };
      await new Promise(r => setTimeout(r, 60));
      const s = globalThis.__mistvaleHitstop();
      return { frozen: s.frozen, count: s.count - before };
    });
    if (r.frozen || r.count !== 0) fix(`reduced-motion 還在停格(frozen=${r.frozen}, count+${r.count})`);
    else ok('prefers-reduced-motion: reduce 時不停格');
    await ctx.close();
  }

  // ── 4. 事件表(原始碼) ─────────────────────────────────────────────────
  {
    const game = readFileSync('src/pixel-game.js', 'utf8');
    if (!/hsMs\s*=\s*amp\s*>=\s*3\.5\s*\?\s*90\s*:\s*amp\s*===\s*2\s*\?\s*60\s*:\s*0/.test(game)) fix('pixel-game.js 的停格毫秒表不見了(技能90/暴擊60/其他0)');
    else ok('事件表:技能命中與王擊 90ms、暴擊 60ms、普通命中不停');
    if (!/state\.hitstop\s*=/.test(game)) fix('pixel-game.js 沒有寫 state.hitstop');
    const world = readFileSync('src/pixel-world.js', 'utf8');
    if (!/hitStopSkipped\+\+;\s*return;/.test(world)) fix('pixel-world.js 沒有「跳過重畫」那段');
  }
} finally {
  await browser.close();
}
if (fails.length) { console.log(`\nFAIL hitstop: ${fails.length} 個問題`); process.exit(1); }
console.log('\nPASS hitstop: 重擊(技能/暴擊)會停住畫面並自動恢復、期間跳過重畫、關掉震動或 reduced-motion 時不停格、停格不進存檔');
