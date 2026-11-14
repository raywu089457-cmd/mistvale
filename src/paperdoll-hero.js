// paperdoll-hero.js — 紙娃娃引擎接進遊戲英雄繪製（第 2 期）。
//
// pixel-world.js 的 drawHunterSheet 仍然用 sheetPose() 決定「現在是哪個動作、哪一刻」；
// 開了旗標（?doll=hero / ?doll=hero:paladin / globalThis.__mistvaleDoll('hero')）且該職業有紙娃娃資料時，
// 改用這裡把那一刻換成紙娃娃的 (動作, tick)，合成一張格子圖，再交回 pixel-world 用跟 sheet 一樣的方式畫
// （影子 cast、受擊閃光 tinted、點擊框、縮放）。沒開旗標時這個模組完全不做事。
//
// 純邏輯（node 可測）：parseDollSpec、dollDirName、dollActionTick、advanceNoSkip、trackAttackStamp、dollAttackVariant、
//                      dollVictoryAction / dollLifeAction（Phase 6 生活動作的遊戲接線）
// 瀏覽器：createDollHero（載資料/圖、合成並快取格子圖）
import { computeParts, drawParts, getSlot, actionTiming, lookFromHunter, resolveAction, partCorners, dirIndex, rideActionFor, attackVariant } from './paperdoll.js';

/** ?doll= 的值 → { all } | { classes:Set } | null（'1' 是實驗面板，不是英雄） */
export function parseDollSpec(v) {
  if (v == null || v === false) return null;
  const s = String(v).trim();
  if (s === 'hero' || s === 'hero:*' || s === 'heroes') return { all: true, classes: null };
  if (s.startsWith('hero:')) {
    const list = s.slice(5).split(',').map(x => x.trim()).filter(Boolean);
    return list.length ? { all: false, classes: new Set(list) } : null;
  }
  return null;
}

/**
 * sheet 路徑的方向（vdir，管上下；facing = ±1，管左右）→ 紙娃娃的 4 方向名稱（up / side / down / sideLeft）。
 * 2026-11-13 起遊戲只給 4 方向（side / down / sideLeft / up）：上下看 vdir；側面（side、sideLeft）的左右看 facing ——
 * 跟 sheet 一樣「左右由 facing 決定」，所以戰鬥中面向目標的那一側永遠是畫出來的那一側（check_facing 量的就是這個）。
 * 舊的斜向名（不會再從遊戲來）照 paperdoll.js 的遷移表：右上→上、右下/左下→下、左上→左（側面，左右看 facing）。
 */
export function dollDirName(vdir, facing) {
  const v = String(vdir || 'side');
  if (v === 'up' || v === 'upRight') return 'up';
  if (v === 'down' || v === 'downRight' || v === 'downLeft') return 'down';
  return facing < 0 ? 'sideLeft' : 'side';
}

