#!/usr/bin/env python3
"""Generate the ARMOR sheets (leather / plate / mantle) for the DV2-format pack.

The DV2 pack never shipped armor: `armor_*.png` are placeholder re-cuts of the
old armour blocks and build_pack.py skips them (SKIP_PLACEHOLDER_KINDS). Spec
§3 says ARMOR is *worn gear drawn over BODY on the same cells* (chest piece,
shoulder plates, mantle) and must stay inside the body silhouette ±1 px.

So the armour is drawn here, procedurally, over the shared BODY art: every
class uses the same BODY silhouette (only the palette differs), which means one
armour sheet per set covers all of them. Geometry comes from the pack itself:
the head offset of every (action, dir, slot) is the neck anchor, and the BODY
cell under that slot says which 30x30 cell to paint.

The pieces are narrow chest/shoulder bands drawn *inside* the body silhouette,
with their own near-black contour, a 3-tone ramp (light from the top-left) and
gold/leather trim, so the arms and the body's outline stay readable.

PER-CLASS MODE (`--class <c>` / `--all`): every class has its own BODY art (robes,
bare chest, plate...), so one shared sheet does not fit. For each class the three
sets are fitted to that class's own BODY cells: the body alpha mask gives the
silhouette (armor is painted only on interior pixels, so the body's own contour
stays), the neck anchor of each cell (head offset in the pack) gives the collar
line, and the torso window is sized from the class's stand pose so the arms stay
readable. Output: assets/paperdoll-dv2/src/armor_<set>_<class>.png (the shared
armor_<set>.png stay as the fallback), plus sources.json entries, a checker report
and a review montage output/dv2fmt/review/armor_<class>.png.

Usage:
  python pipeline/scripts/dv2fmt/gen_armor.py [--out DIR] [--montage]        # legacy shared sheets
  python pipeline/scripts/dv2fmt/gen_armor.py --class sorcerer               # one class, 3 sheets
  python pipeline/scripts/dv2fmt/gen_armor.py --all                          # 7 classes, 21 sheets
  python pipeline/scripts/dv2fmt/gen_armor.py --check [--class c | --all]    # check existing sheets only
Exit status 1 if any checked sheet has pixels outside the dilated silhouette or a body cell without armor.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import dv2fmt as F

ROOT = F.ROOT
PACK = F.PACK_DIR / "paperdoll.json"
SPEC = ROOT / "sprites" / "DV2_FORMAT_SPEC.md"
SRC_BODY = F.SRC_DIR / "paladin_body.png"
WORK = F.OUT_DIR / "work" / "missing"

CELL = F.CELL

# items palette (pipeline/scripts/dv2fmt/palettes.json -> "items")
IT = {
    "deep": (0x0e, 0x0c, 0x14),
    "hi2": (0xf2, 0xec, 0xe0),
    "steel_hi": (0xcf, 0xd8, 0xe2),
    "steel": (0x8e, 0x9a, 0xa8),
    "steel_lo": (0x5a, 0x65, 0x72),
    "gold": (0xe8, 0xc4, 0x6a),
    "gold_lo": (0xc8, 0xa2, 0x4a),
    "brass": (0x9a, 0x74, 0x30),
    "leather_hi": (0x9a, 0x74, 0x30),
    "leather": (0x74, 0x54, 0x36),
    "leather_lo": (0x52, 0x3a, 0x24),
    "strap": (0x7a, 0x4e, 0x30),
    "red": (0x7c, 0x2b, 0x31),
    "red_lo": (0x4a, 0x1a, 0x1e),
    "rose": (0xd4, 0x67, 0x6c),
}

OUTLINE = IT["deep"]


# ---------------------------------------------------------------- silhouette -
def load_body():
    return Image.open(SRC_BODY).convert("RGBA")


def cell_alpha(im: Image.Image, col: int, row: int):
    box = (col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL)
    a = im.crop(box).getchannel("A")
    return [[a.getpixel((x, y)) > 96 for x in range(CELL)] for y in range(CELL)]


def runs(rowmask):
    out, start = [], None
    for x, on in enumerate(rowmask):
        if on and start is None:
            start = x
        elif not on and start is not None:
            out.append((start, x - 1))
            start = None
    if start is not None:
        out.append((start, len(rowmask) - 1))
    return out


def torso_run(rowmask, nx: int, maxw: int = 15):
    """The contiguous body run on this row that the torso is part of."""
    rs = runs(rowmask)
    if not rs:
        return None
    inside = [r for r in rs if r[0] <= nx <= r[1]]
    pick = inside[0] if inside else min(rs, key=lambda r: min(abs(r[0] - nx), abs(r[1] - nx)))
    x0, x1 = pick
    if x1 - x0 + 1 > maxw:
        half = maxw // 2
        x0, x1 = max(nx - half, x0), min(nx + half, x1)
    return x0, x1


# ---------------------------------------------------------------- anchors ----
def pack_anchors():
    """cell -> neck in cell coords (from the pack action table)."""
    if not PACK.exists():
        return {}
    data = json.loads(PACK.read_text(encoding="utf-8"))
    sebs = data["sebs"]
    found = {}
    for _key, act in data["actions"].items():
        rows = act.get("rows") or []
        rows = list(rows.items()) if isinstance(rows, dict) else list(enumerate(rows))
        for _dkey, row in rows:
            if not isinstance(row, dict):
                continue
            parts = row.get("parts") or {}
            body, head = parts.get("body"), parts.get("head")
            if not body or not head:
                continue
            name = body["seb"][0] if isinstance(body["seb"], list) else body["seb"]
            seb = sebs.get(name)
            if not seb:
                continue
            offs = head.get("off") or [[0, 0]]
            for slot in range(len(act["af"])):
                fr = seb["frames"][str(slot % seb["max"])]
                cell = (fr[0] // CELL, fr[1] // CELL)
                ox, oy = offs[slot] if slot < len(offs) else offs[-1]
                found.setdefault(cell, (ox + 15, oy + 30))  # foot-anchored -> cell
    return found


def spec_anchors():
    """cell -> neck (fallback: the anchor table in the spec)."""
    found = {}
    if not SPEC.exists():
        return found
    pat = re.compile(
        r"\| (back|side|front)(?: \(all\))? \| \((\d+),(\d+)\) \| (\w+) \| "
        r"\((\d+),(\d+)\) \| \((\d+),(\d+)\) \| \((\d+),(\d+)\) \|"
    )
    for line in SPEC.read_text(encoding="utf-8").splitlines():
        m = pat.search(line)
        if m:
            found[(int(m.group(2)), int(m.group(3)))] = (int(m.group(5)), int(m.group(6)))
    return found


# ------------------------------------------------------------------ painting -
def body_row(mask, y, nx):
    """(x0, x1) of the torso run on this row, or None."""
    return torso_run(mask[y], nx)


def band_for(mask, y, nx, width):
    """Chest band: centred on the neck, kept inside the torso run."""
    run = body_row(mask, y, nx)
    if not run:
        return None
    x0, x1 = run
    avail = x1 - x0 + 1
    w = min(width, max(3, avail - 2))
    left = nx - w // 2
    left = max(x0 + 1, min(left, x1 - w))
    right = left + w - 1
    if right > x1 - 1:
        right, left = x1 - 1, max(x0 + 1, x1 - w)
    return left, right


def paint_armor(mask, neck, style):
    nx, ny = int(neck[0]), int(neck[1])
    nx = max(3, min(26, nx))
    out = {}

    def put(x, y, c, inside=True):
        if not (0 <= x < CELL and 0 <= y < CELL):
            return
        if inside and not mask[y][x]:
            return
        out.setdefault(y, {})[x] = c

    if ny >= CELL:
        # lying cell: the hero is on the ground, head at the left, feet right
        left, right = nx + 6, min(CELL - 1, nx + 15)
        rows = [y for y in range(ny - 9, min(ny - 2, CELL))]
        if style == "plate":
            ramp = [IT["hi2"], IT["steel_hi"], IT["steel"], IT["steel"],
                    IT["steel_lo"], IT["gold"]]
        elif style == "leather":
            ramp = [IT["leather_hi"], IT["leather_hi"], IT["leather"], IT["leather"],
                    IT["leather_lo"], IT["strap"]]
        else:
            ramp = [IT["rose"], IT["red"], IT["red"], IT["red_lo"], IT["red_lo"], IT["gold"]]
        for i, y in enumerate(rows):
            for x in range(left, right + 1):
                put(x, y, ramp[min(i, len(ramp) - 1)], inside=False)
            if style == "plate":
                put(left, y, IT["deep"], inside=False)
                put(right, y, IT["deep"], inside=False)
        return out

    if style == "plate":
        rows = [y for y in range(ny + 1, min(ny + 10, CELL))]
        width = 9
    elif style == "leather":
        rows = [y for y in range(ny + 1, min(ny + 9, CELL))]
        width = 8
    else:
        rows = [y for y in range(ny, min(ny + 4, CELL))]
        width = 12
    if not rows:
        return out
    n = len(rows)
    mid = nx

    for i, y in enumerate(rows):
        band = band_for(mask, y, nx, width)
        if not band:
            continue
        left, right = band

        if style == "plate":
            for x in range(left, right + 1):
                if i == 0:
                    c = IT["hi2"]
                elif i == 1:
                    c = IT["steel_hi"] if x <= mid else IT["steel"]
                elif i == n - 1:
                    c = IT["gold"] if (x - left) % 2 == 0 else IT["gold_lo"]
                else:
                    c = IT["steel_hi"] if x == left + 1 else (
                        IT["steel"] if x < right else IT["steel_lo"])
                    if x == mid and i > 1:
                        c = IT["steel_lo"]          # breastplate seam
                if x == left or x == right:
                    c = IT["deep"] if i not in (0,) else c
                put(x, y, c)
            # pauldrons: a one pixel cap outside the chest, top rows only
            if i <= 1:
                put(left, y, IT["deep"])
                put(right, y, IT["deep"])
                for dx, base in ((-1, IT["steel_hi"]), (1, IT["steel_hi"])):
                    put(left + dx, y, base)
                    put(right + dx, y, base)
                put(left - 2, y, IT["steel"] if i else IT["gold"])
                put(right + 2, y, IT["steel"] if i else IT["gold"])
                put(left - 2, y + 1, IT["deep"])
                put(right + 2, y + 1, IT["deep"])
        elif style == "leather":
            for x in range(left, right + 1):
                if i == 0 and abs(x - mid) <= 1:
                    continue                    # throat opening
                if i == 0:
                    c = IT["leather_hi"] if x <= mid else IT["strap"]
                elif i == n - 1:
                    c = IT["gold_lo"] if x == mid else IT["strap"]
                else:
                    c = IT["leather_hi"] if x == left + 1 else IT["leather"]
                    if x == right:
                        c = IT["leather_lo"]
                    if x == mid and i % 3 == 2:
                        c = IT["brass"]         # lacing
                if x == left:
                    c = IT["deep"]
                put(x, y, c)
            if i <= 1:                          # shoulder pads
                put(left - 1, y, IT["leather_hi"])
                put(right + 1, y, IT["leather_lo"])
                put(left - 2, y, IT["deep"])
                put(right + 2, y, IT["deep"])
        else:  # mantle
            run = body_row(mask, y, nx)
            if not run:
                continue
            x0, x1 = run
            shrink = max(0, i - 1)
            lo_x, hi_x = max(0, x0 - 1 + shrink), min(CELL - 1, x1 + 1 - shrink)
            for x in range(lo_x, hi_x + 1):
                if i == 0:
                    c = IT["rose"] if x < mid else IT["red"]
                elif i == n - 1:
                    c = IT["gold"] if (x + i) % 3 else IT["gold_lo"]
                else:
                    c = IT["red"] if x < hi_x else IT["red_lo"]
                if x in (lo_x, hi_x):
                    c = IT["red_lo"] if i not in (0,) else c
                put(x, y, c)
            if i == 0:                          # hood behind the neck
                for x in range(mid - 2, mid + 3):
                    put(x, y, IT["red_lo"], inside=False)
                put(mid, y, IT["rose"], inside=False)
            put(lo_x, y, IT["deep"], inside=False)
            put(hi_x, y, IT["deep"], inside=False)
    return out


def build_style(style, body, anchors):
    sheet = Image.new("RGBA", (CELL * 10, CELL * 10), (0, 0, 0, 0))
    px = sheet.load()
    for row in range(10):
        for col in range(10):
            neck = anchors.get((col, row))
            if not neck:
                continue
            mask = cell_alpha(body, col, row)
            if not any(any(r) for r in mask):
                continue
            for y, xs in paint_armor(mask, neck, style).items():
                for x, c in xs.items():
                    px[col * CELL + x, row * CELL + y] = (*c, 255)
    return sheet


def montage(sheets, path: Path, scale: int = 6):
    cols = 10 * len(sheets)
    w, h = cols * CELL * scale, 10 * CELL * scale
    out = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    op = out.load()
    for y in range(0, h, 8):
        for x in range(0, w, 8):
            c = (46, 44, 54, 255) if ((x // 8 + y // 8) % 2) else (34, 32, 40, 255)
            for yy in range(y, min(y + 8, h)):
                for xx in range(x, min(x + 8, w)):
                    op[xx, yy] = c
    for i, im in enumerate(sheets):
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        out.alpha_composite(big, (i * CELL * 10 * scale, 0))
    out.convert("RGB").save(path)




# =============================================================================
# PER-CLASS ARMOR (fitted to each class's own BODY art)
# =============================================================================
CLASS_LIST = list(F.CLASSES)
REVIEW_DIR = F.OUT_DIR / "review"
SOURCES = F.SRC_DIR / "sources.json"
LYING = F.LYING
POSE_VIEW = {}                      # (col,row) -> (view, pose)
for _v, _p, _x, _y in F.all_body_cells():
    POSE_VIEW[(_x // CELL, _y // CELL)] = (_v, _p)

DEEP, HI2, STEEL_HI, STEEL, STEEL_LO = (IT[k] for k in ("deep", "hi2", "steel_hi", "steel", "steel_lo"))
GOLD, GOLD_LO, BRASS = IT["gold"], IT["gold_lo"], IT["brass"]
LEA_HI, LEA, LEA_LO, STRAP = IT["leather_hi"], IT["leather"], IT["leather_lo"], IT["strap"]
RED, RED_LO, ROSE = IT["red"], IT["red_lo"], IT["rose"]


def erode4(m):
    p = np.pad(m, 1)
    return m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]


def dilate8(m):
    p = np.pad(m, 1)
    out = np.zeros_like(m)
    h, w = m.shape
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            out |= p[dy:dy + h, dx:dx + w]
    return out


def sheet_mask(im: Image.Image):
    return np.asarray(im.convert("RGBA"))[..., 3] > 96


def cell_mask(sheet_m, col, row):
    return sheet_m[row * CELL:(row + 1) * CELL, col * CELL:(col + 1) * CELL]


def all_anchors():
    """cell -> neck (cell coords). Spec table first, the pack's head offsets override (they are what the engine uses)."""
    an = spec_anchors()
    try:
        an.update(pack_anchors())
    except Exception as e:  # pack mid-rebuild by another agent: the spec table is the same data
        print(f"  (pack anchors unavailable: {e}; using the spec table)")
    return an


