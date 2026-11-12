// round3-ux-fresh.mjs — 全新存檔:標題 → 歡迎 → 前 10 分鐘。node round3-ux-fresh.mjs <view>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'fresh');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await page.goto(BASE, { waitUntil: 'commit', timeout: 120000 });
await page.waitForSelector('#title-screen', { timeout: 90000 }); await W(1500);
await S.shot('title');
const title = await S.ev(() => ({ txt: document.querySelector('#title-screen').innerText.replace(/\s+/g, ' '), btns: [...document.querySelectorAll('#title-screen button')].map(b => ({ ts: b.dataset.ts, t: b.textContent.trim(), r: (r => [r.left, r.top, r.width, r.height].map(Math.round))(b.getBoundingClientRect()) })) }));
console.log('TITLE', JSON.stringify(title));
await S.tap('#title-screen [data-ts=continue]', 4000); await W(2500);
await S.shot('after-start');
const modal = await S.ev(() => { const m = document.querySelector('#modal'); const open = !document.querySelector('#modal-backdrop').classList.contains('hidden'); return { open, type: m?.dataset.type, txt: open ? m.innerText.replace(/\s+/g, ' ').slice(0, 600) : null }; });
console.log('MODAL', JSON.stringify(modal));
// 關掉歡迎
const btns = await S.ev(() => [...document.querySelectorAll('#modal button')].map(b => ({ a: b.dataset.action, t: b.textContent.trim(), r: (r => [r.left, r.top, r.width, r.height].map(Math.round))(b.getBoundingClientRect()) })));
console.log('MODALBTNS', JSON.stringify(btns));
const hud = async tag => { const t = await S.ev(() => ({ town: document.querySelector('#hv-town')?.textContent, res: ['gold', 'gems', 'wood', 'ore'].map(k => document.querySelector('#' + k)?.textContent), pop: document.querySelector('#population')?.textContent, quest: document.querySelector('#hv-quest')?.innerText.replace(/\s+/g, ' '), advisor: document.querySelector('#hv-advisor')?.innerText.replace(/\s+/g, ' '), feed: document.querySelector('#notice-feed')?.innerText.replace(/\s+/g, ' '), acts: [...document.querySelectorAll('.hv-act')].map(a => a.innerText.replace(/\s+/g, ' ')), badges: [...document.querySelectorAll('#bottom-bar button')].map(b => b.innerText.replace(/\s+/g, ' ') + (b.querySelector('.badge,.dot,i.pip') ? '*' : '')), day: document.querySelector('#day-clock')?.innerText.replace(/\s+/g, ' ') })); console.log('HUD', tag, JSON.stringify(t)); };
await hud('t0-welcome-open');
await S.tap('#modal [data-action=welcomeStart]'); if (!(await S.ev(() => document.querySelector('#modal-backdrop').classList.contains('hidden')))) await S.tap('#modal [data-action=close]');
await W(800);
await S.shot('hud-t0');
await hud('t0');
for (const sec of [60, 120, 180, 300]) {
  await S.ev(() => { globalThis.__mistvaleGame.state.paused = false; });
  await S.adv(sec); await W(300);
  await S.shot('hud-+' + sec + 's'); await hud('+' + sec);
}
console.log('ERRS', JSON.stringify(S.errs));
console.log('SHOTS', S.log.join(' '));
await S.close();
