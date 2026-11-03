#!/usr/bin/env python3
"""Exact pixelfx projectiles/arrow design, scaled 2x and rotated into a 64x64 cell.

pixelfx's arrow is 36 px long (112x32 effect frame). This keeps its exact string
sprites and palette ramps, scales the 36 px arrow 2x to 72 px, rotates 45 degrees
to match how pixel-world.js draws arrowFx, and crops to the game's 64x64 cell.
"""
from PIL import Image, ImageDraw
from pathlib import Path

HEAD = ["..LL....", "..sLLL..", "bbsSSSSW", "..dDDD..", "..DD...."]
FLETCH = ["AAa.........", ".aAAa.......", "..aaAAa.....", "nkkkkkkkkkkk", "..cCCc......", ".cCCc.......", "CCc........."]

OUTLINE = (22, 14, 18, 255)
STEEL_D = (46, 54, 72, 255)
STEEL_M = (90, 102, 128, 255)
STEEL_L = (154, 166, 186, 255)
STEEL_H = (223, 231, 242, 255)
WOOD_D = (58, 36, 20, 255)
WOOD_M = (110, 68, 34, 255)
WOOD_L = (168, 114, 60, 255)
WOOD_H = (216, 168, 104, 255)
FLETCH_L = (238, 232, 220, 255)
FLETCH_M = (190, 194, 204, 255)
FLETCH_D = (128, 140, 160, 255)
WHITE = (255, 255, 255, 255)

HP = {"L": STEEL_H, "s": STEEL_L, "S": STEEL_M, "W": WHITE, "d": STEEL_D, "D": STEEL_M, "b": WOOD_D}
FP = {"A": FLETCH_L, "a": FLETCH_M, "C": FLETCH_M, "c": FLETCH_D, "k": WOOD_M, "n": OUTLINE}


def main():
    root = Path(__file__).resolve().parents[3]
    out = root / "output" / "pixelfx-arrow"
    out.mkdir(parents=True, exist_ok=True)

    # authoring canvas: pixelfx local space, nose at x=58, centreline y=16
    AWW, AHH = 64, 32
    base = Image.new("RGBA", (AWW, AHH), (0, 0, 0, 0))
    px = base.load()
    nose_x, mid_y = 52, 16
    head_x, head_y = nose_x - 7, mid_y - 2
    fletch_x, fletch_y = head_x - 34, mid_y - 3
    for x in range(fletch_x + 9, head_x):
        px[x, mid_y] = WOOD_M
        px[x, mid_y - 1] = WOOD_L
        px[x, mid_y + 1] = WOOD_D
    for x in range(fletch_x + 12, head_x - 1, 6):
        px[x, mid_y - 1] = WOOD_H

    def put(rows, pal, ox, oy):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch not in ". " and ch in pal:
                    px[ox + x, oy + y] = pal[ch]

    put(FLETCH, FP, fletch_x, fletch_y)
    put(HEAD, HP, head_x, head_y)

    mask = [[base.getpixel((x, y))[3] > 0 for x in range(AWW)] for y in range(AHH)]
    for y in range(AHH):
        for x in range(AWW):
            if mask[y][x]:
                continue
            if any(0 <= x + dx < AWW and 0 <= y + dy < AHH and mask[y + dy][x + dx]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUTLINE

    # 2x nearest, then rotate 45 degrees into the 64x64 cell
    big = base.resize((round(AWW * 1.8), round(AHH * 1.8)), Image.NEAREST)
    rot = big.rotate(45, resample=Image.NEAREST, expand=True)
    bb = rot.getbbox()
    cx, cy = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
    img = rot.crop((cx - 32, cy - 32, cx + 32, cy + 32))
    img.save(out / "arrow-64.png")
    img.resize((128, 128), Image.NEAREST).save(out / "arrow-128.png")

    old = Image.open(root / "assets" / "vfx@1x.png").convert("RGBA").crop((72, 188, 136, 252))
    Z = 5
    pad, label = 24, 26
    canvas = Image.new("RGBA", (pad * 3 + 64 * Z * 2, label + 64 * Z + pad), (24, 20, 16, 255))
    canvas.paste(old.resize((64 * Z, 64 * Z), Image.NEAREST), (pad, label))
    canvas.paste(img.resize((64 * Z, 64 * Z), Image.NEAREST), (pad * 2 + 64 * Z, label))
    d = ImageDraw.Draw(canvas)
    d.text((pad, 8), "old arrowFx (64x64)", fill=(230, 210, 170, 255))
    d.text((pad * 2 + 64 * Z, 8), "pixelfx arrow, 1.8x (64x64)", fill=(230, 210, 170, 255))
    canvas.save(out / "compare.png")

    cs = Image.new("RGBA", (2 * 150, 2 * 150 + 30), (24, 20, 16, 255))
    ds = ImageDraw.Draw(cs)
    for row, size in enumerate((19, 38)):
        for col, (name, source) in enumerate((("old", old), ("new", img))):
            thumb = source.resize((size, size), Image.NEAREST).resize((114, 114), Image.NEAREST)
            cs.paste(thumb, (18 + col * 150, 24 + row * 150), thumb)
            ds.text((18 + col * 150, 6 + row * 150), f"{name} {size}px", fill=(230, 210, 170, 255))
    cs.save(out / "compare-size.png")
    print(out)


if __name__ == "__main__":
    main()
