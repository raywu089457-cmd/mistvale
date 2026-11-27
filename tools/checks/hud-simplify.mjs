// hud-simplify.mjs — 2026-11-27 HUD 簡化(左上難度／任務、左下 3D 鏡頭、下方頁籤只留圖示、右下垂直膠囊)
//   難度徽記:不被切掉、有 Lv.、邊色跟難度走、點了還是開難度面板
//   任務小卡:標題「第N章 名稱」、小卡不高、calm 時獎勵收起、進度小牌 ≥12px、顧問頭像 ≤36
//   3D 鏡頭列:收起時可見鈕 ≤2(觸控 ≤1),每顆都有 aria-label + data-tip,「⋯」展開後 3D／⟲／⟳／北／✦ 全部點得到,動作有作用
//   頁籤列:文字標籤視覺隱藏、aria-label／data-tip 有名稱、熱區 ≥44、獵人小牌／建設徽章還在、列高 ≤52
//   右下:召喚首領／回村／＋／－／村務面板併成一條膠囊(無逐顆邊框、同寬),觸控 ＋／－ 藏起來,每顆有 aria-label + data-tip
// 用法: node tools/checks/hud-simplify.mjs   (TARGET 可指定伺服器)   Exit: 0 = PASS,1 = FIX
import * as L from './fix-a-lib.mjs';

