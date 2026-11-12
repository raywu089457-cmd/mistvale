import { launch, newCtx, boot, VIEWS } from '../../../tools/checks/fix-a-lib.mjs';
const b = await launch(); const ctx = await newCtx(b, VIEWS.phone); const page = await ctx.newPage();
await boot(page, 'http://127.0.0.1:5193/?preview=1');
const r = await page.evaluate(() => {
  const out = [];
  const walk = (root, label) => { for (const e of root.querySelectorAll('*')) { if (e.children.length) continue; const t = (e.textContent || '').trim(); if (!t) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.top > 260) continue; const c = getComputedStyle(e); out.push([t.slice(0, 14), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), c.fontSize, c.color, c.fontFamily.slice(0, 14)].join('|')); } };
  walk(document.querySelector('#topbar'));
  const hl = document.querySelector('#hv-left'); if (hl) walk(hl);
  const icons = [...document.querySelectorAll('#topbar button, #topbar [data-action]')].map(e => { const r = e.getBoundingClientRect(); return (e.dataset.action || e.id) + ':' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + 'x' + Math.round(r.height); });
  const rb = [...document.querySelectorAll('#bottom-bar>button')].map(e => { const i = e.querySelector('[data-icon],img,canvas,svg'); const r = i?.getBoundingClientRect(); const s = e.querySelector('span,b,small'); return Math.round(e.getBoundingClientRect().width) + ' icon ' + (r ? Math.round(r.width) + 'x' + Math.round(r.height) : '-') + ' lbl ' + (s ? getComputedStyle(s).fontSize : '-'); });
  return { out, icons, rb, dp: devicePixelRatio, scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') };
});
console.log(r.out.join('\n')); console.log(r.icons.join('\n')); console.log(r.rb.join('\n'), r.dp, r.scale);
await b.close();
