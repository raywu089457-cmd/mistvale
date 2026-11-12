// z2c-battle.mjs — Z2C:戰鬥、地圖與結算畫面(圖鑑 v2 規格 a/d/m/n、決定 C2/C4、UX #1/#3/#6/#7/#8/#11/#13/#16、手機 R1/R4/R5)
//   1 未解鎖引導:沒有地下城入口/修煉地 → 面板頂端提示框(成本＋「前往建設」),出發鈕灰色鎖頭寫缺什麼,狀態不寫「可以出發」;前往建設會標出那一格
//   2 抽屜:出發/開始鈕固定在抽屜底部(不用捲就按得到,觸控 ≥44px)、選人列 ≤60px 且數字帶「攻／防」、「可以出發」綠/「再選 N 位」橘
//   3 地下城/競技場結算:結束跳 C 視窗(緞帶標題、3 個獎勵格、底部一顆鈕);競技場進行中面板內有對手與三人血條
//   4 離線戰報:3 格摘要、「你的獵人／流浪英雄」兩列、底部一顆橄欖綠「收下」
//   5 首領:召喚前確認(首領名·血量·我方總攻擊·預估判定＋召喚綠/取消紅);全遊戲只叫「森林領主」;戰鬥中頂部有血條與剩餘時間且不蓋其他 HUD
//   6 世界地圖:小地圖固定在視窗頂端(列表捲動時不動)、畫布像素＝顯示大小(R4)、每區一行(判定標籤＋前往 ≥44px)
//   7 派遣:列上有判定標籤;選到危險區按鈕寫「派遣（危險）」並跳確認
//   8 出征 HUD:不蓋行動徽章/縮放鈕/任務欄/頂欄按鈕(R1),撤退鈕觸控 ≥44px
// 用法:node tools/checks/z2c-battle.mjs  (TARGET=網址 指定伺服器;VIEWS=phone,land 只跑部分尺寸)
import * as L from './fix-a-lib.mjs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = []; const fix = m => { fails.push(m); };
const ALL = {
  phone: { w: 390, h: 844, mobile: true }, desktop: { w: 1440, h: 900 }, land: { w: 844, h: 390, mobile: true },
  p360: { w: 360, h: 640, mobile: true }, l667: { w: 667, h: 375, mobile: true }, l740: { w: 740, h: 360, mobile: true },
};
const FULL = new Set(['phone', 'land', 'l740', 'desktop']);   // 這幾個跑完整流程(結算、首領、派遣);其餘只量版面
const only = (process.env.VIEWS || '').split(',').filter(Boolean);
const names = only.length ? only : Object.keys(ALL);

const modalType = page => page.evaluate(() => { const b = document.querySelector('#modal-backdrop'); return b && !b.classList.contains('hidden') ? document.querySelector('#modal').dataset.type : ''; });
const open = async (page, a, id) => { await L.act(page, a, id); await page.waitForTimeout(700); };
const tap = async (page, sel, touch) => { const l = page.locator(sel).first(); if (touch) await l.tap({ timeout: 3000 }); else await l.click({ timeout: 3000 }); await page.waitForTimeout(350); };
const tick = (page, n = 20) => page.evaluate(n => { const g = globalThis.__mistvaleGame; for (let k = 0; k < n; k++) g.tick(.25); }, n);
// 一邊讓畫面跑幾幀、一邊推進模擬,直到 cond 成立(結算視窗靠逐幀的 watcher 偵測 active 轉 false)
async function until(page, cond, max = 60) { for (let i = 0; i < max; i++) { if (await page.evaluate(cond)) return true; await tick(page); await page.waitForTimeout(70); } return await page.evaluate(cond); }
const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