/**
 * sheetPose 的那一刻 → 紙娃娃 (動作, tick)。全部用遊戲時間，不改遊戲的戰鬥時序，改的是美術的對時：
 *
 *   windup  ：蓄力進度 wt / windupLen → slot [0, releaseSlot)
 *   strike  ：atk = t − atkAt（未扣 HIT_STOP 的原始值）
 *             近戰（動作有 impactSlot）：atk 0 → releaseSlot 開頭；atk = hitDelay（遊戲打中的那一刻）→ impactSlot 開頭；
 *               impactSlot 開頭停 HIT_STOP；之後到 strikeEnd 線性走完剩下的 slot
 *             遠程（沒有 impactSlot）：atk 0 → releaseSlot 開頭（箭/法術在 atkAt 生出來），之後線性到 strikeEnd
 *   skill   ：sk = t − skillAt；sk = skillRelease（SKILLS[].release）→ releaseSlot 開頭；之後線性到 skillLen
 *   hurt    ：pose.hit / hurtLen 線性
 *   walk    ：sheet 走路格 i / walkFrames（sheet 的走路格本身由實際位移推進，不會滑步）
 *   idle    ：elapsed 連續播
 *   victory ：資料有 victory 動作 → cheerT / victoryLen 循環；沒有 → 衍生：skill 舉起段（slot [0, releaseSlot)）循環
 *   dead    ：資料有 death 動作 → deathT（= 8 − reviveTimer）/ deathLen 線性，播完停在最後一格（倒地）；
 *             沒有 → 衍生：hurt 最後一格，回傳 lie = 0..1（0.45 秒內倒成 90°），由呼叫端以腳底為軸旋轉整張格子圖
 *   ride    ：o.ride = 'sit' | 'stand' 時（騎乘中，§20）普攻 → ride_charge2、技能 → ride_charge_<seat>（同上的出招計時），其他 → ride_<seat> 循環
 *   都不會回 null：紙娃娃開著時沒有任何姿勢需要退回 sheet。
 *
 *   attack  ：windup / strike 用的動作基底名 = o.attack（DV2 變體 attack / attack_h / attack_t，見 dollAttackVariant），預設 'attack'。
 *             變體的 af 不同（attack [2,4,6,12]、attack_h/_t [4,8,14]），但 releaseSlot / impactSlot 都一樣是 1 / 2，上面的對時照用。
 *             騎乘中不看它（固定 ride_charge2）。
 *
 * o = { pose, i, t, atkAt, skillAt, hit, windupT, windupLen, hitDelay, strikeEnd, hitStop, skillRelease, skillLen,
 *       hurtLen, walkFrames, elapsed, seed, data, weaponType, deathT, deathLen, cheerT, victoryLen, attack }
 */
