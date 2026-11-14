// heroloom-shots.mjs — Heroloom QA: in-game + lab screenshots, engine probes and a page-health report.
// Usage: node pipeline/scripts/ui-audit/heroloom-shots.mjs [--tag=pre] [--only=game|lab|game,lab] [--no-doll0] [--no-probe] [--allow-errors]
//   --tag=pre       prefix output files with "pre-" (e.g. baseline before integration)
//   --only=game     only the in-game shots (desktop / heroes close-up / attack + skill / hunters panel / phone / doll=0)
//   --only=lab      only the ?loom=1 lab shots (desktop + phone) and the lab interaction checks
//   --no-doll0      skip the ?doll=0 fallback shots
//   --no-probe      skip the compose / bake / covers probes (faster run)
//   --allow-errors  exit 0 even when console/page errors were captured (still reported)
// Env: TARGET=  override the URL (default http://100.79.149.0:5024/ ; server re-reads outputs/暮影村.html per request)
// Out: output/heroloom-qa/  (<tag->)game-desktop.png, game-heroes(-crop).png, game-heroes-attack.png,
//                            game-heroes-skill.png, game-desktop-hunters.png, game-phone(-heroes).png,
//                            game-doll0(-heroes-crop).png, lab-desktop.png, lab-phone.png, summary[-<tag>].json
//   stdout = one JSON summary; progress goes to stderr.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'output', 'heroloom-qa');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.TARGET || 'http://100.79.149.0:5024/';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, def) => {
  const a = argv.find((x) => x.startsWith('--' + n + '='));
  return a ? a.slice(n.length + 3) : def;
};
const TAG = opt('tag', '');
const PFX = TAG ? TAG.replace(/[^a-zA-Z0-9._-]+/g, '-') + '-' : '';
const ONLY = new Set(String(opt('only', 'game,lab')).split(',').map((s) => s.trim()).filter(Boolean));
const WITH_DOLL0 = !flag('no-doll0');
const WITH_PROBE = !flag('no-probe');
const ALLOW_ERRORS = flag('allow-errors');
fs.mkdirSync(OUT, { recursive: true });

const urlWith = (params) => {
  const u = new URL(BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

const t0 = Date.now();
const report = {
  script: 'heroloom-shots',
  base: BASE,
  tag: TAG || null,
  startedAt: new Date().toISOString(),
  shots: [],
  console: { errors: [], warnings: [] },
  pageErrors: [],
  httpErrors: [],
  requestFailed: [],
  game: null,
  phone: null,
  doll0: null,
  lab: null,
  labPhone: null,
  probe: null,
  notes: [],
  ok: true,
};

const note = (s) => {
  report.notes.push(s);
  console.error('[qa] ' + s);
};
const brief = (s, n = 400) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--headless=new', '--mute-audio', '--hide-scrollbars'],
});

function wire(page) {
  page.on('console', (m) => {
    const txt = brief(m.text());
    const loc = typeof m.location === 'function' ? m.location() : null;
    const where = loc && loc.url ? ' [' + loc.url + ']' : '';
    if (m.type() === 'error') {
      if (!report.console.errors.includes(txt + where)) report.console.errors.push(txt + where);
    } else if (m.type() === 'warning') {
      if (!report.console.warnings.includes(txt + where)) report.console.warnings.push(txt + where);
    }
  });
  page.on('pageerror', (e) => {
    const msg = brief((e && e.message) || e);
    if (!report.pageErrors.includes(msg)) report.pageErrors.push(msg);
  });
  page.on('requestfailed', (r) => {
    report.requestFailed.push({ url: r.url(), reason: brief(r.failure()?.errorText, 120) });
  });
  page.on('response', (r) => {
    if (r.status() >= 400) report.httpErrors.push({ status: r.status(), url: r.url() });
  });
}

async function shot(page, name, opts = {}) {
  const base = PFX + name + '.png';
  const file = path.join(OUT, base);
  await page.screenshot({ path: file, ...opts });
  const bytes = fs.statSync(file).size;
  report.shots.push({ name: base, path: file, bytes });
  console.error(`[qa] shot ${base} (${(bytes / 1024).toFixed(0)} KB, ${Date.now() - t0} ms)`);
  return file;
}

