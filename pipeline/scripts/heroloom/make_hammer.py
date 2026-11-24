#!/usr/bin/env python3
"""HeroLoom paper-doll weapon part: paladin war hammer (聖騎士戰錘).

Regenerates assets/heroloom/parts/weapon/hammer.png (main layer) and hammer.back.png (back layer)
from scratch, as code:

  1. a small pixel-art hammer template is painted in the HeroLoom palette (the exact colours the sword
     sheet uses: ink #150d1b, steel ramp, gold ramp, wood ramp) with the same 1 px ink outline;
  2. for every action frame the template is rotated into place with the frame's anchor
     (hand = grip pivot, weaponAngle = direction the head points, degrees clockwise from +x, y down),
     nearest neighbour only, no anti-aliasing;
  3. which layer a frame lands on, and whether a frame is empty, is copied from sword.png / sword.back.png
     (the sheets must exist; the sword is only read, never changed);
  4. frames with anchor smear:true get a swing crescent in the sword's smear style (same 4-step steel/white ramp
     + ink outline), drawn procedurally around the hand.

Usage:  python pipeline/scripts/heroloom/make_hammer.py        (needs Pillow + numpy)
Output sheets are 512x448 RGBA, 8 columns x 8 rows of 64x56 cells, same layout as sword.png.
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "assets" / "heroloom"
WEAPON = PACK / "parts" / "weapon"

# ---- palette: only colours that already exist in the sword sheet ---------------------------------
INK = (0x15, 0x0D, 0x1B)
PAL = {
    # steel (blade ramp)
    "H": (0xF0, 0xF8, 0xEC),
    "L": (0xA8, 0xC8, 0xBC),
    "S": (0x6C, 0x90, 0x94),
    "D": (0x3C, 0x5C, 0x74),
    "N": (0x1C, 0x30, 0x50),
    # gold (guard / pommel ramp)
    "G": (0xF4, 0xCC, 0x50),
    "g": (0xDC, 0x98, 0x20),
    "b": (0xB0, 0x5C, 0x10),
    "m": (0x70, 0x28, 0x0C),
    # wood (grip ramp)
    "w": (0x8C, 0x54, 0x30),
    "d": (0x64, 0x34, 0x22),
    "k": (0x3E, 0x1A, 0x1C),
}

# ---- template -------------------------------------------------------------------------------------
# u = along the haft (hand grip at u=0, head points toward +u); v = across it (0 = centre line).
# Column index c = u + U0, row index r = v + V0. Haft core is 2 rows (v -1, 0); head core is 8 rows (v -4..3).
# The grip point sits near the butt end: the pommel is only 3 px behind the hand, so ~14 px of haft shows in front
# of the hand (u 2..14) and the silhouette reads as "a long stick with a block on top".
U0, V0 = 4, 5
TW, TH = 27, 10  # u -4..22, v -5..4

# Head: 7 cols (u 15..21) x 8 rows. Steel all over: the two strike faces (first/last row, at the head's ends) are a
# lighter steel than the body, a small gold holy cross in the middle. Row 0 is the "up" face at weaponAngle 0.
HEAD_U = 15
HEAD = [
    "LHHHLLS",
    "LLSSSSD",
    "LSSGSDD",
    "LSGGGDD",
    "LSSGSDD",
    "SSSSSDD",
    "SSSSDDN",
    "SLLLLDN",
]


def build_template():
    t = [[None] * TW for _ in range(TH)]

    def put(u, v, ch):
        t[v + V0][u + U0] = PAL[ch]

    # haft: wood, 2 rows (v -1 and 0), u -1..14, leather wraps in the grip zone
    for u in range(-1, 15):
        put(u, -1, "w")
        put(u, 0, "d")
    for u in (0, 3, 6):
        put(u, -1, "d")
        put(u, 0, "k")
    # pommel cap: gold, 2 wide x 4 tall
    for u in (-3, -2):
        put(u, -2, "g")
        put(u, -1, "G")
        put(u, 0, "g")
        put(u, 1, "b")
    # gold collar where the haft meets the head: 2 wide x 4 tall
    for u in (13, 14):
        put(u, -2, "G")
        put(u, -1, "g")
        put(u, 0, "g")
        put(u, 1, "b")
    # head
    for j, row in enumerate(HEAD):
        for i, ch in enumerate(row):
            if ch != ".":
                put(HEAD_U + i, j - 4, ch)

    # 1 px ink outline (4-neighbour), exactly like the sword sheet
    filled = [[c is not None for c in row] for row in t]
    for y in range(TH):
        for x in range(TW):
            if filled[y][x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < TW and 0 <= ny < TH and filled[ny][nx]:
                    t[y][x] = INK
                    break
    return t


def stamp(cell, tmpl, hand, angle_deg):
    """Rotate `tmpl` about the grip into `cell` (64x56 RGBA array). Nearest neighbour, pixel-centre sampling."""
    th = math.radians(angle_deg)
    ca, sa = math.cos(th), math.sin(th)
    hx, hy = hand[0] + 0.5, hand[1] + 0.5
    h, w = cell.shape[:2]
    clipped = 0
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - hx, y + 0.5 - hy
            u = dx * ca + dy * sa
            v = -dx * sa + dy * ca
            c = math.floor(u + U0)
            r = math.floor(v + V0)
            if 0 <= c < TW and 0 <= r < TH:
                px = tmpl[r][c]
                if px is not None:
                    cell[y, x] = (*px, 255)
    # count template pixels that would fall outside the cell (sanity check, reported by main)
    for r in range(TH):
        for c in range(TW):
            if tmpl[r][c] is None:
                continue
            u, v = c - U0 + 0.5, r - V0 + 0.5
            x = hx + u * ca - v * sa
            y = hy + u * sa + v * ca
            if not (0 <= x < w and 0 <= y < h):
                clipped += 1
    return clipped


# ---- smear ----------------------------------------------------------------------------------------
# (action, frame) -> (centre dx, dy from hand, outer radius, tail angle, leading-edge angle, max width).
# Angles are degrees clockwise from +x (screen, y down); the swing runs tail -> lead (increasing angle).
# Tuned against the sword's own crescents (attack frames 2 and 3).
SMEAR = {
    ("attack", 2): dict(c=(1.0, -1.0), r_out=22.5, a0=172, a1=362, wmax=12.0),
    ("attack", 3): dict(c=(0.0, 0.0), r_out=23.0, a0=-88, a1=28, wmax=11.0),
}
RAMP = [(1.3, "D"), (2.6, "S"), (4.6, "L")]  # distance from the inner edge -> colour; beyond = white


def draw_smear(cell, hand, p):
    h, w = cell.shape[:2]
    cx, cy = hand[0] + 0.5 + p["c"][0], hand[1] + 0.5 + p["c"][1]
    a0, a1 = p["a0"], p["a1"]
    mask = np.zeros((h, w), bool)
    dist = np.zeros((h, w), float)
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            r = math.hypot(dx, dy)
            a = math.degrees(math.atan2(dy, dx))
            while a < a0:
                a += 360
            while a > a0 + 360:
                a -= 360
            if a > a1:
                continue
            s = (a - a0) / (a1 - a0)
            width = p["wmax"] * (s ** 0.85)
            # round off the sharp tail
            if width < 0.8:
                continue
            r_in = p["r_out"] - width
            if r_in <= r <= p["r_out"]:
                mask[y, x] = True
                dist[y, x] = r - r_in
    # shading + outline
    for y in range(h):
        for x in range(w):
            if mask[y, x]:
                d = dist[y, x]
                col = "H"
                for lim, ch in RAMP:
                    if d < lim:
                        col = ch
                        break
                cell[y, x] = (*PAL[col], 255)
    for y in range(h):
        for x in range(w):
            if mask[y, x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and mask[ny, nx]:
                    cell[y, x] = (*INK, 255)
                    break


def main():
    spec = json.loads((PACK / "character.json").read_text(encoding="utf-8"))
    cw, ch = spec["cell"]
    cols = spec["columns"]
    sw_main = np.array(Image.open(WEAPON / "sword.png").convert("RGBA"))
    sw_back = np.array(Image.open(WEAPON / "sword.back.png").convert("RGBA"))
    H, W = sw_main.shape[:2]
    out_main = np.zeros((H, W, 4), np.uint8)
    out_back = np.zeros((H, W, 4), np.uint8)
    tmpl = build_template()

    stats = []
    clipped_total = 0
    for act, a in spec["actions"].items():
        for i in range(a["frames"]):
            an = spec["anchors"][act][i]
            x0, y0 = i * cw, a["row"] * ch
            sl = (slice(y0, y0 + ch), slice(x0, x0 + cw))
            main_n = int((sw_main[sl][..., 3] > 0).sum())
            back_n = int((sw_back[sl][..., 3] > 0).sum())
            if main_n == 0 and back_n == 0:
                stats.append((act, i, "empty (sword empty)"))
                continue
            cm = np.zeros((ch, cw, 4), np.uint8)
            cb = np.zeros((ch, cw, 4), np.uint8)
            hand, ang = an["hand"], an["weaponAngle"]
            smear_target = None
            if an["smear"]:
                p = SMEAR[(act, i)]
                smear_target = cb if back_n > main_n else cm  # same layer choice as the sword's crescent
                draw_smear(smear_target, hand, p)
            body_target = cm if main_n > 0 else cb  # hammer follows the sword's main/back layer
            clipped_total += stamp(body_target, tmpl, hand, ang)
            out_main[sl] = cm
            out_back[sl] = cb
            stats.append((act, i, f"main {int((cm[..., 3] > 0).sum())} back {int((cb[..., 3] > 0).sum())}"))

    Image.fromarray(out_main, "RGBA").save(WEAPON / "hammer.png", optimize=True)
    Image.fromarray(out_back, "RGBA").save(WEAPON / "hammer.back.png", optimize=True)
    for s in stats:
        print(*s)
    print("template pixels outside the cell:", clipped_total)
    print("wrote", WEAPON / "hammer.png", "and", WEAPON / "hammer.back.png")


if __name__ == "__main__":
    main()
