#!/usr/bin/env node
/**
 * grok-gen.mjs — drive the 海外客 grok.com mirror's Grok Imagine WITH a reference image.
 *
 * The shipped skill script (grok-imagine.mjs) only types a text prompt. On this
 * mirror a text-only prompt is badly obeyed (wrong pose, wrong background), so
 * everything here attaches a reference image first.
 *
 * Route that keeps us on the composer (important — it must NOT navigate away):
 *   click button[aria-label="Upload"]  ->  button[aria-label="Upload media"]
 *   ->  filechooser  ->  the image is attached to the composer and stays there.
 * Setting the hidden <input type=file> directly instead throws you onto
 * /imagine/post/<uuid> (an image-editor surface with no Submit button).
 *
 * Usage:
 *   node grok-gen.mjs image --prompt-file p.txt --ref r.png [--ratio 2:3]
 *                           [--model speed|quality] [--count 4] --out DIR
 *   node grok-gen.mjs video --prompt-file p.txt --ref r.png [--ratio 1:1]
 *                           [--duration 6] --out DIR
 *   node grok-gen.mjs state
 */
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PW_HOME = process.env.PLAYWRIGHT_HOME || 'C:/Users/ray/AppData/Roaming/npm/node_modules';
const CDP = process.env.GROK_IMAGINE_CDP || '9333';
const HOST = process.env.GROK_IMAGINE_HOST || 'grok-d-com-s-grk.wac.wuaicha.cc';
const OUT_DEFAULT = process.env.GROK_IMAGINE_OUT || 'C:/Users/ray/Pictures/grok-imagine';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const all = n => { const o = []; args.forEach((a, i) => { if (a === '--' + n) o.push(args[i + 1]); }); return o; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const req = createRequire(path.join(PW_HOME, 'noop.js'));
let chromium;
for (const name of ['@playwright/test', 'playwright']) {
  try { chromium = req(name).chromium; break; } catch {}
}
if (!chromium) throw new Error('cannot load playwright from ' + PW_HOME);

const log = (...a) => console.log(...a);
let CUR = null;
const pn = p => { try { return new URL(p.url()).pathname; } catch { return p.url(); } };
const step = (page, tag) => { const u = pn(page); if (u !== CUR) { CUR = u; log(`[url] ${tag}: ${u}`); } };

async function attach() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
  const ctx = browser.contexts()[0];
  // the mirror opens on the dashboard host; the imagine UI lives on the subdomain,
  // so navigate a page that is already on HOST (or make one) — navigating the
  // dashboard tab itself detaches it.
  let page = ctx.pages().find(p => p.url().includes(HOST) && !p.isClosed());
  if (!page) {
    page = await ctx.newPage();
    await page.goto(`https://${HOST}/imagine`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  } else if (!/\/imagine\/?(\?|$)/.test(page.url())) {
    await page.goto(`https://${HOST}/imagine`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  }
  await page.bringToFront().catch(() => {});
  await page.locator('.ProseMirror').first().waitFor({ timeout: 45000 });
  await page.locator('button[aria-label="Dismiss"]').first().click({ timeout: 2500 }).catch(() => {});
  return { browser, page };
}

const loggedIn = async page =>
  !/登录已失效|重新登陆|请重新登录/.test(await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => ''));

/** drop any image and text left over from an earlier run */
async function resetComposer(page) {
  for (let i = 0; i < 8; i++) {
    const hit = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Remove image$/i.test(x.getAttribute('aria-label') || ''));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
    if (!hit) break;
    await sleep(300);
  }
  const ed = page.locator('.ProseMirror').first();
  await ed.click({ timeout: 10000 });
  for (let i = 0; i < 5; i++) {
    const len = ((await ed.innerText().catch(() => '')) || '').length;
    if (!len) break;
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await sleep(250);
  }
  await sleep(300);
}

/** attach reference images through the composer's own + menu (stays on the composer) */
async function attachRefs(page, refs) {
  const menuOpen = async () => (await page.locator('button[aria-label="Upload media"]').count()) > 0;
  if (await menuOpen()) {
    // Escape does not always close this dropdown; a reload is the reliable reset
    log('[ref] + menu was left open, reloading the composer');
    await page.goto(`https://${HOST}/imagine`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('.ProseMirror').first().waitFor({ timeout: 45000 });
    await page.locator('button[aria-label="Dismiss"]').first().click({ timeout: 2500 }).catch(() => {});
    await sleep(1500);
  }

  // the composer's + is the narrow icon button; the dropdown also contains a wide
  // "+ Upload" button with the same aria-label, so pick by width
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-label="Upload"]')]
      .find(x => x.getBoundingClientRect().width < 60);
    if (b) { b.click(); return true; }
    return false;
  });
  if (!opened) throw new Error('composer + button not found');
  await page.locator('button[aria-label="Upload media"]').first().waitFor({ state: 'visible', timeout: 8000 });
  await sleep(400);

  const media = page.locator('button[aria-label="Upload media"]').first();
  let chooser = null;
  try {
    [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 12000 }), media.click()]);
  } catch {
    log('[ref] no filechooser from the menu, falling back to input[type=file]');
  }
  if (chooser) await chooser.setFiles(refs);
  else await page.locator('input[type=file]').first().setInputFiles(refs, { timeout: 30000 });

  log(`[ref] uploaded ${refs.map(r => path.basename(r)).join(', ')}`);
  await sleep(9000);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(800);
  const attached = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^Remove image$/i.test(x.getAttribute('aria-label') || ''));
    return !!b;
  });
  log(`[ref] attached to composer: ${attached}`);
  if (!attached) {
    await page.screenshot({ path: 'C:/Users/ray/tmp/ref-nope.png' }).catch(() => {});
    throw new Error('reference did not attach to the composer');
  }
  step(page, 'after ref');
}

