import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const pw = await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')).href);
const { chromium } = pw.default || pw;
const b = await chromium.launch({ channel: 'chromium' });

const VIEWS = [[390, 844, 'iphone14'], [360, 640, 'small-android'], [412, 915, 'pixel7'], [844, 390, 'landscape']];
const OPEN = [
  ['hunters', '#bottom-bar button[data-action="hunters"]'],
  ['build', '#bottom-bar button[data-action="build"]'],
  ['craft', '#bottom-bar button[data-action="craft"]'],
  ['trade', '#bottom-bar button[data-action="trade"]'],
  ['quests', '#bottom-bar button[data-action="quests"]'],
  ['dungeon', '#bottom-bar button[data-action="dungeon"]'],
  ['arena', '#bottom-bar button[data-action="arena"]'],
  ['settings', '#topbar button[data-action="settings"]'],
  ['difficulty', '#topbar button[data-action="difficulty"]'],
  ['inventory', '#topbar button[data-action="inventory"]'],
  ['worldmap', '.world-map-trigger'],
  ['heroDetail', '#bottom-bar button[data-action="hunters"]'],
];

const AUDIT = `(() => {
  const clippedBy = (el) => {
    let a = el.parentElement;
    while (a && a !== document.body) {
      const cs = getComputedStyle(a);
      if (/(hidden|auto|scroll)/.test(cs.overflowY + cs.overflowX)) {
        const ar = a.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (er.top < ar.top - 1 || er.bottom > ar.bottom + 1 || er.left < ar.left - 1 || er.right > ar.right + 1) return true;
      }
      a = a.parentElement;
    }
    return false;
  };
  const bad = [];
  for (const e of document.querySelectorAll('button,img,input,[data-icon],.game-panel,#topbar,#bottom-bar,#modal,.chip,.skill,.panel-title')) {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    if (r.bottom < -2 || r.top > innerHeight + 2) continue;
    const out = r.top < -1.5 || r.bottom > innerHeight + 1.5 || r.left < -1.5 || r.right > innerWidth + 1.5;
    if (out && !clippedBy(e)) bad.push({
      t: (e.dataset.action || e.id || String(e.className) || e.tagName).toString().slice(0, 26),
      top: Math.round(r.top), bot: Math.round(r.bottom), l: Math.round(r.left), rr: Math.round(r.right),
    });
  }
  const m = document.getElementById('modal');
  const mr = m ? m.getBoundingClientRect() : null;
  const c = document.getElementById('modal-content');
  return {
    bad: bad.slice(0, 10), badCount: bad.length,
    modal: mr ? { t: Math.round(mr.top), b: Math.round(mr.bottom) } : null,
    scroll: c ? { sh: c.scrollHeight, ch: c.clientHeight } : null,
    vh: innerHeight, vw: innerWidth,
  };
})()`;

const report = {};
for (const [W, H, label] of VIEWS) {
  const ctx = await b.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://100.79.149.0:5024/?preview=1', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => globalThis.__mistvaleGame && document.body.dataset.fps !== undefined, null, { timeout: 120000 });
  await p.waitForTimeout(2200);
  const run = () => p.evaluate(AUDIT);
  const per = {};
  per.main = await run();
  for (const [name, sel] of OPEN) {
    await p.evaluate((s) => document.querySelector(s)?.click(), sel);
    await p.waitForTimeout(600);
    let r = await run();
    if (name === 'heroDetail') {
      await p.evaluate(() => document.querySelector('#modal .hunter-card, #modal .visitor-card, #modal button')?.click());
      await p.waitForTimeout(600);
      r = await run();
      await p.screenshot({ path: `C:/tmp/m3-${label}-detail.png` });
    }
    per[name] = r;
    if (r.badCount) await p.screenshot({ path: `C:/tmp/m3-${label}-${name}.png` });
    await p.evaluate(() => document.querySelector('#modal [data-action="close"]')?.click());
    await p.waitForTimeout(250);
  }
  per.errors = errs.slice(0, 3);
  report[label] = per;
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await b.close();
