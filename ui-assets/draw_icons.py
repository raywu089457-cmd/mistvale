"""draw_icons.py — 程式畫 16×16 UI 圖示（1 px 描邊、木頭/黃銅/金屬同一組色）。

    python ui-assets/draw_icons.py

為什麼：PixelLab 的圖示是 AI 生的 16–22 px，內部像素塊 7–11 px（等於只有 2–3 個邏輯像素），
跟新版 1 px 的介面放在一起會明顯「粗一格」。這裡用程式畫，邊界乾淨、每個像素自己控。

輸出：assets/ui/ic-<name>.png（build.mjs 會內嵌成 PIXEL_ASSETS.ui["ic-..."]）
"""
from __future__ import annotations

import math
import pathlib

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parents[1] / "assets" / "ui"
OUT.mkdir(parents=True, exist_ok=True)
S = 16

OUTLINE = (26, 18, 10, 255)
WOOD_D = (58, 40, 22, 255)
WOOD = (74, 51, 32, 255)
WOOD_L = (107, 82, 54, 255)
BRASS = (168, 132, 78, 255)
BRASS_L = (201, 164, 104, 255)
GOLD = (231, 190, 94, 255)
GOLD_L = (243, 217, 148, 255)
GOLD_D = (146, 108, 44, 255)
STEEL = (127, 143, 166, 255)
STEEL_L = (188, 199, 214, 255)
STEEL_D = (74, 86, 104, 255)
GREEN = (111, 158, 87, 255)
GREEN_D = (66, 100, 52, 255)
BLUE = (74, 127, 191, 255)
BLUE_L = (150, 198, 235, 255)
RED = (176, 64, 56, 255)
RED_L = (214, 116, 96, 255)
BONE = (232, 226, 206, 255)
BONE_D = (176, 166, 142, 255)
PURPLE = (122, 79, 191, 255)


def canvas():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def outline_disc(d, cx, cy, r, fill, edge=OUTLINE):
    d.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=edge)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def poly(d, pts, fill, edge=OUTLINE):
    d.polygon(pts, fill=edge, outline=edge)
    inner = [(x + (0.9 if x < S / 2 else -0.9), y + (0.9 if y < S / 2 else -0.9)) for x, y in pts]
    d.polygon(inner, fill=fill)


def rect(d, box, fill, edge=OUTLINE):
    x0, y0, x1, y1 = box
    d.rectangle([x0 - 1, y0 - 1, x1 + 1, y1 + 1], fill=edge)
    d.rectangle([x0, y0, x1, y1], fill=fill)


ICONS = {}


def icon(fn):
    ICONS[fn.__name__] = fn
    return fn


@icon
def gold():
    im, d = canvas()
    outline_disc(d, 8, 8, 6, GOLD)
    d.ellipse([3, 3, 12, 12], outline=GOLD_D)
    d.arc([3, 3, 12, 12], 200, 340, fill=GOLD_L)
    d.point((5, 4), fill=GOLD_L); d.point((4, 5), fill=GOLD_L)
    d.line([6, 8, 10, 8], fill=GOLD_D)
    return im


@icon
def gems():
    im, d = canvas()
    poly(d, [(8, 2), (13, 7), (8, 14), (3, 7)], BLUE)
    d.line([3, 7, 13, 7], fill=BLUE_L)
    d.polygon([(8, 2), (10, 7), (8, 14), (6, 7)], fill=BLUE_L)
    d.polygon([(8, 3), (9, 7), (8, 12)], fill=(196, 226, 248, 255))
    return im


@icon
def wood():
    im, d = canvas()
    rect(d, (2, 5, 13, 10), WOOD)
    d.rectangle([2, 5, 13, 6], fill=WOOD_L)
    d.rectangle([2, 9, 13, 10], fill=WOOD_D)
    d.ellipse([11, 5, 13, 10], fill=BRASS_L, outline=OUTLINE)
    d.ellipse([12, 7, 12, 8], fill=BRASS)
    return im


@icon
def ore():
    im, d = canvas()
    poly(d, [(4, 12), (2, 8), (6, 3), (12, 4), (13, 9), (10, 13)], (143, 138, 128, 255))
    d.polygon([(6, 4), (11, 5), (9, 9), (5, 8)], fill=(178, 173, 160, 255))
    d.line([7, 10, 11, 11], fill=STEEL_L)
    d.point((5, 11), fill=STEEL)
    return im


@icon
def herb():
    im, d = canvas()
    poly(d, [(8, 14), (3, 8), (5, 3), (9, 2), (12, 6), (10, 11)], GREEN)
    d.line([8, 13, 8, 4], fill=GREEN_D)
    d.line([8, 9, 5, 7], fill=GREEN_D)
    d.line([8, 7, 11, 5], fill=GREEN_D)
    return im