async function setSpeed(page, model) {
  if (!model) return;
  const tab = page.locator('button').filter({ hasText: model === 'quality' ? /Quality/i : /Speed/i }).first();
  if (!(await tab.count())) return log(`[model] no ${model} chip (reference attached hides it?)`);
  if ((await tab.getAttribute('data-state').catch(() => null)) === 'on') return log(`[model] already ${model}`);
  await tab.click({ timeout: 8000 }).catch(() => {});
  await sleep(500);
  log(`[model] -> ${model}`);
}

async function setCount(page, n) {
  if (!n) return;
  const b = page.locator('button[aria-label="Image Count"]').first();
  if (!(await b.count())) return;
  await b.click({ timeout: 6000 }).catch(() => {});
  await sleep(500);
  const item = page.locator('[role="menuitemradio"]').filter({ hasText: new RegExp(`(^|\\D)${n}($|\\D)`) }).first();
  if (await item.count()) { await item.click({ timeout: 5000 }).catch(() => {}); log(`[count] -> ${n}`); }
  else await page.keyboard.press('Escape').catch(() => {});
  await sleep(400);
}

async function setRatio(page, ratio) {
  if (!ratio) return;
  const b = page.locator('button[aria-label="Aspect Ratio"]').first();
  if (!(await b.count())) return log(`[ratio] no Aspect Ratio chip`);
  const cur = ((await b.innerText().catch(() => '')) || '').trim();
  if (cur === ratio) return log(`[ratio] already ${ratio}`);
  await b.click({ timeout: 8000 });
  await sleep(600);
  const item = page.locator('[role="menuitemradio"]').filter({ hasText: ratio }).first();
  if (await item.count()) { await item.click({ timeout: 8000 }); log(`[ratio] ${cur} -> ${ratio}`); }
  else { await page.keyboard.press('Escape').catch(() => {}); log(`[ratio] ${ratio} not offered`); }
  await sleep(500);
}

/** every sizeable inline image + video currently in the DOM, keyed by content hash */
async function snapshot(page) {
  // 實測:真正生成的成品是 https://assets-d-grok-d-com-s-grk.wac.wuaicha.cc/.../image.jpg,
  // 頁面裡那個長度很大的 data:image/png 是版面用的雜訊底圖(256x144),不是成品。
  // 之前只收 data:image/ 所以每次都存到雜訊。改成收 assets host 的 http(s) URL,
  // 用 naturalWidth 過濾掉側邊欄的縮圖。
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('img').forEach(im => {
      const s = im.currentSrc || im.src || '';
      if (!/^https?:/.test(s)) return;
      // 成品有兩種網址:/generated/<uuid>/image.jpg(舊)與 /users/<uid>/<post-uuid>/content(目前這版)
      if (!/\/generated\//.test(s) && !/\/users\//.test(s)) return;
      if ((im.naturalWidth || 0) < 256) return;
      out['i' + im.naturalWidth + 'x' + im.naturalHeight + ':' + s.split('/').slice(-2)[0]] = s;
    });
    document.querySelectorAll('video').forEach(v => {
      const s = v.currentSrc || v.src || v.querySelector('source')?.src || '';
      if (!s) return;
      out['v' + v.duration + ':' + s.slice(-80)] = s;
    });
    return out;
  });
}

const extOf = s => (s.match(/^data:(image|video)\/(\w+)/) || [, 'image', 'png'])[2].replace('jpeg', 'jpg');

