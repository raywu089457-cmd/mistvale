"""concept_textures.py — 直接用概念圖（assets/title.png）的像素合成無縫地面材質。

石板／土路／草地各取「乾淨」的 48px 樣本（該材質佔 ≥96%、沒有角色道具），用環繞式 image quilting
（每塊跟左、上、以及最後一欄／列跟起點的重疊算誤差，挑最像的，再用最小誤差切縫）拼成 N×N 無縫磚。
輸出解析度＝概念圖原生解析度（3.93 px/世界單位），遊戲的村莊高解析地面層 1:1 貼上。

用法：python pipeline/scripts/align/concept_textures.py
輸出：assets/concept-stone.png、concept-earth.png、concept-grass.png
"""
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
P, O, n = 48, 12, 10         # 樣本邊長、重疊、每邊塊數 → N = n*(P-O) = 360（重複週期約 91 世界單位）
N = n * (P - O)


def masks(im):
    avg = np.stack([ndimage.uniform_filter(im[..., i], 9) for i in range(3)], -1)
    R, G, B = avg[..., 0], avg[..., 1], avg[..., 2]
    MX, MN = avg.max(2), avg.min(2)
    SAT = (MX - MN) / np.maximum(MX, 1); L = .299 * R + .587 * G + .114 * B
    D = MX - MN + 1e-6
    H = np.where(MX == R, ((G - B) / D) % 6, np.where(MX == G, (B - R) / D + 2, (R - G) / D + 4)) * 60
    px = im; pmx, pmn = px.max(2), px.min(2); psat = (pmx - pmn) / np.maximum(pmx, 1)
    plum = px @ np.array([.299, .587, .114], np.float32)
    hh, ww = L.shape; yy, xx = np.mgrid[0:hh, 0:ww]
    plaza = ((xx - 640) / 430) ** 2 + ((yy - 600) / 330) ** 2 < 1
    # 區域：跟 concept_ground.py 同一張平滑地面分類圖（樹冠排除在草地外）；單像素再檢查一次色相。
    import sys; sys.path.insert(0, str(Path(__file__).parent))
    import concept_ground as cg
    canopy, _ = cg.canopy_mask(im); cls = cg.classify(im, canopy)
    near_canopy = ndimage.binary_dilation(canopy, iterations=6)
    phue = np.where(pmx == px[..., 0], ((px[..., 1] - px[..., 2]) / (pmx - pmn + 1e-6)) % 6,
                    np.where(pmx == px[..., 1], (px[..., 2] - px[..., 0]) / (pmx - pmn + 1e-6) + 2, (px[..., 0] - px[..., 1]) / (pmx - pmn + 1e-6) + 4)) * 60
    stone = plaza & (cls == 1) & (psat < .32) & (plum > 120) & (plum < 235)
    earth = (cls == 2) & (phue >= 15) & (phue < 52) & (psat > .38) & (plum > 80) & (plum < 210)
    grass = (cls == 3) & ~near_canopy & (phue >= 45) & (phue < 125) & (psat > .25) & (plum > 50) & (plum < 200)
    return {"stone": stone, "earth": earth, "grass": grass}


DARK = {"stone": (105, .004), "earth": (85, .004), "grass": (30, .03)}   # (亮度門檻, 容許比例)：擋角色描邊、陰影塊；草地本來就有暗草叢


def candidates(im, mask, k=260, dark=(0, 0)):
    out = []
    lum = im @ np.array([.299, .587, .114], np.float32)
    frac = ndimage.uniform_filter(mask.astype(np.float32), P)
    ys, xs = np.nonzero(frac > .9)
    rng = np.random.default_rng(3)
    order = rng.permutation(len(ys))
    for i in order:
        y, x = ys[i] - P // 2, xs[i] - P // 2
        if y < 0 or x < 0 or y + P > im.shape[0] or x + P > im.shape[1]: continue
        if mask[y:y + P, x:x + P].mean() < .9: continue
        if (lum[y:y + P, x:x + P] < dark[0]).mean() > dark[1]: continue
        out.append(im[y:y + P, x:x + P])
        if len(out) >= k: break
    return np.array(out)


def min_cut(err):
    """err: h×w 重疊誤差，回傳每列切在哪（左邊用舊、右邊用新）。"""
    h, w = err.shape; cost = err.copy(); back = np.zeros((h, w), int)
    for i in range(1, h):
        for j in range(w):
            lo, hi = max(0, j - 1), min(w, j + 2)
            k = lo + int(np.argmin(cost[i - 1, lo:hi])); back[i, j] = k; cost[i, j] += cost[i - 1, k]
    path = np.zeros(h, int); path[-1] = int(np.argmin(cost[-1]))
    for i in range(h - 1, 0, -1): path[i - 1] = back[i, path[i]]
    return path


def quilt(cands, seed=1):
    rng = np.random.default_rng(seed)
    out = np.zeros((N, N, 3), np.float32); filled = np.zeros((N, N), bool)
    for bj in range(n):
        for bi in range(n):
            y0, x0 = bj * (P - O), bi * (P - O)
            ys = (np.arange(P) + y0) % N; xs = (np.arange(P) + x0) % N
            region = out[np.ix_(ys, xs)]; known = filled[np.ix_(ys, xs)]
            if not known.any():
                pick = cands[rng.integers(len(cands))]
            else:
                err = (((cands - region[None]) ** 2).sum(-1) * known[None]).sum((1, 2))
                ok = np.argsort(err)[:6]   # 前 6 名隨機挑：太貪心會一直用同一塊，看起來像規則磁磚
                pick = cands[rng.choice(ok)]
            take = np.ones((P, P), bool)
            d = ((pick - region) ** 2).sum(-1)
            if known[:, :O].all():                       # 左重疊：垂直切縫
                cut = min_cut(d[:, :O])
                for i in range(P): take[i, :cut[i]] = False
            if known[:O, :].all():                       # 上重疊：水平切縫
                cut = min_cut(d[:O, :].T)
                for j in range(P): take[:cut[j], j] = False
            if known[:, P - O:].all():                   # 右邊環繞回第一欄
                cut = min_cut(d[:, P - O:][:, ::-1])
                for i in range(P): take[i, P - cut[i]:] = False
            if known[P - O:, :].all():                   # 下邊環繞回第一列
                cut = min_cut(d[P - O:, :][::-1].T)
                for j in range(P): take[P - cut[j]:, j] = False
            take |= ~known
            blk = np.where(take[..., None], pick, region)
            out[np.ix_(ys, xs)] = blk; filled[np.ix_(ys, xs)] = True
    return out


def main():
    im = np.asarray(Image.open(ROOT / "assets" / "title.png").convert("RGB")).astype(np.float32)
    for name, m in masks(im).items():
        c = candidates(im, m, dark=DARK[name])
        tile = quilt(c)
        Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)).save(ROOT / "assets" / f"concept-{name}.png", optimize=True)
        print(f"concept-{name}.png {N}x{N} from {len(c)} samples, mean {tile.reshape(-1, 3).mean(0).round()}")


if __name__ == "__main__":
    main()
