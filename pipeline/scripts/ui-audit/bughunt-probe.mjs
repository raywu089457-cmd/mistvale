// bughunt-probe.mjs — 快速探索用: node bughunt-probe.mjs <view> ; 全新存檔開局的畫面
import * as L from './bughunt-lib.mjs';
const view = L.VIEWS[process.argv[2] || 'desktop'];
const b = await L.launch(); const ctx = await L.newCtx(b, view); const page = await ctx.newPage();
const log = []; const S = L.hook(page, process.argv[2] || 'desktop', log);
await L.boot(page);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${L.OUT}/shots/probe-${process.argv[2] || 'desktop'}-1.png` });
const info = await page.evaluate(() => ({
  modal: !document.querySelector('#modal-backdrop').classList.contains('hidden'), type: document.querySelector('#modal')?.dataset.type,
  gameUi: !document.querySelector('#game-ui').classList.contains('hidden'),
  title: document.querySelector('#title-art') ? 'has title-art' : 'no title-art',
  keys: Object.keys(globalThis).filter(k => k.startsWith('__mistvale')).join(','),
  save: !!localStorage.getItem('mistvale-save') , ls: Object.keys(localStorage).join(','),
  gstate: Object.keys(globalThis.__mistvaleGame).join(','),
}));
console.log(JSON.stringify(info, null, 1));
console.log(JSON.stringify(log, null, 1));
await b.close();
