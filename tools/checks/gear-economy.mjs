// gear-economy.mjs — 六格裝備的資料／存檔／遊戲經濟／UI 檢查(2026-11-13 task-11)。
//   A. 純資料:src/pixel-data.js 的 RECIPES＝武器＋六件防具,格位唯一、價格／材料／數值與 docs/PAPERDOLL-EQUIPMENT-6.md 一致。
//   B. 存檔:新存檔 v3 六格全 false;舊 v2 {weapon,armor} 讀回＝六件全穿(舊玩家不掉戰力)、沒賣掉的 armor 庫存併到胸甲;v1 仍拒絕。
//   C. 現場(需要先 node build.mjs):鍛造六件後,獵人回村自動逐格買齊、數值上升、gearStock 歸零、counts.gearSold 增加;
//      製作頁列出七列裝備(武器＋六格),獵人卡「裝備」頁列六格防具＋武器強化列,裝備環七格;頁面沒有 page／console error。
//   截圖:output/gear-economy/dossier.png。用法:node tools/checks/gear-economy.mjs(先 npm run build 或 node build.mjs)。
import * as L from './fix-a-lib.mjs';
import fs from 'node:fs';
import * as path from 'node:path';
import { RECIPES, GEAR_SLOTS, EQUIP_SLOTS, BUILDINGS } from '../../src/pixel-data.js';
import { doorStand } from '../../src/landscape-layout.js';
import { createGame } from '../../src/pixel-game.js';