async function boot(page, url) {
  const t = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  const ready = () => !!globalThis.__mistvaleGame && !document.querySelector('#loading');
  try {
    await page.waitForFunction(ready, null, { timeout: 90000 });
  } catch {
    note('boot wait timed out once; reloading ' + url);
    await page.reload({ waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(ready, null, { timeout: 120000 });
  }
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.querySelector('#title-screen')?.remove();
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close], #modal-backdrop:not(.hidden) [data-action=welcomeStart], #modal-backdrop:not(.hidden) [data-action=skip]')?.click();
  });
  return Date.now() - t;
}

const act = (page, a, id) =>
  page.evaluate(([a, id]) => {
    document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click();
    const el = document.createElement('button');
    el.dataset.action = a;
    if (id != null) el.dataset.id = id;
    document.body.append(el);
    el.click();
    el.remove();
  }, [a, id]);

async function dollStatus(page) {
  try {
    return await page.evaluate(() => (typeof globalThis.__mistvaleDoll === 'function' ? globalThis.__mistvaleDoll() : null));
  } catch {
    return null;
  }
}

async function waitDollReady(page, timeout = 25000) {
  const t = Date.now();
  try {
    const h = await page.waitForFunction(() => {
      const s = globalThis.__mistvaleDoll?.();
      return s && s.ready ? s : null;
    }, null, { timeout, polling: 50 });
    return { ready: true, readyMs: Date.now() - t, status: await h.jsonValue() };
  } catch {
    return { ready: false, readyMs: Date.now() - t, status: await dollStatus(page) };
  }
}

