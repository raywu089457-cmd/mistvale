// small-text.mjs — which CSS rule makes each piece of text smaller than 11px (2026-10-30; companion of layout.mjs READ lines).
// Opens screens like layout.mjs, finds visible text under 11px, and groups it by the CSS rule that sets the size
// (the element's own rule, or the ancestor it inherits from). Specificity is not computed: the last matching rule in source order is shown.
// Usage: node pipeline/scripts/ui-audit/small-text.mjs [device] [screen,screen]
//   device: iphone-402x712 (default) | iphone-land-812x360 | android-360x640;  screens: village, inspector, or modal actions (settings, build, hunters, hunter, …)
import { createRequire } from 'module';
const require = createRequire('C:/Users/ray/AppData/Roaming/npm/node_modules/');
const { chromium } = require('playwright');
const DEV = { 'iphone-402x712': [402, 712], 'iphone-land-812x360': [812, 360], 'android-360x640': [360, 640] }[process.argv[2] || 'iphone-402x712'];
const LIST = (process.argv[3] || 'village,settings,build,hunters,hunter,recruit,trade,craft,craft:gear,inspector').split(',');
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--headless=new'] });
const page = await (await b.newContext({ viewport: { width: DEV[0], height: DEV[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
await page.goto(process.env.TARGET || 'http://100.79.149.0:5024/?preview=1', { waitUntil: 'commit', timeout: 120000 });
await page.waitForFunction(() => globalThis.__mistvaleGame && !document.querySelector('#game-ui')?.classList.contains('hidden') && !document.querySelector('#loading'), null, { timeout: 120000 });
await page.evaluate(() => { const g = globalThis.__mistvaleGame; Object.assign(g.state, { gold: 99999, wood: 9999, ore: 9999, herb: 9999, cloth: 9999, flour: 9999, leather: 9999, gems: 999 }); for (const id of Object.keys(g.state.buildings)) g.state.buildings[id] = Math.max(1, g.state.buildings[id]); });
const act = (a, id) => page.evaluate(([a, id]) => { const el = document.createElement('button'); el.dataset.action = a; if (id != null) el.dataset.id = id; el.style.display = 'none'; document.body.append(el); el.click(); el.remove(); }, [a, id]);
const close = () => page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); document.querySelector('#inspector:not(.hidden) [data-action=closeInspector]')?.click(); });
for (const s of LIST) {
  await close(); await page.waitForTimeout(200);
  const [a, tab] = s.split(':');
  if (a === 'inspector') await act('selectBuilding', 'forge');
  else if (a === 'hunter') await act('hunter', await page.evaluate(() => globalThis.__mistvaleGame.state.hunters[0].id));
  else if (a !== 'village') { await act(a); if (tab) await act('craftTab', tab); }
  await page.waitForTimeout(500);
  const rows = await page.evaluate((scope) => {
    const rules = [];
    const walk = (list, media) => { for (const r of list) {
      if (r.cssRules && r.conditionText !== undefined) { if (r instanceof CSSMediaRule ? matchMedia(r.conditionText).matches : CSS.supports(r.conditionText)) walk(r.cssRules, (media ? media + ' & ' : '') + r.conditionText); }
      else if (r.selectorText && r.style?.fontSize) rules.push({ sel: r.selectorText, fs: r.style.fontSize, media });
    } };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, ''); } catch { } }
    const root = document.querySelector(scope);
    const shown = e => e.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false && e.getBoundingClientRect().width > .5;
    const own = e => [...e.childNodes].some(n => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.textContent));
    const path = e => { const p = []; for (let x = e; x && x !== root && p.length < 3; x = x.parentElement) p.unshift(x.tagName.toLowerCase() + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (x.dataset?.action ? `[${x.dataset.action}]` : '')); return p.join('>'); };
    const src = e => { for (let x = e; x; x = x.parentElement) { const m = rules.filter(r => { try { return x.matches(r.sel); } catch { return false; } }); if (m.length) { const r = m[m.length - 1]; return (x === e ? '' : '(inherited) ') + r.sel.slice(0, 90) + ' {' + r.fs + '}' + (r.media ? ' @' + r.media.slice(0, 60) : ''); } } return '(none)'; };
    const g = {};
    for (const e of (root ? root.querySelectorAll('*') : [])) {
      if (!own(e) || !shown(e)) continue; const fs = parseFloat(getComputedStyle(e).fontSize); if (!(fs > 0 && fs < 11)) continue;
      const k = src(e); (g[k] ||= []).push(path(e) + ' "' + e.textContent.trim().slice(0, 10) + '" ' + +fs.toFixed(1));
    }
    return Object.entries(g).map(([k, v]) => `  RULE ${k}\n    ${[...new Set(v)].slice(0, 4).join('\n    ')}${v.length > 4 ? `\n    …+${v.length - 4}` : ''}`);
  }, a === 'village' ? 'body' : a === 'inspector' ? '#inspector' : '#modal');
  console.log(`== ${s}\n${rows.join('\n') || '  (none)'}`);
}
await b.close();
