// round3-ux-flows3.mjs — 撤退確認、競技場結果、重置確認、選取六角鈕、世界地圖選區域、離線戰報、字級量測。 node round3-ux-flows3.mjs <view>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'flows3');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await S.goto(BASE + '?preview=1');
await S.ev(() => { const g = globalThis.__mistvaleGame; g.cheat('all'); g.state.paused = false; });
const toasts = () => S.ev(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
const modalType = () => S.ev(() => !document.querySelector('#modal-backdrop').classList.contains('hidden') ? document.querySelector('#modal').dataset.type : null);
const mtxt = (n = 500) => S.ev(n => { const m = document.querySelector('#modal'); return m && !document.querySelector('#modal-backdrop').classList.contains('hidden') ? m.querySelector('#modal-content').innerText.replace(/\s+/g, ' ').slice(0, n) : null; }, n);
const btns = () => S.ev(() => [...document.querySelectorAll('#modal button')].filter(b => b.getBoundingClientRect().width).map(b => (b.dataset.action || '') + ':' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 14)).join(' | '));
const openTab = async name => { await S.ev(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await S.tap(`#bottom-bar [data-action=${name}]`); await W(500); };
const closeM = async () => { if (await modalType()) { await S.tap('#modal [data-action=close]'); await W(300); } };
const L = (...a) => console.log(...a);
// 1 地下城撤退
const ids = await S.ev(() => globalThis.__mistvaleGame.state.hunters.slice(0, 3).map(h => h.id));
await S.ev(ids => globalThis.__mistvaleGame.startDungeon(ids), ids); await S.adv(6);
await openTab('dungeon');
await S.tap('#modal [data-action=dgRetreat]'); await W(500);
L('retreat tap → modal', await modalType(), '| toasts', JSON.stringify(await toasts()), '| dg active', await S.ev(() => globalThis.__mistvaleGame.state.dungeon.active), '| btns', await btns());
await S.shot('retreat-after');
await S.ev(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await closeM();
// dgRetreat 尺寸
// 2 競技場結果
const aids = await S.ev(() => globalThis.__mistvaleGame.state.hunters.slice(3, 6).map(h => h.id));
await S.ev(aids => globalThis.__mistvaleGame.startArena(aids), aids);
let t0 = 0; for (; t0 < 300; t0 += 5) { await S.adv(5); const a = await S.ev(() => JSON.stringify(globalThis.__mistvaleGame.state.arena).slice(0, 220)); if (t0 % 60 === 0) L('arena t', t0, a); const done = await S.ev(() => !globalThis.__mistvaleGame.state.arena.active); if (done && t0 > 5) break; }
L('arena finished at', t0, 'toasts', JSON.stringify(await toasts()), 'modal', await modalType(), '| notices', await S.ev(() => document.querySelector('#notice-feed')?.innerText.replace(/\s+/g, ' ')));
await S.shot('arena-finished');
await openTab('arena'); L('arena panel', await mtxt(250)); await S.shot('arena-panel-after'); await closeM();
// 3 設定 → 重置確認(不確認)
await S.tap('.hv-tr2 [data-action=settings]'); await W(500);
await S.ev(() => document.querySelector('#modal [data-action=reset]')?.scrollIntoView({ block: 'center' })); await W(300);
await S.tap('#modal [data-action=reset]'); await W(500);
L('reset tap → modal', await modalType(), '|', await mtxt(200), '| btns', await btns());
await S.shot('reset-confirm');
await S.ev(() => document.querySelector('#modal [data-action=close]')?.click()); await W(300); await closeM();
// 4 首領(召喚前)與 後
await S.tap('.hv-act.skill'); await W(500); await S.shot('boss-panel');
L('boss panel', await mtxt(300));
await closeM();
// 5 世界地圖:前往區域/詳情
await S.tap('.hv-tr2 [data-action=worldmap]'); await W(600);
await S.ev(() => document.querySelector('#modal [data-action=regionDetail][data-id=forest],#modal [data-action=regionDetail]:not([data-id=village])')?.scrollIntoView({ block: 'center' })); await W(300);
await S.shot('worldmap-scrolled');
const rd = await S.ev(() => [...document.querySelectorAll('#modal [data-action=regionDetail]')].map(b => b.dataset.id)); L('region ids', rd.join(','));
await S.tap('#modal [data-action=regionDetail][data-id=forest]'); await W(600);
L('region detail', await mtxt(500), '| btns', await btns());
await S.shot('region-detail');
await closeM();
// 6 選取建築 → 六角鈕
const p = await S.ev(() => { const v = globalThis.__mistvaleView; const r = v.hitRects?.(); return r ? JSON.stringify(Array.isArray(r) ? r.slice(0, 3) : Object.keys(r)).slice(0, 300) : null; });
L('hitRects', p);
// 7 字級量測:可見文字元素的最小 computed font-size(主畫面 + 目前沒有面板)
const fs = await S.ev(() => { const out = {}; for (const e of document.querySelectorAll('body *')) { if (!e.childNodes.length) continue; const own = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(''); if (!own) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue; const k = Math.round(parseFloat(cs.fontSize)); (out[k] = out[k] || []).push((e.id || e.className.toString().split(' ')[0] || e.tagName) + ':' + own.slice(0, 10)); } return Object.fromEntries(Object.entries(out).sort((a, b) => a[0] - b[0]).slice(0, 5).map(([k, v]) => [k, v.length + ' e.g. ' + v.slice(0, 5).join(' / ')])); });
L('HUD font sizes (smallest first)', JSON.stringify(fs));
// 面板中字級
await openTab('build');
const fs2 = await S.ev(() => { const out = {}; for (const e of document.querySelectorAll('#modal *')) { const own = [...e.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(''); if (!own) continue; const r = e.getBoundingClientRect(); if (r.width < 1) continue; const k = Math.round(parseFloat(getComputedStyle(e).fontSize)); (out[k] = out[k] || []).push(own.slice(0, 8)); } return Object.fromEntries(Object.entries(out).sort((a, b) => a[0] - b[0]).slice(0, 5).map(([k, v]) => [k, v.length + ' e.g. ' + v.slice(0, 5).join(' / ')])); });
L('build panel font sizes', JSON.stringify(fs2));
await closeM();
L('ERRS', JSON.stringify(S.errs)); L('SHOTS', S.log.join(' '));
await S.close();
