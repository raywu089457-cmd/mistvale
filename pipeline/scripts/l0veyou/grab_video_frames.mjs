// grab_video_frames.mjs — 從 l0veyou 頁面上把已生成的影片逐格截圖（不用下載檔，直接 seek + 元素截圖）
// 用法: node pipeline/scripts/l0veyou/grab_video_frames.mjs <輸出資料夾> [格數=6]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execSync} from 'node:child_process';
const pw = await import(pathToFileURL(path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.js')).href);
const { chromium } = pw.default || pw;
const outDir = process.argv[2] || 'output/asf-demo/vidframes';
const n = +(process.argv[3] || 6);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9447');
const ctx = b.contexts()[0];
let p = null;
for (const q of ctx.pages()) if (q.url().includes('l0veyou.com')) p = q;
if (!p) { console.log('NO_TAB'); process.exit(2); }
await p.bringToFront(); await p.waitForTimeout(600);
let v = await p.$('video');
if (!v) {
  console.log('no video in view; try opening a recent chat');
  await p.locator('text=/The EXACT|側面|walk/i').first().click().catch(() => {});
  await p.waitForTimeout(4000);
  v = await p.$('video');
}
if (!v) { console.log('STILL_NO_VIDEO'); process.exit(1); }
const meta = await p.evaluate(() => { const v = document.querySelector('video'); return { dur: v.duration, w: v.videoWidth, h: v.videoHeight, ready: v.readyState, src: (v.currentSrc || v.src).slice(0, 80) }; });
console.log('video meta', JSON.stringify(meta));
const times = [];
for (let i = 0; i < n; i++) times.push(+(meta.dur * (i / n)).toFixed(3));
for (let i = 0; i < times.length; i++) {
  await p.evaluate(t => { const v = document.querySelector('video'); v.pause(); v.currentTime = t; }, times[i]);
  await p.waitForTimeout(1000);
  const file = path.join(outDir, `vidframe-${i}.png`);
  await p.locator('video').first().screenshot({ path: file });
  console.log('frame', i, 't=' + times[i]);
}
console.log('saved', times.length, 'frames to', outDir);
await b.close().catch(() => {});
