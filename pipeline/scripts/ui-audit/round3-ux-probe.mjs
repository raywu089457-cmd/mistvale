// round3-ux-probe.mjs — 查詢遊戲狀態(獵人是否自動狩獵、委託狀態、初始獵人數)
import { session, BASE, W } from './round3-ux-lib.mjs';
const S = session('desktop', 'probe');
const page = await S.open();
await S.goto(BASE + '?preview=1');
const r = await S.ev(async () => {
  const g = globalThis.__mistvaleGame; const st = g.state; const out = {};
  out.hunters0 = st.hunters.map(h => h.name + ':' + h.status + ':L' + h.level);
  out.wanderers = (st.wanderers || []).length;
  out.quest = JSON.stringify(st.quest).slice(0, 200);
  out.keys = Object.keys(st).join(',');
  st.paused = false;
  const snaps = [];
  for (let m = 0; m < 20; m++) { for (let t = 0; t < 60; t += .25) g.tick(.25); const c = {}; st.hunters.forEach(h => c[h.status] = (c[h.status] || 0) + 1); snaps.push((m + 1) + 'min ' + JSON.stringify(c) + ' gold ' + Math.round(st.gold)); }
  out.snaps = snaps;
  out.dungeon = JSON.stringify(st.dungeon).slice(0, 200);
  out.log = (st.log || []).slice(-12);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await S.close();