def torso_hw(mask, nx, ny):
    """Half-width of the chest window for this class/view, from its stand pose: the run is the torso plus an arm
    on each side (~2 px each incl. outline), so the window is (width - 4) // 2, clamped."""
    ws = []
    for y in range(ny + 3, ny + 6):
        rs = runs(mask[y].tolist())
        if not rs:
            continue
        inside = [r for r in rs if r[0] <= nx <= r[1]] or [min(rs, key=lambda r: min(abs(r[0] - nx), abs(r[1] - nx)))]
        ws.append(inside[0][1] - inside[0][0] + 1)
    w = sum(ws) / len(ws) if ws else 9
    return max(2, min(5, int((w - 4) // 2)))


class Ctx:
    """Everything one cell's painters need. px = {(x, y): rgb} on the cell grid."""

    def __init__(self, mask, neck, view, hw, dark=False):
        self.mask = mask
        self.inter = erode4(mask)
        self.nx = max(3, min(26, int(neck[0])))
        self.ny = int(neck[1])
        self.dark = dark
        self.ny = self._top_row()
        self.nx = self._torso_centre()
        self.view, self.hw = view, hw
        self.near = dilate8(mask)           # silhouette +1 px: the most the spec lets armour spill out
        self.px = {}

    def _top_row(self):
        """First body row at or below the neck anchor that is at least 3 px wide near the neck. Normally the neck row
        itself; in a few poses (side victory) the drawn body starts lower than the anchor, and the armour follows the
        body, not the anchor."""
        for y in range(self.ny, min(CELL, self.ny + 10)):
            er = self.edge_run(y, 12)
            if er and er[1] - er[0] + 1 >= 3:
                return y
        return self.ny

    def _torso_centre(self):
        """The neck anchor is where the head sits; the torso under it can be offset (side views, leaning poses).
        Centre the chest window on the body below the shoulders, at most 2 px from the neck."""
        nx, ny = self.nx, self.ny
        cs = []
        for y in range(ny + 4, min(CELL, ny + 8)):
            rs = runs(self.inter[y].tolist())
            if not rs:
                continue
            inside = [r for r in rs if r[0] <= nx <= r[1]]
            r = inside[0] if inside else min(rs, key=lambda r: min(abs(r[0] - nx), abs(r[1] - nx)))
            if r[1] - r[0] <= 12:
                cs.append((r[0] + r[1]) / 2)
        if not cs:
            return nx
        d = int(round(sum(cs) / len(cs) - nx))
        return max(3, min(26, nx + max(-2, min(2, d))))

    # ---- primitives
    def put(self, x, y, c):
        """interior pixel only (the body's own 1 px contour is never overwritten)"""
        if 0 <= x < CELL and 0 <= y < CELL and self.inter[y, x]:
            self.px[(x, y)] = c

    def put_edge(self, x, y, c):
        """interior pixel gets c, a contour pixel stays near-black (silhouette keeps its outline)"""
        if 0 <= x < CELL and 0 <= y < CELL and self.mask[y, x]:
            self.px[(x, y)] = c if self.inter[y, x] else DEEP

    def ring(self, x, y, c=DEEP):
        """one pixel just outside the silhouette (spec: armour may exceed the body by 1 px); must touch the body"""
        if 0 <= x < CELL and 0 <= y < CELL and not self.mask[y, x] and self.near[y, x]:
            self.px[(x, y)] = c

    def force(self, x, y, c):
        """any body pixel, contour included (used when the armour moves the outline 1 px outward)"""
        if 0 <= x < CELL and 0 <= y < CELL and self.mask[y, x]:
            self.px[(x, y)] = c

    def edge_run(self, y, hw):
        """(a, b, left_is_body_edge, right_is_body_edge) of the body run on row y clipped to nx +- hw"""
        if not (0 <= y < CELL):
            return None
        rs = runs(self.mask[y].tolist())
        if not rs:
            return None
        nx = self.nx
        inside = [r for r in rs if r[0] <= nx <= r[1]]
        pick = inside[0] if inside else min(rs, key=lambda r: min(abs(r[0] - nx), abs(r[1] - nx)))
        a, b = max(pick[0], nx - hw), min(pick[1], nx + hw)
        return (a, b, a == pick[0], b == pick[1]) if a <= b else None

    def _run(self, arr, y, hw):
        if not (0 <= y < CELL):
            return None
        rs = runs(arr[y].tolist())
        if not rs:
            return None
        nx = self.nx
        inside = [r for r in rs if r[0] <= nx <= r[1]]
        pick = inside[0] if inside else min(rs, key=lambda r: min(abs(r[0] - nx), abs(r[1] - nx)))
        a, b = max(pick[0], nx - hw), min(pick[1], nx + hw)
        return (a, b) if a <= b else None

    def span(self, y, hw):
        return self._run(self.inter, y, hw)

    def span_edge(self, y, hw):
        return self._run(self.mask, y, hw)

    # ---- shared passes
    def drop_specks(self, max_size=2):
        """remove 1-2 px fragments that touch nothing (a bulge outline whose pad was clipped away): they would float"""
        left = set(self.px)
        comps, seen = [], set()
        for p0 in left:
            if p0 in seen:
                continue
            comp, stack = [], [p0]
            seen.add(p0)
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        q = (x + dx, y + dy)
                        if q in left and q not in seen:
                            seen.add(q)
                            stack.append(q)
            comps.append(comp)
        if any(len(c) > max_size for c in comps):
            for c in comps:
                if len(c) <= max_size:
                    for q in c:
                        del self.px[q]

    def contour(self):
        """deep line on the sides of the armour where it borders un-armoured body (the arms): separates chest from arm"""
        keep = set(self.px)
        for (x, y) in list(keep):
            for dx in (-1, 1):
                q = (x + dx, y)
                if q not in keep and 0 <= q[0] < CELL and self.inter[y, q[0]]:
                    self.px[(x, y)] = DEEP
                    break


# ---------------------------------------------------------------- the sets ---
def paint_leather(s: Ctx):
    H, nx, ny = 8, s.nx, s.ny
    if s.dark:      # brown-skinned body: a darker vest with gold studs keeps the jerkin readable
        _HI, _MID, _LO, _STRAP, _STUD = LEA, LEA_LO, DEEP, GOLD_LO, GOLD
    else:
        _HI, _MID, _LO, _STRAP, _STUD = LEA_HI, LEA, LEA_LO, STRAP, BRASS
    _BUCKLE = GOLD_LO
    front, back, side = s.view == "front", s.view == "back", s.view == "side"
    spans = {}
    for i in range(H):
        y = ny + i
        sp = s.span(y, s.hw)
        if not sp:
            continue
        a, b = sp
        spans[i] = sp
        for x in range(a, b + 1):
            if i == 0:
                if front and x == nx:
                    continue                          # open collar
                c = _HI if x <= nx else _MID
            elif i == H - 1:                          # belt
                c = _LO
                if x == nx and not back:
                    c = _BUCKLE
                elif side and x == b:
                    c = _BUCKLE
            elif i == H - 2:
                c = _LO if x >= nx else _MID
            else:
                c = _MID
                if x == a:
                    c = _HI
                elif x == b:
                    c = _LO
                elif i <= 2 and x < nx:
                    c = _HI
            s.put(x, y, c)
    # bandolier / chest strap
    if spans:
        if front or back:
            for i in range(1, H - 1):
                if i not in spans:
                    continue
                aa, bb = spans[i]
                t = (i - 1) / max(1, H - 3)
                x = round(aa + t * (bb - aa)) if not back else round(bb - t * (bb - aa))
                s.put(x, ny + i, _STRAP if i % 3 else _STUD)
                s.put(x + 1 if not back else x - 1, ny + i, _LO)
            if front:                                  # lacing
                for i in (2, 4):
                    if i in spans:
                        s.put(nx, ny + i, _STUD)
        else:                                          # side: chest strap across, studs
            for i in (2, 4):
                if i in spans:
                    for x in range(spans[i][0], spans[i][1] + 1):
                        s.put(x, ny + i, _LO)
                    s.put(spans[i][1], ny + i, _STUD)
    # shoulder pads: two px outside the chest window, top rows; outline 1 px out on row 1
    cols = {0: (_HI, _MID), 1: (_MID, _LO), 2: (_LO, _LO)}
    shoulder_pad(s, spans, (0, 1, 2), cols, 3, bulge_rows=(1,))
    s.contour()


def shoulder_pad(s: Ctx, spans, rows, colors, reach, bulge_rows=()):
    """pad over each shoulder: on rows `rows` (i = row below the neck) paint from the chest window out to the body
    edge (at most `reach` px beyond the window). colors[i] = (left colour, right colour). On `bulge_rows` the outline
    is moved 1 px outward (the pad sticks out of the silhouette by 1 px, as the spec allows)."""
    ny = s.ny
    for i in rows:
        if i not in spans:
            continue
        y = ny + i
        er = s.edge_run(y, s.hw + reach)
        if not er:
            continue
        r0, r1, le, re = er
        a, b = spans[i]
        cl, cr = colors[i]
        for x in range(r0, a):
            if i in bulge_rows and le and x == r0:
                s.force(x, y, cl)
            else:
                s.put_edge(x, y, cl)
        for x in range(b + 1, r1 + 1):
            if i in bulge_rows and re and x == r1:
                s.force(x, y, cr)
            else:
                s.put_edge(x, y, cr)
        if i in bulge_rows:
            if le:
                s.ring(r0 - 1, y)
            if re:
                s.ring(r1 + 1, y)
    last = max(bulge_rows) if bulge_rows else None
    if last is not None and last + 1 not in rows:       # bottom contour of the bulge
        er = s.edge_run(ny + last, s.hw + reach)
        if er:
            if er[2]:
                s.ring(er[0] - 1, ny + last + 1)
            if er[3]:
                s.ring(er[1] + 1, ny + last + 1)


def paint_plate(s: Ctx):
    H, nx, ny, hw = 8, s.nx, s.ny, s.hw
    front, back, side = s.view == "front", s.view == "back", s.view == "side"
    spans = {}
    for i in range(H):
        y = ny + i
        sp = s.span(y, hw)
        if not sp:
            continue
        a, b = sp
        spans[i] = sp
        for x in range(a, b + 1):
            if i == 0:
                c = HI2 if x == a else STEEL_HI                    # gorget rim
            elif i == H - 1:
                c = GOLD if (x - a) % 2 == 0 else GOLD_LO          # gold trim along the fauld
            elif i == H - 2:
                c = STEEL_LO
            else:
                c = STEEL
                if x == a:
                    c = STEEL_HI                                    # lit left edge
                elif x == b:
                    c = STEEL_LO
                if i == 1 and x < b:
                    c = STEEL_HI                                    # shoulder-line highlight
                if i == 4 and x != a:
                    c = STEEL_LO                                    # rib line
                if not side and x == nx and i not in (1, 4):
                    c = STEEL_LO if back else STEEL_HI              # back: spine seam, front: sternum ridge
                if side and x == b and i >= 2:
                    c = STEEL_HI                                    # leading edge catches the light
            s.put(x, y, c)
    if not side:
        # pauldrons: dome over each shoulder, outline moved 1 px outward on rows 1-2
        cols = {0: (STEEL_HI, STEEL_HI), 1: (STEEL, STEEL_LO), 2: (GOLD, GOLD_LO)}
        shoulder_pad(s, spans, (0, 1, 2), cols, 3, bulge_rows=(1, 2))
    else:
        # side view: one round pauldron over the near shoulder
        for i, (x0, x1) in enumerate(((nx - 1, nx), (nx - 2, nx + 1), (nx - 2, nx + 1))):
            for x in range(x0, x1 + 1):
                c = ((HI2 if x == x0 else STEEL_HI) if i == 0 else (STEEL if i == 1 else GOLD))
                s.put(x, ny + i, c)
        for x in range(nx - 2, nx + 2):
            s.put(x, ny + 3, DEEP)
        s.put(nx + 2, ny + 1, DEEP)
        s.put(nx + 2, ny + 2, DEEP)
    s.contour()


def paint_mantle(s: Ctx):
    R, nx, ny, hw = 6, s.nx, s.ny, s.hw
    front, back, side = s.view == "front", s.view == "back", s.view == "side"
    spans = {}
    for i in range(R):
        y = ny + i
        half = max(2, hw + 1 - (i // 3)) if side else hw + 2 - max(0, (i - 1) // 2)
        sp = s.span(y, half)
        if not sp:
            continue
        a, b = sp
        spans[i] = sp
        for x in range(a, b + 1):
            t = (x - a) / max(1, b - a)
            if i == 0:
                c = ROSE if t < 0.5 else RED
            elif i == R - 1:
                c = GOLD if (x - nx) % 2 == 0 else GOLD_LO         # hem
            else:
                c = RED
                if x == a or i == 1:
                    c = ROSE if t < 0.6 else RED
                elif t > 0.7:
                    c = RED_LO
                if back and x == nx:
                    c = RED_LO                                     # centre fold
            if front and i >= 2 and abs(x - nx) <= (i - 2) // 2:
                continue                                           # open at the front, body shows
            if front and i == 1 and x == nx:
                c = GOLD                                           # clasp
            s.put(x, y, c)
    if not side:
        # cape edge over the shoulders: out to the body edge, outline moved 1 px outward on rows 1-3
        cols = {0: (ROSE, RED), 1: (ROSE, RED), 2: (RED, RED_LO), 3: (RED, RED_LO)}
        shoulder_pad(s, spans, (0, 1, 2, 3), cols, 3, bulge_rows=(1, 2, 3))
    s.contour()


def paint_lying(s: Ctx, style):
    """the lying cell: head (KO face, part of BODY) on the left, torso then legs to the right"""
    ys, xs = np.nonzero(s.mask)
    tx0 = int(xs.min()) + 13                       # the KO head is ~13 px wide
    tx1 = tx0 + 7
    cols = range(tx0, tx1 + 1)
    rows = sorted({y for y in range(CELL) for x in cols if s.inter[y, x]})
    if not rows:
        return
    top, bot = rows[0], rows[-1]
    n = bot - top + 1
    for x in cols:
        for y in range(top, bot + 1):
            if not s.inter[y, x]:
                continue
            j, k = y - top, x - tx0
            if style == "plate":
                if x == tx1:
                    c = GOLD if y % 2 == 0 else GOLD_LO
                elif j == 0:
                    c = HI2 if k < 4 else STEEL_HI
                elif k <= 1:
                    c = STEEL_HI if j < n - 2 else STEEL
                elif j >= n - 2:
                    c = STEEL_LO
                else:
                    c = STEEL if k < 5 else STEEL_LO
                if k == 0 and j == 0:
                    c = GOLD
            elif style == "leather":
                if x == tx1:
                    c = LEA_LO if y != (top + bot) // 2 else GOLD_LO   # belt
                elif j == 0:
                    c = LEA_HI
                elif j == n - 1:
                    c = LEA_LO
                elif k == 0:
                    c = LEA_HI
                else:
                    c = LEA
                if k - j in (1, 2) and 0 < j < n - 1 and x < tx1:
                    c = STRAP if k - j == 1 else LEA_LO               # bandolier
            else:  # mantle: cloth over the shoulder end, hem toward the legs
                if k > 4:
                    continue
                if k == 4:
                    c = GOLD if y % 2 == 0 else GOLD_LO
                elif j == 0 or k == 0:
                    c = ROSE
                else:
                    c = RED if j < n - 2 else RED_LO
            s.put(x, y, c)
    s.contour()


PAINTERS = {"leather": paint_leather, "plate": paint_plate, "mantle": paint_mantle}


def brown_body(body: Image.Image):
    """True when the class's torso is about the colour of the leather ramp (berserker): needs the dark vest"""
    a = np.asarray(body.convert("RGBA"))
    cols = []
    for cx, cy in ((4, 0), (4, 4)):
        t = a[cy * CELL + 16:cy * CELL + 23, cx * CELL:(cx + 1) * CELL]
        px = t[t[..., 3] > 96][:, :3]
        px = px[px.sum(1) > 120]
        if len(px):
            cols.append(px.mean(0))
    if not cols:
        return False
    m = np.mean(cols, axis=0)
    return float(np.sqrt(((m - np.array(LEA)) ** 2).sum())) < 32


def build_class_style(style, body: Image.Image, anchors):
    sm = sheet_mask(body)
    dark = style == "leather" and brown_body(body)
    sheet = Image.new("RGBA", (CELL * 10, CELL * 10), (0, 0, 0, 0))
    px = sheet.load()
    hw_by_view = {}
    for view, (c, r) in (("back", (4, 0)), ("side", (4, 2)), ("front", (4, 4))):
        neck = anchors.get((c, r), (15, 14))
        hw_by_view[view] = torso_hw(cell_mask(sm, c, r), int(neck[0]), int(neck[1]))
    for (col, row), (view, pose) in POSE_VIEW.items():
        mask = cell_mask(sm, col, row)
        if not mask.any():
            continue
        neck = anchors.get((col, row))
        if not neck:
            continue
        ctx = Ctx(mask, neck, view, hw_by_view[view], dark)
        if pose == "lying":
            paint_lying(ctx, style)
        else:
            PAINTERS[style](ctx)
        ctx.drop_specks()
        for (x, y), c in ctx.px.items():
            px[col * CELL + x, row * CELL + y] = (*c, 255)
    return sheet, hw_by_view


# ------------------------------------------------------------------ checker --
def small_components(a, max_size=2):
    """number of 8-connected armour fragments of at most max_size px in a bool grid (floating specks)"""
    seen = np.zeros_like(a)
    n = 0
    h, w = a.shape
    for y0 in range(h):
        for x0 in range(w):
            if a[y0, x0] and not seen[y0, x0]:
                stack, size = [(y0, x0)], 0
                seen[y0, x0] = True
                while stack:
                    y, x = stack.pop()
                    size += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = y + dy, x + dx
                            if 0 <= yy < h and 0 <= xx < w and a[yy, xx] and not seen[yy, xx]:
                                seen[yy, xx] = True
                                stack.append((yy, xx))
                if size <= max_size:
                    n += 1
    return n


def check_sheet(armor: Image.Image, body: Image.Image, anchors):
    """-> dict(outside, empty_cells, above_neck, cover_max, px)
    outside      armor pixels outside the body silhouette dilated by 1 px, incl. any armor in reserved cells (must be 0)
    empty_cells  body cells (used cells with body art) that have no armor at all (must be 0)
    above_neck   armor pixels more than 1 row above the neck line (would sit over the face; advisory)
    specks       armour fragments of 1-2 px that touch nothing else (floating bits; advisory)
    cover_max    largest share of a cell's body pixels that carries armor (advisory: arms readable)"""
    bm = sheet_mask(body)
    am = np.asarray(armor.convert("RGBA"))[..., 3] > 0
    outside = int((am & ~dilate8(bm)).sum())
    empty, above, cover, cover_cell, specks = [], 0, 0.0, None, 0
    for (col, row), (view, pose) in sorted(POSE_VIEW.items()):
        b = cell_mask(bm, col, row)
        a = cell_mask(am, col, row)
        if b.any() and not a.any():
            empty.append(f"{view}:{pose}@{col},{row}")
        if a.any():
            specks += small_components(a)
        if a.any() and pose != "lying":
            ny = int(anchors.get((col, row), (15, 14))[1])
            ys = np.nonzero(a)[0]
            above += int((ys < ny - 1).sum())
        if b.any():
            cv = (a & b).sum() / b.sum()
            if cv > cover:
                cover, cover_cell = float(cv), f"{view}:{pose}"
    return {"outside": outside, "empty_cells": empty, "above_neck": above,
            "cover_max": round(cover, 2), "cover_cell": cover_cell, "px": int(am.sum()), "specks": specks}


def fmt_check(name, r):
    ok = r["outside"] == 0 and not r["empty_cells"]
    empties = " " + str(r["empty_cells"]) if r["empty_cells"] else ""
    return (f"{'OK  ' if ok else 'FAIL'} {name:28s} px={r['px']:4d} outside={r['outside']} "
            f"empty_cells={len(r['empty_cells'])}{empties} "
            f"above_neck={r['above_neck']} specks={r['specks']} max_cover={r['cover_max']}({r['cover_cell']})"), ok


# ------------------------------------------------------------------ montage --
MAIN_POSES = ["stand0", "walk0", "windup", "strike1", "hurt", "cast0", "victory0", "lying"]
MORE_POSES = ["stand1", "walk1", "walk2", "walk3", "strike0", "cast1", "aim0", "aim1", "thrust", "kneel",
              "victory1", "windup"]


def review_montage(cls, sheets, body, head, anchors, path: Path, scale: int = 4, poses=None):
    """rows = (front, side, back) x (no armor, leather, plate, mantle); columns = stand, walk, windup, strike,
    hurt, cast, victory (+ lying on the side rows). Body + armor + head at 4x."""
    poses = poses or MAIN_POSES
    views = ["front", "side", "back"]
    kinds = [("none", None)] + [(s, sheets[s]) for s in F.ARMORS]
    lab, cw = 64, CELL * scale
    W, Hh = lab + cw * len(poses), cw * len(views) * len(kinds)
    out = Image.new("RGBA", (W, Hh), (0, 0, 0, 255))
    d = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    for ri, (view, (kname, arm)) in enumerate((v, k) for v in views for k in kinds):
        y0 = ri * cw
        for ci, pose in enumerate(poses):
            x0 = lab + ci * cw
            shade = (40, 38, 48, 255) if (ri + ci) % 2 else (34, 32, 42, 255)
            d.rectangle([x0, y0, x0 + cw - 1, y0 + cw - 1], fill=shade)
            if pose == "lying":
                if view != "side":
                    continue
                col, row = LYING
            else:
                pc, pr = F.POSE_CELLS[pose]
                col, row = pc, pr + F.VIEW_BAND[view]
            box = (col * CELL, row * CELL, col * CELL + CELL, row * CELL + CELL)
            cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            cell.alpha_composite(body.crop(box))
            if arm is not None:
                cell.alpha_composite(arm.crop(box))
            out.alpha_composite(cell.resize((cw, cw), Image.NEAREST), (x0, y0))
            if pose != "lying" and head is not None:
                nk = anchors.get((col, row))
                if nk:
                    hrow = 0 if view == "back" else 1
                    hc = head.crop((0, hrow * 20, 20, hrow * 20 + 20))
                    hb = hc.resize((20 * scale, 20 * scale), Image.NEAREST)
                    out.alpha_composite(hb, (x0 + (int(nk[0]) - 10) * scale, y0 + (int(nk[1]) - 20) * scale))
        d.text((4, y0 + 4), view, fill=(230, 230, 230, 255), font=font)
        d.text((4, y0 + 18), kname, fill=(240, 200, 120, 255), font=font)
        d.line([(0, y0 + cw - 1), (W, y0 + cw - 1)], fill=(80, 78, 96, 255))
    for ci, pose in enumerate(poses):
        d.text((lab + ci * cw + 4, 2), pose, fill=(150, 200, 230, 255), font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.convert("RGB").save(path)


# --------------------------------------------------------------------- driver -
def update_sources(names_from):
    try:
        srcs = json.loads(SOURCES.read_text(encoding="utf-8"))
    except Exception:
        srcs = {}
    for fname, frm in names_from.items():
        srcs[fname] = {"from": frm, "placeholder": False}
    SOURCES.write_text(json.dumps(dict(sorted(srcs.items())), indent=1) + chr(10), encoding="utf-8")


def run_classes(classes, out_dir: Path, do_gen, do_montage, do_sources):
    anchors = all_anchors()
    print(f"anchors: {len(anchors)} cells")
    all_ok, written = True, {}
    for cls in classes:
        body = Image.open(F.SRC_DIR / f"{cls}_body.png").convert("RGBA")
        sheets = {}
        for style in F.ARMORS:
            fname = f"armor_{style}_{cls}.png"
            p = out_dir / fname
            if do_gen:
                im, _hw = build_class_style(style, body, anchors)
                out_dir.mkdir(parents=True, exist_ok=True)
                im.save(p)
                written[fname] = f"gen_armor.py --class {cls}"
            else:
                im = Image.open(p).convert("RGBA")
            sheets[style] = im
            line, ok = fmt_check(fname, check_sheet(im, body, anchors))
            print(line)
            all_ok &= ok
        if do_montage:
            hp = F.SRC_DIR / f"{cls}_head.png"
            head = Image.open(hp).convert("RGBA") if hp.exists() else None
            mp = REVIEW_DIR / f"armor_{cls}.png"
            review_montage(cls, sheets, body, head, anchors, mp)
            mp2 = REVIEW_DIR / f"armor_{cls}_more.png"
            review_montage(cls, sheets, body, head, anchors, mp2, poses=MORE_POSES)
            print(f"     montage -> {mp} (+ {mp2.name}: the remaining poses)")
    if do_sources and written:
        update_sources(written)
        print(f"sources.json: {len(written)} entries")
    return all_ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None, help="output dir (legacy: work/missing; per class: assets/paperdoll-dv2/src)")
    ap.add_argument("--montage", action="store_true", help="legacy shared-sheet montage")
    ap.add_argument("--class", dest="cls", choices=CLASS_LIST, help="fit the 3 sets to this class's BODY art")
    ap.add_argument("--all", action="store_true", help="all 7 classes (21 sheets)")
    ap.add_argument("--check", action="store_true", help="only check the existing per-class sheets")
    ap.add_argument("--no-montage", action="store_true", help="per-class mode: skip output/dv2fmt/review/armor_<class>.png")
    ap.add_argument("--no-sources", action="store_true", help="per-class mode: do not touch sources.json")
    args = ap.parse_args()

    if args.cls or args.all:
        classes = CLASS_LIST if args.all else [args.cls]
        out_dir = Path(args.out) if args.out else F.SRC_DIR
        ok = run_classes(classes, out_dir, not args.check, not args.no_montage,
                         not args.no_sources and not args.check and out_dir == F.SRC_DIR)
        return 0 if ok else 1
    if args.check:
        print("--check needs --class <c> or --all")
        return 2

    # ---- legacy: the shared sheets (fallback when a class has no own sheet)
    out = Path(args.out) if args.out else WORK
    out.mkdir(parents=True, exist_ok=True)
    body = load_body()
    anchors = spec_anchors()
    anchors.update(pack_anchors())
    print(f"anchors: {len(anchors)} cells")
    sheets = []
    for style in F.ARMORS:
        im = build_style(style, body, anchors)
        p = out / f"armor_{style}.png"
        im.save(p)
        alpha = list(im.getchannel("A").getdata())
        print(f"armor_{style}: {sum(1 for v in alpha if v)} px -> {p}")
        sheets.append(im)
    if args.montage:
        mp = out / "armor-review.png"
        montage(sheets, mp)
        print(f"montage -> {mp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
