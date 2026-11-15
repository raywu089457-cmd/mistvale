#!/usr/bin/env python3
"""Draw the CAPE sheet: the cloak layer the pack has always declared but never had art for.

`paperdoll.json` ships a `cape` layer (drawn before BODY, `attach: before body`)
and `skins.cape` is empty, so no hero can wear one. The DV2 spec has no cape --
this is mistvale's own back layer -- but it lives on the same BODY grid, so the
25 pose cells and the 8 direction cells come straight from the BODY sheet.

How the art works: the cloak hangs BEHIND the body, so only the pixels that
escape the body silhouette are actually visible -- a 1-2 px band down each side,
the shoulder line and the hem trailing past the boots. That means the sheet is
drawn from the BODY silhouette (like gen_armor.py) instead of being painted by
hand per cell, and it stays correct for every pose and every class, because the
classes all share one BODY silhouette.

Usage:
  python pipeline/scripts/dv2fmt/gen_cape.py [--out DIR] [--montage]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

import dv2fmt as F
import gen_armor as G

ROOT = F.ROOT
WORK = F.OUT_DIR / "work" / "missing"
CELL = F.CELL
CAPE_NAME = F.CAPES[0]

# palettes.json -> "cape"
CP = {
    "deep": (0x0e, 0x0c, 0x14),
    "lining": (0x14, 0x1b, 0x2e),
    "shade": (0x1d, 0x2a, 0x4a),
    "base": (0x2b, 0x3d, 0x66),
    "mid": (0x3f, 0x58, 0x85),
    "hi": (0x5c, 0x7c, 0xb0),
    "light": (0xc3, 0xd6, 0xee),
    "gold": (0xc8, 0xa2, 0x4a),
}


def shoulder_width(mask, nx, ny):
    """Width of the torso at the shoulder line (skips rows with no torso run)."""
    for y in (ny + 3, ny + 2, ny + 4, ny + 1, ny):
        if 0 <= y < CELL:
            run = G.torso_run(mask[y], nx)
            if run:
                return run[1] - run[0] + 1
    return 7


def put(out, x, y, c, inside=False, mask=None):
    if not (0 <= x < CELL and 0 <= y < CELL):
        return
    if inside and mask is not None and not mask[y][x]:
        return
    out.setdefault(y, {})[x] = c


def paint_cape(mask, neck, col, row):
    nx, ny = int(neck[0]), int(neck[1])
    nx = max(2, min(27, nx))
    out = {}
    sway = ((col * 3 + row * 5) % 3) - 1  # deterministic per-cell drift, ±1 px

    if ny >= CELL:
        # lying: the cloak spills onto the ground behind the body
        left = max(1, nx + 3)
        right = min(CELL - 2, nx + 17)
        rows = list(range(max(0, ny - 8), min(CELL - 2, ny - 2)))
        ramp = [CP["mid"], CP["base"], CP["base"], CP["shade"], CP["shade"]]
        for i, y in enumerate(rows):
            l = left + (1 if i in (1, 4) else 0)
            r = right - (1 if i in (2, 5) else 0)
            for x in range(l, r + 1):
                put(out, x, y, ramp[min(i, len(ramp) - 1)])
            put(out, l - 1, y, CP["deep"])
            put(out, r + 1, y, CP["deep"])
            if i == len(rows) - 1:
                for x in range(l, r + 1, 1):
                    put(out, x, y, CP["gold"])
        return out

    shoulder = shoulder_width(mask, nx, ny)
    top_w = max(5, shoulder)
    bot_w = min(17, shoulder + 7)
    top = ny + 1
    bottom = min(CELL - 2, ny + 13)

    for i, y in enumerate(range(top, bottom + 1)):
        t = i / max(1, bottom - top)
        w = int(round(top_w + (bot_w - top_w) * t))
        drift = sway if t > 0.55 else 0
        l = nx - w // 2 + drift
        r = l + w - 1
        l = max(2, l)
        r = min(CELL - 3, r)
        hem = y >= bottom - 1
        if hem:
            # ragged hem: the cloth stops a pixel short every third column
            l += 0
            r -= 0
        for x in range(l, r + 1):
            if hem:
                c = CP["lining"]
            elif i <= 1:
                c = CP["base"]        # shoulders sit in their own shadow
            elif x == l:
                c = CP["hi"]          # lit edge
            elif x == r:
                c = CP["shade"]       # shaded edge
            elif (x - l) % 5 == 2:
                c = CP["shade"]       # fold crease
            elif (x - l) % 5 == 3:
                c = CP["mid"]
            else:
                c = CP["base"]
            put(out, x, y, c)
        if hem:
            for x in range(l, r + 1):
                if (x + i) % 3 == 2:
                    continue           # scalloped hole in the trim
                put(out, x, y + 1 if y + 1 < CELL else y, CP["gold"] if x < r else CP["shade"])
        put(out, l - 1, y, CP["deep"])
        put(out, r + 1, y, CP["deep"])
    # shoulder caps: one extra lit pixel pair on the collar row
    for dx in (-3, 3):
        put(out, nx + dx, top, CP["light"])
        put(out, nx + dx, top - 1, CP["deep"])
    return out


def build_cape(body, anchors):
    sheet = Image.new("RGBA", (CELL * 10, CELL * 10), (0, 0, 0, 0))
    px = sheet.load()
    for row in range(10):
        for col in range(10):
            neck = anchors.get((col, row))
            if not neck:
                continue
            mask = G.cell_alpha(body, col, row)
            if not any(any(r) for r in mask):
                continue
            for y, xs in paint_cape(mask, neck, col, row).items():
                for x, c in xs.items():
                    px[col * CELL + x, row * CELL + y] = (*c, 255)
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(WORK))
    ap.add_argument("--montage", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    body = G.load_body()
    anchors = G.spec_anchors()
    anchors.update(G.pack_anchors())
    print(f"anchors: {len(anchors)} cells")

    im = build_cape(body, anchors)
    p = out / f"cape_{CAPE_NAME}.png"
    im.save(p)
    alpha = list(im.getchannel("A").getdata())
    print(f"cape_{CAPE_NAME}: {sum(1 for v in alpha if v)} px -> {p}")
    if args.montage:
        mp = out / "cape-review.png"
        G.montage([im], mp)
        print(f"montage -> {mp}")


if __name__ == "__main__":
    sys.exit(main())
