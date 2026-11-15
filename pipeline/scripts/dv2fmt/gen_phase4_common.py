"""gen_phase4_common.py -- tiny helpers shared by gen_hats.py / gen_weapons.py / gen_fx.py (Phase 4 content: hats, weapons, effects).

All art is drawn at 1x from ASCII blocks / procedural shapes, upscaled 8x (nearest) and run through import_sheet.py's import_one,
so the palette snap and the EDGE / EMPTY checks are the same as for any other sheet. No generation service, no outside art."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dv2fmt as F  # noqa: E402
import import_sheet as IS  # noqa: E402

# item palette symbols (palettes.json "items")
SYM = {
    "o": "#0e0c14", "W": "#cfd8e2", "S": "#8e9aa8", "D": "#5a6572",
    "Y": "#e8c46a", "G": "#c8a24a", "g": "#9a7430",
    "b": "#745436", "B": "#523a24", "r": "#7a4e30",
    "R": "#7c2b31", "q": "#4a1a1e", "v": "#a894e0", "V": "#7457b8",
    "w": "#f2ece0", "p": "#d4676c",
    "!": "#ffffff",                                   # effects palette white
    "h": "#9a7430", "m": "#745436", "d": "#523a24",   # leather ramp (light / mid / dark): aliases of g / b / B
}


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def canvas(w, h):
    return np.zeros((h, w, 4), np.uint8)


def put(img, x, y, sym):
    if sym in (".", " "):
        return
    img[y, x, :3] = rgb(SYM[sym])
    img[y, x, 3] = 255


def blit_rows(img, ox, oy, rows):
    """rows = {y: (x0, 'string')} relative to (ox, oy); '.' = transparent"""
    for y, (x0, s) in rows.items():
        for i, ch in enumerate(s):
            put(img, ox + x0 + i, oy + y, ch)


def mirror_into(img, ox, oy, axis2, cmap=None, w=20):
    """mirror what is already drawn in the cell at (ox,oy) around x' = axis2 - x (only onto empty pixels); cmap recolours the copy"""
    cell = img[oy:oy + w, ox:ox + w].copy()
    inv = {rgb(v): rgb(SYM[cmap[k]]) for k, v in SYM.items() if cmap and k in cmap}
    ys, xs = np.nonzero(cell[..., 3])
    for y, x in zip(ys, xs):
        nx = axis2 - x
        if 0 <= nx < w and img[oy + y, ox + nx, 3] == 0:
            c = tuple(int(v) for v in cell[y, x, :3])
            img[oy + y, ox + nx, :3] = inv.get(c, c)
            img[oy + y, ox + nx, 3] = 255


def save_1x(img, path):
    Image.fromarray(img, "RGBA").save(path)


def import_via_x8(kind, name, img, tmpdir=None):
    """img = 1x RGBA array of the full sheet; upscale 8x, hand to import_sheet.import_one. Returns True on success."""
    tmpdir = Path(tmpdir or tempfile.gettempdir())
    p = tmpdir / f"{F.src_name(kind, name)[:-4]}_x8.png"
    Image.fromarray(img, "RGBA").resize((img.shape[1] * 8, img.shape[0] * 8), Image.NEAREST).save(p)
    return IS.import_one(kind, name, str(p))


def fine_map(img):
    """same recolour as output/dv2fmt/work/derive_fine.py (cooler greys brighter, browns to gold)"""
    M = {'#cfd8e2': '#f2ece0', '#8e9aa8': '#cfd8e2', '#5a6572': '#8e9aa8', '#745436': '#c8a24a', '#523a24': '#9a7430', '#7a4e30': '#e8c46a',
         '#9a7430': '#c8a24a', '#c8a24a': '#e8c46a', '#e8c46a': '#f2ece0'}
    out = img.copy()
    for a, b in M.items():
        sel = (img[..., 3] > 0) & (img[..., :3] == np.array(rgb(a))).all(-1)
        out[sel, :3] = rgb(b)
    return out


def outline4(img, sym="o"):
    """add a 1 px outline (4-neighbourhood) around everything already drawn, onto empty pixels only"""
    a = img[..., 3] > 0
    n = np.zeros_like(a)
    n[1:] |= a[:-1]
    n[:-1] |= a[1:]
    n[:, 1:] |= a[:, :-1]
    n[:, :-1] |= a[:, 1:]
    ys, xs = np.nonzero(n & ~a)
    for y, x in zip(ys, xs):
        put(img, x, y, sym)


def dist_to_empty(mask):
    """4-neighbour BFS distance of every True pixel to the nearest False pixel (1 = touches empty)"""
    from collections import deque
    h, w = mask.shape
    d = np.full((h, w), 99, int)
    q = deque()
    for y in range(h):
        for x in range(w):
            if not mask[y, x]:
                d[y, x] = 0
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and d[ny, nx] > d[y, x] + 1:
                d[ny, nx] = d[y, x] + 1
                q.append((ny, nx))
    return d
