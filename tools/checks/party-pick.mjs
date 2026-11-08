// party-pick.mjs — T100: the team-selection cards in 派遣出征 / 地下城 / 競技場 must show
// portrait + name + level·class + attack/defence/range + hp bar with numbers, must stay
// inside #modal-content at desktop and phone widths, must toggle selection (aria-pressed +
// .pp-mark) and must mark downed hunters.
// Usage: node tools/checks/party-pick.mjs        (game server on 5024 expected; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/party-pick.mjs   also writes output/party/montage.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'module';
import fs from 'node:fs';
import { CLASSES } from '../../src/pixel-data.js';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { label: 'desktop 1440x900', width: 1440, height: 900, phone: false },
  { label: 'desktop 800x900', width: 800, height: 900, phone: false },
  { label: 'phone 402x712', width: 402, height: 712, phone: true },
  { label: 'phone 360x640', width: 360, height: 640, phone: true },
];
const MODALS = [
  { type: 'dispatch', action: 'dispatchHunters', label: '派遣出征' },
  { type: 'dungeon', action: 'dungeon', label: '地下城' },
  { type: 'arena', action: 'arena', label: '競技場' },
];
const fails = [], shots = [];
const fix = m => fails.push(m);

if (process.env.SHOTS) fs.mkdirSync('output/party', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

async function boot(dev) {
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.phone ? 2 : 1,
    isMobile: dev.phone, hasTouch: dev.phone, locale: 'zh-TW',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  try {
    await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  } catch (e) {
    return { ctx, page, errs, error: e };
  }
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame;
    g.state.paused = true;
    const hs = g.state.hunters;
    for (const h of hs) { h.hp = h.maxHp; if (h.status === '倒下') h.status = '待機'; }
    if (hs.length >= 3) {
      hs[0].hp = hs[0].maxHp * .5;                 // hurt, but selectable
      hs[1].hp = 0; hs[1].status = '倒下';         // downed
      g.setDispatchTeam(1, { ids: [hs[2].id] });   // "在第二隊" note on another tab
    }
  });
  return { ctx, page, errs, error: null };
}

async function openModal(page, action) {
  await page.evaluate(a => {
    const el = document.createElement('button');
    el.dataset.action = a; el.style.display = 'none';
    document.body.append(el); el.click(); el.remove();
  }, action);
  await page.waitForTimeout(500);
}

const MEASURE = ({ type, classes }) => {
  const g = globalThis.__mistvaleGame;
  const mc = document.querySelector('#modal'), c = document.querySelector('#modal-content');
  const bd = document.querySelector('#modal-backdrop');
  const open = !!mc && mc.dataset.type === type && !!bd && !bd.classList.contains('hidden');
  if (!c) return { open: false };
  c.scrollTop = 0;
  const cr = c.getBoundingClientRect(), mr = mc.getBoundingClientRect();
  const lineH = el => {
    const ms = getComputedStyle(el);
    return parseFloat(ms.lineHeight) || (parseFloat(ms.fontSize) || 10) * 1.3;
  };
  const cards = [...document.querySelectorAll('#modal-content .party-pick')].map(card => {
    const r = card.getBoundingClientRect();
    const one = sel => {
      const e = card.querySelector(sel);
      if (!e) return { missing: true };
      const q = e.getBoundingClientRect();
      return { text: e.textContent.trim(), lines: Math.round(q.height / lineH(e)), sw: e.scrollWidth, cw: e.clientWidth, w: q.width, h: q.height };
    };
    const hp = card.querySelector('.pp-hp'), fill = hp && hp.firstElementChild;
    const out = [...card.querySelectorAll('*')].filter(e => {
      const q = e.getBoundingClientRect();
      return q.width > 0 && (q.left < r.left - .5 || q.right > r.right + .5);
    }).map(e => String(e.className || e.tagName)).slice(0, 4);
    const h = g.state.hunters.find(x => x.id === card.dataset.id);
    const cls = h ? classes.find(k => k.id === h.classId) : null;
    return {
      id: card.dataset.id, action: card.dataset.action || '',
      sel: card.classList.contains('selected'), down: card.classList.contains('down'),
      pressed: card.getAttribute('aria-pressed'), label: card.getAttribute('aria-label') || '',
      rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height },
      sw: card.scrollWidth, cw: card.clientWidth, out,
      img: (() => { const i = card.querySelector('img'); if (!i) return null; const q = i.getBoundingClientRect(); return { w: q.width, h: q.height, portrait: i.dataset.portrait || '' }; })(),
      name: one('.pp-name'), sub: one('.pp-sub'), stats: one('.pp-stats'), range: one('.pp-range'), num: one('.pp-num'), mark: one('.pp-mark'),
      icons: card.querySelectorAll('.pp-stats [data-icon]').length,
      statsText: (card.querySelector('.pp-stats')?.textContent || '').trim(),
      hp: { trackW: hp ? hp.clientWidth : 0, fillW: fill ? fill.getBoundingClientRect().width : 0 },
      want: h ? {
        name: h.name, level: h.level, cls: cls ? cls.name : '', range: cls && cls.range >= 3 ? '遠程' : '近戰',
        atk: h.attack, def: h.defense, hp: Math.ceil(Math.max(0, h.hp)), maxHp: Math.ceil(h.maxHp),
        ratio: Math.max(0, h.hp) / Math.max(1, h.maxHp),
      } : null,
    };
  });
  return { open, sw: c.scrollWidth, cw: c.clientWidth, left: cr.left, right: cr.right, modalLeft: mr.left, modalRight: mr.right, cards };
};

