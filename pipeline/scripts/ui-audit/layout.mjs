// layout.mjs — phone/desktop layout check for every modal (2026-10-30; grown from Desktop/Claude code/mistvale-ui-audit/audit.mjs).
// Per device x screen: offscreen, cut by a container, truncated text, button content spilling, covered buttons, squeezed (vertical) text,
// sideways-scrolling modal, tap targets < 24px (FIX) and < 32px (info); also re-measures with the mobile URL bar shown (withBar).
// Usage: node pipeline/scripts/ui-audit/layout.mjs [device,device]   (default iphone-402x712, android-360x640, desktop-1440x900)
//   SCREENS=07,08 limits screens by name prefix; INJECT=x.css layers a CSS file on top (try a fix without rebuilding).
//   Output: output/ui-audit/layout/<device>/<screen>.png, report.json, summary.txt (also printed). Needs the game server (npm run build first).
import { createRequire } from 'module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium, webkit } = require('playwright');
const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const OUT = fileURLToPath(new globalThis.URL('../../../output/ui-audit/layout/', import.meta.url));
const DEFAULT = ['iphone-402x712', 'android-360x640', 'desktop-1440x900'];
const MODALS = [['02-settings', 'settings'], ['03-build', 'build'], ['04-hunters', 'hunters'], ['05-hunter', 'hunter'], ['06-recruit', 'recruit'], ['07-trade', 'trade'], ['08-craft', 'craft'], ['09-craft-gear', 'craft', null, 'gear'],
  ['10-dungeon', 'dungeon'], ['11-arena', 'arena'], ['12-quests', 'quests'], ['13-inventory', 'inventory'], ['14-difficulty', 'difficulty'], ['15-help', 'help'], ['16-boss', 'boss'], ['17-dispatch', 'dispatchHunters'], ['18-worldmap', 'worldmap'], ['20-region', 'regionInfo', 'snow']];   // 2026-10-30:地圖詳細資訊(派遣出征的區域卡捲軸鈕)
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
// bar = 網址列等工具列高度（vh 比可視高度多出來的量，估計值）
const DEVICES = [
  { name: 'android-360x640', engine: 'chromium', w: 360, h: 640, dpr: 3, ua: ANDROID_UA, bar: 56 },
  { name: 'android-360x740', engine: 'chromium', w: 360, h: 740, dpr: 3, ua: ANDROID_UA, bar: 56 },
  { name: 'pixel7-412x839', engine: 'chromium', w: 412, h: 839, dpr: 2.625, ua: ANDROID_UA, bar: 56 },
  { name: 'iphone-402x712', engine: 'webkit', w: 402, h: 712, dpr: 3, ua: IOS_UA, bar: 80 },
  { name: 'android-land-915x356', engine: 'chromium', w: 915, h: 356, dpr: 2.625, ua: ANDROID_UA, bar: 56 },
  { name: 'iphone-land-812x360', engine: 'webkit', w: 812, h: 360, dpr: 3, ua: IOS_UA, bar: 40 },
  // 小螢幕（預設不跑，要用參數指定）：iPhone SE Safari 直向／橫向、小 Android 橫向
  { name: 'iphoneSE-375x548', engine: 'webkit', w: 375, h: 548, dpr: 2, ua: IOS_UA, bar: 80, extra: true },
  { name: 'iphoneSE-land-667x325', engine: 'webkit', w: 667, h: 325, dpr: 2, ua: IOS_UA, bar: 40, extra: true },
  { name: 'android-land-640x304', engine: 'chromium', w: 640, h: 304, dpr: 3, ua: ANDROID_UA, bar: 56, extra: true },
  { name: 'desktop-1440x900', engine: 'chromium', w: 1440, h: 900, dpr: 1, desktop: true, bar: 0, extra: true },
  { name: 'desktop-1280x720', engine: 'chromium', w: 1280, h: 720, dpr: 1, desktop: true, bar: 0, extra: true },
];
const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 頁面內量測 ----
const AUDIT = (scope) => {
  const vw = innerWidth, vh = innerHeight, root = scope ? document.querySelector(scope) : document.body;
  if (!root) return { missing: scope };
  const shown = e => { if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false; const r = e.getBoundingClientRect(); return r.width > .5 && r.height > .5; };
  const label = e => { const t = (e.getAttribute?.('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18); const c = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.dataset?.action ? '[' + e.dataset.action + ']' : ''}${c}${t ? ' "' + t + '"' : ''}`; };
  const R = e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const ovf = a => getComputedStyle(a).overflowX + ' ' + getComputedStyle(a).overflowY;
  const scrollAnc = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (/(auto|scroll)/.test(ovf(a))) return a; return null; };
  const hasText = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const INTER = 'button,a[href],input,select,textarea,[data-action],[role=button],[data-pilot],.ph-stick';
  const all = [...root.querySelectorAll('*')].filter(e => shown(e) && !e.closest('.res-float'));   // .res-float = short-lived +N animation
  const inter = all.filter(e => e.matches(INTER) && !e.parentElement.closest(INTER));
  const out = { vw, vh, offscreen: [], cut: [], truncated: [], spill: [], tiny: [], small: [], tinyText: [], smallText: [], covered: [], overlap: [] };
  // 1. 超出螢幕（不在捲動容器裡的）
  for (const e of all) {
    if (!(e.matches(INTER) || hasText(e) || e.matches('.game-panel,#topbar,#bottom-bar,#modal,[data-icon]'))) continue;
    if (scrollAnc(e)) continue;
    const r = e.getBoundingClientRect();
    const d = Math.max(-r.left, -r.top, r.right - vw, r.bottom - vh);
    if (d > 1.5 && !(r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh)) out.offscreen.push({ e: label(e), by: Math.round(d), ...R(e) });
  }
  // 2. 被 overflow:hidden 的祖先切掉一部分（不是捲動容器）
  for (const e of all) {
    if (!(e.matches(INTER) || hasText(e) || e.matches('[data-icon],img,canvas'))) continue;
    const r = e.getBoundingClientRect();
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = ovf(a); if (/(auto|scroll)/.test(o)) break; if (!/(hidden|clip)/.test(o)) continue;
      const q = a.getBoundingClientRect(), d = Math.max(q.left - r.left, q.top - r.top, r.right - q.right, r.bottom - q.bottom);
      const fullyOut = r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom;
      if (d > 1.5 && !fullyOut) { out.cut.push({ e: label(e), by: Math.round(d), in: label(a).slice(0, 40) }); break; }
    }
  }
  // 3. 文字被自己的框截斷（overflow hidden + 內容比框大）
  for (const e of all) {
    if (!e.textContent.trim() || e.children.length > 3) continue;
    const o = ovf(e); if (!/(hidden|clip)/.test(o) && getComputedStyle(e).textOverflow !== 'ellipsis') continue;
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2) out.truncated.push({ e: label(e), sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight });
  }
  // 4. 按鈕內容超出按鈕外框（overflow visible 的溢出）
  for (const b of inter) {
    if (b.matches('canvas,.ph-stick')) continue;
    const q = b.getBoundingClientRect();
    for (const c of b.querySelectorAll('*')) {
      if (!shown(c) || c.closest('.res-float')) continue; const r = c.getBoundingClientRect();
      const d = Math.max(q.left - r.left, q.top - r.top, r.right - q.right, r.bottom - q.bottom);
      if (d > 2) { out.spill.push({ e: label(b), child: label(c).slice(0, 30), by: Math.round(d) }); break; }
    }
  }
  // 5. 點擊目標大小（WCAG 2.5.8 最小 24px；手機建議 44px）
  for (const e of inter) {
    if (e.matches('canvas')) continue;
    const r = e.getBoundingClientRect(), m = Math.min(r.width, r.height);
    if (m < 24) out.tiny.push({ e: label(e), w: Math.round(r.width), h: Math.round(r.height) });
    else if (m < 32) out.small.push({ e: label(e), w: Math.round(r.width), h: Math.round(r.height) });
  }
  // 6. 字級
  const seenT = new Set();
  for (const e of all) {
    if (!hasText(e)) continue; const fs = parseFloat(getComputedStyle(e).fontSize), k = label(e);
    if (seenT.has(k)) continue; seenT.add(k);
    if (fs < 10) out.tinyText.push({ e: k, fs }); else if (fs < 11) out.smallText.push({ e: k, fs });
  }
  // 7. 按鈕被別的東西蓋住（中心點拿到的不是自己）
  //    inside a scroll box: judge it where the player would scroll it to (centre of the box), not where it sits below the fold
  for (const e of inter) {
    const sa = scrollAnc(e), keep = sa && [sa.scrollTop, sa.scrollLeft];
    if (sa) e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (!(x < 0 || y < 0 || x > vw || y > vh)) {
      const t = document.elementFromPoint(x, y);
      if (t && t !== e && !e.contains(t) && !t.contains(e)) out.covered.push({ e: label(e), by: label(t).slice(0, 40) });
    }
    if (sa) { sa.scrollTop = keep[0]; sa.scrollLeft = keep[1]; }
  }
  // 8. 畫面上的 UI 區塊互相重疊
  const BLOCKS = '#topbar,#left-panel,#reopen-left,#inspector,#region-badge,.world-map-trigger,.world-minimap,.zone-tools,.view-tools,#placement,#boss-bar,.notice-feed,.skill-buttons,#bottom-bar,#pause-label,.map-hint,#toasts>*,#pilotlab,#pilot-hud .ph-stick,#pilot-hud .ph-actions,#poselab';
  const blocks = scope ? [] : [...document.querySelectorAll(BLOCKS)].filter(shown);
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i].getBoundingClientRect(), b = blocks[j].getBoundingClientRect();
    if (blocks[i].contains(blocks[j]) || blocks[j].contains(blocks[i])) continue;
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ix > 3 && iy > 3) out.overlap.push({ a: label(blocks[i]).slice(0, 34), b: label(blocks[j]).slice(0, 34), ix: Math.round(ix), iy: Math.round(iy) });
  }
  // 9. 整頁能不能捲（遊戲應該不能）
  out.page = { sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight };
  // 10. 視窗
  const m = document.querySelector('#modal'), bd = document.querySelector('#modal-backdrop');
  if (m && bd && shown(bd)) {
    const c = document.querySelector('#modal-content'), x = document.querySelector('#modal [data-action=close]');
    out.modal = { ...R(m), hPct: Math.round(m.getBoundingClientRect().height / vh * 100), scroll: c ? [c.scrollHeight, c.clientHeight] : null, close: x ? R(x) : null };
  }
  // 11. 遊戲畫面被 UI 擋住的比例（格點取樣看是不是落在 UI 區塊上）
  if (!scope) { let n = 0, hit = 0; const bl = blocks.map(b => b.getBoundingClientRect());
    for (let y = 2; y < vh; y += 8) for (let x = 2; x < vw; x += 8) { n++; if (bl.some(q => x >= q.left && x <= q.right && y >= q.top && y <= q.bottom)) hit++; }
    out.uiCover = Math.round(hit / n * 100); out.blocks = blocks.map(b => ({ e: label(b).slice(0, 30), ...R(b) })); }
  // 12. text squeezed into a vertical column (1–2 characters per line): the box is too narrow for its label
  out.squeezed = [];
  for (const e of all) {
    if (!hasText(e)) continue;
    const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/\s+/g, '');
    if (txt.length < 3) continue;
    const rg = document.createRange(), tops = new Set();
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 0) tops.add(Math.round(q.top)); }
    if (tops.size >= 3 && txt.length / tops.size <= 2.5) out.squeezed.push({ e: label(e), chars: txt.length, lines: tops.size, w: Math.round(e.getBoundingClientRect().width) });
  }
  // 13. modal content scrolls sideways (something is wider than the modal)
  const mc = scope && document.querySelector('#modal-content');
  if (mc && shown(mc) && mc.scrollWidth > mc.clientWidth + 1) out.hscroll = [{ e: 'modal-content', sw: mc.scrollWidth, cw: mc.clientWidth }];
  for (const k of Object.keys(out)) if (Array.isArray(out[k]) && !out[k].length) delete out[k];
  return out;
};

