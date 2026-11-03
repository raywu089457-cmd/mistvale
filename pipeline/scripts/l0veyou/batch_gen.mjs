// batch_gen.mjs — 連續生 N 張圖（沿用 generate.mjs 的流程，但每張等更久、並把結果存檔）
// 用法：node pipeline/scripts/l0veyou/batch_gen.mjs <prompt檔（一行一個提示詞）> <輸出目錄> [比例 1:1]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
let pw;
try { pw = await import('playwright'); } catch { pw = await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')).href); }
const { chromium } = pw.default || pw;

const [promptFile, outDir, ratio = '1:1'] = process.argv.slice(2);
if (!promptFile || !outDir) { console.error('用法: batch_gen.mjs <prompt檔> <輸出目錄> [比例]'); process.exit(1); }
const prompts = fs.readFileSync(promptFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
fs.mkdirSync(outDir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const b = await chromium.connectOverCDP('http://127.0.0.1:9447');
const ctx = b.contexts()[0];
const pickTab = async () => {
  for (const q of ctx.pages()) {
    const st = await Promise.race([q.evaluate(() => ({ rs: document.readyState, t: document.body ? document.body.innerText : '' })), new Promise(r => setTimeout(() => r({ rs: 'timeout', t: '' }), 5000))]);
    if (q.url().includes('l0veyou.com/chat') && st.rs === 'loading' && !st.t) { await q.close().catch(() => {}); continue; }
    if (q.url().includes('l0veyou.com/chat') && st.rs === 'complete' && st.t && !st.t.includes('登录 / 注册')) return q;
  }
  return null;
};

let ok = 0, fail = 0;
for (let n = 0; n < prompts.length; n++) {
  const prompt = prompts[n];
  const name = `img-${String(n + 1).padStart(2, '0')}.png`;
  log(`[${n + 1}/${prompts.length}] ${prompt.slice(0, 40)}…`);
  try {
    const p = await pickTab();
    if (!p) { log('NO_LOGGED_IN_TAB'); fail++; break; }
    await p.bringToFront().catch(() => {});
    await p.waitForTimeout(400);
    await p.locator('button.new-chat').click(); await p.waitForTimeout(1500);
    const rail = p.locator('button.rail-btn', { hasText: 'AI 生图' });
    if (await rail.count() && !(await rail.first().getAttribute('class')).includes('active')) { await rail.first().click(); await p.waitForTimeout(700); }
    const model = (await p.locator('button.model-trigger').innerText()).trim();
    if (!model.includes('GPT Image 2')) {
      await p.locator('button.model-trigger').click(); await p.waitForTimeout(600);
      await p.getByText('GPT Image 2', { exact: false }).last().click(); await p.waitForTimeout(600);
    }
    await p.locator('button.ratio-btn').filter({ hasText: new RegExp('^' + ratio + '$') }).click().catch(() => {});
    await p.waitForTimeout(250);
    const before = new Set(await p.evaluate(() => [...document.images].map(i => i.currentSrc || i.src)));
    const ta = p.locator('textarea[aria-label="消息输入框"]');
    await ta.click(); await ta.fill(prompt); await p.waitForTimeout(300);
    await p.locator('button.send').click();
    const t0 = Date.now(); let url = null;
    while (Date.now() - t0 < 12 * 60e3) {
      await p.waitForTimeout(5000);
      const imgs = await p.evaluate(() => [...document.images].map(i => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, done: i.complete })));
      const fresh = imgs.filter(i => !before.has(i.src) && !i.src.startsWith('data:') && !i.src.startsWith('blob:') && i.done && i.w >= 512 && i.h >= 384);
      if (fresh.length) { url = fresh[fresh.length - 1].src; log('  圖片', fresh[fresh.length - 1].w + 'x' + fresh[fresh.length - 1].h, Math.round((Date.now() - t0) / 1000) + 's'); break; }
    }
    if (!url) { log('  超時，這張跳過'); fail++; continue; }
    const r = await ctx.request.get(url);
    fs.writeFileSync(path.join(outDir, name), await r.body());
    log('  存檔', name, Math.round(fs.statSync(path.join(outDir, name)).size / 1024) + 'KB');
    ok++;
  } catch (e) {
    log('  錯誤:', String(e).split('\n')[0].slice(0, 120)); fail++;
    await new Promise(r => setTimeout(r, 8000));
  }
}
log(`完成：成功 ${ok} 張、失敗 ${fail} 張 → ${outDir}`);
await b.close().catch(() => {});
