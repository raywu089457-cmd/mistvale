#!/usr/bin/env python3
"""gen_weapons.py -- weapon_sword_long / axe_double / staff_crystal (+ _fine) : 80x40 sheets, 2 cells of 40x40, drawn pointing up, grip pixel (20,28).

Variants of the existing weapon types (sword / axe / staff) so their grip profile and action tables still apply. Hand-placed ASCII + small
procedural shapes (spans, distance shading, auto outline), no generation. _fine = the same recolour as output/dv2fmt/work/derive_fine.py.
Run:  python pipeline/scripts/dv2fmt/gen_weapons.py [--no-import]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_phase4_common import *  # noqa: F401,F403

GRIP = (20, 28)


def sheet():
    return canvas(80, 40)


def sword_long():
    img = sheet()
    rows = {
        9: (20, "o"),
        10: (19, "oWo"),
        11: (18, "oWWSo"),
        12: (18, "oWWSo"),
        **{y: (18, "oWDSo") for y in range(13, 23)},
        23: (18, "oWWSo"),
        24: (14, "ooooooooooooo"),
        25: (14, "oYYYYGGGGgggo"),
        26: (14, "oGGgggggggggo"),
        27: (14, "oooooobooooooo"[:13]),
        28: (19, "obo"),
        29: (19, "oBo"),
        30: (18, "ooooo"),
        31: (18, "oYGgo"),
        32: (19, "ooo"),
    }
    blit_rows(img, 0, 0, rows)
    return img


def axe_double():
    img = sheet()
    half = {8: (7, 9), 9: (7, 10), 10: (6, 11), 11: (6, 12), 12: (6, 14), 13: (6, 15), 14: (6, 17), 15: (6, 18)}   # flared wedge: straight bright cutting edge, pointed corners
    spans = dict(half)
    for y in range(16, 23):
        spans[y] = half[30 - y]                       # vertical mirror about y = 15
    m = np.zeros((40, 40), bool)
    for y, (a, b) in spans.items():
        m[y, a:b + 1] = True
        m[y, 39 - b:39 - a + 1] = True               # symmetric about x = 19.5 like the base axe
    # haft + spike (so the blade shading sees the whole silhouette)
    for y in range(4, 34):
        m[y, 19:21] = True
    d = dist_to_empty(m)
    for y, (a, b) in spans.items():
        for x in list(range(a, b + 1)) + list(range(39 - b, 39 - a + 1)):
            if 19 <= x <= 20:
                continue
            k = d[y, x]
            put(img, x, y, "W" if k == 1 else "S" if k == 2 else "D")
    # a gold rivet on each blade and a bright gleam line on the upper-left blade edge
    for x, y in ((13, 15), (26, 15)):
        put(img, x, y, "G")
    # spike
    for y, (a, c) in {4: ("W", "S"), 5: ("W", "S"), 6: ("W", "S"), 7: ("W", "S"), 8: ("W", "S")}.items():
        put(img, 19, y, a)
        put(img, 20, y, c)
    # collar, haft (with a leather wrap), butt cap
    for y in range(9, 34):
        left, right = ("r", "B")
        if 13 <= y <= 18:
            left, right = ("G", "g")                  # gold collar where the blades meet
        elif 26 <= y <= 30 and (y % 2 == 0):
            left, right = ("B", "r")                  # grip wrap
        put(img, 19, y, left)
        put(img, 20, y, right)
    for y, (a, c) in {32: ("G", "g"), 33: ("g", "g")}.items():
        put(img, 19, y, a)
        put(img, 20, y, c)
    outline4(img)
    return img


def staff_crystal():
    img = sheet()
    head = {                                         # x14..25, symmetric about 19.5
        3: ".....wV.....",
        4: "....wvVV....",
        5: "...wvvVVV...",
        6: "...wvvVVV...",
        7: "...wvvVVV...",
        8: "...vvvVVV...",
        9: "..GvvvVVVG..",
        10: "..GvvvVVVG..",
        11: "..GGvvVVGG..",
        12: "...GGvVGG...",
        13: "...YYGGgg...",
        14: "...GGgggg...",
    }
    for y, s in head.items():
        blit_rows(img, 0, 0, {y: (14, s)})
    for y in range(15, 35):                           # shaft, x19/x20 interior
        a, b = ("r", "B")
        if (y // 3) % 2:
            a, b = ("B", "r")                         # twisting grain like the base staff
        if 26 <= y <= 30:
            a, b = ("B", "b") if y % 2 else ("b", "B")  # leather grip wrap
        if y >= 33:
            a, b = ("S", "D")                         # steel ferrule
        put(img, 19, y, a)
        put(img, 20, y, b)
    outline4(img)
    return img


WEAPONS = {"sword_long": sword_long, "axe_double": axe_double, "staff_crystal": staff_crystal}


def check_grip(name, img):
    px = img[GRIP[1], GRIP[0]]
    ok = px[3] > 0 and tuple(px[:3]) != rgb(SYM["o"])
    print(f"   grip pixel {GRIP} of {name}: {'inside art' if ok else 'NOT INSIDE ART'}")
    return ok


if __name__ == "__main__":
    ok = True
    scratch = F.OUT_DIR / "work_phase4"
    scratch.mkdir(parents=True, exist_ok=True)
    for name, fn in WEAPONS.items():
        base = fn()
        fine = fine_map(base)
        ok &= check_grip(name, base)
        for nm, im in ((name, base), (name + "_fine", fine)):
            save_1x(im, scratch / f"weapon_{nm}_1x.png")
            if "--no-import" not in sys.argv:
                ok &= import_via_x8("weapon", nm, im, scratch)
    sys.exit(0 if ok else 1)
