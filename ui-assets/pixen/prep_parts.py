# prep_parts.py — 把 Pixen 生成、切好的零件整理成遊戲用的 px-*.png（不花錢：變體用本機調色做）。
#   px-tile-on   = 木方塊的木面換成金色（下方選單「目前這頁」）
#   px-toast-err = 提示板的黃銅邊換成紅色（錯誤提示）
# 輸出到 out/game/，確認後再複製進 mistvale/assets/ui/
import colorsys, pathlib, shutil
from PIL import Image

HERE = pathlib.Path(__file__).parent; P = HERE / 'out' / 'parts'; G = HERE / 'out' / 'game'; G.mkdir(exist_ok=True)
COPY = {'window': 'px-window', 'card': 'px-card', 'btn-gold': 'px-btn-gold', 'btn-wood': 'px-btn-wood', 'btn-red': 'px-btn-red',
        'btn-x': 'px-btn-x', 'slot': 'px-slot', 'trough': 'px-trough', 'tile': 'px-tile', 'toast-plate': 'px-toast', 'title-plate': 'px-plate'}
for src, dst in COPY.items(): shutil.copy(P / f'{src}.png', G / f'{dst}.png')


def remap(src, dst, pick, to):
    im = Image.open(P / f'{src}.png').convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if pick(h * 360, s, v): px[x, y] = tuple(round(c * 255) for c in to(h * 360, s, v)) + (a,)
    im.save(G / f'{dst}.png')


# 金色方塊：木頭的明暗對應到金色按鈕面板自己的顏色（取 btn-gold 中間面板的顏色依亮度排序），色調才會一致
gold = Image.open(P / 'btn-gold.png').convert('RGBA')
ramp = sorted({gold.getpixel((x, y))[:3] for x in range(14, 94) for y in range(12, 33)}, key=lambda c: sum(c))
def to_gold(h, s, v):
    i = min(len(ramp) - 1, max(0, round((v - .18) / (.62 - .18) * (len(ramp) - 1))))
    return tuple(c / 255 for c in ramp[i])
remap('tile', 'px-tile-on',
      pick=lambda h, s, v: 12 <= h <= 38 and v > .16 and not (s > .55 and v > .55),
      to=to_gold)
# 紅色提示板：黃銅（色相 35–60°、飽和）→ 紅色色相 2°
remap('toast-plate', 'px-toast-err',
      pick=lambda h, s, v: 33 <= h <= 62 and s > .35 and v > .3,
      to=lambda h, s, v: colorsys.hsv_to_rgb(2 / 360, min(1, s + .1), v * .92))
for f in sorted(G.glob('*.png')): print(f.name, Image.open(f).size)
