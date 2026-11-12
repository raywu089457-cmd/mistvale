// round3-ux-pick.mjs — 地下城選人點擊逐一檢查(選了沒反應?)
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'pick');
await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await S.goto(BASE + '?preview=1');
await S.ev(() => { const g = globalThis.__mistvaleGame; g.cheat('all'); g.state.paused = false; });
await S.tap('#bottom-bar [data-action=dungeon]'); await W(600);
const sel = () => S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')].map(e => (e.className.includes('selected') ? 'S' : '-') + (e.className.includes('blocked') ? 'b' : '') + (e.className.includes('down') ? 'd' : '')).join(''));
const ids = await S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')].map(e => e.dataset.id));
console.log('init', await sel());
for (const id of ids.slice(0, 4)) {
  const r = await S.tap(`#modal [data-action=toggleDungeonHunter][data-id="${id}"]`);
  console.log('tap', id, r.ok, await sel(), JSON.stringify(await S.ev(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText))));
}
await S.close();