async function waitFirstDollDraw(page, timeout = 20000) {
  const t = Date.now();
  try {
    await page.waitForFunction(() => {
      const f = globalThis.__mistvaleFacing?.() || {};
      return Object.values(f).some((v) => v && v.doll && v.doll.act);
    }, null, { timeout, polling: 50 });
    return { ok: true, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

// One row per drawn hunter: which class it is, which facing entry the renderer published.
async function facingRows(page) {
  return page.evaluate(() => {
    const g = globalThis.__mistvaleGame;
    const f = (typeof globalThis.__mistvaleFacing === 'function' && globalThis.__mistvaleFacing()) || {};
    const cls = {};
    for (const h of g?.state?.hunters || []) cls[String(h.id)] = h.classId;
    const strip = (k) => String(k).replace(/^(hunter|enemy|unit):/, '');
    const rows = [];
    for (const [k, v] of Object.entries(f)) {
      const id = strip(k);
      if (!(id in cls)) continue; // skip non-hunters (enemies, wanderers...)
      rows.push({
        id,
        classId: cls[id] ?? null,
        f: v?.f ?? null,
        pose: v?.pose ?? null,
        doll: v?.doll ?? null,
      });
    }
    return rows;
  });
}

function coverageOf(rows, classIds) {
  const by = {};
  for (const c of classIds) by[c] = { classId: c, hunters: 0, dollDrawn: 0, actions: [], dirs: [], slots: [] };
  for (const r of rows) {
    const c = r.classId ?? '?';
    if (!by[c]) by[c] = { classId: c, hunters: 0, dollDrawn: 0, actions: [], dirs: [], slots: [] };
    const e = by[c];
    e.hunters++;
    if (r.doll) {
      e.dollDrawn++;
      if (r.doll.act && !e.actions.includes(r.doll.act)) e.actions.push(r.doll.act);
      if (r.doll.dir && !e.dirs.includes(r.doll.dir)) e.dirs.push(r.doll.dir);
      if (r.doll.slot != null && !e.slots.includes(r.doll.slot)) e.slots.push(r.doll.slot);
    }
  }
  return by;
}

// Line the hunters up on one row around the camp plaza and frame them, so every class is visible at once.
// (QA staging only: this context is a throwaway preview page, nothing is saved.)
async function stagedClassRow(page, { spacing = 2.4, zoom = 5.2 } = {}) {
  const res = await page.evaluate(({ spacing, zoom }) => {
    const g = globalThis.__mistvaleGame;
    const v = globalThis.__mistvaleView;
    const hs = g?.state?.hunters || [];
    if (!hs.length) return { ok: false, reason: 'no hunters' };
    const xs = hs.map((h) => h.x).sort((a, b) => a - b);
    const zs = hs.map((h) => h.z).sort((a, b) => a - b);
    const ax = xs[Math.floor(xs.length / 2)];
    const az = zs[Math.floor(zs.length / 2)];
    hs.forEach((h, i) => {
      h.x = +(ax + i * spacing - ((hs.length - 1) * spacing) / 2).toFixed(2);
      h.z = +az.toFixed(2);
    });
    if (v && typeof v.lookAt === 'function') v.lookAt(ax, az, zoom);
    return { ok: true, ax, az, count: hs.length, zoom, spacing };
  }, { spacing, zoom });
  // wait a couple of frames, then read the on-screen rects of the freshly drawn row
  await page.waitForTimeout(260);
  const frame = await page.evaluate(() => {
    const v = globalThis.__mistvaleView;
    const rects = (v && v.unitRects ? v.unitRects() : []).filter((r) => String(r.id).startsWith('h'));
    let bbox = null;
    if (rects.length) {
      const x0 = Math.min(...rects.map((r) => r.x));
      const y0 = Math.min(...rects.map((r) => r.y));
      const x1 = Math.max(...rects.map((r) => r.x + r.w));
      const y1 = Math.max(...rects.map((r) => r.y + r.h));
      bbox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    return { bbox, rects, scale: v && v.getScale ? v.getScale() : null };
  });
  return { ...res, ...frame };
}

async function cropAround(page, bbox, name, { minW = 1000, minH = 520, pad = 60 } = {}) {
  const vp = page.viewportSize() || { width: 1440, height: 900 };
  const w = Math.min(vp.width, Math.max(minW, bbox.w + pad * 2));
  const h = Math.min(vp.height, Math.max(minH, bbox.h + pad * 2));
  const x = Math.max(0, Math.round(bbox.x + bbox.w / 2 - w / 2));
  const y = Math.max(0, Math.round(bbox.y + bbox.h / 2 - h / 2));
  return shot(page, name, { clip: { x, y, width: w, height: h } });
}

async function canvasInventory(page, scopeSel = 'body') {
  return page.evaluate((scopeSel) => {
    const root = document.querySelector(scopeSel) || document.body;
    const seen = new Set();
    const out = [];
    for (const c of root.querySelectorAll('canvas')) {
      if (seen.has(c)) continue;
      seen.add(c);
      const r = c.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      let paint = null;
      try {
        const g = c.getContext('2d');
        if (g) {
          const w = Math.max(1, Math.min(c.width, 160));
          const h = Math.max(1, Math.min(c.height, 160));
          const d = g.getImageData(0, 0, w, h).data;
          let opaque = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) opaque++;
          paint = { w: c.width, h: c.height, sampledPx: w * h, opaquePx: opaque };
        }
      } catch (e) {
        paint = { error: String(e).slice(0, 80) };
      }
      out.push({ id: c.id || null, cls: c.className || null, cssW: Math.round(r.width), cssH: Math.round(r.height), paint });
    }
    return out;
  }, scopeSel);
}

// Portraits in the hunters roster are <img> data URLs painted by drawPortrait(); a blank
// draw is a short data URL / empty canvas, so sample the decoded pixels instead of trusting the UI.
async function portraitReport(page) {
  return page.evaluate(() => {
    const seen = new Set();
    const rows = [];
    const imgs = [...document.querySelectorAll('#modal img[data-portrait], #modal img.uc-portrait, img[data-elder], #mini-roster img[data-portrait]')];
    for (const img of imgs) {
      if (seen.has(img)) continue;
      seen.add(img);
      const src = img.getAttribute('src') || '';
      const row = {
        id: img.dataset.portrait || null,
        inModal: !!img.closest('#modal'),
        dataURL: src.startsWith('data:image/'),
        srcLen: src.length,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        opaquePx: null,
      };
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w && h) {
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          const g = cv.getContext('2d');
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, w, h).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
          row.opaquePx = n;
        }
      } catch (e) {
        row.error = String(e).slice(0, 80);
      }
      rows.push(row);
    }
    return rows;
  });
}

