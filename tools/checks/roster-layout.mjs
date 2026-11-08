// roster-layout.mjs — T98/T99: hunter roster chips must wrap inside #modal-content,
// cards must read top-down without horizontal overflow, the health bar must expose
// healthy/hurt/critical on desktop and phone widths, desktop cards must show the
// .hunter-stats line (attack/defence/range/trait) under the meta column, and
// phones must keep it display:none.
// Usage: node tools/checks/roster-layout.mjs        (game server on 5024 expected; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/roster-layout.mjs   also writes output/roster/montage.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'module';
import fs from 'node:fs';
import {CLASSES,TRAITS} from '../../src/pixel-data.js';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { label: 'desktop 1440x900', width: 1440, height: 900, phone: false },
  { label: 'desktop 800x900', width: 800, height: 900, phone: false },
  { label: 'phone 402x712', width: 402, height: 712, phone: true },
  { label: 'phone 360x640', width: 360, height: 640, phone: true },
];
const FILTER = ['全部', '近戰', '遠程', '需要照顧', '倒下'];
const SORT = ['等級', '稀有度', '職業', '生命'];
const fails = [], shots = [];
const fix = m => fails.push(m);

if (process.env.SHOTS) fs.mkdirSync('output/roster', { recursive: true });
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
    for (const h of g.state.hunters) { h.hp = h.maxHp; if (h.status === '倒下') h.status = '待機'; }
    const hs = g.state.hunters;
    if (hs.length >= 2) {
      hs[0].hp = hs[0].maxHp * .5;          // hurt (25–60 %)
      hs[1].hp = 0; hs[1].status = '倒下';  // critical
    }
  });
  await page.evaluate(() => {
    const el = document.createElement('button');
    el.dataset.action = 'hunters'; el.style.display = 'none';
    document.body.append(el); el.click(); el.remove();
  });
  await page.waitForTimeout(600);
  return { ctx, page, errs, error: null };
}

const MEASURE = () => {
  const g = globalThis.__mistvaleGame;
  const c = document.querySelector('#modal-content');
  const mc = document.querySelector('#modal');
  const backdrop = document.querySelector('#modal-backdrop');
  const open = !!mc && mc.dataset.type === 'hunters' && !!backdrop && !backdrop.classList.contains('hidden');
  if (!c) return { open: false };
  c.scrollTop = 0;
  const cr = c.getBoundingClientRect();
  const rows = [...document.querySelectorAll('#modal[data-type=hunters] .roster-bar>div')].map(row => ({
    label: row.querySelector('span')?.textContent.trim() || '',
    chips: [...row.querySelectorAll('.pixel-button')].map(b => {
      const q = b.getBoundingClientRect();
      return { text: b.textContent.trim(), left: q.left, right: q.right };
    }),
  }));
  const cards = [...document.querySelectorAll('#modal[data-type=hunters] .hunter-card')].map(card => {
    const r = card.getBoundingClientRect();
    const out = [...card.querySelectorAll('*')].filter(e => {
      const q = e.getBoundingClientRect();
      return q.width > 0 && (q.left < r.left - .5 || q.right > r.right + .5);
    }).map(e => String(e.className || e.tagName)).filter(Boolean).slice(0, 4);
    const healths = [...card.querySelectorAll('[data-health]')].map(e => {
      const q = e.getBoundingClientRect();
      const fill = e.firstElementChild;
      return {
        state: e.dataset.health, label: e.getAttribute('aria-label') || '', left: q.left, right: q.right, top: q.top,
        trackW: e.clientWidth, fillW: fill ? fill.getBoundingClientRect().width : 0,
      };
    });
    const st = card.querySelector('.hunter-stats');
    const sr = st ? st.getBoundingClientRect() : null;
    const stIcons = st ? [...st.querySelectorAll('[data-icon]')] : [];
    const stats = st ? {
      display: getComputedStyle(st).display, label: st.getAttribute('aria-label') || '',
      left: sr.left, right: sr.right, top: sr.top, bottom: sr.bottom, width: sr.width,
      rows: [...st.children].map(e => {
        const q = e.getBoundingClientRect(), ms = getComputedStyle(e);
        return {
          text: e.textContent.trim(), top: q.top, bottom: q.bottom, w: q.width, h: q.height,
          sw: e.scrollWidth, cw: e.clientWidth, fs: parseFloat(ms.fontSize) || 0, icons: e.querySelectorAll('[data-icon]').length,
        };
      }),
      icons: stIcons.length, iconsHidden: stIcons.every(e => e.getAttribute('aria-hidden') === 'true'),
    } : null;
    const metaBox = card.querySelector('.hunter-meta');
    const metaLeft = metaBox ? metaBox.getBoundingClientRect().left : 0;
    const metaLines = ['small', '.rarity', '.status'].map(sel => {
      const e = card.querySelector('.hunter-meta ' + sel);
      if (!e) return { sel, missing: true };
      const q = e.getBoundingClientRect(), ms = getComputedStyle(e);
      const lh = parseFloat(ms.lineHeight) || (parseFloat(ms.fontSize) || 10) * 1.3;
      return { sel, lines: Math.round(q.height / lh), sw: e.scrollWidth, cw: e.clientWidth };
    });
    const cs = getComputedStyle(card);
    const h = g.state.hunters.find(x => x.id === card.dataset.id);
    return {
      action: card.dataset.action || '', id: card.dataset.id || '',
      sw: card.scrollWidth, cw: card.clientWidth, out, healths, stats,
      left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height,
      padRight: parseFloat(cs.paddingRight) || 0, borderRight: parseFloat(cs.borderRightWidth) || 0, metaLeft, metaLines,
      atk: h ? h.attack : null, def: h ? h.defense : null, classId: h ? h.classId : null, trait: h ? h.trait : null,
      hp: h ? h.hp : null, ratio: h ? Math.max(0, h.hp) / Math.max(1, h.maxHp) : null,
      expected: h ? `生命 ${Math.ceil(Math.max(0, h.hp))}/${Math.ceil(h.maxHp)}` : null,
    };
  });
  const mini = [...document.querySelectorAll('#mini-roster .mini-hunter')];
  return {
    open, sw: c.scrollWidth, cw: c.clientWidth, left: cr.left, right: cr.right, rows, cards,
    mini: mini.length, miniBad: mini.filter(e => e.dataset.action !== 'hunter' || !e.dataset.id || !e.querySelector('.tiny-health')).length,
  };
};

