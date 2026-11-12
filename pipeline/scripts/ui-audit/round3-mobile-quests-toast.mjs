process.env.OUT = 'output/ui-audit/round3-mobile/qt';
const L = await import('./round3-mobile-lib.mjs');
const b = await L.launch();
for (const VN of ['m360x640', 'm360x640', 'm360x780']) {
  const ctx = await L.newCtx(b, L.VIEWS[VN]); const page = await ctx.newPage();
  await L.boot(page, 'http://127.0.0.1:5192/?preview=1'); await page.waitForTimeout(3000);
  await page.evaluate(() => { const g = globalThis.__mistvaleGame; for (const k of ['resources', 'buildings', 'levels', 'heal']) g.cheat(k); });
  const out = [];
  for (const name of ['dungeon', 'quests', 'quests']) {
    await page.evaluate(() => { document.querySelector('#modal-backdrop:not(.hidden) [data-action=close]')?.click(); }); await page.waitForTimeout(300);
    await L.act(page, name); await page.waitForTimeout(520);
    await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach(e => e.remove()); globalThis.__toast('升級資源不足，請收購更多木材與鐵礦後再來升級', false); });
    await page.waitForTimeout(430);
    out.push(name + ':' + JSON.stringify(await page.evaluate(() => { const t = document.querySelector('#toasts .toast'); const ti = document.querySelector('#modal .modal-title').getBoundingClientRect(); if (!t) return { none: true, kids: document.querySelector('#toasts').children.length, parent: document.querySelector('#toasts').parentElement.className }; const r = t.getBoundingClientRect(); return { l: r.left, t: r.top, h: r.height, tl: ti.left, tt: ti.top, th: ti.height, cls: t.className, op: getComputedStyle(t).opacity }; })));
  }
  console.log(VN, out.join('\n  ')); await ctx.close();
}
await b.close();