// Force a DV2 action timestamp on every hunter so the sheet-pose state machine enters strike / skill.
// Read-only probe: only this throwaway preview page's in-memory state changes.
async function forcePose(page, kind) {
  return page.evaluate((kind) => {
    const g = globalThis.__mistvaleGame;
    const st = g?.state;
    if (!st) return { ok: false };
    const t = st.time || 0;
    for (const h of st.hunters || []) {
      h.atkX = +(h.x + 1.6).toFixed(2);
      h.atkZ = +h.z.toFixed(2);
      if (kind === 'attack') {
        h.atkAt = +(t - 0.06).toFixed(3);
        delete h.skillAt;
      } else {
        h.skillAt = +(t - 0.06).toFixed(3);
        delete h.atkAt;
      }
    }
    return { ok: true, time: t };
  }, kind);
}

// Engine-level probe: covers() for every class, compose() over classes × actions × directions,
// bakeRecipe() timing, and the status counters before/after.
async function dollProbe(page) {
  return page.evaluate(async () => {
    const loom = globalThis.__mistvaleLoom;
    const st = { hasLoom: !!loom, type: typeof loom, keys: loom ? Object.keys(loom) : [] };
    if (!loom) return st;
    const status = (globalThis.__mistvaleDoll?.() || null);
    st.status = status;
    const classes = ['archer', 'sorcerer', 'priest', 'paladin', 'berserker', 'assassin', 'traveler', 'darkknight', 'warrior'];
    st.covers = {};
    for (const c of classes) st.covers[c] = !!loom.covers(c);

    // every look as the lab builds it, then compose each class through the same facade pixel-world uses
    const lookOf = (c) => {
      try { return loom.look({ classId: c }); } catch (e) { return null; }
    };
    st.looks = {};
    for (const c of classes) {
      try {
        const l = lookOf(c);
        st.looks[c] = l ? { weaponType: l.weaponType, parts: l.parts, colors: l.colors } : null;
      } catch (e) {
        st.looks[c] = { error: String(e).slice(0, 120) };
      }
    }

    const actions = ['idle', 'walk', 'attack', 'skill', 'hurt', 'victory'];
    const dirs = ['up', 'side', 'down', 'sideLeft'];
    const matrix = {};
    let ok = 0, fail = 0;
    const fails = [];
    for (const c of classes) {
      const row = { ok: 0, fail: 0, acts: {}, widths: [], footXs: [], footYs: [], heroHeights: [] };
      for (const action of actions) {
        for (const dir of dirs) {
          let r = null;
          try { r = loom.compose({ classId: c }, { action, tick: 1, dir }); } catch (e) { r = null; }
          if (r && r.cv && r.cv.width > 0 && r.cv.height > 0) {
            ok++; row.ok++;
            row.acts[action] = (row.acts[action] || 0) + 1;
            row.widths.push(r.cv.width);
            row.footXs.push(r.footX);
            row.footYs.push(r.footY);
            row.heroHeights.push(r.heroHeight);
          } else {
            fail++; row.fail++;
            if (fails.length < 12) fails.push(c + '/' + action + '/' + dir);
          }
        }
      }
      row.widths = [...new Set(row.widths)];
      row.footX = [...new Set(row.footXs.map((v) => +Number(v).toFixed(2)))];
      row.footY = [...new Set(row.footYs.map((v) => +Number(v).toFixed(2)))];
      row.heroHeight = [...new Set(row.heroHeights)];
      delete row.footXs; delete row.footYs; delete row.heroHeights;
      matrix[c] = row;
    }
    st.compose = { classes: classes.length, actions: actions.length, dirs: dirs.length, ok, fail, fails, matrix };

    // compose counters before baking
    st.countersBefore = (globalThis.__mistvaleDoll?.() || null);

    // bakeRecipe timing per look (64 cells × all layers); this is what the lab "prewarm" and export paths do
    const bakes = {};
    const tb = performance.now();
    for (const c of classes) {
      const t1 = performance.now();
      try {
        const l = lookOf(c);
        const recipe = loom.recipe({ classId: c });
        const cv = await loom.bakeRecipe(recipe || l);
        bakes[c] = { ms: +(performance.now() - t1).toFixed(1), w: cv && cv.width, h: cv && cv.height };
      } catch (e) {
        bakes[c] = { error: String(e).slice(0, 160) };
      }
    }
    st.bake = { totalMs: +(performance.now() - tb).toFixed(1), perClass: bakes };
    st.countersAfter = (globalThis.__mistvaleDoll?.() || null);

    // one-shot frame table (lab export path) sanity
    st.frameTable = {};
    for (const a of ['idle', 'walk', 'attack', 'hurt', 'jump', 'cast', 'thrust', 'shoot']) {
      const f = loom.frame(a, 0);
      const l = loom.frame(a, 999);
      st.frameTable[a] = f ? { x: f.x, y: f.y, w: f.w, h: f.h, ms: f.ms, lastIndex: l && l.index } : null;
    }
    return st;
  });
}

