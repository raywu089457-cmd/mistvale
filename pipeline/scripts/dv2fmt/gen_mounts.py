#!/usr/bin/env python3
"""gen_mounts.py — riding (DV2 C1, docs/PAPERDOLL.md §20): per-species saddle points measured on assets/monsters3 -> assets/mounts.json.

    python pipeline/scripts/dv2fmt/gen_mounts.py            # write assets/mounts.json
    python pipeline/scripts/dv2fmt/gen_mounts.py --check    # re-measure in memory, fail if assets/mounts.json differs

DV2 rides monsters (friendMonster_) and lifts the rider onto the monster (Set_liftMoveInfo); the monster's own ride offset
(MonsterData.rideOffset_) is NOT recoverable from the reverse-engineering notes (dv2-lab docs/04-monster-animation.md §8.3),
so the saddle is measured on OUR monster art instead (conservative, documented deviation):

    for each species x direction (up / right / down / left = rows idleUp / idle / idleDown / idleLeft, frame 0):
      cx    = opaque centre of mass (x) = where the rider sits; for SIT seats in the side views (right / left) the centre of mass is
              pulled onto the neck/horns/antlers, so the rider sits halfway between the rump end and cx (right faces right: rump =
              left edge; left: rump = right edge)
      back  = the mount's silhouette top over the rider's columns (cx +- RIDER_HALF_W monsters3 px): the 25th percentile of the
              per-column first opaque row (a lone antler/horn pixel column does not lift it; a head in front of the rider in the
              front view does — that silhouette is what would hide the rider, so the rider sits above it)
    saddle = (cx, back) - mount foot (cell x = cell/2, cell y = cell - footFromBottom), in monsters3 art px: the BACK LINE at the rider.
    The rider's foot goes HIP[seat] RIDER art px below that line (scaled with the rider's own factor, not the mount's): the legs are
    hidden by the mount, hips/torso/arms/weapon stay above its back (2026-11-14 fix: the old rule sank the foot 40% of the mount's
    height, which left only the head visible in the side/front views).
      sit   (kneel cell, ~15 px body, neck at -14): HIP 5  -> knees below the back line, torso above
      stand (stand0)                             : HIP 1  -> feet just on the top (DV2 乗る_立つ)
    OVERRIDES below replace a measured value when the art needs it.

Seat type: quadrupeds sit (DV2 乗る_座る), everything else stands (乗る_立つ); SEAT overrides per species.
Not rideable: the boss sheet (treant). The game's rideable list is src/pixel-game.js ENEMIES minus 'boss'.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
MON = ROOT / "assets" / "monsters3"
OUT = ROOT / "assets" / "mounts.json"
DIRS = ["up", "right", "down", "left"]
ROWS = {"up": "idleUp", "right": "idle", "down": "idleDown", "left": "idleLeft"}
SEAT = {}                 # species -> 'sit' | 'stand' (overrides the archetype rule)
OVERRIDES = {}            # species -> {dir: [x, y]} (monsters3 art px relative to the mount foot)
NOT_RIDEABLE = {"treant"}  # boss art
HIP = {"sit": 5, "stand": 1}   # rider art px between the mount's back line and the rider's foot (docstring)
RIDER_HALF_W = 12          # monsters3 px each side of cx the rider's torso covers (~5 rider px at the 72/29 scale ratio)


def measure(cell: Image.Image, seat: str = "stand", d: str = "up"):
    a = np.asarray(cell)[..., 3] > 0
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None
    cx = float(xs.mean())
    if seat == "sit" and d in ("right", "left"):
        rump = float(xs.min() if d == "right" else xs.max())
        cx = (rump + cx) / 2
    tops = []
    for x in range(max(0, round(cx) - RIDER_HALF_W), min(a.shape[1], round(cx) + RIDER_HALF_W + 1)):
        col = np.nonzero(a[:, x])[0]
        if len(col):
            tops.append(int(col.min()))
    back = float(np.percentile(tops, 25))
    return [int(round(cx)), int(round(back))]


def build():
    out = {}
    for jf in sorted(MON.glob("*.json")):
        sp = jf.stem
        meta = json.loads(jf.read_text(encoding="utf-8"))
        img = Image.open(MON / f"{sp}.png").convert("RGBA")
        seat = SEAT.get(sp) or ("sit" if meta.get("archetype") == "quad" else "stand")
        acts = meta["actions"]
        cellsz = acts["idle"]["cell"]
        foot = (cellsz // 2, cellsz - meta["footFromBottom"])
        saddle = []
        for d in DIRS:
            row = acts.get(ROWS[d]) or acts["idle"]
            m = measure(img.crop((0, row["y"], row["cell"], row["y"] + row["cell"])), seat, d if ROWS[d] in acts else "right")
            if m is None:
                m = [foot[0], foot[1] - meta.get("artSize", 72) // 2]
            p = [m[0] - foot[0], m[1] - foot[1]]
            if d == "left" and ROWS[d] not in acts:
                p[0] = -p[0]   # no baked left row: the renderer mirrors the side row, so mirror the measured point too
            p = OVERRIDES.get(sp, {}).get(d, p)
            saddle.append(p)
        out[sp] = {"seat": seat, "saddle": saddle, **({"rideable": False} if sp in NOT_RIDEABLE or seat == "stand" else {})}  # stand seats: rider on the head, looks wrong (2026-11-14) -> not rideable; must match src/pixel-game.js RIDEABLE
    return {
        "format": "mistvale-mounts", "version": 1,
        "generator": "pipeline/scripts/dv2fmt/gen_mounts.py",
        "note": "Riding (docs/PAPERDOLL.md §20). saddle[up,right,down,left] = the mount's back line at the rider, in assets/monsters3 art px "
                "relative to the mount's foot (x right, y down; scaled like the mount). The rider's foot goes hip[seat] RIDER art px below it "
                "(scaled like the rider). seat: sit = DV2 乗る_座る (ride_sit/ride_charge_sit), stand = 乗る_立つ. Measured on our art; "
                "DV2's rideOffset_ is not recoverable.",
        "dirs": DIRS,
        "hip": HIP,
        "mounts": out,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    if a.check:
        ok = OUT.exists() and OUT.read_text(encoding="utf-8") == text
        print("OK assets/mounts.json up to date" if ok else "FAIL assets/mounts.json differs (run gen_mounts.py)")
        return 0 if ok else 1
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(data['mounts'])} species)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