// 網址列顯示時 vh 會比可視高度大：把內嵌樣式的 vh 換成 px（bar=0 還原）
const SET_VH = (bar) => {
  const st = [...document.querySelectorAll('style')].find(s => s.textContent.includes('#modal-backdrop'));
  if (!st) return 'no-style'; st.__orig ??= st.textContent;
  st.textContent = bar ? st.__orig.replace(/(\d+(?:\.\d+)?)vh\b/g, (_, n) => (n * (innerHeight + bar) / 100).toFixed(1) + 'px') : st.__orig;
  return (st.__orig.match(/\d+(?:\.\d+)?vh\b/g) || []).length;
};

async function runDevice(dev) {
  const eng = dev.engine === 'webkit' ? webkit : chromium;
  const browser = await eng.launch(dev.engine === 'chromium' ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] } : {});
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, isMobile: !dev.desktop, hasTouch: !dev.desktop, ...(dev.ua ? { userAgent: dev.ua } : {}), locale: 'zh-TW' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  const dir = OUT + (process.env.SHOTS || '') + dev.name + '/'; fs.mkdirSync(dir, { recursive: true });
  const res = { device: dev, screens: {} };
  await page.goto(URL, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#loading', { timeout: 120000 }).catch(() => {});
  await sleep(1500); await page.screenshot({ path: dir + '00-loading.png' }).catch(() => {});
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && (!l || l.classList.contains('hidden') || getComputedStyle(l).display === 'none' || +getComputedStyle(l).opacity === 0); }, null, { timeout: 240000 });
  await sleep(3000);
  if (process.env.INJECT) await page.addStyleTag({ content: fs.readFileSync(process.env.INJECT, 'utf8') });   // 試排版用：把 CSS 檔疊上去
  res.env = await page.evaluate(() => ({ coarse: matchMedia('(pointer:coarse)').matches, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight }));
  const closeAll = async () => { await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); }); await sleep(250); };
  const click = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
  const SCREENS = (process.env.SCREENS || '').split(',').filter(Boolean);
  const shot = async (name, scope, note) => {
    if (SCREENS.length && !SCREENS.some(x => name.startsWith(x))) return;
    await sleep(500);
    const a = await page.evaluate(AUDIT, scope || null);
    await page.screenshot({ path: dir + name + '.png' });
    await page.evaluate(SET_VH, dev.bar); await sleep(200);
    const b = await page.evaluate(AUDIT, scope || null);
    const diff = {}; for (const k of ['offscreen', 'cut', 'covered', 'overlap', 'modal']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff[k] = b[k] ?? '(none)';
    if (Object.keys(diff).length) { diff.vhPx = dev.h + dev.bar; await page.screenshot({ path: dir + name + '-bar.png' }); }
    await page.evaluate(SET_VH, 0); await sleep(150);
    res.screens[name] = { note, ...a, withBar: Object.keys(diff).length ? diff : undefined };
  };
  // 2026-10-30: open every modal by firing its data-action through a hidden button (same as buttons.mjs); rich state so every list has rows
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 });
    for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
  const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
  const hid = await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0]?.id);
  await shot('01-village');
  for (const [n, a, id, tab] of MODALS) {
    if (SCREENS.length && !SCREENS.some(x => n.startsWith(x))) continue;
    await closeAll(); await act(a, a === 'hunter' ? hid : id); if (tab) await act('craftTab', tab); await sleep(300);
    if (await page.evaluate(() => document.querySelector('#modal-backdrop').classList.contains('hidden'))) { res.screens[n] = { missing: a }; continue; }
    await shot(n, '#modal-backdrop');
  }
  await closeAll(); await act('selectBuilding', 'forge'); await sleep(400); await shot('19-inspector'); await closeAll();
  res.errors = errs;
  await browser.close();
  return res;
}