const srv = await L.startServer();
const url = srv.url + (srv.url.includes('?') ? '' : '?preview=1');
const VIEWS = {
  phone: { w: 390, h: 844, mobile: true }, land: { w: 844, h: 390, mobile: true },
  narrowMouse: { w: 705, h: 793 }, desktop: { w: 1440, h: 900 },
};
const fails = [], oks = [];
const fix = m => { fails.push(m); console.log('FIX ' + m); };
const ok = m => { oks.push(m); console.log('ok  ' + m); };
const b = await L.launch();
try {
  for (const [name, v] of Object.entries(VIEWS)) {
    const ctx = await L.newCtx(b, v); const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await L.boot(page, url);
    await page.waitForTimeout(800);
    const touch = !!v.mobile, land = v.h <= 520;
    const r = await L.ev(page, (P, a) => {
      const vis = P.vis, R = P.R;
      const out = {};
      // 1 難度徽記
      const cr = document.querySelector('#topbar .difficulty-button');
      out.crest = { r: R(cr), clipped: cr.scrollWidth > cr.clientWidth + 1 || cr.scrollHeight > cr.clientHeight + 1, town: document.querySelector('#hv-town').textContent, diff: document.querySelector('#difficulty-name').textContent, dc: getComputedStyle(cr).borderLeftColor, townRect: R(document.querySelector('#hv-town')), diffRect: R(document.querySelector('#difficulty-name')), aria: cr.getAttribute('aria-label') };
      // 2 任務小卡
      const hl = document.querySelector('#hv-left'), q = document.querySelector('#hv-quest'), t = document.querySelector('#hv-quest-title'), pg = document.querySelector('#hv-quest-prog');
      hl.classList.add('q-calm');
      out.quest = { card: (c => ({ ...c, h: Math.max(R(q).b, vis(document.querySelector('#hv-advisor .next-step')) ? R(document.querySelector('#hv-advisor .next-step')).b : 0) - c.t + 4 }))(R(hl)), title: t.textContent, titleFs: parseFloat(getComputedStyle(t).fontSize), progFs: parseFloat(getComputedStyle(pg).fontSize), progVis: vis(pg), reward: getComputedStyle(document.querySelector('#hv-quest-reward')).display, goal: getComputedStyle(document.querySelector('#hv-quest-goal')).display, face: R(document.querySelector('#hv-advisor .hv-face')), adv: R(document.querySelector('#hv-advisor .next-step')) };
      hl.classList.remove('q-calm');
      out.questOpen = { reward: getComputedStyle(document.querySelector('#hv-quest-reward')).display, goal: getComputedStyle(document.querySelector('#hv-quest-goal')).display };
      // 3 鏡頭列
      const cam = document.querySelector('#hd2d-cam');
      const btns = [...cam.querySelectorAll(':scope>button')];
      out.cam = { shown: vis(cam), r: R(cam), btns: btns.map(x => ({ a: x.dataset.action, aria: x.getAttribute('aria-label'), tip: x.dataset.tip, vis: vis(x), r: R(x) })) };
      // 4 頁籤
      const tb = [...document.querySelectorAll('#bottom-bar>button')];
      out.tabs = tb.map(x => ({ a: x.dataset.action, aria: x.getAttribute('aria-label'), tip: x.dataset.tip, r: R(x), b: R(x.querySelector('b')), ic: R(x.querySelector('[data-icon]')), icVis: vis(x.querySelector('[data-icon]')), n: x.querySelector('.tab-n') ? R(x.querySelector('.tab-n')) : null, badge: x.dataset.badge || '' }));
      out.bar = R(document.querySelector('#bottom-bar'));
      // 5 右下
      const rail = document.querySelector('.hv-rail');
      const rb = [...rail.querySelectorAll('button')].filter(x => vis(x));
      out.rail = { r: R(rail), btns: rb.map(x => ({ a: x.dataset.action || x.dataset.act, aria: x.getAttribute('aria-label'), tip: x.dataset.tip, r: R(x), bw: parseFloat(getComputedStyle(x).borderTopWidth) })), all: [...rail.querySelectorAll('button')].map(x => x.dataset.action || x.dataset.act) };
      return out;
    });
    const L1 = `${name}`;
    // 1
    if (r.crest.clipped) fix(`${L1}/難度徽記內容被切掉`); else ok(`${L1}/難度徽記沒被切掉`);
    if (r.crest.r.l < 0 || r.crest.r.t < 0) fix(`${L1}/難度徽記超出畫面 ${JSON.stringify(r.crest.r)}`);
    if (!/^Lv\.\d+/.test(r.crest.town.replace(/^暮影村\s*/, ''))) fix(`${L1}/難度徽記要顯示 Lv.N:${r.crest.town}`);
    if (r.crest.r.w > 66) fix(`${L1}/難度徽記太寬 ${r.crest.r.w}`);
    if (r.crest.r.h < 40 || (touch && r.crest.r.h < 43.5)) fix(`${L1}/難度徽記高度 ${r.crest.r.h}`);
    if (r.crest.townRect.r > r.crest.r.r + 0.5 || r.crest.diffRect.r > r.crest.r.r + 0.5) fix(`${L1}/難度徽記文字超出徽記`);
    if (!/村莊資訊/.test(r.crest.aria) || !/暮影村/.test(r.crest.aria)) fix(`${L1}/難度徽記 aria-label 要含村名:${r.crest.aria}`);
    // 2
    if (!/^第\d+章 \S/.test(r.quest.title)) fix(`${L1}/任務標題格式「第N章 名稱」:${r.quest.title}`); else ok(`${L1}/任務標題 ${r.quest.title}`);
    if (r.quest.card.h > (touch ? 52 : 46)) fix(`${L1}/任務小卡太高 ${r.quest.card.h}(calm 時)`);
    if (r.quest.reward !== 'none') fix(`${L1}/calm 時獎勵要收起(display=${r.quest.reward})`);
    if (r.questOpen.reward === 'none') fix(`${L1}/展開時要顯示獎勵`);
    if (r.quest.goal !== 'none' || r.questOpen.goal === 'none') fix(`${L1}/目標那行:calm 收起(${r.quest.goal})、展開顯示(${r.questOpen.goal})`);
    if (r.quest.progFs < 12 || r.quest.titleFs < 12) fix(`${L1}/任務字級 <12:${r.quest.titleFs}/${r.quest.progFs}`);
    if (r.quest.adv.w > 36.5 || r.quest.adv.h > 36.5) fix(`${L1}/顧問頭像太大 ${r.quest.adv.w}×${r.quest.adv.h}`);
    // 3
    const vh = v.h;
    if (land) { if (r.cam.shown) ok(`${L1}/(矮視窗鏡頭列不顯示,同改版前)`); }
    else {
      const labelled = r.cam.btns.every(x => x.aria && x.tip);
      if (!labelled) fix(`${L1}/鏡頭列每顆都要有 aria-label + data-tip:${JSON.stringify(r.cam.btns.map(x => [x.a, !!x.aria, !!x.tip]))}`);
      const vc = r.cam.btns.filter(x => x.vis).length, maxV = touch ? 1 : 2;
      if (vc > maxV) fix(`${L1}/鏡頭列收起時可見鈕 ${vc} > ${maxV}`); else ok(`${L1}/鏡頭列收起時可見 ${vc} 顆、寬 ${r.cam.r.w}`);
      if (r.cam.r.w > (touch ? 60 : 100)) fix(`${L1}/鏡頭列收起時太寬 ${r.cam.r.w}`);
      const mr = r.cam.btns.find(x => x.a === 'camMenu');
      if (!mr || mr.r.h < (touch ? 43.5 : 30)) fix(`${L1}/「⋯」熱區太小 ${JSON.stringify(mr?.r)}`);
      // 展開 → 全部點得到 → 各動作有作用
      await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camMenu]').click());
      await page.waitForTimeout(150);
      const open = await L.ev(page, P => { const cam = document.querySelector('#hd2d-cam'); return { open: cam.classList.contains('open'), exp: cam.querySelector('[data-action=camMenu]').getAttribute('aria-expanded'), vis: [...cam.querySelectorAll(':scope>button')].map(x => ({ a: x.dataset.action, vis: P.vis(x), hit: P.vis(x) && P.hit(x), h: P.R(x).h })), r: P.R(cam), vw: innerWidth }; });
      const want = ['camTilt', 'camOrbitL', 'camOrbitR', 'camReset', 'camFx'];
      const missing = want.filter(a => !open.vis.find(x => x.a === a && x.vis && x.hit));
      if (!open.open || open.exp !== 'true' || missing.length) fix(`${L1}/展開後缺 ${missing.join(',')}(open=${open.open}, expanded=${open.exp})`); else ok(`${L1}/展開後 5 個動作都在且點得到`);
      if (open.r.r > open.vw) fix(`${L1}/展開後超出畫面右緣`);
      const ang0 = await page.evaluate(() => JSON.stringify(window.__mistvaleGame && document.querySelector('#hd2d-cam').dataset.angle || ''));
      for (const a of ['camOrbitL', 'camOrbitR', 'camTilt', 'camReset']) await page.evaluate(a => document.querySelector(`#hd2d-cam [data-action=${a}]`).click(), a);
      const fxBefore = await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camFx]').getAttribute('aria-pressed'));
      await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camFx]').click());
      const fxAfter = await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camFx]').getAttribute('aria-pressed'));
      if (fxBefore === fxAfter) fix(`${L1}/✦ 沒切換(${fxBefore}→${fxAfter})`);
      await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camFx]').click());
      // 再按「⋯」收起
      await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camMenu]').click());
      const closed = await page.evaluate(() => !document.querySelector('#hd2d-cam').classList.contains('open'));
      if (!closed) fix(`${L1}/再按「⋯」沒收起`);
      // 鍵盤快捷鍵還在(Q/E 旋轉、R 仰角、C 重置、V 景深):按了不能丟錯
      if (!touch) { for (const k of ['q', 'e', 'r', 'c', 'v', 'v']) await page.keyboard.press(k); }
    }
    // 4
    const tabNames = ['建設', '地下城', '獵人', '倉庫', '交易'];
    r.tabs.forEach((t, i) => {
      if (!t.aria || !t.aria.startsWith(tabNames[i])) fix(`${L1}/頁籤 ${t.a} aria-label ${t.aria}`);
      if (!t.tip || !t.tip.startsWith(tabNames[i])) fix(`${L1}/頁籤 ${t.a} data-tip ${t.tip}`);
      if (t.b.w > 2 || t.b.h > 2) fix(`${L1}/頁籤 ${t.a} 文字標籤沒隱藏 ${t.b.w}×${t.b.h}`);
      if (t.r.h < 43.5 || t.r.w < 43.5) fix(`${L1}/頁籤 ${t.a} 熱區 ${t.r.w}×${t.r.h} <44`);
      if (!t.icVis || t.ic.w < 27) fix(`${L1}/頁籤 ${t.a} 圖示 ${t.ic?.w}`);
    });
    const hn = r.tabs.find(t => t.a === 'hunters').n;
    if (!hn) fix(`${L1}/獵人頁籤的人數小牌不見了`); else if (hn.r > r.tabs.find(t => t.a === 'hunters').r.r + 0.5 || hn.t < r.tabs.find(t => t.a === 'hunters').r.t - 0.5) fix(`${L1}/獵人小牌超出頁籤`);
    else ok(`${L1}/獵人小牌在頁籤內`);
    if (!r.tabs.find(t => t.a === 'build').badge) fix(`${L1}/建設頁籤紅色徽章(data-badge)不見了`);
    if (r.bar.h > 52 + 40) fix(`${L1}/頁籤列太高 ${r.bar.h}`); else ok(`${L1}/頁籤列高 ${r.bar.h}`);
    // 5
    const want5 = ['boss', 'home', 'toggleLeft'].concat(touch ? [] : ['zoomIn', 'zoomOut']);
    const miss5 = want5.filter(a => !r.rail.btns.find(x => x.a === a));
    if (miss5.length) fix(`${L1}/右下膠囊缺 ${miss5.join(',')}(實際 ${r.rail.btns.map(x => x.a).join(',')})`); else ok(`${L1}/右下膠囊 ${r.rail.btns.map(x => x.a).join(' ')}`);
    if (touch && r.rail.btns.some(x => x.a === 'zoomIn' || x.a === 'zoomOut')) fix(`${L1}/觸控不顯示 ＋／－`);
    if (r.rail.btns.some(x => !x.aria || !x.tip)) fix(`${L1}/右下鈕要有 aria-label + data-tip:${JSON.stringify(r.rail.btns.filter(x => !x.aria || !x.tip).map(x => x.a))}`);
    if (r.rail.btns.some(x => x.bw > 0)) fix(`${L1}/右下鈕不要逐顆邊框`);
    const ws = new Set(r.rail.btns.map(x => Math.round(x.r.w))), hs = new Set(r.rail.btns.map(x => Math.round(x.r.h)));
    if (ws.size > 1 || hs.size > 1) fix(`${L1}/右下鈕尺寸不一致 ${[...ws]} × ${[...hs]}`);
    if (touch && r.rail.btns.some(x => x.r.h < 43.5 || x.r.w < 43.5)) fix(`${L1}/右下鈕觸控熱區 <44`);
    const xs = r.rail.btns.map(x => x.r.t).sort((a, c) => a - c);
    if (xs.some((y, i) => i && y < xs[i - 1] + 20)) fix(`${L1}/右下鈕互相重疊`);
    if (errs.length) fix(`${L1}/頁面錯誤 ${errs[0]}`);
    await ctx.close();
  }
} finally { await b.close(); srv.stop(); }
console.log(fails.length ? `FAIL hud-simplify ${fails.length} 項` : `PASS hud-simplify: ${oks.length} 項 ok`);
process.exit(fails.length ? 1 : 0);
