"""pixelize_renders.py — Blender 渲好的 8 方向序列 → 遊戲規格的格子圖（去背、硬邊、縮到 art 高度、色盤併色）。

    python pipeline/scripts/blender/pixelize_renders.py output/blender8 --game-size 23 --cell 102 [--out out.png]

用途：把 render_8dir.py 的輸出（每格 256×256、透明）轉成跟 assets/monsters3 同一套規格
（格 = cell、腳底 = cell−8、水平置中、alpha 只留 0/255、median-cut 32 色），
可以直接跟現有魔物 sheet 並排比較，或餵給 build_monster_8dir.py 的 --walk-src。
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

FOOT = 8
DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"]


def fill_transparent(a: np.ndarray) -> np.ndarray:
    from scipy import ndimage
    m = a[..., 3] > 0
    idx = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    out = a.copy()
    out[..., :3] = a[..., :3][idx[0], idx[1]]
    return out


def quantize(im: Image.Image, n: int = 32) -> Image.Image:
    a = np.asarray(im.convert("RGBA")).copy()
    m = a[..., 3] > 0
    px = a[..., :3][m].astype(np.uint8)
    if not len(px):
        return im
    side = int(np.ceil(np.sqrt(len(px))))
    buf = np.zeros((side * side, 3), np.uint8)
    buf[:len(px)] = px
    buf[len(px):] = px[0]
    q = Image.fromarray(buf.reshape(side, side, 3)).quantize(n, method=Image.Quantize.MEDIANCUT)
    pal = np.asarray(q.getpalette()[:n * 3]).reshape(-1, 3).astype(int)
    d = ((px[:, None, :].astype(int) - pal[None]) ** 2).sum(2)
    out = np.zeros_like(a)
    out[..., :3][m] = pal[d.argmin(1)]
    out[..., 3] = np.where(m, 255, 0)
    return Image.fromarray(out, "RGBA")


def cell_of(path: Path, art: int, cell: int, scale: float | None = None) -> Image.Image:
    a = fill_transparent(np.asarray(Image.open(path).convert("RGBA")).copy())
    al = a[..., 3] > 0
    ys, xs = np.nonzero(al)
    ch = ys.max() - ys.min() + 1
    s = scale if scale else art / ch
    w, h = max(1, round(a.shape[1] * s)), max(1, round(a.shape[0] * s))
    b = np.asarray(Image.fromarray(a, "RGBA").resize((w, h), Image.LANCZOS)).copy()
    b[..., 3] = np.where(b[..., 3] >= 96, 255, 0)
    al = b[..., 3] > 0
    ys, xs = np.nonzero(al)
    crop = Image.fromarray(b[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")
    band = np.asarray(crop)[..., 3] > 0
    band = band[max(0, band.shape[0] - 6):]
    cols = np.nonzero(band.any(0))[0]
    cx = (cols.mean() if len(cols) else crop.width / 2)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    canvas.alpha_composite(crop, (int(round(cell / 2 - cx)), cell - FOOT - crop.height))
    return quantize(canvas)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--game-size", type=float, default=23)
    ap.add_argument("--cell", type=int, default=102)
    ap.add_argument("--out", default="output/blender8/sheet-walk.png")
    a = ap.parse_args()
    art = round(a.game_size * 72 / 21)
    src = Path(a.src)
    sheet = Image.new("RGBA", (a.cell * 8, a.cell * len(DIRS)), (0, 0, 0, 0))
    for r, d in enumerate(DIRS):
        files = sorted((src / "walk" / d).glob("frame-*.png"))
        if not files:
            continue
        frame0 = cell_of(files[0], art, a.cell)
        for i, f in enumerate(files[:8]):
            c = cell_of(f, art, a.cell) if i else frame0
            sheet.alpha_composite(c, (i * a.cell, r * a.cell))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(a.out)
    print(f"{a.out} {sheet.size} cell={a.cell} art={art}")


if __name__ == "__main__":
    main()
