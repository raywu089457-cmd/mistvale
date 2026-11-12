// round3-ux-dispatch.mjs — 派遣狩獵真點擊:出發回饋、HUD 變化、回村戰報。 node round3-ux-dispatch.mjs <view>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'dispatch');
await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await S.goto(BASE + '?preview=1');
await S.ev(() => { globalThis.__mistvaleGame.state.paused = false; });
const L = (...a) => console.log(...a);
const toasts = () => S.ev(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ').trim()));
await S.tap('.hv-act[data-act=hunters]'); await W(500);
await S.tap('#modal [data-action=dispatchHunters]'); await W(500);
await S.shot('dispatch-open');
// 選 3 位、霜杉林地(較危險)
await S.tap('#modal [data-action=dispatchNone]'); await W(300);
const hs = await S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleDispatchHunter]')].map(e => e.dataset.id));
for (const id of hs.slice(0, 3)) await S.tap(`#modal [data-action=toggleDispatchHunter][data-id="${id}"]`);
await S.tap('#modal [data-action=dispatchRegion][data-id=taiga]'); await W(400);
L('start btn', await S.ev(() => { const b = document.querySelector('#modal [data-action=startDispatch]'); return b ? b.textContent.trim() + ' @' + Math.round(b.getBoundingClientRect().top) : null; }));
await S.shot('dispatch-taiga');
await S.tap('#modal [data-action=startDispatch]'); await W(600);
L('after start modal?', await S.ev(() => document.querySelector('#modal-backdrop').classList.contains('hidden') ? 'closed' : document.querySelector('#modal').dataset.type), '| toasts', JSON.stringify(await toasts()));
await S.shot('dispatch-started');
if (await S.ev(() => !document.querySelector('#modal-backdrop').classList.contains('hidden'))) await S.tap('#modal [data-action=close]');
await S.adv(60); await W(400);
L('hud', JSON.stringify(await S.ev(() => ({ acts: [...document.querySelectorAll('.hv-act')].map(a => a.innerText.replace(/\s+/g, ' ')), region: document.querySelector('#region-badge')?.innerText, feed: document.querySelector('#notice-feed')?.innerText.replace(/\s+/g, ' '), st: [...new Set(globalThis.__mistvaleGame.state.hunters.map(h => h.status))] }))));
await S.adv(300); await W(400); await S.shot('dispatch-later');
L('hud+300', JSON.stringify(await S.ev(() => ({ feed: document.querySelector('#notice-feed')?.innerText.replace(/\s+/g, ' '), st: globalThis.__mistvaleGame.state.hunters.map(h => h.name + ':' + h.status + ':' + h.hp + '/' + h.maxHp).join(' ') }))));
L('ERRS', JSON.stringify(S.errs));
await S.close();
