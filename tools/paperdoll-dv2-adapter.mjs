// paperdoll-dv2-adapter.mjs — 把 window.DV2 形狀的物件（記憶體中）轉成暮影村紙娃娃格式。
//
// 只給 test-paperdoll.mjs 的對照測試用：證明 src/paperdoll.js 的 computeParts 和 DV2 kit 的
// 參考渲染器算出一樣的結果。**不要**拿它把 DV2 的資料或圖寫進 repo（Kairosoft 版權素材，
// 規則見 docs/PAPERDOLL.md §0）。這個檔只處理傳進來的物件，不讀也不寫任何檔案。
//
// 對照：DV2 部件 id → 暮影村圖層名
//   0 BODY → body、1 HAND → hand、2 HAT → helmet、3 HEAD → head、4 WEAPON → weapon、5 EFFECT → effect

export const DV2_LAYER_NAMES = ['body', 'hand', 'helmet', 'head', 'weapon', 'effect'];
export const DV2_BUNDLES = ['chara_body', 'chara_hand', 'chara_hat', 'chara_head', 'weapon', 'weaponEffect'];

const at = (arr, i, d) => (!arr || !arr.length ? d : arr[Math.min(i, arr.length - 1)] ?? d);

/** DV2 → 暮影村紙娃娃資料 */
export function dv2ToMistvale(DV2) {
  const layers = {
    body:   { kind: 'slot' },
    hand:   { kind: 'slot' },
    helmet: { kind: 'dir' },
    head:   { kind: 'dir' },
    weapon: { kind: 'weapon' },
    effect: { kind: 'effect' },
  };

  // 圖片鍵 = bundle 名（一個 bundle 一張圖集）；skin = 虛擬表在圖集裡的原點（ax - trimOx, ay - trimOy）
  const images = {};
  for (const b of DV2_BUNDLES) images[b] = `atlas_${b}.png`;
  const skins = {};
  DV2_BUNDLES.forEach((bundle, part) => {
    const layer = DV2_LAYER_NAMES[part];
    const map = skins[layer] = {};
    for (const [imgId, png] of Object.entries((DV2.imgIds || {})[bundle] || {})) {
      const sh = ((DV2.sheets || {})[bundle] || {})[png];
      if (!sh) continue;
      map[imgId] = { img: bundle, x: sh[0] - (sh[4] || 0), y: sh[1] - (sh[5] || 0) };
    }
  });

  // seb：鍵 = `<bundle>/<sebId>`，每格只留第一個 sprite 的 8 個數（texId 渲染時不用）
  const sebs = {};
  for (const [bundle, group] of Object.entries(DV2.sebs || {})) {
    for (const [id, entry] of Object.entries(group)) {
      const [max, frames, file] = entry;
      const out = {};
      for (const [f, arr] of Object.entries(frames || {})) if (arr && arr[0]) out[f] = arr[0].slice(0, 8);
      sebs[`${bundle}/${id}`] = { max, frames: out, file };
    }
  }

  // 武器：spProc&2 拳套 → hidden；spProc&4 大型武器 → 固定用 weapon seb 9
  const weapons = {};
  for (const w of DV2.weapons || []) {
    weapons[String(w.id)] = {
      skin: String(w.imgId), handle: w.handle.slice(0, 2), type: w.wtype,
      hidden: !!(w.spProc & 2), seb: (w.spProc & 4) ? 'weapon/9' : null, name: w.name,
    };
  }

  // 特效：type 同時是 img id 與 seb id
  const effects = {};
  for (const id of Object.keys((DV2.sebs || {}).weaponEffect || {})) {
    effects[id] = { seb: `weaponEffect/${id}`, skin: id };
  }

  const rowsBy = {};
  for (const r of DV2.rows || []) rowsBy[r.set * 4 + r.direct] = r;

  const actions = {};
  for (const s of DV2.sets || []) {
    const rows = [];
    for (let d = 0; d < 4; d++) {
      const r = rowsBy[s.id * 4 + d];
      rows.push(r ? convertRow(r) : null);
    }
    actions[`set${s.id}`] = {
      name: s.name, af: s.af.slice(), loop: !!(s.fl & 1),
      headMirror: (s.sp & 1) === 1,
      // ｼﾞｬﾝﾌﾟ万歳（set 12）固定笑臉
      headSeb: s.id === 12 ? 'chara_head/2' : null,
      rows,
    };
  }

  return {
    format: 'mistvale-paperdoll', version: 1, tickRate: 20,
    meta: { source: 'dv2-adapter (in-memory, test only)' },
    weaponOrigin: { dx: [0, 0, 1, 1], dy: 3 },
    layers, images, skins, sebs, weapons, effects, actions, aliases: {},
  };
}

function convertRow(r) {
  const off = p => (r.off && r.off[p]) || [];
  const parts = {
    body:   { seb: `chara_body/${at(r.sebId, 0, 0)}`, off: off(0) },
    hand:   { seb: `chara_hand/${at(r.sebId, 1, 0)}`, off: off(1) },
    helmet: { seb: `chara_hat/${at(r.sebId, 2, 0)}`, off: off(2) },
    head:   { seb: `chara_head/${at(r.sebId, 3, 0)}`, off: off(3) },
    weapon: {
      seb: (r.wseb && r.wseb.length ? r.wseb : [0]).map(n => `weapon/${n}`),
      sebF: r.wsebF || [], deg: r.wdeg || [], inv: r.winv || [], show: r.ball || [], off: off(4),
    },
    effect: {
      act: r.wact || [], type: (r.wtype && r.wtype.length ? r.wtype : [0]).map(String),
      sebF: r.weffSebF || [], off: r.weffOff || [],
    },
  };
  return { name: r.name, parts, order: (r.order || []).map(p => (p < 0 ? null : DV2_LAYER_NAMES[p])) };
}

/** DV2 state（setId/direct/body/hand/head/hat/weaponId/face/hideWeapon）→ 暮影村 state */
export function dv2State(s) {
  return {
    action: `set${s.setId}`, dir: s.direct, tick: s.tick, globalTick: s.tick,
    look: {
      body: String(s.body), hand: String(s.hand), head: String(s.head), helmet: String(s.hat),
      weapon: s.weaponId == null || s.weaponId < 0 ? null : String(s.weaponId),
    },
    face: s.face != null && s.face >= 0 ? `chara_head/${s.face}` : null,
    hideWeapon: !!s.hideWeapon,
  };
}