fs.mkdirSync(OUT, { recursive: true });
const REPORT = OUT + (process.env.REPORT || 'report.json');
const report = fs.existsSync(REPORT) && process.env.SCREENS ? JSON.parse(fs.readFileSync(REPORT, 'utf8')) : {};
const pick = n => ONLY.length ? ONLY.includes(n) : DEFAULT.includes(n);
for (const d of DEVICES) {
  if (!pick(d.name)) continue;
  const t0 = Date.now();
  try { report[d.name] = await runDevice(d); } catch (e) { report[d.name] = { fail: String(e).slice(0, 300) }; }
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 1));
  console.log(d.name, ((Date.now() - t0) / 1000).toFixed(0) + 's', report[d.name].fail || '', (report[d.name].errors || []).join(' | '));
}
// Summary: per device × screen, FIX and READ = must be 0, info = look but optional. Items already listed on an earlier screen of the same device are not repeated.
const MUST = ['offscreen', 'cut', 'truncated', 'spill', 'covered', 'squeezed', 'hscroll', 'tiny'], INFO = ['small', 'overlap'];
const lines = [];
for (const [dn, d] of Object.entries(report)) {
  if (!pick(dn)) continue;
  lines.push(`===== ${dn} ${d.fail || ''} page errors: ${(d.errors || []).join(' | ') || 'none'}`);
  const seen = new Set(); let must = 0;
  for (const [s, v] of Object.entries(d.screens || {})) {
    const out = [];
    if (v.missing) out.push(`  FIX did not open: ${v.missing}`), must++;
    for (const k of [...MUST, ...INFO]) {
      const fresh = (v[k] || []).filter(it => { const key = k + JSON.stringify({ ...it, l: 0, t: 0, r: 0, b: 0 }); return seen.has(key) ? false : seen.add(key); });
      if (!fresh.length) continue; if (MUST.includes(k)) must += fresh.length;
      out.push(`  ${MUST.includes(k) ? 'FIX ' : 'info'} ${k}: ` + fresh.slice(0, 6).map(it => JSON.stringify(it)).join(' / ') + (fresh.length > 6 ? ` …+${fresh.length - 6}` : ''));
    }
    // READ = text under 11px on phones (decorative symbols and hidden icon labels with font-size 0 are skipped)
    if (!d.device?.desktop) {
      const read = [...(v.tinyText || []), ...(v.smallText || [])].filter(it => it.fs > 0 && /[\p{L}\p{N}]/u.test((it.e.match(/"(.*)$/) || [, ''])[1]) && !seen.has('read' + it.e) && seen.add('read' + it.e));
      if (read.length) { must += read.length; out.push(`  READ text<11px (${read.length}): ` + read.slice(0, 12).map(it => it.e.slice(0, 34) + '=' + +it.fs.toFixed(1)).join(' | ') + (read.length > 12 ? ` …+${read.length - 12}` : '')); }
    }
    const wb = v.withBar ? ['offscreen', 'cut', 'covered'].filter(k => Array.isArray(v.withBar[k]) && v.withBar[k].length) : [];
    if (wb.length) { must += wb.length; out.push('  FIX withBar (URL bar shown): ' + wb.map(k => k + ' ' + JSON.stringify(v.withBar[k]).slice(0, 200)).join(' / ')); }
    if (out.length) lines.push('-- ' + s, ...out);
  }
  lines.push(`== ${dn}: ${must} FIX items`);
}
fs.writeFileSync(OUT + 'summary.txt', lines.join('\n') + '\n'); console.log(lines.join('\n'));
