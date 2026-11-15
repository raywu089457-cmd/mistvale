#!/usr/bin/env python3
"""Mistvale paperdoll placeholder art (phase 1).

Draws a deliberately simple, clearly-placeholder pixel humanoid as separate
layer sheets for the paperdoll engine (src/paperdoll.js) and writes

    assets/paperdoll/*.png
    assets/paperdoll/paperdoll.json      (schema: docs/PAPERDOLL.md)

Everything here is mistvale's own procedural art (Pillow primitives). Nothing is
copied or derived from the DV2 kit. Colours are taken from the hero palettes in
assets/heroes/<class>.json; proportions stay inside SPRITE_VISUAL_BIBLE
(~3-head chibi, cell 100, foot 8 px above the cell bottom, standing height ~72).
This is NOT a character design spec - readability over beauty.

Layout
------
* Logical pixels are drawn on a 50x50 canvas (foot at logical (25,46)), then
  upscaled x2 nearest -> 100x100 art cells, foot at (50,92), trans (-50,-92).
* Slot layers (body / hand / armor / shield) share one cell layout:
  columns = every (action, slot) pose, rows = views back / side / front.
  Left = side row mirrored (seb reversU = 1).
* Head / helmet: 3 cells (back, side, front); frame = direction.
* Weapons: 80x80 cells, 2 columns (sebF 0 / sebF 1); pivot = grip at x = 40
  (sprite centre, so the inv flip keeps the grip in place).
* Effect "slash": 100x100 cells, frame = sebF*4 + dir.

Usage
-----
    python pipeline/scripts/build_paperdoll_placeholder.py
    python pipeline/scripts/build_paperdoll_placeholder.py --check   # rebuild in memory, fail if files differ
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "paperdoll"

S = 2                     # art px per logical px
L = 50                    # logical cell
FX, FY = 25, 46           # foot in logical cell
CELL = L * S              # 100 art
TRANS = (-FX * S, -FY * S)
WL = 40                   # weapon logical cell
WCELL = WL * S            # 80 art
OUTLINE = (14, 12, 20, 255)
# Images are stored at LOGICAL resolution (1 image px = S art px; skins carry "scale": S) to keep decoded memory
# 4x smaller; every coordinate in paperdoll.json stays in art px.
CROP = (9, 13, 41, 49)    # slot-layer cell window in the logical 50x50 canvas (foot (25,46) -> (16,33))
CW, CH = (CROP[2] - CROP[0]), (CROP[3] - CROP[1])          # 32 x 36 logical
SLOT_TRANS = (-(FX - CROP[0]) * S, -(FY - CROP[1]) * S)    # (-32, -66) art

VIEWS = ["back", "side", "front", "frontQ", "backQ"]   # sheet rows (Q = 3/4 view, facing right)
# dir 0 up,1 right,2 down,3 left,4 upRight,5 downRight,6 downLeft,7 upLeft
DIR_VIEW = ["back", "side", "front", "side", "backQ", "frontQ", "frontQ", "backQ"]
DIR_MIRROR = [False, False, False, True, False, False, True, True]
DIR_NAME = ["up", "right", "down", "left", "upRight", "downRight", "downLeft", "upLeft"]
BASE = {"frontQ": "front", "backQ": "back"}
DIAG_ACTIONS = None               # every action gets real diagonal rows (set below = all ACTIONS)

CLASSES = ["archer", "sorcerer", "priest", "paladin", "berserker", "assassin", "darkknight"]


def hx(c: str):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


# Class colours (all from assets/heroes/<class>.json palettes)
PAL = {
    "archer":    dict(skin="#f0c8a0", skinD="#d8a070", top="#6a8a40", topD="#456028", sleeve="#6a8a40",
                      pants="#7a4e30", boots="#523a24", hair="#c8a074", hairD="#96744e", accent="#9ab86a", robe=False),
    "sorcerer":  dict(skin="#f0c8a0", skinD="#d8a070", top="#7457b8", topD="#4f3590", sleeve="#7457b8",
                      pants="#4f3590", boots="#181222", hair="#181222", hairD="#160c2c", accent="#e8c46a", robe=True,
                      hat="#4f3590", hatD="#2e1c55"),
    "priest":    dict(skin="#f0c8a0", skinD="#d8a070", top="#f2ece0", topD="#b5ab97", sleeve="#f2ece0",
                      pants="#d9d1c0", boots="#8a8170", hair="#5c5444", hairD="#5c5444", accent="#e8c46a", robe=True,
                      hood="#d9d1c0", hoodD="#b5ab97"),
    "paladin":   dict(skin="#f0c8a0", skinD="#d8a070", top="#5a6572", topD="#333c4a", sleeve="#8e9aa8",
                      pants="#333c4a", boots="#7a6f5c", hair="#c8a24a", hairD="#9a7430", accent="#c8a24a", robe=False),
    "berserker": dict(skin="#f0c8a0", skinD="#d8a070", top="#b04c2c", topD="#7c321c", sleeve="#f0c8a0",
                      pants="#524a3e", boots="#38342a", hair="#7a4e30", hairD="#421a0e", accent="#e07448", robe=False),
    "assassin":  dict(skin="#f0c8a0", skinD="#d8a070", top="#434a62", topD="#2a2e3c", sleeve="#434a62",
                      pants="#2a2e3c", boots="#171a24", hair="#2a2e3c", hairD="#171a24", accent="#9aa0b8", robe=False,
                      hood="#5a5f70", hoodD="#3e4353"),
    # darkknight: not in CLASSES today (legacy id), kit kept so any such hunter never falls back to sheets
    "darkknight": dict(skin="#d7696e", skinD="#957b79", top="#231311", topD="#13110e", sleeve="#33312c",
                       pants="#24231e", boots="#0f0606", hair="#13110e", hairD="#0f0606", accent="#bc1515", robe=False),
}
GEAR = {
    "leather": dict(main="#7a4e30", dark="#523a24", trim="#c8a074"),
    "plate":   dict(main="#cfd8e2", dark="#8e9aa8", trim="#c8a24a"),
    "mantle":  dict(main="#7c2b31", dark="#4a1a1e", trim="#e8c46a"),
}

# ---------------------------------------------------------------- poses
# Logical coords relative to the foot (y up = negative).
#   b    torso/head drop (bob)            head  (dx, dy) of the head layer
#   legs side: (near foot x, far foot x, near lift, far lift)   front/back: (left lift, right lift)
#   wh   weapon hand (grip point)  oh  off hand    deg  weapon rotation (clockwise)
#   sebF weapon sheet column       fx  (sebF) effect on this slot or None
# Back view = front view mirrored (weapon arm on screen right, weapon behind the body).


def P(b=0, legs=None, wh=(4, -13), oh=(-3, -13), deg=0, sebF=0, head=(0, 0), fx=None):
    return dict(b=b, legs=legs, wh=wh, oh=oh, deg=deg, sebF=sebF, head=head, fx=fx)


SIDE = {
    "idle": [P(0, (2, -2, 0, 0), (4, -14), (-3, -13)), P(1, (2, -2, 0, 0), (4, -13), (-3, -12), head=(0, 1))],
    "walk": [P(0, (4, -4, 0, 0), (2, -14), (-1, -13)), P(-1, (0, 0, 2, 0), (4, -15), (-2, -14), head=(0, -1)),
             P(0, (-4, 4, 0, 0), (6, -14), (-4, -13)), P(-1, (0, 0, 0, 2), (4, -15), (-2, -14), head=(0, -1))],
    "attack": [P(0, (3, -3, 0, 0), (-3, -26), (2, -15), -45, head=(-1, 0)),
               P(0, (4, -3, 0, 0), (3, -27), (1, -15), 30),
               P(1, (6, -4, 0, 0), (9, -17), (-2, -14), 120, head=(1, 1), fx=0),
               P(1, (5, -4, 0, 0), (8, -15), (-2, -14), 90, head=(1, 1), fx=1)],
    "attack.bow": [P(0, (3, -3, 0, 0), (7, -19), (4, -19), 0, 0),
                   P(0, (3, -3, 0, 0), (8, -19), (-1, -19), 0, 1),
                   P(0, (3, -3, 0, 0), (8, -19), (-3, -20), 0, 0),
                   P(0, (3, -3, 0, 0), (6, -16), (-1, -15), 0, 0)],
    "attack.staff": [P(0, (3, -3, 0, 0), (2, -22), (-2, -14), -30, head=(-1, 0)),
                     P(0, (4, -3, 0, 0), (7, -21), (-1, -14), 45),
                     P(1, (5, -4, 0, 0), (9, -20), (-2, -14), 75, head=(1, 1)),
                     P(1, (4, -4, 0, 0), (5, -15), (-2, -14), 15, head=(0, 1))],
    "skill": [P(1, (3, -3, 0, 0), (3, -14), (-2, -14), 0, head=(0, 1)),
              P(0, (3, -3, 0, 0), (2, -29), (1, -27), 0, head=(0, -1)),
              P(0, (3, -3, 0, 0), (3, -30), (2, -28), 0, head=(0, -1), fx=0),
              P(0, (3, -3, 0, 0), (4, -28), (2, -26), 15, fx=1)],
    "hurt": [P(1, (1, -3, 0, 0), (0, -15), (-4, -16), -30, head=(-2, 1)),
             P(1, (2, -2, 0, 0), (2, -14), (-3, -14), -15, head=(-1, 1))],
}
FRONT = {
    "idle": [P(0, (0, 0), (-7, -14), (7, -13)), P(1, (0, 0), (-7, -13), (7, -12), head=(0, 1))],
    "walk": [P(0, (0, 0), (-7, -14), (7, -13)), P(-1, (2, 0), (-7, -16), (7, -13), head=(0, -1)),
             P(0, (0, 0), (-7, -14), (7, -13)), P(-1, (0, 2), (-7, -13), (7, -15), head=(0, -1))],
    "attack": [P(0, (0, 0), (-9, -26), (7, -14), -45),
               P(0, (0, 0), (-4, -29), (7, -15), 0, head=(0, -1)),
               P(1, (0, 0), (-1, -16), (7, -14), 135, head=(0, 1), fx=0),
               P(1, (0, 0), (-3, -15), (7, -14), 90, head=(0, 1), fx=1)],
    "attack.bow": [P(0, (0, 0), (-3, -19), (1, -19), 0, 0), P(0, (0, 0), (-3, -19), (2, -18), 0, 1),
                   P(0, (0, 0), (-3, -19), (4, -18), 0, 0), P(0, (0, 0), (-5, -16), (6, -14), 0, 0)],
    "attack.staff": [P(0, (0, 0), (-8, -22), (7, -14), -20), P(0, (0, 0), (-5, -24), (7, -15), 0),
                     P(1, (0, 0), (-4, -25), (7, -14), 0, head=(0, 1)), P(1, (0, 0), (-7, -15), (7, -14), 0, head=(0, 1))],
    "skill": [P(1, (0, 0), (-7, -14), (7, -14), 0, head=(0, 1)), P(0, (0, 0), (-5, -30), (5, -29), 0, head=(0, -1)),
              P(0, (0, 0), (-4, -31), (4, -30), 0, head=(0, -1), fx=0), P(0, (0, 0), (-5, -29), (5, -28), 0, fx=1)],
    "hurt": [P(1, (0, 1), (-8, -14), (8, -15), -30, head=(0, 1)), P(1, (0, 0), (-7, -13), (7, -13), -15, head=(0, 1))],
}


def mirror_pose(p):
    q = dict(p)
    q["wh"] = (-p["wh"][0], p["wh"][1])
    q["oh"] = (-p["oh"][0], p["oh"][1])
    q["deg"] = -p["deg"] or 0
    q["head"] = (-p["head"][0], p["head"][1])
    if p["legs"] and len(p["legs"]) == 2:
        q["legs"] = (p["legs"][1], p["legs"][0])
    return q


BACK = {k: [mirror_pose(p) for p in v] for k, v in FRONT.items()}
# Back-view chop goes *away* from the camera: the blade stays up behind the head instead of sweeping down.
BACK["attack"] = [P(0, (0, 0), (9, -26), (-7, -14), 45),
                  P(0, (0, 0), (4, -29), (-7, -15), 0, head=(0, -1)),
                  P(1, (0, 0), (2, -25), (-7, -14), -10, head=(0, 1), fx=0),
                  P(1, (0, 0), (6, -18), (-7, -14), 30, head=(0, 1), fx=1)]
# 3/4 views (idle + walk only): hands pulled toward the centre, the body turned a quarter.
FRONTQ = {
    "idle": [P(0, (0, 0), (-5, -14), (6, -13)), P(1, (0, 0), (-5, -13), (6, -12), head=(0, 1))],
    "walk": [P(0, (0, 0), (-5, -14), (6, -13)), P(-1, (2, 0), (-4, -16), (6, -13), head=(0, -1)),
             P(0, (0, 0), (-6, -14), (5, -13)), P(-1, (0, 2), (-5, -13), (6, -15), head=(0, -1))],
}
BACKQ = {k: [mirror_pose(p) for p in v] for k, v in FRONTQ.items()}
POSES = {"back": BACK, "side": SIDE, "front": FRONT, "frontQ": FRONTQ, "backQ": BACKQ}

def LY(wh=(7, -3), oh=(-6, -2), deg=90, head=(-15, 25)):
    """Lying on the ground (death, held)."""
    p = P(0, (0, 0), wh, oh, deg, head=head)
    p["lying"] = True
    return p


def death_poses(view):
    if view == "side":
        kneel = [P(3, (2, -2, 0, 0), (5, -10), (-3, -9), 60, head=(1, 3)),
                 P(6, (3, -2, 0, 0), (7, -6), (-2, -6), 90, head=(2, 6))]
    else:
        sx = -1 if view == "back" else 1
        kneel = [P(3, (0, 0), (-7 * sx, -10), (7 * sx, -9), -30 * sx, head=(0, 3)),
                 P(6, (0, 0), (-8 * sx, -6), (8 * sx, -6), -60 * sx, head=(0, 6))]
    return kneel + [LY(), LY(), LY()]


def victory_poses(view):
    if view == "side":
        return [P(0, (2, -2, 0, 0), (2, -30), (1, -28), 0, head=(0, -1)), P(-1, (2, -2, 0, 0), (3, -27), (1, -25), 15, head=(0, -2)),
                P(0, (2, -2, 0, 0), (2, -30), (1, -28), 0, head=(0, -1)), P(-1, (2, -2, 0, 0), (3, -27), (1, -25), 15, head=(0, -2))]
    sx = -1 if view == "back" else 1
    return [P(0, (0, 0), (-5 * sx, -30), (5 * sx, -29), 0, head=(0, -1)), P(-1, (1, 1), (-6 * sx, -27), (6 * sx, -26), -15 * sx, head=(0, -2)),
            P(0, (0, 0), (-5 * sx, -30), (5 * sx, -29), 0, head=(0, -1)), P(-1, (1, 1), (-6 * sx, -27), (6 * sx, -26), -15 * sx, head=(0, -2))]


for _v, _d in (("side", SIDE), ("front", FRONT), ("back", BACK)):
    _d["death"] = death_poses(_v)
    _d["victory"] = victory_poses(_v)


def blend(a, b, legs):
    """3/4 view pose = halfway between two views (hands, head, angle); legs from the front/back view."""
    q = dict(b)
    q["wh"] = (round((a["wh"][0] + b["wh"][0]) / 2), round((a["wh"][1] + b["wh"][1]) / 2))
    q["oh"] = (round((a["oh"][0] + b["oh"][0]) / 2), round((a["oh"][1] + b["oh"][1]) / 2))
    q["head"] = (round((a["head"][0] + b["head"][0]) / 2), round((a["head"][1] + b["head"][1]) / 2))
    q["deg"] = int(round((a["deg"] + b["deg"]) / 2 / 15.0) * 15)
    q["legs"] = legs
    q["b"] = max(a["b"], b["b"])
    if a.get("lying") or b.get("lying"):
        q = dict(a if a.get("lying") else b)
    return q


ACTIONS = {
    # key: (af, loop, impactSlot, releaseSlot)
    "idle":         ([12, 24], True, None, None),
    "walk":         ([4, 8, 12, 16], True, None, None),
    "attack":       ([3, 6, 9, 15], False, 2, 1),
    "attack.bow":   ([5, 10, 13, 18], False, None, 2),
    "attack.staff": ([4, 8, 11, 16], False, None, 2),
    "skill":        ([5, 10, 14, 20], False, None, 2),
    "hurt":         ([4, 10], False, None, None),
    "death":        ([3, 6, 9, 12, 20], False, None, None),   # knock-down (slots 0-1) then lying (held)
    "victory":      ([5, 10, 15, 20], True, None, None),
}
DIAG_ACTIONS = tuple(ACTIONS)
# 3/4 views for everything that is not hand-tuned above (idle/walk)
for _k in ACTIONS:
    if _k not in FRONTQ:
        FRONTQ[_k] = [blend(SIDE[_k][i], FRONT[_k][i], FRONT[_k][i]["legs"]) for i in range(len(ACTIONS[_k][0]))]
    if _k not in BACKQ:
        BACKQ[_k] = [blend(SIDE[_k][i], BACK[_k][i], BACK[_k][i]["legs"]) for i in range(len(ACTIONS[_k][0]))]
for k, (af, *_r) in ACTIONS.items():
    for v in VIEWS:
        if k in POSES[v]:
            assert len(POSES[v][k]) == len(af), (k, v)
        else:
            assert v in BASE, (k, v)

COLS = [(k, i) for k, (af, *_r) in ACTIONS.items() for i in range(len(af))]
COL_OF = {c: i for i, c in enumerate(COLS)}

# Effect offsets (logical) per dir, anchored at the character origin
FX_OFF = {0: (0, -40), 1: (14, -16), 2: (0, -6), 3: (-14, -16), 4: (10, -34), 5: (10, -10), 6: (-10, -10), 7: (-10, -34)}

# Draw order per view; first list = wind-up slot (weapon behind the body), second = the rest
ORD_SIDE = ["body", "armor", "shield", "head", "helmet", "weapon", "hand", "effect"]
ORD_SIDE_WIND = ["weapon", "body", "armor", "shield", "head", "helmet", "hand", "effect"]
ORD_FRONT = ["body", "armor", "shield", "head", "helmet", "weapon", "hand", "effect"]
ORD_BACK = ["weapon", "shield", "body", "armor", "hand", "head", "helmet", "effect"]

# ---------------------------------------------------------------- drawing helpers


def blank(w=L, h=L):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def ab(x, y):
    return (FX + x, FY + y)


def rect(d, x0, y0, x1, y1, c):
    d.rectangle([FX + x0, FY + y0, FX + x1, FY + y1], fill=hx(c))


def seg(d, a, b, c, w=2):
    d.line([ab(*a), ab(*b)], fill=hx(c), width=w)


def outline(img, color=OUTLINE):
    """1-px outer outline around every opaque pixel (4-neighbour)."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3]:
                    dst[x, y] = color
                    break
    return out


