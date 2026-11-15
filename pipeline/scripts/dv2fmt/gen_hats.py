#!/usr/bin/env python3
"""gen_hats.py -- hat_cap / hat_horned / hat_circlet (20x60 each: rows back / side(facing right) / front, anchor = neck, same as the HEAD cells).

Hand-placed ASCII pixel art (symbols: gen_phase4_common.SYM), no generation. Every hat is fitted against all 7 class heads
(<class>_head.png) -- see gen_phase4_review.py. Run:  python pipeline/scripts/dv2fmt/gen_hats.py [--no-import]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_phase4_common import *  # noqa: F401,F403

CELL = 20
ROW = {"back": 0, "side": 1, "front": 2}


def new_sheet():
    return canvas(CELL, CELL * 3)


def draw(img, view, rows, mirror=None, cmap=None):
    oy = ROW[view] * CELL
    blit_rows(img, 0, oy, rows)
    if mirror:
        mirror_into(img, 0, oy, mirror, cmap)


# ------------------------------------------------------------------ hat_cap: stitched leather skullcap, turned-up band, brass button
def cap():
    img = new_sheet()
    dome = {
        5: (7, "ooooo"),
        6: (5, "oohhGmmoo"),
        7: (4, "ohhhhmmmmdo"),
        8: (3, "ohhhmmmmmmddo"),
        9: (3, "ohhmmmmmmmddo"),
        10: (3, "orgrgrgrgrgro"),
        11: (3, "obbbbbbbbbBBo"),
        12: (4, "ooooooooooo"),
    }
    draw(img, "front", dome)
    side = dict(dome)
    side[10] = (3, "orgrgrgrgrgrrrro")       # short peak sticking out in front (screen right)
    side[11] = (3, "obbbbbbbbbBBBBBo")
    side[12] = (4, "oooooooooooooo")
    draw(img, "side", side)
    back = {
        5: (7, "oooooo"),
        6: (5, "oohhGmmmoo"),
        7: (4, "ohhhhmmmmmdo"),
        8: (3, "ohhhmmmmmmmddo"),
        9: (3, "ohhmmmmmmmmddo"),
        10: (3, "ohmmmmmmmmmddo"),
        11: (3, "ohmmmmmmmmmddo"),
        12: (3, "orgrgrgrgrgrro"),
        13: (3, "obbbbbbbbbbBBo"),
        14: (4, "oooooooooooo"),
    }
    draw(img, "back", back)
    return img


# ------------------------------------------------------------------ hat_horned: dark iron helm with brow band and two bone horns
def horned():
    img = new_sheet()
    left = {                                       # left half incl. the centre column x9; the right half is mirrored with a darker ramp
        6: (7, "ooo"),
        7: (5, "ooWSS"),
        8: (4, "oWSSSS"),
        9: (4, "oSSSSS"),
        10: (3, "oSSDDDG"),
        11: (3, "oDDDDDD"),
        12: (4, "oooooo"),
    }
    horn = {                                       # left horn, x1..5
        2: (3, "o"),
        3: (2, "owo"),
        4: (2, "owo"),
        5: (1, "owwo"),
        6: (1, "owWo"),
        7: (1, "owWo"),
        8: (1, "owWo"),
        9: (2, "owWo"),
        10: (3, "oo"),
    }
    cm = {"W": "S", "S": "D", "w": "W"}
    for view, ax in (("front", 18), ("back", 19)):
        draw(img, view, left)
        draw(img, view, horn)
        oy = ROW[view] * CELL
        mirror_into(img, 0, oy, ax, cm)
    # side view (3/4, facing right): the far (left) horn at full length, the near-front (right) horn foreshortened to a stub
    oy = ROW["side"] * CELL
    blit_rows(img, 0, oy, left)
    blit_rows(img, 0, oy, horn)
    mirror_into(img, 0, oy, 18, cm)
    img[oy + 2:oy + 6, 13:20] = 0                  # cut the right horn short ...
    blit_rows(img, 0, oy, {5: (15, "oo"), 6: (14, "owWo"), 7: (14, "owWo"), 8: (14, "oSWo")})   # ... and re-cap it
    return img


def circlet():
    img = new_sheet()
    front = {
        7: (9, "o"),
        8: (8, "opo"),
        9: (5, "ooooRoooo"),
        10: (3, "oYYYYYGGGGggo"),
        11: (4, "ooooooooooo"),
    }
    draw(img, "front", front)
    side = {
        7: (12, "o"),
        8: (11, "opo"),
        9: (5, "oooooooRoo"),
        10: (3, "oYYYYYGGGGggo"),
        11: (4, "ooooooooooo"),
    }
    draw(img, "side", side)
    back = {
        9: (5, "oooooooooo"),
        10: (3, "oYYYYYGGGGGggo"),
        11: (4, "oooooooooooo"),
    }
    draw(img, "back", back)
    return img


HATS = {"cap": cap, "horned": horned, "circlet": circlet}

if __name__ == "__main__":
    ok = True
    scratch = F.OUT_DIR / "work_phase4"
    scratch.mkdir(parents=True, exist_ok=True)
    for name, fn in HATS.items():
        img = fn()
        save_1x(img, scratch / f"hat_{name}_1x.png")
        if "--no-import" not in sys.argv:
            ok &= import_via_x8("hat", name, img, scratch)
    sys.exit(0 if ok else 1)
