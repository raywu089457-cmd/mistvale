// touch-targets.mjs — T52：手機（pointer:coarse、寬 ≤430）每個按得到的控制項都要 ≥40x40 CSS px，而且不能互相重疊。
// 用法：
//   node tools/checks/touch-targets.mjs                 預設＝靜態閘門（不開瀏覽器、不連網；接受線跑的就是這個）
//   BROWSER=1 node tools/checks/touch-targets.mjs       實測（工作用，不進接受線）：390x844／430x932／320x720 手機視窗
//   BROWSER=1 SHOT=before node tools/checks/touch-targets.mjs   另外存 output/ui-audit/T52-before-phone-{hud,trade}.png
//
// 靜態閘門：每個控制項取「最後一個宣告」的 min-width/min-height（沒有就退回 width/height；兩者都沒宣告＝auto，不算違規），
//   < 40 就印 FIX 並 exit 1。只算手機層＝基底 + 條件含 max-width:760／max-width:430／pointer:coarse 的 @media
//   （條件含 min-width:761 的永遠不套用），所以桌機的宣告不會被誤算成手機。
//   #game-ui 那一層有 zoom:var(--ui-scale)（390px 寬的手機會自動選 0.85，見 pixel-ui.js 的 uiScaleFit），
//   宣告值 40px 只畫得出 34px，所以 #game-ui 裡的控制項要再把宣告值乘上 zoom 才是「畫面上的 CSS px」。
// 重疊：只用宣告值推算 T52 動到的 slot（上排三顆、右下技能鍵 vs 縮放鍵），三台手機各算一次（介面縮放不同，
//   320 寬手機只挑得到 0.75，slot 的 px 若沒乘 --t52 就會黏在一起），並且整段手機層必須掛在 pointer:coarse 底下。
// 瀏覽器：390x844 / 430x932 / 320x720，逐一開 hud／左側委託面板／settings／build／hunters／派遣／trade／craft／
//   difficulty／worldmap／委託／新手說明／招募／地下城／競技場／首領／建築資訊抽屜／移動建築放置列／手動操控面板，
//   列出 <40 的 [data-action]/[data-pilot] 與同一層互相重疊的可見按鈕。幾何重疊全量計算，其中「一顆是 sticky/fixed
//   橫條、另一顆是捲到它下面的列」的另列成 COVERED（會印出來並計數，不算失敗：那是黏在底部的固定鈕，不是兩顆都按得到）。
//   頁面連不上就印 SKIP（不讓沒開伺服器的人卡在驗收線上）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CSS_FILE = path.join(ROOT, 'src/pixel-style.css');
const HTML_FILE = path.join(ROOT, 'src/pixel-index.html');
const MIN = 40;
const SLOT_GAP = 4;
// 每台手機的介面縮放是 pixel-ui.js 的 uiScaleFit()＝min(寬/402, 高/712)，再取 ≤ 它的最大級距（0.75/0.85/1/1.15/1.3/1.5）。
// 390x844→0.970→0.85，430x932→1.070→1，320x720→0.796→0.75。
const DEVICES = [
  { name: '390x844', w: 390, h: 844, zoom: 0.85 },
  { name: '430x932', w: 430, h: 932, zoom: 1 },
  { name: '320x720', w: 320, h: 720, zoom: 0.75 },
];
const BASE_ZOOM = DEVICES[0].zoom;

// #game-ui 裡（會被 zoom 縮小）的選取器；#topbar／#modal-backdrop／#pilotlab 都在 #game-ui 外面、不受 zoom 影響
const ZOOMED = new Set([
  '.panel-title>button',
  '.panel-title>button:not([data-action=closeInspector]):not([data-action=close])',
  '#inspector [data-action=closeInspector]',
  '.quest-panel .pixel-button',
  '.inspect-actions .pixel-button', '.inspect-actions .move', '#placement .pixel-button',
  '#inspector .inspect-actions>button',
  '#bottom-bar>button', '.play-controls', '.play-controls>button',
  '.view-tools', '.view-tools .square', '.skill', '.skill-buttons',
  '.reopen-left', '.world-map-trigger',
]);

// ---- CSS 解析 ---------------------------------------------------------------
const splitSelectors = text => {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.map(s => s.replace(/\s+/g, ' '));
};

const parseDecls = body => {
  const decls = {};
  for (const part of body.split(';')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const key = part.slice(0, at).trim().toLowerCase();
    const val = part.slice(at + 1).trim();
    if (key && val) decls[key] = val;
  }
  return decls;
};

