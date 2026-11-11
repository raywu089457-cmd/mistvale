// hv-measure.mjs — 獵魔村風格驗收量測(UI-REF-HUNTER-VILLAGE §5):四種視窗各量一次,印成一行一行的 JSON。
//   字級:所有看得到的文字元素,實際字級(computed font-size × currentCSSZoom)最小值、< 12px 的清單;字族第一順位不是像素字的清單。
//   熱區:手機(短邊 < 600)所有看得到的 [data-action]/button 寬高 < 44 的清單(主 HUD、建設、獵人三個畫面)。
//   頁籤列:每格寬度、高度;面板(#modal)是否整個在視窗內;HUD 浮字描邊對比(字色 vs 黑描邊)。
// 用法: node pipeline/scripts/ui-audit/hv-measure.mjs [sizes]   預設 1440x900,1024x768,390x844,844x390
import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const SIZES = (process.argv[2] || '1440x900,1024x768,390x844,844x390').split(',').map(s => s.split('x').map(Number));
const TARGET = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const out = [];
for (const [w, h] of SIZES) {
  const phone = Math.min(w, h) < 600;
  const ctx = await b.newContext(phone ? { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const act = a => page.evaluate(a => {
    const fire = (x, id) => { const el = document.createElement('button'); el.dataset.action = x; if (id) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); };
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#modal-backdrop:not(.hidden) [data-action=confirmNo]')?.click();
    globalThis.__mistvaleSelect?.(null); document.querySelector('#unit-card [data-action=unitCardClose]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
    if (!a) return;
    // 第二階段新元件:世界內六角鈕(select)、亮色對話框(welcome/advisor)、名冊篩選展開(rostermenu)
    if (a === 'select') { globalThis.__mistvaleSelect('forge'); return; }
    if (a === 'selhunter') { globalThis.__mistvaleSelect('hunter:' + globalThis.__mistvaleGame.state.hunters[0].id); return; }
    if (a === 'welcome') return fire('welcomeReplay');
    if (a === 'advisor') { const b = document.querySelector('#next-step'); if (b) return b.click(); const el = document.createElement('button'); el.dataset.action = 'nextStep'; el.dataset.act = 'build'; el.dataset.key = 'build'; el.innerHTML = '<span class="ns-tx">資源夠了</span><b class="ns-go">去建設</b>'; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); return; }
    if (a === 'rostermenu') { fire('hunters'); fire('rosterMenu'); return; }
    if (a === 'offline') return globalThis.__mistvaleShowOffline();
    if (a === 'dispatch') return fire('dispatchHunters');
    if (a === 'region') return fire('regionDetail', 'meadow');
    fire(a);
  }, a);
  const res = { size: `${w}x${h}`, screens: {} };
  for (const scr of (process.env.SCREENS || ',build,hunters,rostermenu,inventory,trade,craft,dungeon,arena,quests,boss,settings,help,worldmap,region,dispatch,recruit,difficulty,codex,offline,welcome,advisor,select,selhunter').split(',')) {
    await act(scr); await page.waitForTimeout(500);
    res.screens[scr || 'hud'] = await page.evaluate(({ phone }) => {
      const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !e.closest('.hidden,[hidden],.hv-sr') && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
      const modalOpen = !document.querySelector('#modal-backdrop').classList.contains('hidden');
      const scope = e => !modalOpen || e.closest('#modal,#topbar,#bottom-bar');
      const sel = document.querySelector('#hv-sel:not([hidden])'), selBtns = sel ? [...sel.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }) : null;
      // 文字:有直接文字節點的元素
      const small = [], badFont = []; let minPx = 99;
      for (const el of document.querySelectorAll('body *')) {
        if (!vis(el) || !scope(el) || el.closest('#loading,canvas,script,style')) continue;
        const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        if (!txt) continue;
        const cs = getComputedStyle(el), px = parseFloat(cs.fontSize) * (el.currentCSSZoom || 1), rr = el.getBoundingClientRect();
        if (px === 0 || rr.width <= 1 || rr.height <= 1) continue;   // 只用背景圖示的鈕(字級 0)、讀屏專用字
        if (px < minPx) minPx = px;
        if (px < 11.95) small.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} "${txt.slice(0, 12)}" ${px.toFixed(1)}px`);
        if (!/Ark Pixel/i.test(cs.fontFamily.split(',')[0])) badFont.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${txt.slice(0, 10)}" ${cs.fontFamily.split(',')[0]}`);
      }
      // 熱區
      const tiny = [];
      for (const el of document.querySelectorAll('[data-action],button')) {
        if (!vis(el) || !scope(el) || el.disabled) continue;
        const r = el.getBoundingClientRect(), lim = phone ? 44 : 32;
        if (r.width < lim - .5 || r.height < lim - .5) tiny.push(`${el.dataset.action || el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const tabs = [...document.querySelectorAll('#bottom-bar>button')].map(e => Math.round(e.getBoundingClientRect().width));
      const bar = document.querySelector('#bottom-bar').getBoundingClientRect();
      const m = document.querySelector('#modal').getBoundingClientRect();
      const top = document.querySelector('#topbar').getBoundingClientRect();
      return { minTextPx: +minPx.toFixed(2), small: small.slice(0, 8), smallN: small.length, badFont: badFont.slice(0, 6), badFontN: badFont.length, tinyN: tiny.length, tiny: tiny.slice(0, 8),
        tabW: tabs, tabH: Math.round(bar.height), modal: modalOpen ? { x: Math.round(m.left), y: Math.round(m.top), w: Math.round(m.width), h: Math.round(m.height), inside: m.left >= -0.5 && m.top >= -0.5 && m.right <= innerWidth + .5 && m.bottom <= innerHeight + .5, overTabbar: m.bottom > bar.top + 1 } : null,
        topbarBottom: Math.round(top.bottom), hex: selBtns };
    }, { phone });
  }
  res.errors = errs;
  out.push(res);
  await ctx.close();
}
await b.close();
for (const r of out) console.log(JSON.stringify(r));
