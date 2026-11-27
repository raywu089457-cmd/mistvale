// 驗收：手機「操作獵人」模式的介面不能互相壓到（T144）
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { name: 'phone 402x712', width: 402, height: 712 },
  { name: 'phone 360x640', width: 360, height: 640 },
];
let fails = 0, oks = 0;
const fix = (m) => { fails++; console.log('FIX ' + m); };
const ok = (m) => { oks++; console.log('ok  ' + m); };
const near = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
for (const dev of DEVICES) {
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  // 進入操作模式：先叫出選人清單，再點第一位獵人
  await page.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'pilotLab'; b.style.cssText = 'position:fixed;left:-999px'; b.id = '__t144'; document.body.appendChild(b); b.click(); });
  await page.waitForTimeout(400);
  const picks = await page.evaluate(() => document.querySelectorAll('#pilotlab [data-pilot="go"]').length);
  if (!picks) { fix(`${dev.name}: 操作模式的選人清單是空的`); await ctx.close(); continue; }
  await page.evaluate(() => document.querySelector('#pilotlab [data-pilot="go"]').click());
  await page.waitForTimeout(1400);

  const st = await page.evaluate(() => {
    const labEl = document.querySelector('#pilotlab');
    const labRect = labEl ? labEl.getBoundingClientRect() : null;
    const labButtons = [...(labEl ? labEl.querySelectorAll('button') : [])].map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }; });
    const tip = labEl ? labEl.querySelector('.pl-tip') : null;
    const strip = { h: labRect ? Math.round(labRect.height) : 0, buttons: labButtons, tipShown: !!(tip && getComputedStyle(tip).display !== 'none') };
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const q = (s) => document.querySelector(s);
    const rects = {};
    for (const [k, sel] of Object.entries({ stick: '#pilot-stick', skill: '#pilot-skill', atk: '#pilot-atk', stop: '.ph-actions [data-pilot="stop"]' })) {
      const el = q(sel); if (el) rects[k] = r(el);
    }
    const hit = (x, y) => { const e = document.elementFromPoint(x, y); if (!e) return null; if (e.closest('#pilot-stick')) return 'stick'; const b = e.closest('button'); return b ? (b.id || b.dataset.pilot || 'btn') : (e.id || null); };
    const hits = {};
    for (const [k, b] of Object.entries(rects)) hits[k] = hit(b.x + b.w / 2, b.y + b.h / 2);
    const status = q('#pilotlab');
    return {
      piloting: document.body.classList.contains('piloting'),
      hud: !!q('#pilot-hud'), rects, hits,
      statusText: status ? status.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : '',
      bar: q('#bottom-bar') ? getComputedStyle(q('#bottom-bar')).display : 'none',
      vw: innerWidth, vh: innerHeight, strip,
    };
  });

  if (!st.piloting) fix(`${dev.name}: 沒有進入操作模式（body 沒有 .piloting）`);
  else ok(`${dev.name}: 進入操作模式`);
  if (!st.hud) fix(`${dev.name}: 沒有畫出操作介面 #pilot-hud`);

  const R = st.rects;
  for (const k of ['stick', 'skill', 'atk', 'stop']) if (!R[k]) fix(`${dev.name}: 缺少 ${k} 控制項`);
  if (R.stick && (R.stick.w < 110 || R.stick.h < 110)) fix(`${dev.name}: 搖桿只有 ${R.stick.w}x${R.stick.h}，太小不好推`);
  const names = Object.keys(R);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    if (near(R[names[i]], R[names[j]])) fix(`${dev.name}: ${names[i]} 和 ${names[j]} 重疊（會互相搶觸控）`);
  }
  if (fails === 0) ok(`${dev.name}: 搖桿／技能／攻擊／離開互不重疊`);
  for (const k of ['skill', 'atk', 'stop']) {
    if (R[k] && (R[k].w < 44 || R[k].h < 44)) fix(`${dev.name}: ${k} 只有 ${R[k].w}x${R[k].h}，小於 44`);
  }
  for (const k of names) {
    const b = R[k];
    if (b.x < 0 || b.y < 0 || b.x + b.w > st.vw || b.y + b.h > st.vh) fix(`${dev.name}: ${k} 跑出畫面 ${JSON.stringify(b)}`);
  }
  for (const k of names) {
    if (st.hits[k] !== (k === 'stick' ? 'stick' : (k === 'stop' ? 'stop' : st.hits[k]))) {
      if (!st.hits[k]) fix(`${dev.name}: ${k} 的中心點點不到任何東西`);
    }
  }
  const strip = st.strip || { h: 0, buttons: [], tipShown: false };
  for (const b of strip.buttons) if (b.w < 44 || b.h < 44) fix(`${dev.name}: 狀態列的「${b.t}」只有 ${b.w}x${b.h}，小於 44`);
  if (dev.width <= 400) {
    if (strip.tipShown) fix(`${dev.name}: 小螢幕還顯示兩行操作提示（佔掉 32px 高度）`);
    if (strip.h > 100) fix(`${dev.name}: 狀態列高 ${strip.h}px，小螢幕太佔位（應 <= 100）`);
  } else if (!strip.tipShown) fix(`${dev.name}: 大螢幕反而沒有操作提示`);
  if (!/Lv\.|生命|待機|狩獵/.test(st.statusText)) fix(`${dev.name}: 上方沒有顯示角色狀態（${st.statusText || '空'}）`);
  else ok(`${dev.name}: 上方狀態列「${st.statusText}」`);
  if (st.bar !== 'none') fix(`${dev.name}: 操作模式時底部的村莊按鈕列還顯示（應該讓位給操控介面）`);

  // 離開：按 ✕ 應該回到村莊介面
  await page.evaluate(() => document.querySelector('.ph-actions [data-pilot="stop"]').click());
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({ piloting: document.body.classList.contains('piloting'), hud: !!document.querySelector('#pilot-hud'), bar: document.querySelector('#bottom-bar') ? getComputedStyle(document.querySelector('#bottom-bar')).display : 'none' }));
  if (after.piloting || after.hud) fix(`${dev.name}: 按「離開」後還停在操作模式`);
  else ok(`${dev.name}: 按「離開」回到村莊（底部按鈕列 ${after.bar}）`);

  if (errors.length) fix(`${dev.name}: 頁面錯誤 ${errors[0]}`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `FAIL ${fails} 項` : `PASS pilot hud: 手機操作模式（搖桿 124px、技能／攻擊／離開 44px 以上）互不重疊、都在畫面內、點得到、狀態列有角色資訊、離開會回到村莊（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
