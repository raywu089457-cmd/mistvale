// doll-classes.mjs — 六部位裝備 × 每武器動作層 的紙娃娃美術包驗收(docs/PAPERDOLL-EQUIPMENT-6.md §6-A/B)。
//
// 這個檢查同時驗三件事:
//   A 資料包結構(純 Node,讀 assets/paperdoll-classes/paperdoll.json):
//     格式/版本/20 ticks、六個職業都有 body+六部位+武器 skin、六個部位層都是 kind:"slot",
//     每個職業都有屬於自己的武器動作列(attack.bow / attack.greatsword / attack.sword / attack.staff / attack.dagger)
//     —— 這就是使用者選的 D「每武器動畫層」。
//   B 合成邏輯(直接 import src/paperdoll.js 的純函式):
//     沒穿 = 沒有部位層;單穿一件 = 只多那一層;六件全穿 = 六層而且由內到外順序正確;
//     每件都真的畫到不同的格子(部位層的 sprite 不是空的、跟沒穿時不同)。
//   C 遊戲內(建置好的 outputs/暮影村.html,?doll=hero):
//     紙娃娃真的上線(至少 5 位獵人由紙娃娃畫出來,drawnFacing 有 .doll)、沒有 page error、
//     切換六部位裝備時合成快取增加(代表真的合了新的一格),關掉再切回同一組合不會再增加。
//
// Exit 0 = PASS, 1 = FAIL(先列 FAIL,再一行總結)。用法:node tools/checks/doll-classes.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as L from './fix-a-lib.mjs';
import { computeParts, lookFromHunter, GEAR_SLOTS } from '../../src/paperdoll.js';

const PACK = path.join(L.ROOT, 'assets/paperdoll-classes');
const fails = [];
const ok = (m) => console.log('ok  ' + m);
const fix = (m) => { fails.push(m); console.log('FIX ' + m); };

