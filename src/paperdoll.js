// paperdoll.js — 暮影村分層角色 + 裝備動畫引擎（第 1 期）。零依賴 ES module。
//
// 移植的是 DV2 紙娃娃的「系統」（資料驅動的分層、累計結束時間表、逐 slot 繪製順序、
// 武器繞握把旋轉），不是它的素材。資料格式與所有和 DV2 不同的地方見 docs/PAPERDOLL.md。
//
// 分兩半：
//   純邏輯（node 可測）：getSlot、spriteOf、computeParts、resolveAction、actionTiming、
//                        dirIndex、migrateDir、lookFromHunter、setAction、weaponCorner、partCorners、
//                        騎乘 rideActionFor / rideDepth / mountMotion（§20）、怪物紙娃娃 computeMonsterParts（§21）
//   canvas：drawParts（只有它碰 ctx）
//
// 座標：computeParts 回傳的位置都以「腳底」為 (0,0)、單位是美術像素（1 美術 px = 資料裡的 1 單位）。
// drawParts 再依 origin（畫面上的腳底）與 scale 放大。整數像素、不插值。

/**
 * 方向。2026-11-13 起只有 4 方向（docs/DV2-ADOPTION-PLAN.md Phase 2；與 DV2 1:1）：
 * 0 上（背面）、1 右（側面）、2 下（正面）、3 左（側面鏡像）。斜向已移除：遊戲的輸入、移動、AI 朝向都量化成 4 軸。
 */
export const DIR = Object.freeze({ UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 });
export const DIR_NAMES = Object.freeze(['up', 'right', 'down', 'left']);

/**
 * @deprecated 舊的 8 方向名稱（src/pixel-world.js 以前的 DIR8，同序）。只留著讓舊呼叫端/測試的名字還能解析；
 * 新程式用 DIR / DIR_NAMES。遊戲現在只會給 side / down / sideLeft / up 四個。
 */
export const DIR8 = Object.freeze(['side', 'downRight', 'down', 'downLeft', 'sideLeft', 'upLeft', 'up', 'upRight']);

/** DV2 SPPROCTYPE_HEAD_2F_INVERSION 的頭/帽方向重映射（4 方向，DV2 原值） */
export const MIRROR = Object.freeze([1, 0, 3, 2]);

/**
 * 8 方向 → 4 方向的遷移規則（舊存檔 / 舊呼叫端的方向欄位 0..7，0..3 不變，4..7 = 舊的斜向 右上/右下/左下/左上）：
 *   0→上、1→右、2→下、3→左、4→上、5→下、6→下、7→左（docs/DV2-ADOPTION-PLAN.md §4 風險登錄）。
 * 其他整數取 mod 8 後照表；非數字回 null。
 */
export const DIR_MIGRATE_8TO4 = Object.freeze([0, 1, 2, 3, 0, 2, 2, 3]);
export function migrateDir(d) {
  if (typeof d !== 'number' || !Number.isFinite(d)) return null;
  return DIR_MIGRATE_8TO4[((Math.round(d) % 8) + 8) % 8];
}
/** 舊斜向名稱 → 4 方向（同 migrateDir：右上 4→上、右下 5→下、左下 6→下、左上 7→左） */
const LEGACY_DIAG = Object.freeze({ upRight: 0, downRight: 2, downLeft: 2, upLeft: 3 });
/** 方向名稱 → 0..3（DIR_NAMES、pixel-world 的 side/sideLeft、舊斜向名經遷移） */
export const DIR8_INDEX = Object.freeze({ up: 0, right: 1, side: 1, down: 2, left: 3, sideLeft: 3, ...LEGACY_DIAG });

/** 預設的武器/特效原點修正（DV2 §8.1：ox' = ox + (下/左 ? 1 : 0)、oy' = oy + 3）。資料可覆寫。 */
export const DV2_WEAPON_ORIGIN = Object.freeze({ dx: [0, 0, 1, 1], dy: 3 });

/* ------------------------------------------------------------------ 時間 */

/**
 * 累計結束時間表 → slot。af = [4,8,12,16] 表示 slot0 = tick 0..3、slot1 = 4..7 …，
 * 超過總長就循環（負數 tick 也正確取餘數）。
 */
export function getSlot(af, tick) {
  if (!af || !af.length) return 0;
  const last = af[af.length - 1];
  if (!(last > 0)) return 0;
  const t = Math.floor(Number(tick) || 0);
  const rem = ((t % last) + last) % last;
  for (let i = 0; i < af.length; i++) if (rem < af[i]) return i;
  return 0;
}

/** 陣列第 slot 項；超出長度就重複最後一項，空陣列回 dflt（DV2 的 clamp 規則） */
export function at(arr, slot, dflt) {
  if (!arr || !arr.length) return dflt;
  const v = arr[Math.min(slot, arr.length - 1)];
  return v === undefined || v === null ? dflt : v;
}

/** seb → 第 frame 格的 sprite [u,v,w,h,tx,ty,ru,rv]；frame 依 max 取餘數 */
export function spriteOf(seb, frame) {
  if (!seb || !seb.frames) return null;
  const max = seb.max || 1;
  const f = ((frame % max) + max) % max;
  return seb.frames[f] || seb.frames[String(f)] || null;
}

/* ------------------------------------------------------------------ 方向 */

/**
 * @deprecated 2026-11-13 起引擎本身就是 4 方向，請用 dirIndex（它也吃舊名稱）。
 * 舊介面：pixel-world 的 DIR8 名稱或 DIR8 索引（0 side、1 downRight、2 down、3 downLeft、4 sideLeft、5 upLeft、6 up、7 upRight）
 * → 4 方向；斜向退回上/下，'side' 依 facing 決定左右（facing < 0 = 朝左）。行為維持不變，只是不再被引擎使用。
 */