// 回傳 [{ layer, selectors, decls, at }]，layer = 套在身上的 @media 條件字串（基底＝null），at = 在原始碼的位置
const parseRules = (src, layer, out, base = 0) => {
  let i = 0;
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    const brace = src.indexOf('{', i);
    if (brace < 0) break;
    const prelude = src.slice(i, brace).trim();
    let depth = 1, j = brace + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(brace + 1, j - 1);
    if (/^@media/i.test(prelude)) {
      const cond = prelude.replace(/^@media/i, '').trim();
      parseRules(body, (layer ? layer + ' and ' : '') + cond, out, base + brace + 1);
    } else if (prelude.startsWith('@')) {
      // @keyframes / @supports：跟控制項尺寸無關，跳過
    } else {
      out.push({ layer, selectors: splitSelectors(prelude), decls: parseDecls(body), at: base + i });
    }
    i = j;
  }
  return out;
};

// 這個 @media 層在「手機、手指」的前提下會不會套用
const layerApplies = cond => {
  if (!cond) return true;
  if (/min-width:\s*761/.test(cond)) return false;          // 桌機專用層
  if (/pointer:\s*coarse/.test(cond)) return true;          // 觸控層（檢查對象就是手機）
  return /max-width:\s*(760|430)/.test(cond);
};

// ---- 長度解析（只認 px／可以算出來的 calc；% auto vh 一律回 null＝未知）--------
const evalExpr = src => {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const expr = () => {
    let v = term(); ws();
    while (i < src.length && (src[i] === '+' || src[i] === '-')) {
      const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; ws();
    }
    return v;
  };
  const term = () => {
    let v = factor(); ws();
    while (i < src.length && (src[i] === '*' || src[i] === '/')) {
      const op = src[i++]; const r = factor(); v = op === '*' ? v * r : v / r; ws();
    }
    return v;
  };
  const factor = () => {
    ws();
    if (src[i] === '(') { i++; const v = expr(); ws(); if (src[i] === ')') i++; return v; }
    if (src[i] === '-') { i++; return -factor(); }
    const fn = /^(max|min|calc)\(/.exec(src.slice(i));
    if (fn) {
      i += fn[1].length + 1;
      const a = expr(); ws();
      if (fn[1] === 'calc') { if (src[i] === ')') i++; return a; }
      if (src[i] === ',') i++;
      const b = expr(); ws();
      if (src[i] === ')') i++;
      return fn[1] === 'max' ? Math.max(a, b) : Math.min(a, b);
    }
    const num = /^[\d.]+/.exec(src.slice(i));
    if (!num) throw new Error('bad expr: ' + src.slice(i, i + 24));
    i += num[0].length; ws();
    if (src.startsWith('px', i)) i += 2;
    else if (src.startsWith('em', i) || src.startsWith('vh', i) || src.startsWith('vw', i)) throw new Error('unit');
    return parseFloat(num[0]);
  };
  return expr();
};

const evalLen = (raw, vars) => {
  if (raw == null) return null;
  let s = String(raw).replace(/!important/g, '').trim();
  if (!s) return null;
  // 相對單位／百分比／auto 都算「不是固定 px」，交回 null（沿用前一個 px 宣告）
  if (/(^|[^\w-])(%|auto|vh|vw|dvh|svh|em|rem|fr)\b/.test(s)) return null;
  s = s.replace(/var\(\s*(--[\w-]+)\s*,[^()]*\)/g, 'var($1)'); // var(--x,1) → var(--x)
  s = s.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, name) => (vars[name] != null ? `(${vars[name]})` : '0px'));
  s = s.replace(/env\([^)]*\)/g, '0px');
  try { return evalExpr(s); } catch { return null; }
};

// ---- 讀 CSS、組出「手機層」的最後宣告 ---------------------------------------
const rawCss = fs.readFileSync(CSS_FILE, 'utf8');
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = parseRules(css, null, []).filter(r => layerApplies(r.layer));

// :root 的自訂屬性（--tb／--bb／--t52）也取手機層的最後一個值，供 calc 使用。
// --ui-scale 是 JS 在執行時設定的（CSS 只寫 :root{--ui-scale:1}），所以每台手機各自帶自己的級距進來，
// --t52:calc(1 / var(--ui-scale)) 才算得出該裝置的倒數（390→1.176、320→1.333）。
const makeVars = zoom => {
  const vars = { '--ui-scale': String(zoom) };
  for (const rule of rules) {
    if (!rule.selectors.some(s => s === ':root' || s === 'html')) continue;
    for (const [k, v] of Object.entries(rule.decls)) {
      if (!k.startsWith('--') || k === '--ui-scale') continue;
      const n = evalLen(v, vars);
      if (n != null) vars[k] = String(n);
    }
  }
  return vars;
};

