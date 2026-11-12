// building-upgrade.mjs — T111：建築面板要說清楚「目前等級 → 下一級」、升級需求（現有/需要），
//   以及不能升的真正原因（已滿級 / 大廳等級不夠 / 資源不足），不要按下去才跳錯誤。
// Usage: node tools/checks/building-upgrade.mjs        (game server on 5024 expected)
//        $env:SHOTS='1'; node tools/checks/building-upgrade.mjs   另寫 output/building-upgrade/*.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const fails = [], oks = [];
const fix = m => fails.push(m), ok = m => oks.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/building-upgrade', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });

async function boot(viewport, dsr = 1) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsr, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  return { ctx, page, errs };
}

// 設定建築等級／資源，再點世界裡的建築選取它
async function setup(page, { hall, levels = {}, res = {} }) {
  await page.evaluate(({ hall, levels, res }) => {
    const g = globalThis.__mistvaleGame;
    g.state.paused = true;
    if (hall != null) g.state.buildings.hall = hall;
    for (const [k, v] of Object.entries(levels)) g.state.buildings[k] = v;
    for (const [k, v] of Object.entries(res)) g.state[k] = v;
    g.state.capacity = 8 + (g.state.buildings.house - 1) * 2;
  }, { hall, levels, res });
  await page.waitForTimeout(150);
}

const coveredBy = [];   // 被抽屜蓋住、無法直接點的建築(只記錄,不拿來繞過)
const NAME = { house: '獵人小屋', forge: '鐵匠鋪', academy: '學院' };
async function selectBuilding(page, id) {
  // 2026-11-11 FIX-C:建築詳情抽屜開著時,直接點世界上露出的另一棟建築就切換(不先關掉上一個);
  //   若這棟被抽屜蓋住(點下去會打到抽屜)就記錄下來,由呼叫端決定——不再用「先關掉」繞過去
  // 2026-11-12 Z1:建築詳情是 C 置中視窗(55% 遮罩蓋住世界),不能再直接點世界切換建築;已開著就先用 Esc 關掉再走一般流程(點建築→六角鈕→資訊)
  let wasOpen = await page.evaluate(() => !document.querySelector('#inspector')?.classList.contains('hidden'));
  if (wasOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(220); wasOpen = false; }
  // 世界回報的 hitRects 就是這一幀實際的可點矩形，換算成畫面座標再點（不要自己算投影）
  const r = await page.evaluate(bid => {
    const v = globalThis.__mistvaleView, cv = document.querySelector('#world');
    if (!v?.hitRects || !cv) return null;
    const rect = cv.getBoundingClientRect(), bot = v.unproject(rect.right, rect.bottom);
    const u = v.hitRects().find(x => x.id === bid);
    if (!u) return null;
    return { x: rect.left + ((u.x + u.w / 2) / bot.sx) * rect.width, y: rect.top + ((u.y + u.h / 2) / bot.sy) * rect.height };
  }, id);
  if (!r) return false;
  if (wasOpen) {
    const covered = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#inspector,#bottom-bar,#topbar'), [r.x, r.y]);
    // 露出的 → 真的用滑鼠點;被抽屜蓋住的點不到 → 走 __mistvaleSelect(等同世界點擊的入口),一樣要直接切換內容
    if (covered) { coveredBy.push(id); await page.evaluate(i => globalThis.__mistvaleSelect(i), id); }
    else await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(260);
    // 抽屜開著時點另一棟 → 內容直接換成那一棟(標題對得上),抽屜沒有關掉過
    return await page.evaluate(n => { const el = document.querySelector('#inspector'); return !el.classList.contains('hidden') && el.querySelector('#inspect-title')?.textContent === n; }, NAME[id]);
  }
  await page.mouse.click(r.x, r.y);
  await page.waitForTimeout(260);
  // 2026-11-11 第二階段(規格 4.6):點建築 → 腳下出現六角鈕(資訊 i／取消 ×);按「資訊」才開 #inspector
  const hexShown = await page.evaluate(() => { const s = document.querySelector('#hv-sel'); return !!s && !s.hidden && s.dataset.target; });
  if (!hexShown) return false;
  const ib = await page.$('#hv-sel [data-action="selInfo"]');
  const bb = ib && await ib.boundingBox();
  if (!bb || bb.width < 44 || bb.height < 44) return false;
  await ib.click();
  await page.waitForTimeout(260);
  return await page.evaluate(() => !document.querySelector('#inspector')?.classList.contains('hidden'));
}

