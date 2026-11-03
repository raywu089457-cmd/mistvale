// topbar-plus-label.mjs — T50: the lone `+` at the end of the top resource bar must say what it does
// (visible short label + aria-label/title), without making the top bar wrap on a 375px phone.
// Static: reads src/pixel-index.html + src/pixel-style.css as text, prints one `FIX: ...` per failure, exit 1.
// SHOTS=1 SHOT=before|after also drives Playwright for the human-review screenshots (nothing else uses it).
// Usage: node tools/checks/topbar-plus-label.mjs
//        SHOTS=1 SHOT=before node tools/checks/topbar-plus-label.mjs
import fs from 'node:fs';

const HTML_FILE = 'src/pixel-index.html';
const CSS_FILE = 'src/pixel-style.css';
const html = fs.readFileSync(HTML_FILE, 'utf8');
const css = fs.readFileSync(CSS_FILE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// --- tiny CSS walker: every declaration block with the @media/@supports condition it sits in ---
function walk(src, media = '') {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const prelude = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(prelude)) out.push(...walk(body, media ? `${media} and ${prelude}` : prelude));
    else if (!prelude.startsWith('@')) out.push({ media, selector: prelude, body });
    i = j;
  }
  return out;
}
const RULES = walk(css);
const decl = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'i'));
  return m ? m[1].trim() : null;
};
const px = v => (v == null ? null : (v.match(/-?\d+(?:\.\d+)?/) ? Number(v.match(/-?\d+(?:\.\d+)?/)[0]) : null));
const sel = r => r.selector.replace(/\s+/g, '');
const isPlus = r => /\.treasury>button\.plus(?![:\w-])/.test(sel(r));
const isLabel = r => /\.plus-label/.test(sel(r));

const fails = [];
const fix = msg => fails.push(msg);

// (a) the button is labelled for screen readers and for hover
const btnTag = (html.match(/<button[^>]*class="[^"]*\bplus\b[^"]*"[^>]*>/) || [])[0];
if (!btnTag) fix('.treasury>button.plus not found in src/pixel-index.html');
else {
  for (const attr of ['aria-label', 'title']) {
    const m = btnTag.match(new RegExp(`${attr}="([^"]*)"`));
    if (!m || !m[1].trim()) fix(`.treasury>button.plus has no ${attr}`);
  }
  // (b) it carries a short visible label instead of the bare `＋` glyph
  const inner = html.slice(html.indexOf(btnTag) + btnTag.length, html.indexOf('</button>', html.indexOf(btnTag)));
  const span = inner.match(/<span[^>]*class="plus-label"[^>]*>([\s\S]*?)<\/span>/);
  if (!span) fix('.treasury>button.plus has no <span class="plus-label">');
  else {
    const text = span[1].replace(/<[^>]*>/g, '').trim();
    const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
    if (cjk < 1 || cjk > 3) fix(`.plus-label text "${text}" is ${cjk} CJK char(s), expected 1-3`);
    if (/^[＋+]$/.test(text)) fix('.plus-label only holds the ＋ glyph');
  }
  if (/^[＋+]$/.test(inner.replace(/<[^>]*>/g, '').trim())) fix('.treasury>button.plus content is still the bare ＋ glyph');
}

// (c) the label is not hidden or collapsed away by the plus rules
for (const r of RULES.filter(isPlus)) {
  const fs0 = decl(r.body, 'font-size');
  if (fs0 != null && /^0(?:[a-z%]*)?$/i.test(fs0)) fix(`.treasury>button.plus sets font-size:0 (${r.media || 'base'}) — the label would vanish`);
}
const labelRules = RULES.filter(isLabel);
if (!labelRules.length) fix('no .plus-label rule in src/pixel-style.css');
else {
  if (!labelRules.some(r => /nowrap/.test(decl(r.body, 'white-space') || ''))) fix('.plus-label never sets white-space:nowrap (it would wrap inside the chip)');
  for (const r of labelRules) {
    const d = decl(r.body, 'display');
    // under 370px wide the chip goes icon-only on purpose (aria-label/title keep the name); anything wider must show the text
    const narrow = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(r.media || '');
    if (d && /^none$/i.test(d) && !(narrow && +narrow[1] < 370)) fix(`.plus-label is display:none (${r.media || 'base'})`);
  }
}

