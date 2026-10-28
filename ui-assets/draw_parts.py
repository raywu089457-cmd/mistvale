"""draw_parts.py — 用程式畫「細像素」UI 零件（跟建築同等密度：1 px 細節，畫在 2x 尺寸再縮放顯示）。

為什麼不用 AI：PixelLab 不管畫布多大，內部像素塊固定約 7–11 px（實測 512→7 px、688→7 px、256→9.7 px），
換算下來一顆按鈕只有 9–98 個邏輯像素；建築本體是 4 px 塊、280×350 邏輯像素。要到同樣細只能自己畫。

輸出：ui-assets/fine/*.png
    panel.9s.png   48×48 九宮格面板（border 16）
    btn-primary.png / btn-secondary.png   96×40
    chip.png       96×28
    tab.png / tab-on.png  96×40
全部 1 px 描邊、1 px 高光、木頭 3 階、黃銅 2 階。
"""
from __future__ import annotations
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent / "fine"
OUT.mkdir(exist_ok=True)

EDGE = (26, 18, 10, 255)        # #1a120a 深棕近黑
WOOD_D = (58, 40, 22, 255)      # #3a2816
WOOD = (74, 51, 32, 255)        # #4a3320
WOOD_L = (107, 82, 54, 255)     # #6b5236
BRASS = (168, 132, 78, 255)     # #a8844e
BRASS_L = (201, 164, 104, 255)  # #c9a468
GOLD = (231, 190, 94, 255)      # #e7be5e
GOLD_L = (243, 217, 148, 255)   # #f3d994
GOLD_D = (170, 130, 62, 255)    # 陰影


def rounded(draw, box, r, fill, outline=None):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline)


def panel(size=48, border=16, hollow=True):
    """九宮格面板：外描邊→木板→黃銅內線→四角支架。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, size - 1, size - 1], fill=EDGE)
    d.rectangle([1, 1, size - 2, size - 2], fill=WOOD)
    d.rectangle([1, 1, size - 2, 2], fill=WOOD_L)            # 上緣高光
    d.rectangle([1, size - 3, size - 2, size - 2], fill=WOOD_D)
    # 黃銅內線
    d.rectangle([border - 3, border - 3, size - border + 2, size - border + 2], outline=BRASS)
    # 四角支架
    for cx, cy in ((0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)):
        sx, sy = 1 if cx == 0 else -1, 1 if cy == 0 else -1
        for i in range(0, 7):
            d.point((cx + sx * i, cy), fill=BRASS_L)
            d.point((cx, cy + sy * i), fill=BRASS_L)
        x0, x1 = sorted([cx + sx * 1, cx + sx * 2])
        y0, y1 = sorted([cy + sy * 1, cy + sy * 2])
        d.rectangle([x0, y0, x1, y1], fill=BRASS_L)
    if hollow:
        d.rectangle([border, border, size - border - 1, size - border - 1], fill=(44, 30, 15, 255))
    return im


def button(w=96, h=40, primary=True):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rounded(d, [0, 0, w - 1, h - 1], 4, EDGE)
    rounded(d, [1, 1, w - 2, h - 2], 3, WOOD)
    rounded(d, [1, 1, w - 2, 2], 1, WOOD_L)
    rounded(d, [1, h - 3, w - 2, h - 2], 1, WOOD_D)
    # 黃銅內線
    rounded(d, [3, 3, w - 4, h - 4], 2, None, BRASS)
    if primary:
        rounded(d, [5, 5, w - 6, h - 6], 2, GOLD)
        d.line([6, 6, w - 7, 6], fill=GOLD_L)               # 上緣亮線
        d.line([6, h - 7, w - 7, h - 7], fill=GOLD_D)       # 下緣暗線
        d.line([6, 7, 6, h - 8], fill=GOLD_L)
        d.line([w - 7, 7, w - 7, h - 8], fill=GOLD_D)
    else:
        rounded(d, [5, 5, w - 6, h - 6], 2, WOOD_L)
        d.line([6, 6, w - 7, 6], fill=(126, 98, 64, 255))
        d.line([6, h - 7, w - 7, h - 7], fill=WOOD_D)
    # 兩端黃銅釘
    for x in (8, w - 9):
        d.rectangle([x, h // 2 - 1, x + 1, h // 2 + 1], fill=BRASS_L)
    return im


def chip(w=96, h=28):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rounded(d, [0, 0, w - 1, h - 1], 3, EDGE)
    rounded(d, [1, 1, w - 2, h - 2], 2, (36, 24, 12, 255))
    rounded(d, [2, 2, w - 3, h - 3], 2, None, BRASS)
    d.line([3, 3, w - 4, 3], fill=(58, 40, 22, 255))
    return im


def tab(w=96, h=40, on=False):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rounded(d, [0, 1, w - 1, h - 1], 3, EDGE)
    rounded(d, [1, 2, w - 2, h - 1], 2, GOLD if on else WOOD)
    if on:
        d.line([3, 3, w - 4, 3], fill=GOLD_L)
    else:
        d.line([2, 2, w - 3, 2], fill=WOOD_L)
    d.line([3, h - 2, w - 4, h - 2], fill=GOLD_D if on else WOOD_D)
    return im


if __name__ == "__main__":
    panel().save(OUT / "panel.9s.png")
    button(96, 40, True).save(OUT / "btn-primary.png")
    button(96, 40, False).save(OUT / "btn-secondary.png")
    chip().save(OUT / "chip.png")
    tab(on=False).save(OUT / "tab.png")
    tab(on=True).save(OUT / "tab-on.png")
    print("wrote", OUT)