for (const dev of DEVICES) {
  const { ctx, page, errs, error } = await boot(dev);
  if (error) {
    fix(`${dev.label}: TARGET unreachable ${URL} (${String(error.message).split(/\r?\n/)[0].slice(0, 120)})`);
    await ctx.close();
    continue;
  }
  for (const m of MODALS) {
    await openModal(page, m.action);
    const t = `${dev.label} ${m.label}`;
    const res = await page.evaluate(MEASURE, { type: m.type, classes: CLASSES });
    if (!res.open) { fix(`${t}: modal did not open (type=${m.type})`); continue; }
    if (res.sw > res.cw + 1) fix(`${t}: #modal-content hscroll sw ${res.sw} > cw ${res.cw}`);
    const hunters = res.cards.length;
    if (!hunters) fix(`${t}: no .party-pick cards rendered`);
    res.cards.forEach((card, i) => {
      const who = card.id || `#${i + 1}`;
      if (!card.id || !/toggle(Dispatch|Dungeon|Arena)Hunter/.test(card.action)) fix(`${t}: card ${who} lost data-action/data-id (${card.action})`);
      if (card.sw > card.cw + 1) fix(`${t}: card ${who} hscroll sw ${card.sw} > cw ${card.cw}`);
      if (card.out.length) fix(`${t}: card ${who} children overflow horizontally: ${card.out.join(',')}`);
      if (card.rect.right > res.right + .5) fix(`${t}: card ${who} sticks out of #modal-content`);
      if (!card.img || card.img.w < 28 || card.img.h < 36) fix(`${t}: card ${who} portrait is ${card.img ? `${card.img.w.toFixed(0)}x${card.img.h.toFixed(0)}` : 'missing'} (want >= 28x36)`);
      ['name', 'sub', 'stats', 'range', 'num'].forEach(k => { if (card[k]?.missing) fix(`${t}: card ${who} is missing .pp-${k}`); });
      if (!card.want) return;
      const w = card.want;
      if (card.name?.text !== w.name) fix(`${t}: card ${who} name "${card.name?.text}" != "${w.name}"`);
      if (!card.sub?.text.startsWith(`Lv.${w.level} · ${w.cls}`)) fix(`${t}: card ${who} sub "${card.sub?.text}" != "Lv.${w.level} · ${w.cls}…"`);
      if (card.icons !== 2) fix(`${t}: card ${who} stats needs an atk and a def icon (${card.icons})`);
      if (!card.statsText.includes(String(w.atk)) || !card.statsText.includes(String(w.def))) fix(`${t}: card ${who} stats "${card.statsText}" missing atk ${w.atk} / def ${w.def}`);
      if (card.range?.text !== w.range) fix(`${t}: card ${who} range "${card.range?.text}" != "${w.range}"`);
      if (card.num?.text !== `${w.hp}/${w.maxHp}`) fix(`${t}: card ${who} hp numbers "${card.num?.text}" != "${w.hp}/${w.maxHp}"`);
      if (Math.abs(card.hp.fillW - w.ratio * card.hp.trackW) > 1) fix(`${t}: card ${who} hp fill ${card.hp.fillW.toFixed(1)} != ratio ${w.ratio.toFixed(3)} * ${card.hp.trackW}px`);
      if (card.pressed !== String(card.sel)) fix(`${t}: card ${who} aria-pressed ${card.pressed} != selected ${card.sel}`);
      if (card.down !== (w.hp === 0)) fix(`${t}: card ${who} .down should be ${w.hp === 0}`);
      if (w.hp === 0 && card.mark?.text !== '✝') fix(`${t}: card ${who} downed hunter mark "${card.mark?.text}" != ✝`);
      if (card.pressed === 'true' && card.mark?.text !== '✓') fix(`${t}: card ${who} selected card mark "${card.mark?.text}" != ✓`);
      // text must stay on one line at every width
      [card.name, card.sub, card.stats, card.num].forEach((box, k) => {
        if (!box || box.missing) return;
        if (box.sw > box.cw + 1) fix(`${t}: card ${who} line ${['name', 'sub', 'stats', 'num'][k]} clipped (sw ${box.sw} > cw ${box.cw})`);
      });
      if (card.name && card.name.lines > 1) fix(`${t}: card ${who} name wrapped to ${card.name.lines} lines`);
      if (card.sub && card.sub.lines > 1) fix(`${t}: card ${who} sub wrapped to ${card.sub.lines} lines`);
    });
    // selection round trip on the first selectable card
    const pick = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#modal-content .party-pick')].find(c => !c.classList.contains('down'));
      if (!card) return null;
      const before = card.getAttribute('aria-pressed');
      card.click();
      return { id: card.dataset.id, before };
    });
    if (!pick) fix(`${t}: no selectable card to toggle`);
    else {
      await page.waitForTimeout(400);
      const after = await page.evaluate(id => {
        const card = document.querySelector(`#modal-content .party-pick[data-id="${id}"]`);
        return card ? { pressed: card.getAttribute('aria-pressed'), sel: card.classList.contains('selected'), mark: card.querySelector('.pp-mark')?.textContent.trim() } : null;
      }, pick.id);
      const want = pick.before === 'true' ? 'false' : 'true';
      if (!after) fix(`${t}: card ${pick.id} vanished after click`);
      else if (after.pressed !== want) fix(`${t}: card ${pick.id} aria-pressed ${after.pressed} after click, expected ${want}`);
      else if (after.sel !== (want === 'true')) fix(`${t}: card ${pick.id} .selected ${after.sel} after click, expected ${want === 'true'}`);
      else if (want === 'true' && after.mark !== '✓') fix(`${t}: card ${pick.id} selected mark "${after.mark}" != ✓`);
      const back = await page.evaluate(id => {
        const card = document.querySelector(`#modal-content .party-pick[data-id="${id}"]`);
        if (!card) return null;
        card.click();
        return true;
      }, pick.id);
      if (!back) fix(`${t}: card ${pick.id} vanished after second click`);
      await page.waitForTimeout(300);
    }
    if (process.env.SHOTS && (dev.width === 1440 || dev.width === 402) && (m.type === 'dispatch' || m.type === 'dungeon')) {
      const tall = await page.evaluate(() => {
        const bd = document.querySelector('#modal-backdrop'), modal = document.querySelector('#modal'), c = document.querySelector('#modal-content');
        bd.style.maxHeight = 'none'; bd.style.overflow = 'visible';
        modal.style.maxHeight = 'none'; c.style.overflow = 'visible'; c.scrollTop = 0;
        return Math.min(4000, modal.scrollHeight + 120);
      });
      await page.setViewportSize({ width: dev.width, height: Math.max(dev.height, tall) });
      await page.waitForTimeout(150);
      const path = `output/party/${m.type}-${dev.width}x${dev.height}.png`;
      const buf = await page.screenshot({ path });
      await page.setViewportSize({ width: dev.width, height: dev.height });
      shots.push({ label: `${dev.label} — ${m.label}`, buf });
    }
    console.log(`ok  ${t}: cards ${hunters}, content ${res.cw}x, first ${res.cards[0]?.name?.text || '-'} ${res.cards[0]?.num?.text || '-'}`);
    await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click());
    await page.waitForTimeout(200);
  }
  if (errs.length) fix(`${dev.label}: page errors: ${errs.join(' | ')}`);
  await ctx.close();
}