const fails = [], oks = [];
const fix = m => { fails.push(m); console.log('FIX  ' + m); };
const ok = m => { oks.push(m); console.log('  ok ' + m); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
// 2026-11-16 裝備階級:gearStock[格] = {階: 件數};這裡只看各階合計(舊格式的數字也照收)
const tot = st => typeof st === 'number' ? st : Object.values(st || {}).reduce((a, b) => a + b, 0);

// ═══ A. 純資料 ═══
const byId = Object.fromEntries(RECIPES.map(r => [r.id, r]));
if (RECIPES.length !== 7) fix(`A1 RECIPES 應 7 條(武器＋六件防具),實際 ${RECIPES.length}`);
else if (new Set(RECIPES.map(r => r.type)).size !== 7) fix('A1 RECIPES 的 type/格位重複');
if (JSON.stringify(EQUIP_SLOTS) !== JSON.stringify(['weapon', 'helm', 'chest', 'belt', 'legs', 'boots', 'gloves'])) fix(`A2 EQUIP_SLOTS 順序不對: ${JSON.stringify(EQUIP_SLOTS)}`);
if (JSON.stringify(GEAR_SLOTS) !== JSON.stringify(['helm', 'chest', 'belt', 'legs', 'boots', 'gloves'])) fix(`A2 GEAR_SLOTS 不對: ${JSON.stringify(GEAR_SLOTS)}`);
const DOC = {
  weapon: { name: '精鐵武器', slot: '武器', price: 85, cost: { ore: 12, wood: 6 }, bonus: 7, hp: 0, def: 0 },
  helm: { name: '頭盔', slot: '頭盔', price: 90, cost: { cloth: 4, ore: 6 }, bonus: 2, hp: 6, def: 2 },
  chest: { name: '胸甲', slot: '胸甲', price: 140, cost: { ore: 10, leather: 6 }, bonus: 3, hp: 22, def: 3 },
  belt: { name: '腰帶', slot: '腰帶', price: 70, cost: { leather: 4 }, bonus: 1, hp: 4, def: 1 },
  legs: { name: '腿甲', slot: '腿甲', price: 110, cost: { ore: 6, cloth: 4 }, bonus: 2, hp: 10, def: 2 },
  boots: { name: '靴子', slot: '靴子', price: 70, cost: { leather: 4 }, bonus: 1, hp: 4, def: 1 },
  gloves: { name: '手套', slot: '手套', price: 60, cost: { cloth: 3, leather: 2 }, bonus: 1, hp: 4, def: 1 },
};
for (const [slot, want] of Object.entries(DOC)) {
  const r = byId[slot];
  if (!r) { fix(`A3 缺少 ${slot} 的配方`); continue; }
  if (r.id !== slot || r.type !== slot || r.name !== want.name || r.slotName !== want.slot) fix(`A3 ${slot}: id/type/name/slotName(=${r.id}/${r.type}/${r.name}/${r.slotName})應為 ${slot}/${slot}/${want.name}/${want.slot}`);
  if (r.price !== want.price) fix(`A4 ${want.name}: 售價 ${r.price} 應 ${want.price}`);
  if (JSON.stringify(r.cost) !== JSON.stringify(want.cost)) fix(`A4 ${want.name}: 材料 ${JSON.stringify(r.cost)} 應 ${JSON.stringify(want.cost)}`);
  if (r.bonus !== want.bonus || (r.hp || 0) !== want.hp || (r.def || 0) !== want.def) fix(`A5 ${want.name}: bonus/hp/def(=${r.bonus}/${r.hp || 0}/${r.def || 0})應 ${want.bonus}/${want.hp}/${want.def}`);
}
{ // 整組數值:六件 +50 生命 +10 防禦、總價 540(舊護甲只有 +28/+4)
  const gear = GEAR_SLOTS.map(s => byId[s]).filter(Boolean);
  const hp = gear.reduce((n, r) => n + (r.hp || 0), 0), def = gear.reduce((n, r) => n + (r.def || 0), 0), price = gear.reduce((n, r) => n + r.price, 0);
  if (hp !== 50 || def !== 10 || price !== 540) fix(`A6 六件合計 生命+${hp} 防禦+${def} 售價 ${price}，應 +50／+10／540`);
  else if (!fails.length) ok(`A. 純資料：${RECIPES.length} 條配方(武器＋六件防具)、格位唯一、價格／材料／數值符合 docs/PAPERDOLL-EQUIPMENT-6.md(六件合計 生命+${hp} 防禦+${def}、總價 ${price})`);
}

// ═══ B. 存檔與純邏輯 ═══
const fresh = createGame();
if (fresh.state.version !== 3) fix(`B1 新存檔 version ${fresh.state.version} 應 3`);
{
  const h = fresh.state.hunters[0], eq = h.equipment;
  if (!eq || Object.keys(eq).length !== 7 || EQUIP_SLOTS.some(s => eq[s] !== false)) fix(`B2 新獵人 equipment 應七格全 false: ${JSON.stringify(eq)}`);
  if (!fresh.state.gearStock || EQUIP_SLOTS.some(s => tot(fresh.state.gearStock[s]) !== 0)) fix(`B2 新存檔 gearStock 應七格歸零: ${JSON.stringify(fresh.state.gearStock)}`);
}
{ // 舊 v2 存檔:{weapon:true,armor:true} → 六格全穿,強化等級保留
  const old = createGame().serialize(); old.version = 2;
  Object.assign(old.hunters[0], { equipment: { weapon: true, armor: true }, weaponLevel: 4 });
  const re = createGame(old), h = re.state.hunters[0];
  if (!EQUIP_SLOTS.every(s => h.equipment[s] === true)) fix(`B3 舊存檔 armor:true 應讀成六件全穿，實際 ${JSON.stringify(h.equipment)}`);
  if (h.weaponLevel !== 4) fix(`B3 舊存檔 weaponLevel 應保留 4，實際 ${h.weaponLevel}`);
  if (!re.state.hunters.slice(1).every(x => EQUIP_SLOTS.every(s => x.equipment[s] === false))) fix('B3 其他獵人沒有 armor 不該被穿上六件');
  const bare = createGame().serialize(); bare.version = 2; bare.hunters[0].equipment = { weapon: false, armor: false };
  if (EQUIP_SLOTS.some(s => createGame(bare).state.hunters[0].equipment[s])) fix('B3 舊存檔 armor:false 不該穿上任何防具');
  const stock = createGame().serialize(); stock.version = 2; stock.gearStock = { weapon: 0, armor: 2 };
  const rs = createGame(stock);
  if (rs.state.gearStock.chest?.[1] !== 2 || tot(rs.state.gearStock.weapon) !== 0 || 'armor' in rs.state.gearStock) fix(`B3 舊 gearStock.armor 應併到胸甲: ${JSON.stringify(rs.state.gearStock)}`);
}
{ // 六件裝備的數值真的加進 updateStats:同一份存檔,全穿 vs 全空
  const gain = createGame(); const h = gain.state.hunters[0];
  const base = { maxHp: h.maxHp, defense: h.defense, attack: h.attack };
  for (const s of EQUIP_SLOTS) h.equipment[s] = true;
  const save = gain.serialize(); const armed = createGame(save).state.hunters[0];
  if (!(armed.maxHp > base.maxHp)) fix(`B4 全穿生命 ${armed.maxHp} 應 > 空裝 ${base.maxHp}`);
  if (!(armed.defense >= base.defense + 10)) fix(`B4 全穿防禦 ${armed.defense} 應 ≥ 空裝 ${base.defense}+10`);
  if (!(armed.attack > base.attack)) fix(`B4 拿武器攻擊 ${armed.attack} 應 > 空手 ${base.attack}`);
  if (fails.length === 0) ok(`B. 存檔：新檔 v3 七格歸零、舊 v2 {weapon,armor} 讀成六件全穿(強化等級保留、沒賣掉的 armor 併到胸甲)、六件數值進 updateStats(生命 +${armed.maxHp - base.maxHp}・防禦 +${armed.defense - base.defense}・攻擊 +${armed.attack - base.attack})`);
}
if (createGame({ version: 1 }).state.gold === 1500) ok('B. 存檔：version 1 舊存檔仍被拒絕(不會把壞資料讀進來)');
else fix('B5 version 1 存檔不該被接受');

// ═══ C. 現場:鍛造 → 自動購買 → UI ═══
if (fails.length) { console.log(`FAIL gear-economy: ${fails.length} 項(資料／存檔就不過，略過現場檢查)`); process.exit(1); }
const FORGE = BUILDINGS.find(b => b.id === 'forge');
const door = doorStand(FORGE, FORGE);
const srv = await L.startServer(); const browser = await L.launch();
const outDir = path.join(L.ROOT, 'output', 'gear-economy'); fs.mkdirSync(outDir, { recursive: true });
let page = null;
try {
  const ctx = await L.newCtx(browser, L.VIEWS.desktop); page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('pageerror ' + String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  await L.boot(page, srv.url);
  const crafted = await page.evaluate((ids) => {
    const g = globalThis.__mistvaleGame, out = {};
    for (const id of ids) out[id] = g.craftEquipment(id);
    return { results: out, stock: { ...g.state.gearStock }, counts: { ...g.state.counts } };
  }, RECIPES.map(r => r.id));
  for (const r of RECIPES) if (!crafted.results[r.id]?.ok) fix(`C1 鍛造 ${r.name} 失敗: ${crafted.results[r.id]?.message}`);
  for (const s of EQUIP_SLOTS) if (tot(crafted.stock[s]) !== 1) fix(`C1 鍛造後 gearStock.${s} 應 1，實際 ${JSON.stringify(crafted.stock[s])}`);
  if (crafted.counts.gearCrafted !== 7) fix(`C1 counts.gearCrafted 應 7，實際 ${crafted.counts.gearCrafted}`);

  // 只留第一位獵人有錢買(其他人把金幣歸零並標記逛過，避免搶庫存)
  const before = await page.evaluate(({ door }) => {
    const g = globalThis.__mistvaleGame, h = g.state.hunters[0];
    for (const x of g.state.hunters.slice(1)) { x.gold = 0; x.shoppedVisit = true; x.task = null; }
    h.gold = 2000; h.inTown = true; h.shoppedVisit = false; h.task = null; h.lastTownVisit = 0; h.x = door.x; h.z = door.z;
    g.state.time = Math.max(g.state.time, 100);   // 回村購物分支要 state.time - lastTownVisit > 60
    g.state.paused = false;
    return { hp: h.maxHp, def: h.defense, atk: h.attack, gold: h.gold, sold: g.state.counts.gearSold, id: h.id };
  }, { door });
  await L.adv(page, 8);
  const after = await page.evaluate((id) => {
    const g = globalThis.__mistvaleGame, h = g.state.hunters.find(x => x.id === id);
    g.state.paused = true;
    return { eq: { ...h.equipment }, stock: { ...g.state.gearStock }, sold: g.state.counts.gearSold, hp: h.maxHp, def: h.defense, atk: h.attack, gold: h.gold };
  }, before.id);
  const missed = EQUIP_SLOTS.filter(s => after.eq[s] !== true);
  if (missed.length) fix(`C2 獵人回村自動購買沒買齊，缺 ${missed.join('、')}(equipment=${JSON.stringify(after.eq)})`);
  if (after.sold !== before.sold + 7) fix(`C2 counts.gearSold 應 +7(${before.sold}→${after.sold})`);
  if (EQUIP_SLOTS.some(s => tot(after.stock[s]) !== 0)) fix(`C2 買完 gearStock 應歸零: ${JSON.stringify(after.stock)}`);
  if (!(after.hp > before.hp && after.def > before.def && after.atk > before.atk)) fix(`C2 買完數值應上升(生命 ${before.hp}→${after.hp}・防禦 ${before.def}→${after.def}・攻擊 ${before.atk}→${after.atk})`);
  else ok(`C. 現場：鍛造七件入庫 → 獵人回村自動買齊七格(生命 ${before.hp}→${after.hp}・防禦 ${before.def}→${after.def}・攻擊 ${before.atk}→${after.atk})、gearStock 歸零、gearSold +${after.sold - before.sold}、金幣 ${before.gold}→${after.gold}`);

  // 製作頁:武器＋六件防具共七列,每列寫格位／數值／售價
  await L.act(page, 'craftTab', 'gear');
  await page.waitForTimeout(350);
  const craftUI = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#modal-content .zc-row[data-id]')];
    return { n: rows.length, ids: rows.map(r => r.dataset.id), text: rows.map(r => r.textContent.replace(/\s+/g, ' ')) };
  });
  const craftMissing = RECIPES.filter(r => !craftUI.ids.includes(r.id)).map(r => r.name);
  if (craftUI.n !== 7 || craftMissing.length) fix(`C3 製作頁裝備列應 7 列(${RECIPES.map(r => r.name).join('、')})，實際 ${craftUI.n} 列、缺 ${craftMissing.join('、')}`);
  else {
    const texts = craftUI.ids.map((id, i) => [byId[id], craftUI.text[i]]);
    const bad = texts.filter(([r, t]) => !t.includes(r.slotName) || !(r.hp ? (t.includes(`生命 +${r.hp}`) && t.includes(`防禦 +${r.def}`)) : t.includes(`攻擊 +${r.bonus}`)) || !t.includes(`售價 ${r.price} 金`));
    if (bad.length) fix(`C3 裝備列缺少格位／數值／售價文字: ${bad.map(([r]) => r.name).join('、')}`);
    else ok(`C3 製作頁：七列裝備(武器＋六件防具)都有格位、生命／防禦(武器為攻擊 +7)與售價文字`);
  }
  await L.act(page, 'close');
  await page.waitForTimeout(200);

  // 獵人卡「裝備」頁:六格防具各一列(穿著寫名稱、沒穿寫未裝備＋缺少的數值),武器強化列保留;裝備環七格
  await L.act(page, 'hunter', before.id);
  await page.waitForTimeout(300);
  await L.act(page, 'hunterTab', 'gear');
  await page.waitForTimeout(300);
  const dossier = await page.evaluate(() => {
    const hc = document.querySelector('.z2-hc'), panel = document.querySelector('.z2-panel');
    const rows = [...panel.querySelectorAll('.z2-row')].map(r => ({ name: r.querySelector('.z2-row-n')?.textContent || '', desc: r.querySelector('.z2-row-d')?.textContent || '', text: r.textContent.replace(/\s+/g, ' ') }));
    const slots = [...hc.querySelectorAll('.z2-slot')];
    return { rows, slots: slots.length, btns: slots.filter(s => s.tagName === 'BUTTON').length, ghosts: slots.filter(s => s.classList.contains('ghost')).length, ring: !!hc.querySelector('.z2-ring') };
  });
  const gearRows = dossier.rows.filter(r => /生命 \+/.test(r.desc));
  const missingGear = GEAR_SLOTS.filter((s, i) => !gearRows[i] || !gearRows[i].desc.includes(`生命 +${byId[s].hp}`) || !gearRows[i].desc.includes(`防禦 +${byId[s].def}`));
  if (dossier.rows.length !== 7) fix(`C4 裝備頁應七列(武器強化＋六格防具)，實際 ${dossier.rows.length} 列`);
  if (missingGear.length) fix(`C4 裝備頁缺 ${missingGear.join('、')} 的列或數值文字`);
  if (!dossier.rows.some(r => r.desc.includes('攻擊 +7'))) fix('C4 裝備頁少了武器強化列(攻擊 +7)');
  if (dossier.slots !== 7 || dossier.btns !== 7 || dossier.ghosts !== 0) fix(`C4 裝備環應七格(武器＋六件防具、七顆按鈕)，實際 ${dossier.slots} 格／${dossier.btns} 鈕／${dossier.ghosts} 暫空`);
  if (!dossier.ring) fix('C4 裝備環不見了');
  if (!fails.some(f => f.startsWith('C4'))) ok(`C4 獵人卡：裝備頁七列(武器強化＋六格防具，每列生命／防禦)、裝備環七格 ${dossier.slots} 顆按鈕`);
  await page.screenshot({ path: path.join(outDir, 'dossier.png') });
  if (!fs.existsSync(path.join(outDir, 'dossier.png'))) fix('C5 沒有存到 output/gear-economy/dossier.png');
  if (errs.length) for (const e of errs.slice(0, 5)) fix('C5 頁面錯誤: ' + e);
  else ok('C5 頁面沒有 page／console error，截圖 output/gear-economy/dossier.png');
} catch (err) {
  fix('C 現場檢查爆掉: ' + (err?.stack || err).toString().split('\n').slice(0, 3).join(' | '));
} finally {
  await browser.close().catch(() => {});
  srv.stop();
}
console.log(fails.length ? `FAIL gear-economy: ${fails.length} 項` : 'PASS gear-economy: 六格裝備(資料／存檔遷移／自動購買／製作頁／獵人卡／無頁面錯誤)全數通過');
process.exit(fails.length ? 1 : 0);