export function dir8to4(d, facing = 1) {
  let name = d;
  if (typeof d === 'number') name = DIR8[((Math.round(d) % 8) + 8) % 8];
  switch (String(name || '')) {
    case 'up': case 'upLeft': case 'upRight': return DIR.UP;
    case 'down': case 'downLeft': case 'downRight': return DIR.DOWN;
    case 'sideLeft': case 'left': return DIR.LEFT;
    case 'right': return DIR.RIGHT;
    case 'side': default: return facing < 0 ? DIR.LEFT : DIR.RIGHT;
  }
}

/**
 * 任何方向輸入 → 0..3。整數 0..3 直接用；舊的 4..7（斜向）與其他整數走 migrateDir；
 * 名稱：DIR_NAMES、'side'（依 facing 分左右）、'sideLeft'、舊斜向名（走遷移表）；其他退回右/左（看 facing）。
 */
export function dirIndex(d, facing = 1) {
  if (typeof d === 'number' && Number.isFinite(d)) return migrateDir(d);
  const name = String(d || '');
  if (name === 'side') return facing < 0 ? DIR.LEFT : DIR.RIGHT;
  return DIR8_INDEX[name] ?? (facing < 0 ? DIR.LEFT : DIR.RIGHT);
}

/**
 * 取這個方向的 row（4 方向，沒有斜向退回）。rows 可以是 4 項或舊包的 8 項（只用前 4 項）；
 * 這個方向沒有列（null/缺）才退回右、再退回下。回傳 { row, dir }，dir 是實際用到的方向（頭的幀、特效方向都跟它走）。
 */
export function pickRow(rows, d) {
  if (!rows) return { row: null, dir: d };
  for (const t of [d, DIR.RIGHT, DIR.DOWN]) if (t >= 0 && t < 4 && rows[t]) return { row: rows[t], dir: t };
  return { row: null, dir: d };
}

/* ------------------------------------------------------------------ 動作 */

// 方向字尾容錯（舊的斜向字尾也去掉，例：walkUpRight → walk）
const DIR_SUFFIX = /(DownRight|UpRight|DownLeft|UpLeft|Down|Up|Left|Right)$/;

/** 2x rig 的動作鍵字尾（pipeline/scripts/dv2fmt/rig2x.py：每個 1x 動作一份 `<鍵>@2x`，DV2 數字 ×2、跟職業無關） */
export const RIG2X_SUFFIX = '@2x';

/**
 * 遊戲動作名 → 資料裡的動作鍵。順序：
 *   完全同名（含武器型別變體）→ 去掉方向字尾 → `<動作>.<武器型別>` → `<動作>.<型別別名>`（data.typeAlias，Phase 6 新武器型別借用既有型別的表）
 *   → `<動作>` → aliases → 'idle' → 第一個。
 * 例：resolveAction(data, 'attackDown', 'bow') → 'attack.bow'（有的話）否則 'attack'。
 * rig = 2（2x rig 職業，look.rig）：同一串候選全部加 `@2x` 字尾，只在 2x 的列裡找（不會掉進 1x 的列：圖格大小不同）；
 * 資料包沒有任何 2x 列時才照 1x 找。名字本身帶 `@2x` 時先拿掉再解析。
 */
export function resolveAction(data, name, weaponType, rig) {
  const acts = (data && data.actions) || {};
  const raw0 = String(name || '');
  const raw = raw0.endsWith(RIG2X_SUFFIX) ? raw0.slice(0, -RIG2X_SUFFIX.length) : raw0;
  const base = raw.replace(DIR_SUFFIX, '') || raw;
  const aliases = data && data.aliases || {};
  const typeAlias = weaponType && data && data.typeAlias ? data.typeAlias[weaponType] : null;
  const tries = [];
  for (const n of [raw, base, aliases[raw], aliases[base]]) {
    if (!n) continue;
    if (weaponType) tries.push(`${n}.${weaponType}`);
    if (typeAlias) tries.push(`${n}.${typeAlias}`);
    tries.push(n);
  }
  tries.push('idle');
  if (rig === 2) {
    for (const k of tries) if (acts[k + RIG2X_SUFFIX]) return k + RIG2X_SUFFIX;
  }
  for (const k of tries) if (acts[k]) return k;
  return Object.keys(acts)[0] || '';
}

/**
 * 出招計時（對應 sprites/ANIMATION_SPEC.md「出招計時合約」）：
 *   ticks      = af 最後一項（動作總長，tick）
 *   impactSlot = 命中 slot（資料 `impactSlot`；沒寫且有 releaseSlot → releaseSlot + 1，比照 `impact = release + 1`）
 *   impactTick = 命中 slot 開始的 tick = af[impactSlot-1]（slot 0 → 0）
 * 秒數 = tick / tickRate。HIT_STOP 由執行期另加，不在資料裡。
 */
export function actionTiming(data, name, weaponType, rig) {
  const key = resolveAction(data, name, weaponType, rig);
  const a = data && data.actions && data.actions[key];
  if (!a) return null;
  const rate = data.tickRate || 20;
  const af = a.af || [];
  const ticks = af.length ? af[af.length - 1] : 0;
  const startOf = s => (s == null ? null : s <= 0 ? 0 : af[Math.min(s, af.length) - 1]);
  const releaseSlot = a.releaseSlot ?? null;
  let impactSlot = a.impactSlot ?? null;
  if (impactSlot == null && releaseSlot != null && releaseSlot + 1 < af.length) impactSlot = releaseSlot + 1;
  const impactTick = startOf(impactSlot), releaseTick = startOf(releaseSlot);
  return {
    key, slots: af.length, ticks, seconds: ticks / rate, loop: !!a.loop,
    impactSlot, impactTick, impactSec: impactTick == null ? null : impactTick / rate,
    releaseSlot, releaseTick, releaseSec: releaseTick == null ? null : releaseTick / rate,
  };
}

