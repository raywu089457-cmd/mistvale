import { session, BASE, W } from './round3-ux-lib.mjs';
const S = session('desktop', 'dbg');
const page = await S.open(() => { try { localStorage.setItem('mistvale-touch-tip', '1'); } catch {} });
await S.goto(BASE + '?preview=1');
await S.ev(() => { const g = globalThis.__mistvaleGame; g.cheat('all'); g.state.paused = false; });
try { await page.locator('#bottom-bar [data-action=dungeon]').click({ timeout: 3000 }); console.log('plain ok'); } catch (e) { console.log(String(e.message).slice(0, 900)); }
console.log(await S.ev(() => { const b = document.querySelector('#bottom-bar [data-action=dungeon]'); const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height], top: t?.id + '.' + t?.className + ' ' + t?.tagName }; }));
await S.close();
