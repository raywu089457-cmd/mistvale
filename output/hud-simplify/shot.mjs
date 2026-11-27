// shot.mjs — 快速截圖。用法: TARGET=... node output/hud-simplify/shot.mjs <tag> [vp...]  (vp: 390x844 844x390 695x800 705x793 1440x900)
import * as L from '../../tools/checks/fix-a-lib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const tag = process.argv[2] || 'dev';
const VPS = { '390x844': { w: 390, h: 844, mobile: true }, '844x390': { w: 844, h: 390, mobile: true }, '695x800': { w: 695, h: 800 }, '705x793': { w: 705, h: 793 }, '1440x900': { w: 1440, h: 900 } };
const want = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(VPS);
const url = process.env.TARGET || 'http://127.0.0.1:5086/?preview=1';
const b = await L.launch();
for (const k of want) {
  const ctx = await L.newCtx(b, VPS[k]); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await L.boot(page, url);
  await page.waitForTimeout(Number(process.env.WAIT || 1500));
  if (process.env.OPEN_CAM) await page.evaluate(() => document.querySelector('#hd2d-cam [data-action=camMenu]')?.click());
  const cl = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(',').map(Number)) : undefined; await page.screenshot({ path: path.join(dir, `${tag}-${k}${process.env.OPEN_CAM ? '-cam' : ''}.png`), clip: cl });
  if (errs.length) console.log(k, 'pageerror', errs);
  await ctx.close();
}
await b.close();
console.log('done');
