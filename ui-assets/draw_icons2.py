"""draw_icons2.py — 圖示第二版：改用「三階立體」畫法（上緣亮、本體、下緣暗），形狀重畫。

    python ui-assets/draw_icons2.py

第一版（draw_icons.py）是平塗剪影，縮到 26 px 顯示時形狀太笨（鎚子＝方塊＋木棍、地下城＝方框）。
這一版每個物件都用 16×16 網格明確排出輪廓，加 1 px 描邊＋上亮下暗，並統一光源在左上。

輸出：assets/ui/ic-*.png（覆蓋第一版）
"""
from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parents[1] / "assets" / "ui"
OUT.mkdir(parents=True, exist_ok=True)
S = 16

O = (24, 16, 8, 255)          # 描邊
WOOD_D = (52, 36, 20, 255)
WOOD = (74, 51, 32, 255)
WOOD_L = (110, 84, 56, 255)
BRASS_D = (150, 116, 66, 255)
BRASS = (186, 146, 88, 255)
BRASS_L = (222, 186, 126, 255)
GOLD_D = (168, 124, 44, 255)
GOLD = (222, 176, 74, 255)
GOLD_L = (250, 224, 150, 255)
STEEL_D = (76, 88, 106, 255)
STEEL = (126, 142, 164, 255)
STEEL_L = (196, 208, 222, 255)
GREEN_D = (60, 96, 48, 255)
GREEN = (104, 152, 82, 255)
GREEN_L = (156, 200, 122, 255)
BLUE_D = (48, 92, 150, 255)
BLUE = (86, 142, 202, 255)
BLUE_L = (172, 214, 246, 255)
PUR_D = (78, 52, 128, 255)
PUR = (122, 84, 186, 255)
PUR_L = (176, 142, 224, 255)
RED_D = (122, 44, 38, 255)
RED = (176, 64, 56, 255)
RED_L = (222, 128, 106, 255)
BONE_D = (170, 160, 136, 255)
BONE = (222, 214, 190, 255)
BONE_L = (246, 242, 226, 255)
DARK = (20, 14, 8, 255)


def ic(fn):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fn(ImageDraw.Draw(im))
    return im


def box3(d, x0, y0, x1, y1, fill, light=None, dark=None, outline=True):
    """三階方塊：外描邊 → 本體 → 上/左亮線 → 下/右暗線。"""
    if outline:
        d.rectangle([x0 - 1, y0 - 1, x1 + 1, y1 + 1], fill=O)
    d.rectangle([x0, y0, x1, y1], fill=fill)
    if light:
        d.line([x0, y0, x1, y0], fill=light)
        d.line([x0, y0, x0, y1], fill=light)
    if dark:
        d.line([x0, y1, x1, y1], fill=dark)
        d.line([x1, y0, x1, y1], fill=dark)


def disc3(d, cx, cy, r, fill, light, dark):
    d.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=O)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    d.arc([cx - r, cy - r, cx + r, cy + r], 170, 300, fill=light)
    d.arc([cx - r, cy - r, cx + r, cy + r], 20, 130, fill=dark)


def poly3(d, pts, fill, light, dark):
    d.polygon(pts, fill=O)
    d.polygon([(x, y) for x, y in pts], fill=fill)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    d.line([(min(xs) + 1, min(ys) + 1), (max(xs) - 1, min(ys) + 1)], fill=light)
    d.line([(min(xs) + 1, max(ys) - 1), (max(xs) - 1, max(ys) - 1)], fill=dark)


ICONS = {}


def add(name, fn):
    ICONS[name] = fn


def i_gold(d):
    disc3(d, 8, 8, 6, GOLD, GOLD_L, GOLD_D)
    d.ellipse([5, 5, 10, 10], fill=GOLD_L)
    d.ellipse([6, 6, 9, 9], fill=GOLD)
    d.line([5, 10, 10, 10], fill=GOLD_D)
    d.point((5, 4), fill=(255, 250, 224, 255))


def i_gems(d):
    poly3(d, [(8, 1), (14, 6), (8, 15), (2, 6)], BLUE, BLUE_L, BLUE_D)
    d.line([2, 6, 14, 6], fill=BLUE_L)
    d.polygon([(8, 2), (10, 6), (8, 14), (6, 6)], fill=(206, 234, 252, 255))
    d.line([6, 7, 8, 13], fill=BLUE)