const info = page => page.evaluate(() => {
  const el = document.querySelector('#inspector');
  if (!el || el.classList.contains('hidden')) return null;
  const q = s => el.querySelector(s);
  const btn = q('#inspect-foot [data-action="upgrade"], #inspect-foot [data-action="construct"], .inspect-actions [data-action="upgrade"], .inspect-actions [data-action="construct"]');
  const r = el.getBoundingClientRect();
  return {
    title: q('#inspect-title')?.textContent || '',
    level: q('.inspect-level')?.textContent || '',
    next: q('.inspect-next')?.textContent || '',
    delta: q('.inspect-delta')?.textContent || '',
    effect: q('.inspect-effect')?.textContent || '',
    chips: [...el.querySelectorAll('.inspect-cost .cost-chip')].map(c => ({
      have: Number(c.dataset.have), need: Number(c.dataset.need), short: c.classList.contains('short'), text: c.textContent.replace(/\s+/g, ' ').trim(),
    })),
    note: q('.inspect-note')?.textContent || '',
    noteShort: !!q('.inspect-note.short'),
    done: q('.inspect-done')?.textContent.trim() || '',   // 2026-11-11 FIX-B:滿級不放紅色主按鈕,改一行綠色狀態字
    btn: btn ? { label: btn.textContent.trim(), disabled: btn.disabled || btn.hasAttribute('aria-disabled'), action: btn.dataset.action } : null,
    rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom },
    vw: innerWidth, vh: innerHeight,
  };
});

const upCost = (page, id, lv) => page.evaluate(({ id, lv }) => {
  const g = globalThis.__mistvaleGame;
  const c = g.getUpgradeCost(id);
  return c;
}, { id, lv });