await browser.close();

if (process.env.SHOTS && shots.length) {
  const tiles = shots.map(s => `<figure><figcaption>${s.label}</figcaption><img src="data:image/png;base64,${s.buf.toString('base64')}"></figure>`).join('');
  const b2 = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
  const p = await b2.newPage({ viewport: { width: 1000, height: 800 } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#14100c;color:#f0dfb8;font:600 20px/1.4 'Microsoft JhengHei',sans-serif}figure{margin:0 auto 22px;width:fit-content;max-width:960px;padding:0 10px}figcaption{padding:8px 2px;letter-spacing:1px}img{display:block;max-width:940px;height:auto;border:2px solid #6b4e2a}</style></head><body>${tiles}</body></html>`, { waitUntil: 'load' });
  await p.screenshot({ path: 'output/party/montage.png', fullPage: true });
  await b2.close();
  console.log('montage output/party/montage.png');
}

if (fails.length) {
  for (const f of fails) console.log(`FIX: ${f}`);
  console.log(`FAIL ${fails.length}`);
  process.exit(1);
}
console.log('PASS party pick: portrait+name+level·class+atk/def/range+hp numbers on every card, one line each, inside #modal-content, selection toggles aria-pressed/.pp-mark, downed shows ✝ at 1440x900, 800x900, 402x712, 360x640 for 派遣出征/地下城/競技場');
