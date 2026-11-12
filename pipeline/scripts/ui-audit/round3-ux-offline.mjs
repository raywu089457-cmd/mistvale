// round3-ux-offline.mjs — 回訪玩家:標題(繼續)與離線戰報。 node round3-ux-offline.mjs <phone|desktop>
import { session, BASE, W } from './round3-ux-lib.mjs';
const vn = process.argv[2] || 'phone';
const S = session(vn, 'offline');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); if (localStorage.getItem('__ofl')) { localStorage.removeItem('__ofl'); const raw = JSON.parse(localStorage.getItem('mistvale-pixel-v2')); raw.savedAt = Date.now() - 3 * 3600 * 1000; raw.paused = false; localStorage.setItem('mistvale-pixel-v2', JSON.stringify(raw)); } } catch {} });
const SS = (f, a) => globalThis.__np ? globalThis.__np.evaluate(f, a) : S.ev(f, a); const TT = async (sel, t = 2500) => { const loc = (globalThis.__np || page).locator(sel).first(); try { S.MOBILE ? await loc.tap({ timeout: t }) : await loc.click({ timeout: t }); await W(350); } catch (e) { console.log('tapfail', sel); } }; const SH = async n => { await (globalThis.__np || page).screenshot({ path: S.dir + '/' + n + '.png' }); }; const L = (...a) => console.log(...a);
await page.goto(BASE, { waitUntil: 'commit' }); await page.waitForSelector('#title-screen', { timeout: 90000 }); await W(1000);
await TT('#title-screen [data-ts=continue]', 4000); await W(2500);
await TT('#modal [data-action=welcomeStart]'); await W(800);
await SS(() => { const g = globalThis.__mistvaleGame; g.state.paused = false; g.cheat('resources'); });
// 建一些東西讓戰報有內容
await S.adv(120); await W(500);
await page.waitForTimeout(6000); // 讓自動存檔寫入
await SS(() => localStorage.setItem('__ofl', '1'));
{ const np = await page.context().newPage(); np.on('pageerror', e => S.errs.push(String(e))); await page.close(); S.page = np; globalThis.__np = np; } const page2 = globalThis.__np; await page2.goto(BASE, { waitUntil: 'commit' }); await page2.waitForFunction(() => globalThis.__mistvaleGame, null, { timeout: 90000 }); await W(4000); L('has title', await SS(() => !!document.querySelector('#title-screen')), 'save', await SS(() => !!localStorage.getItem('mistvale-pixel-v2')), 'modal', await SS(() => document.querySelector('#modal-backdrop').className));
await (globalThis.__np).waitForSelector('#title-screen', { timeout: 15000 }).catch(() => {}); await W(1200); await SH('title-return'); L('url', (globalThis.__np).url(), 'savedAt age h', await SS(() => { const r = JSON.parse(localStorage.getItem('mistvale-pixel-v2')); return (Date.now() - r.savedAt) / 3600000; }));
if (await SS(() => !!document.querySelector('#title-screen'))) L('title return', await SS(() => document.querySelector('#title-screen').innerText.replace(/\s+/g, ' ')), JSON.stringify(await SS(() => [...document.querySelectorAll('#title-screen button')].map(b => b.dataset.ts + ':' + b.textContent.trim()))));
await SS(() => document.querySelector('#title-screen [data-ts=fresh]')?.click()); await W(800); L('after restart tap', await SS(() => ({ title: !!document.querySelector('#title-screen'), modal: document.querySelector('#modal-backdrop').classList.contains('hidden') ? null : document.querySelector('#modal').dataset.type + ' ' + document.querySelector('#modal').innerText.replace(/\s+/g, ' ').slice(0, 120) }))); await SH('title-restart-tap');
await SS(() => document.querySelector('#modal [data-action=confirmNo],#modal [data-action=close]')?.click()); await W(500);
await SS(() => document.querySelector('#title-screen [data-ts=continue]')?.click()); await W(3000);
await SH('offline-report');
L('offline', await SS(() => { const bd = document.querySelector('#modal-backdrop'); return bd.classList.contains('hidden') ? null : document.querySelector('#modal').innerText.replace(/\s+/g, ' ').slice(0, 700); }));
L('ERRS', JSON.stringify(S.errs)); L('SHOTS', S.log.join(' '));
await S.close();
