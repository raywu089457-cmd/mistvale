#!/usr/bin/env python3
"""review_parts2x.py <class> [<class> ...] -- review sheet for the DV2-rig 2x parts.

Panel A: every installed part of the class on a labelled grid (4x).
Panel B: body + head stacked the way rig2x.py composes them (head chin 3 rows over the
         body's collar, both centred on the body's collar x), per pose and view -- this is
         the "does the part design fit the rig composition" check of docs/DV2-RIG-PROMPTS.md 0.4.

Output: output/dv2fmt/review/<class>_parts2x.png   (also prints the measured content sizes)
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "dv2fmt"))
import pixellab_parts as P  # noqa: E402

SRC = ROOT / "assets" / "paperdoll-dv2" / "src" / "x2"
OUT = ROOT / "output" / "dv2fmt" / "review"
Z = 5                      # zoom of panel A
NECK_OVERLAP = 3           # rig2x.NECK_OVERLAP
POSES = ["stand", "walk_l", "walk_r", "windup", "chop", "swing", "hurt", "crouch", "cheer", "lying"]
VIEWS = ["front", "side", "back"]


def rgba(p):
    return np.asarray(Image.open(p).convert("RGBA")).copy()


def content_of(im):
    a = im[..., 3] > 0
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def crop(im):
    b = content_of(im)
    return im[b[1]:b[3], b[0]:b[2]] if b else im


def collar_x(im):
    a = im[..., 3] > 0
    top = np.nonzero(a.any(1))[0].min()
    bx = np.nonzero(a[top:top + 3].any(0))[0]
    return (bx.min() + bx.max() + 1) / 2


def compose(body, head, H, W):
    """body content onto a WxH tile feet on the last row, head chin NECK_OVERLAP rows over the collar"""
    b = crop(body)
    hb = crop(head)
    bh, bw = b.shape[:2]
    hh, hw = hb.shape[:2]
    W = max(W, bw + 2, hw + 2)
    H = max(H, bh + hh)
    out = np.zeros((H, W, 4), np.uint8)
    bx = int(round(W / 2 - bw / 2))
    by = H - bh
    out[by:by + bh, bx:bx + bw] = b
    hx = int(round(W / 2 - hw / 2))
    hy = by - hh + NECK_OVERLAP
    out[hy:hy + hh, hx:hx + hw] = hb
    return out, (bx, by, bw, bh, hx, hy, hw, hh)


def main():
    cls = sys.argv[1]
    src = SRC / cls
    if not src.exists():
        sys.exit(f"no parts for {cls}: {src}")
    parts = {}
    for p in sorted(src.glob("*.png")):
        parts[p.stem] = rgba(p)

    tile = 60 * Z
    cols = 6
    rows = int(np.ceil(len(parts) / cols))
    A = Image.new("RGBA", (cols * tile, rows * (tile + 18) + 24), (32, 34, 44, 255))
    dr = ImageDraw.Draw(A)
    dr.text((6, 4), f"{cls}  DV2-rig 2x parts ({len(parts)})  x{Z}", fill=(235, 235, 235))
    for i, (name, im) in enumerate(parts.items()):
        gx, gy = (i % cols) * tile, 24 + (i // cols) * (tile + 18)
        t = Image.new("RGBA", (60, 60), (54, 58, 74, 255) if i % 2 else (62, 67, 86, 255))
        sub = Image.fromarray(im)
        t.alpha_composite(sub, ((60 - sub.width) // 2, (60 - sub.height) // 2))
        A.alpha_composite(t.resize((tile, tile), Image.NEAREST), (gx, gy))
        dr.text((gx + 3, gy + tile + 3), name, fill=(220, 220, 220))

    # panel B: composed stand/walk/attack/hurt/victory/death, front/side/back
    composes = [("stand", "normal"), ("walk_l", "normal"), ("walk_r", "normal"), ("windup", "shout"),
                ("chop", "shout"), ("swing", "hurt"), ("hurt", "hurt"), ("cheer", "happy"), ("lying", "ko")]
    TW, TH = 44, 52
    bx = 8
    B = Image.new("RGBA", (len(VIEWS) * len(composes) * TW * Z // 1 + 160, TH * Z + 60), (32, 34, 44, 255))
    bdr = ImageDraw.Draw(B)
    bdr.text((6, 4), f"{cls}  body+head composition preview (rig2x: chin {NECK_OVERLAP}px over the collar)", fill=(235, 235, 235))
    for ci, view in enumerate(VIEWS):
        for i, (pose, expr) in enumerate(composes):
            bp = parts.get(f"body_{pose}_{view}")
            hp = parts.get("head_back" if view == "back" else f"head_{expr}_{view}")
            if bp is None or hp is None:
                continue
            tile_c, _ = compose(bp, hp, TH, TW)
            t = Image.new("RGBA", (TW, TH), (54, 58, 74, 255) if i % 2 else (62, 67, 86, 255))
            t.alpha_composite(Image.fromarray(tile_c))
            x = bx + (ci * len(composes) + i) * TW * Z // 2
            B.alpha_composite(t.resize((TW * Z // 2, TH * Z // 2), Image.NEAREST), (x, 30))
            bdr.text((x + 2, 30 + TH * Z // 2 + 2), f"{pose[:7]}/{view[:2]}", fill=(200, 200, 200))

    OUT.mkdir(parents=True, exist_ok=True)
    A.save(OUT / f"{cls}_parts2x.png")
    B.save(OUT / f"{cls}_compose2x.png")
    print(f"panel A -> {A.size} {OUT / (cls + '_parts2x.png')}")
    print(f"panel B -> {B.size} {OUT / (cls + '_compose2x.png')}")
    for name, im in parts.items():
        c = content_of(im)
        if c:
            print(f"  {name:28s} canvas {im.shape[1]}x{im.shape[0]} content {c[2] - c[0]}x{c[3] - c[1]}")


if __name__ == "__main__":
    main()