async function runView(name, v) {
  const touch = !!v.mobile, min = touch ? 44 : 32; const tag = name;
  const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 160))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await L.boot(page, srv.url);

  // ── 1 未解鎖引導(全新存檔:沒有地下城入口、沒有修煉地)
  for (const [act, want, btnSel, buildId] of [['dungeon', ['地下城入口', '380'], 'startDungeon', 'dungeon'], ['arena', ['修煉地', '220'], 'startArena', 'training']]) {
    await open(page, act);
    const lk = await L.ev(page, (L, sel) => { const c = document.querySelector('#modal-content'), h = c.querySelector('.z2c-lock'), b = c.querySelector(`button[data-action=${sel}]`), go = c.querySelector('[data-action=z2cGoBuild]');
      return { hint: h ? h.textContent.replace(/\s+/g, ' ') : '', btn: b ? b.textContent.trim() : '', dis: !!b?.disabled, zbr: b?.dataset.zbr || '', status: c.querySelector('.encounter-status')?.textContent || '', go: go ? L.R(go) : null, hit: go ? L.hit(go) : false }; }, btnSel);
    if (!lk.hint) fix(`${tag} ${act}: 沒有未解鎖提示框 .z2c-lock`);
    else for (const w of want) if (!lk.hint.includes(w)) fix(`${tag} ${act}: 提示框沒寫「${w}」— ${lk.hint}`);
    if (!lk.dis || !/需要先建造/.test(lk.btn)) fix(`${tag} ${act}: 出發鈕應 disabled 並寫缺什麼 — ${lk.btn}`);
    if (lk.zbr !== 'olive' && lk.zbr !== 'gold') fix(`${tag} ${act}: 出發鈕沒有套按鈕語意色(${lk.zbr})`);
    if (/可以出發|可挑戰/.test(lk.status)) fix(`${tag} ${act}: 沒解鎖卻寫「${lk.status}」`);
    if (!lk.go || lk.go.h < min - .5 || !lk.hit) fix(`${tag} ${act}: 「前往建設」鈕太小或被蓋住 ${JSON.stringify(lk.go)}`);
    if (lk.go) {
      await tap(page, '#modal-content [data-action=z2cGoBuild]', touch);
      const t = await modalType(page), fl = await page.evaluate(id => !!document.querySelector(`#modal-content .z2c-flash[data-id="${id}"],#modal-content .z2c-flash [data-id="${id}"],#modal-content [data-id="${id}"].z2c-flash`), buildId);
      if (t !== 'build') fix(`${tag} ${act}: 按「前往建設」開的是 ${t || '(沒有)'}`);
      else if (!fl) fix(`${tag} ${act}: 建設面板沒有標出 ${buildId} 那一格(.z2c-flash)`);
    }
    await L.act(page, 'close'); await page.waitForTimeout(200);
  }
  // 顧問與開場導覽:先蓋地下城入口(新存檔、資源夠)
  const adv = await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.paused = true; g.state.modal = null; const el = document.querySelector('#next-step'); return el ? el.textContent : ''; });
  if (!/地下城入口/.test(adv) && v.w >= 360) { await page.waitForTimeout(600); const a2 = await page.evaluate(() => document.querySelector('#next-step')?.textContent || ''); if (!/地下城入口/.test(a2)) fix(`${tag}: 新存檔顧問提示沒叫玩家先蓋地下城入口(${a2 || '沒有提示'})`); }
  await page.evaluate(() => { globalThis.__mistvaleGame.state.paused = false; });

  // ── 2 抽屜:固定底部列、選人列、顏色
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'levels', 'heal']) g.cheat(k); });
  for (const [act, btn, label] of [['dungeon', 'startDungeon', /派遣三人小隊 · 從第 \d+ 層/], ['arena', 'startArena', /開始模擬對戰/]]) {
    await open(page, act);
    const tg = act === 'dungeon' ? 'toggleDungeonHunter' : 'toggleArenaHunter';
    const m = () => L.ev(page, (L) => { const c = document.querySelector('#modal-content'), d = c.querySelector('.z2c-dock'), b = d?.querySelector('.pixel-button'); if (!d || !b) return { none: true };
      const bar = document.querySelector('#bottom-bar').getBoundingClientRect(), rows = [...c.querySelectorAll('.party-pick')].map(e => e.getBoundingClientRect().height), st = d.querySelector('.ps-state');
      return { dock: L.R(d), btn: L.R(b), hit: L.hit(b), barTop: bar.top, rows: rows.length, rowMax: Math.max(0, ...rows), labels: [...c.querySelectorAll('.party-pick .pp-stats')].every(e => /攻/.test(e.textContent) && /防/.test(e.textContent)),
        pos: getComputedStyle(d).position, text: b.textContent.trim(), dis: b.disabled, stState: st?.textContent.trim() || '', stColor: st ? getComputedStyle(st).color : '', stCls: st?.className || '', scrollTop: c.scrollTop }; });
    let r = await m();
    if (r.none) { fix(`${tag} ${act}: 找不到底部固定列 .z2c-dock`); continue; }
    if (r.pos !== 'sticky') fix(`${tag} ${act}: 底部列不是 sticky(${r.pos})`);
    if (r.dock.b > r.barTop + 1 && !(v.h <= 520)) fix(`${tag} ${act}: 底部列沒在頁籤列上方 dock.b=${r.dock.b} 頁籤列 ${r.barTop}`);
    if (r.dock.t < 0 || r.dock.b > v.h + 1) fix(`${tag} ${act}: 底部列超出視窗 ${JSON.stringify(r.dock)}`);
    if (!r.hit) fix(`${tag} ${act}: 出發鈕中心點被別的元素蓋住`);
    if (r.btn.h < min - .5) fix(`${tag} ${act}: 出發鈕高 ${r.btn.h}px < ${min}px`);
    if (r.rows < 3) fix(`${tag} ${act}: 隊員列只有 ${r.rows} 個`);
    if (r.rowMax > 60) fix(`${tag} ${act}: 選人列高 ${r.rowMax}px > 60px`);
    if (!r.labels) fix(`${tag} ${act}: 選人列的數字沒有「攻／防」標籤`);
    if (!/再選 3 位/.test(r.stState) || !r.stCls.includes('need')) fix(`${tag} ${act}: 沒選人時狀態不是「再選 3 位」— ${r.stState}`);
    else { const [R, G, B] = rgb(r.stColor); if (!(R > 200 && G > 130 && G < 195 && B < 130)) fix(`${tag} ${act}: 「再選 N 位」應為橘色,實際 ${r.stColor}`); }
    const ids = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters.filter(h => h.hp > 0).map(h => h.id));
    for (const id of ids.slice(0, 3)) await L.act(page, tg, id);
    await page.waitForTimeout(300); r = await m();
    if (r.dis || !label.test(r.text)) fix(`${tag} ${act}: 選滿 3 位後出發鈕應可按且寫「出發」— ${r.text}`);
    if (!/可以出發/.test(r.stState) || !r.stCls.includes('ok')) fix(`${tag} ${act}: 選滿後狀態不是「可以出發」— ${r.stState}`);
    else { const [R, G, B] = rgb(r.stColor); if (!(G > R && G > B)) fix(`${tag} ${act}: 「可以出發」應為綠色,實際 ${r.stColor}`); }
    if (act === 'dungeon') {
      const fl = await L.ev(page, (L) => { const g = document.querySelector('#modal-content .z2c-floors'); return g ? { btns: [...g.querySelectorAll('button')].map(b => L.R(b)), cur: g.querySelector('b')?.textContent } : null; });
      if (!fl) fix(`${tag} dungeon: 沒有樓層步進列 .z2c-floors`); else if (fl.btns.some(b => b.h < min - .5)) fix(`${tag} dungeon: 步進鈕高 ${fl.btns.map(b => b.h)} < ${min}`);
    }
    if (v.w < 400 && v.h >= 600 && act === 'dungeon') {   // R5:360×640 到 932×430 都不用捲就看得到出發鈕(上面已量 dock 在視窗內);再多量一次「一捲到底前就在視窗內」
      const vis = await page.evaluate(() => { const b = document.querySelector('#modal-content .z2c-dock .pixel-button').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
      if (!vis) fix(`${tag}: 出發鈕不在視窗內`);
    }
    if (!FULL.has(name)) { await L.act(page, 'close'); await page.waitForTimeout(200); continue; }
    // 真的出發
    await tap(page, `#modal-content .z2c-dock button[data-action=${btn}]`, touch);
    await page.waitForTimeout(500);
    const on = await page.evaluate(a => !!globalThis.__mistvaleGame.state[a].active, act);
    if (!on) fix(`${tag} ${act}: 按出發後沒有開始`);
    if (act === 'dungeon') {
      const run = await L.ev(page, (L) => { const c = document.querySelector('#modal-content'), x = c.querySelector('[data-action=dgRetreat]'), au = c.querySelector('[data-action=dgAuto]'); return { cv: !!c.querySelector('#dungeon-strip'), x: x ? L.R(x) : null, hit: x ? L.hit(x) : false, au: au ? L.R(au) : null }; });
      if (!run.cv) fix(`${tag} dungeon: 進行中面板沒有戰鬥條 canvas`);
      if (!run.x || run.x.h < min - .5 || !run.hit) fix(`${tag} dungeon: 面板內撤退鈕太小或被蓋住 ${JSON.stringify(run.x)}`);
      // 結算 1:撤退 → 結算視窗(撤退)
      await tick(page, 2); await tap(page, '#modal-content [data-action=dgRetreat]', touch);
      if (!(await until(page, () => document.querySelector('#modal')?.dataset.type === 'result', 20))) fix(`${tag} dungeon: 撤退後沒有跳結算視窗`);
      else { const rs = await resultInfo(page); chkResult(`${tag} 地下城撤退`, rs, /撤退/); await tap(page, '#modal-foot [data-action=resultOk]', touch); const t = await modalType(page); if (t !== 'dungeon') fix(`${tag}: 結算按下後應回地下城面板,實際 ${t}`); }
      // 結算 2:全員秒殺 → 勝利
      await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const h of g.state.hunters) { h.attack = 999; h.hp = h.maxHp = Math.max(h.maxHp, 400); } g.state.dungeon.cooldown = 0; });
      await L.act(page, 'dgAuto'); await page.waitForTimeout(100);
      const ids2 = await page.evaluate(() => globalThis.__mistvaleGame.state.dungeon.hunterIds); if (ids2.length !== 3) fix(`${tag}: 小隊被清空了`);
      await L.act(page, 'startDungeon'); await page.waitForTimeout(400);
      await page.evaluate(() => { globalThis.__mistvaleGame.setDungeonAuto?.(false); });
      if (!(await until(page, () => document.querySelector('#modal')?.dataset.type === 'result', 80))) fix(`${tag} dungeon: 通關後沒有跳結算視窗`);
      else { const rs = await resultInfo(page); chkResult(`${tag} 地下城勝利`, rs, /勝利/); if (rs.cells.every(c => c.nil)) fix(`${tag}: 勝利結算的獎勵格全是 0`); await tap(page, '#modal-foot [data-action=resultOk]', touch); }
      // 結算 3:打不過 → 落敗
      await page.evaluate(() => { const g = globalThis.__mistvaleGame, d = g.state.dungeon; d.bestFloor = 60; d.startFloor = 61; d.cooldown = 0; for (const h of g.state.hunters) { h.attack = 1; h.hp = 30; h.maxHp = 30; } });
      await L.act(page, 'startDungeon'); await page.waitForTimeout(400);
      if (!(await until(page, () => document.querySelector('#modal')?.dataset.type === 'result', 120))) fix(`${tag} dungeon: 失敗後沒有跳結算視窗`);
      else { const rs = await resultInfo(page); chkResult(`${tag} 地下城落敗`, rs, /落敗/); await tap(page, '#modal-foot [data-action=resultOk]', touch); }
      await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.cheat('heal'); const d = g.state.dungeon; d.bestFloor = 3; d.startFloor = 0; d.cooldown = 0; d.hunterIds = []; g.state.arena.cooldown = 0; for (const h of g.state.hunters) { h.attack = 30; h.maxHp = Math.max(h.maxHp, 200); h.hp = h.maxHp; h.task = null; h.reviveTimer = 0; } });
    } else {
      // 競技場進行中:面板內有對手血條與三人血條
      const live = await L.ev(page, (L) => { const b = document.querySelector('#ar-live'); return b ? { foe: !!b.querySelector('#ar-foe-fill'), rows: b.querySelectorAll('.z2c-bar-row[data-hid]').length, w: Math.round(parseFloat(b.querySelector('#ar-foe-fill')?.style.width || '0')), txt: document.querySelector('#ar-foe-num')?.textContent || '' } : null; });
      if (!live) fix(`${tag} arena: 開始後面板內沒有進行中狀態 #ar-live`); else { if (!live.foe || live.rows !== 3) fix(`${tag} arena: 進行中應有對手血條＋3 位獵人血條 ${JSON.stringify(live)}`); if (!/\d+\/\d+/.test(live.txt)) fix(`${tag} arena: 對手血量沒有數字 ${live.txt}`); }
      await page.evaluate(() => { for (const h of globalThis.__mistvaleGame.state.hunters) h.attack = 999; });
      if (!(await until(page, () => document.querySelector('#modal')?.dataset.type === 'result', 120))) fix(`${tag} arena: 結束後沒有跳結算視窗`);
      else { const rs = await resultInfo(page); chkResult(`${tag} 競技場`, rs, /勝利|落敗/); await tap(page, '#modal-foot [data-action=resultOk]', touch); }
    }
    await L.act(page, 'close'); await page.waitForTimeout(200);
  }
  if (!FULL.has(name)) { if (errs.length) fix(`${tag}: console/page error ${errs[0]}`); await ctx.close(); return; }

  // ── 4 離線戰報
  await page.evaluate(() => globalThis.__mistvaleShowOffline()); await page.waitForTimeout(400);
  const of = await L.ev(page, (L) => { const m = document.querySelector('#modal'), f = document.querySelector('#modal-foot'), t = m.querySelector('.modal-title');
    const bef = getComputedStyle(t, '::before').content; return { type: m.dataset.type, tiles: m.querySelectorAll('.of-tile').length, hu: m.querySelectorAll('.of-hu').length, wd: m.querySelectorAll('.of-wd').length, foot: [...f.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), z: b.dataset.zbr, r: L.R(b) })), ribbon: bef && bef !== 'none' && bef !== 'normal', title: t.textContent.trim(), over: m.scrollWidth > m.clientWidth + 2 }; });
  if (of.type !== 'offline') fix(`${tag}: 離線戰報沒開(${of.type})`);
  else {
    if (of.tiles !== 3) fix(`${tag} 離線戰報: 摘要格 ${of.tiles} ≠ 3`);
    if (of.hu !== 1 || of.wd !== 1) fix(`${tag} 離線戰報: 「你的獵人／流浪英雄」應各一列(${of.hu}/${of.wd})`);
    if (of.foot.length !== 1 || !/收下/.test(of.foot[0].t) || of.foot[0].z !== 'olive') fix(`${tag} 離線戰報: 底部應只有一顆橄欖綠「收下」${JSON.stringify(of.foot)}`);
    else if (of.foot[0].r.h < min - .5) fix(`${tag} 離線戰報: 收下鈕高 ${of.foot[0].r.h}`);
    if (!of.ribbon) fix(`${tag} 離線戰報: 標題沒有緞帶記號(::before)`);
    if (of.over) fix(`${tag} 離線戰報: 水平溢出`);
    await tap(page, '#modal-foot [data-action=offlineOk]', touch); if (await modalType(page)) fix(`${tag} 離線戰報: 按收下沒有關閉`);
  }

  // ── 5 首領
  await open(page, 'boss');
  const bp = await page.evaluate(() => document.querySelector('#modal-content').textContent);
  if (/森林魔王|暮林領主/.test(bp)) fix(`${tag} 首領面板還有舊名字`);
  await tap(page, '#modal-foot [data-action=bossAsk]', touch);
  let bc = await L.ev(page, (L) => { const m = document.querySelector('#modal'), f = document.querySelector('#modal-foot'); return { type: m.dataset.type, name: m.querySelector('.z2c-bc-name')?.textContent, list: m.querySelector('.z2c-bc-list')?.textContent.replace(/\s+/g, ' '), v: m.querySelector('.z2c-bc-list .z2c-v')?.textContent, foot: [...f.querySelectorAll('button')].map(b => ({ a: b.dataset.action, z: b.dataset.zbr, t: b.textContent.trim(), h: L.R(b).h })) }; });
  if (bc.type !== 'bossconfirm') fix(`${tag}: 按召喚沒有先跳確認(${bc.type})`);
  else {
    if (bc.name !== '森林領主') fix(`${tag}: 確認窗首領名是「${bc.name}」`);
    if (!/血量/.test(bc.list) || !/我方總攻擊/.test(bc.list) || !/預估/.test(bc.list) || !/\d/.test(bc.list)) fix(`${tag}: 確認窗缺血量/我方總攻擊/預估 — ${bc.list}`);
    if (!['輕鬆', '可行', '危險'].includes(bc.v)) fix(`${tag}: 預估判定不是 輕鬆/可行/危險 — ${bc.v}`);
    const go = bc.foot.find(b => b.a === 'startBoss'), no = bc.foot.find(b => b.a === 'bossBack');
    if (!go || go.z !== 'olive' || !/召喚/.test(go.t)) fix(`${tag}: 「召喚」應為橄欖綠 ${JSON.stringify(bc.foot)}`);
    if (!no || no.z !== 'red' || !/取消/.test(no.t)) fix(`${tag}: 「取消」應為紅色 ${JSON.stringify(bc.foot)}`);
    for (const b of bc.foot) if (b.h < min - .5) fix(`${tag}: 確認窗按鈕高 ${b.h}`);
    await tap(page, '#modal-foot [data-action=bossBack]', touch);
    if ((await modalType(page)) !== 'boss') fix(`${tag}: 取消後應回首領面板`);
    await tap(page, '#modal-foot [data-action=bossAsk]', touch);
    await tap(page, '#modal-foot [data-action=startBoss]', touch);
  }
  await page.waitForTimeout(600);
  const boss = await L.ev(page, (L) => { const e = document.querySelector('#boss-bar'); if (!e || e.classList.contains('hidden')) return null; const r = L.R(e), over = [];
    for (const s of ['.hv-actions', '.view-tools', '#hv-left', '#topbar .hv-tl', '#topbar .hv-tr', '#run-hud']) { const o = document.querySelector(s); if (o && L.vis(o)) { const n = L.inter(r, L.R(o)); if (n > 0) over.push(s + ':' + n); } }
    for (const b of document.querySelectorAll('#topbar button,.hv-actions button,.view-tools button,#bottom-bar button')) { if (!L.vis(b)) continue; const n = L.inter(r, L.R(b)); if (n > 0) over.push(L.name(b) + ':' + n); }
    return { r, name: e.querySelector('strong')?.textContent, time: e.querySelector('.z2c-bt')?.textContent, hp: e.querySelector('#boss-hp')?.textContent, state: e.querySelector('.z2c-bs')?.textContent, over, inView: r.l >= 0 && r.r <= innerWidth && r.t >= 0 && r.b <= innerHeight }; });
  if (!boss) fix(`${tag}: 召喚後 HUD 沒有首領血條`);
  else {
    if (boss.name !== '森林領主') fix(`${tag}: 血條首領名「${boss.name}」`);
    if (!/^\d+:\d\d$/.test(boss.time || '')) fix(`${tag}: 血條沒有剩餘時間 m:ss — ${boss.time}`);
    if (!/\d/.test(boss.hp || '')) fix(`${tag}: 血條沒有血量數字`);
    if (!/進行中/.test(boss.state || '')) fix(`${tag}: 血條沒有「進行中」`);
    if (!boss.inView) fix(`${tag}: 血條超出視窗 ${JSON.stringify(boss.r)}`);
    if (boss.over.length) fix(`${tag}: 首領血條蓋到 ${boss.over.join(', ')}`);
  }
  const names = await page.evaluate(() => { const g = globalThis.__mistvaleGame; return [document.body.innerText, ...(g.state.log || []).map(x => x.text || x.msg || String(x))].join('\n'); });
  if (/森林魔王|暮林領主/.test(names)) fix(`${tag}: 召喚後畫面/紀錄還有「森林魔王／暮林領主」`);
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.state.expedition.active = false; g.state.enemies = g.state.enemies.filter(e => e.type !== 'boss'); g.state.expedition.cooldown = 0; });
  await page.waitForTimeout(300);

  // ── 6 世界地圖
  await open(page, 'worldmap');
  const wm = await L.ev(page, (L) => { const c = document.querySelector('#modal-content'), cv = c.querySelector('#world-map-canvas'), rows = c.querySelector('.z2c-rows'); if (!cv || !rows) return { none: true };
    const r0 = L.R(cv), cr = L.R(c); rows.scrollTop = 120; const r1 = L.R(cv);
    return { canvas: r0, moved: Math.abs(r1.t - r0.t) > .5, cw: cv.width, ch: cv.height, contentScroll: c.scrollHeight - c.clientHeight, contentTop: cr.t, rowN: rows.querySelectorAll('.z2c-row').length,
      verdicts: [...rows.querySelectorAll('.z2c-row')].map(r => r.querySelector('.z2c-v')?.textContent), go: [...rows.querySelectorAll('.z2c-go')].map(b => ({ t: b.textContent.trim(), h: L.R(b).h, w: L.R(b).w, z: b.dataset.zbr })), over: c.scrollWidth > c.clientWidth + 2,
      rowsRect: L.R(rows), modal: L.R(document.querySelector('#modal')) }; });
  if (wm.none) fix(`${tag}: 世界地圖沒有 #world-map-canvas／.z2c-rows`);
  else {
    if (wm.moved) fix(`${tag}: 區域列捲動時小地圖跟著動(沒有固定在頂端)`);
    if (wm.contentScroll > 2) fix(`${tag}: 世界地圖視窗內容整體還在捲(${wm.contentScroll}px)`);
    if (Math.abs(wm.cw - wm.canvas.w) > 2 || Math.abs(wm.ch - wm.canvas.h) > 2) fix(`${tag}: R4 小地圖畫布像素 ${wm.cw}×${wm.ch} ≠ 顯示 ${wm.canvas.w}×${wm.canvas.h}(字會被縮放看不清)`);
    if (wm.canvas.h < 100 || wm.canvas.w < 100) fix(`${tag}: 小地圖太小 ${wm.canvas.w}×${wm.canvas.h}`);
    if (wm.canvas.b > wm.modal.b) fix(`${tag}: 小地圖超出視窗`);
    if (wm.rowN < 8) fix(`${tag}: 區域列只有 ${wm.rowN}`);
    if (wm.verdicts.filter(x => ['輕鬆', '可行', '危險'].includes(x)).length < 7) fix(`${tag}: 野外區域列缺判定標籤 ${wm.verdicts}`);
    if (wm.go.some(b => b.h < min - .5)) fix(`${tag}: 「前往」鈕高 ${wm.go.map(b => b.h)} < ${min}`);
    if (wm.go.slice(1).some(b => b.z !== 'gold')) fix(`${tag}: 「前往」應為金棕 ${wm.go.map(b => b.z)}`);
    if (wm.over) fix(`${tag}: 世界地圖水平溢出`);
    // 點行展開
    await page.evaluate(() => { document.querySelector('#modal-content .z2c-rows').scrollTop = 0; });
    const ex = await page.evaluate(() => { const rows = [...document.querySelectorAll('#modal-content .z2c-row')], r = rows[1]; r.querySelector('.z2c-row-main').click(); return { open: r.classList.contains('open'), more: r.querySelector('.z2c-more').getBoundingClientRect().height }; });
    if (!ex.open || ex.more < 10) fix(`${tag}: 點區域列沒有展開 ${JSON.stringify(ex)}`);
    // 前往
    const before = await page.evaluate(() => globalThis.__mistvaleGame.state.region);
    await page.evaluate(() => { document.querySelector('#modal-content .z2c-rows').scrollTop = 0; });
    await tap(page, '#modal-content .z2c-row:nth-child(3) .z2c-go', touch); await page.waitForTimeout(1500);
    const after = await page.evaluate(() => globalThis.__mistvaleGame.state.region);
    if (after === before && (await modalType(page)) === 'worldmap') fix(`${tag}: 按「前往」沒有生效(region ${before})`);
    if (await modalType(page)) { await L.act(page, 'close'); await page.waitForTimeout(200); }
  }

  // ── 7 派遣
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.cheat('heal'); for (const h of g.state.hunters) { h.level = 1; h.attack = 5; h.defense = 0; h.task = null; } });
  await open(page, 'dispatchHunters'); await L.act(page, 'dispatchRegion', 'mountain'); await page.waitForTimeout(300);
  const dp = await L.ev(page, (L) => { const c = document.querySelector('#modal-content'), picks = [...c.querySelectorAll('.region-pick')], go = c.querySelector('[data-action=startDispatch]'); return { n: picks.length, tags: picks.map(p => p.querySelector('.z2c-v')?.textContent || ''), go: go?.textContent.trim(), dis: go?.disabled }; });
  if (dp.n < 7 || dp.tags.some(t => !['輕鬆', '可行', '危險'].includes(t))) fix(`${tag}: 派遣區域列沒有都顯示判定標籤 ${dp.tags}`);
  if (!/派遣（危險）/.test(dp.go || '')) fix(`${tag}: 選到危險區時按鈕應寫「派遣（危險）」— ${dp.go}`);
  await L.act(page, 'startDispatch'); await page.waitForTimeout(400);
  const cf = await L.ev(page, (L) => { const m = document.querySelector('#modal'); return { type: m.dataset.type, txt: m.querySelector('#modal-content')?.textContent || '', foot: [...document.querySelectorAll('#modal-foot button')].map(b => ({ a: b.dataset.action, t: b.textContent.trim(), z: b.dataset.zbr })) }; });
  if (cf.type !== 'confirm' || !/危險/.test(cf.txt)) fix(`${tag}: 危險區派遣沒有跳確認 ${cf.type}`);
  else {
    const y = cf.foot.find(b => b.a === 'confirmYes'); if (!y || !/派遣（危險）/.test(y.t)) fix(`${tag}: 確認鈕應寫「派遣（危險）」${JSON.stringify(cf.foot)}`);
    await L.act(page, 'confirmNo'); await page.waitForTimeout(300); if ((await modalType(page)) !== 'dispatch') fix(`${tag}: 取消後應回派遣面板`);
    await L.act(page, 'startDispatch'); await page.waitForTimeout(300); await L.act(page, 'confirmYes'); await page.waitForTimeout(500);
    const sent = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters.some(h => h.huntRegion === 'mountain' || h.task === 'hunt' || h.rallying));
    if (!sent) fix(`${tag}: 確認派遣後沒有人出發`);
  }
  if (await modalType(page)) { await L.act(page, 'close'); await page.waitForTimeout(200); }
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.recallHunters?.(); g.cheat('heal'); for (const h of g.state.hunters) { h.level = 10; h.attack = 30; h.defense = 5; h.task = null; h.huntRegion = null; } });

  // ── 8 出征 HUD
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; g.cheat('heal'); const d = g.state.dungeon; d.cooldown = 0; g.startDungeon(g.state.hunters.filter(h => h.hp > 0).slice(0, 3).map(h => h.id)); });
  await page.waitForTimeout(900);
  if (await modalType(page)) { await L.act(page, 'close'); await page.waitForTimeout(300); }
  const hud = await L.ev(page, (L) => { const q = s => document.querySelector(s), h = q('#run-hud'); if (!h) return { none: true }; const hr = L.R(h), over = [];
    for (const s of ['#hv-left', '#hv-quest', '#hv-advisor', '.hv-actions', '.view-tools']) { const e = q(s); if (e && L.vis(e)) { const o = L.inter(hr, L.R(e)); if (o > 0) over.push(s + ':' + o); } }
    for (const b of document.querySelectorAll('.hv-actions button,.view-tools button,#topbar button,#bottom-bar button,.hv-act')) { if (!L.vis(b)) continue; const o = L.inter(hr, L.R(b)); if (o > 0) over.push(L.name(b) + ':' + o); }
    const x = q('#run-hud .rh-x'); return { hr, over, x: x ? { r: L.R(x), hit: L.hit(x) } : null, inView: hr.l >= 0 && hr.r <= innerWidth && hr.t >= 0 && hr.b <= innerHeight }; });
  if (hud.none) fix(`${tag}: 出征中沒有 #run-hud`);
  else {
    if (hud.over.length) fix(`${tag}: R1 #run-hud 蓋到 ${hud.over.join(', ')}`);
    if (!hud.inView) fix(`${tag}: #run-hud 超出視窗 ${JSON.stringify(hud.hr)}`);
    if (!hud.x || !hud.x.hit || hud.x.r.h < min - .5) fix(`${tag}: 撤退鈕高 ${hud.x?.r.h}px < ${min}px 或被蓋住`);
  }
  if (!hud.none && hud.x) {
    await tap(page, '#run-hud .rh-x', touch); await page.waitForTimeout(400);
    const still = await page.evaluate(() => !!globalThis.__mistvaleGame.state.dungeon.active);
    if (still) fix(`${tag}: 點 HUD 撤退後地下城仍在進行`);
    await until(page, () => document.querySelector('#modal')?.dataset.type === 'result', 10);
    if ((await modalType(page)) === 'result') { await L.act(page, 'resultOk'); await page.waitForTimeout(200); }
  }
  if (errs.length) fix(`${tag}: console/page error ${errs[0]}`);
  console.log(tag, 'done', JSON.stringify({ hudBtn: hud.x?.r.h, map: wm.canvas && [wm.canvas.w, wm.canvas.h], boss: boss && boss.r && [boss.r.l, boss.r.t, boss.r.r, boss.r.b].map(Math.round) }));
  await ctx.close();
}
async function resultInfo(page) {
  return L.ev(page, (L) => { const m = document.querySelector('#modal'), f = document.querySelector('#modal-foot'), t = m.querySelector('.modal-title h2'), bef = getComputedStyle(m.querySelector('.modal-title'), '::before').content;
    return { title: t?.textContent.trim(), line: m.querySelector('.z2c-rline')?.textContent || '', cells: [...m.querySelectorAll('.z2c-cell')].map(c => ({ name: c.querySelector('small')?.textContent, v: c.querySelector('b')?.textContent, nil: c.classList.contains('nil') })),
      foot: [...f.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), z: b.dataset.zbr, h: L.R(b).h })), ribbon: bef && bef !== 'none' && bef !== 'normal', over: m.scrollWidth > m.clientWidth + 2, mode: m.dataset.mode }; });
}
function chkResult(tag, rs, titleRe) {
  if (!titleRe.test(rs.title || '')) fix(`${tag}: 結算標題是「${rs.title}」`);
  if (rs.mode !== 'C') fix(`${tag}: 結算不是 C 視窗(${rs.mode})`);
  if (!rs.line) fix(`${tag}: 結算缺一行說明`);
  if (rs.cells.length !== 3) fix(`${tag}: 獎勵格 ${rs.cells.length} ≠ 3`);
  if (rs.cells.some(c => !c.name)) fix(`${tag}: 獎勵格缺名稱`);
  if (rs.foot.length !== 1) fix(`${tag}: 底部應只有一顆鈕,實際 ${rs.foot.length}`);
  else if (rs.foot[0].z !== 'olive') fix(`${tag}: 底部鈕應為橄欖綠,實際 ${rs.foot[0].z}`);
  if (!rs.ribbon) fix(`${tag}: 標題沒有緞帶記號`);
  if (rs.over) fix(`${tag}: 結算視窗水平溢出`);
}
for (const n of names) { if (!ALL[n]) { console.log('skip unknown view', n); continue; } try { await runView(n, ALL[n]); } catch (e) { fix(`${n}: 例外 ${String(e.message).split('\n')[0].slice(0, 200)}`); } }
await browser.close(); srv.stop();
if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log('PASS z2c-battle: 未解鎖引導、固定出發列、結算視窗、競技場進行中、離線戰報、首領確認與血條、世界地圖、派遣判定、出征 HUD 在 6 種尺寸都符合');