/**
 * DV2 武器連擊（docs/PAPERDOLL.md §22，dv2-lab docs/05 §3）：`data.combos[weaponType] = { count, pool: [[動作名, 權重], …] }`。
 * 一次攻擊的每一擊各自用權重骰一個變體（劍：縦振り attack 100 / 横振り attack_h 50 / 突き attack_t 50）。
 * roll ∈ [0,1)（呼叫端給，要可重現就用種子）。沒有 combos / 這種武器沒有表 / 骰到的動作不存在 → 'attack'（舊包行為不變）。
 * 回傳動作「基底名」，照常丟給 resolveAction / actionTiming（會補 `.<weaponType>`）。
 */
export function attackVariant(data, weaponType, roll) {
  const c = data && data.combos && weaponType && data.combos[weaponType];
  const pool = c && Array.isArray(c.pool) ? c.pool.filter(([n, w]) => w > 0 && resolveAction(data, n, weaponType).split('.')[0] === n) : [];
  const total = pool.reduce((s, [, w]) => s + w, 0);
  if (!total) return 'attack';
  let x = Math.min(0.999999, Math.max(0, Number(roll) || 0)) * total;
  for (const [n, w] of pool) { if (x < w) return n; x -= w; }
  return pool[pool.length - 1][0];
}

/** 這種武器一次攻擊打幾下（DV2 chargeNumMax_）；沒有資料 = 1。 */
export function comboCount(data, weaponType) {
  const c = data && data.combos && weaponType && data.combos[weaponType];
  return c && c.count > 0 ? c.count : 1;
}

/**
 * 換動作：動作真的變了才把動作 tick 歸零（DV2 ChangeSeb：sebCnt_ = 0，animeIndex_ 不動）。
 * 回傳新物件，不改原 state。globalTick 永遠不重置。
 */
export function setAction(state, action) {
  if (state.action === action) return state;
  return { ...state, action, tick: 0 };
}

/** 前進 n tick：動作 tick 與全域 tick 一起加 */
export function advance(state, n = 1) {
  return { ...state, tick: (state.tick || 0) + n, globalTick: (state.globalTick ?? state.tick ?? 0) + n };
}

/* ------------------------------------------------------------------ 外觀 */

/**
 * 職業 → 紙娃娃配備（佔位資料用；src/pixel-data.js 的 CLASSES）。
 * 武器型別對照：archer→bow、sorcerer→staff、priest→holystaff（自己的握點表，缺的動作退回基本動作）、paladin→sword+shield、berserker→axe、assassin→dagger。
 */
export const CLASS_KIT = Object.freeze({
  archer:    { weapon: 'bow',       type: 'bow',    armor: 'leather', helmet: null,   shield: null },
  sorcerer:  { weapon: 'staff',     type: 'staff',  armor: 'mantle',  helmet: null,   shield: null },
  priest:    { weapon: 'holystaff', type: 'holystaff', armor: 'mantle',  helmet: null,   shield: null },
  paladin:   { weapon: 'sword',     type: 'sword',  armor: 'plate',   helmet: 'helm', shield: 'round' },
  berserker: { weapon: 'axe',       type: 'axe',    armor: 'leather', helmet: null,   shield: null },
  assassin:  { weapon: 'dagger',    type: 'dagger', armor: 'leather', helmet: null,   shield: null },
  // 不在 CLASSES 裡的舊職業 id（存檔/流浪英雄可能還有），一樣有紙娃娃，不退回 sheet
  darkknight:{ weapon: 'sword',     type: 'sword',  armor: 'plate',   helmet: 'helm', shield: 'round' },
  // 戰士：DV2 六層自己一套美術（output/dv2fmt/work/warrior 產生），沒有護甲/披風/盾
  warrior:   { weapon: 'sword',     type: 'sword',  armor: null,      helmet: 'helm', shield: null },
  // 旅人（2026-11-14,exp/lpc-hero）：赤手空拳，美術來自 LPC 13 列 sheet（assets/heroes/traveler.*），
  // DV2 資料包沒有 body skin，所以 drawDollHero 會走 covers() 的 false 分支直接畫 sheet。
  // 這裡給一個空手 kit 只是讓 `lookFromHunter covers every class in CLASSES` 過關；
  // 沒有武器可以穿，所以六格裝備也不對應任何武器外觀。
  traveler:  { weapon: null,       type: null,    armor: 'leather', helmet: null,   shield: null },
});

/** 只畫 DV2 部位（body／hand／helmet=帽子／head／weapon／effect）的職業：不畫護甲／披風／盾。先做戰士（狂戰士）試看，確認後再擴到全部職業。 */
export const DV2_PARTS_ONLY = new Set(['berserker', 'warrior']);

/** 六部位裝備層（docs/PAPERDOLL-EQUIPMENT-6.md）。由內到外：腿、靴、腰、胸、手、頭。 */
export const GEAR_SLOTS = Object.freeze(['helm', 'chest', 'belt', 'legs', 'boots', 'gloves']);

/**
 * 獵人 → 紙娃娃外觀（look）。
 *   equipment.weapon = 精良武器 → `<武器>_fine`；沒有 → 基本武器（職業武器一直都在手上）。
 *   weaponLevel      → 原樣帶出（0..10）。
 * 資料包有 meta.kits 時走「六部位裝備」：equipment.helm/chest/belt/legs/boots/gloves 各自穿脫，
 * look 的每個部位一格外觀名（null = 不畫）。舊存檔只有 equipment.armor 一件時視為六件全穿。
 * 沒有 meta.kits 的舊資料包（assets/paperdoll/ 佔位圖）維持原本 armor/helmet/shield 對照。
 * data 有給的話會檢查 skin 是否存在，缺的層改成 null（不畫），未知職業退回 data.meta.defaultClass。
 */
