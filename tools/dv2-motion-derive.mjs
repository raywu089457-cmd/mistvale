// dv2-motion-derive.mjs — 開發用工具：從本機的 DV2 kit 讀「動作結構」，寫成暮影村自己的動作表數字
// （output/dv2fmt/work/actions_base.json）。
//
//   DV2_KIT_DIR=<kit 資料夾> node tools/dv2-motion-derive.mjs        # 預設路徑同 test-paperdoll.mjs 的對照測試
//
// 版權規則（docs/PAPERDOLL.md §0、sprites/DV2_FORMAT_SPEC.md §0）：kit 的圖、seb、TSV 不進 repo。
// 這支工具只在執行時從 repo 外的 kit 路徑讀 data.js（記憶體），輸出的只有「衍生數字」：
// 每個動作的 slot 數與 af、每格用我們哪一個身體格、武器畫面方向（DV2 的 sebF 欄底角 + deg，換算成我們單一直立武器圖的 deg）、
// inv / 顯示旗標、每方向繪製順序、特效 slot / sebF / 相對英雄位置、頭部表情、loop。
// 握點（wh/oh）與頭的脖子位置不從 DV2 拿：沿用 actions_base.json 原本的（我們的美術量的），apply_actions_class.py 再用 fists.json 覆蓋。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = process.env.DV2_KIT_DIR || 'C:/Users/ray/Desktop/Claude code/dv2-lab/kit';
const BASE = path.join(ROOT, 'output/dv2fmt/work/actions_base.json');
const sb = { window: {} };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(KIT, 'data/data.js'), 'utf8'), sb);
const DV2 = sb.window.DV2;
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));