export function dollActionTick(o) {
  const data = o.data;
  const rate = data.tickRate || 20;
  const pose = String(o.pose || 'idle');
  let action;
  const has = k => !!(data.actions && data.actions[k]);
  if (pose === 'dead' || pose === 'falling') {
    const dT = Math.max(0, o.deathT || 0);
    if (has('death')) {
      const af = data.actions.death.af, total = af[af.length - 1];
      const tick = Math.min(total - 1, Math.floor(Math.min(1, dT / Math.max(0.001, o.deathLen ?? 0.96)) * (total - 0.001)));
      return { action: 'death', tick, phase: dT < (o.deathLen ?? 0.96) ? 'falling' : 'dead' };
    }
    const ht = actionTiming(data, 'hurt', o.weaponType);
    if (!ht) return null;
    return { action: ht.key, tick: ht.ticks - 1, phase: 'dead', lie: Math.min(1, dT / 0.45), derived: 'death' };
  }
  if (pose === 'victory' && !(o.ride === 'sit' || o.ride === 'stand')) {   // 騎乘中的歡呼：下面的騎乘分支（ride_<seat> 循環）
    const cT = Math.max(0, o.cheerT || 0);
    // Phase 6：o.victory = 這次歡呼要播的動作（dollVictoryAction 骰的 'jump_victory' / 'victory'）；資料包沒有就照舊
    if (o.victory && o.victory !== 'victory') {
      const vt = actionTiming(data, o.victory, o.weaponType);
      if (vt && vt.key.split('.')[0] === o.victory) return { action: vt.key, tick: Math.floor(cT * rate) % Math.max(1, vt.ticks), phase: 'victory', loop: true };
    }
    if (has('victory')) {
      const af = data.actions.victory.af, total = af[af.length - 1];
      return { action: 'victory', tick: Math.floor(cT * rate) % total, phase: 'victory', loop: true };
    }
    const st = actionTiming(data, 'skill', o.weaponType);
    if (st) {
      const a = data.actions[st.key].af, rel = st.releaseSlot ?? 1, up = Math.max(1, rel <= 0 ? a[0] : a[Math.min(rel, a.length) - 1]);
      return { action: st.key, tick: Math.floor(cT * rate) % up, phase: 'victory', loop: true, derived: 'victory' };
    }
  }
  // 騎乘（docs/PAPERDOLL.md §20）：o.ride = 'sit' | 'stand'（坐騎表的姿勢）。普攻 → ride_charge2、技能 → ride_charge_<seat>，
  // 走同一套出招計時（release 在 atkAt、近戰命中格不早於 hitDelay）；其他姿勢（待機/走路/受擊/歡呼）= ride_<seat> 連續播，走路動畫由坐騎播。
  // 資料包沒有騎乘動作（舊包）時 resolveAction 退回 idle，不會壞。
  const ride = o.ride === 'sit' || o.ride === 'stand' ? o.ride : null;
  if (ride && !(pose === 'strike' || pose === 'windup' || pose === 'skill')) {
    const rt = actionTiming(data, rideActionFor(pose, ride), o.weaponType);
    if (!rt) return null;
    return { action: rt.key, tick: Math.floor((o.elapsed || 0) * rate + (o.seed || 0) * rt.ticks), phase: pose, loop: true, ride };
  }
  // Phase 6 生活動作：待機中、遊戲狀態對得上 DV2 的生活動作組（o.life，例：交易中 → 'give' 物渡し）且資料包有 → 循環播它
  if (!ride && pose === 'idle' && o.life) {
    const lt = actionTiming(data, o.life, o.weaponType);
    if (lt && lt.key.split('.')[0] === o.life) return { action: lt.key, tick: Math.floor((o.elapsed || 0) * rate + (o.seed || 0) * lt.ticks), phase: 'idle', loop: true, life: o.life };
  }
  if (ride) action = rideActionFor(pose, ride);
  else if (pose === 'strike' || pose === 'windup') {
    // o.attack = 這一擊的 DV2 變體基底名（attack / attack_h / attack_t，dollAttackVariant 骰的）；沒給或資料包沒有 → 'attack'（舊行為）
    action = o.attack && o.attack !== 'attack' && resolveAction(data, o.attack, o.weaponType).split('.')[0] === o.attack ? o.attack : 'attack';
  }
  else if (pose === 'skill') action = 'skill';
  else if (pose === 'hurt') action = 'hurt';
  else if (/^walk/.test(pose)) action = 'walk';
  else action = 'idle';
  const tm = actionTiming(data, action, o.weaponType);
  if (!tm) return null;
  const af = data.actions[tm.key].af;
  const total = tm.ticks;
  const start = s => (s == null || s <= 0 ? 0 : af[Math.min(s, af.length) - 1]);
  const last = Math.max(0, total - 1);
  const clampT = x => Math.max(0, Math.min(last, Math.floor(x)));
  const lin = (x, x0, x1, y0, y1) => (x1 > x0 ? y0 + (Math.max(x0, Math.min(x1, x)) - x0) / (x1 - x0) * (y1 - y0) : y0);
  const relTick = start(tm.releaseSlot ?? 1);
  let tick = 0, phase = pose;

  if (pose === 'windup') {
    const k = o.windupLen > 0 ? Math.max(0, Math.min(0.999, (o.windupT || 0) / o.windupLen)) : 0;
    tick = Math.min(relTick - 1, Math.floor(k * relTick));
  } else if (pose === 'strike') {
    const atk = Math.max(0, o.t - o.atkAt) + 1e-9;   // t − atkAt 的浮點誤差不能讓命中晚一格
    const end = o.strikeEnd > 0 ? o.strikeEnd : 0.345;
    const explicitImpact = data.actions[tm.key].impactSlot != null;
    if (explicitImpact) {
      const impTick = start(tm.impactSlot);
      const hd = Math.max(0.001, o.hitDelay ?? 0.07), hs = o.hitStop ?? 0.07;
      if (atk < hd) tick = lin(atk, 0, hd, relTick, impTick - 0.001), phase = 'release';
      else if (atk < hd + hs) tick = impTick, phase = 'impact';
      else tick = lin(atk, hd + hs, end, impTick + 1, total - 0.001), phase = 'recover';
      tick = Math.max(atk >= hd ? impTick : relTick, tick);
    } else {
      tick = lin(atk, 0, end, relTick, total - 0.001);
      phase = 'release';
    }
  } else if (pose === 'skill') {
    const sk = Math.max(0, o.t - o.skillAt) + 1e-9;
    const rel = Math.max(0.001, o.skillRelease ?? 0.25), len = Math.max(rel + 0.001, o.skillLen ?? 0.675);
    tick = sk < rel ? lin(sk, 0, rel, 0, relTick - 0.001) : lin(sk, rel, len, relTick, total - 0.001);
  } else if (pose === 'hurt') {
    tick = lin(Math.max(0, o.hit || 0), 0, Math.max(0.001, o.hurtLen ?? 0.4), 0, total - 0.001);
  } else if (action === 'walk') {
    const n = Math.max(1, o.walkFrames || 8);
    tick = ((((o.i || 0) % n) + n) % n + 0.5) / n * total;
  } else {
    tick = (o.elapsed || 0) * rate + (o.seed || 0) * total;
    return { action: tm.key, tick: Math.floor(tick), phase, loop: true };
  }
  return { action: tm.key, tick: clampT(tick), phase };
}