export function lookFromHunter(h, data) {
  const look = lookFromHunter0(h, data);
  // G6 性別（docs/DV2-PHASE6.md）：h.gender 'f' → 女性頭 skin `<頭>.f`（資料包有才用，沒有就是男性頭）；身體共用（刻意不同）
  look.gender = h && h.gender === 'f' ? 'f' : 'm';
  if (!data) return look;
  // G2：獵人指定的武器（h.weaponKind，例 'rapier' / 'spear' / 'gun' / 'fist'；實驗面板或之後的裝備資料用）——資料包有這把武器才換
  const kind = h && h.weaponKind;
  if (kind && (data.weapons || {})[kind]) {
    const w = eqOf(h).weapon === true && data.weapons[kind + '_fine'] ? kind + '_fine' : kind;
    look.weapon = w; look.weaponType = data.weapons[w].type;
  }
  if (look.gender === 'f' && look.head != null && hasSkin(data, 'head', look.head + '.f')) look.head = look.head + '.f';
  // G9 2x rig：這個職業的部件裝好了（meta.rig2x[職業] = 2）→ 播 `@2x` 的列；武器/盾/帽子換成 2x 版（沒有 2x 版就不畫那一層）
  const rig = (data.meta && data.meta.rig2x && data.meta.rig2x[look.classId]) || 1;
  look.rig = rig;
  if (rig === 2) {
    // 1x 的護甲/披風圖對不上 2x 身體：2x 職業只畫 DV2 的部位（身體/手/帽子/頭/武器/特效）＋盾（2x 版）
    look.armor = null; look.cape = null;
    for (const g of GEAR_SLOTS) if (g in look) look[g] = null;
    look.weapon = weaponFor(data, look.weapon, 2);
    look.shield = look.shield == null ? null : weaponFor(data, look.shield, 2);
    look.helmet = helmetSkin(data, look.helmet, look.classId, 2);
  }
  return look;
}
const eqOf = h => (h && h.equipment) || {};

/**
 * 2x rig 的武器 id：`<id>@2x`（rig2x.py 每把有圖的武器都會出：美術代理的 2x 圖或 1x ×2）；隱藏的武器（拳、沒圖的槍）原樣；
 * 本來就是 2x 的原樣；其他（沒有 2x 版）→ null（不畫，不會拿 1x 的格畫在 2x 身上）。rig 不是 2 → 原樣。
 */
export function weaponFor(data, id, rig) {
  if (id == null || rig !== 2) return id;
  const ws = (data && data.weapons) || {};
  if (ws[id + RIG2X_SUFFIX]) return id + RIG2X_SUFFIX;
  if (ws[id] && (ws[id].hidden || ws[id].seb === 'weapon2x/std')) return id;
  return null;
}

/** 2x 帽子：舊名對照新美術（騎士的 helm → iron_helm）；`<名>@2x.<職業>`（量在這個職業頭上的美術帽）→ `<名>@2x`（1x 帽 ×2）→ null */
export const HAT_2X_FOR = Object.freeze({ helm: 'iron_helm' });
export function helmetSkin(data, name, cls, rig) {
  if (name == null || rig !== 2) return name;
  const base = String(name).split('@')[0];
  for (const n of [HAT_2X_FOR[base], base]) {
    if (!n) continue;
    if (hasSkin(data, 'helmet', `${n}${RIG2X_SUFFIX}.${cls}`)) return `${n}${RIG2X_SUFFIX}.${cls}`;
    if (hasSkin(data, 'helmet', `${n}${RIG2X_SUFFIX}`)) return `${n}${RIG2X_SUFFIX}`;
  }
  return null;
}