async function saveMedia(src, ctx, dir, base) {
  const file = path.join(dir, base + '.' + (src.startsWith('data:video/') ? 'mp4' : extOf(src)));
  if (src.startsWith('data:')) {
    fs.writeFileSync(file, Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'));
  } else {
    const r = await ctx.request.get(src, { timeout: 240000 });
    fs.writeFileSync(file, await r.body());
  }
  const size = fs.statSync(file).size;
  if (size < 20000) { fs.unlinkSync(file); return null; }
  return { file, size };
}

(async () => {
  const { browser, page } = await attach();
  if (!(await loggedIn(page))) { log('NOT_LOGGED_IN'); process.exit(3); }
  await page.setViewportSize({ width: 1440, height: 950 }).catch(() => {});

  if (cmd === 'state') {
    const st = await page.evaluate(() => {
      const g = l => { const b = document.querySelector(`button[aria-label="${l}"]`); return b ? (b.innerText || '').trim().replace(/\s+/g, ' ') : null; };
      return {
        image: g('Image'), video: g('Video'), count: g('Image Count'), ratio: g('Aspect Ratio'),
        chips: [...document.querySelectorAll('button')].filter(b => /Speed|Quality/.test(b.innerText || ''))
          .map(b => ({ t: b.innerText.trim(), on: b.getAttribute('data-state') })),
      };
    });
    log(JSON.stringify(st));
    process.exit(0);
  }

  const outDir = opt('out', OUT_DEFAULT);
  fs.mkdirSync(outDir, { recursive: true });
  const promptPath = opt('prompt-file');
  const flat = promptPath ? fs.readFileSync(promptPath, 'utf8').replace(/\s+/g, ' ').trim() : '';
  const refs = all('ref');
  const want = cmd === 'video' ? 'video' : 'image';

  await resetComposer(page);
  step(page, 'after reset');

  if (refs.length) await attachRefs(page, refs);

  await setSpeed(page, opt('model'));
  await setCount(page, opt('count') ? +opt('count') : null);
  await setRatio(page, opt('ratio'));
  await sleep(400);

  const before = await snapshot(page);
  log(`[base] ${Object.keys(before).length} media items already on screen`);

  const ed = page.locator('.ProseMirror').first();
  await ed.click({ timeout: 10000 });
  await page.keyboard.press('Control+A').catch(() => {});
  await page.keyboard.press('Backspace').catch(() => {});
  await sleep(200);
  await page.keyboard.insertText(flat);      // insertText: no key presses, so no early Enter-submit
  await sleep(900);
  const typedLen = ((await ed.innerText().catch(() => '')) || '').trim().length;
  log(`[prompt] ${flat.length} -> composer ${typedLen}`);
  step(page, 'after typing');

  const submit = page.locator('button[aria-label="Submit"]').first();
  if (!(await submit.count())) {
    await page.screenshot({ path: path.join(outDir, '_fail-nosubmit.png') }).catch(() => {});
    const cand = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter(b => /submit|send|生成|发送/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')))
      .map(b => ({ a: b.getAttribute('aria-label'), t: (b.innerText || '').trim().slice(0, 20), d: b.disabled })));
    log(`NO_SUBMIT_BUTTON url=${pn(page)} candidates=${JSON.stringify(cand)}`);
    process.exit(4);
  }
  await submit.click({ timeout: 20000 });
  log(`[submit] ${new Date().toLocaleTimeString()}`);

  const timeoutS = +(opt('timeout', 420));
  const wanted = +opt('count', 4);
  const t0 = Date.now();
  let fresh = {};
  let best = 0, noGrowth = 0;
  while ((Date.now() - t0) / 1000 < timeoutS) {
    await sleep(4000);
    const now = await snapshot(page);
    fresh = {};
    for (const k of Object.keys(now)) if (!(k in before)) fresh[k] = now[k];
    const kind = Object.keys(fresh).filter(k => (want === 'video' ? k[0] === 'v' : k[0] === 'i')).length;
    log(`[wait] +${((Date.now() - t0) / 1000).toFixed(0)}s new-media=${Object.keys(fresh).length} matching=${kind}`);
    step(page, 'during wait');
    // 一次會落多張:等到數量不再長(連續三次)或已達 --count,而不是看到第一張就走。
    if (kind) {
      if (kind > best) { best = kind; noGrowth = 0; } else noGrowth++;
      if (best >= wanted || noGrowth >= 3) break;
    } else noGrowth = 0;
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const keys = Object.keys(fresh).filter(k => (want === 'video' ? k[0] === 'v' : k[0] === 'i'));
  if (!keys.length) {
    await page.screenshot({ path: path.join(outDir, `_fail-${ts}.png`) }).catch(() => {});
    log(`[fail] no new ${want} within ${timeoutS}s (url ${pn(page)})`);
    process.exit(5);
  }

  const files = [];
  for (const k of keys) {
    const src = fresh[k];
    const h = crypto.createHash('sha1').update(src.slice(0, 4000)).digest('hex').slice(0, 8);
    const got = await saveMedia(src, page.context(), outDir, `${ts}_${h}`);
    if (got) files.push(got);
    if (want === 'image' && files.length >= 8) break;
  }
  log(JSON.stringify({ route: 'grok-imagine-mirror/browser', model: opt('model') || 'default', count: files.length, files }, null, 1));
  // NEVER browser.close() here: over CDP that kills the whole Chrome instance.
  process.exit(0);
})().catch(e => { log('ERROR', e.message); process.exit(1); });