def i_wood(d):
    box3(d, 1, 5, 12, 10, WOOD, WOOD_L, WOOD_D)
    d.line([2, 7, 11, 7], fill=WOOD_L)
    d.ellipse([10, 4, 14, 11], fill=BRASS_D, outline=O)
    d.ellipse([11, 6, 13, 9], fill=BRASS_L)
    d.line([3, 9, 6, 9], fill=WOOD_D)


def i_ore(d):
    poly3(d, [(3, 13), (1, 8), (5, 3), (11, 4), (14, 9), (10, 14)], (128, 124, 116, 255),
          (168, 164, 154, 255), (86, 82, 76, 255))
    d.polygon([(5, 5), (10, 6), (8, 10), (4, 9)], fill=(182, 178, 168, 255))
    d.line([6, 5, 9, 6], fill=STEEL_L)
    d.point((11, 11), fill=STEEL_L)


def i_herb(d):
    d.line([8, 15, 8, 6], fill=GREEN_D)
    poly3(d, [(8, 4), (12, 2), (13, 7), (8, 9)], GREEN, GREEN_L, GREEN_D)
    poly3(d, [(8, 6), (4, 4), (2, 9), (8, 11)], GREEN, GREEN_L, GREEN_D)
    d.line([9, 4, 12, 3], fill=GREEN_L)


def i_cloth(d):
    box3(d, 1, 4, 13, 12, (196, 186, 162, 255), (222, 214, 194, 255), (150, 140, 118, 255))
    d.line([1, 7, 13, 7], fill=(166, 156, 134, 255))
    d.line([1, 10, 13, 10], fill=(166, 156, 134, 255))
    d.line([6, 4, 6, 12], fill=(176, 166, 142, 255))


def i_flour(d):
    poly3(d, [(4, 13), (2, 7), (5, 3), (11, 3), (14, 7), (12, 13)], (216, 202, 170, 255),
          (240, 232, 208, 255), (176, 162, 130, 255))
    d.line([5, 3, 11, 3], fill=(250, 244, 226, 255))
    d.ellipse([7, 6, 9, 8], fill=(184, 166, 130, 255))
    d.line([5, 10, 11, 10], fill=(196, 180, 148, 255))


def i_leather(d):
    poly3(d, [(3, 4), (12, 3), (14, 8), (9, 14), (2, 11)], (132, 98, 68, 255),
          (172, 132, 94, 255), (92, 66, 44, 255))
    d.polygon([(6, 6), (9, 6), (9, 10), (6, 9)], fill=(158, 120, 84, 255))


def i_food(d):
    d.ellipse([0, 4, 15, 12], fill=O)
    d.ellipse([1, 5, 14, 11], fill=(196, 146, 82, 255))
    d.arc([2, 5, 13, 10], 190, 330, fill=(226, 182, 116, 255))
    for x in (5, 8, 11):
        d.line([x, 6, x - 1, 9], fill=(146, 102, 54, 255))


def i_drink(d):
    poly3(d, [(4, 4), (11, 4), (10, 13), (5, 13)], (168, 116, 70, 255), (200, 154, 100, 255), (124, 82, 48, 255))
    d.rectangle([4, 4, 11, 5], fill=(210, 168, 112, 255))
    d.rectangle([5, 7, 10, 11], fill=(124, 66, 60, 255))
    d.line([12, 6, 14, 8], fill=O); d.line([14, 8, 12, 10], fill=O)


def i_bed(d):
    box3(d, 1, 8, 14, 12, (146, 108, 74, 255), (176, 138, 100, 255), (104, 74, 48, 255))
    box3(d, 1, 6, 14, 8, (226, 216, 196, 255), (246, 240, 226, 255), (186, 176, 156, 255))
    box3(d, 2, 4, 7, 7, (238, 230, 212, 255), (252, 248, 238, 255), (196, 188, 168, 255))
    d.line([1, 12, 1, 14], fill=O); d.line([14, 12, 14, 14], fill=O)


def i_bandage(d):
    disc3(d, 8, 8, 6, (232, 224, 204, 255), (250, 246, 234, 255), (188, 178, 156, 255))
    d.line([8, 4, 8, 12], fill=RED); d.line([4, 8, 12, 8], fill=RED)
    d.line([8, 4, 8, 12], fill=RED_L) if False else None