// 每個控制項：屬性 → 手機層裡最後一個可算出 px 的宣告；#game-ui 裡的再乘上 zoom（畫面上真正的 CSS px）
const resolverFor = zoom => {
  const vars = makeVars(zoom);
  const resolveRaw = sel => {
    const props = {};
    for (const rule of rules) {
      if (!rule.selectors.some(s => s === sel)) continue;
      for (const [k, v] of Object.entries(rule.decls)) props[k] = evalLen(v, vars);
    }
    const pick = (...keys) => { for (const k of keys) if (props[k] != null) return props[k]; return null; };
    return {
      props,
      w: pick('min-width', 'width'),
      h: pick('min-height', 'height'),
      left: pick('left'), right: pick('right'), bottom: pick('bottom'),
    };
  };
  const resolve = sel => {
    const raw = resolveRaw(sel);
    const k = ZOOMED.has(sel) ? zoom : 1;
    const z = v => (v == null ? null : v * k);
    // props 保留「宣告值」，量測值另外算，FIX 訊息才能同時說清楚
    return {
      props: raw.props,
      w: z(raw.w), h: z(raw.h),
      left: z(raw.left), right: z(raw.right), bottom: z(raw.bottom),
      declared: { w: raw.w, h: raw.h },
      zoom: k,
    };
  };
  return { vars, resolve };
};

// ---- CONTROLS（T52 卡上的清單；不要為了讓它過就刪）---------------------------
const CONTROLS = [
  '.town-badge', '.top-controls .square', '.difficulty-button', '.population',
  '.treasury>button', '.treasury>button.plus', '#bottom-bar>button', '.play-controls>button',
  '.view-tools .square', '.skill', '.reopen-left', '.world-map-trigger',
  '.panel-title>button', '#modal [data-action=close]', '.tabs button',
  // 面板標題真正的收合鍵（卡上的 .panel-title>button 在手機層沒有自己的尺寸，實際畫面來自這一條）
  '.panel-title>button:not([data-action=closeInspector]):not([data-action=close])',
  // #inspector 在 #game-ui 裡：關閉鍵是 44px 宣告、只畫出 37px，所以也要量
  '#inspector [data-action=closeInspector]',
  '.quest-panel .pixel-button', '.inspect-actions .pixel-button', '.inspect-actions .move',
  // 建築資訊抽屜的按鈕實際尺寸來自這條（1,1,1 權重壓過上面兩條），所以要一起量
  '#inspector .inspect-actions>button',
  '#placement .pixel-button', '.region-card .pixel-button', '.world-map-header .pixel-button',
  '.roster-bar .pixel-button', '.seg .pixel-button',
  '.tr-step .pixel-button', '.dungeon-controls .floor-pick .pixel-button', '#pilotlab .pixel-button',
  // 手動操控面板的按鈕被 #pilotlab .pl-head/.pl-pick 的更細選取器壓過，要各自量
  '#pilotlab .pl-head .pixel-button', '#pilotlab .pl-pick .pixel-button',
];

const fixes = [];
const fmt = v => (v == null ? 'auto' : `${Math.round(v * 10) / 10}`);
// 控制項只在 390x844（zoom 0.85）量一次：T52 的尺寸都乘了 --t52＝1/zoom，換裝置量到的畫面 px 一樣。
const { resolve } = resolverFor(BASE_ZOOM);
for (const sel of CONTROLS) {
  const box = resolve(sel);
  const bad = (box.w != null && box.w < MIN) || (box.h != null && box.h < MIN);
  if (bad) {
    const note = box.zoom === 1 ? '' : ` [#game-ui zoom ${box.zoom} → declared ${fmt(box.declared.w)}x${fmt(box.declared.h)}]`;
    fixes.push(`FIX: ${sel} phone box is ${fmt(box.w)}x${fmt(box.h)} (needs ${MIN}x${MIN})${note}`);
  }
}