for (const dev of DEVICES) {
  const { ctx, page, errs, error } = await boot(dev);
  if (error) {
    fix(`${dev.label}: TARGET unreachable ${URL} (${String(error.message).split(/\r?\n/)[0].slice(0, 120)})`);
    await ctx.close();
    continue;
  }
  const m = await page.evaluate(MEASURE);
  const t = dev.label;
  if (!m.open) fix(`${t}: hunters roster did not open`);
  else {
    if (m.sw > m.cw + 1) fix(`${t}: #modal-content hscroll sw ${m.sw} > cw ${m.cw}`);
    const want = [['篩選', FILTER], ['排序', SORT]];
    if (m.rows.length !== 2) fix(`${t}: .roster-bar has ${m.rows.length} chip groups, expected 2`);
    want.forEach(([label, chips], i) => {
      const row = m.rows[i];
      if (!row) return fix(`${t}: ${label} row missing`);
      if (row.label !== label) fix(`${t}: chip group ${i + 1} label "${row.label}" != "${label}"`);
      const got = row.chips.map(x => x.text);
      if (got.join('|') !== chips.join('|')) return fix(`${t}: ${label} chips are ${got.join('/')} expected ${chips.join('/')}`);
      row.chips.forEach((chip, j) => {
        if (chip.left < m.left - .5 || chip.right > m.right + .5) fix(`${t}: ${label} chip ${chips[j]} outside #modal-content (${Math.round(chip.left)}–${Math.round(chip.right)} vs ${Math.round(m.left)}–${Math.round(m.right)})`);
      });
    });
    const states = new Set();
    m.cards.forEach(card => {
      if (card.action !== 'hunter' || !card.id) fix(`${t}: .hunter-card missing data-action="hunter"/data-id`);
      if (card.sw > card.cw + 1) fix(`${t}: card ${card.id} hscroll sw ${card.sw} > cw ${card.cw}`);
      if (card.out.length) fix(`${t}: card ${card.id} children overflow horizontally: ${card.out.join(',')}`);
      const h = card.healths[0];
      if (!h) return fix(`${t}: card ${card.id} has no [data-health] health bar`);
      states.add(h.state);
      if (h.label !== card.expected) fix(`${t}: card ${card.id} aria-label "${h.label}" != "${card.expected}"`);
      if (h.left < m.left - .5 || h.right > m.right + .5) fix(`${t}: card ${card.id} health bar outside #modal-content`);
      const wantFill = card.ratio * h.trackW;
      if (Math.abs(h.fillW - wantFill) > 1) fix(`${t}: card ${card.id} ${h.state} fill ${h.fillW.toFixed(1)}px != ratio ${card.ratio.toFixed(3)} * track ${h.trackW}px = ${wantFill.toFixed(1)}px`);
    });
    for (const s of ['healthy', 'hurt', 'critical']) if (!states.has(s)) fix(`${t}: missing ${s} health state (have ${[...states].join('/')})`);
    const down = m.cards.find(c => c.hp === 0);
    if (!down || down.healths[0]?.state !== 'critical') fix(`${t}: downed hunter does not show the critical state`);
    if (!dev.phone) {
      const rowHeights = new Map();
      m.cards.forEach(card => {
        const st = card.stats;
        if (!st) return fix(`${t}: card ${card.id} has no .hunter-stats`);
        if (st.display === 'none') fix(`${t}: card ${card.id} .hunter-stats is hidden on desktop`);
        const cls = CLASSES.find(c => c.id === card.classId), tr = TRAITS.find(x => x.id === card.trait);
        const range = cls && cls.range >= 3 ? '遠程' : '近戰', trait = tr ? tr.name : '';
        const wantLabel = `攻擊 ${card.atk} 防禦 ${card.def} ${range} 性格 ${trait}`;
        if (st.label !== wantLabel) fix(`${t}: card ${card.id} stats aria-label "${st.label}" != "${wantLabel}"`);
        if (st.rows.length !== 4) fix(`${t}: card ${card.id} .hunter-stats has ${st.rows.length} items, expected 4 (atk, def, range, trait)`);
        else {
          const want = [String(card.atk), String(card.def), range, trait];
          st.rows.forEach((row, i) => {
            if (row.text !== want[i]) fix(`${t}: card ${card.id} stat item ${i + 1} "${row.text}" != "${want[i]}"`);
            if (row.w <= 0 || row.h <= 0) fix(`${t}: card ${card.id} stat item ${i + 1} is not rendered`);
            if (row.sw > row.cw + 1) fix(`${t}: card ${card.id} stat item ${i + 1} text clipped sw ${row.sw} > cw ${row.cw}`);
            if (row.fs < 10) fix(`${t}: card ${card.id} stat item ${i + 1} font ${row.fs}px < 10px`);
          });
          const tops = st.rows.map(r => r.top);
          if (Math.max(...tops) - Math.min(...tops) > 3) fix(`${t}: card ${card.id} stats are not on one line (tops ${tops.map(v => v.toFixed(1)).join('/')})`);
          if (st.rows[0].icons !== 1 || st.rows[1].icons !== 1) fix(`${t}: card ${card.id} atk/def items need one icon each (${st.rows[0].icons}/${st.rows[1].icons})`);
        }
        if (st.icons !== 2 || !st.iconsHidden) fix(`${t}: card ${card.id} .hunter-stats needs 2 aria-hidden icons (got ${st.icons}, hidden ${st.iconsHidden})`);
        if (!(st.right > st.left) || !(st.bottom > st.top)) fix(`${t}: card ${card.id} .hunter-stats has no box`);
        if (st.width < 96) fix(`${t}: card ${card.id} .hunter-stats line is only ${st.width.toFixed(1)}px wide`);
        if (Math.abs(st.left - card.metaLeft) > 2) fix(`${t}: card ${card.id} stats left ${st.left.toFixed(1)} != meta left ${card.metaLeft.toFixed(1)}`);
        card.metaLines.forEach(mt => {
          if (mt.missing) return fix(`${t}: card ${card.id} is missing the .hunter-meta ${mt.sel} line`);
          if (mt.lines > 1) fix(`${t}: card ${card.id} .hunter-meta ${mt.sel} wrapped to ${mt.lines} lines`);
          if (mt.sw > mt.cw + 1) fix(`${t}: card ${card.id} .hunter-meta ${mt.sel} clipped sw ${mt.sw} > cw ${mt.cw}`);
        });
        if (st.left < card.left - .5 || st.right > card.right + .5 || st.bottom > card.bottom + .5) fix(`${t}: card ${card.id} .hunter-stats outside card`);
        const bar = card.healths[0];
        if (bar && st.bottom > bar.top + .5) fix(`${t}: card ${card.id} .hunter-stats overlaps health bar (${st.bottom.toFixed(1)} > ${bar.top.toFixed(1)})`);
        const key = Math.round(card.top), row = rowHeights.get(key) || [];
        row.push(card.height); rowHeights.set(key, row);
      });
      for (const [key, hs] of rowHeights) if (Math.max(...hs) - Math.min(...hs) > 1) fix(`${t}: card heights on row y=${key} differ (${hs.map(v => v.toFixed(1)).join('/')})`);
      if (!m.mini) fix(`${t}: #mini-roster has no .mini-hunter`);
      else if (m.miniBad) fix(`${t}: ${m.miniBad} .mini-hunter lacks data-action/data-id/.tiny-health`);
    } else {
      m.cards.forEach(card => {
        if (!card.stats) return fix(`${t}: card ${card.id} has no .hunter-stats`);
        if (card.stats.display !== 'none') fix(`${t}: card ${card.id} .hunter-stats display ${card.stats.display} at ${t}`);
      });
    }
  }
  if (process.env.SHOTS) {
    const path = `output/roster/shot-${dev.width}x${dev.height}.png`;
    // expand the modal for the review tile so every card and health bar is visible;
    // the viewport width (and therefore every layout rule) stays exactly the measured one
    const tall = await page.evaluate(() => {
      const bd = document.querySelector('#modal-backdrop'), modal = document.querySelector('#modal'), c = document.querySelector('#modal-content');
      bd.style.maxHeight = 'none'; bd.style.overflow = 'visible';
      modal.style.maxHeight = 'none'; c.style.overflow = 'visible'; c.scrollTop = 0;
      return Math.min(4000, modal.scrollHeight + 120);
    });
    await page.setViewportSize({ width: dev.width, height: Math.max(dev.height, tall) });
    await page.waitForTimeout(150);
    const buf = await page.screenshot({ path });
    await page.setViewportSize({ width: dev.width, height: dev.height });
    shots.push({ label: `${dev.label} — 獵人名冊`, buf });
  }
  if (dev.label.startsWith('desktop')) {
    const detail = await page.evaluate(() => {
      document.querySelector('#modal[data-type=hunters] .hunter-card')?.click();
      const d = document.querySelector('.hunter-detail');
      return { type: document.querySelector('#modal')?.dataset.type, name: d?.querySelector('h3')?.textContent?.trim() || '', open: !document.querySelector('#modal-backdrop').classList.contains('hidden') };
    });
    if (detail.type !== 'hunter' || !detail.open || !detail.name) fix(`desktop: clicking .hunter-card did not open the hunter detail (type=${detail.type} name=${detail.name || 'none'})`);
    await page.evaluate(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click());
    await page.waitForTimeout(150);
  }
  if (errs.length) fix(`${t}: page errors: ${errs.join(' | ')}`);
  console.log(`ok  ${t}: content ${m.cw}x, chips ${m.rows.map(r => r.chips.length).join('/')}, cards ${m.cards?.length || 0}, mini ${m.mini ?? '-'}`);
  await ctx.close();
}

