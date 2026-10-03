"""concept_ground.py — 把概念圖（assets/title.png）的地面分類成村莊網格，產生 src/concept-ground.js。

流程：每像素用 9px 平均色分成 石板／土路／草／水／其他 → 「其他」（建築、角色、描邊、灰縫）
補成最近的地面類 → 31px 眾數平滑 → 依概念圖↔世界的對應（紀念碑 (-8,2) ↔ 概念圖 (640,613.6)，
大廳寬 440px = 112 世界單位 → K=3.93 px/單位，等角 9:4.5）取樣每個 0.5 格。
水只認右下河道；灰石只認中央廣場一帶（煙、羊、雕像也是灰）。
用法：python pipeline/scripts/align/concept_ground.py
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
K, U0, V0, MX, MS = 3.93, 640.0, 613.6, -10.0, -6.0   # 紀念碑 (-8,2)：x-z=-10、x+z=-6
X0, Z0, STEP, W, H = -28.0, -24.0, 0.5, 74, 100


def canopy_mask(im):
    """樹冠：綠、比草地暗、紋理強（局部亮度標準差大）；去掉小塊。"""
    avg = np.stack([ndimage.uniform_filter(im[..., i], 15) for i in range(3)], -1)
    R, G, B = avg[..., 0], avg[..., 1], avg[..., 2]
    MXc, MN = avg.max(2), avg.min(2)
    SAT = (MXc - MN) / np.maximum(MXc, 1); L = .299 * R + .587 * G + .114 * B
    D = MXc - MN + 1e-6
    Hh = np.where(MXc == R, ((G - B) / D) % 6, np.where(MXc == G, (B - R) / D + 2, (R - G) / D + 4)) * 60
    lum = .299 * im[..., 0] + .587 * im[..., 1] + .114 * im[..., 2]
    sd = np.sqrt(np.maximum(ndimage.uniform_filter(lum ** 2, 15) - ndimage.uniform_filter(lum, 15) ** 2, 0))
    c = (Hh >= 75) & (Hh < 160) & (SAT > .35) & (L < 120) & (sd > 22)
    c = ndimage.binary_closing(ndimage.binary_opening(c, iterations=3), iterations=6)
    lab, n = ndimage.label(c); sizes = ndimage.sum(c, lab, range(1, n + 1))
    return np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v > 1500]), Hh


def classify(im, canopy):
    k = 9
    avg = np.stack([ndimage.uniform_filter(im[..., i], k) for i in range(3)], -1)
    R, G, B = avg[..., 0], avg[..., 1], avg[..., 2]
    MXc, MN = avg.max(2), avg.min(2)
    SAT = (MXc - MN) / np.maximum(MXc, 1); L = .299 * R + .587 * G + .114 * B
    D = MXc - MN + 1e-6
    Hh = np.where(MXc == R, ((G - B) / D) % 6, np.where(MXc == G, (B - R) / D + 2, (R - G) / D + 4)) * 60
    # 概念圖廣場石塊是暖米色 (216,186,162)、飽和度約 .25；土路 (235,180,94) 約 .6 → 用 .35 分開
    stone = (SAT < .35) & (L > 110) & (L < 235)
    earth = (Hh >= 18) & (Hh < 52) & (SAT >= .35) & (L > 90) & (L < 225) & ~stone
    grass = (Hh >= 60) & (Hh < 150) & (SAT > .35) & (L > 60)
    water = (Hh >= 185) & (Hh < 220) & (SAT > .5) & (L > 70)
    cls = np.zeros(im.shape[:2], np.uint8)
    cls[grass] = 3; cls[earth] = 2; cls[stone] = 1; cls[water] = 4
    cls[canopy] = 3   # 樹下是林地（草），不是土路
    hh, ww = cls.shape; yy, xx = np.mgrid[0:hh, 0:ww]
    cls[(cls == 4) & ~((yy > 1000) & (xx > 650))] = 0
    cls[(cls == 1) & ~(((xx - 640) / 430) ** 2 + ((yy - 600) / 330) ** 2 < 1)] = 0
    dist, (iy, ix) = ndimage.distance_transform_edt(cls == 0, return_indices=True)
    # 只補 25px 內的未知（描邊、灰縫、角色）；更遠的是建築本體 → 草，不然建築底下整片變土路
    filled = np.where(dist <= 25, cls[iy, ix], 3).astype(np.uint8)
    score = np.stack([ndimage.uniform_filter((filled == c).astype(np.float32), 31) for c in range(5)], -1)
    return score.argmax(-1).astype(np.uint8)


def main():
    im = np.asarray(Image.open(ROOT / "assets" / "title.png").convert("RGB")).astype(np.float32)
    canopy, hue = canopy_mask(im)
    cls = classify(im, canopy); hh, ww = cls.shape
    # 樹：在概念圖樹冠上種樹。樹幹點 (x,z) → 樹冠中心在它上方 (36*size-4) 單位；深藍綠＝松、偏黃綠＝闊葉。
    trees = []
    for zi in range(-60, 72):
        for xi in range(-62, 40):
            jx = ((xi * 73856093 ^ zi * 19349663) % 1000) / 1000 - .5; jz = ((xi * 83492791 ^ zi * 2654435) % 1000) / 1000 - .5
            x = xi * .62 + jx * .4; z = zi * .62 + jz * .4
            if (xi + zi) % 2: continue   # 棋盤取一半 → 間距約 0.9 格
            size = .5 + (((xi * 31 + zi * 17) % 7) - 3) * .02
            u = U0 + ((x - z) - MX) * 9 * K; v = V0 + ((x + z) - MS) * 4.5 * K - (36 * size - 4) * K
            if not (0 <= u < ww and 0 <= v < hh) or not canopy[int(v), int(u)]: continue
            pine = hue[int(v), int(u)] > 112
            trees.append((round(x, 2), round(z, 2), 0 if pine else 1, round(size, 2)))
    # 太密的去掉（樹冠寬約 20 單位 → 世界距離 < 1.3 就合併）
    kept = []
    for t in trees:
        if all((t[0] - k_[0]) ** 2 + (t[1] - k_[1]) ** 2 > 1.3 ** 2 for k_ in kept): kept.append(t)
    trees = kept
    chars = ".segw"   # 0 不會出現（已補滿）；. = 畫框外
    rows = []
    for j in range(H):
        z = Z0 + j * STEP; row = []
        for i in range(W):
            x = X0 + i * STEP
            u = U0 + ((x - z) - MX) * 9 * K; v = V0 + ((x + z) - MS) * 4.5 * K
            row.append(chars[cls[int(v), int(u)]] if 0 <= u < ww and 0 <= v < hh else ".")
        rows.append("".join(row))
    js = ("// 自動產生，勿手改：python pipeline/scripts/align/concept_ground.py\n"
          "// 概念圖地面分類取樣到村莊 0.5 格：s=石板 e=土路 g=草 w=水 .=概念圖畫框外。\n"
          f"export const CONCEPT_GROUND={{x0:{X0},z0:{Z0},step:{STEP},w:{W},h:{H},rows:[\n"
          + ",\n".join(f"'{r}'" for r in rows) + "]};\n"
          "export const CONCEPT_TREES=" + json.dumps([list(t) for t in trees]) + ";\n"
          "// 概念圖畫框 ↔ 世界：x-z∈[-28.1,7.36]、x+z∈[-40.7,30.2]（1254px 方框）。\n"
          f"export function inConceptFrame(x,z){{const a=x-z,b=x+z;return a>={(0-U0)/(9*K)+MX:.2f}&&a<={(1254-U0)/(9*K)+MX:.2f}&&b>={(0-V0)/(4.5*K)+MS:.2f}&&b<={(1254-V0)/(4.5*K)+MS:.2f};}}\n"
          "export function conceptGroundAt(x,z){const g=CONCEPT_GROUND,i=Math.round((x-g.x0)/g.step),j=Math.round((z-g.z0)/g.step);"
          "if(i<0||j<0||i>=g.w||j>=g.h)return '.';return g.rows[j][i];}\n")
    (ROOT / "src" / "concept-ground.js").write_text(js, encoding="utf-8")
    flat = "".join(rows)
    print({c: flat.count(c) for c in ".segw"}, "trees", len(trees), "pine", sum(t[2] == 0 for t in trees))


if __name__ == "__main__":
    main()
