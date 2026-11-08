// quest-chain.mjs — T103: 村長委託的章節鏈要是「時間軸」，獎勵靠左、狀態固定在標題右側、鎖住也要能預覽。
// Usage: node tools/checks/quest-chain.mjs        (game server on 5024 expected; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/quest-chain.mjs   also writes output/quests/montage.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { label: 'desktop 1440x900', width: 1440, height: 900, phone: false },
  { label: 'phone 402x712', width: 402, height: 712, phone: true },
  { label: 'phone 360x640', width: 360, height: 640, phone: true },
];
const fails = [], shots = [];
const fix = m => fails.push(m);
if (process.env.SHOTS) fs.mkdirSync('output/quests', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

const READ = () => {
  const c = document.querySelector('#modal-content');
  if (!c) return { open: false };
  const num = n => Math.round(n * 10) / 10;
  const steps = [...c.querySelectorAll('.quest-step')].map(li => {
    const r = li.getBoundingClientRect();
    const after = getComputedStyle(li, '::after');
    const badge = li.querySelector('.qs-num');
    const br = badge.getBoundingClientRect();
    const head = li.querySelector('.qs-head');
    const h3 = li.querySelector('h3');
    const tag = li.querySelector('.qs-tag');
    const reward = li.querySelector('.qs-reward');
    const chips = reward ? [...reward.querySelectorAll(':scope > span')] : [];
    const btn = li.querySelector('button.qs-claim');
    const prog = li.querySelector('.qs-progress');
    return {
      cls: li.className,
      current: li.getAttribute('aria-current'),
      w: num(r.width),
      badgeX: num(br.left), badgeW: num(br.width),
      spine: { content: after.content, width: after.width, bg: after.backgroundImage },
      title: h3 ? h3.textContent.trim() : '',
      titleLeft: h3 ? num(h3.getBoundingClientRect().left) : 0,
      tagText: tag ? tag.textContent.replace(/\s+/g, ' ').trim() : '',
      tagRight: tag ? num(tag.getBoundingClientRect().right) : 0,
      tagLock: tag ? !!tag.querySelector('[data-icon=lock]') : false,
      headRight: head ? num(head.getBoundingClientRect().right) : 0,
      desc: li.querySelector('p')?.textContent.trim() || '',
      reward: reward ? {
        label: reward.querySelector('small')?.textContent.trim() || '',
        left: num(reward.getBoundingClientRect().left),
        chips: chips.map(s => ({ text: s.textContent.replace(/\s+/g, ' ').trim(), icons: s.querySelectorAll('[data-icon]').length, left: num(s.getBoundingClientRect().left) })),
      } : null,
      btn: btn ? { label: btn.textContent.trim(), disabled: btn.disabled } : null,
      prog: prog ? { now: prog.getAttribute('aria-valuenow'), max: prog.getAttribute('aria-valuemax'), bar: prog.querySelector('b')?.textContent.trim(), pct: num(parseFloat(prog.querySelector('span')?.style.width) || 0), role: prog.getAttribute('role') } : null,
    };
  });
  const banner = c.querySelector('.encounter-banner.quests')?.textContent.replace(/\s+/g, ' ').trim() || '';
  return { open: true, steps, banner, scrollX: c.scrollWidth - c.clientWidth, contentW: c.clientWidth };
};

async function boot(dev) {
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.phone ? 2 : 1, isMobile: dev.phone, hasTouch: dev.phone, locale: 'zh-TW' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    s.paused = true;
    // fixed chapter: 第 3 章（index 2）進行中、進度 1/3、還沒領
    Object.assign(s.quest, { index: 2, progress: 1, target: 3, complete: false, claimed: false });
  });
  return { ctx, page, errs };
}

const openQuests = async page => {
  await page.evaluate(() => { const el = document.createElement('button'); el.dataset.action = 'quests'; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); });
  await page.waitForTimeout(500);
};

