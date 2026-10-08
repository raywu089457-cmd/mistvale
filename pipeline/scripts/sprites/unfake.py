"""unfake.py — 把 AI 生的「假像素畫」還原成真像素(偵測原生像素格,每格取中心代表色)。

AI 畫的像素畫每個色塊約 6–9 個圖片像素,但格線不對齊整數、邊緣有抗鋸齒。直接 LANCZOS 縮放,格線一對不上相鄰色塊就混色
(暗色騎士縮到 72 px 時眼縫整個消失)。這裡先量出原生格距與起點,再在每個格子中心取「最多數顏色」:
  格距:欄/列方向的色差剖面(相鄰像素顏色跳變的總量)在格線位置最高 → 對每個候選格距 p、相位 φ 算梳狀取樣的平均,最大者勝。
  兩軸各自量(AI 圖常常 x/y 格距略不同)。
思路參考 aldegad/sprite-gen 的 pixel-unfake / backbone lattice(Apache-2.0),這裡是獨立重寫的簡化版。
"""
from __future__ import annotations

import numpy as np
from PIL import Image


def _pitch(profile: np.ndarray, lo=3.0, hi=12.0, step=.02):
    best = (0.0, 0.0, 0.0)
    n = len(profile); base = profile.mean() + 1e-9
    for p in np.arange(lo, hi, step):
        for ph in np.arange(0, p, .25):
            idx = np.round(np.arange(ph, n - 1, p)).astype(int)
            score = profile[idx].mean() / base
            if score > best[0]: best = (score, p, ph)
    # 真格距 p 的整數倍 2p、3p 也會得到幾乎一樣的分數 → 優先選「分數 ≥ 0.9×最佳」的最細約數(聖騎士 10.02 → 5.0,原生高 36 → 70)
    for k in (3, 2):
        q = best[1] / k
        if q >= lo:
            alt = max(((profile[np.round(np.arange(ph, n - 1, pp)).astype(int)].mean() / base, pp, ph)
                       for pp in np.arange(q * .97, q * 1.03, step) for ph in np.arange(0, pp, .25)), key=lambda s: s[0])
            if alt[0] >= .9 * best[0]: best = alt; break
    return best[1], best[2], best[0]


def detect_grid(rgba: np.ndarray, hint=None):
    rgb = rgba[..., :3].astype(int); a = rgba[..., 3] > 0
    dx = (np.abs(np.diff(rgb, axis=1)).sum(2) * (a[:, 1:] | a[:, :-1])).sum(0).astype(float)
    dy = (np.abs(np.diff(rgb, axis=0)).sum(2) * (a[1:] | a[:-1])).sum(1).astype(float)
    if hint:   # 同一張 sheet 的格距相同:只在 hint ±4% 內找(每格各自找相位)
        px, phx, sx = _pitch(dx, hint * .96, hint * 1.04); py, phy, sy = _pitch(dy, hint * .96, hint * 1.04)
        return (px, phx + 1, sx), (py, phy + 1, sy)
    px, phx, sx = _pitch(dx); py, phy, sy = _pitch(dy)
    # 兩軸格距應該很接近:差太多時用分數較高那軸的值重找另一軸的相位
    if abs(px - py) > .6:
        p = px if sx >= sy else py
        _, phx, _ = _pitch(dx, p, p + .01); _, phy, _ = _pitch(dy, p, p + .01); px = py = p
    return (px, phx + 1, sx), (py, phy + 1, sy)   # +1:diff 的第 i 個值是 i 與 i+1 之間的邊界