@icon
def cloth():
    im, d = canvas()
    rect(d, (2, 4, 13, 11), (206, 196, 172, 255))
    d.line([2, 7, 13, 7], fill=(166, 154, 128, 255))
    d.line([2, 9, 13, 9], fill=(166, 154, 128, 255))
    d.line([5, 4, 5, 11], fill=(186, 174, 150, 255))
    return im


@icon
def flour():
    im, d = canvas()
    poly(d, [(5, 13), (3, 7), (6, 3), (10, 3), (13, 7), (11, 13)], (222, 208, 176, 255))
    d.line([6, 3, 10, 3], fill=(246, 238, 214, 255))
    d.ellipse([7, 6, 9, 8], fill=(186, 168, 132, 255))
    d.line([5, 10, 11, 10], fill=(198, 182, 150, 255))
    return im


@icon
def leather():
    im, d = canvas()
    poly(d, [(4, 4), (11, 3), (13, 8), (9, 13), (3, 10)], (139, 106, 76, 255))
    d.polygon([(6, 6), (9, 6), (9, 10), (6, 9)], fill=(176, 138, 100, 255))
    return im


@icon
def food():
    im, d = canvas()
    d.ellipse([1, 4, 14, 12], fill=OUTLINE)
    d.ellipse([2, 5, 13, 11], fill=(198, 148, 84, 255))
    d.arc([3, 6, 12, 10], 200, 340, fill=(232, 190, 124, 255))
    for x in (5, 8, 11):
        d.line([x, 6, x - 1, 10], fill=(150, 106, 56, 255))
    return im


@icon
def drink():
    im, d = canvas()
    poly(d, [(4, 4), (11, 4), (10, 13), (5, 13)], (176, 122, 74, 255))
    d.rectangle([4, 4, 11, 5], fill=(214, 168, 110, 255))
    d.rectangle([5, 7, 10, 11], fill=(126, 68, 62, 255))
    d.line([11, 6, 13, 7, 13, 9, 11, 10], fill=OUTLINE)
    return im


@icon
def bed():
    im, d = canvas()
    rect(d, (2, 8, 13, 12), (150, 112, 76, 255))
    d.rectangle([2, 6, 13, 8], fill=(226, 216, 196, 255))
    d.rectangle([3, 5, 8, 7], fill=(236, 228, 210, 255))
    d.line([2, 12, 2, 13], fill=OUTLINE); d.line([13, 12, 13, 13], fill=OUTLINE)
    return im


@icon
def bandage():
    im, d = canvas()
    d.ellipse([2, 2, 13, 13], fill=OUTLINE)
    d.ellipse([3, 3, 12, 12], fill=(234, 226, 206, 255))
    d.ellipse([6, 6, 9, 9], fill=(198, 186, 162, 255))
    d.line([8, 5, 8, 11], fill=RED); d.line([5, 8, 11, 8], fill=RED)
    return im


@icon
def hunter():
    im, d = canvas()
    poly(d, [(8, 2), (13, 8), (12, 14), (4, 14), (3, 8)], (95, 120, 78, 255))
    d.polygon([(6, 6), (10, 6), (10, 10), (6, 10)], fill=(58, 42, 26, 255))
    d.point((7, 8), fill=GOLD_L); d.point((9, 8), fill=GOLD_L)
    return im


@icon
def hammer():
    im, d = canvas()
    rect(d, (3, 3, 12, 6), STEEL)
    d.rectangle([3, 3, 12, 4], fill=STEEL_L)
    d.rectangle([3, 5, 12, 6], fill=STEEL_D)
    d.line([7, 7, 7, 14], fill=WOOD_D)
    d.line([8, 7, 8, 14], fill=WOOD)
    return im


@icon
def anvil():
    im, d = canvas()
    poly(d, [(2, 5), (14, 5), (12, 8), (10, 8), (11, 11), (5, 11), (6, 8), (3, 8)], STEEL_D)
    d.rectangle([3, 11, 12, 13], fill=STEEL)
    d.line([3, 5, 13, 5], fill=STEEL_L)
    return im


@icon
def trade():
    im, d = canvas()
    d.line([3, 5, 12, 5], fill=GOLD_L, width=1)
    d.polygon([(11, 3), (14, 5), (11, 7)], fill=GOLD)
    d.line([13, 10, 4, 10], fill=WOOD_L)
    d.polygon([(5, 8), (2, 10), (5, 12)], fill=BRASS_L)
    return im


@icon
def scroll():
    im, d = canvas()
    rect(d, (3, 3, 12, 12), (226, 214, 184, 255))
    d.rectangle([3, 2, 12, 3], fill=BRASS_L)
    d.rectangle([3, 12, 12, 13], fill=BRASS)
    for y in (5, 7, 9):
        d.line([5, y, 10, y], fill=(150, 132, 100, 255))
    return im