function lookFromHunter0(h, data) {
  const eq = eqOf(h);
  const kits = (data && data.meta && data.meta.kits) || null;
  let cls = String((h && h.classId) || '');
  const fallback = (data && data.meta && data.meta.defaultClass) || 'berserker';
  const known = (kits ? !!kits[cls] : !!CLASS_KIT[cls]);
  if (!known || (data && !hasSkin(data, 'body', cls))) cls = fallback;
  const lv = Math.max(0, Math.min(10, Math.floor(Number(h && h.weaponLevel) || 0)));

  if (kits && kits[cls]) {
    const k = kits[cls];
    const look = {
      classId: cls,
      body: k.body != null ? k.body : cls,
      hand: k.hand != null ? k.hand : null,
      head: k.head != null ? k.head : null,
      // 披風不是六格裝備也不是 DV2 原有的層（DV2 只有身體/手/帽子/頭/武器/特效），
      // 是迷霧村自己在 layers 加的背影層：equipment.cape === true 就穿，資料包沒 skin 時下面會變 null。
      cape: eq.cape === true ? (k.cape != null ? k.cape : 'cloak') : null, armor: null, helmet: null,
      // 盾不是六格裝備：kits 沒寫就沿用 CLASS_KIT（聖騎士的圓盾），下面的 hasSkin 會把資料包沒有的拿掉
      shield: k.shield !== undefined ? k.shield : (CLASS_KIT[cls] ? CLASS_KIT[cls].shield : null),
      weapon: eq.weapon === true ? k.weapon + '_fine' : k.weapon,
      weaponType: k.weaponType || (data && data.weapons && data.weapons[k.weapon] ? data.weapons[k.weapon].type : null),
      weaponLevel: eq.weapon === true ? lv : 0,
    };
    let anySlot = false;
    for (const slot of GEAR_SLOTS) if (eq[slot] === true) { look[slot] = k[slot] != null ? k[slot] : null; anySlot = true; }
    // 舊存檔（2026-11-13 以前）只有一件 equipment.armor：視為六件全穿，不能因為改版變弱。
    if (!anySlot && eq.armor === true) for (const slot of GEAR_SLOTS) look[slot] = k[slot] != null ? k[slot] : null;
    if (data) {
      for (const layer of Object.keys(look)) {
        if (layer === 'weapon' || layer === 'classId' || layer === 'weaponType' || layer === 'weaponLevel') continue;
        if (look[layer] != null && !hasSkin(data, layer, look[layer])) look[layer] = null;
      }
      if (!(data.weapons || {})[look.weapon]) look.weapon = (data.weapons || {})[k.weapon] ? k.weapon : null;
    }
    return look;
  }

  const kit = CLASS_KIT[cls] || CLASS_KIT.berserker;
  const weapon = kit.weapon + (eq.weapon === true ? '_fine' : '');
  // 存檔 v3 起裝備是 EQUIP_SLOTS（weapon + 六格）；舊存檔只有 armor。規則同 pixel-world.js gearWorn：
  // 六格任一有穿（或舊的 armor:true）= 穿著護甲；頭盔看 helm（舊的 armor:true 視為六件全穿，含頭）。
  // 資料包沒有這個護甲/頭盔的 skin 時，下面的 hasSkin 會把它改成 null（DV2 包目前不出佔位護甲）。
  const legacyArmor = eq.armor === true;
  // 只畫 DV2 原有的部位（身體／手／帽子／頭／武器／武器特效，DV2 part id 0–5）：護甲、披風、盾這些迷霧村自加的層不畫、不換裝。
  // 2026-11-14 使用者：「取消多部位顯示換裝，只要跟 dv2 一樣的部位顯示…先做戰士出來看看」→ 先只套 DV2_PARTS_ONLY 裡的職業。
  const dv2Only = DV2_PARTS_ONLY.has(cls);
  const armorWorn = !dv2Only && (legacyArmor || GEAR_SLOTS.some(s => eq[s] === true));
  const helmWorn = legacyArmor || eq.helm === true;
  const look = {
    classId: cls,
    body: cls, hand: cls, head: cls,
    armor: armorWorn ? armorSkin(data, kit.armor, cls) : null,
    helmet: helmWorn ? kit.helmet : null,
    shield: dv2Only ? null : kit.shield,
    // 披風：迷霧村自加的背影層（DV2 沒有這一層），equipment.cape === true 才穿
    cape: !dv2Only && eq.cape === true ? 'cloak' : null,
    weapon,
    weaponType: kit.type,
    weaponLevel: eq.weapon === true ? lv : 0,
  };
  if (data) {
    for (const layer of ['body', 'hand', 'head', 'armor', 'helmet', 'shield', 'cape']) {
      if (look[layer] != null && !hasSkin(data, layer, look[layer])) look[layer] = null;
    }
    if (!(data.weapons || {})[look.weapon]) look.weapon = (data.weapons || {})[kit.weapon] ? kit.weapon : null;
  }
  return look;
}

/**
 * 每職業一套護甲（docs/DV2-ADOPTION-PLAN.md 決策「開放問題 3」）：skins.armor 的鍵是 `<套>.<職業>`（例 `plate.paladin`），
 * 資料包沒有這個職業的版本就退回共用的 `<套>`（例 `plate`）。沒給 data 時回傳 `<套>`（不知道包裡有什麼）。
 */
export function armorSkin(data, set, cls) {
  if (set == null) return null;
  const key = `${set}.${cls}`;
  if (data && hasSkin(data, 'armor', key)) return key;
  return set;
}

function hasSkin(data, layer, variant) {
  return !!(data.skins && data.skins[layer] && data.skins[layer][variant]);
}

/* ------------------------------------------------------------------ 核心：算部件 */

/**
 * 依 state 算出這一幀要畫的部件，回傳陣列（順序 = 繪製順序）。不需要 canvas。
 *
 * state = {
 *   action: 'attack',        // 動作名（走 resolveAction，可帶方向字尾）
 *   dir: 0..3 | 方向名稱,     // 見 DIR；名稱/舊的 0..7 經 dirIndex（facing 決定 side 的左右、斜向走 migrateDir）
 *   facing: 1 | -1,
 *   tick: 0,                 // 動作 tick（換動作歸零），決定 slot
 *   globalTick: tick,        // 全域 tick（不歸零），只用在 headMirror 條件
 *   look: { body, hand, head, armor, helmet, shield, cape, weapon, weaponType },
 *   face: null,              // 頭部 seb 覆寫（表情）
 *   hideWeapon: false,
 * }
 *
 * 每筆：{ layer, kind, seb, frame, slot, skin:{img,x,y}|null, sprite:[u,v,w,h,tx,ty,ru,rv],
 *         x, y, deg, pivot }
 *   一般層：畫在 (x+tx, y+ty)；武器：以 (x,y) 為基點、繞 pivot 旋轉 deg 度（見 weaponCorner）。
 * 陣列另外帶 .action（解析後的動作鍵）、.dir（實際用到的方向）、.wantDir（要求的方向）、.slot。
 */