/* ---------------------------------------------------------------- 對照（我們決定的，不是 DV2 的資料） */
// DV2 的 4 個方向是等角的四個斜向：d0 背面（右上）、d1 正面鏡像（右下）、d2 正面（左下）、d3 背面鏡像（左上）。
// 2026-11-13 起遊戲是 4 方向（docs/DV2-ADOPTION-PLAN.md §0.1 凍結表）：我們的 4 方向 → 取哪一個 DV2 方向的動作數字。
// 2026-11-14 修正：改成 1:1 對照（up←d0 背面、right←d1 側面、down←d2 正面、left←d3 側面鏡像）。
// 舊表 [0,1,1,2]（down 借 d1、left 借 d2）是 8 向時代的權宜：畫面是正面卻用側面的武器角度/翻轉，視覺 QA 抓到
// 劍在收招時垂到腳邊、方向也反了。我們的四向美術本來就是 DV2 d0/d1/d2/d3（d3 = side + ru 鏡像），所以可以直接對照。
const DIRS = ['up', 'right', 'down', 'left'];
const DV2_DIR = [0, 1, 2, 3];
// 揮擊類 set：左向由右向鏡像（見 dirs 組裝後的說明）。20 縱斬、21 縱斬複本、22 橫斬、23 突刺、24 弓、31 騎乘普攻；
// Phase 6：18/19 拳（特效位置）、25 銃（槍在近側的手）同理
const SWING_SETS = new Set([18, 19, 20, 21, 22, 23, 24, 25, 31]);
// 其中武器握點改用我們自己量的拳頭的 set（見 slots 內說明）。22 橫斬不在內：我們的橫斬 strike0 手在頭後，量到的握點會讓直立的劍蓋住臉，
// DV2 的握點（臉旁、往前上方）反而對（2026-11-14 逐動作稽核的前後對照）。31 騎乘普攻也不在內：身體是同一張跪姿、我們量的握點四格都一樣，
// 武器會定住不動，DV2 每格移動的握點才做出揮擊。24 弓兩種都對得上，維持 DV2。
const OWN_GRIP_SETS = new Set([20, 21, 23]);
const BACK = new Set([0]);   // 背面美術（盾在身體後面）
// DV2 身體格（每個動作只用 1–3 種姿勢）→ 我們的身體格。比 DV2 多的格子不用（walk1/walk3、strike0 在 set20 不用…）。
const CELLS = {
  3: ['stand0', 'stand1'],                     // 武器持ち立ち：站、呼吸
  // 走路（2026-11-14 修）：DV2 的 walk00.seb 四格 u = 0/60/0/90，第 0、2 格共用同一張圖（DV2 的 cell0 同時是站姿），
  // 所以舊表把第 0/2 格對到我們的 stand0 —— 但我們的 stand0 是「雙腳併攏的待機姿」，結果一輪四格有兩格在站著、walk3 永遠不播，
  // 遊戲裡看起來就是「站著滑行」。我們的美術是完整的四格走路循環（walk0 跨步、walk1 過渡、walk2 另一邊跨步、walk3 過渡），
  // 所以照我們自己的循環走：四格全用 walk0..walk3。
  2: ['walk0', 'walk1', 'walk2', 'walk3'],
  20: ['windup', 'windup', 'strike1', 'strike1'], // 剣_縦振り：舉起 ×2（武器從背後甩到頭上）→ 揮下 ×2
  22: ['windup', 'strike0', 'strike0'],          // 剣_横振り：預備 → 橫掃 ×2
  23: ['windup', 'thrust', 'thrust'],            // 剣_突き：收回 → 刺出 ×2
  24: ['aim1', 'aim0', 'aim0'],                  // 弓：拉滿（箭在弦上）→ 放箭後 ×2
  28: ['aim0', 'cast0'],                         // 魔法演唱：杖前舉 → 雙手高舉
  15: ['hurt'],                                  // ダメージ
  14: ['lying'],                                 // ダウン
  11: ['stand0', 'victory1'],                    // 万歳：站 → 舉起
  // 騎乘（docs/DV2-ADOPTION-PLAN.md Phase 5.1，C1）。DV2 有自己的騎乘身體格（乗る_座る/立つ、rideCharge_sit…）；我們沒有坐姿美術，
  // 採保守對照：「坐」= 我們的 kneel（膝蓋彎、身體低，腿被坐騎身體蓋住）、「站」= stand0。DV2 每組騎乘動作所有 slot 都是同一個身體格，這裡也一樣。
  16: ['kneel', 'kneel'],                       // 乗る_座る
  17: ['stand0', 'stand0'],                     // 乗る_立つ
  29: ['kneel', 'kneel'],                       // 乗る_攻撃_座る（坐騎衝撞；DV2 這組不畫武器）
  30: ['stand0', 'stand0'],                     // 乗る_攻撃_立つ
  31: ['kneel', 'kneel', 'kneel', 'kneel'],     // 乗る_攻撃2（騎乘者揮武器：DV2 身體格不變、只有武器動；spProcType RIDECHARGE2 = 4）
  // Phase 6（docs/DV2-PHASE6.md G1，2026-11-14）：補齊其餘 17 組。寫法 '<1x 身體格>:<2x 姿勢>'：
  // 1x 職業沒有新美術 → 用最接近的既有格（冒號前）；2x rig（rig2x.py）用冒號後的姿勢部件，缺圖時依 POSE_PART 的退回鏈（最後一定是 stand）。
  // DV2 身體格（kit chara_body seb 的 u,v）：見每列註解；我們只照「每 slot 用哪一種姿勢」，不照 DV2 的圖。
  0: ['walk0', 'walk1', 'walk2', 'walk3'],                 // 歩き：徒手走（DV2 cell0/2/0/3 = 站-跨-站-跨；跟 set 2 一樣走我們自己的四格）
  1: ['stand0', 'stand1'],                                 // 立ち：徒手站（DV2 0,1 / 1,1 呼吸）
  4: ['victory1:carry', 'victory1:carry_walk_l', 'victory1:carry', 'victory1:carry_walk_r'],   // 物持ち歩き（DV2 0/2/0/3, row 4/5）
  5: ['victory1:carry', 'victory1:carry'],                 // 物持ち立ち（DV2 0,1 row 4/5）
  6: ['strike0:pose'],                                     // ｷﾒﾎﾟｰｽﾞ（DV2 4,0）
  7: ['hurt:cry', 'hurt:cry_b'],                           // 泣く1（DV2 4,2 / 5,2；第二格 = 同一張下沉，rig2x POSE_DY）
  8: ['kneel:cry_sit'],                                    // 泣く2（DV2 5,0）
  9: ['windup:clap0', 'windup:clap1'],                     // 拍手（DV2 4,1 / 5,1）
  10: ['windup:give0', 'thrust:give1'],                    // 物渡し（DV2 4,3 / 5,3）
  12: ['victory1'],                                        // ｼﾞｬﾝﾌﾟ万歳（DV2 6,0 = 万歳的舉起格；跳躍位移 = 我們的 hop）
  13: ['thrust:handshake'],                                // 握手（DV2 7,0，跟魔法演唱同一格）
  18: ['windup:punch0', 'thrust:punch1', 'thrust:punch1'], // ﾊﾟﾝﾁ（DV2 4,4 / 5,4 / 5,4）
  19: ['windup:punch0', 'strike0:punch2', 'strike0:punch2'], // ﾊﾟﾝﾁ2（DV2 4,4 / 6,4 / 6,4）
  21: ['windup', 'windup', 'strike1', 'strike1'],          // 剣_縦振り2（DV2 與 20 逐欄相同）
  25: ['thrust:gun', 'thrust:gun', 'thrust:gun'],          // 銃（DV2 8,6 / 8,6 / 9,6：瞄準 ×2 → 後座力，2x 同一張 swing）
  26: ['windup:guard'],                                    // ガード（DV2 7,4）
  27: ['stand0:petrify'],                                  // 石化（DV2 8,4 + stone 頭；我們：stand + 引擎灰階色調 tint:'stone'）
};
// 'cell:pose' → { cell, pose }（pose 省略 = 跟 cell 同名，rig2x 照舊表 POSE_PART 解析）
const cellOf = c => String(c).split(':')[0];
const poseOf = c => String(c).split(':')[1] || null;
// 騎乘格的脖子位置：kneel 現在沒有任何其他動作在用，表裡沒有它的脖子 → 取 sprites/DV2_FORMAT_SPEC.md §5 錨點表（kneel 的 neck，cell 座標 − 腳底 (15,30)）
const NECK_SPEC = { 'back:kneel': [0, -14], 'side:kneel': [1, -14], 'front:kneel': [0, -14] };
// 遊戲動作 → DV2 動作組（docs/PAPERDOLL.md §17 有理由）
const MAP = {
  idle: 3, walk: 2, hurt: 15, death: 14, victory: 11,
  // 攻擊：DV2 依武器的 chargeType 選動作組 —— 劍/斧/杖/短刀（盗賊のﾅｲﾌ 等）都是 SLASH(0) → 剣_縦振り(20)；弓 BOW(1) → 弓(24)。
  // 突き(23) 是 SPEAR(2)（槍、細劍）用的，我們沒有這類武器，不用。
  attack: 20, 'attack.sword': 20, 'attack.axe': 20, 'attack.staff': 20, 'attack.dagger': 20, 'attack.bow': 24,
  // 2026-11-14 武器攻擊變體（dv2-lab docs/05 §3、dv2-weapon-animation-data.json）：SLASH 武器每一擊用 chargeSelectRate_ 加權骰
  // 剣_縦振り(20) / 剣_横振り(22) / 剣_突き(23) 其中一組。普攻 attack = 20 不變；attack_h = 22、attack_t = 23 是另外兩個變體，
  // 骰哪一個由 combos（下面從武器資料推）決定。杖的變體另寫一份（遠程：沒有命中格）。
  attack_h: 22, attack_t: 23, 'attack_h.staff': 22, 'attack_t.staff': 23,
  // 技能：施法（杖）→ 魔法演唱(28)；近戰（劍/斧/短刀）→ 剣_横振り(22)，跟普攻的縱振り分得開；弓 → 弓(24)。
  skill: 22, 'skill.axe': 22, 'skill.dagger': 22, 'skill.sword': 22, 'skill.staff': 28, 'skill.bow': 24,
  // 騎乘（Phase 5.1）：坐/站 → 乗る_座る/立つ；坐騎衝撞（技能）→ 乗る_攻撃_座る/立つ；騎乘普攻 → 乗る_攻撃2（每種武器同一組，跟 DV2 一樣）
  ride_sit: 16, ride_stand: 17, ride_charge_sit: 29, ride_charge_stand: 30,
  ride_charge2: 31, 'ride_charge2.bow': 31, 'ride_charge2.staff': 31,
  // Phase 6（G1）：其餘 17 組。不拿武器的組（DV2 ball 0）只有基底名；拿武器的組（6/12/21/25/26）由 apply_actions_class.py 每種武器型別出一份握點變體。
  walk_unarmed: 0, idle_unarmed: 1, carry_walk: 4, carry: 5, pose: 6, cry: 7, cry_sit: 8, clap: 9, give: 10,
  jump_victory: 12, handshake: 13, punch: 18, punch2: 19, attack_v2: 21, 'attack_v2.staff': 21, shoot: 25, guard: 26, petrify: 27,
  // 弓的變體要走弓的翻面/欄規則（bowArt：我們的弓圖只有 待機/拉滿/放箭 三欄，DV2 劍的第 3 欄傾角在弓圖上是空的）
  'pose.bow': 6, 'jump_victory.bow': 12, 'attack_v2.bow': 21, 'shoot.bow': 25, 'guard.bow': 26,
};
// 出招計時合約（paperdoll-hero.js dollActionTick）：release = 出手那一刻開始的 slot，impact = 近戰打中那一刻開始的 slot
const TIMING = {
  attack: [1, 2], 'attack.sword': [1, 2], 'attack.axe': [1, 2], 'attack.dagger': [1, 2], 'attack.staff': [1, null], 'attack.bow': [1, null],
  // 橫斬／突刺（3 格：預備 → 出招(特效) → 收招）：release 1、近戰命中 2；杖的變體是遠程，沒有命中格
  attack_h: [1, 2], attack_t: [1, 2], 'attack_h.staff': [1, null], 'attack_t.staff': [1, null],
  skill: [1, null], 'skill.axe': [1, null], 'skill.dagger': [1, null], 'skill.sword': [1, null], 'skill.staff': [1, null], 'skill.bow': [1, null],
  // 騎乘普攻：DV2 第 0 格不畫武器（舉起前）、第 1 格起畫 → release 1；近戰命中 2；遠程（弓/杖）在 release 出手、沒有命中格。
  // 騎乘技能（坐騎衝撞）：DV2 2 格循環，release 1（第二格）。
  ride_charge2: [1, 2], 'ride_charge2.bow': [1, null], 'ride_charge2.staff': [1, null],
  ride_charge_sit: [1, null], ride_charge_stand: [1, null],
  // Phase 6：拳（DV2 PUNCH 的 hitWindow [5,8] = 近戰）、縦振り2（= 20）、銃（GUN 沒有 hitWindow = 飛行物：只有出手格）
  punch: [1, 2], punch2: [1, 2], attack_v2: [1, 2], 'attack_v2.staff': [1, null], shoot: [1, null],
};
// 我們自己的數字（DV2 kit 的 set 12 只有 1 格、沒有位移；跳躍由 DV2 程式碼做，沒有逆向）：ｼﾞｬﾝﾌﾟ万歳 整段的拋物線高度（1x px）
const HOP = { 12: 4 };
// DV2 head sebId 6 = stone（石化）→ 我們：引擎層灰階色調（docs/DV2-PHASE6.md G5），頭用 normal
const TINT_OF_HEAD = { 6: 'stone' };
// DV2 武器圖每一欄（sebF）本身就是一個畫好的傾角（0 = 朝上、順時針為正；量自 kit 的劍/杖/細劍圖）。
// 2026-11-14：我們的武器圖改成同樣的「四欄傾角」格式（output/dv2fmt/work/missing/gen_weapon_dirs.py 烘出來），
// 所以這裡直接把 DV2 的 sebF / wdeg / winv 原封不動搬過來 —— 不再用單一直立圖 + 假旋轉（那會讓武器糊掉）。
const THETA = [0, 22, 36, -20];   // 只留給文件／舊資料參考，實際動作表不再用它換算
// DV2 特效種類 → 我們的特效（0 縱斬、1 橫斬、2 突刺 = effect_thrust.png、3 拳 = effect_punch.png、4 槍火 = effect_gunfire.png）。
// Phase 6：一律寫進表；build_pack.py 只保留資料包真的有圖的特效種類（沒圖 = 那一格不畫特效，不會壞）。
const FX = { 0: 'slash', 1: 'hslash', 2: 'thrust', 3: 'punch', 4: 'gunfire' };
// DV2 head sebId → 我們的表情欄（7 cry2 → cry，Phase 6 G4；6 stone → normal + tint，見 TINT_OF_HEAD）
const FACE = { 0: 'normal', 2: 'happy', 5: 'hurt', 6: 'normal', 7: 'cry' };
const LAYER = { 0: ['body', 'armor'], 1: ['hand'], 2: ['helmet'], 3: ['head'], 4: ['weapon'], 5: ['effect'] };