/**
 * 逐格播放（同 sheet 的 noSkip）：同一次出招/技能裡，畫面一幀最多前進一個 slot，低幀率也每個 slot 都畫到。
 * prev = 上一次畫的 { stamp, key, slot, t }；回傳要用的 tick。
 */
export function advanceNoSkip(prev, cur, stamp, t, af) {
  const same = prev && prev.stamp === stamp && prev.key === cur.action;
  if (same && t === prev.t) return prev.tick;            // 同一個遊戲時間重畫（暫停）：停在同一格
  const slot = getSlot(af, cur.tick);
  if (!same || slot <= prev.slot + 1) return cur.tick;
  const s = prev.slot + 1;
  return s <= 0 ? 0 : af[s - 1];
}
export { getSlot };

/** 字串 → [0,1)（FNV-1a 32-bit）。render 裡不用 Math.random，截圖/測試可重現。 */
function roll01(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;   // 收尾攪拌：相鄰的 atkAt（只差小數）也分得開
  return (h >>> 0) / 4294967296;
}

/**
 * DV2 連擊變體（docs/PAPERDOLL.md §22）：每一擊各骰一個 attack / attack_h / attack_t。只是外觀，不碰遊戲的出手/命中/傷害。
 *
 * 蓄力時新的一擊還沒有 atkAt（h.atkAt 仍是上一擊），所以變體的鍵 = 「這一擊之前那一擊的 atkAt」：
 *   蓄力 → 鍵 = memo.stamp（現在的 h.atkAt = 上一擊）—— 骰的是「下一擊」
 *   出手 → 鍵 = memo.prev（h.atkAt 換成新的一擊時，memo 記下換之前的值）
 * 兩邊是同一個鍵 → 蓄力與出手同一個變體，release 那一刻不換動作（不跳姿勢）。
 * 同一段蓄力、同一次出手的鍵都不變 → req.action 不變，advanceNoSkip / dollWind 的「同一段只往前」照常成立；
 * 換下一擊時 stamp 本來就變了，advanceNoSkip 不沿用（新動作從頭播），不會倒退 slot。
 *
 * trackAttackStamp(memo, atkAt)：每次畫（任何姿勢）都呼叫；atkAt 變了才推進。回傳 { stamp, prev }。
 */
export function trackAttackStamp(memo, atkAt) {
  const s = atkAt ?? null;
  if (!memo) return { stamp: s, prev: null };
  return memo.stamp === s ? memo : { stamp: s, prev: memo.stamp };
}
/** pose 是 windup / strike 時回這一擊的變體基底名；其他姿勢、沒有 combos、弓（池只有 attack）→ 'attack'。 */
export function dollAttackVariant(data, weaponType, heroId, pose, memo) {
  if (pose !== 'strike' && pose !== 'windup') return 'attack';
  const key = pose === 'windup' ? memo?.stamp : memo?.prev;
  return attackVariant(data, weaponType, roll01(String(heroId) + '@' + (key == null ? '-' : String(key))));
}