// Lab panel DOM + live canvas sampling: click every action chip and every class thumb, hash the big canvas.
async function labInteraction(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const lab = document.querySelector('#heroloom-lab');
    if (!lab) return { mounted: false };
    const big = lab.querySelector('canvas.hl-big');
    const info = lab.querySelector('.hl-info');
    const perf = lab.querySelector('.hl-perf');
    const hashCanvas = (cv) => {
      if (!cv) return null;
      try {
        const g = cv.getContext('2d');
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let h = 2166136261 >>> 0, opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 8) { opaque++; h ^= (d[i] + d[i + 1] * 3 + d[i + 2] * 7 + i); h = Math.imul(h, 16777619) >>> 0; }
        }
        return { hash: h, opaque, w: cv.width, h: cv.height };
      } catch (e) {
        return { error: String(e).slice(0, 80) };
      }
    };
    const chips = [...lab.querySelectorAll('.hl-actions button')];
    const thumbs = [...lab.querySelectorAll('.hl-thumb')];
    const dirs = [...lab.querySelectorAll('.hl-dirs button')];
    const transport = [...lab.querySelectorAll('.hl-transport button')];
    const out = {
      mounted: true,
      chips: chips.map((b) => b.textContent.trim()),
      thumbs: thumbs.map((b) => (b.querySelector('span')?.textContent || b.textContent || '').trim()),
      dirs: dirs.map((b) => b.textContent.trim()),
      transport: transport.map((b) => b.textContent.trim()),
      perfText: perf ? perf.innerText.replace(/\s+/g, ' ').trim() : null,
      base: hashCanvas(big),
      actions: {},
      classThumbs: {},
      infoLines: {},
    };
    for (const b of chips) {
      const label = b.textContent.trim();
      b.click();
      await sleep(180);
      const h = hashCanvas(big);
      out.actions[label] = {
        canvas: h,
        changed: !!(out.base && h && h.hash !== out.base.hash),
        info: info ? info.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : null,
      };
    }
    for (const b of thumbs) {
      const label = (b.querySelector('span')?.textContent || b.textContent || '').trim();
      b.click();
      await sleep(180);
      out.classThumbs[label] = { canvas: hashCanvas(big) };
    }
    // distinct hashes tell us the stage really redraws per class (identical art would collapse)
    const hs = Object.values(out.classThumbs).map((v) => v.canvas && v.canvas.hash);
    out.distinctThumbHashes = new Set(hs).size;
    out.reset = (() => { const b = [...lab.querySelectorAll('button')].find((x) => /^(reset|⟲|重設)/i.test(x.textContent.trim())); if (b) b.click(); return !!b; })();
    return out;
  });
}