/* ---------------------------------------------------------------- 我們的脖子位置（每個 view × 身體格，沿用表裡現有的） */
const neck = {};
for (const a of Object.values(base.actions)) for (const [view, sl] of Object.entries(a.views || {})) for (const s of sl) {
  const k = `${view}:${s.cell}`;
  if (!(k in neck) && s.head) neck[k] = s.head;
}
for (const [k, v] of Object.entries(NECK_SPEC)) if (!(k in neck)) neck[k] = v;

// 弓的第 2 欄（放箭）有沒有畫：weapon_bow.png 第 3 個 40px 欄有不透明像素
const HAS_BOW_RELEASE = (() => {
  const meta = path.join(ROOT, 'assets/paperdoll-dv2/src/sources.json');
  try { return !!JSON.parse(fs.readFileSync(meta, 'utf8'))['weapon_bow.png']?.releaseCol; } catch { return false; }
})();

/* ---------------------------------------------------------------- 連擊（武器資料表 weapon.txt：chargeNumMax_ / chargeSelectRate_） */
// 開發用：執行時從 repo 外讀 dv2-lab 的匯出（docs/dv2-weapon-animation-data.json），只寫衍生數字（每個武器家族的段數與 4 個權重）。
// 權重第 i 個 = SLASH 家族的動作組 20+i（20 縦振り、21 縦振り2（與 20 逐欄相同、權重恆 0）、22 横振り、23 突き），docs/05 §3。
// 我們的武器型別 → DV2 家族：劍、短刀（DV2 的 盗賊のﾅｲﾌ 是 SORD）→ SORD；斧 → AX；杖、聖杖 → WAND；弓 → BOW。
const WEAPON_DATA = process.env.DV2_WEAPON_DATA || 'C:/Users/ray/Desktop/Claude code/dv2-lab/docs/dv2-weapon-animation-data.json';
// Phase 6（G2）：細劍 RAPIR、槍 SPEAR、銃 GUN、拳 PUNCH 也照 DV2 的表推。
const FAMILY = { sword: 'SORD', dagger: 'SORD', axe: 'AX', staff: 'WAND', holystaff: 'WAND', bow: 'BOW', rapier: 'RAPIR', spear: 'SPEAR', gun: 'GUN', fist: 'PUNCH' };
// 動作組 → 我們的攻擊變體基底名（同一個 set 一個名字，跨武器一致；attack.<型別> 永遠是 縦振り(20)，弓是 弓(24)）
const VARIANT_OF_SET = { 18: 'punch', 19: 'punch2', 20: 'attack', 21: 'attack', 22: 'attack_h', 23: 'attack_t', 24: 'attack', 25: 'shoot' };
// dv2-weapon-animation-data.json attack_runtime：權重第 0 個 = chargeTypeSeb[chargeType]，第 1 個 = 20（拳 = 19），第 2 個 = 22，第 3 個 = 23
const CHARGE_TYPE_SEB = [20, 24, 23, 20, 25, 18];   // SLASH BOW SPEAR GREATSWORD GUN PUNCH（匯出檔沒有時的預設值，同 docs/05）
function deriveCombos() {
  if (!fs.existsSync(WEAPON_DATA)) { console.log('no weapon data at', WEAPON_DATA, '- keeping existing combos'); return base.combos || {}; }
  const J = JSON.parse(fs.readFileSync(WEAPON_DATA, 'utf8')), W = J.weapons;
  const ctSeb = J.attack_runtime?.chargeTypeSeb || CHARGE_TYPE_SEB;
  const out = {};
  for (const [type, fam] of Object.entries(FAMILY)) {
    const ws = W.filter(w => w.weaponTypeName === fam);
    const key = w => JSON.stringify([w.chargeType, w.chargeNumMax, w.chargeSelectRate.flat()]);
    if (!ws.length || new Set(ws.map(key)).size !== 1) throw new Error(`family ${fam}: ${ws.length} weapons, not one combo shape`);
    const w = ws[0], rates = w.chargeSelectRate.flat();
    // 權重 i 對應的動作組：0 = 這種武器的基本攻擊（chargeTypeSeb）、1 = 縦振り 20（拳：ﾊﾟﾝﾁ2 19）、2 = 横振り 22、3 = 突き 23
    const setOf = i => (i === 0 ? ctSeb[w.chargeType] : i === 1 ? (fam === 'PUNCH' ? 19 : 20) : i === 2 ? 22 : 23);
    const pool = {};
    rates.forEach((r, i) => { if (r > 0) { const a = VARIANT_OF_SET[setOf(i)]; pool[a] = (pool[a] || 0) + r; } });
    out[type] = { count: w.chargeNumMax, pool: Object.entries(pool), family: fam };
  }
  return out;
}