def i_hunter(d):
    poly3(d, [(8, 1), (14, 8), (12, 15), (4, 15), (2, 8)], (88, 112, 72, 255), (124, 150, 104, 255), (58, 76, 48, 255))
    d.polygon([(5, 7), (11, 7), (11, 12), (5, 12)], fill=(44, 32, 20, 255))
    d.rectangle([6, 8, 7, 9], fill=GOLD_L); d.rectangle([9, 8, 10, 9], fill=GOLD_L)
    d.line([4, 13, 12, 13], fill=(58, 76, 48, 255))


def i_hammer(d):
    box3(d, 2, 2, 13, 6, STEEL, STEEL_L, STEEL_D)
    d.rectangle([2, 2, 3, 6], fill=STEEL_L)
    box3(d, 6, 6, 9, 15, WOOD, WOOD_L, WOOD_D, outline=True)
    d.line([7, 7, 7, 14], fill=WOOD_L)


def i_anvil(d):
    poly3(d, [(1, 4), (15, 4), (12, 7), (11, 8), (11, 10), (5, 10), (5, 8), (2, 7)],
          STEEL_D, (128, 140, 160, 255), (52, 60, 74, 255))
    d.line([2, 4, 14, 4], fill=STEEL_L)
    box3(d, 4, 10, 11, 12, STEEL, STEEL_L, STEEL_D)
    box3(d, 3, 12, 12, 14, STEEL_D, None, None)


def i_trade(d):
    d.line([2, 5, 12, 5], fill=GOLD_L)
    d.polygon([(11, 2), (15, 5), (11, 8)], fill=GOLD)
    d.line([14, 10, 4, 10], fill=BRASS_L)
    d.polygon([(5, 7), (1, 10), (5, 13)], fill=BRASS)


def i_scroll(d):
    box3(d, 3, 3, 12, 12, (224, 212, 182, 255), (244, 238, 222, 255), (176, 164, 138, 255))
    box3(d, 2, 1, 13, 3, BRASS, BRASS_L, BRASS_D)
    box3(d, 2, 12, 13, 14, BRASS_D, BRASS, None)
    for y in (5, 7, 9):
        d.line([5, y, 10, y], fill=(146, 132, 106, 255))


def i_skull(d):
    disc3(d, 8, 7, 6, BONE, BONE_L, BONE_D)
    d.rectangle([5, 11, 10, 14], fill=O); d.rectangle([6, 11, 9, 13], fill=BONE)
    d.rectangle([4, 5, 6, 7], fill=DARK); d.rectangle([9, 5, 11, 7], fill=DARK)
    d.point((5, 6), fill=RED_L); d.point((10, 6), fill=RED_L)
    d.line([7, 9, 8, 9], fill=BONE_D)


def i_swords(d):
    d.line([2, 13, 13, 2], fill=O, width=3); d.line([2, 13, 13, 2], fill=STEEL_L)
    d.line([13, 13, 2, 2], fill=O, width=3); d.line([13, 13, 2, 2], fill=STEEL)
    d.line([3, 10, 5, 12], fill=BRASS, width=2)
    d.line([12, 10, 10, 12], fill=BRASS, width=2)


def i_dungeon(d):
    d.rectangle([1, 1, 14, 15], fill=O)
    d.rectangle([2, 2, 13, 15], fill=(64, 60, 56, 255))
    d.ellipse([2, 0, 13, 11], fill=(82, 76, 70, 255))
    d.rectangle([4, 6, 11, 15], fill=DARK)
    for x in (5, 7, 9, 11):
        d.line([x, 7, x, 14], fill=(96, 88, 76, 255))
    d.line([3, 11, 3, 14], fill=(52, 48, 44, 255))


def i_hall(d):
    poly3(d, [(8, 1), (15, 7), (1, 7)], (150, 62, 52, 255), (196, 96, 78, 255), (104, 40, 34, 255))
    box3(d, 2, 7, 13, 15, (128, 92, 60, 255), (162, 120, 80, 255), (92, 64, 40, 255))
    box3(d, 6, 10, 9, 15, (58, 38, 22, 255), None, None)
    d.rectangle([3, 8, 4, 9], fill=GOLD_L); d.rectangle([11, 8, 12, 9], fill=GOLD_L)


