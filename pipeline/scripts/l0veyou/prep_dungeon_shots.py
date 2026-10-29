# prep_dungeon_shots.py — l0veyou 生的兩張圖(output/l0veyou)→ assets/ui 遊戲素材。2026-10-30。
#   dg-strip-bg.png/.webp  地下城橫條戰鬥背景(裁中段、縮一半)
#   fx-mshots.png          魔物遠程飛行物 8 格(32×32/格,橫排):seed spore moss snowball stone needle pollen dust
import pathlib, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parents[3]; SRC = ROOT / 'output/l0veyou'; G = ROOT / 'assets/ui'
bg = Image.open(SRC / 'dungeon-strip-bg-v1.png').convert('RGB')
crop = bg.crop((0, 150, 1536, 790)).resize((768, 320), Image.LANCZOS)
crop.save(G / 'dg-strip-bg.png'); crop.save(G / 'dg-strip-bg.webp', quality=88, method=6)
print('bg', crop.size, (G / 'dg-strip-bg.webp').stat().st_size // 1024, 'KB webp')
im = Image.open(SRC / 'monster-shots-v1.png').convert('RGBA'); px = im.load(); W, Hh = im.size
for y in range(Hh):
    for x in range(W):
        r, g, b, a = px[x, y]
        # 洋紅底:r、b 高、g 低 → 透明;邊緣混到洋紅的像素也去掉(避免粉紅毛邊)
        if r > 150 and b > 150 and g < 120 and abs(r - b) < 90: px[x, y] = (0, 0, 0, 0)
cw, ch = W // 4, Hh // 2; CELL = 32; FIT = 28
names = ['seed', 'spore', 'moss', 'snowball', 'stone', 'needle', 'pollen', 'dust']
strip = Image.new('RGBA', (CELL * 8, CELL), (0, 0, 0, 0))
for k, n in enumerate(names):
    cell = im.crop(((k % 4) * cw, (k // 4) * ch, (k % 4 + 1) * cw, (k // 4 + 1) * ch)); bb = cell.getchannel('A').getbbox()
    spr = cell.crop(bb); s = FIT / max(spr.size); sz = (max(1, round(spr.width * s)), max(1, round(spr.height * s)))
    small = spr.resize(sz, Image.BOX)
    a = small.getchannel('A').point(lambda v: 255 if v >= 110 else 0); small.putalpha(a)   # 硬邊:半透明的縮圖邊緣二值化
    strip.alpha_composite(small, (k * CELL + (CELL - sz[0]) // 2, (CELL - sz[1]) // 2))
    print(n, bb, '->', sz)
strip.save(G / 'fx-mshots.png'); pass
