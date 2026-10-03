"""metrics.py — 遊戲截圖 vs 概念圖（assets/title.png）的量化比對。

用法：python pipeline/scripts/align/metrics.py <game.png> [--side out.png] [--json out.json]
兩張都縮成 500×500 再比：
  hist_bc / hist_inter  8×8×8 RGB 直方圖的 Bhattacharyya / 交集（1 = 色彩分佈相同）
  lum / sat             平均亮度、飽和度（跟概念圖的差）
  groups                色群比例：暗部、石材米灰、綠、土黃褐、紅、藍、紫、青（各群差的總和 = group_l1）
  detail                亮度 Laplacian 平均絕對值（細節密度；概念圖是高細節像素畫）
  conform / pal_de      像素落在概念圖 48 色 k-means 色票 RGB 距離 < 32 的比例 / 平均距離
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
TITLE = ROOT / "assets" / "title.png"
PAL_CACHE = Path(__file__).with_name("title-palette48.json")
N = 500

def load(p):
    return np.asarray(Image.open(p).convert("RGB").resize((N, N), Image.LANCZOS)).astype(np.float32)

def palette(ref):
    if PAL_CACHE.exists():
        return np.array(json.loads(PAL_CACHE.read_text()), np.float32)
    rng = np.random.default_rng(7)
    px = ref.reshape(-1, 3)[rng.choice(N * N, 40000, replace=False)]
    c = px[rng.choice(len(px), 48, replace=False)].copy()
    for _ in range(40):
        d = ((px[:, None, :] - c[None]) ** 2).sum(2); a = d.argmin(1)
        for k in range(48):
            m = px[a == k]
            if len(m): c[k] = m.mean(0)
    PAL_CACHE.write_text(json.dumps(np.round(c).astype(int).tolist()))
    return c

def hsv(img):
    r, g, b = img[..., 0] / 255, img[..., 1] / 255, img[..., 2] / 255
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    d = mx - mn + 1e-9
    h = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0)
    return h, s, mx

def groups(img):
    h, s, v = hsv(img); lum = img @ np.array([.299, .587, .114], np.float32)
    dark = lum < 45
    stone = ~dark & (s < .28)
    col = ~dark & ~stone
    gs = {"dark": dark, "stone": stone,
          "green": col & (h >= 65) & (h < 170), "earth": col & (h >= 18) & (h < 65),
          "red": col & ((h < 18) | (h >= 335)), "cyan": col & (h >= 170) & (h < 195),
          "blue": col & (h >= 195) & (h < 260), "purple": col & (h >= 260) & (h < 335)}
    return {k: float(v.mean()) for k, v in gs.items()}

def metrics(game, ref, pal):
    q = lambda im: (im // 32).astype(int)
    def hist(im):
        b = q(im); idx = b[..., 0] * 64 + b[..., 1] * 8 + b[..., 2]
        return np.bincount(idx.ravel(), minlength=512) / idx.size
    ha, hb = hist(ref), hist(game)
    lum = lambda im: im @ np.array([.299, .587, .114], np.float32)
    def detail(im):
        L = lum(im); lap = 4 * L[1:-1, 1:-1] - L[:-2, 1:-1] - L[2:, 1:-1] - L[1:-1, :-2] - L[1:-1, 2:]
        return float(np.abs(lap).mean())
    _, s_ref, _ = hsv(ref); _, s_g, _ = hsv(game)
    d = np.sqrt(((game.reshape(-1, 1, 3) - pal[None]) ** 2).sum(2)).min(1)
    gr, gg = groups(ref), groups(game)
    return {"hist_bc": round(float(np.sqrt(ha * hb).sum()), 3), "hist_inter": round(float(np.minimum(ha, hb).sum()), 3),
            "lum": [round(float(lum(game).mean()), 1), round(float(lum(ref).mean()), 1)],
            "sat": [round(float(s_g.mean()), 3), round(float(s_ref.mean()), 3)],
            "detail": [round(detail(game), 2), round(detail(ref), 2)],
            "conform": round(float((d < 32).mean()), 3), "pal_de": round(float(d.mean()), 1),
            "group_l1": round(sum(abs(gg[k] - gr[k]) for k in gr), 3),
            "groups": {k: [round(gg[k], 3), round(gr[k], 3)] for k in gr}}

if __name__ == "__main__":
    args = sys.argv[1:]; game_p = args[0]
    ref = load(TITLE); game = load(game_p); pal = palette(ref)
    m = metrics(game, ref, pal)
    if "--side" in args:
        out = args[args.index("--side") + 1]
        side = Image.new("RGB", (N * 2 + 8, N), (0, 0, 0))
        side.paste(Image.fromarray(ref.astype(np.uint8)), (0, 0)); side.paste(Image.fromarray(game.astype(np.uint8)), (N + 8, 0))
        side.save(out)
    if "--json" in args:
        Path(args[args.index("--json") + 1]).write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(m, ensure_ascii=False))
