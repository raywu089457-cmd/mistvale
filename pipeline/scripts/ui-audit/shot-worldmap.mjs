import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
// shot-worldmap.mjs — world map modal screenshots (desktop + phone), scrolled to the region card given as argv[2] (e.g. snow). Output: output/ui-audit/shots/wm-<desktop|phone>.png
const OUT = fileURLToPath(new URL('../../../output/ui-audit/shots', import.meta.url)); fs.mkdirSync(OUT, { recursive: true }); const FOCUS = process.argv[2] || '';
for (const [n, opt] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 402, height: 712 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
  const page = await (await b.newContext(opt)).newPage();
  await page.goto('http://100.79.149.0:5024/?preview=1', { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => { const el = document.createElement('button'); el.dataset.action = 'worldmap'; document.body.append(el); el.click(); el.remove(); });
  await page.waitForTimeout(700); await page.evaluate(f => (document.querySelector(`.region-card[data-region="${f}"]`) || document.querySelector('.region-grid'))?.scrollIntoView({ block: 'start' }), FOCUS);
  await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/wm-${n}.png` }); await b.close();
}