export function computeParts(data, state) {
  if (!data || !state) return [];
  const look = state.look || {};
  const actKey = resolveAction(data, state.action, look.weaponType, look.rig);
  const act = data.actions && data.actions[actKey];
  if (!act) return [];
  const want = dirIndex(state.dir, state.facing);
  const { row, dir } = pickRow(act.rows, want);
  if (!row) return [];
  const slot = getSlot(act.af, state.tick || 0);
  const parts = row.parts || {};
  const layers = data.layers || {};
  const sebs = data.sebs || {};
  const skins = data.skins || {};

  const wo = data.weaponOrigin || DV2_WEAPON_ORIGIN;
  const oxp = at(wo.dx, dir, 0);
  const effDirs = (data.meta && data.meta.effectDirs) || 4;
  const oyp = wo.dy || 0;
  const gt = state.globalTick ?? state.tick ?? 0;
  const dirHead = act.headMirror && gt >= 1 ? MIRROR[dir] : dir;

  const order = effectiveOrder(data, row, slot, look);
  const out = [];
  for (const name of order) {
    if (name == null) continue;
    const def = layers[name];
    if (!def) continue;
    const kind = def.kind;
    const p = partFor(parts, layers, name);
    const rec = { layer: name, kind, seb: null, frame: 0, slot, skin: null, sprite: null, x: 0, y: 0, deg: 0, pivot: null };

    if (kind === 'slot' || kind === 'dir') {
      const variant = look[name];
      if (variant == null) continue;
      if (!p) continue;
      let seb = p.seb;
      if (kind === 'dir' && name === (data.faceLayer || 'head')) {
        if (state.face != null) seb = state.face;
        else if (act.headSeb) seb = act.headSeb;
      }
      // 2x rig 的列跟職業無關：身體/手的 seb 名稱帶 `{v}`，換成這一層的外觀名（= 職業），每個 2x 職業用自己的格（rig2x.py）
      if (typeof seb === 'string' && seb.includes('{v}')) seb = seb.replace('{v}', variant);
      rec.seb = seb;
      rec.frame = kind === 'slot' ? slot : dirHead;
      const off = at(p.off, slot, ZERO);
      rec.x = off[0]; rec.y = off[1];
      rec.skin = (skins[name] && skins[name][variant]) || null;
      rec.sprite = spriteOf(sebs[seb], rec.frame);
    } else if (kind === 'weapon') {
      const w = look[name] == null ? null : (data.weapons || {})[look[name]];
      if (!w || !p || state.hideWeapon || w.hidden || at(p.show, slot, 0) === 0) continue;
      rec.seb = w.seb || at(p.seb, slot, null);
      rec.frame = at(p.sebF, slot, 0) * 2 + (at(p.inv, slot, 0) === 1 ? 1 : 0);
      rec.deg = at(p.deg, slot, 0);
      rec.pivot = w.handle || [0, 0];
      const off = at(p.off, slot, ZERO);
      rec.x = oxp + off[0]; rec.y = oyp + off[1];
      rec.skin = (skins[name] && skins[name][w.skin]) || null;
      rec.sprite = spriteOf(sebs[rec.seb], rec.frame);
    } else if (kind === 'effect') {
      if (!p || at(p.act, slot, 0) === 0) continue;
      const type = at(p.type, slot, null);
      const fx = (data.effects || {})[type];
      if (!fx) continue;
      rec.seb = fx.seb;
      rec.frame = at(p.sebF, slot, 0) * effDirs + dir;   // effectDirs 4（DV2 包）；舊佔位包 8 也照用（只用前 4 欄）
      const off = at(p.off, slot, ZERO);
      rec.x = oxp + off[0]; rec.y = oyp + off[1];
      rec.skin = (skins[name] && skins[name][fx.skin]) || null;
      rec.sprite = spriteOf(sebs[rec.seb], rec.frame);
    } else continue;

    if (rec.sprite) out.push(rec);
  }
  // ｼﾞｬﾝﾌﾟ万歳（Phase 6）：整段一個拋物線（act.hop = 最高點的美術 px，我們的數字；DV2 的跳躍是程式做的，資料裡沒有）
  if (act.hop) {
    const total = act.af[act.af.length - 1] || 1, k = ((((state.tick || 0) % total) + total) % total) / total;
    const dy = Math.round(act.hop * 4 * k * (1 - k));
    if (dy) for (const r of out) r.y -= dy;
  }
  out.action = actKey; out.dir = dir; out.wantDir = want; out.slot = slot;
  // G5 石化：引擎層色調（所有圖層、所有職業/裝備都適用；drawParts 畫的時候套 tintPixels）。動作的 tint 或 state.tint（面板/遊戲強制）
  out.tint = state.tint || act.tint || null;
  return out;
}

/**
 * 色調（純邏輯，node 可測）：直接改 RGBA 位元組陣列。'stone' = 石化：亮度（Rec.601）壓到灰石色帶、微帶冷色，透明度不動。
 * 回傳同一個陣列。不認得的 tint 不動。
 */
export const TINTS = Object.freeze(['stone']);
export function tintPixels(px, tint) {
  if (tint !== 'stone' || !px) return px;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const g = 46 + y * 0.62;                       // 灰石：暗部不會全黑、亮部不會發白
    px[i] = Math.min(255, Math.round(g * 0.96)); px[i + 1] = Math.min(255, Math.round(g * 0.98)); px[i + 2] = Math.min(255, Math.round(g * 1.04));
  }
  return px;
}

const ZERO = [0, 0];

/** row.parts[name]；沒有就沿 follows 往上找（armor/hand/shield → body，helmet → head） */
function partFor(parts, layers, name) {
  let n = name;
  for (let guard = 0; n && guard < 8; guard++) {
    if (parts[n]) return parts[n];
    n = layers[n] && layers[n].follows;
  }
  return null;
}

/**
 * 這個 slot 的繪製順序（圖層名陣列，null = 這格不畫）。
 * row.order 可以是一個陣列（整列共用）或陣列的陣列（逐 slot，超出長度重複最後一個）。
 * 有穿戴、但 order 沒列到的層，若圖層定義有 attach { after | before: 錨點 }，就插在錨點旁邊。
 */