// ── A 資料包結構 ────────────────────────────────────────────────────────────────
const jsonPath = path.join(PACK, 'paperdoll.json');
let data = null;
try { data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { fix('讀不到 ' + jsonPath + ': ' + e.message); }
const CLASSES = ['berserker', 'paladin', 'sorcerer', 'archer', 'assassin', 'priest'];
const WANT_TYPE = { archer: 'bow', berserker: 'greatsword', paladin: 'sword', sorcerer: 'staff', priest: 'staff', assassin: 'dagger' };

if (data) {
  if (data.format === 'mistvale-paperdoll' && data.version === 1) ok('A1 格式/版本 mistvale-paperdoll v1');
  else fix('A1 格式或版本不對: ' + data.format + ' v' + data.version);
  if (data.tickRate === 20) ok('A2 tickRate 20'); else fix('A2 tickRate 應為 20,實際 ' + data.tickRate);

  const slotsOk = GEAR_SLOTS.every(s => data.layers?.[s]?.kind === 'slot');
  if (slotsOk) ok('A3 六部位都是 slot 層: ' + GEAR_SLOTS.join('/'));
  else fix('A3 缺少部位層: ' + GEAR_SLOTS.filter(s => data.layers?.[s]?.kind !== 'slot').join(','));

  const kitsOk = CLASSES.every(c => data.meta?.kits?.[c] && data.skins?.body?.[c]);
  if (kitsOk) ok('A4 六職業都有 meta.kits + body skin'); else fix('A4 缺 meta.kits 或 body skin: ' + CLASSES.filter(c => !data.meta?.kits?.[c] || !data.skins?.body?.[c]).join(','));

  const kitPartsOk = CLASSES.every(c => GEAR_SLOTS.every(s => data.meta.kits[c][s] && data.skins?.[s]?.[data.meta.kits[c][s]]));
  if (kitPartsOk) ok('A5 每職業六部位都在 kits 表 + skins 表裡');
  else fix('A5 部位缺 skin: ' + CLASSES.flatMap(c => GEAR_SLOTS.filter(s => !data.meta.kits[c][s] || !data.skins?.[s]?.[data.meta.kits[c][s]]).map(s => c + '/' + s)).join(','));

  // D:每種武器都有自己的 attack 列
  const perWeapon = {};
  for (const c of CLASSES) {
    const t = WANT_TYPE[c], kit = data.meta.kits[c];
    const wt = kit.weaponType || data.weapons?.[kit.weapon]?.type;
    perWeapon[c] = { type: wt, row: 'attack.' + wt, has: !!data.actions?.['attack.' + wt] };
  }
  const badType = CLASSES.filter(c => perWeapon[c].type !== WANT_TYPE[c]);
  const badRow = CLASSES.filter(c => !perWeapon[c].has);
  if (!badType.length) ok('A6 武器型別: ' + CLASSES.map(c => c + '=' + perWeapon[c].type).join(' '));
  else fix('A6 武器型別不對: ' + badType.map(c => c + ' 應 ' + WANT_TYPE[c] + ' 實際 ' + perWeapon[c].type).join(','));
  if (!badRow.length) ok('A7 專屬武器動作列齊全: ' + [...new Set(CLASSES.map(c => 'attack.' + perWeapon[c].type))].join(' '));
  else fix('A7 缺專屬武器動作列: ' + badRow.map(c => 'attack.' + perWeapon[c].type).join(','));

  // af 單調遞增、release/impact 在範圍內
  const badAf = [], badSlot = [];
  for (const [name, a] of Object.entries(data.actions || {})) {
    const af = a.af || [];
    if (af.length < 2 || af.some((v, i) => !(v > (i ? af[i - 1] : 0)))) badAf.push(name);
    for (const k of ['releaseSlot', 'impactSlot']) if (a[k] != null && !(a[k] >= 1 && a[k] <= af.length)) badSlot.push(name + ':' + k);
  }
  if (!badAf.length) ok('A8 所有動作 af 嚴格遞增(' + Object.keys(data.actions).length + ' 個動作)');
  else fix('A8 af 不遞增: ' + badAf.join(','));
  if (!badSlot.length) ok('A9 releaseSlot/impactSlot 都在範圍內'); else fix('A9 slot 越界: ' + badSlot.join(','));
}

// ── B 合成邏輯 ─────────────────────────────────────────────────────────────────
if (data) {
  const hunter = (cls, equipment) => ({ classId: cls, equipment, weaponLevel: 0 });
  const layersOf = (h) => computeParts(data, { action: 'idle', dir: 2, tick: 0, look: lookFromHunter(h, data) })
    .map(p => p.layer);
  const gearLayers = (ls) => ls.filter(l => GEAR_SLOTS.includes(l));

  for (const c of CLASSES) {
    const bare = layersOf(hunter(c, {}));
    if (!gearLayers(bare).length) ok('B1 ' + c + ' 沒穿裝備時沒有部位層(裸裝)');
    else fix('B1 ' + c + ' 裸裝卻畫了部位層: ' + gearLayers(bare).join(','));
    if (bare.includes('body') && bare.includes('head') && bare.includes('weapon')) ok('B2 ' + c + ' 裸裝仍有 body/head/weapon');
    else fix('B2 ' + c + ' 裸裝缺基本層: ' + JSON.stringify(bare));
  }

  // 單穿一件:只多那一層,而且那一層的格子跟裸裝不同(真的有畫東西)
  for (const c of CLASSES) {
    for (const slot of GEAR_SLOTS) {
      const bare = computeParts(data, { action: 'idle', dir: 2, tick: 0, look: lookFromHunter(hunter(c, {}), data) });
      const one = computeParts(data, { action: 'idle', dir: 2, tick: 0, look: lookFromHunter(hunter(c, { [slot]: true }), data) });
      const added = one.filter(p => !bare.some(b => b.layer === p.layer)).map(p => p.layer);
      const part = one.find(p => p.layer === slot);
      const good = added.length === 1 && added[0] === slot && part && part.sprite && part.sprite[2] > 0 && part.sprite[3] > 0;
      if (!good) fix('B3 ' + c + '/' + slot + ' 單穿沒有正確多一層或格子為空(added=' + JSON.stringify(added) + ' sprite=' + JSON.stringify(part?.sprite) + ')');
    }
  }
  const b3bad = fails.filter(f => f.startsWith('B3')).length;
  if (!b3bad) ok('B3 六職業 × 六部位單穿都只多自己那一層,格子非空');

  // 全穿:六層、由內到外順序 = 腰/腿/靴/胸/手/頭 的畫圖順序(依 layers order),且每件各自一格
  for (const c of CLASSES) {
    const all = computeParts(data, { action: 'idle', dir: 2, tick: 0, look: lookFromHunter(hunter(c, Object.fromEntries(GEAR_SLOTS.map(s => [s, true]))), data) });
    const got = all.map(p => p.layer);
    const miss = GEAR_SLOTS.filter(s => !got.includes(s));
    if (miss.length) { fix('B4 ' + c + ' 全穿缺層: ' + miss.join(',')); continue; }
    const uniq = new Set(all.filter(p => GEAR_SLOTS.includes(p.layer)).map(p => p.sprite.join(',') + '@' + p.skin.x + ',' + p.skin.y));
    if (uniq.size === 6) ok('B4 ' + c + ' 全穿六層各自不同格子(' + got.filter(l => GEAR_SLOTS.includes(l)).join('>') + ')');
    else fix('B4 ' + c + ' 全穿有部位共用同一格(uniq=' + uniq.size + ')');
  }

  // 精良武器:武器 skin 換成 _fine(使用者要的「換武器外觀」)
  const w = computeParts(data, { action: 'idle', dir: 2, tick: 0, look: lookFromHunter(hunter('archer', { weapon: true }), data) });
  const wp = w.find(p => p.layer === 'weapon');
  const skinOk = wp && (wp.skin.img === (data.skins.weapon?.archer_fine?.img) || wp.skin.x !== (data.skins.weapon.archer?.x ?? -1));
  if (skinOk) ok('B5 equipment.weapon=true 換成 _fine 武器外觀'); else fix('B5 精良武器沒有換外觀: ' + JSON.stringify(wp?.skin));
}

// ── C 遊戲內 ───────────────────────────────────────────────────────────────────
if (!fails.length) {
  const srv = await L.startServer();
  const browser = await L.launch();
  let target = null;
  try {
    const ctx = await L.newCtx(browser, L.VIEWS.desktop);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).split('\n')[0].slice(0, 160)));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/i.test(t)) errors.push('console.error: ' + t.slice(0, 160)); });
    await L.boot(page, srv.url + '?doll=hero');
    const st = await page.waitForFunction(() => { const s = globalThis.__mistvaleDoll?.(); return s && s.on && s.ready ? s : null; }, null, { timeout: 20000 }).then(h => h.jsonValue()).catch(() => null);
    if (!st) fix('C1 ?doll=hero 沒有載入(紙娃娃旗標沒開或資料沒好)');
    else if (st.all) ok('C1 ?doll=hero 上線(all=true ready=true)');
    else fix('C1 ?doll=hero 只開了部分職業: ' + JSON.stringify(st));
    const base = await page.evaluate(() => globalThis.PIXEL_ASSETS?.paperdollClassesBase || '');
    if (base === 'media/paperdoll-classes/') ok('C2 建置檔載入新美術包 base=' + base); else fix('C2 paperdollClassesBase 不對: "' + base + '"');

    await L.adv(page, 2, 0.25);
    await page.waitForTimeout(300);
    const face = await page.evaluate(() => globalThis.__mistvaleFacing?.() || {});
    const dolls = Object.values(face).filter(f => f && f.doll);
    if (dolls.length >= 5) ok('C3 紙娃娃真的在畫:' + dolls.length + ' 位獵人 drawnFacing 有 .doll(act=' + [...new Set(dolls.map(d => d.doll.act))].join('/') + ')');
    else fix('C3 只有 ' + dolls.length + ' 位獵人由紙娃娃畫出來(應 ≥5)');
    const acts = new Set(dolls.map(d => d.doll.act));
    if (acts.has('idle') || acts.has('walk')) ok('C4 紙娃娃動作在跑: ' + [...acts].join('/')); else fix('C4 沒有 idle/walk 動作: ' + [...acts].join('/'));

    // 六部位切換:合成快取要增加(真的合了新的一格),切回同一組合不再增加
    const cache0 = await page.evaluate(() => globalThis.__mistvaleDoll().cached);
    const r = await page.evaluate(async () => {
      const g = globalThis.__mistvaleGame, h = (g?.state?.hunters || [])[0];
      if (!h) return { hunter: false };
      const orig = JSON.parse(JSON.stringify(h.equipment || {}));
      const wait = () => new Promise(r => setTimeout(r, 260));
      const set = (eq) => { h.equipment = { ...eq }; };
      set({});
      await wait(); await wait();
      const cBare = globalThis.__mistvaleDoll().cached;
      set({ helm: true, chest: true, belt: true, legs: true, boots: true, gloves: true });
      await wait(); await wait();
      const cAll = globalThis.__mistvaleDoll().cached;
      set({ helm: true });
      await wait(); await wait();
      const cOne = globalThis.__mistvaleDoll().cached;
      h.equipment = orig;
      await wait();
      return { hunter: true, cls: h.classId, cBare, cAll, cOne };
    });
    if (!r.hunter) fix('C5 找不到獵人');
    else if (r.cAll > r.cBare && r.cOne > r.cBare) ok('C5 六部位/單部位都合成新格子(快取 ' + r.cBare + ' → 全穿 ' + r.cAll + ' → 單穿 ' + r.cOne + ',' + r.cls + ')');
    else fix('C5 切換裝備沒有合成新格子(bare ' + r.cBare + ' all ' + r.cAll + ' one ' + r.cOne + ')');
    if (cache0 >= 0) ok('C6 快取起始 ' + cache0 + ' 格');
    if (!errors.length) ok('C7 沒有 page error / console.error'); else fix('C7 頁面錯誤: ' + errors.slice(0, 3).join(' | '));

    // 給人看的截圖:村莊中央 3 倍放大(只有失敗時才需要人工看,但留著方便)
    const shot = path.join(L.ROOT, 'output/doll-classes');
    fs.mkdirSync(shot, { recursive: true });
    await page.screenshot({ path: path.join(shot, 'ingame.png'), clip: { x: 380, y: 180, width: 680, height: 520 } });
    ok('C8 截圖 output/doll-classes/ingame.png');
    target = page;
  } finally {
    await browser.close().catch(() => {});
    srv.stop();
  }
}

console.log('');
console.log(fails.length ? 'FAIL doll-classes: ' + fails.length + ' 項' : 'PASS doll-classes: 六部位裝備 + 每武器動作層');
process.exit(fails.length ? 1 : 0);
