// hunter-autonomy.mjs — 獵人自主狩獵(2026-11-12 UX 稽核 round3 第 5 條)
// 全新存檔、不下任何指令,推進 MINUTES 分鐘遊戲時間:
//   1) 初始獵人至少 K 位自己出過村(踩出村界)
//   2) 獵人(不含流浪英雄)有擊倒數
//   3) 後半段「村莊＋獵人錢包」總金幣還在增加(稽核時第 8 分鐘起卡在 2,476 不動:沒人打怪,錢只在村裡與錢包間轉手)
//   4) 第二局:同樣不下指令,但在一半時補一次貨(玩家做麵包/飲品/床/繃帶)→ 獵人帶回的錢會流進村莊,村莊金幣要增加
//      (不補貨時村莊金幣本來就會停:商品第 ~7 分鐘賣完、收購委託額度用完,這是玩家的經營工作,不是獵人 AI)
//   5) 離線戰報把「你的獵人」與「流浪英雄」的擊倒與收入分開記
// 純 node,不用瀏覽器、不用伺服器。修前(獵人只待在村裡)這支會紅。
import { pathToFileURL } from 'node:url';
// GAME_DIR:改用另一份 src(例:修前版本的複本)證明這支修前會紅
const SRC = process.env.GAME_DIR ? pathToFileURL(process.env.GAME_DIR.replace(/[\/]?$/, '/')).href : new URL('../../src/', import.meta.url).href;
const { createGame } = await import(SRC + 'pixel-game.js'), { inVillage } = await import(SRC + 'overworld.js');

const MINUTES = Number(process.env.MINUTES || 20), K = Number(process.env.K || 4), MIN_KILLS = Number(process.env.MIN_KILLS || 20);
const steps = MINUTES * 600;
const total = st => st.gold + st.hunters.reduce((n, h) => n + h.gold, 0);
function play(restockAtMid) {
  const g = createGame(), s = g.state;
  const initial = new Set(s.hunters.map(h => h.id)), left = new Set();
  let mid = null;
  for (let i = 1; i <= steps; i++) {
    g.tick(0.1);
    if (i % 10 === 0) for (const h of s.hunters) if (initial.has(h.id) && h.hp > 0 && !inVillage(h.x, h.z)) left.add(h.id);
    if (i === steps / 2) {
      if (restockAtMid) { s.flour = s.herb = s.cloth = s.wood = 500; for (const p of ['food', 'drink', 'bed', 'bandage']) g.craft(p, 4); }
      mid = { gold: s.gold, total: total(s) };
    }
  }
  return { g, s, left, initial, mid };
}
const fails = [];
const A = play(false), B = play(true), s = A.s, g = A.g, deaths = s.counts.deaths;
const stat = `出村 ${A.left.size}/${A.initial.size} 位、獵人擊倒 ${s.totalKills} 隻、流浪英雄擊倒 ${s.wanderKills || 0} 隻、倒下 ${deaths} 次;`
  + `村莊＋錢包 ${A.mid.total} → ${total(s)}(第 ${MINUTES / 2}→${MINUTES} 分,村莊 ${A.mid.gold} → ${s.gold});補貨局村莊金幣 ${B.mid.gold} → ${B.s.gold}`;
if (A.left.size < K) fails.push(`初始獵人只有 ${A.left.size} 位出過村(要 ≥ ${K})`);
if (s.totalKills < MIN_KILLS) fails.push(`獵人擊倒 ${s.totalKills} 隻(要 ≥ ${MIN_KILLS})`);
if (!(total(s) > A.mid.total)) fails.push(`後半段村莊＋獵人總金幣沒有增加(${A.mid.total} → ${total(s)})`);
if (!(B.s.gold > B.mid.gold + 100)) fails.push(`補貨後村莊金幣沒有明顯增加(${B.mid.gold} → ${B.s.gold})`);

// 離線戰報:獵人與流浪英雄分開
const snap = g.offlineSnapshot(); g.simulate(120); const sum = g.offlineFinish(snap, 3600);
const H = sum.hunters, W = sum.wanderers;
if (!H || !W) fails.push(`離線戰報沒有分開的 hunters / wanderers 欄位(${JSON.stringify(Object.keys(sum))})`);
else {
  if (!(H.kills > 0)) fails.push(`離線戰報「你的獵人」擊倒 ${H.kills}`);
  if (H.kills !== sum.kills || W.kills !== sum.wanderKills) fails.push(`離線戰報分項與總數對不上(${H.kills}/${sum.kills}、${W.kills}/${sum.wanderKills})`);
  if (!Number.isFinite(H.gold) || !Number.isFinite(W.gold)) fails.push(`離線戰報收入不是數字(${H.gold}、${W.gold})`);
}
const off = H && W ? `;離線 1 小時:獵人 ${H.kills} 隻/${H.gold} 金,流浪英雄 ${W.kills} 隻/${W.gold} 金` : '';
if (fails.length) { console.log(`FAIL 獵人自主狩獵:${stat}${off}\n - ` + fails.join('\n - ')); process.exit(1); }
console.log(`PASS 獵人自主狩獵:${stat}${off}`);