async function withPage(opts, fn) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  wire(page);
  try {
    return await fn(page, ctx);
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------- game (desktop)
if (ONLY.has('game')) {
  try {
    await withPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, async (page) => {
      const bootMs = await boot(page, urlWith({ preview: '1' }));
      const doll = await waitDollReady(page);
      const firstDraw = await waitFirstDollDraw(page, 20000);
      await page.waitForTimeout(1200);
      const classIds = await page.evaluate(() => [...new Set((globalThis.__mistvaleGame?.state?.hunters || []).map((h) => h.classId))]);
      const rows1 = await facingRows(page);
      await shot(page, 'game-desktop');

      // staged row: every class visible at once, close enough to inspect layers/palette/feet
      const staged = await stagedClassRow(page);
      const rows2 = await facingRows(page);
      await shot(page, 'game-heroes');
      if (staged && staged.bbox) await cropAround(page, staged.bbox, 'game-heroes-crop');

      // attack + skill moments: force the DV2 timestamps, then read which heroloom row each hunter draws
      await forcePose(page, 'attack');
      await page.waitForTimeout(180);
      const attackRows = await facingRows(page);
      if (staged && staged.bbox) await cropAround(page, staged.bbox, 'game-heroes-attack');
      await forcePose(page, 'skill');
      await page.waitForTimeout(180);
      const skillRows = await facingRows(page);
      if (staged && staged.bbox) await cropAround(page, staged.bbox, 'game-heroes-skill');

      // portraits: the hunters roster renders drawPortrait() data URLs
      await act(page, 'hunters');
      await page.waitForTimeout(800);
      const portraits = await portraitReport(page);
      const canvases = await canvasInventory(page);
      await shot(page, 'game-desktop-hunters');

      report.game = {
        bootMs,
        doll,
        dollAfter: await dollStatus(page),
        firstDollDrawMs: firstDraw,
        classIds,
        coverage: coverageOf(rows1, classIds),
        coverageStaged: coverageOf(rows2, classIds),
        coverageAttack: coverageOf(attackRows, classIds),
        coverageSkill: coverageOf(skillRows, classIds),
        staged,
        portraits,
        huntersPanelCanvases: canvases,
        hunters: await page.evaluate(() => (globalThis.__mistvaleGame?.state?.hunters || []).map((h) => ({ id: h.id, classId: h.classId, x: +h.x.toFixed(2), z: +h.z.toFixed(2) }))),
      };
      note(`game desktop: doll ready=${doll.ready}${doll.ready ? ' in ' + doll.readyMs + 'ms' : ''}, first doll draw=${firstDraw.ok ? firstDraw.ms + 'ms' : 'not seen'}, classes=${classIds.length}`);
      const attackActs = [...new Set(attackRows.filter((r) => r.doll).map((r) => r.doll.act))];
      const skillActs = [...new Set(skillRows.filter((r) => r.doll).map((r) => r.doll.act))];
      note(`forced poses: attack rows draw ${JSON.stringify(attackActs)}; skill rows draw ${JSON.stringify(skillActs)}`);
      const badP = portraits.filter((p) => !p.dataURL || p.srcLen < 1200 || !(p.opaquePx > 100));
      note(`portraits: ${portraits.length} imgs, ${badP.length} blank/short`);
    });
  } catch (e) {
    report.game = { error: brief(e && e.message, 500) };
    note('game desktop segment failed: ' + brief(e && e.message, 300));
  }

  // ?doll=0 must fall back to the old hero sheets
  if (WITH_DOLL0) {
    try {
      await withPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, async (page) => {
        const bootMs = await boot(page, urlWith({ preview: '1', doll: '0' }));
        await page.waitForTimeout(1500);
        const status = await dollStatus(page);
        const rows = await facingRows(page);
        const sheets = await page.evaluate(() => ({
          paperdollClassesBase: globalThis.PIXEL_ASSETS?.paperdollClassesBase ?? null,
          heroloomBase: globalThis.PIXEL_ASSETS?.heroloomBase ?? null,
        }));
        await shot(page, 'game-doll0');
        const staged = await stagedClassRow(page);
        if (staged && staged.bbox) await cropAround(page, staged.bbox, 'game-doll0-heroes-crop');
        report.doll0 = {
          bootMs,
          dollStatus: status,
          staged,
          sheetFallback: { base: sheets, facingRows: rows.length, withDoll: rows.filter((r) => r.doll).length },
        };
        note(`?doll=0: doll.on=${status && status.on}, hunters drawn=${rows.length}, with .doll=${rows.filter((r) => r.doll).length}`);
      });
    } catch (e) {
      report.doll0 = { error: brief(e && e.message, 500) };
      note('?doll=0 segment failed: ' + brief(e && e.message, 300));
    }
  }

  // phone
  try {
    await withPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async (page) => {
      const bootMs = await boot(page, urlWith({ preview: '1' }));
      const doll = await waitDollReady(page);
      await page.waitForTimeout(1200);
      await shot(page, 'game-phone');
      const staged = await stagedClassRow(page, { spacing: 1.9, zoom: 5.2 });
      if (staged && staged.bbox) await cropAround(page, staged.bbox, 'game-phone-heroes', { minW: 460, minH: 520, pad: 20 });
      const classIds = await page.evaluate(() => [...new Set((globalThis.__mistvaleGame?.state?.hunters || []).map((h) => h.classId))]);
      report.phone = { bootMs, doll, classIds, staged, coverage: coverageOf(await facingRows(page), classIds) };
      note(`game phone: doll ready=${doll.ready}${doll.ready ? ' in ' + doll.readyMs + 'ms' : ''}, classes=${classIds.length}`);
    });
  } catch (e) {
    report.phone = { error: brief(e && e.message, 500) };
    note('game phone segment failed: ' + brief(e && e.message, 300));
  }
}