def unfake(im: Image.Image, hint=None):
    """回傳 (真像素 RGBA 圖, 格距資訊)。im = 已去背、裁好的主體(alpha 0/255)。"""
    a = np.asarray(im.convert("RGBA"))
    (px, ox, _), (py, oy, _) = detect_grid(a, hint)
    xs = np.arange(ox - px, a.shape[1] + px, px); ys = np.arange(oy - py, a.shape[0] + py, py)
    out = np.zeros((len(ys) - 1, len(xs) - 1, 4), np.uint8)
    for j in range(len(ys) - 1):
        y0, y1 = int(round(ys[j] + py * .1)), int(round(ys[j + 1] - py * .1))
        for i in range(len(xs) - 1):
            x0, x1 = int(round(xs[i] + px * .1)), int(round(xs[i + 1] - px * .1))
            if y1 <= 0 or x1 <= 0 or y0 >= a.shape[0] or x0 >= a.shape[1]: continue
            blk = a[max(0, y0):max(1, y1), max(0, x0):max(1, x1)].reshape(-1, 4)
            if not len(blk) or (blk[:, 3] > 0).mean() < .5: continue
            col = blk[blk[:, 3] > 0][:, :3]
            # 重點色優先:發光眼縫、火光這類高飽和亮色常常比一格還細,多數決會被周圍深色吃掉 → 佔 ≥20% 就用它
            ci = col.astype(int); accent = (ci.max(1) - ci.min(1) > 60) & (ci.max(1) > 150)
            if accent.mean() >= .2: col = col[accent]
            keys, inv, cnt = np.unique((col // 32), axis=0, return_inverse=True, return_counts=True)
            out[j, i, :3] = np.median(col[inv.ravel() == cnt.argmax()], axis=0).astype(np.uint8); out[j, i, 3] = 255
    from scipy import ndimage   # 取樣邊緣留下的 1–2 px 孤立碎點(披風尖、羽毛旁)= 縮圖雜訊 → 去掉
    lab, nlab = ndimage.label(out[..., 3] > 0); sz = ndimage.sum(np.ones_like(lab), lab, range(1, nlab + 1))
    out[np.isin(lab, [i + 1 for i in range(nlab) if sz[i] <= 2])] = 0
    ys_, xs_ = np.nonzero(out[..., 3])
    out = out[ys_.min():ys_.max() + 1, xs_.min():xs_.max() + 1]
    return Image.fromarray(out, "RGBA"), {"pitchX": round(float(px), 3), "pitchY": round(float(py), 3)}


def limit_palette(ims, n=16, merge=14):
    """所有格共用一份 ≤n 色盤。median cut 先選 n 色 → 合併彼此距離 < merge 的近似色(常常 4 個幾乎一樣的黑)騰出名額 →
    用騰出的名額一個一個補「離現有色盤最遠的那一群」(發光眼縫、寶石這種幾個像素的重點色才不會被吃掉)。回傳 (k,3) uint8。"""
    px = np.concatenate([np.asarray(i.convert("RGBA")).reshape(-1, 4) for i in ims]); px = px[px[:, 3] > 0][:, :3].astype(int)
    if not __import__("os").environ.get("NO_SHADOW"):  # 紫色主體(法師)要保留紫色
        px = px[~((px[:, 0] - px[:, 1] > 50) & (px[:, 2] - px[:, 1] > 40))]   # 洋紅底滲色(背景污染)不進色盤 → 對應到最近的正常色
    side = int(np.ceil(np.sqrt(len(px)))); buf = np.zeros((side * side, 3), np.uint8); buf[:len(px)] = px; buf[len(px):] = px[0]
    q = Image.fromarray(buf.reshape(side, side, 3)).quantize(n, method=Image.Quantize.MEDIANCUT)
    pal = [c for c in np.asarray(q.getpalette()[:n * 3]).reshape(-1, 3).astype(int)]
    kept = []
    for c in sorted(pal, key=lambda c: c.sum()):
        if all(np.sqrt(((c - k) ** 2).sum()) >= merge for k in kept): kept.append(c)
    while len(kept) < n:
        P = np.array(kept); d = np.sqrt(((px[:, None, :] - P[None]) ** 2).sum(2)).min(1)
        if d.max() < 40: break
        seed = px[d.argmax()]; grp = px[np.sqrt(((px - seed) ** 2).sum(1)) < 30]
        kept.append(np.median(grp, 0).astype(int))
    return np.unique(np.array(kept, np.uint8), axis=0)


def apply_palette(im: Image.Image, pal: np.ndarray) -> Image.Image:
    a = np.asarray(im.convert("RGBA")).copy(); m = a[..., 3] > 0
    d = ((a[..., :3][m][:, None, :].astype(int) - pal[None].astype(int)) ** 2).sum(2)
    a[..., :3][m] = pal[d.argmin(1)]; a[..., 3] = np.where(m, 255, 0)
    return Image.fromarray(a, "RGBA")
