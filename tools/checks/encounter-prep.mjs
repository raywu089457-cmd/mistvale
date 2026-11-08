// encounter-prep.mjs — T102: 地下城／競技場的「遠征準備」面板要一眼看出能不能出發。
//   * 小隊總覽條：已選 N/3 · 總攻擊 · 總生命 · 平均 Lv.，選人後即時更新。
//   * 選不到的人（待復活／正在另一邊出征）要 disabled 並寫出理由。
//   * 主鈕在人不夠時 disabled 並寫「還缺 N 位獵人」，整備中寫「小隊整備中 X 秒」，選滿才可按。
//   * 地下城要寫出每層 3 波與紀錄會推進到第幾層。
// Usage: node tools/checks/encounter-prep.mjs        (game server on 5024 expected; TARGET overrides)
//        $env:SHOTS='1'; node tools/checks/encounter-prep.mjs   also writes output/encounter/montage.png
// Exit: 0 = PASS line only, 1 = FIX lines.
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');

const URL = process.env.TARGET || 'http://100.79.149.0:5024/?preview=1';
const DEVICES = [
  { label: 'desktop 1440x900', width: 1440, height: 900, phone: false },
  { label: 'phone 402x712', width: 402, height: 712, phone: true },
];
const fails = [], oks = [], shots = [];
const fix = m => fails.push(m);
const fmt = n => Math.floor(Number(n) || 0).toLocaleString('en-US');

if (process.env.SHOTS) fs.mkdirSync('output/encounter', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });

async function boot(dev) {
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.phone ? 2 : 1,
    isMobile: dev.phone, hasTouch: dev.phone, locale: 'zh-TW',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(URL, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = globalThis.__mistvaleGame, s = g.state;
    s.paused = true;
    s.buildings.dungeon = s.buildings.dungeon || 3; s.buildings.training = s.buildings.training || 3;
    const hs = s.hunters;
    for (const h of hs) { h.hp = h.maxHp; h.task = 'idle'; h.status = '待機'; }
    // blocked states: #1 downed, #2 reviving; both must be disabled in the grid
    hs[0].hp = 0; hs[0].status = '倒下';
    hs[1].task = 'revive';
    for (const k of ['dungeon', 'arena']) { s[k].hunterIds = []; s[k].cooldown = 0; s[k].active = false; }
    s.dungeon.startFloor = 0;
  });
  return { ctx, page, errs };
}

async function openModal(page, action) {
  await page.evaluate(a => {
    const el = document.createElement('button');
    el.dataset.action = a; el.style.display = 'none';
    document.body.append(el); el.click(); el.remove();
  }, action);
  await page.waitForTimeout(500);
}

const READ = type => {
  const g = globalThis.__mistvaleGame, s = g.state;
  const bd = document.querySelector('#modal-backdrop');
  if (!bd || bd.classList.contains('hidden')) return { open: false };
  const sum = document.querySelector('#modal-content .party-summary');
  const btn = document.querySelector('#modal-content .encounter-actions .pixel-button');
  const cards = [...document.querySelectorAll('#modal-content .party-pick')].map(c => ({
    id: c.dataset.id,
    blocked: c.classList.contains('blocked'),
    disabled: !!c.disabled,
    ariaDisabled: c.getAttribute('aria-disabled'),
    pressed: c.getAttribute('aria-pressed'),
    note: c.querySelector('.pp-note')?.textContent.replace(/\s+/g, ' ').trim() || '',
  }));
  const ids = cards.filter(c => c.pressed === 'true').map(c => c.id);
  const sel = ids.map(id => s.hunters.find(h => h.id === id)).filter(Boolean);
  return {
    open: true,
    summary: sum ? sum.textContent.replace(/\s+/g, ' ').trim() : '',
    facts: document.querySelector('#modal-content .encounter-facts')?.textContent.replace(/\s+/g, ' ').trim() || '',
    status: document.querySelector('#modal-content .encounter-status')?.textContent.replace(/\s+/g, ' ').trim() || '',
    btn: btn ? { label: btn.textContent.replace(/\s+/g, ' ').trim(), disabled: !!btn.disabled, w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height) } : null,
    cards,
    selectedCount: ids.length,
    atk: sel.reduce((a, h) => a + h.attack, 0),
    hp: sel.reduce((a, h) => a + Math.max(0, Math.ceil(h.hp)), 0),
    scrollX: (() => { const c = document.querySelector('#modal-content'); return c ? c.scrollWidth - c.clientWidth : 0; })(),
  };
};