for (const dev of DEVICES) {
  const { ctx, page, errs } = await boot(dev);
  try {
    const tag = dev.label;
    await openQuests(page);
    let m = await page.evaluate(READ);
    if (!m.open) { fix(`${tag}: 委託面板沒有開`); continue; }
    if (m.steps.length < 5) fix(`${tag}: 章節只有 ${m.steps.length} 章，看起來不對`);
    if (m.scrollX > 1) fix(`${tag}: 面板橫向溢出 ${m.scrollX}px`);

    // 1. 橫幅要寫第幾章／共幾章／已解鎖幾章
    if (!/第 3 章／共 \d+ 章/.test(m.banner)) fix(`${tag}: 橫幅沒寫「第 3 章／共 N 章」— ${m.banner}`);
    if (!/已解鎖 3 章/.test(m.banner)) fix(`${tag}: 橫幅的已解鎖章數不對（應為 3）— ${m.banner}`);

    // 2. 只有一個 current，且它能領/不能領的狀態正確
    const cur = m.steps.filter(s => s.cls.includes('current'));
    if (cur.length !== 1) fix(`${tag}: current 章節有 ${cur.length} 個`);
    if (m.steps[2].current !== 'step') fix(`${tag}: 目前章節沒有 aria-current="step"`);
    const c0 = m.steps[2];
    if (/進行中/.test(c0.tagText) === false) fix(`${tag}: 未完成的當前章節標籤應寫「進行中」— ${c0.tagText}`);
    if (!c0.btn || !c0.btn.disabled) fix(`${tag}: 未完成時領取鈕應 disabled — ${c0.btn && c0.btn.label}`);
    if (!c0.prog) fix(`${tag}: 目前章節沒有進度條`);
    else {
      if (c0.prog.role !== 'progressbar') fix(`${tag}: 進度條沒有 role=progressbar`);
      if (c0.prog.now !== '1' || c0.prog.max !== '3') fix(`${tag}: 進度條 aria 值不是 1/3 — ${c0.prog.now}/${c0.prog.max}`);
      if (!/^1\/3$/.test(c0.prog.bar)) fix(`${tag}: 進度數字不是 1/3 — ${c0.prog.bar}`);
      if (Math.abs(c0.prog.pct - 33.3) > 1.5) fix(`${tag}: 進度條寬度不是 1/3（${c0.prog.pct}%）`);
    }

    // 3. 已完成章節：✓、標籤「已完成」、不能有領取鈕
    for (const i of [0, 1]) {
      const s = m.steps[i];
      if (!s.cls.includes('done')) fix(`${tag}: 第 ${i + 1} 章應為 done — ${s.cls}`);
      if (!/已完成/.test(s.tagText)) fix(`${tag}: 第 ${i + 1} 章標籤應寫「已完成」— ${s.tagText}`);
      if (s.btn) fix(`${tag}: 已完成的第 ${i + 1} 章不該有領取鈕`);
    }

    // 4. 鎖住的章節：鎖頭圖示＋未解鎖、沒有可按的鈕、但說明與獎勵要能預覽
    const locked = m.steps.slice(3);
    if (locked.length < 3) fix(`${tag}: 後面鎖住的章節只有 ${locked.length} 章`);
    for (const s of locked) {
      if (!s.cls.includes('locked')) fix(`${tag}: 「${s.title}」應該是 locked — ${s.cls}`);
      if (!s.tagLock) fix(`${tag}: 「${s.title}」的未解鎖標籤沒有鎖頭圖示`);
      if (!/未解鎖/.test(s.tagText)) fix(`${tag}: 「${s.title}」標籤應寫「未解鎖」— ${s.tagText}`);
      if (s.btn) fix(`${tag}: 鎖住的「${s.title}」不該有領取鈕`);
      if (!s.desc) fix(`${tag}: 鎖住的「${s.title}」沒有說明可以預覽`);
      if (!s.reward || !s.reward.chips.length) fix(`${tag}: 鎖住的「${s.title}」沒有獎勵可以預覽`);
    }

    // 5. 獎勵靠左對齊標題、狀態固定在標題右側
    for (const s of m.steps) {
      if (!s.reward) { fix(`${tag}: 「${s.title}」沒有獎勵列`); continue; }
      if (!s.reward.label) fix(`${tag}: 「${s.title}」獎勵列沒有「獎勵」小標`);
      if (Math.abs(s.reward.left - s.titleLeft) > 2) fix(`${tag}: 「${s.title}」獎勵列沒有對齊標題左緣（${s.reward.left} vs ${s.titleLeft}）`);
      if (!s.reward.chips.length) fix(`${tag}: 「${s.title}」獎勵列是空的`);
      for (const ch of s.reward.chips) if (!ch.icons) fix(`${tag}: 「${s.title}」的獎勵「${ch.text}」沒有圖示`);
      if (Math.abs(s.tagRight - s.headRight) > 2) fix(`${tag}: 「${s.title}」狀態沒有貼齊標題列右緣（${s.tagRight} vs ${s.headRight}）`);
      if (Math.abs(s.badgeX - m.steps[0].badgeX) > 1) fix(`${tag}: 「${s.title}」圓章沒有和其他章節同一條垂直線（x=${s.badgeX}）`);
      if (s.w > m.contentW + 1) fix(`${tag}: 「${s.title}」超出面板寬度 ${s.w} > ${m.contentW}`);
    }

    // 6. 時間軸接線：除最後一章外都要有 2px 的連接線
    for (let i = 0; i < m.steps.length - 1; i++) {
      const sp = m.steps[i].spine;
      if (sp.content === 'none' || sp.content === 'normal') fix(`${tag}: 第 ${i + 1} 章沒有時間軸連接線`);
      if (Math.abs(parseFloat(sp.width) - 2) > 0.5) fix(`${tag}: 第 ${i + 1} 章的連接線寬度不是 2px（${sp.width}）`);
      if (!sp.bg || sp.bg === 'none') fix(`${tag}: 第 ${i + 1} 章的連接線沒有顏色`);
    }

    // 7. 進度達成後：可領取、橫幅提示、已解鎖章數 +1
    await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.quest.progress = 3; s.quest.complete = true; });
    await openQuests(page);
    m = await page.evaluate(READ);
    const c1 = m.steps[2];
    if (!/可領取/.test(c1.tagText)) fix(`${tag}: 完成後標籤應寫「可領取」— ${c1.tagText}`);
    if (!c1.btn || c1.btn.disabled) fix(`${tag}: 完成後領取鈕應可按 — ${c1.btn && c1.btn.label}`);
    else if (!/領取獎勵/.test(c1.btn.label)) fix(`${tag}: 完成後領取鈕文字應為「領取獎勵」— ${c1.btn.label}`);
    if (!/本章獎勵可領取/.test(m.banner)) fix(`${tag}: 橫幅沒有提示本章獎勵可領取 — ${m.banner}`);
    if (!/已解鎖 4 章/.test(m.banner)) fix(`${tag}: 完成後已解鎖章數應為 4 — ${m.banner}`);
    if (c1.prog && Math.abs(c1.prog.pct - 100) > 1) fix(`${tag}: 完成後進度條應滿格（${c1.prog.pct}%）`);

    if (process.env.SHOTS) {
      await page.evaluate(() => { document.querySelector('#modal-content').scrollTop = 0; });
      const p = `output/quests/chain-${dev.width}x${dev.height}.png`;
      await page.screenshot({ path: p }); shots.push(p);
    }
    if (errs.length) fix(`${tag}: 頁面錯誤 ${errs[0]}`);
  } finally {
    await ctx.close();
  }
}

await browser.close();

if (shots.length) {
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('python', ['-c', `
from PIL import Image
files = ${JSON.stringify(shots)}
ims = [Image.open(f) for f in files]
w = max(i.width for i in ims)
h = sum(i.height for i in ims)
out = Image.new('RGB', (w, h), (18, 12, 7))
y = 0
for i in ims:
    out.paste(i, (0, y)); y += i.height
out.save('output/quests/montage.png')
print('montage output/quests/montage.png')
`], { stdio: 'inherit' });
  } catch (e) { console.log('montage skipped:', String(e.message).slice(0, 120)); }
}

if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  process.exit(1);
}
console.log('PASS quest chain: 章節鏈有時間軸接線、圓章同一直線、獎勵靠左對齊標題、狀態貼齊標題右緣、鎖住的章節標鎖頭且保留說明與獎勵預覽、完成後可領取並在橫幅提示 at ' + DEVICES.map(d => d.label).join(', '));
