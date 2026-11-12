// quest-chain.mjs — T103→Z2B: 村長委託是清單列(標題＋進度膠囊 x/y＋獎勵;可領取=金棕「領取」、領過的壓暗、進行中/之後/已完成三段雙細線標籤)。
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
  const steps = [...c.querySelectorAll('.zq-row')].map(li => {
    const r = li.getBoundingClientRect(), btn = li.querySelector('button.zq-claim'), prog = li.querySelector('.zq-cap'), reward = li.querySelector('.zq-reward');
    return {
      cls: li.className, current: li.getAttribute('aria-current'), w: num(r.width), bg: getComputedStyle(li).backgroundColor,
      title: li.querySelector('h3')?.textContent.trim() || '', desc: li.querySelector('p')?.textContent.trim() || '',
      tagText: li.querySelector('.zq-tag')?.textContent.replace(/\s+/g, ' ').trim() || '', tagLock: !!li.querySelector('.zq-tag [data-icon=lock]'),
      reward: reward ? { label: reward.querySelector('small')?.textContent.trim() || '', chips: [...reward.querySelectorAll(':scope > span')].map(s => ({ text: s.textContent.replace(/\s+/g, ' ').trim(), icons: s.querySelectorAll('[data-icon]').length })) } : null,
      btn: btn ? { label: btn.textContent.trim(), disabled: btn.disabled, bg: getComputedStyle(btn).backgroundColor } : null,
      prog: prog ? { now: prog.getAttribute('aria-valuenow'), max: prog.getAttribute('aria-valuemax'), bar: prog.querySelector('b')?.textContent.trim(), pct: num(parseFloat(prog.querySelector('span')?.style.width) || 0), role: prog.getAttribute('role') } : null,
    };
  });
  const seps = [...c.querySelectorAll('.z2b-sep')].map(s => ({ t: s.textContent.trim(), lines: parseFloat(getComputedStyle(s, '::before').borderTopWidth) + parseFloat(getComputedStyle(s, '::before').borderBottomWidth) }));
  const banner = c.querySelector('.qs-banner')?.textContent.replace(/\s+/g, ' ').trim() || '';
  return { open: true, steps, seps, banner, scrollX: c.scrollWidth - c.clientWidth, contentW: c.clientWidth };
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

    // Z2B(圖鑑 38／規格 k):順序＝進行中、之後的章節、已完成(各夾雙細線標籤);每列 標題＋進度膠囊 x/y＋獎勵
    if (!m.seps.length || m.seps.some(s => s.lines < 2) || m.seps.map(s => s.t).join('|') !== '進行中|之後的章節|已完成') fix(`${tag}: 區段標籤應為「進行中｜之後的章節｜已完成」且夾雙細線 — ${JSON.stringify(m.seps)}`);
    const cur = m.steps.filter(s => s.cls.includes('current'));
    if (cur.length !== 1) fix(`${tag}: current 章節有 ${cur.length} 個`);
    const c0 = cur[0];
    if (!c0) { fix(`${tag}: 沒有目前章節`); continue; }
    if (m.steps[0] !== c0 && m.steps[0].cls !== c0.cls) fix(`${tag}: 進行中的章節應排在最上面`);
    if (c0.current !== 'step') fix(`${tag}: 目前章節沒有 aria-current="step"`);
    if (!c0.btn || !c0.btn.disabled || c0.btn.label !== '進行中') fix(`${tag}: 未完成時鈕應 disabled 並寫「進行中」 — ${JSON.stringify(c0.btn)}`);
    if (!c0.prog) fix(`${tag}: 目前章節沒有進度膠囊`);
    else {
      if (c0.prog.role !== 'progressbar') fix(`${tag}: 進度膠囊沒有 role=progressbar`);
      if (c0.prog.now !== '1' || c0.prog.max !== '3') fix(`${tag}: 進度 aria 值不是 1/3 — ${c0.prog.now}/${c0.prog.max}`);
      if (c0.prog.bar !== '1/3') fix(`${tag}: 進度膠囊文字不是 1/3 — ${c0.prog.bar}`);
      if (Math.abs(c0.prog.pct - 33.3) > 1.5) fix(`${tag}: 進度填色不是 1/3（${c0.prog.pct}%）`);
    }
    const done = m.steps.filter(s => s.cls.includes('done')), locked = m.steps.filter(s => s.cls.includes('locked'));
    if (done.length !== 2) fix(`${tag}: 已完成章節應 2 個,實際 ${done.length}`);
    for (const s of done) {
      if (s.bg !== 'rgb(54, 54, 54)') fix(`${tag}: 完成的列應壓暗成 #363636 — ${s.bg}`);
      if (!/已完成/.test(s.tagText) || s.btn) fix(`${tag}: 完成列應是灰色「已完成」且沒有領取鈕 — ${s.tagText}`);
      if (!s.prog || s.prog.bar !== s.prog.max + '/' + s.prog.max) fix(`${tag}: 完成列的進度膠囊應是滿的 — ${s.prog && s.prog.bar}`);
    }
    if (locked.length < 3) fix(`${tag}: 後面鎖住的章節只有 ${locked.length} 章`);
    for (const s of locked) {
      if (!s.tagLock || !/未解鎖/.test(s.tagText)) fix(`${tag}: 「${s.title}」應有鎖頭＋「未解鎖」 — ${s.tagText}`);
      if (s.btn) fix(`${tag}: 鎖住的「${s.title}」不該有領取鈕`);
      if (!s.desc) fix(`${tag}: 鎖住的「${s.title}」沒有說明可以預覽`);
      if (!s.prog || !/^0\//.test(s.prog.bar)) fix(`${tag}: 鎖住的「${s.title}」進度膠囊應從 0 起 — ${s.prog && s.prog.bar}`);
    }
    for (const s of m.steps) {
      if (!s.reward || !s.reward.chips.length) { fix(`${tag}: 「${s.title}」沒有獎勵`); continue; }
      if (!s.reward.label) fix(`${tag}: 「${s.title}」獎勵列沒有「獎勵」小標`);
      for (const ch of s.reward.chips) if (!ch.icons) fix(`${tag}: 「${s.title}」的獎勵「${ch.text}」沒有圖示`);
      if (s.w > m.contentW + 1) fix(`${tag}: 「${s.title}」超出面板寬度 ${s.w} > ${m.contentW}`);
    }

    // 進度達成後:可領取＝金棕「領取」、橫幅提示、已解鎖章數 +1
    await page.evaluate(() => { const s = globalThis.__mistvaleGame.state; s.quest.progress = 3; s.quest.complete = true; });
    await openQuests(page);
    m = await page.evaluate(READ);
    const c1 = m.steps.find(s => s.cls.includes('current'));
    if (!c1 || !c1.cls.includes('ready')) fix(`${tag}: 完成後目前列應標 ready`);
    if (!c1 || !c1.btn || c1.btn.disabled) fix(`${tag}: 完成後領取鈕應可按 — ${c1 && c1.btn && c1.btn.label}`);
    else if (c1.btn.label !== '領取' || c1.btn.bg !== 'rgb(144, 104, 24)') fix(`${tag}: 完成後應是金棕「領取」 — ${JSON.stringify(c1.btn)}`);
    if (!/本章獎勵可領取/.test(m.banner)) fix(`${tag}: 橫幅沒有提示本章獎勵可領取 — ${m.banner}`);
    if (!/已解鎖 4 章/.test(m.banner)) fix(`${tag}: 完成後已解鎖章數應為 4 — ${m.banner}`);
    if (c1 && c1.prog && Math.abs(c1.prog.pct - 100) > 1) fix(`${tag}: 完成後進度膠囊應滿格（${c1.prog.pct}%）`);

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
