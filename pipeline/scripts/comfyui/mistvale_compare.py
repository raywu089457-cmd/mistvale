"""mistvale_compare.py — 把生出來的圖跟 Mistvale 的基準並排，並量化風格差距。

基準：
  assets/title.png       登入概念圖（專案明訂的驗收基準）
  assets/buildings14.png 4x3 建築圖集（單一建築的風格基準）

量化指標（都只看「非背景」像素）：
  色相分佈     — 整體色調對不對
  飽和度中位數 — 夠不夠鮮豔
  明度中位數   — 夠不夠亮
  描邊比例     — 暗到接近 #29272d 的像素佔比（Mistvale 的特徵）
  暖冷比       — 暖色像素 / 冷色像素

用法：
  venv\\Scripts\\python.exe mistvale_compare.py out/tavern_01.png [更多圖...]
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

MISTVALE = r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale"
BASELINE = [
    ("title.png", os.path.join(MISTVALE, "assets", "title.png")),
    ("buildings14.png", os.path.join(MISTVALE, "assets", "buildings14.png")),
    ("hall.png", os.path.join(MISTVALE, "assets", "hall.png")),
]


def stats(im: Image.Image, bg: tuple[int, int, int] | None = None) -> dict:
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape

    if bg is None:
        ring = np.concatenate([a[:max(2, h // 50)].reshape(-1, 3),
                               a[-max(2, h // 50):].reshape(-1, 3),
                               a[:, :max(2, w // 50)].reshape(-1, 3),
                               a[:, -max(2, w // 50):].reshape(-1, 3)])
        bg = tuple(np.median(ring, 0).astype(int))

    # 洋紅底 / 純色底都排掉，只看主體
    dist = np.sqrt(((a - np.array(bg, np.float32)) ** 2).sum(2))
    keep = dist > 60
    px = a[keep]
    if len(px) < 50:
        px = a.reshape(-1, 3)

    mx, mn = px.max(1), px.min(1)
    df = mx - mn
    sat = np.where(mx > 0, df / np.maximum(mx, 1e-6), 0)
    val = mx / 255.0

    # 色相
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    safe = np.maximum(df, 1e-6)
    hue = np.zeros(len(px))
    m = mx == r
    hue[m] = (60 * ((g - b) / safe) % 360)[m]
    m = mx == g
    hue[m] = (60 * ((b - r) / safe) + 120)[m]
    m = mx == b
    hue[m] = (60 * ((r - g) / safe) + 240)[m]

    lum = px.mean(1)
    warm = ((hue < 70) | (hue > 300)) & (sat > 0.15)
    cool = (hue > 140) & (hue < 280) & (sat > 0.15)

    # 描邊：又暗又不鮮豔
    outline = (lum < 70) & (sat < 0.45)

    return {
        "px": len(px),
        "sat": float(np.median(sat)),
        "val": float(np.median(val)),
        "hue_sat": float(np.median(hue[sat > 0.2])) if (sat > 0.2).any() else float("nan"),
        "hue_iqr": float(np.subtract(*np.percentile(hue[sat > 0.2], [75, 25])))
        if (sat > 0.2).sum() > 20 else float("nan"),
        "outline": float(outline.mean()),
        "warm": float(warm.mean()),
        "cool": float(cool.mean()),
    }


def board(im: Image.Image, cell: int = 300) -> Image.Image:
    s = max(1, cell // max(im.size))
    big = im.convert("RGB").resize((im.width * s, im.height * s), Image.NEAREST)
    cv = Image.new("RGB", (cell, cell), (26, 26, 30))
    cv.paste(big, ((cell - big.width) // 2, (cell - big.height) // 2))
    return cv


def main(argv: list[str]) -> int:
    from PIL import ImageDraw

    files = [(os.path.basename(f), f) for f in argv]
    if not files:
        print("用法：mistvale_compare.py <圖...>")
        return 1

    items = [(n, f) for n, f in BASELINE if os.path.exists(f)] + files
    rows = []
    print(f"{'檔案':28s} {'飽和':>6s} {'明度':>6s} {'色相':>6s} {'色相IQR':>8s} "
          f"{'描邊':>6s} {'暖':>6s} {'冷':>6s}")
    print("-" * 82)
    for name, f in items:
        im = Image.open(f)
        s = stats(im)
        rows.append((name, f, s))
        print(f"{name[:28]:28s} {s['sat']:6.2f} {s['val']:6.2f} {s['hue_sat']:6.0f} "
              f"{s['hue_iqr']:8.0f} {s['outline']:6.3f} {s['warm']:6.2f} {s['cool']:6.2f}")

    cell = 300
    sheet = Image.new("RGB", (cell * len(rows), cell + 24), (26, 26, 30))
    d = ImageDraw.Draw(sheet)
    for i, (name, f, _) in enumerate(rows):
        sheet.paste(board(Image.open(f), cell), (i * cell, 0))
        d.text((i * cell + 6, cell + 6), os.path.basename(f)[:40], fill=(230, 230, 230))
    out = "projects/mistvale/out/_compare.png"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    print(f"\n並排圖：{out}（最左邊兩張是基準）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
