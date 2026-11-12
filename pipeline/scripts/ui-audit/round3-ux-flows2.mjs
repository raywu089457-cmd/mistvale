// round3-ux-flows2.mjs — 中期存檔:地下城出征/撤退、競技場、世界地圖選區域、選取六角鈕、重置確認、首領確認。 node round3-ux-flows2.mjs <view>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'flows2');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await S.goto(BASE + '?preview=1');
await S.ev(() => { const g = globalThis.__mistvaleGame; g.cheat('all'); g.state.paused = false; for (let i = 0; i < 3; i++) { const v = g.state.visitors?.[0]; try { g.recruit(); } catch {} } });
const toasts = () => S.ev(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
const modalType = () => S.ev(() => !document.querySelector('#modal-backdrop').classList.contains('hidden') ? document.querySelector('#modal').dataset.type : null);
const mtxt = (n = 500) => S.ev(n => { const m = document.querySelector('#modal'); return m && !document.querySelector('#modal-backdrop').classList.contains('hidden') ? m.querySelector('#modal-content').innerText.replace(/\s+/g, ' ').slice(0, n) : null; }, n);
const btns = () => S.ev(() => [...document.querySelectorAll('#modal button')].filter(b => b.getBoundingClientRect().width).map(b => (b.dataset.action || '') + ':' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 14) + '@' + Math.round(b.getBoundingClientRect().top)).join(' | '));
const step = async (label, fn, shotName) => { const r = await fn(); await W(500); console.log('STEP', label, JSON.stringify(r ?? ''), '| toasts:', JSON.stringify(await toasts()), '| modal:', await modalType()); if (shotName) await S.shot(shotName); };
const openTab = async name => { await S.ev(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await S.tap(`#bottom-bar [data-action=${name}]`); await W(500); };
const closeM = async () => { if (await modalType()) { await S.tap('#modal [data-action=close]'); await W(300); } };
console.log('buildings', JSON.stringify(await S.ev(() => globalThis.__mistvaleGame.state.buildings)));
// 地下城(已蓋入口)
await openTab('dungeon');
const ids = await S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')].map(e => e.dataset.id));
console.log('dungeon hunters', ids.length);
for (const id of ids.slice(0, 3)) { for (let k = 0; k < 3; k++) { const on = await S.ev(id => document.querySelector(`#modal [data-action=toggleDungeonHunter][data-id="${id}"]`)?.className.includes('selected'), id); if (on) break; await S.tap(`#modal [data-action=toggleDungeonHunter][data-id="${id}"]`); await W(400); } }
await S.shot('dg-picked');
await S.ev(() => document.querySelector('#modal [data-action=startDungeon]')?.scrollIntoView({ block: 'center' })); await W(200);
await step('dungeon:start', () => S.tap('#modal [data-action=startDungeon]'), 'dg-started');
await S.adv(10); await W(500);
console.log('  after start modal', await modalType(), '| btns', await btns());
await S.shot('dg-running-panel');
await closeM(); await S.shot('dg-running-hud');
console.log('  HUD', JSON.stringify(await S.ev(() => ({ hud: document.querySelector('#hv-left')?.innerText.replace(/\s+/g, ' '), region: document.querySelector('#region-badge')?.innerText, acts: [...document.querySelectorAll('.hv-act')].map(a => a.innerText.replace(/\s+/g, ' ')), dg: document.querySelector('#dungeon-hud,.dungeon-hud,[id*=dungeon]')?.id }))));
await openTab('dungeon');
console.log('  running dungeon btns', await btns()); console.log('  running dungeon text', await mtxt(500));
await S.shot('dg-running-panel2');
const rt = await S.ev(() => { const b = document.querySelector('#modal [data-action=retreatDungeon]'); if (!b) return null; const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), top: Math.round(r.top), vh: innerHeight, cls: b.className }; }); console.log('  retreat btn', JSON.stringify(rt));
await S.ev(() => document.querySelector('#modal [data-action=retreatDungeon]')?.scrollIntoView({ block: 'center' }));
await step('dungeon:retreat tap', () => S.tap('#modal [data-action=retreatDungeon]'), 'dg-retreat');
console.log('  after retreat modal', await modalType(), await btns(), await mtxt(200));
await closeM();
await S.adv(10);
// 競技場
await openTab('arena');
const aids = await S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleArenaHunter]')].map(e => e.dataset.id));
for (const id of aids.slice(0, 3)) { for (let k = 0; k < 3; k++) { const on = await S.ev(id => document.querySelector(`#modal [data-action=toggleArenaHunter][data-id="${id}"]`)?.className.includes('selected'), id); if (on) break; await S.tap(`#modal [data-action=toggleArenaHunter][data-id="${id}"]`); await W(400); } }
await S.ev(() => document.querySelector('#modal [data-action=startArena]')?.scrollIntoView({ block: 'center' })); await W(200);
await step('arena:start', () => S.tap('#modal [data-action=startArena]'), 'arena-started');
await S.adv(40); await W(500);
console.log('  arena after', await modalType(), await mtxt(500), JSON.stringify(await toasts()));
await S.shot('arena-result');
await closeM();
// 地圖選取:點建築 → 六角鈕
await S.ev(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove()));
const pos = await S.ev(() => { const v = globalThis.__mistvaleView; return typeof v.screenOf === 'function' ? 'screenOf' : Object.keys(v).join(','); });
console.log('view api', pos);
console.log('ERRS', JSON.stringify(S.errs));
console.log('SHOTS', S.log.join(' '));
await S.close();