export function effectiveOrder(data, row, slot, look = {}) {
  const raw = row.order || [];
  const base = Array.isArray(raw[0]) ? at(raw, slot, []) : raw;
  const order = base.slice();
  const layers = data.layers || {};
  for (const [name, def] of Object.entries(layers)) {
    if (!def.attach || order.includes(name) || look[name] == null) continue;
    const anchor = def.attach.after || def.attach.before;
    const i = order.indexOf(anchor);
    if (i < 0) continue;
    order.splice(def.attach.after ? i + 1 : i, 0, name);
  }
  return order;
}

/* ------------------------------------------------------------------ 幾何（測試與除錯框線用） */

/** 順時針（canvas 座標，y 向下）旋轉 */
function rot(deg, x, y) {
  if (!deg) return [x, y];
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  // 0/90/180/270 時把 1e-16 級的誤差收掉
  const R = v => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : v);
  return [R(x * c - y * s), R(x * s + y * c)];
}

/**
 * 武器精靈「自身左上角」在腳底座標的位置：base + R(deg)·((tx,ty) − pivot)（SPEC §8.5）。
 * inv（水平翻轉）發生在精靈自己的框內，不影響這個角落。
 */
export function weaponCorner(rec) {
  const [, , , , tx, ty] = rec.sprite;
  const [px, py] = rec.pivot || ZERO;
  const [dx, dy] = rot(rec.deg, tx - px, ty - py);
  return [rec.x + dx, rec.y + dy];
}

/** 部件四個角（腳底座標，順序：左上、右上、右下、左下；武器已旋轉） */
export function partCorners(rec) {
  const [, , w, h, tx, ty] = rec.sprite;
  if (rec.kind === 'weapon') {
    const [px, py] = rec.pivot || ZERO;
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([cx, cy]) => {
      const [dx, dy] = rot(rec.deg, tx - px + cx, ty - py + cy);
      return [rec.x + dx, rec.y + dy];
    });
  }
  const x0 = rec.x + tx, y0 = rec.y + ty;
  return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
}

/* ------------------------------------------------------------------ canvas */

/**
 * 依序畫出 computeParts 的結果。
 * @param ctx     CanvasRenderingContext2D
 * @param parts   computeParts() 的回傳
 * @param images  { 圖片鍵: HTMLImageElement | ImageBitmap | canvas }（鍵 = skin.img）
 * @param origin  畫面上腳底的位置（畫面 px）
 * @param scale   畫面 px / 美術 px（建議整數）
 */
export function drawParts(ctx, parts, images, origin = { x: 0, y: 0 }, scale = 1) {
  if (parts && parts.tint && TINTS.includes(parts.tint) && !parts.tinting) return drawTinted(ctx, parts, images, origin, scale);
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (const rec of parts) {
    const skin = rec.skin;
    const img = skin && images && images[skin.img];
    if (!img) continue;
    const [u, v, w, h, tx, ty, ru, rv] = rec.sprite;
    // skin.scale：圖片以「每 scale 個美術 px 一個圖片 px」存（佔位圖 scale 2，解碼後記憶體少 4 倍）；座標仍是美術 px
    const sc = skin.scale || 1;
    const sx = ((skin.x || 0) + u) / sc, sy = ((skin.y || 0) + v) / sc;
    ctx.save();
    if (rec.kind === 'weapon') {
      const [px, py] = rec.pivot || ZERO;
      ctx.translate(Math.round(origin.x + rec.x * scale), Math.round(origin.y + rec.y * scale));
      ctx.scale(scale, scale);
      if (rec.deg) ctx.rotate((rec.deg * Math.PI) / 180);
      ctx.translate(tx - px, ty - py);
    } else {
      ctx.translate(Math.round(origin.x + (rec.x + tx) * scale), Math.round(origin.y + (rec.y + ty) * scale));
      ctx.scale(scale, scale);
    }
    if (ru || rv) { ctx.translate(ru ? w : 0, rv ? h : 0); ctx.scale(ru ? -1 : 1, rv ? -1 : 1); }
    ctx.drawImage(img, sx, sy, w / sc, h / sc, 0, 0, w, h);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

/**
 * 色調版 drawParts：先把整個角色畫進一張暫存畫布、整張套 tintPixels、再貼回去（所以色調蓋到所有圖層，跟裝備無關）。
 * 沒有辦法開暫存畫布（沒有 document / OffscreenCanvas）或讀不回像素（汙染的畫布）時照原色畫，不會壞。
 */
function drawTinted(ctx, parts, images, origin, scale) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of parts) for (const [x, y] of partCorners(p)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const plain = Object.assign(parts.slice(), { tinting: true });
  if (!Number.isFinite(x0)) return drawParts(ctx, plain, images, origin, scale);
  x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
  const w = Math.max(1, Math.ceil(x1) + 1 - x0), h = Math.max(1, Math.ceil(y1) + 1 - y0);
  let cv = null;
  try {
    cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
      : (ctx.canvas && ctx.canvas.ownerDocument ? Object.assign(ctx.canvas.ownerDocument.createElement('canvas'), { width: w, height: h }) : null);
  } catch { cv = null; }
  const c2 = cv && cv.getContext('2d');
  if (!c2) return drawParts(ctx, plain, images, origin, scale);
  drawParts(c2, plain, images, { x: -x0, y: -y0 }, 1);
  try { const id = c2.getImageData(0, 0, w, h); tintPixels(id.data, parts.tint); c2.putImageData(id, 0, 0); }
  catch { return drawParts(ctx, plain, images, origin, scale); }
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, Math.round(origin.x + x0 * scale), Math.round(origin.y + y0 * scale), w * scale, h * scale);
  ctx.imageSmoothingEnabled = prevSmooth;
}

