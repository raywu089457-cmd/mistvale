// map-labels.js — T151:村莊地圖建築名牌的排版(純函式,不碰 canvas)。
// pixel-world.js 每幀用它算出名牌矩形再照矩形畫;tools/checks/map-labels.mjs 讀的是同一份結果
// (globalThis.__mistvaleMapLabels),所以檢查器量到的就是畫出來的位置,不是另一份近似算法。
//
// 做法(依序):
//  1. 縮短:預設只顯示名稱;滑鼠移到/選取該建築才顯示「名稱 Lv.N」。
//  2. 確定性避讓:照固定順序(前排先放)逐一擺放,撞到已擺好的名牌就找「最小位移」的候選位置
//     (優先往上,其次往下,最後才左右)。同一組輸入永遠得到同一個結果;鏡頭平移時整組一起平移、
//     相對位置不變,所以不會每幀跳動。
//  3. 夾在畫布內:建築本身在畫面內時,名牌不超出畫布邊緣。
//  4. 展開(顯示等級)的名牌釘在它縮短時的位置,其他名牌讓開 —— 滑鼠停在名牌上不會因為展開而被推走、來回閃。

// 名牌外框(CSS px):寬 = 字寬 + 2*PAD_X,高 HEIGHT,文字中線在外框頂端往下 TOP。跟繪製一致。
export const LABEL_PAD_X = 6, LABEL_HEIGHT = 19, LABEL_TOP = 9;
export const LABEL_GAP = 3;          // 名牌之間至少留這麼多(檢查器要求 ≥2)
export const LABEL_MARGIN = 2;       // 離畫布邊緣

export function labelText(item, expanded) {
  return expanded && item.built && item.level ? `${item.name} Lv.${item.level}` : item.name;
}

const hit = (a, b, gap) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const inView = (box, W, H) => !box || (box.x + box.w > 0 && box.x < W && box.y + box.h > 0 && box.y < H);

/**
 * items: [{id, name, level, built, x, y, box?, expanded?, pin?:{cx,cy}}]
 *   x,y = 名牌文字中心的錨點(CSS px);box = 建築在畫面上的範圍(整個不在畫面內就不畫名牌)
 * opts:  {measure(text)->寬(CSS px), width, height, gap, margin, avoid}
 * 回傳: [{id, text, built, expanded, x, y, w, h, cx, cy}](x,y,w,h = 外框;cx,cy = 文字中心)
 */
export function layoutMapLabels(items, opts) {
  const { measure, width: W, height: H, gap = LABEL_GAP, margin = LABEL_MARGIN, avoid = true } = opts;
  const clamp = r => {
    const x = Math.max(margin, Math.min(W - margin - r.w, r.x)), y = Math.max(margin, Math.min(H - margin - r.h, r.y));
    return { ...r, x, y };
  };
  const list = [];
  for (const it of items) {
    if (!inView(it.box, W, H)) continue;
    const text = labelText(it, it.expanded), w = Math.ceil(measure(text)) + LABEL_PAD_X * 2, h = LABEL_HEIGHT;
    const cx = it.pin ? it.pin.cx : it.x, cy = it.pin ? it.pin.cy : it.y;
    list.push({ it, text, base: clamp({ x: cx - w / 2, y: cy - LABEL_TOP, w, h }) });
  }
  // 固定順序:釘住的(展開中)先放,其餘前排(錨點 y 大)先放、後排讓位;同排由左到右,最後比 id。
  list.sort((a, b) => (!!b.it.pin - !!a.it.pin) || (b.it.y - a.it.y) || (a.it.x - b.it.x) || String(a.it.id).localeCompare(String(b.it.id)));
  const placed = [];
  for (const L of list) {
    let r = L.base;
    if (avoid && !L.it.pin && placed.some(p => hit(r, p, gap))) r = bestSpot(L.base, placed, gap, clamp);
    placed.push(r);
    L.r = r;
  }
  return list.map(L => ({ id: L.it.id, text: L.text, built: !!L.it.built, expanded: !!L.it.expanded,
    x: L.r.x, y: L.r.y, w: L.r.w, h: L.r.h, cx: L.r.x + L.r.w / 2, cy: L.r.y + LABEL_TOP }));
}

// 候選位置 = 貼齊每個已擺好名牌的上/下/左/右緣(先單軸、再雙軸組合),取代價最小且不撞任何名牌的那個。
// 代價:往上 1、往下 1.25、左右 1.6(每 px) —— 名牌優先沿垂直方向讓開,留在自己的建築上方。
function bestSpot(base, placed, gap, clamp) {
  const dys = [0], dxs = [0];
  for (const p of placed) {
    dys.push(p.y - gap - (base.y + base.h), p.y + p.h + gap - base.y);
    dxs.push(p.x - gap - (base.x + base.w), p.x + p.w + gap - base.x);
  }
  const cost = (dx, dy) => (dy < 0 ? -dy : dy * 1.25) + Math.abs(dx) * 1.6;
  const cands = [];
  for (const dy of dys) cands.push([0, dy]);
  for (const dx of dxs) cands.push([dx, 0]);
  for (const dy of dys) for (const dx of dxs) if (dx && dy) cands.push([dx, dy]);
  cands.sort((a, b) => cost(a[0], a[1]) - cost(b[0], b[1]) || a[1] - b[1] || a[0] - b[0]);
  let best = null, bestOv = Infinity;
  for (const [dx, dy] of cands) {
    const r = clamp({ ...base, x: base.x + dx, y: base.y + dy });
    if (!placed.some(p => hit(r, p, gap))) return r;
    const ov = placed.reduce((s, p) => s + overlapArea(r, p), 0);
    if (ov < bestOv) { bestOv = ov; best = r; }
  }
  return best || base;
}
