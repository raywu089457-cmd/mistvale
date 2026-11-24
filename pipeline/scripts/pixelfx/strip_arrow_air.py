#!/usr/bin/env python3
"""Strip the air/wind streaks from the pixelfx arrow sheets, keeping only the arrow body.

2026-11-23 user: 「箭體飛行特效去掉空氣特效」. The pixelfx `projectiles/arrow` sheet
(assets/vfx-sheets/arrow.png, gale-arrow.png; 18 frames of 112x32) bakes wind lines,
dust specks, a head glint and a faint dark halo into every frame. This keeps, per frame,
only the opaque pixels that are 8-connected to the shaft AND belong to the stable arrow
silhouette (pixels that are part of the shaft component in at least MIN_FRAMES frames),
so streaks that happen to touch the arrow are dropped too.

Writes assets/vfx-sheets/{arrow,gale-arrow}-bare.{png,json} (same frame layout/meta),
which build.mjs bundles and pixel-world.js drawShotArrows draws. The originals stay.

    python pipeline/scripts/pixelfx/strip_arrow_air.py [--preview DIR]
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SHEETS = ROOT / "assets" / "vfx-sheets"
MIN_FRAMES = 9  # a pixel must be arrow body in at least half of the 18 frames


def shaft_component(px, ox, oy, w, h):
    def solid(x, y):
        return 0 <= x < w and 0 <= y < h and px[ox + x, oy + y][3] >= 128

    piv_y = h // 2
    seed = next((x, piv_y) for x in range(w // 2, w) if solid(x, piv_y))
    seen, stack = {seed}, [seed]
    while stack:
        x, y = stack.pop()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                n = (x + dx, y + dy)
                if n not in seen and solid(*n):
                    seen.add(n)
                    stack.append(n)
    return seen


def strip(name, preview=None):
    src = Image.open(SHEETS / f"{name}.png").convert("RGBA")
    meta = json.loads((SHEETS / f"{name}.json").read_text(encoding="utf8"))
    pf = meta["meta"]["pixelfx"]
    w, h = pf["frameSize"]
    cols, frames = pf["columns"], pf["frames"]
    px = src.load()
    origins = [((f % cols) * w, (f // cols) * h) for f in range(frames)]
    comps = [shaft_component(px, ox, oy, w, h) for ox, oy in origins]
    votes = {}
    for c in comps:
        for p in c:
            votes[p] = votes.get(p, 0) + 1
    body = {p for p, v in votes.items() if v >= MIN_FRAMES}

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    opx = out.load()
    kept = []
    for (ox, oy), comp in zip(origins, comps):
        keep = comp & body
        kept.append(len(keep))
        for x, y in keep:
            opx[ox + x, oy + y] = px[ox + x, oy + y]

    bare = f"{name}-bare"
    out.save(SHEETS / f"{bare}.png")
    meta = json.loads(json.dumps(meta).replace(f'"{name} ', f'"{bare} '))
    meta["meta"]["image"] = f"{bare}.png"
    for tag in meta["meta"].get("frameTags", []):
        tag["name"] = bare
    (SHEETS / f"{bare}.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf8")
    print(f"{bare}: body {len(body)} px, per-frame kept {min(kept)}-{max(kept)} px")

    if preview:
        for tag, im in (("before", src), ("after", out)):
            bg = Image.new("RGBA", im.size, (40, 40, 48, 255))
            bg.alpha_composite(im)
            bg.resize((im.width * 4, im.height * 4), Image.NEAREST).save(Path(preview) / f"{name}-{tag}-x4.png")


if __name__ == "__main__":
    prev = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    for n in ("arrow", "gale-arrow"):
        strip(n, prev)