// (d) phone layer: the chip stays inside the 375px resource row (375 − 8 − 8 = 359px)
const phonePlus = RULES.filter(r => isPlus(r) && /max-width:\s*760px/.test(r.media) && decl(r.body, 'max-width') != null).pop();
const phoneW = phonePlus ? px(decl(phonePlus.body, 'max-width')) : null;
const phoneMin = phonePlus ? px(decl(phonePlus.body, 'min-width')) : null;
if (phoneW == null || phoneMin == null) fix('.treasury>button.plus has no min-width/max-width in the @media(max-width:760px) phone layer');
else {
  if (phoneMin < 58) fix(`phone .treasury>button.plus min-width is ${phoneMin}px, expected >= 58 (22px icon + gap + 2 CJK chars)`);
  if (phoneW > 74) fix(`phone .treasury>button.plus max-width is ${phoneW}px, expected <= 74`);
  const need = 88 + 3 * 55 + phoneW + 4 * 4;
  if (need > 359) fix(`phone resource row needs ${need}px (88 + 3*55 + ${phoneW} + 4*4) but a 375px phone gives 359px`);
}

// (e) desktop: the chip still fits the 610px resource bar
const basePlus = RULES.filter(r => isPlus(r) && !r.media && decl(r.body, 'max-width') != null).pop();
const deskW = basePlus ? px(decl(basePlus.body, 'max-width')) : null;
if (deskW == null) fix('.treasury>button.plus has no max-width in the base layer');
else {
  const need = 135 + 3 * 85 + deskW + 4 * 4;
  if (need > 610) fix(`desktop resource bar needs ${need}px (135 + 3*85 + ${deskW} + 4*4) but .treasury max-width is 610px`);
}

if (fails.length) { for (const f of fails) console.log(`FIX: ${f}`); }
else console.log(`OK  .treasury>button.plus: labelled, ${phoneMin}-${phoneW}px on phones, ${deskW}px max on desktop`);

// --- optional screenshots + geometry for human review (the only place Playwright is used) ---
if (process.env.SHOTS) {
  const { createRequire } = await import('node:module');
  const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
  const { chromium } = require('playwright');
  const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
  const SHOT = process.env.SHOT || 'after';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const DEVICES = [
    { name: 'phone-375', w: 375, h: 812, dpr: 2, mobile: true },
    { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  ];
  const MEASURE = () => {
    const t = document.querySelector('.treasury');
    const plus = document.querySelector('.treasury>button.plus');
    const label = plus?.querySelector('.plus-label');
    const tops = [...document.querySelectorAll('.treasury>button')].map(b => Math.round(b.getBoundingClientRect().top));
    const r = plus?.getBoundingClientRect();
    return {
      bar: t ? { client: t.clientWidth, scroll: t.scrollWidth } : null,
      plus: r ? { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } : null,
      label: label ? { text: label.textContent.trim(), w: Math.round(label.getBoundingClientRect().width), font: getComputedStyle(label).fontSize } : null,
      lines: new Set(tops).size,
      vw: innerWidth,
    };
  };
  for (const dev of DEVICES) {
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
    try {
      const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, isMobile: dev.mobile, hasTouch: dev.mobile, locale: 'zh-TW' });
      const page = await ctx.newPage();
      await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden'), null, { timeout: 180000 }).catch(() => {});
      await sleep(2500);
      const m = await page.evaluate(MEASURE);
      const path = `output/ui-audit/T50-${SHOT}-${dev.name}.png`;
      await page.screenshot({ path }).catch(e => console.log(`FAIL ${dev.name}: screenshot ${path} (${String(e.message).slice(0, 80)})`));
      console.log(`SHOT ${dev.name} -> ${path} | treasury ${m.bar?.client}/${m.bar?.scroll}px | plus ${m.plus?.w}x${m.plus?.h} right ${m.plus?.right} | label "${m.label?.text}" ${m.label?.w}px ${m.label?.font} | bar lines ${m.lines}`);
    } finally { await browser.close(); }
  }
}

process.exit(fails.length ? 1 : 0);
