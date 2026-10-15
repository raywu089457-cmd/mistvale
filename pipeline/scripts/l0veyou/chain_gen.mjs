// chain_gen.mjs — 逐格條件生成實驗：拿第 k 格當參考,只生「下一格」,重複 N 次。
//
// 目的:分辨「換腳失敗」是『一次生 8 格』的限制,還是模型的極限。
//   用法:node pipeline/scripts/l0veyou/chain_gen.mjs --seed <seed.png> --phases <phases.json> --out <dir> [--ratio 16:9]
//
// 前置:已登入的 l0veyou Chrome,CDP 9447(generate.mjs 的同一顆)。
// 每一輪都開新對話(避免多參考圖污染),只附「上一格的成品」當參考圖。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

let pw; try { pw = await import('playwright'); }
catch { pw = await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')).href); }
const { chromium } = pw.default || pw;

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const seed = path.resolve(opt('seed'));
const phasesPath = path.resolve(opt('phases'));
const outDir = path.resolve(opt('out'));
const ratio = opt('ratio', '16:9');
const timeoutS = +(opt('timeout', 180));
fs.mkdirSync(outDir, { recursive: true });

const phases = JSON.parse(fs.readFileSync(phasesPath, 'utf8'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.connectOverCDP('http://127.0.0.1:9447');
const ctx = browser.contexts()[0];

async function pickTab() {
  for (const q of ctx.pages()) {
    const st = await Promise.race([q.evaluate(() => ({ rs: document.readyState, t: document.body ? document.body.innerText : '' })),
      new Promise(r => setTimeout(() => r({ rs: 'timeout', t: '' }), 5000))]);
    if (q.url().includes('l0veyou.com/chat') && st.rs === 'complete' && st.t && !st.t.includes('登录 / 注册')) return { page: q, ok: true };
  }
  return { page: null, ok: false };
}

async function generate(prompt, reference, index) {
  await new Promise(r => setTimeout(r, 300));
  const tabs = [];
  for (const q of ctx.pages()) tabs.push(q);
  // 每次都開新對話:找已登入且載入完成的分頁
  let page = null;
  for (const q of tabs) {
    const st = await Promise.race([q.evaluate(() => ({ rs: document.readyState, t: document.body ? document.body.innerText : '' })),
      new Promise(r => setTimeout(() => r({ rs: 'timeout', t: '' }), 5000))]);
    if (q.url().includes('l0veyou.com/chat') && st.rs === 'complete' && st.t && !st.t.includes('登录 / 注册')) { page = q; break; }
  }
  if (!page) throw new Error('NO_LOGGED_IN_TAB');
  await page.bringToFront();
  await page.locator('button.new-chat').click().catch(() => {});
  await page.waitForTimeout(1200);
  const rail = page.locator('button.rail-btn', { hasText: 'AI 生图' });
  if (await rail.count() && !(await rail.getAttribute('class')).includes('active')) { await rail.click(); await page.waitForTimeout(700); }
  const model = (await page.locator('button.model-trigger').innerText()).trim();
  if (!model.includes('GPT Image 2')) {
    await page.locator('button.model-trigger').click(); await page.waitForTimeout(500);
    await page.getByText('GPT Image 2', { exact: false }).last().click(); await page.waitForTimeout(500);
  }
  await page.locator('button.ratio-btn').filter({ hasText: new RegExp('^' + ratio + '$') }).click().catch(() => {});
  await page.waitForTimeout(250);
  if (reference) { await page.locator('input.file-input').setInputFiles(reference); await page.waitForTimeout(5000); }
  const before = new Set(await page.evaluate(() => [...document.images].map(i => i.currentSrc || i.src)));
  const ta = page.locator('textarea[aria-label="消息输入框"]');
  await ta.click(); await ta.fill(prompt); await page.waitForTimeout(300);
  await page.locator('button.send').click();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutS * 1000) {
    await page.waitForTimeout(4000);
    const imgs = await page.evaluate(() => [...document.images].map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, done: i.complete })));
    const fresh = imgs.filter(i => !before.has(i.src) && !i.src.startsWith('data:') && !i.src.startsWith('blob:') && i.done && i.w >= 512 && i.h >= 384);
    if (fresh.length) {
      const url = fresh[fresh.length - 1].src;
      const resp = await ctx.request.get(url, { timeout: 120000 });
      const file = path.join(outDir, `frame-${index}.png`);
      fs.writeFileSync(file, await resp.body());
      log(`frame-${index}: ${fresh[fresh.length - 1].w}x${fresh[fresh.length - 1].h} after ${Math.round((Date.now() - t0) / 1000)}s`);
      return file;
    }
    const tail = await page.evaluate(() => { const m = document.querySelector('main') || document.body; return m.innerText.slice(-160).replace(/\s+/g, ' '); });
    if (/生成失败|请稍后重试/.test(tail)) throw new Error('SITE_GEN_FAILED: ' + tail);
  }
  throw new Error('TIMEOUT waiting for image');
}

let reference = seed;
log('seed', reference);
for (let i = 0; i < phases.length; i++) {
  const prompt = phases[i];
  log(`--- step ${i + 1}/${phases.length}`);
  reference = await generate(prompt, reference, i + 1);
}
log('done', outDir);
process.exit(0);
