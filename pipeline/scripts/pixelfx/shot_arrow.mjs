// Headless proof that the new arrowFx cell renders in the game.
//   node pipeline/scripts/pixelfx/shot_arrow.mjs
import { createRequire } from 'module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const OUT = fileURLToPath(new URL('../../../output/pixelfx-arrow', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.goto('http://100.79.149.0:5024/?preview=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame, null, { timeout: 120000 });
// The loader warms 2 images per frame; help it finish so the HUD is not in the way.
await page.evaluate(() => { const w = globalThis.__mistvaleView; for (let i = 0; i < 60; i++) w.warmupAssets(); });
await page.waitForFunction(() => !document.querySelector('#loading'), null, { timeout: 60000 });
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const g = globalThis.__mistvaleGame, w = globalThis.__mistvaleView;
  g.state.paused = true;
  g.state.effects.length = 0;
  w.lookAt(0, 0, 3.2);
  const p = w.project(0, 0);
  // age 0 + a long delay freezes a test arrow at the source, pointing along its path
  g.state.effects.push({ id: 'fx-arrow-test', type: 'arrow', x: 10, z: 0, sourceX: 0, sourceZ: 0, age: 0, delay: 1000, cls: 'archer', value: 0 });
  return { p };
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/ingame-full.png` });
const p = info.p;
await page.screenshot({ path: `${OUT}/ingame-arrow.png`, clip: { x: Math.max(0, p.x - 80), y: Math.max(0, p.y - 80), width: 160, height: 160 } });
await b.close();
console.log(OUT);