// ── desktop ──────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 1440, height: 900 });
  const rich = { gold: 5000, wood: 500, ore: 500, gems: 99 };

  // 1) 資源充足：獵人小屋 Lv.2 → Lv.3
  await setup(page, { hall: 3, levels: { house: 2 }, res: rich });
  if (!await selectBuilding(page, 'house')) fix('desktop 點世界裡的獵人小屋沒有打開 #inspector');
  else {
    const c = await info(page);
    const cost = await upCost(page, 'house', 2);
    ok(`desktop 小屋 Lv.2 → 下一級：${c.next}`);
    if (!c.level.includes('Lv.2')) fix(`desktop 等級行不對：${c.level}`);
    if (!c.next.includes('Lv.3')) fix(`desktop 下一級不是 Lv.3：${c.next}`);
    if (!c.delta.includes('12') || !c.delta.includes('10')) fix(`desktop 小屋沒有寫出名額 10 → 12：${c.delta || '(空)'}`);
    if (!c.btn || c.btn.disabled) fix(`desktop 資源充足時升級鈕應該可按：${JSON.stringify(c.btn)}`);
    if (c.btn && !c.btn.label.includes('Lv.3')) fix(`desktop 升級鈕文字應寫 升級 Lv.3：${c.btn.label}`);
    for (const [k, v] of Object.entries(cost)) {
      const chip = c.chips.find(x => x.need === v);
      if (!chip) fix(`desktop 需求沒有列出 ${k} ${v}（chips=${JSON.stringify(c.chips)}）`);
      else if (chip.have !== rich[k]) fix(`desktop ${k} 現有數字 ${chip.have} != ${rich[k]}`);
    }
    if (c.noteShort) fix(`desktop 資源足夠卻把說明標成缺料：${c.note}`);
    if (!c.note.includes('資源足夠')) fix(`desktop 資源足夠時說明文字不對：${c.note}`);
    if (process.env.SHOTS) await page.screenshot({ path: 'output/building-upgrade/desktop-ok.png' });

    // 按下去真的升級，面板跟著更新
    await page.click('#inspector [data-action="upgrade"]');
    // 面板是下一次 paint() 才重畫，輪詢等它更新（固定等 300ms 會偶發讀到舊字）
    await page.waitForFunction(() => document.querySelector('#inspector .inspect-level')?.textContent.includes('Lv.3'), null, { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(160);
    const after = await info(page);
    const lvNow = await page.evaluate(() => globalThis.__mistvaleGame.state.buildings.house);
    if (lvNow !== 3) fix(`desktop 按升級後建築等級 ${lvNow} != 3`);
    if (after && !after.level.includes('Lv.3')) fix(`desktop 升級後面板等級沒更新：${after.level}`);
    else ok('desktop 按升級後等級與面板一起更新 (Lv.2 → Lv.3)');
  }

  // 2) 資源不足：金幣 0 → 升級鈕停用、說明寫還缺多少、chip 標紅
  await setup(page, { hall: 3, levels: { house: 3 }, res: { gold: 0, wood: 500, ore: 500 } });
  await selectBuilding(page, 'house');
  {
    const c = await info(page);
    const cost = await upCost(page, 'house', 3);
    if (!c) fix('desktop 資源不足時面板不見了');
    else {
      if (!c.btn || !c.btn.disabled) fix(`desktop 金幣 0 時升級鈕應該停用：${JSON.stringify(c.btn)}`);
      if (!c.noteShort) fix(`desktop 缺資源說明沒有標紅：${c.note}`);
      if (!c.note.includes('還缺')) fix(`desktop 缺資源說明沒有寫「還缺」：${c.note}`);
      if (cost.gold && !c.note.includes(String(cost.gold)) && !c.note.includes(String(cost.gold).replace(/\B(?=(\d{3})+(?!\d))/g, ','))) fix(`desktop 沒有寫出缺多少金幣（需要 ${cost.gold}）：${c.note}`);
      const goldChip = c.chips.find(x => x.short);
      if (!goldChip) fix('desktop 缺資源時沒有任何 chip 標紅');
      ok(`desktop 資源不足：${c.note} / 按鈕「${c.btn?.label}」停用`);
      if (process.env.SHOTS) await page.screenshot({ path: 'output/building-upgrade/desktop-short.png' });
    }
  }

  // 3) 大廳等級不足：大廳 Lv.1、鐵匠鋪 Lv.2（再升就會超過大廳）
  await setup(page, { hall: 1, levels: { forge: 2 }, res: rich });
  await selectBuilding(page, 'forge');
  {
    const c = await info(page);
    if (!c) fix('desktop 大廳不足時面板不見了');
    else {
      if (!c.btn || !c.btn.disabled) fix(`desktop 大廳等級不足時升級鈕應該停用：${JSON.stringify(c.btn)}`);
      if (!c.note.includes('城鎮大廳')) fix(`desktop 大廳不足的說明沒提到城鎮大廳：${c.note}`);
      if (!c.note.includes('Lv.3')) fix(`desktop 大廳不足的說明沒寫需要 Lv.3：${c.note}`);
      if (!c.noteShort) fix('desktop 大廳不足的說明沒有標紅');
      ok(`desktop 大廳等級不足：${c.note}`);
    }
  }

  // 4) 已滿級：小屋 Lv.5
  await setup(page, { hall: 3, levels: { house: 5 }, res: rich });
  await selectBuilding(page, 'house');
  {
    const c = await info(page);
    if (!c) fix('desktop 滿級時面板不見了');
    else {
      if (c.btn || !c.done.includes('已達最高')) fix(`desktop 滿級時不放升級主按鈕、改一行「已達最高等級」狀態字：btn=${JSON.stringify(c.btn)} done="${c.done}"`);
      if (c.chips.length) fix('desktop 滿級時不該再列需求');
      if (!c.note.includes('滿級')) fix(`desktop 滿級說明不對：${c.note}`);
      if (c.noteShort) fix('desktop 滿級說明不該標紅');
      ok(`desktop 已滿級：${c.done} / ${c.note}`);
    }
  }

  // 5) 尚未建造：學院 0 → 「建造後 Lv.1」與建造鈕
  await setup(page, { hall: 3, levels: { academy: 0 }, res: rich });
  await selectBuilding(page, 'academy');
  {
    const c = await info(page);
    if (!c) fix('desktop 未建造的學院打不開面板');
    else {
      if (!c.level.includes('尚未建造')) fix(`desktop 未建造時等級行不對：${c.level}`);
      if (!c.next.includes('Lv.1')) fix(`desktop 未建造時沒有寫建造後 Lv.1：${c.next}`);
      if (!c.btn || c.btn.action !== 'construct' || c.btn.disabled || c.btn.label !== '建造') fix(`desktop 未建造時按鈕不對：${JSON.stringify(c.btn)}`);
      ok('desktop 未建造：尚未建造 / 建造後 Lv.1 / 建造鈕可按');
    }
  }
  if (errs.length) fix(`desktop 頁面錯誤：${errs.slice(0, 2).join(' | ')}`);
  await ctx.close();
}

// ── phone ────────────────────────────────────────────────
{
  const { ctx, page, errs } = await boot({ width: 402, height: 712 }, 2);
  await setup(page, { hall: 3, levels: { house: 2 }, res: { gold: 5000, wood: 500, ore: 500, gems: 99 } });
  if (!await selectBuilding(page, 'house')) fix('phone 點建築沒有打開面板');
  else {
    const c = await info(page);
    if (!c) fix('phone 面板不見了');
    else {
      if (c.rect.x < 0 || c.rect.w > c.vw) fix(`phone 面板超出畫面 ${JSON.stringify(c.rect)} vw=${c.vw}`);
      if (!c.note) fix('phone 沒有升級說明');
      const tiny = await page.evaluate(() => {
        const el = document.querySelector('#inspector [data-action="upgrade"]');
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height);
      });
      if (tiny < 22) fix(`phone 升級鈕太小（${tiny.toFixed(1)}px）`);
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('#inspector');
        return el.scrollWidth - el.clientWidth;
      });
      if (overflow > 1) fix(`phone 面板內容溢出 ${overflow}px`);
      ok(`phone 面板 ${Math.round(c.rect.w)}x${Math.round(c.rect.h)} 沒有溢出，升級鈕 ${tiny.toFixed(0)}px`);
      // T111：手機上開左側抽屜時，建築面板要先收起 —— 兩塊面板疊在一起會互相擋點擊
      //（實測按鈕巡檢抓到「查看委託」被 inspect-level 蓋住）
      // 抽屜的展開鈕在 #reopen-left 裡（手機上可能是被建築面板蓋住的角落），用程式點擊比較穩
      await page.evaluate(() => document.querySelector('#reopen-left')?.click());
      await page.waitForTimeout(320);
      const insHidden = await page.evaluate(() => document.querySelector('#inspector')?.classList.contains('hidden'));
      if (!insHidden) fix('phone 開左側抽屜時建築面板沒有收起（會蓋住抽屜裡的按鈕）');
      else ok('phone 開抽屜會先收起建築面板');

      if (process.env.SHOTS) await page.screenshot({ path: 'output/building-upgrade/phone.png' });
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
console.log('PASS building upgrade: 建築面板寫出目前等級→下一級、需求（現有/需要）、滿級／大廳等級不足／資源不足各自停用並說明原因，小屋寫出獵人名額差額，按升級後面板同步，手機不溢出');