/**
 * Phase 6（docs/DV2-PHASE6.md G1）：歡呼有時播 ｼﾞｬﾝﾌﾟ万歳（jump_victory）。鍵 = 這次歡呼的開始時間（同一次歡呼同一個結果，
 * render 裡不用 Math.random）；資料包沒有 jump_victory → 'victory'。只是外觀，不碰遊戲。
 */
export const JUMP_VICTORY_RATE = 0.3;
export function dollVictoryAction(data, heroId, cheerKey) {
  if (!data?.actions?.jump_victory) return 'victory';
  return roll01(String(heroId) + '#' + String(cheerKey)) < JUMP_VICTORY_RATE ? 'jump_victory' : 'victory';
}

/**
 * 遊戲狀態 → DV2 生活動作（只有遊戲裡本來就有、而且對得上的狀態；docs/PAPERDOLL.md §23）：
 *   交易中 / 購買裝備（站在店門口交易）→ 'give'（物渡し）。其他狀態 → null（照舊待機）。
 * 沒有對得上的遊戲狀態：石化 petrify、ガード guard、物持ち carry/carry_walk、泣く cry/cry_sit、拍手 clap、握手 handshake、ｷﾒﾎﾟｰｽﾞ pose——
 * 這些只能從紙娃娃動作 API（computeParts 的 action、實驗面板）播，不發明新玩法。
 */
export function dollLifeAction(status) {
  return /交易|購買/.test(String(status || '')) ? 'give' : null;
}

/**
 * 受擊連段：受擊動畫還沒播完又被打，就接著原本那一段播（slot 只往前），播完之後的新一擊才從頭。
 * 不然連續被群毆時 2 格的 hurt 會每 0.2 秒 0→1→0→1 地閃。閃光照樣每一擊都亮（那是 pose.flash，不在這裡）。
 * prev = { start }；回傳新的 { start }，受擊時間 = t − start。
 */
export function hurtChain(prev, hitAt, t, hurtLen) {
  if (prev && hitAt >= prev.start && t - prev.start < hurtLen) return prev;
  return { start: hitAt };
}

/**
 * 瀏覽器端：載入紙娃娃資料與圖，合成格子圖並快取（鍵 = 這一格實際畫到的部件組合）。
 * opts = { trackImage, makeCanvas, base, cap, onEvict, onReady }
 */
