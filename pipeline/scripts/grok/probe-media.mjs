#!/usr/bin/env node
/**
 * probe-media.mjs — 列出鏡像站 /imagine 頁面上所有媒體的實際來源,用來找「成品圖真正的 URL」。
 *
 * 動機:grok-gen.mjs 的 snapshot() 只收 `data:image/` 且長度 >= 40000 的字串,
 * 但真正生成的圖是 CDN 的 https URL(或 DOM 裡另有雜訊底圖),所以抓下來的是雜訊。
 * 這支只讀不寫,不改頁面狀態。
 *
 *   node probe-media.mjs [--full]
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const PW_HOME = process.env.PLAYWRIGHT_HOME || 'C:/Users/ray/AppData/Roaming/npm/node_modules';
const CDP = process.env.GROK_IMAGINE_CDP || '9333';
const HOST = process.env.GROK_IMAGINE_HOST || 'grok-d-com-s-grk.wac.wuaicha.cc';
const req = createRequire(path.join(PW_HOME, 'noop.js'));
let chromium;
for (const name of ['@playwright/test', 'playwright']) {
  try { chromium = req(name).chromium; break; } catch {}
}
if (!chromium) throw new Error('cannot load playwright from ' + PW_HOME);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes(HOST) && !p.isClosed()) || ctx.pages()[0];
console.log('URL', page.url());

const data = await page.evaluate(() => {
  const rows = [];
  document.querySelectorAll('img').forEach((im, i) => {
    const s = im.currentSrc || im.src || '';
    rows.push({ tag: 'img', i, kind: s.startsWith('data:') ? 'data' : 'url',
                len: s.length, w: im.naturalWidth, h: im.naturalHeight,
                cls: (im.className || '').toString().slice(0, 60),
                src: s.slice(0, 160) });
  });
  document.querySelectorAll('video').forEach((v, i) => {
    const s = v.currentSrc || v.src || v.querySelector('source')?.src || '';
    rows.push({ tag: 'video', i, kind: s.startsWith('data:') ? 'data' : 'url',
                len: s.length, w: v.videoWidth, h: v.videoHeight, cls: '', src: s.slice(0, 160) });
  });
  document.querySelectorAll('a[href]').forEach((a, i) => {
    const h = a.getAttribute('href') || '';
    if (/\.(png|jpe?g|webp|mp4)(\?|$)/i.test(h)) rows.push({ tag: 'a', i, kind: 'url', len: h.length, w: 0, h: 0, cls: '', src: h.slice(0, 160) });
  });
  return rows;
});
console.log(JSON.stringify({ count: data.length, rows: data }, null, 1));
process.exit(0);
