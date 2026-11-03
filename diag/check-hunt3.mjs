// 驗證三件事:(1) 生怪點在區內均勻 (2) 英雄踩到區域邊界就馬上找最近的怪打 (3) 魔物只打主動攻擊範圍內的敵人。
import {createGame} from '../src/pixel-game.js';
import {REGIONS, regionContains, regionCenter, randomRegionPoint} from '../src/overworld.js';
import {VILLAGE_BOUNDS} from '../src/village-grid.js';

const R = (n, d = 2) => Number(n.toFixed(d));
const VC = { x: (VILLAGE_BOUNDS.minX + VILLAGE_BOUNDS.maxX) / 2, z: (VILLAGE_BOUNDS.minZ + VILLAGE_BOUNDS.maxZ) / 2 };

// ── (1) 生怪點在區內均勻
{
  const id = 'forest', N = 4000, pts = [];
  for (let i = 0; i < N * 4 && pts.length < N; i++) {
    const p = randomRegionPoint(id, Math.random);
    if (regionContains(id, p.x, p.z)) pts.push(p);
  }
  let sumR = 0, minR = 1e9, maxR = 0;
  for (const p of pts) {
    const r = Math.hypot(p.x - VC.x, p.z - VC.z);
    sumR += r; minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  // 均勻面積的環形平均半徑 = (2/3)(R1³−R0³)/(R1²−R0²)
  const meanR = (2 / 3) * (maxR ** 3 - minR ** 3) / (maxR ** 2 - minR ** 2);
  const err = Math.abs(sumR / pts.length - meanR) / meanR;
  console.log(`(1) 生怪點 ${pts.length} 個(全部在區內;半徑 ${R(minR, 1)}–${R(maxR, 1)})、`
    + `平均半徑 ${R(sumR / pts.length, 1)} vs 均勻理論值 ${R(meanR, 1)} → 誤差 ${(err * 100).toFixed(1)}%`);
}

// ── (2) 英雄踩到區域邊界就開打
{
  const g = createGame(); g.state.paused = false;
  g.dispatchHunters('mountain', g.state.hunters.filter(h => h.hp > 0).map(h => h.id));
  let entered = null, locked = null, dist = null, who = null;
  for (let i = 0; i < 12000 && locked === null; i++) {
    g.tick(0.05);
    for (const h of g.state.hunters) {
      if (h.hp <= 0 || h.huntRegion !== 'mountain') continue;
      const inside = regionContains('mountain', h.x, h.z);
      if (inside && entered === null) entered = g.state.time;
      if (entered !== null && inside && h.targetId && locked === null) {
        const e = g.state.enemies.find(v => v.id === h.targetId && v.hp > 0);
        if (e) { locked = g.state.time; dist = Math.hypot(e.x - h.x, e.z - h.z); who = h.status; }
      }
    }
  }
  console.log(locked === null ? '(2) FAIL:進到區域後一直沒有鎖定目標'
    : `(2) 踩到區域邊界後 ${R((locked - entered) * 1000, 0)} 毫秒就鎖定目標(距離 ${R(dist, 1)} 格)、狀態 ${who}`);
}

// ── (3) 魔物只打主動攻擊範圍內的敵人(wolf 的範圍 8)
for (const dist of [12, 9, 6, 4]) {
  const g = createGame();
  g.state.enemies = [];
  const c = regionCenter('forest');
  const h = g.state.hunters[0];
  h.huntRegion = null; h.task = 'x'; h.hp = h.maxHp; h.status = '待機';
  g.state.enemies.push({ id: 'e1', type: 'wolf', x: c.x, z: c.z, hp: 999, maxHp: 999, attack: 5, attackTimer: 0.1, age: 0, regionId: 'forest', engaged: false });
  const hx = c.x + dist * 0.9, hz = c.z;
  let chase = 0, hit = 0;
  for (let i = 0; i < 60; i++) {
    h.x = hx; h.z = hz;                       // 英雄釘住不動,只看魔物行為
    g.tick(0.05);
    const e = g.state.enemies.find(v => v.id === 'e1');
    if (!e) break;
    // 「追」= 往英雄靠近的位移
    const before = Math.hypot(e.x - hx, e.z - hz);
    if (i > 0) chase = Math.max(chase, -(before - g.__lastDist ?? 0));
    g.__lastDist = before;
    if (e.atkAt != null) hit++;
  }
  const e = g.state.enemies.find(v => v.id === 'e1');
  console.log(`(3) 距離 ${String(dist).padStart(2)} → 出手 ${String(hit).padStart(2)} 次、engaged=${!!e?.engaged}`);
}