def stack(*parts):
    """Outline each part separately, then composite in order (keeps parts readable)."""
    base = blank(*parts[0].size)
    for p in parts:
        if p is None:
            continue
        base.alpha_composite(outline(p))
    return base


def part(fn, size=(L, L)):
    im = blank(*size)
    fn(ImageDraw.Draw(im))
    return im


def up(img):
    return img.resize((img.width * S, img.height * S), Image.NEAREST)


def arm(d, shoulder, hand, sleeve, skin):
    seg(d, shoulder, hand, sleeve, 2)
    hxp, hyp = hand
    rect(d, hxp - 1, hyp - 1, hxp, hyp, skin)


def shoulders(view, b, lying=False):
    if lying:
        return (-8, -5), (-8, -4)
    if view == "side":
        return (0, -21 + b), (-1, -21 + b)        # weapon (near), off (far)
    if view == "front":
        return (-6, -21 + b), (5, -21 + b)
    if view == "frontQ":
        return (-4, -21 + b), (4, -21 + b)
    if view == "backQ":
        return (4, -21 + b), (-4, -21 + b)
    return (5, -21 + b), (-6, -21 + b)            # back: weapon arm on screen right


def torso_x(view):
    return (-4, 3) if view == "side" else (-5, 3) if view in BASE else (-5, 4)