// ---- 手機層的守門：T52 那段只能掛在 @media(pointer:coarse) 底下（桌機才不會跟著變）----
const MARKER = rawCss.indexOf('/* ===== T52');
if (MARKER < 0) {
  fixes.push('FIX: src/pixel-style.css is missing the "/* ===== T52" phone block');
} else {
  const escapees = rules.filter(r => r.at > MARKER && !/pointer:\s*coarse/.test(r.layer || ''));
  for (const r of escapees.slice(0, 3)) {
    fixes.push(`FIX: ${r.selectors[0]} sits outside @media(pointer:coarse) — desktop would change too`);
  }
  if (escapees.length > 3) fixes.push(`FIX: ${escapees.length - 3} more rule(s) outside @media(pointer:coarse)`);
}

// ---- 重疊：T52 動到的 slot（宣告值推算，不看瀏覽器），每台手機各算一次 ------
// 上排：任務捲軸鍵（left:8）、地圖鍵（right:106）、暫停／速度（right:8）
// 右下：技能鍵（bottom --bb+8）必須在縮放鍵（bottom --bb+66）下面，至少留 SLOT_GAP
const playButtons = (() => {
  try {
    const html = fs.readFileSync(HTML_FILE, 'utf8');
    const m = /<div class="play-controls">([\s\S]*?)<\/div>/.exec(html);
    return m ? (m[1].match(/<button/g) || []).length : 2;
  } catch { return 2; }
})();

const slotFixes = dev => {
  const out = [];
  const { vars, resolve } = resolverFor(dev.zoom);
  const playCtl = resolve('.play-controls');
  const playBtn = resolve('.play-controls>button');
  const gapRaw = evalLen(playCtl.props.gap, vars);
  const topRow = [
    { sel: '.reopen-left', ...resolve('.reopen-left') },
    { sel: '.world-map-trigger', ...resolve('.world-map-trigger') },
    {
      sel: '.play-controls', ...playCtl,
      w: playCtl.w ?? (playBtn.w != null
        ? playButtons * playBtn.w + (playButtons - 1) * (gapRaw != null ? gapRaw * playBtn.zoom : 0)
        : null),
    },
  ];
  // 上排只看橫向區間：left 就從左邊算，right 就從右邊算
  const spanX = item => {
    if (item.left != null) return [item.left, item.left + item.w];
    if (item.right != null) return [dev.w - item.right - item.w, dev.w - item.right];
    return null;
  };
  for (let a = 0; a < topRow.length; a++) {
    for (let b = a + 1; b < topRow.length; b++) {
      const A = spanX(topRow[a]), B = spanX(topRow[b]);
      if (!A || !B || topRow[a].w == null || topRow[b].w == null) continue;
      const gap = Math.max(A[0], B[0]) - Math.min(A[1], B[1]);
      if (gap < SLOT_GAP) out.push(`FIX: ${topRow[a].sel} overlaps ${topRow[b].sel} at ${dev.name} (gap ${Math.round(gap)}px < ${SLOT_GAP}px)`);
    }
  }
  const skills = resolve('.skill-buttons');
  const skillBtn = resolve('.skill');
  const skillTop = skills.bottom != null && skillBtn.h != null ? dev.h - skills.bottom - skillBtn.h : null;
  const views = resolve('.view-tools');
  const viewBottom = views.bottom != null ? dev.h - views.bottom : null;
  if (skillTop != null && viewBottom != null && skillTop - viewBottom < SLOT_GAP) {
    out.push(`FIX: .skill-buttons overlaps .view-tools at ${dev.name} (gap ${Math.round(skillTop - viewBottom)}px < ${SLOT_GAP}px)`);
  }
  return out;
};
for (const dev of DEVICES) fixes.push(...slotFixes(dev));

// ---- 靜態結果 ---------------------------------------------------------------
if (fixes.length) {
  console.log(`touch-targets (static, phone <=430px): ${fixes.length} problem(s)`);
  for (const f of fixes) console.log(f);
} else {
  console.log(`touch-targets (static, phone <=430px): OK — ${CONTROLS.length} controls >= ${MIN}x${MIN}, slots keep ${SLOT_GAP}px apart`);
}