export function createDollHero(opts = {}) {
  let spec = null, data = null, images = {}, loading = false, failed = null, pending = 0;
  const cache = new Map();
  const shadowRep = new Map();   // (外觀,動作,方向) → 第一張合成圖：影子用它，不用每個 slot 各算一次（影子要讀回像素，是最貴的一步）
  let hits = 0, misses = 0, composeMs = 0;   // 效能量測用（status() 帶出）
  const cap = () => (typeof opts.cap === 'function' ? opts.cap() : opts.cap) || 512;
  // weaponLevel 不畫在格子圖上（computeParts 不讀它），放進鍵只會讓同一張圖每個強化等級各存一份
  const lookSig = l => Object.keys(l).sort().filter(k => k !== 'weaponLevel').map(k => k + '=' + l[k]).join(',');
  // 遊戲裡不畫的特效種類（例：'arrow'：遊戲自己會射出真的箭，紙娃娃再畫一支停在弓旁就重複了）。實驗面板不走這裡，照畫。
  const hideFx = new Set(opts.hideEffects || []);
  const LOAD_TIMEOUT = opts.loadTimeoutMs ?? 8000;
  // 資料包優先序：opts.base → DV2 格式原創包（assets/paperdoll-dv2）→ 第 1 期佔位包（assets/paperdoll）
  // → 第 1 期佔位包（assets/paperdoll）。兩包格式相同，差別只在 meta.kits / 圖層名稱。
  // 2026-11-13 使用者:遊戲改用自己的 DV2 格式原創美術包(assets/paperdoll-dv2,sprites/DV2_FORMAT_SPEC.md),
  // 不再讀 pixelfx 包(assets/paperdoll-classes)。沒有 DV2 包時退回第 1 期佔位包。
  const base = () => opts.base || globalThis.PIXEL_ASSETS?.paperdollDv2Base || globalThis.PIXEL_ASSETS?.paperdollBase || 'media/paperdoll/';

  function load() {
    if (loading || data) return;
    loading = true;
    // 讀取逾時：資料或任何一張圖卡住（沒有 onload 也沒有 onerror）時，不能讓英雄一直不畫（drawHunterSheet 在「還在讀」時跳過英雄）。
    // 逾時 = failed → 退回 sheet 英雄。之後真的讀好了，就清掉逾時的 failed、改畫紙娃娃（發 onReady，立繪跟著重畫）。
    const timer = setTimeout(() => {
      if (!data && !failed) { failed = 'timeout'; console.warn(`[paperdoll-hero] data not ready after ${LOAD_TIMEOUT} ms — using hero sheets`); }
    }, LOAD_TIMEOUT);
    // XHR（不是 fetch）：檢查腳本用 file:// 開遊戲，fetch 不支援 file:，XHR 在 --allow-file-access-from-files 下可以
    const x = new XMLHttpRequest();
    x.open('GET', base() + 'paperdoll.json');
    x.onload = () => {
      try {
        if (!(x.status === 200 || (x.status === 0 && x.responseText))) throw new Error('status ' + x.status);
        const d = JSON.parse(x.responseText);
        const files = Object.entries(d.images || {});
        if (!files.length) throw new Error('paperdoll.json lists no images');
        pending = files.length;
        for (const [key, file] of files) {
          const im = (opts.trackImage || (i => i))(new Image());
          im.onload = () => {
            images[key] = im;
            if (--pending === 0) {
              if (failed && failed !== 'timeout') return;   // 別張圖已經失敗：維持 sheet
              clearTimeout(timer); failed = null; data = d; opts.onReady?.();
            }
          };
          im.onerror = () => { failed = 'image ' + file; console.warn('[paperdoll-hero] image failed', file); };
          im.src = base() + file;
        }
      } catch (e) { failed = String(e.message || e); console.warn('[paperdoll-hero]', e); }
    };
    x.onerror = () => { failed = 'paperdoll.json unreachable'; console.warn('[paperdoll-hero] paperdoll.json unreachable'); };
    x.send();
  }

  function setSpec(v) {
    spec = typeof v === 'object' && v !== null && !(v instanceof String) ? v : parseDollSpec(v);
    if (spec) load();
    return status();
  }
  function status() {
    return { on: !!spec, all: !!spec?.all, classes: spec?.classes ? [...spec.classes] : null, ready: !!data, failed, cached: cache.size,
      hits, misses, composeMs: Math.round(composeMs * 10) / 10, base: base() };
  }
  /** 這個職業要不要走紙娃娃：旗標開、資料好了、而且資料裡有這個職業的身體 */
  function covers(classId) {
    if (!spec || !data) return false;
    if (!spec.all && !spec.classes.has(classId)) return false;
    return !!data.skins?.body?.[classId];
  }
  /**
   * 合成一格。req = { action, tick, dir, hideWeapon, globalTick }；回 { cv, footX, footY, heroHeight, parts, look, key }
   * 快取鍵 = 決定這一格長相的全部輸入（外觀、解析後的動作、方向、slot、隱藏武器、頭部翻轉），命中時連 computeParts 都不用跑。
   * 格子圖裁到部件實際外框（不是固定大方格）：記憶體與影子/上傳成本跟著變小，快取才放得多。
   */
  function compose(h, req) {
    if (!data) return null;
    const look = lookFromHunter(h, data);
    const actKey = resolveAction(data, req.action, look.weaponType, look.rig);
    const act = data.actions[actKey];
    if (!act) return null;
    const slot = getSlot(act.af, req.tick || 0);
    const mir = act.headMirror && (req.globalTick ?? req.tick ?? 0) >= 1 ? 1 : 0;
    // hop（ｼﾞｬﾝﾌﾟ万歳）在同一個 slot 裡每個 tick 高度不同 → 鍵帶 tick；tint（石化）帶進鍵
    const hopT = act.hop ? '|t' + (req.tick || 0) : '';
    const key = `${lookSig(look)}|${actKey}|${dirIndex(req.dir, req.facing)}|${slot}|${req.hideWeapon ? 1 : 0}|${mir}${hopT}|${req.tint || ''}`;
    let e = cache.get(key);
    if (e) { cache.delete(key); cache.set(key, e); hits++; }
    else {
      misses++;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      let parts = computeParts(data, { action: actKey, dir: req.dir, facing: req.facing, tick: req.tick, globalTick: req.globalTick, look, hideWeapon: !!req.hideWeapon, tint: req.tint || null });
      if (hideFx.size && parts.some(p => p.kind === 'effect')) {
        // 2x rig 的特效是 `<種類>@2x`（rig2x.py）：隱藏 'arrow' 也要藏 'arrow@2x'
        const hiddenSeb = new Set([...hideFx].flatMap(t => [t, t + '@2x']).map(t => data.effects?.[t]?.seb).filter(Boolean));
        const kept = parts.filter(p => !(p.kind === 'effect' && hiddenSeb.has(p.seb)));
        Object.assign(kept, { action: parts.action, dir: parts.dir, wantDir: parts.wantDir, slot: parts.slot, tint: parts.tint });
        parts = kept;
      }
      if (!parts.length) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of parts) for (const [x, y] of partCorners(p)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
      const cv = opts.makeCanvas(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      drawParts(cv.getContext('2d'), parts, images, { x: -x0, y: -y0 }, 1);
      if (t0) composeMs += performance.now() - t0;
      e = { cv, footX: -x0, footY: -y0, parts };
      cache.set(key, e);
      while (cache.size > cap()) {
        const [k0, v0] = cache.entries().next().value;
        cache.delete(k0);
        opts.onEvict?.(v0.cv);
      }
    }
    // 倒下（death）每個 slot 的輪廓差很多（站 → 跪 → 躺），影子要跟著那一格；其他動作同一個（外觀,動作,方向）共用一張
    const perSlot = actKey.split('.')[0] === 'death';
    const repKey = `${lookSig(look)}|${actKey}|${dirIndex(req.dir, req.facing)}|${req.hideWeapon ? 1 : 0}${perSlot ? '|' + slot : ''}${hopT}`;
    let shadow = shadowRep.get(repKey);
    if (!shadow) {
      shadow = { cv: e.cv, footX: e.footX, footY: e.footY };
      shadowRep.set(repKey, shadow);
      while (shadowRep.size > cap()) shadowRep.delete(shadowRep.keys().next().value);
    }
    // 每職業的站高（meta.heroHeights）：遊戲用 HERO_H / 站高 縮放，跟 sheet 英雄同一個螢幕高度
    const heroHeight = data.meta?.heroHeights?.[look.classId] || data.meta?.heroHeight || 72;
    return { cv: e.cv, footX: e.footX, footY: e.footY, heroHeight, parts: e.parts, look, key, shadow };
  }
  return {
    setSpec, status, covers, compose,
    get on() { return !!spec; },
    get data() { return data; },
    weaponTypeOf: h => (data ? lookFromHunter(h, data).weaponType : null),
    resolve: (name, wt, rig) => resolveAction(data, name, wt, rig),
  };
}