// ---------------------------------------------------------------- lab (?loom=1)
async function labPage(viewportOpts, name) {
  return withPage(viewportOpts, async (page) => {
    const bootMs = await boot(page, urlWith({ loom: '1' }));
    let mounted = false;
    try {
      await page.waitForSelector('#heroloom-lab', { timeout: 20000, state: 'attached' });
      mounted = true;
    } catch {
      note('#heroloom-lab never appeared on ?loom=1; retrying with ?preview=1&loom=1');
      await boot(page, urlWith({ preview: '1', loom: '1' }));
      try {
        await page.waitForSelector('#heroloom-lab', { timeout: 15000, state: 'attached' });
        mounted = true;
      } catch {
        note('#heroloom-lab never appeared within 15s after retry');
      }
    }
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => {
      const lab = document.querySelector('#heroloom-lab');
      if (!lab) return { mounted: false };
      const count = (sel) => lab.querySelectorAll(sel).length;
      return {
        mounted: true,
        text: lab.innerText.replace(/\s+/g, ' ').trim().slice(0, 6000),
        attrs: {
          canvases: count('canvas'),
          buttons: count('button'),
          selects: count('select'),
          inputs: count('input'),
          dataClass: count('[data-class]'),
          dataAction: count('[data-action]'),
          actionChips: count('.hl-actions button'),
          thumbs: count('.hl-thumb'),
          dirButtons: count('.hl-dirs button'),
        },
        hook: typeof globalThis.__heroloomLab,
        hookKeys: globalThis.__heroloomLab ? Object.keys(globalThis.__heroloomLab) : [],
        dv2LabPresent: !!document.querySelector('#paperdoll-lab, #doll-lab'),
        canvases: [...lab.querySelectorAll('canvas')].map((c) => ({ id: c.id || null, cls: c.className || null, w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width), cssH: Math.round(c.getBoundingClientRect().height) })),
      };
    });
    const interaction = await labInteraction(page).catch((e) => ({ error: brief(e && e.message, 200) }));
    const canvases = await canvasInventory(page, '#heroloom-lab').catch(() => []);
    await shot(page, name);
    return { bootMs, ...info, interaction, canvasPaint: canvases };
  });
}

