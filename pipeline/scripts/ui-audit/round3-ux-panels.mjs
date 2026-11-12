// round3-ux-panels.mjs — 逐一打開每個面板(真點擊),截圖並倒出文字/按鈕。
// node round3-ux-panels.mjs <view> <fresh|mid>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone', mode = process.argv[3] || 'fresh';
const S = session(vn, 'panels-' + mode);
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
if (mode === 'fresh') {
  await page.goto(BASE, { waitUntil: 'commit' }); await page.waitForSelector('#title-screen', { timeout: 90000 }); await W(1200);
  await S.tap('#title-screen [data-ts=continue]', 4000); await W(2500);
  await S.tap('#modal [data-action=welcomeStart]'); await W(600);
  await S.ev(() => { globalThis.__mistvaleGame.state.paused = false; });
} else {
  await S.goto(BASE + '?preview=1');
  await S.ev(() => { const g = globalThis.__mistvaleGame; g.cheat('all'); g.state.paused = false; });
}
const dump = async () => S.ev(() => {
  const m = document.querySelector('#modal'); const open = !document.querySelector('#modal-backdrop').classList.contains('hidden');
  if (!open) return null;
  const sc = document.querySelector('#modal-content'); const mr = m.getBoundingClientRect();
  return { type: m.dataset.type, title: m.querySelector('#modal-title')?.textContent, rect: [mr.left, mr.top, mr.width, mr.height].map(Math.round), scrollH: sc.scrollHeight, clientH: sc.clientHeight, vh: innerHeight, txt: sc.innerText.replace(/\s+/g, ' ').slice(0, 900), btns: [...m.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0).slice(0, 40).map(b => b.dataset.action + ':' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 14) + '@' + Math.round(b.getBoundingClientRect().top)).join(' | ') };
});
const panels = [['build', '#bottom-bar [data-action=build]'], ['hunters', '#bottom-bar [data-action=hunters]'], ['trade', '#bottom-bar [data-action=trade]'], ['craft', '#bottom-bar [data-action=craft]'], ['dungeon', '#bottom-bar [data-action=dungeon]'], ['arena', '#bottom-bar [data-action=arena]'], ['quests', '#bottom-bar [data-action=quests]'],
  ['inventory', '.hv-tr2 [data-action=inventory]'], ['worldmap', '.hv-tr2 [data-action=worldmap]'], ['help', '.hv-tr2 [data-action=help]'], ['settings', '.hv-tr2 [data-action=settings]'], ['difficulty', '.hv-crest'], ['boss', '.hv-act.skill'], ['hunters-act', '.hv-act[data-act=hunters]']];
for (const [name, sel] of panels) {
  const r = await S.tap(sel, 2500); await W(500);
  const d = await dump();
  console.log('PANEL', name, r.ok ? '' : 'TAPFAIL ' + r.err, JSON.stringify(d));
  await S.shot(name);
  // 關閉方式
  if (d) { const closeVia = await S.ev(() => { const c = document.querySelector('#modal [data-action=close]'); const r = c?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; }); console.log('  closeBtn', JSON.stringify(closeVia)); await S.tap('#modal [data-action=close]'); await W(300); const still = await dump(); if (still) { console.log('  STILL OPEN after close', still.type); await S.ev(() => document.querySelector('#modal [data-action=close]')?.click()); } }
}
console.log('ERRS', JSON.stringify(S.errs));
await S.close();
