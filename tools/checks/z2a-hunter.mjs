// z2a-hunter.mjs — Z2A(2026-11-12 圖鑑 v2 的 f、g、i、j 節與決定 C1、C2):獵人相關畫面的內容。每一項都是「改回舊行為就會紅」。
//   視窗:390×844(mobile+touch)、1440×900、844×390(mobile+touch)、360×640(mobile+touch)。
//   A. 獵人卡(C 視窗 #modal[data-type=hunter]):標題＝獵人名;星級＋「轉世」、個人金幣膠囊、裝備環(武器、護甲 2 格＋3 個暫空位)、經驗條(置中白字)、圖示子頁籤(資訊／技能／裝備／轉世)、
//      資訊頁的稀有度字＋「等級.n 職業」＋每秒攻擊力、四條狀態條(紅／橘／綠／藍、條上白字 ≥12px)、右欄數值行(橘數值);主要資訊一屏可見(不被捲動區蓋掉)、熱區 ≥44(觸控)、無互蓋、字 ≥12、換子頁籤視窗高度不變。
//   B. 現有動作都還能做:修煉(底部橄欖綠,與紅色關閉並排)、學習技能／強化裝備／轉世(各在子頁籤清單列,金棕小鈕;條件不足＝灰＋鎖頭、點了不生效)。
//   C. 名冊(A 抽屜):稀有度字在卡頂、稀有度邊框與漸層底、名字在立繪下方、右上金色小「i」(≥44 熱區、打得開獵人卡)、定位鈕還在、手機 4 欄／桌機 6 欄;標題列子頁籤「名冊｜招募」,招募清單完整。
//   D. 新獵人暗帶(D):旅人提示 → 「新的獵人！」斜體標題、最多 2 張稀有度立繪卡(選中的放大約 1.4 倍、點選切換)、一行說明、邀請(橄欖綠)＋稍後(紅);邀請真的加入獵人並扣款、稍後不再自動彈;
//      新旅人「到」的時候(閒著、付得起)自動彈出,面板開著時不彈;「看全部旅人」進名冊的招募清單。
//   E. tooltip:點(觸控)／hover(滑鼠)／鍵盤焦點裝備格出現迷你視窗(品級色名稱、圖示格、數值列、藍／紅／金條列),點別處與 Esc 關閉(Esc 先關 tooltip 再關視窗);共用元件 __mistvaleTip 給任何 data-tip 元素用。
//   F. 名字(UX #15):流浪英雄與村裡獵人不同名(開局、之後招募、之後多一位流浪英雄都一樣)。
//   G. 頁面沒有 console／page error。
//   用法:node tools/checks/z2a-hunter.mjs(TARGET 空＝自己開臨時伺服器;TARGET=別台可量修前版本)。SHOTS_DIR=資料夾 會存截圖。
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
const srv = await L.startServer(); const browser = await L.launch();
const fails = [], oks = []; const fix = m => fails.push(m), ok = m => oks.push(m);
const SHOTS = process.env.SHOTS_DIR || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const url = srv.url + (srv.url.includes('?') ? '' : '?preview=1');
const VIEWS = { phone: { w: 390, h: 844, mobile: true }, desktop: { w: 1440, h: 900 }, land: { w: 844, h: 390, mobile: true }, small: { w: 360, h: 640, mobile: true } };
const only = (process.env.VIEWS || Object.keys(VIEWS).join(',')).split(',');
const settle = async (page, ms = 400) => { await page.waitForTimeout(ms); await page.waitForFunction(() => { const m = document.querySelector('#modal'); return !m || m.getAnimations().length === 0; }, null, { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(60); };
const RGB = { olive: 'rgb(88, 104, 16)', red: 'rgb(141, 57, 37)', gold: 'rgb(144, 104, 24)', gray: 'rgb(80, 80, 80)', hp: 'rgb(240, 104, 72)', sat: 'rgb(248, 176, 96)', sta: 'rgb(120, 192, 112)', mood: 'rgb(64, 136, 200)', orange: 'rgb(248, 152, 48)', superior: 'rgb(108, 174, 238)', pos: 'rgb(95, 144, 198)', neg: 'rgb(240, 88, 88)', note: 'rgb(222, 198, 138)' };

const LIB = () => {
  const R = e => { if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const vis = e => { if (!e) return false; const q = e.getBoundingClientRect(); if (q.width < 1 || q.height < 1) return false; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || p.hidden || p.classList?.contains('hidden')) return false; } return true; };
  const inter = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5;
  const hitsSelf = e => { const q = e.getBoundingClientRect(); const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!t && (t === e || e.contains(t)); };
  const act = (a, id, extra) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; if (extra) Object.assign(el.dataset, extra); el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const G = () => globalThis.__mistvaleGame;
  const click = e => e.click();
  return { R, vis, inter, hitsSelf, act, wait, G, click };
};
const ev = (page, fn, arg) => page.evaluate(`(async()=>{const P=(${LIB.toString()})();const f=${fn.toString()};return await f(P,${JSON.stringify(arg ?? null)});})()`);
const closeAll = async page => { await page.evaluate(() => { const bd = document.querySelector('#modal-backdrop:not(.hidden)'); if (bd) { (document.querySelector('#modal [data-action=close]') || document.querySelector('#modal-foot [data-action=close]'))?.click(); } if (document.querySelector('#modal-backdrop:not(.hidden)')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await settle(page, 250); };

for (const name of only) {
  const v = VIEWS[name]; if (!v) continue;
  const touch = !!v.mobile, landscape = v.h <= 520, shortPortrait = !landscape && v.w <= 760 && v.h <= 700, label = `${name}(${v.w}×${v.h})`;
  const ctx = await L.newCtx(browser, v); const page = await ctx.newPage();
  try {
    const errs = []; page.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 160))); page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
    await L.boot(page, url);
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'heal']) g.cheat(k); g.state.paused = true; });

    // ═══ A. 獵人卡 ═══
    await page.evaluate(() => { const g = globalThis.__mistvaleGame, h = g.state.hunters[0]; h.gold = 500; h.trainCooldown = 0; h.skillLevel = 0; h.weaponLevel = 0; h.equipment.weapon = false; h.level = 3; h.xp = 10; });
    const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id);
    await L.act(page, 'hunter', hid); await settle(page);
    const A = await ev(page, (P) => {
      const m = document.querySelector('#modal'), g = P.G(), h = g.state.hunters[0], hc = document.querySelector('.z2-hc');
      if (!hc) return { noCard: true, type: m.dataset.type, mode: m.dataset.mode, html: document.querySelector('#modal-content').innerHTML.slice(0, 120) };
      const mr = P.R(m), panel = document.querySelector('.z2-panel'), pr = P.R(panel);
      const out = { type: m.dataset.type, mode: m.dataset.mode, title: document.querySelector('#modal-title').textContent, name: h.name, mr, vw: innerWidth, vh: innerHeight };
      out.stars = hc.querySelectorAll('.z2-stars i').length; out.rb = hc.querySelector('.z2-rb')?.textContent || ''; out.gold = hc.querySelector('.z2-gold b')?.textContent || ''; out.goldWant = Math.floor(h.gold).toLocaleString('en-US');
      const slots = [...hc.querySelectorAll('.z2-slot')]; out.slots = slots.length; out.slotBtns = slots.filter(s => s.tagName === 'BUTTON').length; out.ghosts = slots.filter(s => s.classList.contains('ghost')).length;
      out.slotRects = slots.filter(s => P.vis(s)).map(s => P.R(s)); out.ghostVis = slots.filter(s => s.classList.contains('ghost') && P.vis(s)).length;
      out.openBorder = getComputedStyle(hc.querySelector('.z2-slot.s-w')).borderTopColor; out.fig = !!hc.querySelector('.z2-fig')?.src;
      const xp = hc.querySelector('.z2-xp'); out.xpText = xp?.querySelector('b')?.textContent || ''; out.xpAlign = xp ? getComputedStyle(xp.querySelector('b')).textAlign : ''; out.xpColor = xp ? getComputedStyle(xp.querySelector('b')).color : ''; out.xpRole = xp?.getAttribute('role');
      out.tabs = [...hc.querySelectorAll('.z2-tab')].map(t => ({ label: t.textContent.trim(), on: t.classList.contains('on'), r: P.R(t), sel: t.getAttribute('aria-selected') }));
      out.rar = hc.querySelector('.z2-rar')?.textContent || ''; out.cls = hc.querySelector('.z2-cls')?.textContent.trim() || ''; out.dps = hc.querySelector('.z2-dps b')?.textContent || ''; out.dpsLabel = hc.querySelector('.z2-dps small')?.textContent || '';
      out.bars = [...hc.querySelectorAll('.z2-bar')].map(b => ({ kind: b.className.replace('z2-bar ', ''), fill: getComputedStyle(b.querySelector('.z2-bar-fill')).backgroundColor, text: b.querySelector('b').textContent, tc: getComputedStyle(b.querySelector('b')).color, fs: parseFloat(getComputedStyle(b.querySelector('b')).fontSize), r: P.R(b), box: P.R(b.querySelector('.z2-bar-box')) }));
      out.vals = [...hc.querySelectorAll('.z2-val')].map(r => ({ label: r.querySelector(':scope>span').textContent, v: r.querySelector('b').textContent, vc: getComputedStyle(r.querySelector('b')).color, r: P.R(r), vis: P.vis(r) }));
      out.panel = pr; out.ring = P.R(hc.querySelector('.z2-ring')); out.xpR = P.R(xp); out.tabsR = P.R(hc.querySelector('.z2-tabs'));
      out.bad = (() => { const e = hc.querySelector('.z2-val'), o = []; for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || p.hidden || p.classList?.contains('hidden')) o.push([p.tagName, p.id, String(p.className), cs.display, cs.visibility, cs.opacity, p.hidden]); } return o; })(); out.attack = h.attack; out.defense = h.defense;
      // 字 ≥12
      const small = []; for (const e of m.querySelectorAll('*')) { if (!P.vis(e)) continue; const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!own) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11.95) small.push((e.className || e.tagName) + ':' + fs); }
      out.small = small.slice(0, 5);
      // 互蓋與熱區
      const btns = [...m.querySelectorAll('button'), ...document.querySelectorAll('#modal-foot button')].filter(b => P.vis(b)); const seen = new Set(); const bl = btns.filter(b => !seen.has(b) && seen.add(b));
      out.btnN = bl.length; out.tiny = bl.filter(b => { const q = b.getBoundingClientRect(); return q.width < 43.5 || q.height < 43.5; }).map(b => (b.className || b.dataset.action) + ':' + Math.round(b.getBoundingClientRect().width) + '×' + Math.round(b.getBoundingClientRect().height));
      out.overlap = []; for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) if (!bl[i].contains(bl[j]) && !bl[j].contains(bl[i]) && P.inter(P.R(bl[i]), P.R(bl[j]))) out.overlap.push((bl[i].className || bl[i].dataset.action) + '×' + (bl[j].className || bl[j].dataset.action));
      out.notHit = bl.filter(b => !P.hitsSelf(b)).map(b => b.className || b.dataset.action);
      const foot = document.querySelector('#modal-foot'); out.foot = [...foot.querySelectorAll('button')].map(b => ({ a: b.dataset.action, t: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor, r: P.R(b), foot: b.dataset.foot || '' })); out.footR = P.R(foot);
      out.bar = P.R(document.querySelector('#bottom-bar')); out.oldClass = !!document.querySelector('.hunter-actions,.hv-act-main,.detail-avatar');
      return out;
    });
    if (process.env.DBG) console.error(JSON.stringify({bad:A.bad,ghostVis:A.ghostVis,slots:A.slotRects}));
    if (A.noCard) fix(`${label} 獵人卡：沒有 .z2-hc(type=${A.type} mode=${A.mode})${A.html ? ' ' + A.html.slice(0, 60) : ''}`);
    else {
      if (A.mode !== 'C' || A.type !== 'hunter') fix(`${label} 獵人卡：視窗模式 ${A.mode}／type ${A.type}，應為 C／hunter`);
      if (A.title !== A.name) fix(`${label} 獵人卡：標題「${A.title}」應為獵人名字「${A.name}」`);
      if (A.stars !== 5 || !/^轉世/.test(A.rb)) fix(`${label} 獵人卡：星級 ${A.stars} 顆、標籤「${A.rb}」(應 5 顆＋「轉世 n」)`);
      if (A.gold !== A.goldWant) fix(`${label} 獵人卡：個人金幣膠囊「${A.gold}」≠ ${A.goldWant}`);
      if (A.slots !== 7 || A.slotBtns !== 7 || A.ghosts !== 0) fix(`${label} 獵人卡：裝備環 ${A.slots} 格(按鈕 ${A.slotBtns}、暫空 ${A.ghosts})，應 7＝武器＋六件防具(頭盔／胸甲／腰帶／腿甲／靴子／手套)`);
      if (!landscape && !shortPortrait && A.ghostVis !== 0) fix(`${label} 獵人卡：暫空位不該再出現(看到 ${A.ghostVis} 個)`);
      if (A.openBorder !== 'rgb(228, 192, 238)') fix(`${label} 獵人卡：還能裝備的武器格邊框 ${A.openBorder}，應為紫框 #e4c0ee`);
      if (!A.fig) fix(`${label} 獵人卡：沒有立繪`);
      if (A.xpAlign !== 'center' || A.xpColor !== 'rgb(255, 255, 255)' || !/經驗值 \d+\/\d+/.test(A.xpText) || A.xpRole !== 'progressbar') fix(`${label} 獵人卡：經驗條「${A.xpText}」對齊 ${A.xpAlign} 色 ${A.xpColor}`);
      const tl = A.tabs.map(t => t.label).join('|'); if (!/資訊/.test(tl) || !/技能/.test(tl) || !/裝備/.test(tl) || A.tabs.length < 3) fix(`${label} 獵人卡：子頁籤 ${tl}(至少 資訊／技能／裝備)`);
      if (A.tabs.filter(t => t.on).length !== 1 || !A.tabs[0].on) fix(`${label} 獵人卡：預設應停在第一個子頁籤「資訊」`);
      if (!/普通|稀有|超級稀有|英雄|傳說/.test(A.rar) || !/^等級\.\d+/.test(A.cls)) fix(`${label} 獵人卡：稀有度字「${A.rar}」／「${A.cls}」(應 稀有度字＋「等級.n 職業」)`);
      if (!/^\d+(\.\d)?$/.test(A.dps) || A.dpsLabel !== '每秒攻擊力') fix(`${label} 獵人卡：每秒攻擊力「${A.dpsLabel}」「${A.dps}」`);
      const want = [['hp', RGB.hp, '生命'], ['satiety', RGB.sat, '飽食'], ['stamina', RGB.sta, '精力'], ['mood', RGB.mood, '心情']];
      if (A.bars.length !== 4) fix(`${label} 獵人卡：狀態條 ${A.bars.length} 條(應 4)`);
      for (const [i, [k, c, t]] of want.entries()) { const b = A.bars[i]; if (!b) continue; if (b.kind !== k || b.fill !== c || !b.text.startsWith(t) || b.tc !== 'rgb(255, 255, 255)' || b.fs < 11.95) fix(`${label} 獵人卡：第 ${i + 1} 條應為 ${t}(${c}，白字 ≥12)，實際 ${b.kind} ${b.fill} 「${b.text}」 ${b.tc} ${b.fs}px`); }
      const nVals = shortPortrait ? 4 : 5; const visVals = A.vals.filter(r => r.vis);
      if (visVals.length < nVals) fix(`${label} 獵人卡：右欄數值只看到 ${visVals.length} 行(應 ≥${nVals})`);
      if (!visVals.every(r => r.vc === RGB.orange)) fix(`${label} 獵人卡：右欄數值不是橘色 #f89830(${visVals.map(r => r.vc).join(',')})`);
      if (+A.vals[0]?.v !== A.attack || +A.vals[1]?.v !== A.defense) fix(`${label} 獵人卡：攻擊／防禦數值 ${A.vals[0]?.v}/${A.vals[1]?.v} ≠ ${A.attack}/${A.defense}`);
      // 一屏
      const inView = r => r.l >= -0.5 && r.r <= A.vw + 0.5 && r.t >= -0.5 && r.b <= A.vh + 0.5;
      if (!inView(A.mr)) fix(`${label} 獵人卡：視窗超出畫面 ${JSON.stringify(A.mr)}`);
      if (A.footR.b > A.bar.t + 1 && !landscape) fix(`${label} 獵人卡：底部按鈕列(b=${A.footR.b})蓋到頁籤列(t=${A.bar.t})`);
      const clip = []; for (const [nm, r] of [['環', A.ring], ['經驗條', A.xpR], ['子頁籤', A.tabsR]]) if (!inView(r)) clip.push(nm); for (const b of A.bars) if (b.r.b > A.panel.b + 1 || b.r.t < A.panel.t - 1) clip.push('狀態條'); for (const r of visVals.slice(0, 4)) if (r.r.b > A.panel.b + 1) clip.push('數值');
      if (clip.length) fix(`${label} 獵人卡：主要資訊沒在一屏內(${[...new Set(clip)].join('、')} 被切掉；panel b=${Math.round(A.panel.b)})`);
      if (A.small.length) fix(`${label} 獵人卡：字級 <12px：${A.small.join(', ')}`);
      if (touch && A.tiny.length) fix(`${label} 獵人卡：觸控熱區 <44：${A.tiny.join(', ')}`);
      if (A.overlap.length) fix(`${label} 獵人卡：按鈕互蓋 ${A.overlap.join(', ')}`);
      if (A.notHit.length) fix(`${label} 獵人卡：按鈕中心被別的東西蓋住 ${A.notHit.join(', ')}`);
      const f0 = A.foot.find(b => b.a === 'train'), f1 = A.foot.find(b => b.a === 'close');
      if (!f0 || !f1 || f0.bg !== RGB.olive || f1.bg !== RGB.red || f0.foot !== 'primary') fix(`${label} 獵人卡：底部要 修煉(橄欖綠、data-foot=primary)＋關閉(紅)：${JSON.stringify(A.foot.map(b => [b.a, b.bg]))}`);
      else if (f0.r.r > f1.r.l + 0.5 || Math.abs(f0.r.t - f1.r.t) > 1) fix(`${label} 獵人卡：修煉與關閉沒有並排`);
      if (A.oldClass) fix(`${label} 獵人卡：還在用舊結構(.hunter-actions/.hv-act-main/.detail-avatar)`);
      if (!A.noCard && !fails.some(f => f.startsWith(label + ' 獵人卡'))) ok(`${label} 獵人卡：標題＝名字、星級＋轉世、金幣膠囊、裝備環 武器＋六件防具 7 格、經驗條、${A.tabs.length} 個子頁籤、四色狀態條、橘數值、底部 修煉(綠)＋關閉(紅)、一屏可見、無互蓋${touch ? '、熱區 ≥44' : ''}`);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-hunter-info.png` });

    // 換子頁籤:視窗高度不變、各頁內容在
    const T = await ev(page, async (P) => {
      const out = { h: [], seen: {} }; const m = document.querySelector('#modal');
      for (const t of ['info', 'skill', 'gear', 'rebirth']) { P.act('hunterTab', t); await P.wait(120); out.h.push(Math.round(m.getBoundingClientRect().height)); const pn = document.querySelector('.z2-panel'); out.seen[t] = { tab: document.querySelector('.z2-tab.on')?.dataset.id, rows: pn.querySelectorAll('.z2-row').length, text: pn.textContent.replace(/\s+/g, ' ').slice(0, 60), btns: [...pn.querySelectorAll('.z2-rowbtn')].map(b => ({ a: b.dataset.action, aria: b.getAttribute('aria-disabled'), bg: getComputedStyle(b).backgroundColor, r: P.R(b), lock: !!b.querySelector('.hv-lock') })), clipped: pn.scrollWidth > pn.clientWidth + 1 }; }
      P.act('hunterTab', 'info'); await P.wait(120); return out;
    });
    if (new Set(T.h).size > 1) fix(`${label} 獵人卡：換子頁籤視窗高度跳動 ${T.h.join('→')}`);
    for (const [t, act] of [['skill', 'learnSkill'], ['gear', 'enhanceHunter'], ['rebirth', 'reincarnate']]) { const s = T.seen[t]; if (s.tab !== t || !s.rows) fix(`${label} 獵人卡：子頁籤 ${t} 沒有清單列(tab=${s.tab} rows=${s.rows})`); else if (!s.btns.some(b => b.a === act)) fix(`${label} 獵人卡：子頁籤 ${t} 缺動作鈕 ${act}`); if (s.clipped) fix(`${label} 獵人卡：子頁籤 ${t} 橫向被切`); }
    if (!fails.some(f => f.startsWith(label + ' 獵人卡：換') || f.includes('子頁籤 '))) ok(`${label} 獵人卡：4 個子頁籤切換、視窗高度固定 ${T.h[0]}px、技能／裝備／轉世各有清單列＋動作鈕`);
    if (SHOTS) { for (const t of ['skill', 'gear']) { await L.act(page, 'hunterTab', t); await settle(page, 200); await page.screenshot({ path: `${SHOTS}/${name}-hunter-${t}.png` }); } await L.act(page, 'hunterTab', 'info'); await settle(page, 150); }

    // ═══ B. 動作都還能做 ═══
    const B = await ev(page, async (P) => {
      const g = P.G(), s = g.state, h = s.hunters[0], out = {}; const m = () => document.querySelector('#modal').dataset.type;
      const tab = id => { P.act('hunterTab', id); return P.wait(80); };
      // 修煉
      h.gold = 500; h.trainCooldown = 0; h.level = 3; h.xp = 0; h.hp = h.maxHp; h.task = null; const g0 = s.gold, hg0 = h.gold, lv0 = h.level;
      P.act('hunter', h.id); await P.wait(150); const tb = document.querySelector('#modal-foot [data-action=train]'); out.trainEnabled = tb && tb.getAttribute('aria-disabled') !== 'true'; tb?.click(); await P.wait(150);
      out.train = { level: h.level - lv0, hg: hg0 - h.gold, g: s.gold - g0, still: m() }; out.trainLocked = (() => { h.trainCooldown = 8; P.act('hunter', h.id); return null; })(); await P.wait(150);
      const tb2 = document.querySelector('#modal-foot [data-action=train]'); out.trainCdLocked = tb2?.getAttribute('aria-disabled') === 'true'; const cdTxt = document.querySelector('.z2-train')?.textContent || ''; out.trainCdText = /冷卻/.test(cdTxt); const lvB = h.level; tb2?.click(); await P.wait(100); out.trainCdNoEffect = h.level === lvB; h.trainCooldown = 0;
      // 學習技能
      s.gold = 5000; s.ore = 5000; h.skillLevel = 0; P.act('hunter', h.id); await P.wait(120); await tab('skill'); const g1 = s.gold; const sb = document.querySelector('.z2-rowbtn[data-action=learnSkill]'); out.skillBtn = { aria: sb?.getAttribute('aria-disabled'), bg: sb && getComputedStyle(sb).backgroundColor }; sb?.click(); await P.wait(150);
      out.skill = { lv: h.skillLevel, dg: g1 - s.gold, tab: document.querySelector('.z2-tab.on')?.dataset.id, still: m() };
      s.gold = 0; P.act('hunterTab', 'skill'); await P.wait(120); const sb2 = document.querySelector('.z2-rowbtn[data-action=learnSkill]'); out.skillLocked = { aria: sb2?.getAttribute('aria-disabled'), bg: sb2 && getComputedStyle(sb2).backgroundColor, lock: !!sb2?.querySelector('.hv-lock'), why: document.querySelector('.z2-row-w')?.textContent || '' }; const l0 = h.skillLevel; sb2?.click(); await P.wait(100); out.skillLockedNoEffect = h.skillLevel === l0; s.gold = 5000;
      // 強化裝備
      h.equipment.weapon = true; h.weaponLevel = 0; P.act('hunter', h.id); await P.wait(120); await tab('gear'); const g2 = s.gold; const eb = document.querySelector('.z2-rowbtn[data-action=enhanceHunter]'); out.enh0 = { aria: eb?.getAttribute('aria-disabled'), bg: eb && getComputedStyle(eb).backgroundColor }; eb?.click(); await P.wait(150);
      out.enh = { lv: h.weaponLevel, dg: g2 - s.gold, tab: document.querySelector('.z2-tab.on')?.dataset.id, still: m() };
      // 轉世(Lv.99 鎖、Lv.100 可)
      h.level = 99; P.act('hunter', h.id); await P.wait(120); await tab('rebirth'); const rb0 = document.querySelector('.z2-rowbtn[data-action=reincarnate]'); out.rebLocked = { aria: rb0?.getAttribute('aria-disabled'), bg: rb0 && getComputedStyle(rb0).backgroundColor, lock: !!rb0?.querySelector('.hv-lock') };
      h.level = 100; h.hp = h.maxHp; h.task = null; P.act('hunter', h.id); await P.wait(120); await tab('rebirth'); const rb = document.querySelector('.z2-rowbtn[data-action=reincarnate]'); out.rebReady = { aria: rb?.getAttribute('aria-disabled'), bg: rb && getComputedStyle(rb).backgroundColor }; const r0 = h.rebirths; rb?.click(); await P.wait(150);
      out.reb = { d: h.rebirths - r0, level: h.level, still: m(), stars: document.querySelector('.z2-rb')?.textContent };
      return out;
    });
    const bf = [];
    if (!B.trainEnabled) bf.push('修煉鈕不該是灰的'); if (B.train.level < 1 || B.train.hg !== 20 || B.train.g !== 20 || B.train.still !== 'hunter') bf.push(`修煉沒生效/卡片被關 ${JSON.stringify(B.train)}`);
    if (!B.trainCdLocked || !B.trainCdText || !B.trainCdNoEffect) bf.push(`修煉冷卻中應灰＋文字說明冷卻、點了不生效 ${JSON.stringify([B.trainCdLocked, B.trainCdText, B.trainCdNoEffect])}`);
    if (B.skillBtn.aria === 'true' || B.skillBtn.bg !== RGB.gold) bf.push(`學習技能(夠錢)應為金棕可按：${JSON.stringify(B.skillBtn)}`); if (B.skill.lv !== 1 || B.skill.dg !== 80 || B.skill.tab !== 'skill' || B.skill.still !== 'hunter') bf.push(`學習技能沒生效/沒留在技能頁 ${JSON.stringify(B.skill)}`);
    if (B.skillLocked.aria !== 'true' || B.skillLocked.bg !== RGB.gray || !B.skillLocked.lock || !B.skillLockedNoEffect || !/金幣/.test(B.skillLocked.why)) bf.push(`學習技能(缺錢)應為灰＋鎖頭＋寫出缺什麼、點了不生效 ${JSON.stringify(B.skillLocked)}`);
    if (B.enh0.aria === 'true' || B.enh0.bg !== RGB.gold) bf.push(`強化裝備(有武器夠錢)應為金棕可按：${JSON.stringify(B.enh0)}`); if (B.enh.lv !== 1 || B.enh.dg !== 60 || B.enh.tab !== 'gear' || B.enh.still !== 'hunter') bf.push(`強化裝備沒生效 ${JSON.stringify(B.enh)}`);
    if (B.rebLocked.aria !== 'true' || B.rebLocked.bg !== RGB.gray || !B.rebLocked.lock) bf.push(`Lv.99 轉世應為灰＋鎖頭 ${JSON.stringify(B.rebLocked)}`); if (B.rebReady.aria === 'true' || B.rebReady.bg !== RGB.gold) bf.push(`Lv.100 轉世應為金棕可按 ${JSON.stringify(B.rebReady)}`);
    if (B.reb.d !== 1 || B.reb.level !== 1 || B.reb.still !== 'hunter') bf.push(`轉世沒生效 ${JSON.stringify(B.reb)}`);
    if (bf.length) for (const m of bf) fix(`${label} 動作：${m}`); else ok(`${label} 動作：修煉(扣 20、升級、冷卻時灰＋原因)、學習技能(−80)、強化裝備(−60)、轉世(Lv.100 才亮)都生效且留在原子頁籤;條件不足＝灰＋鎖頭、點了不生效`);

    // ═══ E. tooltip ═══
    await page.evaluate(() => { const g = globalThis.__mistvaleGame, h = g.state.hunters[0]; h.equipment.weapon = true; h.weaponLevel = 5; h.equipment.helm = false; h.equipment.chest = false; h.equipment.belt = false; h.equipment.legs = false; h.equipment.boots = false; h.equipment.gloves = false; });
    await L.act(page, 'hunter', hid); await settle(page, 300);
    const E = await ev(page, async (P) => {
      const out = {}, tip = () => document.querySelector('#ui-tip'), shown = () => { const t = tip(); return !!t && !t.hidden && P.vis(t); };
      const w = document.querySelector('.z2-slot.s-w'), a = document.querySelector('.z2-slot.s-g1');
      out.initialHidden = !shown(); w.click(); await P.wait(80);
      out.shown = shown(); const t = tip(); out.name = t.querySelector('.ui-tip-name')?.textContent; out.nameColor = getComputedStyle(t.querySelector('.ui-tip-name')).color; out.hasIcon = !!t.querySelector('.ui-tip-ic .inline-icon'); out.stats = [...t.querySelectorAll('.ui-tip-stats div')].map(d => d.textContent.trim());
      out.lines = [...t.querySelectorAll('.ui-tip-lines li')].map(l => [l.className, getComputedStyle(l).color, l.textContent]); out.rect = P.R(t); out.vw = innerWidth; out.vh = innerHeight; out.anchor = P.R(w); out.describedby = w.getAttribute('aria-describedby');
      out.fs = parseFloat(getComputedStyle(t).fontSize);
      // 護甲(空)＝負面紅
      a.click(); await P.wait(80); out.armorLines = [...tip().querySelectorAll('.ui-tip-lines li')].map(l => [l.className, getComputedStyle(l).color]); out.armorName = tip().querySelector('.ui-tip-name').textContent;
      // 點別處關閉(pointerdown 在標題上)
      document.querySelector('#modal .modal-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); await P.wait(60); out.closedByOutside = !shown();
      // Esc:先關 tooltip、視窗還在;再按一次才關視窗
      w.click(); await P.wait(60); const had = shown(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await P.wait(80); out.escTip = { had, tipGone: !shown(), modalStill: !document.querySelector('#modal-backdrop').classList.contains('hidden') };
      // 共用元件:任意 data-tip 元素
      const x = document.createElement('button'); x.className = 'z2a-test-tip'; x.style.cssText = 'position:fixed;left:40%;top:40%;width:48px;height:48px;z-index:99'; x.setAttribute('data-tip', JSON.stringify({ name: '測試道具', grade: 'legendary', icon: 'gold', stars: 3, level: 'Lv.9', stats: [['品質', '傳說']], lines: [['pos', '攻擊 +1'], ['neg', '防禦 -1'], ['note', '備註']] })); document.body.append(x);
      x.click(); await P.wait(80); out.shared = { shown: shown(), name: tip().querySelector('.ui-tip-name')?.textContent, color: getComputedStyle(tip().querySelector('.ui-tip-name')).color, classes: [...tip().querySelectorAll('.ui-tip-lines li')].map(l => getComputedStyle(l).color), stars: tip().querySelectorAll('.ui-tip-stars i').length, api: typeof globalThis.__mistvaleTip?.attr };
      x.click(); await P.wait(60); out.toggleOff = !shown(); x.remove(); await P.wait(60); out.afterRemove = !shown();
      return out;
    });
    const ef = [];
    if (!E.initialHidden) ef.push('一開始 tooltip 就顯示'); if (!E.shown) ef.push('點武器格沒出現 tooltip');
    else {
      if (E.name !== '精鐵武器' || E.nameColor !== RGB.superior) ef.push(`武器(+5)名稱「${E.name}」色 ${E.nameColor}，應為品級色(超級稀有 #6caeee)`); if (!E.hasIcon || E.stats.length < 2) ef.push(`缺圖示格或數值列(${E.hasIcon}/${E.stats.length})`);
      const cl = Object.fromEntries(E.lines.map(l => [l[0], l[1]])); if (cl.pos !== RGB.pos || cl.note !== RGB.note) ef.push(`條列顏色 正面/備註 ${JSON.stringify(cl)}`);
      const ar = Object.fromEntries(E.armorLines.map(l => [l[0], l[1]])); if (ar.neg !== RGB.neg) ef.push(`護甲(空)的負面條列應為紅 ${JSON.stringify(ar)}`);
      if (E.rect.l < -0.5 || E.rect.t < -0.5 || E.rect.r > E.vw + 0.5 || E.rect.b > E.vh + 0.5) ef.push(`tooltip 超出畫面 ${JSON.stringify(E.rect)}`); if (E.fs < 11.95) ef.push(`tooltip 字 ${E.fs}px <12`); if (E.describedby !== 'ui-tip') ef.push('錨點沒有 aria-describedby');
    }
    if (!E.closedByOutside) ef.push('點別處沒有關閉 tooltip'); if (!E.escTip.had || !E.escTip.tipGone || !E.escTip.modalStill) ef.push(`Esc 應先關 tooltip 而視窗留著 ${JSON.stringify(E.escTip)}`);
    if (!E.shared.shown || E.shared.name !== '測試道具' || E.shared.color !== 'rgb(239, 185, 85)' || E.shared.stars !== 3 || E.shared.classes.join('|') !== [RGB.pos, RGB.neg, RGB.note].join('|') || E.shared.api !== 'function') ef.push(`共用元件(任意 data-tip)不正常 ${JSON.stringify(E.shared)}`); if (!E.toggleOff || !E.afterRemove) ef.push('同一顆再點一次要收起、錨點被移除時要自動關');
    if (ef.length) for (const m of ef) fix(`${label} tooltip：${m}`); else ok(`${label} tooltip：點裝備格出現迷你視窗(品級色名稱、圖示格、數值列、藍/紅/金條列)、在畫面內、點別處與 Esc 關閉(Esc 先關 tooltip)、共用元件可給任何 data-tip 元素`);
    if (SHOTS) { await page.evaluate(() => document.querySelector('.z2-slot.s-w').click()); await settle(page, 150); await page.screenshot({ path: `${SHOTS}/${name}-tooltip.png` }); await page.evaluate(() => document.querySelector('#modal .modal-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))); }
    if (!touch) { // 滑鼠 hover 與鍵盤焦點
      const box = await page.evaluate(() => { const r = document.querySelector('.z2-slot.s-g1').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(5, 5); await page.mouse.move(box.x, box.y); await settle(page, 150);
      const hv = await page.evaluate(() => { const t = document.querySelector('#ui-tip'); return !t.hidden; }); await page.mouse.move(5, 5); await settle(page, 150); const hv2 = await page.evaluate(() => !document.querySelector('#ui-tip').hidden);
      if (!hv || hv2) fix(`${label} tooltip：滑鼠 hover 應顯示、移開應收起(顯示 ${hv}、移開後 ${hv2})`); else ok(`${label} tooltip：滑鼠 hover 顯示、移開收起(同一個元件)`);
      await page.keyboard.press('Tab'); // 鍵盤焦點
    }
    await closeAll(page); await closeAll(page);

    // ═══ C. 名冊 ═══
    await page.evaluate(() => { const g = globalThis.__mistvaleGame; const hs = g.state.hunters; const rs = ['normal', 'rare', 'superior', 'heroic', 'legendary', 'normal']; hs.forEach((h, i) => { h.rarity = rs[i % rs.length]; }); });
    await L.act(page, 'hunters'); await settle(page, 600);
    const C = await ev(page, (P) => {
      const m = document.querySelector('#modal'), g = P.G(), cards = [...document.querySelectorAll('#modal-content .hv-hgrid .hv-hcard')], out = { mode: m.dataset.mode, type: m.dataset.type, n: cards.length, want: g.state.hunters.length };
      const grid = document.querySelector('#modal-content .hv-hgrid'); out.cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      out.subtabs = [...document.querySelectorAll('#modal-subtabs .z1-subtab')].map(t => t.textContent.trim() + (t.classList.contains('on') ? '*' : ''));
      out.cards = cards.map(c => { const r = P.R(c), head = c.querySelector('.hc-head'), rar = c.querySelector('.hc-rar'), art = c.querySelector('.hc-art'), name = c.querySelector('.hc-name'), info = c.querySelector('.hc-info'), loc = c.querySelector('.hc-loc'); const cs = getComputedStyle(c); return { id: c.dataset.id, rarity: c.dataset.rarity, r, rar: rar?.textContent, rarColor: rar && getComputedStyle(rar).color, rarBelow: rar && art ? P.R(rar).b <= P.R(art).t + 1 : false, nameBelow: name && art ? P.R(name).t >= P.R(art).b - 1 : false, nameTxt: name?.textContent, border: cs.borderTopColor, bw: cs.borderTopWidth, grad: /gradient/.test(getComputedStyle(c, '::before').backgroundImage), info: info && { r: P.R(info), txt: info.textContent.trim(), aria: info.getAttribute('aria-label'), hit: P.hitsSelf(info), vis: P.vis(info), icon: info.querySelector('span') && getComputedStyle(info.querySelector('span')).backgroundColor }, loc: loc && { r: P.R(loc), hit: P.hitsSelf(loc), vis: P.vis(loc) }, oldInfo: !!c.querySelector('.hc-btns .hc-info'), infoOverLoc: info && loc ? P.inter(P.R(info), P.R(loc)) : null }; });
      out.names = out.cards.map(c => c.nameTxt); out.cr = P.R(document.querySelector('#modal-content')); return out;
    });
    const cf = [];
    if (C.mode !== 'A' || C.type !== 'hunters') cf.push(`名冊視窗模式 ${C.mode}/${C.type}`); if (C.n !== C.want) cf.push(`名冊卡 ${C.n} ≠ 獵人 ${C.want}`);
    const wantCols = v.w <= 760 ? 4 : 6; if (C.cols !== wantCols && !(landscape && C.cols >= 4)) cf.push(`名冊欄數 ${C.cols}(${v.w}px 寬應 ${wantCols} 欄)`);
    if (C.subtabs.join('|') !== '名冊*|招募' && !/^名冊\*\|招募/.test(C.subtabs.join('|'))) cf.push(`標題列子頁籤 ${C.subtabs.join('|')}(應 名冊｜招募)`);
    const rarName = { normal: '普通', rare: '稀有', superior: '超級稀有', heroic: '英雄', legendary: '傳說' }; const borders = new Set();
    for (const c of C.cards) {
      if (c.rar !== rarName[c.rarity] || !c.rarBelow === true) { if (c.rar !== rarName[c.rarity]) cf.push(`卡 ${c.nameTxt} 頂端稀有度字「${c.rar}」應為「${rarName[c.rarity]}」`); }
      if (!c.nameBelow) cf.push(`卡 ${c.nameTxt}：名字應在立繪下方`); if (!c.grad) cf.push(`卡 ${c.nameTxt}：沒有稀有度漸層底`); if (c.bw !== '2px') cf.push(`卡 ${c.nameTxt}：邊框 ${c.bw}`); borders.add(c.border);
      if (!c.info || c.info.txt !== 'i' || !/資訊/.test(c.info.aria || '') || c.oldInfo) cf.push(`卡 ${c.nameTxt}：資訊入口應為右上小「i」(${c.info?.txt})`); else {
        if (!c.info.vis || !c.info.hit) cf.push(`卡 ${c.nameTxt}：i 鈕被蓋住`); if (touch && (c.info.r.w < 43.5 || c.info.r.h < 43.5)) cf.push(`卡 ${c.nameTxt}：i 鈕熱區 ${Math.round(c.info.r.w)}×${Math.round(c.info.r.h)}<44`);
        if (c.info.r.r < c.r.r - 4 || c.info.r.t > c.r.t + 4) cf.push(`卡 ${c.nameTxt}：i 鈕不在卡片右上角`); if (c.info.icon !== 'rgb(230, 180, 60)') cf.push(`卡 ${c.nameTxt}：i 不是金色 ${c.info.icon}`);
      }
      const seen = c.r.b <= C.cr.b + 1 && c.r.t >= C.cr.t - 1;   // 抽屜較矮時(例 360×640)第二排在捲動區下面,不算被蓋住
      if (seen && (!c.loc || !c.loc.vis || !c.loc.hit)) cf.push(`卡 ${c.nameTxt}：定位鈕不見或被蓋住`); if (c.infoOverLoc) cf.push(`卡 ${c.nameTxt}：i 與定位鈕互蓋`);
    }
    if (borders.size < 4) cf.push(`稀有度邊框顏色只有 ${borders.size} 種(5 種稀有度應各不同)`);
    if (cf.length) for (const m of cf.slice(0, 8)) fix(`${label} 名冊：${m}`); else ok(`${label} 名冊：${C.n} 張卡、${C.cols} 欄、頂端稀有度字、稀有度邊框(${borders.size} 色)＋漸層底、名字在立繪下、右上金色 i(${touch ? '≥44 熱區、' : ''}不蓋定位鈕)、子頁籤 ${C.subtabs.join('｜')}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-roster.png` });
    // i → 開獵人卡;定位鈕
    const C2 = await ev(page, async (P) => { const c = document.querySelector('#modal-content .hv-hcard'), id = c.dataset.id, out = {}; c.querySelector('.hc-info').click(); await P.wait(200); out.opened = document.querySelector('#modal').dataset.type === 'hunter' && document.querySelector('#modal-title').textContent === P.G().state.hunters.find(h => h.id === id).name; return out; });
    if (!C2.opened) fix(`${label} 名冊：按 i 沒有打開該獵人的卡`); else ok(`${label} 名冊：按卡片右上 i 打開該獵人的獵人卡`);
    await closeAll(page);
    // 招募子頁籤
    await L.act(page, 'hunters'); await settle(page, 300);
    const C3 = await ev(page, async (P) => { const t = [...document.querySelectorAll('#modal-subtabs .z1-subtab')].find(x => /招募/.test(x.textContent)); const vis = P.vis(t), hit = t && P.hitsSelf(t), r = P.R(t); t.click(); await P.wait(250); const m = document.querySelector('#modal'); return { vis, hit, r, type: m.dataset.type, mode: m.dataset.mode, cards: document.querySelectorAll('#modal-content .visitor-card').length, want: P.G().state.visitors.length, on: [...document.querySelectorAll('#modal-subtabs .z1-subtab.on')].map(x => x.textContent.trim()) }; });
    if (C3.type !== 'recruit' || C3.cards !== C3.want || C3.cards < 1 || C3.on.join() !== '招募' || !C3.vis || !C3.hit) fix(`${label} 招募子頁籤：${JSON.stringify(C3)}`); else ok(`${label} 招募子頁籤：點了進招募清單(${C3.cards} 張完整卡)、子頁籤高亮「招募」`);
    if (touch && (C3.r.w < 43.5 || C3.r.h < 43.5)) fix(`${label} 招募子頁籤熱區 ${Math.round(C3.r.w)}×${Math.round(C3.r.h)}<44`);
    await closeAll(page);

    // ═══ D. 新獵人暗帶 ═══
    await page.evaluate(() => { globalThis.__mistvaleGame.state.gold = 5000; });
    await L.act(page, 'build'); await settle(page, 300);   // 面板開著時換上旅人 → 算「已見過」不自動彈,之後旅人提示才會出現在顧問位置
    await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.visitors = [{ id: 'zv1', classId: 'archer', rarity: 'rare', trait: 'swift', cost: 120 }, { id: 'zv2', classId: 'paladin', rarity: 'legendary', trait: 'stout', cost: 400 }, { id: 'zv3', classId: 'sorcerer', rarity: 'normal', trait: 'brave', cost: 90 }]; });
    await settle(page, 300); await closeAll(page); await settle(page, 900);
    const D0 = await ev(page, async (P) => { const el = document.querySelector('#hv-advisor #next-step'); return { has: !!el, key: el?.dataset.key, text: el?.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), modalOpen: !document.querySelector('#modal-backdrop').classList.contains('hidden') }; });
    if (!D0.has || D0.key !== 'visitor') fix(`${label} 新獵人：旅人提示沒出現(${JSON.stringify(D0)})`);
    else {
      await page.evaluate(() => document.querySelector('#hv-advisor #next-step').click()); await settle(page, 500);
      const D = await ev(page, (P) => {
        const m = document.querySelector('#modal'), bd = document.querySelector('#modal-backdrop'), band = document.querySelector('.z2-band'), out = { type: m.dataset.type, mode: m.dataset.mode, bdMode: bd.dataset.mode, advisor: !!document.querySelector('.hv-dlg'), has: !!band };
        if (!band) return out;
        const t = band.querySelector('.z2-band-t'); out.title = t.textContent; out.italic = getComputedStyle(t).fontStyle; out.titleFs = parseFloat(getComputedStyle(t).fontSize);
        const cards = [...band.querySelectorAll('.z2-vcard')]; out.cards = cards.map(c => ({ id: c.dataset.id, on: c.classList.contains('on'), pressed: c.getAttribute('aria-pressed'), r: P.R(c), rarity: c.dataset.rarity, rar: c.querySelector('.z2-vr')?.textContent, name: c.querySelector('.z2-vn')?.textContent, border: getComputedStyle(c).borderTopColor, grad: /gradient/.test(getComputedStyle(c, '::before').backgroundImage), hit: P.hitsSelf(c) }));
        out.p = band.querySelector('.z2-band-p')?.textContent.replace(/\s+/g, ' ') || ''; out.pR = P.R(band.querySelector('.z2-band-p'));
        const btns = [...band.querySelectorAll('.z2-band-btns button')]; out.btns = btns.map(b => ({ a: b.dataset.action, t: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor, r: P.R(b), hit: P.hitsSelf(b), aria: b.getAttribute('aria-disabled'), id: b.dataset.id }));
        out.mr = P.R(m); out.vw = innerWidth; out.vh = innerHeight; out.bdBg = getComputedStyle(bd).backgroundColor; out.all = band.querySelector('.z2-band-all')?.textContent || ''; out.allR = P.R(band.querySelector('.z2-band-all'));
        out.bandR = P.R(band); out.hudHidden = null; out.fs = Math.min(...[...band.querySelectorAll('*')].filter(e => P.vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)));
        return out;
      });
      const df = [];
      if (D.type !== 'visitors' || D.mode !== 'D' || D.bdMode !== 'D') df.push(`旅人提示應開 D 暗帶(type ${D.type} mode ${D.mode})`); if (D.advisor) df.push('還是舊的「旅人願意加入」對話框');
      if (D.has) {
        if (D.title !== '新的獵人！' || D.italic !== 'italic') df.push(`標題「${D.title}」字體 ${D.italic}(應 斜體「新的獵人！」)`);
        if (D.cards.length !== 2) df.push(`立繪卡 ${D.cards.length} 張(應最多 2 張)`);
        else { const on = D.cards.filter(c => c.on), off = D.cards.filter(c => !c.on); if (on.length !== 1 || on[0].pressed !== 'true') df.push('應有 1 張選中'); else { const ratio = on[0].r.w / off[0].r.w; if (ratio < 1.25 || ratio > 1.55) df.push(`選中卡寬是另一張的 ${ratio.toFixed(2)} 倍(應約 1.4)`); } for (const c of D.cards) { if (!c.grad || !c.rar || !c.name) df.push('立繪卡缺漸層底／稀有度字／名稱'); if (!c.hit) df.push('立繪卡被蓋住'); if (touch && (c.r.w < 43.5 || c.r.h < 43.5)) df.push(`立繪卡熱區 ${Math.round(c.r.w)}×${Math.round(c.r.h)}`); } if (D.cards[0].border === D.cards[1].border) df.push('兩張卡的稀有度邊框同色(測試資料是 稀有／傳說)'); }
        if (!D.p || D.p.length < 6) df.push('缺一行說明'); const bi = D.btns.find(b => b.a === 'recruitVisitor'), bl = D.btns.find(b => b.a === 'visitorLater');
        if (!bi || !bl || bi.t !== '邀請' || bl.t !== '稍後' || bi.bg !== RGB.olive || bl.bg !== RGB.red) df.push(`鈕應為 邀請(橄欖綠)＋稍後(紅)：${JSON.stringify(D.btns.map(b => [b.t, b.bg]))}`); else { if (!bi.hit || !bl.hit) df.push('邀請／稍後被蓋住'); if (bi.r.h < 43.5 || bl.r.h < 43.5 || bi.r.w < 100 || bl.r.w < 100) df.push(`鈕尺寸 ${Math.round(bi.r.w)}×${Math.round(bi.r.h)}／${Math.round(bl.r.w)}×${Math.round(bl.r.h)}`); if (Math.abs(bi.r.t - bl.r.t) > 1 && !landscape) df.push('邀請與稍後沒有並排'); }
        if (Math.abs(D.mr.w - D.vw) > 2) df.push(`暗帶寬 ${Math.round(D.mr.w)} 應滿寬 ${D.vw}`); if (D.mr.t < 0 || D.mr.b > D.vh) df.push(`暗帶超出畫面 ${Math.round(D.mr.t)}–${Math.round(D.mr.b)}`); if (D.bdBg !== 'rgba(0, 0, 0, 0.56)') df.push(`遮罩 ${D.bdBg} 應為 rgba(0,0,0,.56)`); if (D.fs < 11.95) df.push(`暗帶字 ${D.fs}px <12`);
        if (!/全部旅人/.test(D.all)) df.push('缺「看全部旅人」(完整清單的入口)'); else if (touch && D.allR.h < 43.5) df.push('「看全部旅人」熱區 <44');
      }
      if (df.length) for (const m of df) fix(`${label} 新獵人暗帶：${m}`); else ok(`${label} 新獵人暗帶：旅人提示直接開 D 暗帶(滿寬、遮罩 .56)、斜體「新的獵人！」、2 張稀有度立繪卡(選中約 1.4 倍)、一行說明、邀請(綠)＋稍後(紅)、看全部旅人`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-band.png` });
      // 點選切換
      const D2 = await ev(page, async (P) => { const off = [...document.querySelectorAll('.z2-vcard:not(.on)')][0], id = off.dataset.id; off.click(); await P.wait(200); const on = document.querySelector('.z2-vcard.on'); const btn = document.querySelector('[data-action=recruitVisitor]'); return { swapped: on?.dataset.id === id, btnOk: btn?.dataset.id === id, still: document.querySelector('#modal').dataset.type }; });
      if (!D2.swapped || !D2.btnOk || D2.still !== 'visitors') fix(`${label} 新獵人暗帶：點另一張卡沒有切換選中 ${JSON.stringify(D2)}`); else ok(`${label} 新獵人暗帶：點另一張卡切換選中(邀請鈕跟著換成那位)`);
      // 稍後:關掉、不加人、不再自動彈
      const D3 = await ev(page, async (P) => { const g = P.G(), n0 = g.state.hunters.length; document.querySelector('[data-action=visitorLater]').click(); await P.wait(300); const closed = document.querySelector('#modal-backdrop').classList.contains('hidden'); await P.wait(1200); return { closed, n: g.state.hunters.length - n0, reopened: !document.querySelector('#modal-backdrop').classList.contains('hidden') }; });
      if (!D3.closed || D3.n !== 0 || D3.reopened) fix(`${label} 新獵人暗帶：稍後應關閉、不加人、不再自動彈出 ${JSON.stringify(D3)}`); else ok(`${label} 新獵人暗帶：稍後＝關閉、沒加人、不會再自動彈出`);
      // 邀請:加入獵人、扣款、關閉、任務條件還成立
      await page.evaluate(() => document.querySelector('#hv-advisor #next-step')?.click()); await settle(page, 400);
      const D4 = await ev(page, async (P) => { const g = P.G(), s = g.state, n0 = s.hunters.length, g0 = s.gold, rec0 = s.recruited; const b = document.querySelector('[data-action=recruitVisitor]'); const vid = b.dataset.id, v = s.visitors.find(x => x.id === vid); const cost = v.cost, cls = v.classId, rar = v.rarity; b.click(); await P.wait(300); const nh = s.hunters[s.hunters.length - 1]; return { dn: s.hunters.length - n0, dg: g0 - s.gold, cost, rec: s.recruited - rec0, closed: document.querySelector('#modal-backdrop').classList.contains('hidden'), cls: nh?.classId === cls, rar: nh?.rarity === rar, quest: s.hunters.length >= 6, newVisitor: !s.visitors.some(x => x.id === vid) }; });
      if (D4.dn !== 1 || D4.dg !== D4.cost || D4.rec !== 1 || !D4.closed || !D4.cls || !D4.rar || !D4.newVisitor) fix(`${label} 新獵人暗帶：邀請沒有正確加入 ${JSON.stringify(D4)}`); else ok(`${label} 新獵人暗帶：邀請＝加入該位(職業/稀有度一致)、扣 ${D4.cost} 金幣、recruited+1、暗帶關閉、該位旅人被換成新的`);
      // 邀請不足:灰＋鎖頭、點了不加人
      const D5 = await ev(page, async (P) => { const g = P.G(), s = g.state; s.gold = 10; s.visitors = [{ id: 'zq1', classId: 'archer', rarity: 'rare', trait: 'swift', cost: 120 }, { id: 'zq2', classId: 'paladin', rarity: 'normal', trait: 'stout', cost: 150 }]; await P.wait(200); P.act('nextStep', null, { key: 'visitor' }); await P.wait(300); const b = document.querySelector('[data-action=recruitVisitor]'); const n0 = s.hunters.length; const out = { aria: b?.getAttribute('aria-disabled'), bg: b && getComputedStyle(b).backgroundColor, lock: !!b?.querySelector('.hv-lock'), text: document.querySelector('.z2-band-p')?.textContent || '' }; b?.click(); await P.wait(200); out.dn = s.hunters.length - n0; out.open = !document.querySelector('#modal-backdrop').classList.contains('hidden'); return out; });
      if (D5.aria !== 'true' || D5.bg !== RGB.gray || !D5.lock || D5.dn !== 0 || !/還缺/.test(D5.text) || !D5.open) fix(`${label} 新獵人暗帶：金幣不足時 邀請 應灰＋鎖頭＋寫還缺多少、點了不加人 ${JSON.stringify(D5)}`); else ok(`${label} 新獵人暗帶：金幣不足時 邀請 灰＋鎖頭、說明寫「還缺 n 金幣」、點了不加人`);
      await closeAll(page);
      // 看全部旅人 → 招募清單
      await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.gold = 5000; });
      await ev(page, async (P) => { P.act('nextStep', null, { key: 'visitor' }); await P.wait(300); document.querySelector('.z2-band-all')?.click(); await P.wait(300); });
      const D6 = await page.evaluate(() => ({ type: document.querySelector('#modal').dataset.type, mode: document.querySelector('#modal').dataset.mode, n: document.querySelectorAll('#modal-content .visitor-card').length, want: globalThis.__mistvaleGame.state.visitors.length }));
      if (D6.type !== 'recruit' || D6.mode !== 'A' || D6.n !== D6.want || !D6.n) fix(`${label} 新獵人暗帶：「看全部旅人」應進名冊的招募清單 ${JSON.stringify(D6)}`); else ok(`${label} 新獵人暗帶：「看全部旅人」進名冊的招募清單(${D6.n} 張)`);
      await closeAll(page);
    }
    // 自動彈出:新旅人到(閒著、付得起)才彈;面板開著時不彈
    const D7 = await ev(page, async (P) => { const g = P.G(), s = g.state; const vis = () => !document.querySelector('#modal-backdrop').classList.contains('hidden') && document.querySelector('#modal').dataset.type === 'visitors';
      s.gold = 5000; await P.wait(400); const idle0 = vis(); s.visitors.push({ id: 'zauto1', classId: 'archer', rarity: 'heroic', trait: 'swift', cost: 200 }); await P.wait(700); const popped = vis(); const typ = document.querySelector('#modal').dataset.type; document.querySelector('[data-action=visitorLater]')?.click(); await P.wait(200);
      P.act('build'); await P.wait(300); s.visitors.push({ id: 'zauto2', classId: 'paladin', rarity: 'heroic', trait: 'swift', cost: 200 }); await P.wait(700); const duringModal = vis(); const stillBuild = document.querySelector('#modal').dataset.type === 'build'; document.querySelector('#modal [data-action=close]')?.click(); await P.wait(500); const afterClose = vis();
      return { idle0, popped, typ, duringModal, stillBuild, afterClose }; });
    if (D7.idle0 || !D7.popped || D7.duringModal || !D7.stillBuild || D7.afterClose) fix(`${label} 新獵人暗帶：自動彈出規則不對 ${JSON.stringify(D7)}(應：閒著新旅人到才彈、面板開著不彈、之後也不補彈)`); else ok(`${label} 新獵人暗帶：新旅人到時自動彈出；面板開著時到的不彈、關掉後也不補彈`);
    await closeAll(page);

    // ═══ F. 名字 ═══
    const F = await ev(page, async (P) => { const g = P.G(), s = g.state; const dup = () => { const hn = s.hunters.map(h => h.name), wn = (s.wanderers || []).map(w => w.name); return { hunters: hn.length, dupAmongHunters: hn.length - new Set(hn).size, dupAcross: wn.filter(n => hn.includes(n)), dupAmongWanderers: wn.length - new Set(wn).size }; };
      const start = dup(); for (let i = 0; i < 6; i++) g.cheat('wanderer'); s.gold = 99999; for (let i = 0; i < 6; i++) { const v = s.visitors[0]; if (v) g.recruit(v.id); } for (let i = 0; i < 4; i++) g.cheat('wanderer'); const end = dup(); return { start, end, nW: (s.wanderers || []).length }; });
    if (F.start.dupAcross.length || F.start.dupAmongHunters || F.end.dupAcross.length || F.end.dupAmongHunters || F.end.dupAmongWanderers) fix(`${label} 名字重複：${JSON.stringify(F)}`); else ok(`${label} 名字：開局與之後(多 10 位流浪英雄＋招募 6 位獵人)，流浪英雄與村裡獵人都沒有同名(${F.end.hunters} 獵人／${F.nW} 流浪英雄)`);

    if (errs.length) fix(`${label} 頁面錯誤：${[...new Set(errs)].slice(0, 3).join(' | ')}`); else ok(`${label} 沒有 console／page error`);
  } catch (e) { fix(`${label} 檢查腳本例外：${String(e).slice(0, 300)}`); }
  await ctx.close();
}
await browser.close(); srv.stop();
for (const m of oks) console.log('ok ' + m);
for (const m of fails) console.log(' - ' + m);
if (fails.length) { console.log(`FAIL z2a-hunter: ${fails.length} 個問題`); process.exit(1); }
console.log(`PASS z2a-hunter: ${oks.length} 項 ok(獵人卡、動作、tooltip、名冊、新獵人暗帶、名字)`);