const norm = d => { let x = ((Math.round(d) % 360) + 360) % 360; if (x > 180) x -= 360; return x === -180 ? 180 : x; };
const rowOf = (set, d) => DV2.rows.find(r => r.set === set && r.direct === d);
const at = (arr, i, dflt) => (!arr || !arr.length ? dflt : arr[Math.min(i, arr.length - 1)] ?? dflt);

function orderFor(dv2order, ourDir, lyingSlot) {
  const out = [];
  for (const id of dv2order) {
    if (id < 0) continue;
    for (const l of LAYER[id]) {
      if (lyingSlot && (l === 'head' || l === 'helmet')) continue;   // 我們的倒地格自己帶頭
      if (l === 'body' && BACK.has(ourDir)) out.push('shield');      // 背面：盾在身體後面
      out.push(l);
      if (l === 'armor' && !BACK.has(ourDir)) out.push('shield');    // 正/側面：盾在身體前、頭後
    }
  }
  if (!out.includes('effect')) out.push('effect');   // DV2 這組沒有特效（例：魔法演唱）：我們自己的特效（法杖 burst）畫在最上層
  return out;
}

const actions = {};
for (const [name, setId] of Object.entries(MAP)) {
  const S = DV2.sets.find(s => s.id === setId);
  const cells = CELLS[setId];
  if (cells.length !== S.af.length) throw new Error(`set ${setId}: ${cells.length} cells for ${S.af.length} slots`);
  // 弓的翻面規則（DV2 弓圖朝左、我們的朝右）跟著「武器是弓」走，不是跟著動作組：騎乘普攻（31）的弓變體也要翻
  const bowArt = name.endsWith('.bow') && setId !== 24;
  const isBow = setId === 24 || bowArt;
  // 頭／帽的 1px 上下彈跳：DV2 的走路（set 2）把「身體格固定、頭/帽/武器的 offset 每格 +1 y」當成彈跳
  // （row.off[2] = -8/-7 交替、武器 = -7/-6）。取側面那列（dir 1）當基準，存成相對第 0 格的 delta。
  const rSide = rowOf(setId, 1);
  const layerOff = (li, i) => {
    const L = (rSide.off || [])[li];
    if (!L) return null;
    const a = at(L, 0, null), b = at(L, i, a);
    return a && b ? [b[0] - a[0], b[1] - a[1]] : null;
  };
  const bobOf = (i) => layerOff(2, i) || [0, 0];
  const views = {};
  for (const view of ['back', 'side', 'front']) {
    views[view] = cells.map((c, i) => {
      const cell = cellOf(c), pose = poseOf(c);
      return { cell, ...(pose ? { pose } : {}), head: neck[`${view}:${cell}`] || [0, -16], wh: [0, -10], oh: [0, -10], deg: 0, sebF: 0, fx: null, bob: bobOf(i) };
    });
  }
  const dirs = {};
  DIRS.forEach((dname, ourDir) => {
    const r = rowOf(setId, DV2_DIR[ourDir]);
    const slots = cells.map((cell, i) => {
      const col = at(r.wsebF, i, 0), inv = at(r.winv, i, 0), deg = at(r.wdeg, i, 0);
      const woff = (r.off || [])[4] ? at(r.off[4], i, null) : null;   // DV2 的武器握點（螢幕座標，已含方向與彈跳）
      const s = {
        // 弓：DV2 的弓圖三欄 = 待機／拉滿／放箭（docs/05 §5）。我們的弓圖有第 2 欄（放箭，gen_bow_release.py）才照搬，沒有就退回待機欄；
        // 其他武器：DV2 的四欄 = 四個畫好的傾角，直接對應我們的四欄
        sebF: isBow ? (col === 1 ? 1 : col === 2 && HAS_BOW_RELEASE && setId === 24 ? 2 : 0) : col,   // 放箭欄只屬於 弓(24)；騎乘普攻(31)的第 2 欄是劍的傾角，不是放箭
        deg: norm(deg),                                         // DV2 的 wdeg 只有 0/90/270 的直角旋轉，傾角已烘在圖裡
        inv: isBow ? 1 - inv : inv,                             // DV2 的弓圖朝左（弓背在左、箭頭朝左），我們的弓圖朝右：翻面旗標相反
        show: at(r.ball, i, 1) ? 1 : 0,
        fx: null,
        // 握點一律沿用「我們自己的」實測值（apply_actions_class.py 的 fists.json → views[view][slot].wh）。
        // 原本這裡會用 DV2 的 row.off[4]（woff）覆蓋掉它，結果揮砍時劍會離手、掉到膝蓋高度：
        // DV2 的 woff 是為 DV2 自己的武器圖量的（握把在格內的位置不同），我們的四欄圖混用就會位移 3–6 px，
        // 再被 deg 90° 旋轉放大。四欄傾角（sebF）與旋轉（deg）照 DV2，只有「手在哪」用我們的。
        // woff 保留在下面只作為除錯參考，不再寫進資料。
        // 2026-11-14 逐動作視覺稽核：OWN_GRIP_SETS 用我們量的拳頭位置（apply_actions_class.py → wh），DV2 握點會讓突刺的劍掉到膝蓋、
        // 和伸出的手分家；持握類（待機/走路/受傷/勝利/騎乘）照 DV2 把武器放在身體旁，改用我們的拳頭會讓直立的武器蓋住臉。
        ...(woff && !OWN_GRIP_SETS.has(setId) ? { wh: [woff[0], woff[1]], off: [woff[0], woff[1]] } : woff ? { dv2off: [woff[0], woff[1]] } : {}),
        // 不取 DV2 的 off[1]（part 1 = 手）當盾握點：DV2 的手畫在身體格上，off[1] 在全部 328 個 slot 都是 [0,0]。
        // 拿它當盾的位置會把聖騎士的圓盾畫在腳底（2026-11-14 逐動作視覺稽核）。盾一律用我們量的 oh（fists.json）。
      };
      if (at(r.wact, i, 0)) {
        const type = FX[at(r.wtype, i, 0)];
        if (type) {
          const off = at(r.weffOff, i, [0, 0]);
          s.fx = at(r.weffSebF, i, 0); s.fxType = type;
          s.fxOff = [off[0] + (DV2_DIR[ourDir] >= 2 ? 1 : 0), off[1] + 3];   // DV2 §8.1 的 ox'/oy'（我們的 weaponOrigin 是 0）
        } else s.fxMissing = at(r.wtype, i, 0);
      }
      return s;
    });
    dirs[dname] = { order: orderFor(r.order, ourDir, cells.map(cellOf).includes('lying')), slots };
  });
  // 揮擊類的「左」= 「右」的鏡像（2026-11-14 逐動作視覺稽核）。DV2 的左向是另一套圖：持武器的手在遠側，所以 DV2 左向把武器排在身體後面、
  // 角度也和右向不對稱；我們的左向是側面圖水平翻轉，持武器的手在近側。照搬 DV2 左向的順序與角度，武器會整把藏在身體後面
  // （橫斬左向 slot 1–2 看不到劍）。所以揮擊類左向一律由右向鏡像：欄位同、翻面相反、角度變號、順序同、特效位置 x 變號。弓不動（弓的翻面規則另算）。
  if (SWING_SETS.has(setId) && !isBow) {
    const R = dirs.right;
    dirs.left = {
      order: R.order.slice(),
      slots: R.slots.map((x) => ({
        ...x, inv: 1 - x.inv, deg: norm(-x.deg),
        ...(x.dv2off ? { dv2off: [-x.dv2off[0], x.dv2off[1]] } : {}),
        ...(x.off ? { off: [-x.off[0], x.off[1]], wh: [-x.off[0], x.off[1]] } : {}),
        ...(x.fxOff ? { fxOff: [-x.fxOff[0], x.fxOff[1]] } : {}),
        mirrorOf: 'right',
      })),
    };
  }
  const [rel, imp] = TIMING[name] || [null, null];
  actions[name] = {
    af: S.af.slice(), loop: !!(S.fl & 1), releaseSlot: rel, impactSlot: imp,
    head: FACE[rowOf(setId, 2).sebId[3]] || 'normal', headMirror: (S.sp & 1) === 1,
    dv2: { set: setId, ...(bowArt ? { bowArt: true } : {}) },   // bowArt：非弓動作組的弓變體也套弓的翻面/欄規則（test-paperdoll 的 kit 對照照這個比）
    ...(S.sp === 4 ? { spProc: 4 } : {}),   // DV2 spProcType 4 = RIDECHARGE2（騎乘普攻：坐騎同步播 SEB_M_CHARGE2，見 docs/PAPERDOLL.md §20）。1 = headMirror（上面）；2 魔法頭單幀沒有移植
    ...(TINT_OF_HEAD[rowOf(setId, 2).sebId[3]] ? { tint: TINT_OF_HEAD[rowOf(setId, 2).sebId[3]] } : {}),   // 石化（G5）：引擎層色調
    ...(HOP[setId] ? { hop: HOP[setId] } : {}),                                                            // ｼﾞｬﾝﾌﾟ万歳：我們的跳躍高度
    views, dirs,
  };
}
base.actions = actions;
base.combos = deriveCombos();
// 特效的方向欄（我們的特效圖每個 sebF 畫 4 欄：上 ∩、右 )、下 ∪、左 (）。DV2 的縱斬在 d0/d1 用翻面的同一張、d2/d3 用原圖 → 右/左弧；
// 橫斬（我們用同一張 slash 圖）d0/d3 背面用上弧、d1 右弧、d2 左弧。build_pack.py 依這張表生 4 方向的特效格。
// 2026-11-13 起 hslash 有自己的圖（effect_hslash.png，標準 上/右/下/左 欄）：自然欄、不再借 slash 圖。
// 只有 kit 推出來的縱斬（slash）仍用側面弧。
const COL_SLASH = { 0: 1, 1: 1, 2: 3, 3: 3 };
const HAS_HSLASH_ART = fs.existsSync(path.join(ROOT, 'assets/paperdoll-dv2/src/effect_hslash.png'));
base.fxDirCol = { slash: DV2_DIR.map(d => COL_SLASH[d]) };
base.fxAlias = {};
if (!HAS_HSLASH_ART) { base.fxDirCol.hslash = DV2_DIR.map(d => ({ 0: 0, 1: 1, 2: 3, 3: 0 })[d]); base.fxAlias.hslash = 'slash'; }   // 舊路徑：借 slash 圖
base.note = 'Mistvale action table for the DV2-format pack. Motion structure (slot count/af, pose per slot, weapon direction/inv/show, draw order, effect slots, head expression, loop) is derived from the DV2 kit by tools/dv2-motion-derive.mjs; grips (wh/oh) and neck points (head) are measured on OUR art (apply_actions_class.py + fists.json). Units: 1x DV2 px, foot = (0,0). views[view][slot] = cell/head/wh/oh (+ fx for our own effects, mirrored per direction); dirs[dir] = screen-space weapon sebF/deg/inv/show, effect, draw order (not mirrored again).';
fs.writeFileSync(BASE, JSON.stringify(base, null, 1) + '\n');
const miss = Object.entries(actions).flatMap(([k, a]) => Object.entries(a.dirs).flatMap(([d, r]) => r.slots.map((s, i) => (s.fxMissing != null ? `${k} ${d} slot${i} fx type ${s.fxMissing}` : null)))).filter(Boolean);
console.log('wrote', path.relative(ROOT, BASE), Object.keys(actions).length, 'actions');
if (miss.length) console.log('effects with no art (not drawn):', [...new Set(miss.map(m => m.replace(/ (up|right|down|left) /, ' * ')))].join('; '));