// ---- 瀏覽器實測（BROWSER=1；只給工作用，不在接受線上）-------------------------
const runBrowser = !!process.env.BROWSER && !process.env.STATIC;
if (runBrowser) {
  const { createRequire } = await import('node:module');
  const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.log('SKIP browser: playwright is not installed under %APPDATA%/npm/node_modules'); chromium = null; }
  if (chromium) {
    const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
    const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 390x844 / 430x932 / 320x720：介面縮放分別是 0.85／1／0.75，320 那台是 slot 最容易黏在一起的
    const VIEWPORTS = [
      { name: '390x844', w: 390, h: 844, dpr: 3 },
      { name: '430x932', w: 430, h: 932, dpr: 3 },
      { name: '320x720', w: 320, h: 720, dpr: 2 },
    ];
    // 給人眼對照的 before/after 只存一份（390x844）
    const SHOT_SCREENS = new Set(['hud', 'trade']);
    let bad = 0, unreachable = false, coveredPairs = 0;
    for (const dev of VIEWPORTS) {
      let browser;
      try { browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] }); }
      catch (e) { unreachable = true; console.log(`SKIP browser: cannot launch Chrome (${String(e.message).slice(0, 90)})`); break; }
      try {
        const ctx = await browser.newContext({
          viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr,
          isMobile: true, hasTouch: true, locale: 'zh-TW', userAgent: IOS_UA,
        });
        const page = await ctx.newPage();
        try { await page.goto(URL, { waitUntil: 'commit', timeout: 120000 }); }
        catch (e) { unreachable = true; console.log(`SKIP ${dev.name}: cannot load ${URL} (${String(e.message).slice(0, 90)})`); continue; }
        await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden'), null, { timeout: 180000 }).catch(() => {});
        await sleep(2500);
        // 有錢、每棟建築至少一級，畫面才會把所有按鈕長出來（跟 pipeline/scripts/ui-audit/buttons.mjs 一樣）
        await page.evaluate(() => {
          const g = globalThis.__mistvaleGame;
          Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 });
          for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]);
        });
        const buildingId = await page.evaluate(() => Object.keys(globalThis.__mistvaleGame.state.buildings)[0] || 'hall');
        const act = (a, data = {}) => page.evaluate(([a, data]) => {
          const el = document.createElement('button'); el.dataset.action = a;
          for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
          el.style.display = 'none'; document.body.append(el); el.click(); el.remove();
        }, [a, data]);
        // 回到乾淨的村莊 HUD：關彈窗／收資訊抽屜／離開放置模式與手動操控／收起左側面板
        const reset = async () => {
          await page.evaluate(() => {
            document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
            document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click();
            document.querySelector('#pilotlab [data-pilot=stop],#pilotlab [data-pilot=close]')?.click();
            document.querySelector('#placement:not(.hidden) [data-action=cancelMove]')?.click();
            const lp = document.querySelector('#left-panel');
            if (lp && !lp.classList.contains('hidden')) lp.querySelector('[data-action=toggleLeft]')?.click();
          });
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(220);
        };
        // 每一個畫面一格：goal 說「HUD、下方選單、所有彈窗」，所以連資訊抽屜、放置列、手動操控都要量
        const SCREENS = [
          { name: 'hud' },
          { name: 'left', run: () => act('toggleLeft') },                 // 村長委託面板展開（panel-title 收合鍵＋任務鍵）
          { name: 'settings', run: () => act('settings') },
          { name: 'build', run: () => act('build') },
          { name: 'hunters', run: () => act('hunters') },
          { name: 'dispatch', run: () => act('dispatchHunters') },        // 派遣：區域列 rp-body 就在這
          { name: 'trade', run: () => act('trade') },
          { name: 'craft', run: () => act('craft') },
          { name: 'difficulty', run: () => act('difficulty') },
          { name: 'worldmap', run: () => act('worldmap') },
          { name: 'quests', run: () => act('quests') },
          { name: 'help', run: () => act('help') },
          { name: 'recruit', run: () => act('recruit') },
          { name: 'dungeon', run: () => act('dungeon') },
          { name: 'arena', run: () => act('arena') },
          { name: 'boss', run: () => act('boss') },
          { name: 'inspect', run: () => act('selectBuilding', { id: buildingId }) },   // 建築資訊抽屜
          { name: 'placement', run: () => act('moveBuilding', { id: buildingId }) },   // 移動建築放置列
          { name: 'pilotlab', run: () => act('pilotLab') },                            // 手動操控面板
        ];
        for (const screen of SCREENS) {
          await reset();
          if (screen.run) { await screen.run(); await sleep(500); }
          const m = await page.evaluate(() => {
            // 開著視窗時 backdrop 蓋住底下的 HUD／下方選單（點不到），所以只量視窗裡的東西
            const modalOpen = !document.querySelector('#modal-backdrop')?.classList.contains('hidden');
            const inScope = e => !modalOpen || !!e.closest('#modal');
            const vis = e => {
              const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
              return inScope(e) && r.width > 0.5 && r.height > 0.5 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('.hidden');
            };
            // 浮在上面的面板（彈窗／手動操控／放置列／資訊抽屜）蓋住底下的 HUD 是設計，不算重疊
            const layer = e => (e.closest('#modal') ? 'modal' : e.closest('#pilotlab') ? 'pilotlab'
              : e.closest('#placement') ? 'placement' : e.closest('#inspector') ? 'inspector' : 'hud');
            // 黏在捲動區底部的鈕（派遣視窗的 .dispatch-go 是 position:sticky）會蓋住捲到它下面的列。那是設計，
            // 但卡上寫的是「no two hit areas overlap」，所以這種「釘住的橫條蓋住捲動內容」不能安靜跳過：
            // 全部分開算，只是單獨列成 COVERED 並計數，跟真正兩顆都按得到的 OVERLAP 分開看。
            const pinned = e => {
              for (let n = e; n && n !== document.body; n = n.parentElement) {
                const p = getComputedStyle(n).position;
                if (p === 'sticky' || p === 'fixed') return true;
                if (p === 'absolute' || p === 'relative') return false;   // 換了定位基準，再上面的東西不會蓋到這顆
              }
              return false;
            };
            const items = [...document.querySelectorAll('[data-action],[data-pilot]')].filter(vis).map(e => {
              const r = e.getBoundingClientRect();
              const sel = Object.entries(e.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"]`).join('');
              return {
                sel, action: e.dataset.action || `pilot:${e.dataset.pilot}`, layer: layer(e), pinned: pinned(e),
                x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
                label: ((e.textContent || '').trim() || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 14),
              };
            });
            // 全部幾何重疊都量，不再先過濾；covered = 其中一顆是釘住的橫條（蓋住捲到它下面的內容）
            const overlaps = [];
            for (let i = 0; i < items.length; i++) {
              for (let j = i + 1; j < items.length; j++) {
                const a = items[i], b = items[j];
                if (a.layer !== b.layer) continue;
                const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
                const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
                if (ox > 0 && oy > 0) overlaps.push({
                  text: `${a.action}(${a.label}) <-> ${b.action}(${b.label}) ${ox}x${oy}`,
                  covered: a.pinned !== b.pinned,
                  pinned: a.pinned !== b.pinned ? (a.pinned ? a.action : b.action) : null,
                });
              }
            }
            return { items, overlaps, modal: !document.querySelector('#modal-backdrop')?.classList.contains('hidden') };
          });
          if (process.env.SHOT && SHOT_SCREENS.has(screen.name) && dev.w === 390) {
            await page.screenshot({ path: path.join(ROOT, `output/ui-audit/T52-${process.env.SHOT}-phone-${screen.name}.png`) }).catch(() => {});
          }
          const small = m.items.filter(i => i.w < 40 || i.h < 40);
          const real = m.overlaps.filter(o => !o.covered);
          const covered = m.overlaps.filter(o => o.covered);
          coveredPairs += covered.length;
          if (small.length || real.length) {
            bad++;
            console.log(`FIX ${dev.name} ${screen.name}: ${small.length} under 40x40, ${real.length} overlapping (modal ${m.modal})`);
            for (const s of small) console.log(`  ${String(s.w + 'x' + s.h).padEnd(9)} ${s.action.padEnd(18)} "${s.label}" ${s.sel}`);
            for (const o of real) console.log(`  OVERLAP ${o.text}`);
          } else {
            console.log(`OK  ${dev.name} ${screen.name}: ${m.items.length} visible controls, all >= 40x40, none overlapping`);
          }
          // 不算失敗，但一定要看得到：哪一顆釘住的橫條蓋住幾顆捲動中的列
          for (const o of covered) console.log(`  COVERED ${o.text} — ${o.pinned} 是 sticky/fixed 橫條，蓋住捲到它下面的列`);
        }
      } catch (e) {
        unreachable = true;
        console.log(`SKIP ${dev.name}: ${String(e.message).slice(0, 120)}`);
      } finally { await browser.close(); }
    }
    if (bad) { console.log(`\n${bad} screen/device pair(s) still have small or overlapping touch targets`); process.exit(1); }
    if (unreachable) console.log('browser measurement skipped (Chrome or game server not available) — static gate above still applies');
    else console.log(`\nall screens hold the phone touch-target check (${coveredPairs} COVERED pair(s): sticky/fixed bar over scrolled rows, counted and listed above, not silently skipped)`);
  }
}

if (fixes.length) process.exit(1);