if (ONLY.has('lab')) {
  try {
    report.lab = await labPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, 'lab-desktop');
    note(`lab: mounted=${report.lab.mounted} chips=${report.lab.attrs?.actionChips} thumbs=${report.lab.attrs?.thumbs} distinctThumbHashes=${report.lab.interaction?.distinctThumbHashes}`);
  } catch (e) {
    report.lab = { error: brief(e && e.message, 500) };
    note('lab segment failed: ' + brief(e && e.message, 300));
  }
  try {
    report.labPhone = await labPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'lab-phone');
    note(`lab phone: mounted=${report.labPhone.mounted} chips=${report.labPhone.attrs?.actionChips} thumbs=${report.labPhone.attrs?.thumbs}`);
  } catch (e) {
    report.labPhone = { error: brief(e && e.message, 300) };
    note('lab phone segment failed: ' + brief(e && e.message, 200));
  }
}

// ---------------------------------------------------------------- engine probe (desktop page, no screenshots)
if (WITH_PROBE && (ONLY.has('game') || ONLY.has('lab'))) {
  try {
    await withPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, async (page) => {
      const bootMs = await boot(page, urlWith({ preview: '1' }));
      const doll = await waitDollReady(page);
      const firstDraw = await waitFirstDollDraw(page, 20000);
      await page.waitForTimeout(800);
      const probe = await dollProbe(page);
      const domino = await page.evaluate(() => ({
        heroloomBase: globalThis.PIXEL_ASSETS?.heroloomBase ?? null,
        paperdollDv2Base: globalThis.PIXEL_ASSETS?.paperdollDv2Base ?? null,
        startOk: !!document.querySelector('#loading') === false,
        heroSheetMeta: (() => {
          const g = globalThis.__mistvaleGame;
          const h = g?.state?.hunters?.[0];
          return h ? { classId: h.classId, hasHeroSheets: !!(globalThis.__mistvaleHeroSheets) } : null;
        })(),
      }));
      report.probe = { bootMs, dollReady: doll, firstDollDrawMs: firstDraw, ...probe, env: domino };
      const c = probe.compose || {};
      note(`probe: covers=${JSON.stringify(probe.covers)}`);
      note(`probe: compose ${c.ok}/${(c.ok || 0) + (c.fail || 0)} frames ok across ${c.classes} classes × ${c.actions} actions × ${c.dirs} dirs; fails=${JSON.stringify((c.fails || []).slice(0, 5))}`);
      note(`probe: bakeRecipe total=${probe.bake?.totalMs}ms; perClass=${JSON.stringify(Object.fromEntries(Object.entries(probe.bake?.perClass || {}).map(([k, v]) => [k, v.ms ?? v.error])))}`);
      note(`probe: counters before=${JSON.stringify({ composeCount: probe.countersBefore?.composeCount, cached: probe.countersBefore?.cached, composeMs: probe.countersBefore?.composeMs })} after=${JSON.stringify({ composeCount: probe.countersAfter?.composeCount, bakes: probe.countersAfter?.bakes, lastBakeMs: probe.countersAfter?.lastBakeMs })}`);
    });
  } catch (e) {
    report.probe = { error: brief(e && e.message, 500) };
    note('probe segment failed: ' + brief(e && e.message, 300));
  }
}

await browser.close();

report.durationMs = Date.now() - t0;
const realErrors = report.console.errors.filter((e) => !/favicon/i.test(e));
report.errors = {
  consoleErrors: realErrors.length,
  pageErrors: report.pageErrors.length,
  httpErrors: report.httpErrors.length,
  requestFailed: report.requestFailed.length,
};
report.ok = realErrors.length === 0 && report.pageErrors.length === 0;

const summaryFile = path.join(OUT, (TAG ? 'summary-' + PFX.replace(/-$/, '') : 'summary') + '.json');
fs.writeFileSync(summaryFile, JSON.stringify(report, null, 2));
report.summaryFile = summaryFile;
console.log(JSON.stringify(report, null, 2));
if (!report.ok && !ALLOW_ERRORS) process.exitCode = 1;
