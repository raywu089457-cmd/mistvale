process.env.OUT = 'output/ui-audit/round3-mobile/wm';
const L = await import('./round3-mobile-lib.mjs');
const b = await L.launch();
for (const VN of ['l667x375', 'l740x360', 'l844x390', 'm390x844']) {
  const ctx = await L.newCtx(b, L.VIEWS[VN]); const page = await ctx.newPage();
  await L.boot(page, 'http://127.0.0.1:5192/?preview=1'); await page.waitForTimeout(2500);
  await L.act(page, 'worldmap'); await page.waitForTimeout(700);
  console.log(VN, JSON.stringify(await page.evaluate(() => { const m = document.querySelector('#modal'); const c = [...m.querySelectorAll('canvas,img,.map-wrap,.world-map,[class*=map]')].filter(e => e.getBoundingClientRect().width > 100).slice(0, 4).map(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [e.tagName + '.' + String(e.className).split(' ')[0], Math.round(r.width), Math.round(r.height), e.width && e.height ? (e.width / e.height).toFixed(2) : '', cs.objectFit, cs.imageRendering]; }); const cc = document.querySelector('#modal-content'); return { c, ch: cc.clientHeight, sh: cc.scrollHeight }; })));
  await ctx.close();
}
await b.close();