@icon
def skull():
    im, d = canvas()
    d.ellipse([2, 2, 13, 12], fill=OUTLINE)
    d.ellipse([3, 3, 12, 11], fill=BONE)
    d.rectangle([6, 10, 9, 13], fill=BONE)
    d.rectangle([4, 6, 6, 8], fill=(38, 30, 22, 255))
    d.rectangle([9, 6, 11, 8], fill=(38, 30, 22, 255))
    d.point((8, 9), fill=BONE_D)
    return im


@icon
def swords():
    im, d = canvas()
    d.line([3, 13, 12, 3], fill=STEEL_L)
    d.line([2, 12, 3, 13], fill=WOOD_D)
    d.line([12, 13, 3, 3], fill=STEEL)
    d.line([13, 12, 12, 13], fill=WOOD_D)
    d.line([4, 5, 6, 7], fill=STEEL_L)
    d.line([10, 5, 12, 7], fill=STEEL)
    return im


@icon
def dungeon():
    im, d = canvas()
    d.rectangle([2, 2, 13, 14], fill=OUTLINE)
    d.rectangle([3, 3, 12, 14], fill=(60, 56, 52, 255))
    d.ellipse([3, 2, 12, 12], fill=(72, 68, 62, 255))
    d.rectangle([5, 7, 10, 14], fill=(18, 14, 10, 255))
    for x in (6, 8, 10):
        d.line([x, 8, x, 13], fill=(96, 88, 76, 255))
    return im


@icon
def hall():
    im, d = canvas()
    poly(d, [(8, 2), (14, 7), (2, 7)], RED)
    rect(d, (3, 7, 12, 14), (120, 86, 58, 255))
    d.rectangle([6, 10, 9, 14], fill=(60, 38, 22, 255))
    d.point((5, 9), fill=GOLD_L); d.point((10, 9), fill=GOLD_L)
    return im


@icon
def map():
    im, d = canvas()
    rect(d, (2, 4, 13, 12), (228, 216, 186, 255))
    d.line([5, 4, 5, 12], fill=(176, 160, 128, 255))
    d.line([10, 4, 10, 12], fill=(176, 160, 128, 255))
    d.line([3, 9, 5, 7, 8, 9, 10, 6, 12, 8], fill=(150, 76, 60, 255))
    d.point((8, 9), fill=RED)
    return im


@icon
def gear():
    im, d = canvas()
    for a in range(0, 360, 45):
        x = 8 + math.cos(math.radians(a)) * 6
        y = 8 + math.sin(math.radians(a)) * 6
        d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=OUTLINE)
    outline_disc(d, 8, 8, 5, BRASS)
    d.ellipse([6, 6, 10, 10], fill=(46, 34, 20, 255))
    return im


@icon
def heal():
    im, d = canvas()
    rect(d, (6, 2, 10, 14), (232, 226, 208, 255))
    rect(d, (2, 6, 14, 10), (232, 226, 208, 255))
    d.rectangle([6, 7, 10, 9], fill=GREEN)
    return im


@icon
def horn():
    im, d = canvas()
    poly(d, [(3, 10), (12, 3), (13, 5), (6, 12)], BRASS)
    d.line([3, 10, 4, 13], fill=BRASS_L)
    d.ellipse([2, 10, 5, 13], fill=BRASS_L, outline=OUTLINE)
    return im


@icon
def boss():
    im, d = canvas()
    poly(d, [(2, 12), (2, 5), (5, 8), (8, 3), (11, 8), (14, 5), (14, 12)], GOLD)
    d.line([2, 11, 14, 11], fill=GOLD_D)
    d.point((5, 6), fill=RED_L); d.point((8, 5), fill=RED_L); d.point((11, 6), fill=RED_L)
    return im


@icon
def plus():
    im, d = canvas()
    d.rectangle([6, 2, 10, 14], fill=OUTLINE)
    d.rectangle([2, 6, 14, 10], fill=OUTLINE)
    d.rectangle([7, 3, 9, 13], fill=GOLD_L)
    d.rectangle([3, 7, 13, 9], fill=GOLD_L)
    return im


@icon
def close():
    im, d = canvas()
    d.line([3, 3, 12, 12], fill=OUTLINE, width=3)
    d.line([12, 3, 3, 12], fill=OUTLINE, width=3)
    d.line([3, 3, 12, 12], fill=BRASS_L, width=1)
    d.line([12, 3, 3, 12], fill=BRASS_L, width=1)
    return im


@icon
def arrow():
    im, d = canvas()
    poly(d, [(3, 6), (9, 6), (9, 4), (14, 8), (9, 12), (9, 10), (3, 10)], BRASS_L)
    return im


@icon
def up():
    im, d = canvas()
    poly(d, [(8, 3), (13, 10), (3, 10)], BRASS_L)
    return im


if __name__ == "__main__":
    made = 0
    for name, fn in ICONS.items():
        fn().save(OUT / f"ic-{name}.png")
        made += 1
    print(made, "icons ->", OUT)
