#!/usr/bin/env python3
"""gen_fx.py -- effect_hslash (horizontal sweep arc) and effect_thrust (forward stab streak), 120x60 = 4 directions (up,right,down,left) x 2 rows (sebF 0 bright, 1 fading),
cells of 30x30, centred on the cell centre, palette 'effects' (f2ece0 e8c46a ffffff c8a24a ...). Procedural shapes (ellipse crescents, tapered darts), no generation.
Run:  python pipeline/scripts/dv2fmt/gen_fx.py [--no-import]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_phase4_common import *  # noqa: F401,F403

C = 30
YY, XX = np.mgrid[0:C, 0:C]
PX, PY = XX + 0.5, YY + 0.5


def ell(cx, cy, rx, ry, rot=0.0):
    """boolean mask of an ellipse rotated by rot degrees (counter-clockwise on screen, y down)"""
    a = np.radians(rot)
    dx, dy = PX - 15, PY - 15
    ux = dx * np.cos(a) - dy * np.sin(a)      # rotate the sample point by -rot around the cell centre
    uy = dx * np.sin(a) + dy * np.cos(a)
    return ((ux - (cx - 15)) / rx) ** 2 + ((uy - (cy - 15)) / ry) ** 2 <= 1.0


def shade(mask, bright):
    """colour a shape by depth from its boundary: gold rim, pale mid, white core (bright row) / gold only (fading row)"""
    cell = np.zeros((C, C, 4), np.uint8)
    d = dist_to_empty(mask)
    for y, x in zip(*np.nonzero(mask)):
        k = d[y, x]
        if bright:
            sym = "Y" if k == 1 else "w" if k == 2 else "!"
        else:
            sym = "Y" if k <= 2 else "w"
        put(cell, x, y, sym)
    return cell


def arc_mask(y0, a, tilt, tmax, lead, x_lo=2, x_hi=27):
    """a flat, tapered crescent: centre line y = y0 + a*(x-15)^2 - tilt*(x-15), thickness tmax*taper(x) (>= 1 px), `lead` > 0 makes the right end heavier"""
    m = np.zeros((C, C), bool)
    half = (x_hi - x_lo) / 2.0
    for x in range(x_lo, x_hi + 1):
        u = (x + 0.5 - (x_lo + x_hi + 1) / 2.0) / (half + 0.5)       # -1 .. 1
        taper = (1 - abs(u) ** 2.2) ** 0.75
        t = tmax * taper * (1 - lead + lead * (u + 1))                # lead 0 = symmetric, 0.5 = right end 2x heavier than the left
        t = max(t, 1.0)
        xc = x + 0.5 - 15
        yc = y0 + a * xc ** 2 - tilt * xc
        for y in range(C):
            if abs(y + 0.5 - yc) <= t / 2:
                m[y, x] = True
    return m


def hslash_cell(direction, bright):
    tmax = 6.5 if bright else 3.6
    if direction in ("up", "down"):
        m = arc_mask(10.5, 0.043, 0.0, tmax, 0.0, 2, 27)
        cell = shade(m, bright)
        return cell if direction == "up" else cell[::-1]
    # right / left: a flat swoosh, heavy at the leading (right) end and tapering to a tail on the left, rising slightly toward the front
    m = arc_mask(14.5, 0.030, 0.30, tmax, 0.35, 2, 27)
    cell = shade(m, bright)
    return cell if direction == "right" else cell[:, ::-1]


def thrust_cell(direction, bright):
    """a spear-tip streak pointing right: barbed head, tapering shaft-wake, (bright row) two speed lines; left/down are the mirror, up = right (see below)"""
    m = np.zeros((C, C), bool)
    if bright:
        heights = {28: 1, 27: 3, 26: 3, 25: 5, 24: 5, 23: 7, 22: 7, 21: 9, 20: 9, 19: 5, 18: 3}
        for x in range(4, 18):
            heights[x] = 3 if x >= 9 else 1
    else:
        heights = {26: 1, 25: 3, 24: 3, 23: 5, 22: 5, 21: 3}
        for x in range(10, 21):
            heights[x] = 3 if x >= 15 else 1
    for x, h in heights.items():
        for y in range(15 - h // 2, 15 + h // 2 + 1):
            m[y, x] = True
    cell = shade(m, bright)
    if bright:                                      # speed lines above / below the wake
        for x in range(2, 14):
            put(cell, x, 9, "G" if x < 6 else "Y")
            put(cell, x, 21, "G" if x < 6 else "Y")
    # up/down follow the BLADE, not the facing (2026-11-14 action audit): DV2's thrust (set 23) holds the weapon out to the
    # right when facing up and to the left when facing down, and places the effect there (fxOff x +15 / -14). Rotated
    # up/down darts pointed across the blade, so up reuses the right-pointing streak and down the left-pointing one.
    if direction in ("right", "up"):
        return cell
    return cell[:, ::-1]


def make(fn):
    img = canvas(120, 60)
    for ci, d in enumerate(("up", "right", "down", "left")):
        for ri, bright in enumerate((True, False)):
            img[ri * C:(ri + 1) * C, ci * C:(ci + 1) * C] = fn(d, bright)
    return img


EFFECTS = {"hslash": hslash_cell, "thrust": thrust_cell}

if __name__ == "__main__":
    ok = True
    scratch = F.OUT_DIR / "work_phase4"
    scratch.mkdir(parents=True, exist_ok=True)
    for name, fn in EFFECTS.items():
        img = make(fn)
        save_1x(img, scratch / f"effect_{name}_1x.png")
        if "--no-import" not in sys.argv:
            ok &= import_via_x8("effect", name, img, scratch)
    sys.exit(0 if ok else 1)
