// round3-ux-misc.mjs — 橫向(844x390)關鍵畫面、選取建築六角鈕/建築資訊、離線戰報。 node round3-ux-misc.mjs <land|phone>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'land';
const S = session(vn, 'misc');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
const L = (...a) => console.log(...a);
await S.goto(BASE + '?preview=1');
await S.ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; });
await S.shot('hud');
const modalType = () => S.ev(() => !document.querySelector('#modal-backdrop').classList.contains('hidden') ? document.querySelector('#modal').dataset.type : null);
for (const [n, sel] of [['build', '#bottom-bar [data-action=build]'], ['dungeon', '#bottom-bar [data-action=dungeon]'], ['hunters', '#bottom-bar [data-action=hunters]'], ['quests', '#bottom-bar [data-action=quests]']]) {
  await S.tap(sel); await W(500); await S.shot(n);
  L(n, JSON.stringify(await S.ev(() => { const m = document.querySelector('#modal').getBoundingClientRect(); const c = document.querySelector('#modal-content'); const b = [...document.querySelectorAll('#modal [data-action=startDungeon],#modal [data-action=startDispatch]')][0]; const bb = b?.getBoundingClientRect(); return { modal: [m.left, m.top, m.width, m.height].map(Math.round), scroll: [c.scrollHeight, c.clientHeight], cta: bb ? [Math.round(bb.top), Math.round(bb.bottom)] : null, vh: innerHeight }; })));
  await S.tap('#modal [data-action=close]'); await W(300);
}
// 點建築
const b = await S.ev(() => { const v = globalThis.__mistvaleView; const r = v.hitRects().find(h => h.id === 'tavern'); return r || null; });
L('tavern rect', JSON.stringify(b));
if (b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (S.MOBILE) await page.touchscreen.tap(cx, cy); else await page.mouse.click(cx, cy);
  await W(600); await S.shot('select-building');
  L('hv-sel', JSON.stringify(await S.ev(() => { const s = document.querySelector('#hv-sel'); const r = s.getBoundingClientRect(); return { hidden: s.hidden, rect: [r.left, r.top, r.width, r.height].map(Math.round), btns: [...s.querySelectorAll('button')].map(x => { const q = x.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }), inspector: !document.querySelector('#inspector').classList.contains('hidden') }; })));
  await S.tap('#hv-sel [data-action=selInfo]'); await W(500); await S.shot('inspector');
  L('inspector', JSON.stringify(await S.ev(() => { const i = document.querySelector('#inspector'); const r = i.getBoundingClientRect(); return { hidden: i.classList.contains('hidden'), rect: [r.left, r.top, r.width, r.height].map(Math.round), txt: i.innerText.replace(/\s+/g, ' ').slice(0, 400), modal: document.querySelector('#modal-backdrop').classList.contains('hidden') ? null : document.querySelector('#modal').dataset.type }; })));
}
L('ERRS', JSON.stringify(S.errs)); L('SHOTS', S.log.join(' '));
await S.close();
