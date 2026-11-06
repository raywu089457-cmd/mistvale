// shot-foothills.mjs — T68 before/after screenshots of the 鐵脊山麓/向陽草原 corner.
// Same camera framing for both shots: 1440x900, world (10,-12) at scale 1.15 (region labels draw
// below scale 1.2), game paused, HUD/toasts/modals hidden so only the ground layer and labels show.
// Usage: node pipeline/scripts/ui-audit/shot-foothills.mjs before|after|compare
//   before/after -> output/foothills-edge/<mode>.png
//   compare      -> output/foothills-edge/compare.png (both at 990 px wide, at most 2000 px total)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const OUT = path.resolve('output/foothills-edge');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// The game paints into canvases and reads them back, so file:// taints them (loading sticks at 99%).
// Use the local server, which re-reads ../../outputs/暮影村.html on every request.
const GAME = process.env.TARGET || 'http://100.79.149.0:5024/';
const mode = process.argv[2] || 'after';

async function shot(name) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${GAME}?preview=1&t=${Date.now()}`, { waitUntil: 'commit', timeout: 120000 });
    await page.waitForFunction(() => globalThis.__mistvaleGame && globalThis.__mistvaleView, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.querySelector('#loading'), null, { timeout: 180000 });
    await page.evaluate(() => {
      const g = globalThis.__mistvaleGame;
      g.state.paused = true;
      for (const sel of ['#game-ui', '#toasts', '#modal-backdrop']) document.querySelector(sel)?.style.setProperty('display', 'none', 'important');
      globalThis.__mistvaleView.lookAt(10, -12, 1.15);
    });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  } finally { await browser.close(); }
}

async function compare() {
  const before = fs.readFileSync(path.join(OUT, 'before.png')).toString('base64');
  const after = fs.readFileSync(path.join(OUT, 'after.png')).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--headless=new'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1980, height: 650 }, deviceScaleFactor: 1 })).newPage();
    await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111;color:#f0e6c8;font:16px sans-serif">
      <div id="wrap" style="width:1980px;background:#111">
        <div style="display:flex">
          <div style="width:990px"><div style="height:24px;line-height:24px;padding-left:6px">before</div><img src="data:image/png;base64,${before}" style="width:990px;display:block"></div>
          <div style="width:990px"><div style="height:24px;line-height:24px;padding-left:6px">after</div><img src="data:image/png;base64,${after}" style="width:990px;display:block"></div>
        </div>
      </div></body>`, { waitUntil: 'load' });
    await page.waitForTimeout(100);
    await page.locator('#wrap').screenshot({ path: path.join(OUT, 'compare.png') });
  } finally { await browser.close(); }
}

if (mode === 'compare') await compare(); else await shot(mode);
console.log(`${mode}: output/foothills-edge/${mode}.png`);