/** 資料裡所有圖片鍵 → 檔名（相對於 JSON 所在資料夾） */
export function imageFiles(data) {
  return Object.assign({}, (data && data.images) || {});
}

/* ------------------------------------------------------------------ 騎乘（DV2 C1，docs/PAPERDOLL.md §20） */

/** 我們的 4 方向 → 借用哪一個 DV2 方向的數字（docs/DV2-ADOPTION-PLAN.md §0.1：up←d0、right←d1、down←d1、left←d2） */
export const DV2_DIR4 = Object.freeze([0, 1, 1, 2]);

/**
 * 騎乘深度（DV2 Proc_updateDrawDepth）：騎乘者深度 = 坐騎深度 + (direct 是 RIGHT(1) 或 DOWN(2) ? −1 : +1)。
 * −1 = 騎乘者畫在坐騎後面（被坐騎蓋住腳）、+1 = 畫在前面。我們的方向先經 DV2_DIR4 換成 DV2 的 direct 再套規則
 * （跟武器角度/翻面同一套對照）⇒ 上 +1、右 −1、下 −1、左 −1（左借 d2 = DV2 的 DOWN）。
 */
export const RIDE_DEPTH = Object.freeze(DV2_DIR4.map(d => (d === 1 || d === 2 ? -1 : 1)));
export function rideDepth(dir, facing = 1) {
  const d = dirIndex(dir, facing);
  return RIDE_DEPTH[d] ?? -1;
}

/** 坐騎上的兩種姿勢（DV2 乗る_座る / 乗る_立つ）；坐騎表（assets/mounts.json）每個物種選一種 */
export const RIDE_SEATS = Object.freeze(['sit', 'stand']);

/**
 * 遊戲姿勢 → 騎乘動作（DV2 騎乘動作組）：
 *   windup / strike（普攻）→ ride_charge2（乗る_攻撃2，spProcType RIDECHARGE2）
 *   skill               → ride_charge_<seat>（乗る_攻撃_座る/立つ：坐騎衝撞）
 *   其他（待機/走路/受擊/歡呼）→ ride_<seat>（乗る_座る/立つ；走路動畫由坐騎播）
 * 倒地不會騎（遊戲在倒地時自動下坐騎）。
 */
export function rideActionFor(pose, seat) {
  const s = seat === 'stand' ? 'stand' : 'sit';
  const p = String(pose || '');
  if (p === 'windup' || p === 'strike') return 'ride_charge2';
  if (p === 'skill') return `ride_charge_${s}`;
  return `ride_${s}`;
}

/** DV2 SEB_M_* 怪物動作（WALK=0 … DIE=7），單層怪物紙娃娃與坐騎共用 */
export const SEB_M = Object.freeze(['walk', 'stand', 'charge', 'charge2', 'damage', 'ride', 'down', 'die']);

/**
 * 騎乘者在播 riderKey 的第 tick 個 tick 時，坐騎要播什麼（SEB_M 名稱 + 該段的進度 k 0..1；循環動作 k = null）：
 *   ride_charge*（含 spProc 4 RIDECHARGE2）：release 之前 = 'charge'（坐騎蓄力）、之後 = 'charge2'（坐騎出手），跟騎乘者同一個 release 對齊
 *   其他騎乘動作：移動中 'walk'、停著 'stand'
 */
export function mountMotion(data, riderKey, tick, moving) {
  const a = data && data.actions && data.actions[riderKey];
  const base = String(riderKey || '').split('.')[0];
  if (!a || !(base.startsWith('ride_charge') || a.spProc === 4)) return { seb: moving ? 'walk' : 'stand', k: null };
  const af = a.af || [1], total = af[af.length - 1] || 1;
  const rel = a.releaseSlot ? af[Math.min(a.releaseSlot, af.length) - 1] : 0;
  const t0 = Math.floor(Number(tick) || 0);
  const t = a.loop ? ((t0 % total) + total) % total : Math.max(0, Math.min(total - 1, t0));
  if (t < rel) return { seb: 'charge', k: t / rel };
  return { seb: 'charge2', k: (t - rel) / Math.max(1, total - rel) };
}

/* ------------------------------------------------------------------ 單層怪物紙娃娃（DV2 C2，docs/PAPERDOLL.md §21） */

/**
 * 怪物紙娃娃（DV2：每隻怪物一張「4×4 虛擬表」、單一圖層、動作腳本依尺寸共用）。資料包是同一個 mistvale-paperdoll 格式
 * （assets/monsterdoll/monsterdoll.json，pipeline/scripts/dv2fmt/build_monster_pack.py 從 assets/monsters3 轉出來）：
 * 一個 `body` 圖層、動作鍵 `<物種>/<SEB_M 名稱>`、每動作 4 列（上/右/下/左），跟英雄走同一個 computeParts。
 * state = { action: SEB_M 名稱或索引, dir: 0..3 | 方向名, facing, tick }。物種或動作不存在 → []（不退回別的物種）。
 */
export function computeMonsterParts(pack, species, state = {}) {
  const seb = typeof state.action === 'number' ? SEB_M[state.action] : String(state.action || '');
  const key = `${species}/${seb}`;
  if (!pack || !pack.actions || !pack.actions[key]) return [];
  return computeParts(pack, { ...state, action: key, look: { body: species } });
}

/** 怪物包：第 frame 格開始的 tick（af 是累計結束時間；超出就停在最後一格） */
export function monsterFrameTick(pack, species, seb, frame) {
  const a = pack && pack.actions && pack.actions[`${species}/${seb}`];
  if (!a) return 0;
  const f = Math.max(0, Math.min(a.af.length - 1, Math.floor(frame || 0)));
  return f ? a.af[f - 1] : 0;
}