def i_map(d):
    box3(d, 1, 4, 14, 12, (226, 214, 184, 255), (244, 238, 222, 255), (176, 164, 138, 255))
    d.line([5, 4, 5, 12], fill=(170, 156, 128, 255))
    d.line([10, 4, 10, 12], fill=(170, 156, 128, 255))
    d.line([2, 9, 4, 7, 7, 9, 9, 6, 12, 8], fill=(150, 76, 60, 255))
    d.point((7, 9), fill=RED); d.point((8, 9), fill=RED)


def i_gear(d):
    for a in range(0, 360, 45):
        import math
        x = 8 + math.cos(math.radians(a)) * 6
        y = 7.5 + math.sin(math.radians(a)) * 6
        d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=O)
    disc3(d, 8, 7, 5, BRASS, BRASS_L, BRASS_D)
    d.ellipse([6, 5, 10, 9], fill=DARK)


def i_heal(d):
    box3(d, 6, 1, 10, 15, (238, 232, 214, 255), (252, 248, 236, 255), (188, 180, 158, 255))
    box3(d, 1, 6, 15, 10, (238, 232, 214, 255), (252, 248, 236, 255), (188, 180, 158, 255))
    d.rectangle([7, 7, 9, 9], fill=GREEN)


def i_horn(d):
    poly3(d, [(2, 11), (4, 6), (9, 2), (13, 3), (10, 7), (7, 11)], BRASS, BRASS_L, BRASS_D)
    disc3(d, 4, 12, 2, BRASS_L, (255, 236, 190, 255), BRASS_D)
    d.line([9, 4, 12, 4], fill=(255, 236, 190, 255))


def i_boss(d):
    poly3(d, [(1, 12), (1, 4), (5, 8), (8, 2), (11, 8), (15, 4), (15, 12)], GOLD, GOLD_L, GOLD_D)
    d.line([2, 11, 14, 11], fill=GOLD_D)
    d.rectangle([4, 5, 5, 6], fill=RED); d.rectangle([7, 4, 8, 5], fill=RED); d.rectangle([11, 5, 12, 6], fill=RED)


def i_plus(d):
    box3(d, 6, 2, 10, 14, GOLD, GOLD_L, GOLD_D)
    box3(d, 2, 6, 14, 10, GOLD, GOLD_L, GOLD_D)


def i_close(d):
    d.line([3, 3, 12, 12], fill=O, width=4)
    d.line([12, 3, 3, 12], fill=O, width=4)
    d.line([3, 3, 12, 12], fill=BRASS_L, width=2)
    d.line([12, 3, 3, 12], fill=BRASS_L, width=2)


def i_arrow(d):
    poly3(d, [(2, 6), (9, 6), (9, 3), (15, 8), (9, 13), (9, 10), (2, 10)], BRASS, BRASS_L, BRASS_D)


def i_up(d):
    poly3(d, [(8, 2), (14, 11), (2, 11)], BRASS, BRASS_L, BRASS_D)


def i_star(d=None):
    pts = []
    import math
    for k in range(10):
        r = 7 if k % 2 == 0 else 3
        a = math.radians(-90 + k * 36)
        pts.append((8 + math.cos(a) * r, 8 + math.sin(a) * r))
    d.polygon(pts, fill=O)
    inner = [(8 + (x - 8) * 0.82, 8 + (y - 8) * 0.82) for x, y in pts]
    d.polygon(inner, fill=GOLD)
    d.polygon([(8, 2.6), (9, 6.4), (13, 6.6), (10, 9), (11, 13), (8, 10.6), (5, 13), (6, 9), (3, 6.6), (7, 6.4)],
              fill=GOLD_L)


ICONS = {
    "gold": i_gold, "gems": i_gems, "wood": i_wood, "ore": i_ore, "herb": i_herb, "cloth": i_cloth,
    "flour": i_flour, "leather": i_leather, "food": i_food, "drink": i_drink, "bed": i_bed,
    "bandage": i_bandage, "hunter": i_hunter, "hammer": i_hammer, "anvil": i_anvil, "trade": i_trade,
    "scroll": i_scroll, "skull": i_skull, "swords": i_swords, "dungeon": i_dungeon, "hall": i_hall,
    "map": i_map, "gear": i_gear, "heal": i_heal, "horn": i_horn, "boss": i_boss, "plus": i_plus,
    "close": i_close, "arrow": i_arrow, "up": i_up, "star": i_star,
}

if __name__ == "__main__":
    for name, fn in ICONS.items():
        ic(fn).save(OUT / f"ic-{name}.png")
    print(len(ICONS), "icons v2 ->", OUT)
