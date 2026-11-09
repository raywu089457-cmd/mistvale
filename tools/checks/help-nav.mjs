// 驗收：說明面板的段落目錄（T148）
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const URL = 'http://100.79.149.0:5024/?preview=1';
let fails = 0, oks = 0;
const fix = (m) => { fails++; console.log('FIX ' + m); };
const ok = (m) => { oks++; console.log('ok  ' + m); };

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new', '--mute-audio'] });
for (const dev of [{ name: 'desktop 1440x900', w: 1440, h: 900, mobile: false }, { name: 'phone 402x712', w: 402, h: 712, mobile: true }]) {
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, hasTouch: dev.mobile, isMobile: dev.mobile, deviceScaleFactor: dev.mobile ? 2 : 1, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#loading'), null, { timeout: 180000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-action="help"]')?.click());
  await page.waitForTimeout(600);

  const base = await page.evaluate(() => {
    const c = document.querySelector('#modal-content');
    return {
      chips: [...document.querySelectorAll('.help-nav-chip')].map((b) => ({ t: b.textContent.trim(), target: b.dataset.target, h: Math.round(b.getBoundingClientRect().height) })),
      sections: [...document.querySelectorAll('.help-sec')].map((s) => s.id),
      pageH: document.documentElement.scrollWidth > innerWidth + 2,
    };
  });
  if (base.chips.length !== 5) fix(`${dev.name}: 目錄有 ${base.chips.length} 顆（應該 5）`);
  else ok(`${dev.name}: 目錄 5 顆（${base.chips.map((c) => c.t).join('／')}）`);
  const minH = dev.mobile ? 44 : 32;
  const small = base.chips.filter((c) => c.h < minH);
  if (small.length) fix(`${dev.name}: 目錄按鈕太矮 ${small.map((c) => c.t + ' ' + c.h + 'px').join('、')}（至少 ${minH}px）`);
  if (base.pageH) fix(`${dev.name}: 頁面出現橫向溢出`);
  for (const c of base.chips) if (!base.sections.includes(c.target)) fix(`${dev.name}: 目錄指向不存在的段落 ${c.target}`);

  // 逐一點目錄，段落要滾到頂端附近
  let prevTop = -1;
  for (const c of base.chips) {
    await page.evaluate((t) => document.querySelector(`.help-nav-chip[data-target="${t}"]`).click(), c.target);
    await page.waitForTimeout(700);
    const st = await page.evaluate((t) => {
      const box = document.querySelector('#modal-content');
      const sec = document.getElementById(t);
      const nav = document.querySelector('.help-nav');
      const cs = getComputedStyle(nav);
      return {
        atMax: box.scrollTop + box.clientHeight >= box.scrollHeight - 6,
        rel: Math.round(sec.getBoundingClientRect().top - box.getBoundingClientRect().top),
        scrollTop: Math.round(box.scrollTop),
        navRel: Math.round(nav.getBoundingClientRect().top - box.getBoundingClientRect().top),
        sticky: cs.position,
      };
    }, c.target);
    // 段落太靠底部時捲不動（已經到底），那種情況只看「有捲到能捲的極限」
    if (!st.atMax && (st.rel < 20 || st.rel > 110)) fix(`${dev.name}: 點「${c.t}」後段落位置 ${st.rel}px（應在 20–110px，代表真的跳到那一段）`);
    if (st.sticky !== 'sticky') fix(`${dev.name}: 目錄不是 sticky，捲下去就看不到了`);
    if (st.navRel > 40) fix(`${dev.name}: 捲動後目錄跑到 ${st.navRel}px，離開可視頂端`);
    if (c.target === 'help-sec-outside' && st.scrollTop <= prevTop) {
      if (st.scrollTop < 200) fix(`${dev.name}: 最末段沒有滾動（${prevTop} → ${st.scrollTop}）`);
    }
    prevTop = Math.max(prevTop, st.scrollTop);
  }
  if (prevTop > 200) ok(`${dev.name}: 五段都能跳到（最末段捲到 ${prevTop}px，目錄黏在頂端）`);

  if (errors.length) fix(`${dev.name}: 頁面錯誤 ${errors[0]}`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `FAIL ${fails} 項` : `PASS help nav: 說明面板頂端有段落目錄，點一下就跳到該段、捲動時目錄黏在頂端、按鈕夠大（${oks} 項 ok）`);
process.exit(fails ? 1 : 0);
