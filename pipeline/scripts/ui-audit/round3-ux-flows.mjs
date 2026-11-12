// round3-ux-flows.mjs — 核心流程逐步真點擊(回饋/資源不足/確認/關閉)。node round3-ux-flows.mjs <view>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'flows');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await S.goto(BASE + '?preview=1');
await S.ev(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; });
const toasts = () => S.ev(() => [...document.querySelectorAll('#toasts > *')].map(t => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
const modalOpen = () => S.ev(() => !document.querySelector('#modal-backdrop').classList.contains('hidden') ? document.querySelector('#modal').dataset.type : null);
const mtxt = (n = 500) => S.ev(n => { const m = document.querySelector('#modal'); return m && !document.querySelector('#modal-backdrop').classList.contains('hidden') ? m.querySelector('#modal-content').innerText.replace(/\s+/g, ' ').slice(0, n) : null; }, n);
const setRes = o => S.ev(o => { const g = globalThis.__mistvaleGame; Object.assign(g.state, o); }, o);
const step = async (label, fn, shotName) => { const r = await fn(); await W(400); const t = await toasts(); console.log('STEP', label, '→', JSON.stringify(r ?? ''), '| toasts:', JSON.stringify(t), '| modal:', await modalOpen()); if (shotName) await S.shot(shotName); };
const openTab = async name => { await S.ev(() => document.querySelectorAll('#toasts > *').forEach(t => t.remove())); await S.tap(`#bottom-bar [data-action=${name}]`); await W(500); };
const closeM = async () => { await S.tap('#modal [data-action=close]'); await W(300); };

// ── A 建造:資源不足
await setRes({ gold: 100, wood: 5, ore: 0 });
await openTab('build');
await step('build:academy(資源不足)', () => S.tap('#modal [data-action=construct][data-id=academy]'), 'build-short');
console.log('  card state', await S.ev(() => { const c = document.querySelector('#modal .building-card[data-id=academy]'); return c ? c.innerText.replace(/\s+/g, ' ') + ' | btnDisabled=' + c.querySelector('[data-action=construct]')?.disabled + ' cls=' + c.querySelector('[data-action=construct]')?.className : null; }));
console.log('  upgrade card', await S.ev(() => { const c = document.querySelector('#modal .building-card[data-id=hall]'); return c ? c.innerText.replace(/\s+/g, ' ') + ' | cls=' + c.querySelector('[data-action=upgrade]')?.className : null; }));
await S.ev(() => document.querySelector('#modal-content').scrollTo(0, 0));
// 資源足夠後建造
await setRes({ gold: 5000, wood: 500, ore: 500 });
await step('build:academy(足夠)', () => S.tap('#modal [data-action=construct][data-id=academy]'), 'build-ok');
await step('upgrade:trading', () => S.tap('#modal [data-action=upgrade][data-id=trading]'), 'upgrade-ok');
console.log('  after-upgrade card', await S.ev(() => document.querySelector('#modal .building-card[data-id=trading]')?.innerText.replace(/\s+/g, ' ')));
await closeM();
// ── B 獵人 → 招募
await openTab('hunters');
await step('hunters:recruit', () => S.tap('#modal [data-action=recruit]'), 'recruit');
console.log('  recruit text', await mtxt(600));
// 若出現訪客清單,點第一個
const vis = await S.ev(() => [...document.querySelectorAll('#modal [data-action]')].map(b => b.dataset.action + ':' + b.textContent.trim().slice(0, 10)).slice(0, 15));
console.log('  recruit btns', JSON.stringify(vis));
await closeM();
// ── C 獵人詳情 + 解僱
await openTab('hunters');
await step('hunters:info', () => S.tap('#modal [data-action=hunter]'), 'hunter-info');
console.log('  info text', await mtxt(900));
console.log('  info btns', JSON.stringify(await S.ev(() => [...document.querySelectorAll('#modal button')].filter(b => b.getBoundingClientRect().width).map(b => (b.dataset.action || '') + ':' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 12) + '@' + Math.round(b.getBoundingClientRect().top)))));
await closeM();
// ── D 派遣
await openTab('hunters');
await step('hunters:dispatch', () => S.tap('#modal [data-action=dispatchHunters]'), 'dispatch');
console.log('  dispatch text', await mtxt(900));
console.log('  dispatch btns', JSON.stringify(await S.ev(() => [...document.querySelectorAll('#modal button')].filter(b => b.getBoundingClientRect().width).map(b => (b.dataset.action || '') + ':' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 12) + '@' + Math.round(b.getBoundingClientRect().top)).slice(0, 30))));
await S.ev(() => document.querySelector('#modal-content').scrollTo(0, 9999)); await W(200); await S.shot('dispatch-bottom');
await closeM();
// ── E 交易
await openTab('trade');
await step('trade:+10', () => S.tap('#modal [data-action=tradeStep] >> nth=3'), 'trade-step');
console.log('  trade head', await mtxt(160));
await closeM();
// ── F 製作:資源不足與足夠
await setRes({ flour: 3 });
await openTab('craft');
await step('craft:bread(麵粉3)', () => S.tap('#modal [data-action=craftProduct] >> nth=1'), 'craft-short');
console.log('  craft card', await mtxt(380));
await setRes({ flour: 100 });
await step('craft:bread(麵粉100)', () => S.tap('#modal [data-action=craftProduct] >> nth=1'), 'craft-ok');
await closeM();
// ── G 地下城 選人 → 出發
await openTab('dungeon');
const ids = await S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleDungeonHunter]')].map(e => e.dataset.id));
for (const id of ids.slice(0, 3)) await S.tap(`#modal [data-action=toggleDungeonHunter][data-id="${id}"]`);
await S.shot('dungeon-picked');
console.log('  start btn', await S.ev(() => { const b = document.querySelector('#modal [data-action=startDungeon]'); const r = b?.getBoundingClientRect(); return b ? { t: b.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, disabled: b.disabled } : null; }));
await S.ev(() => document.querySelector('#modal [data-action=startDungeon]')?.scrollIntoView({ block: 'center' })); await W(200);
await step('dungeon:start', () => S.tap('#modal [data-action=startDungeon]'), 'dungeon-start');
await W(1500); await S.adv(8); await W(300); await S.shot('dungeon-running');
console.log('  dungeon open?', await modalOpen(), await mtxt(500));
await S.ev(() => { if (!document.querySelector('#modal-backdrop').classList.contains('hidden')) document.querySelector('#modal [data-action=close]')?.click(); }); await W(300);
await S.shot('dungeon-hud');
console.log('  HUD during dungeon', await S.ev(() => ({ hud: document.querySelector('#hv-left')?.innerText.replace(/\s+/g, ' '), region: document.querySelector('#region-badge')?.innerText, acts: [...document.querySelectorAll('.hv-act')].map(a => a.innerText.replace(/\s+/g, ' ')) })));
// 地下城中再開面板 → 撤退
await openTab('dungeon'); await S.shot('dungeon-panel-running');
console.log('  dungeon panel running', await mtxt(700), JSON.stringify(await S.ev(() => [...document.querySelectorAll('#modal button')].filter(b => b.getBoundingClientRect().width).map(b => (b.dataset.action || '') + ':' + b.textContent.trim().replace(/\s+/g, ' ').slice(0, 12) + '@' + Math.round(b.getBoundingClientRect().top)))));
await step('dungeon:retreat', () => S.tap('#modal [data-action=retreatDungeon]'), 'dungeon-retreat');
console.log('  after retreat modal', await modalOpen(), await mtxt(300));
const conf = await S.ev(() => [...document.querySelectorAll('#modal button')].map(b => (b.dataset.action || '') + ':' + b.textContent.trim().slice(0, 10)));
console.log('  retreat btns', JSON.stringify(conf));
await closeM();
// ── H 競技場
await S.ev(() => { const g = globalThis.__mistvaleGame; g.retreatDungeon?.(); });
await openTab('arena');
const aids = await S.ev(() => [...document.querySelectorAll('#modal [data-action=toggleArenaHunter]')].map(e => e.dataset.id));
for (const id of aids.slice(0, 3)) await S.tap(`#modal [data-action=toggleArenaHunter][data-id="${id}"]`);
await S.ev(() => document.querySelector('#modal [data-action=startArena]')?.scrollIntoView({ block: 'center' })); await W(200);
await step('arena:start', () => S.tap('#modal [data-action=startArena]'), 'arena-start');
await W(1000); await S.adv(25); await W(400); await S.shot('arena-after');
console.log('  arena after', await modalOpen(), await mtxt(500), JSON.stringify(await toasts()));
await S.ev(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await W(300);
// ── I 委託領獎
await openTab('quests');
await step('quest:claim', () => S.tap('#modal [data-action=quest]'), 'quest-claim');
console.log('  quest after', await mtxt(400));
await closeM();
// ── J 首領
await openTab('quests'); await closeM();
await S.tap('.hv-act.skill'); await W(500);
await step('boss:summon', () => S.tap('#modal [data-action=startBoss]'), 'boss-start');
console.log('  boss after', await modalOpen(), await mtxt(300));
await S.shot('boss-hud');
// ── K 設定 重置
await S.ev(() => document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click()); await W(300);
await S.tap('.hv-tr2 [data-action=settings]'); await W(400);
await S.ev(() => document.querySelector('#modal [data-action=resetGame],#modal [data-action=reset]')?.scrollIntoView({ block: 'center' })); await W(300);
console.log('  reset btn', await S.ev(() => [...document.querySelectorAll('#modal [data-action]')].filter(b => /reset|restart|clear|import|export/i.test(b.dataset.action)).map(b => b.dataset.action + ':' + b.textContent.trim())));
await S.shot('settings-bottom');
console.log('ERRS', JSON.stringify(S.errs));
console.log('SHOTS', S.log.join(' '));
await S.close();