# ---------------------------------------------------------------- layers


def draw_lying(p, c):
    """Lying on the side (death). Same art for every view; left-facing rows mirror it."""
    _, osh = shoulders("side", 0, True)
    def fn(d):
        rect(d, 2, -5, 12, -2, c["pants"])
        rect(d, 11, -6, 13, -1, c["boots"])
        rect(d, -11, -7, 1, -1, c["top"])
        rect(d, -11, -3, 1, -2, c["topD"])
    return stack(part(lambda d: arm(d, osh, p["oh"], c["topD"], c["skinD"])), part(fn))


def draw_body(view, p, c):
    bv = BASE.get(view, view)
    """Legs + torso + off arm (the arm that does not hold the weapon)."""
    if p.get("lying"):
        return draw_lying(p, c)
    b = p["b"]
    _, osh = shoulders(view, b)
    parts = []
    if bv == "side":
        parts.append(part(lambda d: arm(d, osh, p["oh"], c["topD"] if c["sleeve"] != c["skin"] else c["skinD"], c["skinD"])))
    if not c["robe"]:
        def legs(d):
            hip = -11 + b
            if bv == "side":
                nf, ff, nl, fl = p["legs"]
                seg(d, (0, hip), (ff, -fl - 1), c["pants"], 3)
                rect(d, ff - 1, -fl - 2, ff + 1, -fl - 1, c["boots"])
                seg(d, (0, hip), (nf, -nl - 1), c["pants"], 3)
                rect(d, nf - 1, -nl - 2, nf + 2, -nl - 1, c["boots"])
            else:
                ll, rl = p["legs"]
                rect(d, -4, hip, -1, -1 - ll, c["pants"])
                rect(d, 0, hip, 3, -1 - rl, c["pants"])
                rect(d, -4, -2 - ll, -1, -1 - ll, c["boots"])
                rect(d, 0, -2 - rl, 3, -1 - rl, c["boots"])
        parts.append(part(legs))

    def torso(d):
        x0, x1 = torso_x(view)
        top = -23 + b
        if c["robe"]:
            # robe: torso flares down to the ankles
            for i, y in enumerate(range(top, -1)):
                grow = max(0, (y - (-14 + b)) // 3)
                rect(d, x0 - grow, y, x1 + grow, y, c["top"])
            rect(d, x0, -14 + b, x1, -13 + b, c["accent"])
            if bv != "back":
                rect(d, -1 if bv == "front" else 1, top + 1, 0 if bv == "front" else 2, -2, c["topD"])
            if bv == "side":
                rect(d, -1, -3, 3, -1, c["boots"])
            else:
                rect(d, -4, -2, -1, -1, c["boots"])
                rect(d, 0, -2, 3, -1, c["boots"])
        else:
            rect(d, x0, top, x1, -11 + b, c["top"])
            rect(d, x0, -13 + b, x1, -12 + b, c["topD"])
            if bv == "front":
                rect(d, -1, top, 0, top + 2, c["skin"])  # collar
            if bv == "side":
                rect(d, x0, top, x0, -11 + b, c["topD"])
    parts.append(part(torso))
    if bv != "side":
        parts.append(part(lambda d: arm(d, osh, p["oh"], c["sleeve"], c["skin"])))
    return stack(*parts)


def draw_hand(view, p, c):
    wsh, _ = shoulders(view, p["b"], p.get("lying", False))
    return stack(part(lambda d: arm(d, wsh, p["wh"], c["sleeve"], c["skin"])))


def draw_armor(view, p, g):
    bv = BASE.get(view, view)
    b = p["b"]

    def fn(d):
        if p.get("lying"):
            rect(d, -11, -7, 0, -2, g["main"])
            rect(d, 0, -7, 0, -2, g["trim"])
            return
        x0, x1 = torso_x(view)
        top = -23 + b
        if g is GEAR["mantle"]:
            rect(d, x0 - 2, top, x1 + 2, top + 3, g["main"])
            rect(d, x0 - 2, top + 4, x1 + 2, top + 4, g["trim"])
            if bv != "front":
                rect(d, x0, top + 5, x1, top + 9, g["dark"])
            return
        rect(d, x0, top, x1, -14 + b, g["main"])
        rect(d, x0, -14 + b, x1, -14 + b, g["trim"])
        if bv == "front":
            rect(d, -1, top + 1, 0, -15 + b, g["dark"])
        # pauldrons
        if bv == "side":
            rect(d, -2, top - 1, 2, top + 2, g["dark"])
        else:
            rect(d, x0 - 2, top - 1, x0 + 1, top + 2, g["dark"])
            rect(d, x1 - 1, top - 1, x1 + 2, top + 2, g["dark"])
    return stack(part(fn))


def draw_shield(view, p):
    bv = BASE.get(view, view)
    ox, oy = p["oh"]

    def fn(d):
        if bv == "side":
            d.ellipse([FX + ox - 2, FY + oy - 7, FX + ox + 4, FY + oy + 6], fill=hx("#c8a24a"))
            d.ellipse([FX + ox - 1, FY + oy - 6, FX + ox + 3, FY + oy + 5], fill=hx("#333c4a"))
            rect(d, ox + 1, oy - 4, ox + 1, oy + 3, "#c8a24a")
        elif bv == "front":
            d.ellipse([FX + ox - 6, FY + oy - 6, FX + ox + 5, FY + oy + 5], fill=hx("#333c4a"))
            d.ellipse([FX + ox - 5, FY + oy - 5, FX + ox + 4, FY + oy + 4], outline=hx("#5a6572"))
            rect(d, ox - 1, oy - 4, ox, oy + 3, "#c8a24a")
            rect(d, ox - 3, oy - 1, ox + 2, oy, "#c8a24a")
        else:
            d.ellipse([FX + ox - 6, FY + oy - 6, FX + ox + 5, FY + oy + 5], fill=hx("#7a6f5c"))
            rect(d, ox - 3, oy - 1, ox + 2, oy, "#4a3a24")
    return stack(part(fn))


def draw_head(view, c, cls):
    bv = BASE.get(view, view)
    def face(d):
        d.ellipse([FX - 7, FY - 37, FX + 6, FY - 24], fill=hx(c["skin"]))

    def hair(d):
        H, HD = hx(c["hair"]), hx(c["hairD"])
        if bv == "back":
            d.ellipse([FX - 7, FY - 37, FX + 6, FY - 24], fill=H)
            rect(d, -6, -27, 5, -25, c["hairD"])
        elif bv == "side":
            d.chord([FX - 7, FY - 37, FX + 6, FY - 24], 180, 360, fill=H)
            rect(d, -7, -31, -2, -26, c["hair"])
            rect(d, -7, -27, -4, -25, c["hairD"])
        else:
            d.chord([FX - 7, FY - 37, FX + 6, FY - 26], 180, 360, fill=H)
            rect(d, -7, -32, -6, -27, c["hair"])
            rect(d, 5, -32, 6, -27, c["hair"])
        if cls == "berserker":   # spikes
            for x in (-5, -2, 1, 4):
                rect(d, x, -39, x, -37, c["hair"])
        if cls == "archer":      # headband
            rect(d, -7, -33, 6, -33, c["accent"])

    def eyes(d):
        if bv == "side":
            rect(d, 3, -31, 3, -30, "#0e0c14")
            rect(d, 6, -28, 6, -28, c["skinD"])
        elif bv == "front":
            rect(d, -3, -31, -3, -30, "#0e0c14")
            rect(d, 2, -31, 2, -30, "#0e0c14")

    def headwear(d):
        if cls == "sorcerer":
            rect(d, -9, -35, 8, -34, c["hatD"])
            for i, y in enumerate(range(-36, -45, -1)):
                w = max(0, 6 - i * 3 // 4)
                lean = -(i // 3) if bv == "side" else 0
                rect(d, -w - 1 + lean, y, w + lean, y, c["hat"])
            rect(d, -6, -36, 5, -36, c["accent"])
        elif cls in ("priest", "assassin"):
            H, HD = c["hood"], c["hoodD"]
            if bv == "back":
                d.ellipse([FX - 8, FY - 38, FX + 7, FY - 23], fill=hx(H))
                rect(d, -1, -37, 0, -24, HD)
            elif bv == "side":
                d.chord([FX - 8, FY - 38, FX + 7, FY - 23], 150, 390, fill=hx(H))
                rect(d, -8, -32, -3, -23, H)
            else:
                d.chord([FX - 8, FY - 38, FX + 7, FY - 25], 180, 360, fill=hx(H))
                rect(d, -8, -32, -6, -23, H)
                rect(d, 5, -32, 7, -23, H)
            if cls == "priest":
                rect(d, -6, -34, 5, -34, c["accent"]) if bv == "front" else None
            if cls == "assassin" and bv != "back":
                rect(d, -5 if bv == "front" else 0, -27, 4 if bv == "front" else 6, -25, c["accent"])  # scarf/mask
    def quarter(d):
        if view == "frontQ":
            rect(d, -7, -32, -3, -26, c["hair"])
        elif view == "backQ":
            rect(d, 5, -30, 6, -27, c["skin"])

    parts = [part(face), part(hair)]
    img = stack(*parts)
    d = ImageDraw.Draw(img)
    quarter(d)
    if view == "frontQ":
        rect(d, 0, -31, 0, -30, "#0e0c14")
        rect(d, 4, -31, 4, -30, "#0e0c14")
    else:
        eyes(d)
    if cls in ("sorcerer", "priest", "assassin"):
        img = _over(img, part(headwear))
    return img


def _over(base, top):
    out = base.copy()
    out.alpha_composite(outline(top))
    return out


def draw_helm(view):
    bv = BASE.get(view, view)
    def fn(d):
        steel, dark, trim = hx("#cfd8e2"), hx("#8e9aa8"), "#c8a24a"
        if bv == "side":
            d.chord([FX - 8, FY - 39, FX + 7, FY - 25], 180, 360, fill=steel)
            rect(d, -8, -32, -3, -26, "#cfd8e2")
            rect(d, -8, -32, 7, -32, trim)
            rect(d, 2, -31, 3, -27, "#8e9aa8")
        elif bv == "front":
            d.chord([FX - 8, FY - 39, FX + 7, FY - 25], 180, 360, fill=steel)
            rect(d, -8, -32, -6, -26, "#cfd8e2")
            rect(d, 5, -32, 7, -26, "#cfd8e2")
            rect(d, -8, -32, 7, -32, trim)
            rect(d, -1, -38, 0, -33, trim)
        else:
            d.ellipse([FX - 8, FY - 39, FX + 7, FY - 24], fill=steel)
            rect(d, -8, -32, 7, -32, trim)
            rect(d, -1, -38, 0, -25, "#8e9aa8")
    return stack(part(fn))


# ---------------------------------------------------------------- weapons (logical 40x40, grip at x=20)

WEAPON_GRIP = {"sword": 30, "axe": 31, "dagger": 29, "staff": 26, "holystaff": 26, "bow": 20}
WEAPON_TYPE = {"sword": "sword", "axe": "axe", "dagger": "dagger", "staff": "staff", "holystaff": "staff", "bow": "bow"}


def wrect(d, x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1, y1], fill=hx(c))


def draw_weapon(name, fine, col):
    steel, steelD = ("#f2ece0", "#e8c46a") if fine else ("#cfd8e2", "#8e9aa8")
    gold, wood, woodD = "#e8c46a", ("#9a7430" if fine else "#745436"), "#523a24"

    def fn(d):
        if name == "sword":
            wrect(d, 19, 6, 20, 25, steel); wrect(d, 20, 7, 20, 25, steelD); wrect(d, 19, 5, 19, 5, steel)
            wrect(d, 16, 26, 23, 27, gold if fine else steelD)
            wrect(d, 19, 28, 20, 31, woodD); wrect(d, 18, 32, 21, 32, gold)
            if fine:
                wrect(d, 19, 26, 20, 27, "#d4676c")
        elif name == "dagger":
            wrect(d, 19, 17, 20, 25, steel); wrect(d, 20, 18, 20, 25, steelD); wrect(d, 19, 16, 19, 16, steel)
            wrect(d, 17, 26, 22, 26, gold if fine else steelD)
            wrect(d, 19, 27, 20, 30, woodD); wrect(d, 19, 31, 20, 31, gold if fine else steelD)
        elif name == "axe":
            wrect(d, 19, 6, 20, 36, wood)
            for i, y in enumerate(range(5, 16)):
                w = 3 + min(i, 10 - i) // 2
                wrect(d, 19 - 1 - w, y, 18, y, steel)
                wrect(d, 21, y, 20 + 1 + w, y, steel)
            wrect(d, 12, 5, 12, 15, steelD); wrect(d, 27, 5, 27, 15, steelD)
            wrect(d, 18, 4, 21, 5, gold if fine else steelD)
        elif name in ("staff", "holystaff"):
            shaft = gold if name == "holystaff" else wood
            wrect(d, 19, 9, 20, 38, shaft)
            if name == "staff":
                d.ellipse([16, 2, 23, 9], fill=hx("#a894e0" if not fine else "#e8c46a"))
                wrect(d, 18, 4, 19, 5, "#f2ece0")
                wrect(d, 17, 9, 22, 10, "#4f3590")
            else:
                d.ellipse([15, 1, 24, 10], outline=hx("#f2ece0"), width=2)
                wrect(d, 19, 3, 20, 8, "#f2ece0" if fine else gold)
        elif name == "bow":
            pts = []
            for y in range(6, 35):
                x = 15 + round(5 * math.sin(math.pi * (y - 6) / 28))
                wrect(d, x - 1, y, x, y, wood)
            wrect(d, 19, 18, 20, 22, gold if fine else woodD)  # grip wrap
            if col == 0:
                d.line([(14, 6), (14, 34)], fill=hx("#e8e0d0"))
            else:
                d.line([(14, 6), (8, 20), (14, 34)], fill=hx("#e8e0d0"))
                d.line([(8, 20), (31, 20)], fill=hx("#9a7430"))
                wrect(d, 32, 19, 33, 21, "#cfd8e2")
                wrect(d, 7, 19, 8, 21, "#e07448")
    im = blank(WL, WL)
    fn(ImageDraw.Draw(im))
    return outline(im)


# ---------------------------------------------------------------- effect


def draw_slash(direct, sebF):
    """Filled crescent (big disc minus a disc pushed back toward the attacker), bulging toward `direct`."""
    im = blank()
    px = im.load()
    r2 = 0.7071
    ux, uy = {0: (0, -1), 1: (1, 0), 2: (0, 1), 3: (-1, 0), 4: (r2, -r2), 5: (r2, r2), 6: (-r2, r2), 7: (-r2, -r2)}[direct]
    r = 13 if sebF == 0 else 14
    back = 6 if sebF == 0 else 9           # sebF 1: thinner, fading crescent
    a = 255 if sebF == 0 else 150
    cx, cy = 25 - ux * 4, 25 - uy * 4
    for y in range(L):
        for x in range(L):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy > r * r:
                continue
            bx, by = dx + ux * back, dy + uy * back
            if bx * bx + by * by <= (r - 1) ** 2:
                continue
            along = dx * ux + dy * uy                       # how far toward the facing direction
            side = abs(dx * uy - dy * ux)
            if along < -2 or side > r - 2:
                continue
            core = along > r - 5
            px[x, y] = (242, 236, 224, a) if core else (232, 196, 106, a)
    return im


# ---------------------------------------------------------------- build


def sheet_slot(draw_cell):
    """One slot-layer sheet at logical resolution: columns = COLS, rows = VIEWS, each cell the CROP window."""
    sh = Image.new("RGBA", (len(COLS) * CW, len(VIEWS) * CH), (0, 0, 0, 0))
    for r, view in enumerate(VIEWS):
        for (k, i), col in COL_OF.items():
            if k not in POSES[view]:
                continue
            cell = draw_cell(view, POSES[view][k][i])
            if cell is not None:
                sh.alpha_composite(cell.crop(CROP), (col * CW, r * CH))
    return sh


def vstack(images):
    w = max(im.width for im in images)
    h = sum(im.height for im in images)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    offs = []
    for im in images:
        out.alpha_composite(im, (0, y))
        offs.append(y)
        y += im.height
    return out, offs


def skin(img, y):
    """skin record: offset in ART px (= image px * S) + storage scale"""
    return {"img": img, "x": 0, "y": y * S, "scale": S}


def build():
    images, skins, sebs = {}, {}, {}
    files = {}

    # slot layers -------------------------------------------------------
    bodies = [sheet_slot(lambda v, p, c=PAL[cls]: draw_body(v, p, c)) for cls in CLASSES]
    hands = [sheet_slot(lambda v, p, c=PAL[cls]: draw_hand(v, p, c)) for cls in CLASSES]
    armors = [sheet_slot(lambda v, p, g=GEAR[a]: draw_armor(v, p, g)) for a in GEAR]
    shield = sheet_slot(lambda v, p: draw_shield(v, p))
    files["bodies.png"], body_y = vstack(bodies)
    files["hands.png"], hand_y = vstack(hands)
    files["gear.png"], gear_y = vstack(armors + [shield])
    images.update({"bodies": "bodies.png", "hands": "hands.png", "gear": "gear.png"})
    skins["body"] = {cls: skin("bodies", body_y[i]) for i, cls in enumerate(CLASSES)}
    skins["hand"] = {cls: skin("hands", hand_y[i]) for i, cls in enumerate(CLASSES)}
    skins["armor"] = {a: skin("gear", gear_y[i]) for i, a in enumerate(GEAR)}
    skins["shield"] = {"round": skin("gear", gear_y[len(GEAR)])}
    skins["cape"] = {}

    for k, (af, *_r) in ACTIONS.items():
        for d, (dname, view) in enumerate(zip(DIR_NAME, DIR_VIEW)):
            if k not in POSES[view]:
                continue
            r = VIEWS.index(view)
            ru = 1 if DIR_MIRROR[d] else 0
            sebs[f"pose/{k}/{dname}"] = {
                "max": len(af),
                "frames": {str(i): [COL_OF[(k, i)] * CW * S, r * CH * S, CW * S, CH * S, SLOT_TRANS[0], SLOT_TRANS[1], ru, 0]
                           for i in range(len(af))},
            }

    # head / helmet (logical 50-cells) ------------------------------------
    def head_sheet(fn):
        sh = Image.new("RGBA", (len(VIEWS) * L, L), (0, 0, 0, 0))
        for i, v in enumerate(VIEWS):
            sh.alpha_composite(fn(v), (i * L, 0))
        return sh
    heads = [head_sheet(lambda v, cls=cls: draw_head(v, PAL[cls], cls)) for cls in CLASSES]
    helm = head_sheet(draw_helm)
    files["heads.png"], head_y = vstack(heads + [helm])
    images["heads"] = "heads.png"
    skins["head"] = {cls: skin("heads", head_y[i]) for i, cls in enumerate(CLASSES)}
    skins["helmet"] = {"helm": skin("heads", head_y[len(CLASSES)])}
    # frame = direction (0..7): the view cell for that direction, mirrored for the left-facing ones
    sebs["head/std"] = {"max": 8, "frames": {
        str(d): [VIEWS.index(DIR_VIEW[d]) * CELL, 0, CELL, CELL, TRANS[0], TRANS[1], 1 if DIR_MIRROR[d] else 0, 0]
        for d in range(8)}}

    # weapons (logical 40-cells) -------------------------------------------
    wimgs, weapons, wnames = [], {}, []
    for base in ["sword", "axe", "dagger", "staff", "holystaff", "bow"]:
        for fine in (False, True):
            name = base + ("_fine" if fine else "")
            sh = Image.new("RGBA", (2 * WL, WL), (0, 0, 0, 0))
            for col in (0, 1):
                sh.alpha_composite(draw_weapon(base, fine, col), (col * WL, 0))
            wimgs.append(sh)
            wnames.append(name)
            weapons[name] = {"skin": name, "handle": [20 * S, WEAPON_GRIP[base] * S], "type": WEAPON_TYPE[base]}
    files["weapons.png"], wy = vstack(wimgs)
    images["weapons"] = "weapons.png"
    skins["weapon"] = {n: skin("weapons", wy[i]) for i, n in enumerate(wnames)}
    # frame = sebF*2 + inv
    sebs["weapon/std"] = {"max": 4, "frames": {str(f): [(f // 2) * WCELL, 0, WCELL, WCELL, 0, 0, f & 1, 0] for f in range(4)}}

    # effect: 8 directions x 2 sebF (frame = sebF*8 + dir) -------------------
    fx = Image.new("RGBA", (8 * L, 2 * L), (0, 0, 0, 0))
    for sebF in (0, 1):
        for dr in range(8):
            fx.alpha_composite(draw_slash(dr, sebF), (dr * L, sebF * L))
    files["fx.png"] = fx
    images["fx"] = "fx.png"
    skins["effect"] = {"slash": skin("fx", 0)}
    sebs["fx/slash"] = {"max": 16, "frames": {str(f): [(f % 8) * CELL, (f // 8) * CELL, CELL, CELL, -CELL // 2, -CELL // 2, 0, 0]
                                             for f in range(16)}}

    # actions -----------------------------------------------------------
    actions = {}
    for k, (af, loop, impact, release) in ACTIONS.items():
        rows = []
        for d, view in enumerate(DIR_VIEW):
            if k not in POSES[view]:
                break                                  # 4-direction action: diagonals use the engine fallback
            left = DIR_MIRROR[d]
            ps = [mirror_side(p) if left else p for p in POSES[view][k]]
            wind = k == "attack" and view in ("side", "front", "frontQ")
            if BASE.get(view, view) == "back":
                order = ORD_BACK
            elif wind:
                order = [ORD_SIDE_WIND, ORD_SIDE] if view == "side" else [ORD_SIDE_WIND, ORD_FRONT]
            else:
                order = ORD_SIDE if view == "side" else ORD_FRONT    # frontQ uses the front order
            row = {
                "parts": {
                    "body": {"seb": f"pose/{k}/{DIR_NAME[d]}", "off": [[0, 0]]},
                    "head": {"seb": "head/std", "off": [[p["head"][0] * S, p["head"][1] * S] for p in ps]},
                    "weapon": {
                        "seb": ["weapon/std"],
                        "sebF": [p["sebF"] for p in ps],
                        "deg": [p["deg"] for p in ps],
                        "inv": [1 if left else 0 for _ in ps],
                        "show": [1 for _ in ps],
                        "off": [[p["wh"][0] * S, p["wh"][1] * S] for p in ps],
                    },
                },
                "order": order,
            }
            if any(p["fx"] is not None for p in ps):
                ox, oy = FX_OFF[d]
                row["parts"]["effect"] = {
                    "act": [0 if p["fx"] is None else 1 for p in ps],
                    "type": ["slash"],
                    "sebF": [p["fx"] or 0 for p in ps],
                    "off": [[ox * S, oy * S]],
                }
            rows.append(row)
        a = {"af": af, "loop": loop, "rows": rows}
        if impact is not None:
            a["impactSlot"] = impact
        if release is not None:
            a["releaseSlot"] = release
        actions[k] = a

    # Standing height per class, measured like the hero sheets (opaque top of the idle frame -> foot line,
    # weapon excluded, headwear included). The game scales each class by HERO_H / this, so placeholder heroes
    # come out the same on-screen height as the sheet heroes (sheet heroHeight 71-72).
    def standing_height(i, cls):
        pose = POSES["side"]["idle"][0]
        cell = blank()
        cell.alpha_composite(draw_body("side", pose, PAL[cls]))
        cell.alpha_composite(draw_head("side", PAL[cls], cls), (pose["head"][0], pose["head"][1]))
        bb = cell.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        return (FY - bb[1]) * S
    hero_heights = {cls: standing_height(i, cls) for i, cls in enumerate(CLASSES)}

    data = {
        "format": "mistvale-paperdoll",
        "version": 1,
        "tickRate": 20,
        "meta": {
            "placeholder": True,
            "generator": "pipeline/scripts/build_paperdoll_placeholder.py",
            "heroHeight": 72, "heroHeights": hero_heights, "footFromBottom": 8, "cell": CELL,
            "dirs": DIR_NAME, "effectDirs": 8, "diagonalActions": list(DIAG_ACTIONS), "imageScale": S,
            "defaultClass": "berserker",
            "note": "Placeholder art, mistvale-own, procedural. Not a design spec (see sprites/SPRITE_VISUAL_BIBLE.md).",
        },
        "weaponOrigin": {"dx": [0, 0, 0, 0], "dy": 0},
        "layers": {
            "cape":   {"kind": "slot", "follows": "body", "attach": {"before": "body"}},
            "body":   {"kind": "slot"},
            "armor":  {"kind": "slot", "follows": "body", "attach": {"after": "body"}},
            "shield": {"kind": "slot", "follows": "body"},
            "hand":   {"kind": "slot", "follows": "body"},
            "head":   {"kind": "dir"},
            "helmet": {"kind": "dir", "follows": "head", "attach": {"after": "head"}},
            "weapon": {"kind": "weapon"},
            "effect": {"kind": "effect"},
        },
        "images": images,
        "skins": skins,
        "sebs": sebs,
        "weapons": weapons,
        "effects": {"slash": {"seb": "fx/slash", "skin": "slash"}},
        "actions": actions,
        "aliases": {"stand": "idle", "move": "walk", "cast": "skill", "damage": "hurt", "hit": "hurt",
                    "dead": "death", "falling": "death", "knockdown": "death", "cheer": "victory"},
    }
    return files, data


def mirror_side(p):
    """Side (facing right) pose -> facing left: x and degrees negate (cells use reversU)."""
    q = dict(p)
    q["wh"] = (-p["wh"][0], p["wh"][1])
    q["oh"] = (-p["oh"][0], p["oh"][1])
    q["deg"] = -p["deg"] or 0
    q["head"] = (-p["head"][0], p["head"][1])
    return q


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def json_text(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", help="rebuild in memory and compare with assets/paperdoll")
    args = ap.parse_args(argv)
    files, data = build()
    outs = {name: png_bytes(im) for name, im in files.items()}
    outs["paperdoll.json"] = json_text(data).encode("utf-8")
    if args.check:
        bad = [n for n, b in outs.items() if not (OUT / n).exists() or (OUT / n).read_bytes() != b]
        for n in bad:
            print("DIFF", n)
        print("OK paperdoll placeholder up to date" if not bad else f"FAIL {len(bad)} file(s) differ")
        return 1 if bad else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for n, b in outs.items():
        (OUT / n).write_bytes(b)
        extra = ""
        if n.endswith(".png"):
            im = files[n]
            extra = f" {im.width}x{im.height}"
        print(f"wrote assets/paperdoll/{n} ({len(b)/1024:.1f} KB){extra}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