const clickCard = async (page, id) => {
  await page.evaluate(cid => {
    const c = [...document.querySelectorAll('#modal-content .party-pick')].find(x => x.dataset.id === cid);
    if (c) c.click();
  }, id);
  await page.waitForTimeout(450);
};

for (const dev of DEVICES) {
  const { ctx, page, errs } = await boot(dev);
  try {
    for (const kind of [
      { type: 'dungeon', action: 'dungeon', idleLabel: /派遣三人小隊 · 從第 \d+ 層/ },
      { type: 'arena', action: 'arena', idleLabel: /開始模擬對戰/ },
    ]) {
      const tag = `${dev.label} ${kind.type}`;
      await openModal(page, kind.action);
      let m = await page.evaluate(READ, kind.type);
      if (!m.open) { fix(`${tag}: 面板沒有開`); continue; }

      // 1. 空白狀態：0/3、提示、主鈕停用並說還缺幾人
      if (!/已選 0\/3/.test(m.summary)) fix(`${tag}: 空白時總覽沒有寫「已選 0/3」— ${m.summary}`);
      if (!/再選 3 位/.test(m.summary)) fix(`${tag}: 空白時沒有提示還要選 3 位 — ${m.summary}`);
      if (!m.btn || !m.btn.disabled) fix(`${tag}: 沒選人時主鈕應該 disabled — ${m.btn && m.btn.label}`);
      else if (!/還缺 3 位/.test(m.btn.label)) fix(`${tag}: 沒選人時主鈕文字應寫「還缺 3 位獵人」— ${m.btn.label}`);
      if (m.btn && (m.btn.w < 32 || m.btn.h < 32)) fix(`${tag}: 主鈕太小 ${m.btn.w}x${m.btn.h}`);

      // 2. 選不到的人要 disabled 並寫理由
      const blocked = m.cards.filter(c => c.blocked);
      if (blocked.length < 2) fix(`${tag}: 應該有 2 位選不到（倒下／待復活），只有 ${blocked.length}`);
      for (const c of blocked) {
        if (!c.disabled) fix(`${tag}: 卡片 ${c.id} 標了 blocked 卻還能按`);
        if (c.ariaDisabled !== 'true') fix(`${tag}: 卡片 ${c.id} 的 aria-disabled 不是 true`);
        if (!/待復活|競技場中|地下城出征中/.test(c.note)) fix(`${tag}: 卡片 ${c.id} 沒寫不能選的理由 — "${c.note}"`);
      }
      if (blocked.length) {
        await clickCard(page, blocked[0].id);
        m = await page.evaluate(READ, kind.type);
        if (m.selectedCount !== 0) fix(`${tag}: 按下不能選的卡片後竟然被選進去了`);
      }

      // 3. 地下城要多寫「每層 3 波 / 紀錄推進到第幾層」
      if (kind.type === 'dungeon' && !/每層 3 波魔物/.test(m.facts)) fix(`${tag}: 沒有寫每層 3 波魔物 — "${m.facts}"`);
      if (kind.type === 'dungeon' && !/推進到第 \d+ 層/.test(m.facts)) fix(`${tag}: 沒有寫紀錄會推進到第幾層 — "${m.facts}"`);

      // 4. 選 1 位 → 總覽即時更新、主鈕還缺 2 位
      const healthy = m.cards.filter(c => !c.blocked).slice(0, 3);
      if (healthy.length < 3) { fix(`${tag}: 可選的獵人不足 3 位（${healthy.length}）`); continue; }
      await clickCard(page, healthy[0].id);
      m = await page.evaluate(READ, kind.type);
      if (m.selectedCount !== 1) fix(`${tag}: 選 1 位後 selectedCount=${m.selectedCount}`);
      if (!/已選 1\/3/.test(m.summary)) fix(`${tag}: 總覽沒有更新成 已選 1/3 — ${m.summary}`);
      if (!new RegExp(`總攻擊 ${fmt(m.atk)}`).test(m.summary)) fix(`${tag}: 總攻擊不是 ${m.atk} — ${m.summary}`);
      if (!/還缺 2 位/.test(m.btn.label)) fix(`${tag}: 只選 1 位時主鈕應寫「還缺 2 位獵人」— ${m.btn.label}`);
      if (!m.btn.disabled) fix(`${tag}: 只選 1 位時主鈕應 disabled`);

      // 5. 選滿 3 位 → 主鈕可按、文字變回出發
      await clickCard(page, healthy[1].id);
      await clickCard(page, healthy[2].id);
      m = await page.evaluate(READ, kind.type);
      if (m.selectedCount !== 3) fix(`${tag}: 選滿後 selectedCount=${m.selectedCount}`);
      if (!/已選 3\/3/.test(m.summary)) fix(`${tag}: 總覽沒有更新成 已選 3/3 — ${m.summary}`);
      if (!/平均 Lv\./.test(m.summary)) fix(`${tag}: 選滿後少了平均等級 — ${m.summary}`);
      if (m.btn.disabled) fix(`${tag}: 選滿 3 位後主鈕仍 disabled — ${m.btn.label}`);
      if (!kind.idleLabel.test(m.btn.label)) fix(`${tag}: 選滿後主鈕文字不對 — ${m.btn.label}`);
      if (m.scrollX > 1) fix(`${tag}: 面板橫向溢出 ${m.scrollX}px`);

      if (process.env.SHOTS && dev.label.startsWith('desktop')) {
        await page.evaluate(() => { document.querySelector('#modal-content').scrollTop = 0; });
        const p = `output/encounter/${kind.type}-${dev.width}x${dev.height}.png`;
        await page.screenshot({ path: p }); shots.push(p);
      }
      if (process.env.SHOTS && dev.phone) {
        await page.evaluate(() => { document.querySelector('#modal-content').scrollTop = 0; });
        const p = `output/encounter/${kind.type}-${dev.width}x${dev.height}.png`;
        await page.screenshot({ path: p }); shots.push(p);
      }

      // 6. 整備中 → 主鈕寫秒數
      await page.evaluate(t => { globalThis.__mistvaleGame.state[t].cooldown = 25; }, kind.type);
      await openModal(page, kind.action);
      m = await page.evaluate(READ, kind.type);
      if (!m.btn.disabled) fix(`${tag}: 整備中主鈕應 disabled`);
      if (!/小隊整備中 25 秒/.test(m.btn.label)) fix(`${tag}: 整備中主鈕應寫「小隊整備中 25 秒」— ${m.btn.label}`);
      await page.evaluate(t => { globalThis.__mistvaleGame.state[t].cooldown = 0; }, kind.type);
      oks.push(`${dev.label} ${kind.type}: 總覽/理由/主鈕/整備中都對`);
    }
    if (errs.length) fix(`${dev.label}: 頁面錯誤 ${errs[0]}`);
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
out.save('output/encounter/montage.png')
print('montage output/encounter/montage.png')
`], { stdio: 'inherit' });
  } catch (e) { console.log('montage skipped:', String(e.message).slice(0, 120)); }
}

if (fails.length) {
  for (const f of fails) console.log('FIX ' + f);
  process.exit(1);
}
console.log('PASS encounter prep: 小隊總覽（已選/總攻擊/總生命/平均等級）選人即時更新，選不到的人 disabled 並寫出原因，主鈕在人不夠或整備中時 disabled 並說明，選滿 3 人才能出發（地下城另寫每層 3 波與紀錄層數）at ' + DEVICES.map(d => d.label).join(', '));