await browser.close();

if (process.env.SHOTS && shots.length) {
  const tiles = shots.map(s => `<figure><figcaption>${s.label}</figcaption><img src="data:image/png;base64,${s.buf.toString('base64')}"></figure>`).join('');
  const p = await (await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] })).newPage({ viewport: { width: 960, height: 800 } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#14100c;color:#f0dfb8;font:600 20px/1.4 'Microsoft JhengHei',sans-serif}figure{margin:0 auto 22px;width:fit-content;max-width:920px;padding:0 10px}figcaption{padding:8px 2px;letter-spacing:1px}img{display:block;max-width:900px;height:auto;border:2px solid #6b4e2a}</style></head><body>${tiles}</body></html>`, { waitUntil: 'load' });
  await p.screenshot({ path: 'output/roster/montage.png', fullPage: true });
  await p.context().browser().close();
  console.log('montage output/roster/montage.png');
}

if (fails.length) {
  for (const f of fails) console.log(`FIX: ${f}`);
  console.log(`FAIL ${fails.length}`);
  process.exit(1);
}
console.log('PASS roster readable: chips inside #modal-content, no horizontal scroll, cards contained, meta lines never wrap, healthy/hurt/critical present, desktop .hunter-stats one line (atk/def/range/trait) under the meta, phone .hunter-stats hidden at 1440x900, 800x900, 402x712, 360x640');
