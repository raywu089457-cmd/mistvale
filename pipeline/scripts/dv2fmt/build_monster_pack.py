#!/usr/bin/env python3
"""build_monster_pack.py — DV2 C2 single-layer monster paperdoll pack from the existing assets/monsters3 sheets (no new art).

    python pipeline/scripts/dv2fmt/build_monster_pack.py            # write assets/monsterdoll/
    python pipeline/scripts/dv2fmt/build_monster_pack.py --check    # rebuild in memory, fail if the files on disk differ

DV2 draws a monster as ONE layer from a per-monster "4x4 virtual table" (rows = direction-ish views, columns = frames), with the
animation scripts (SEB_M_WALK/STAND/CHARGE/CHARGE2/DAMAGE/RIDE/DOWN/DIE) shared and the physical PNG an optimised re-pack of the
virtual table (.opt). This script does the same with our art (dv2-lab docs/04-monster-animation.md; docs/PAPERDOLL.md §21):

  virtual table : per species, 4 rows (up / right / down / left) x the frames of each SEB_M action, taken from the monsters3 rows
                  (idle/walk/attack + Down/Up/Left, hurt, death). Same 4-direction rule as the game (src/dir4.js): right = the plain row,
                  down = <act>Down, up = <act>Up, left = the baked <act>Left row, else the plain row mirrored (ru = 1).
  physical PNG  : every distinct source cell cropped to its opaque box, shelf-packed (deduplicated) -> assets/monsterdoll/<species>.png
  data          : assets/monsterdoll/monsterdoll.json, the same mistvale-paperdoll format as the hero pack (one `body` layer, action key
                  `<species>/<seb_m>`, 4 rows each) so src/paperdoll.js computeParts / computeMonsterParts renders it unchanged.

SEB_M -> monsters3 row/frames:
  walk -> walk<D> (all)      stand -> idle<D> (all)      charge -> attack<D> [0, release)     charge2 -> attack<D> [release, end)
  damage -> hurt (all)       ride -> idle<D> (all; monsters3 has no ridden pose)              down -> death (last frame, held)
  die -> death (all)
hurt/death only exist as the side view: right/up/down use it as is, left mirrors it.
Timing: monsters3 frame times are 75/100/120/200 ms -> tickRate 200 (5 ms ticks) keeps every af exact (DV2 is 20 ticks/s).
Every sprite re-assembles the monsters3 cell pixel for pixel (test-paperdoll.mjs compares them).
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
MON = ROOT / "assets" / "monsters3"
OUT = ROOT / "assets" / "monsterdoll"
DIRS = ["up", "right", "down", "left"]
SUF = {"up": "Up", "right": "", "down": "Down", "left": "Left"}
SEB_M = ["walk", "stand", "charge", "charge2", "damage", "ride", "down", "die"]
TICK_RATE = 200
ATLAS_W = 512
SIDE_ONLY = ("hurt", "death")
LOOP = {"walk", "stand", "ride"}


def src_row(acts: dict, base: str, d: str):
    """(row name, mirror) for this base action and direction (same rule as src/dir4.js dirSuffix/leftRow)"""
    if base in SIDE_ONLY:
        return base, 1 if d == "left" else 0
    name = base + SUF[d]
    if name in acts:
        return name, 0
    return base, 1 if d == "left" else 0


def frames_for(seb: str, row: dict):
    n = row["frames"]
    rel = row.get("release", 4) if isinstance(row.get("release"), int) else 4
    rel = max(1, min(n - 1, rel)) if n > 1 else 0
    return {
        "walk": range(n), "stand": range(n), "ride": range(n), "damage": range(n), "die": range(n),
        "charge": range(0, rel) if rel else range(1), "charge2": range(rel, n),
        "down": range(n - 1, n),
    }[seb]


BASE_OF = {"walk": "walk", "stand": "idle", "ride": "idle", "charge": "attack", "charge2": "attack", "damage": "hurt", "down": "death", "die": "death"}


def build():
    files, images, skins, sebs, actions = {}, {}, {}, {}, {}
    cells_meta, species = {}, []
    for jf in sorted(MON.glob("*.json")):
        sp = jf.stem
        meta = json.loads(jf.read_text(encoding="utf-8"))
        sheet = Image.open(MON / f"{sp}.png").convert("RGBA")
        acts = meta["actions"]
        species.append(sp)
        # ---- collect the source cells this species uses
        uses = []   # (seb, d, row, mirror, [frames])
        for seb in SEB_M:
            for d in DIRS:
                row, mir = src_row(acts, BASE_OF[seb], d)
                uses.append((seb, d, row, mir, list(frames_for(seb, acts[row]))))
        crops = {}   # (row, f) -> (bbox, image)
        for _, _, row, _, frs in uses:
            r = acts[row]
            C = r["cell"]
            for f in frs:
                if (row, f) in crops:
                    continue
                cell = sheet.crop((f * C, r["y"], f * C + C, r["y"] + C))
                a = np.asarray(cell)[..., 3]
                ys, xs = np.nonzero(a)
                if not len(xs):
                    crops[(row, f)] = ((0, 0, 0, 0), None)
                    continue
                bb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
                crops[(row, f)] = (bb, cell.crop(bb))
        # ---- shelf-pack distinct crops (identical pixels share one atlas rect)
        uniq, where = {}, {}
        for k, (bb, im) in crops.items():
            if im is None:
                continue
            h = hashlib.sha1(im.tobytes() + bytes(str(im.size), "ascii")).hexdigest()
            uniq.setdefault(h, im)
            where[k] = h
        order = sorted(uniq, key=lambda h: (-uniq[h].height, -uniq[h].width, h))
        pos, x, y, shelf = {}, 0, 0, 0
        for h in order:
            im = uniq[h]
            if x + im.width > ATLAS_W:
                x, y, shelf = 0, y + shelf, 0
            pos[h] = (x, y)
            x += im.width
            shelf = max(shelf, im.height)
        atlas = Image.new("RGBA", (ATLAS_W, max(1, y + shelf)), (0, 0, 0, 0))
        for h, (px, py) in pos.items():
            atlas.alpha_composite(uniq[h], (px, py))
        files[f"{sp}.png"] = atlas
        images[sp] = f"{sp}.png"
        skins[sp] = {"img": sp, "x": 0, "y": 0}
        C0 = acts["idle"]["cell"]
        foot = (C0 // 2, C0 - meta["footFromBottom"])
        cells_meta[sp] = {"cell": C0, "foot": list(foot), "size": meta.get("size"), "artSize": meta.get("artSize")}

        # ---- actions: 4 rows, one seb each (the virtual table row for that direction)
        by_seb = {}
        for seb, d, row, mir, frs in uses:
            by_seb.setdefault(seb, {})[d] = (row, mir, frs)
        for seb in SEB_M:
            rows, src, ticks = [], [], None
            for d in DIRS:
                row, mir, frs = by_seb[seb][d]
                r = acts[row]
                C = r["cell"]
                fx, fy = C // 2, C - meta["footFromBottom"]
                fr = {}
                for i, f in enumerate(frs):
                    bb, im = crops[(row, f)]
                    if im is None:
                        fr[str(i)] = [0, 0, 0, 0, 0, 0, mir, 0]
                        continue
                    u, v = pos[where[(row, f)]]
                    x0, y0, x1, y1 = bb
                    tx = (C - x1) - fx if mir else x0 - fx   # mirrored: the whole cell flips about its centre (C even)
                    fr[str(i)] = [u, v, x1 - x0, y1 - y0, tx, y0 - fy, mir, 0]
                key = f"m/{sp}/{seb}/{d}"
                sebs[key] = {"max": len(frs), "frames": fr}
                rows.append({"parts": {"body": {"seb": key, "off": [[0, 0]]}}, "order": ["body"]})
                src.append({"row": row, "from": frs[0], "n": len(frs), "mirror": mir})
                t = [round(r["frameTime"] * TICK_RATE)] * len(frs)
                if ticks is None or len(t) > len(ticks):
                    ticks = t
            af, acc = [], 0
            for t in ticks:
                acc += max(1, t)
                af.append(acc)
            actions[f"{sp}/{seb}"] = {"af": af, "loop": seb in LOOP, "rows": rows, "src": src, "dv2": {"sebM": SEB_M.index(seb)}}

    data = {
        "format": "mistvale-paperdoll", "version": 1, "tickRate": TICK_RATE,
        "meta": {
            "kind": "monster",
            "generator": "pipeline/scripts/dv2fmt/build_monster_pack.py",
            "source": "assets/monsters3 (re-packed, pixel-identical; no new art)",
            "dirs": DIRS, "sebM": SEB_M, "species": species, "cells": cells_meta,
            "note": "DV2 C2 single-layer monster paperdoll (docs/PAPERDOLL.md §21). Action key <species>/<seb_m>; 4 rows = up/right/down/left "
                    "(the per-species virtual table); src[] = which monsters3 row/frames each row re-assembles. Opt-in renderer: ?mdoll=1.",
        },
        "weaponOrigin": {"dx": [0, 0, 0, 0], "dy": 0},
        "layers": {"body": {"kind": "slot"}},
        "images": images, "skins": {"body": skins}, "sebs": sebs, "weapons": {}, "effects": {},
        "actions": actions, "aliases": {},
    }
    return files, data


def png_bytes(im):
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    files, data = build()
    outs = {n: png_bytes(im) for n, im in files.items()}
    outs["monsterdoll.json"] = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    stale = sorted(p.name for p in OUT.glob("*") if p.is_file() and p.name not in outs) if OUT.exists() else []
    if a.check:
        bad = [n for n, b in outs.items() if not (OUT / n).exists() or (OUT / n).read_bytes() != b] + [n + " (stale)" for n in stale]
        print("OK monsterdoll pack up to date" if not bad else "FAIL differs: " + ", ".join(bad))
        return 1 if bad else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for n in stale:
        (OUT / n).unlink()
    total = 0
    for n, b in outs.items():
        (OUT / n).write_bytes(b)
        total += len(b)
    print(f"wrote assets/monsterdoll/ ({len(outs)} files, {total / 1024:.1f} KB; {len(data['meta']['species'])} species)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
