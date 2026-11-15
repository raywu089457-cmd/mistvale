#!/usr/bin/env python3
"""weapons2x.py -- upright 2x weapons for the DV2 rig (docs/DV2-PHASE6.md §2.3, docs/DV2-RIG-PROMPTS.md §3).

PixelLab pixflux 48x48 (text prompt only, view side, transparent) -> output/phase6/weapons/raw/<name>.png
then pixellab_weapon.py <name> <png> --x2 --grip-from-bottom N --install bakes the 4 tilt columns (80x80 cells).

  python weapons2x.py gen [names...]       generate (skips existing); bows also generate draw / release variants
  python weapons2x.py bake [names...]      bake + install into assets/paperdoll-dv2/src/x2/weapon_<name>.png (never replaces an existing one)
  python weapons2x.py sheet                review sheet of every raw weapon + baked sheet
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "pixellab"))
import v2_client as V  # noqa: E402

WORK = ROOT / "output" / "phase6" / "weapons"
RAW = WORK / "raw"
SRC2X = ROOT / "assets" / "paperdoll-dv2" / "src" / "x2"
LEDGER = ROOT / "output" / "phase6" / "ledger.jsonl"
UP = ", standing perfectly upright and vertical, the handle pointing straight down, chibi RPG style, centered, nothing else"
PRE = "pixel art game weapon icon: "
W = {   # name -> (prompt, grip px above the haft's bottom end)
    "sword": ("a single straight bright silver steel longsword with a wide light blade, a simple brown leather grip and a plain dark crossguard", 6),
    "sword_fine": ("a single ornate steel longsword with a gold crossguard, a blue gem in the pommel and a gold-wrapped grip", 6),
    "dagger": ("a single short steel dagger with a dark leather grip", 4),
    "dagger_fine": ("a single curved ornate dagger with a gold guard and a purple gem in the pommel", 4),
    "staff": ("a single wooden staff with a round lavender crystal orb held in a wooden claw at the top", 12),
    "staff_fine": ("a single dark wooden staff with a large glowing violet crystal held in gold prongs at the top", 12),
    "holystaff": ("a single gold staff with an open gold ring halo at the top", 12),
    "holystaff_fine": ("a single white-and-gold staff with a gold ring halo and a small sun emblem at the top", 12),
    "bow": ("a single large light-brown wooden recurve bow with a thick limb standing upright with a white string on the right side, relaxed string, no arrow", 19),
    "bow_fine": ("a single ornate wooden recurve bow with gold tips and a leather grip standing upright with its string on the right side, relaxed string, no arrow", 19),
    "rapier": ("a single slim steel rapier with a swept silver hand guard and a dark red leather grip", 6),
    "rapier_fine": ("a single slim ornate rapier with a gold basket hand guard, a red gem in the pommel and a gold-wrapped grip", 6),
    "spear": ("a single wooden spear with a leaf-shaped steel spearhead and a dark red tassel below the blade", 14),
    "spear_fine": ("a single ornate spear with a gold-trimmed steel spearhead, a blue tassel and a gold-banded shaft", 14),
    "gun": ("a single old brass flintlock pistol with a dark wooden grip", 4),
    "gun_fine": ("a single ornate silver flintlock pistol with gold engraving and a polished dark wooden grip", 4),
}
BOW_STATES = {
    "draw": "the same bow fully drawn: the string pulled far to the right into a sharp V with an arrow nocked, everything else exactly unchanged",
    "release": "the same bow just after release: the string snapping back almost straight with a slight vibration, no arrow, everything else exactly unchanged",
}


def ledger(what, gens=1.0):
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.strftime("%H:%M:%S"), "cls": "weapons", "what": what, "gens": gens}) + "\n")


def gen(names):
    RAW.mkdir(parents=True, exist_ok=True)
    for n in names:
        dst = RAW / f"{n}.png"
        if dst.exists():
            print("skip", n)
            continue
        tmp = RAW / f"_{n}"
        r = V.make_image(PRE + W[n][0] + UP, 48, model="pixflux", view="side", direction="south", outline="single color black outline",
                         detail="medium detail", seed=7, negative="hand, person, scabbard, text", out_dir=tmp)
        (tmp / "image-0.png").replace(dst)
        shutil.rmtree(tmp, ignore_errors=True)
        ledger(n, (r.get("usage") or {}).get("generations", 1.0))
        print("gen", n)
        if n.startswith("bow"):
            for st, desc in BOW_STATES.items():
                out = RAW / f"{n}_{st}.png"
                if out.exists():
                    continue
                import base64
                import requests
                p = V.post("/edit-image", {"image": {"type": "base64", "base64": base64.b64encode(dst.read_bytes()).decode()},
                                           "image_size": {"width": 48, "height": 48}, "description": desc, "width": 48, "height": 48,
                                           "seed": 7, "no_background": True, "text_guidance_scale": 8})
                res = V.wait_job(p, "bow") if not isinstance(p.get("image"), dict) else p
                lr = res.get("last_response") or res
                img = lr.get("image") or (lr.get("images") or [None])[0]
                raw = base64.b64decode(img["base64"].split(",", 1)[-1]) if isinstance(img, dict) and img.get("base64") else requests.get(img["url"] if isinstance(img, dict) else img, timeout=60).content
                out.write_bytes(raw)
                ledger(f"{n}_{st}", (res.get("usage") or lr.get("usage") or {}).get("generations", 1.0))
                print("edit", out.name)


def crop_upright(src, dst):
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im)
    a = a.copy()
    a[a[..., 3] < 110] = 0
    a[a[..., 3] >= 110, 3] = 255
    Image.fromarray(a, "RGBA").save(dst)


def bake(names, force=False):
    for n in names:
        src = RAW / f"{n}.png"
        if not src.exists():
            print("no raw", n)
            continue
        clean = WORK / "clean" / f"{n}.png"
        clean.parent.mkdir(parents=True, exist_ok=True)
        crop_upright(src, clean)
        target = SRC2X / f"weapon_{n}.png"
        if target.exists() and not force:
            print("exists, skip", target.name)
            continue
        cmd = [sys.executable, str(ROOT / "pipeline" / "scripts" / "dv2fmt" / "pixellab_weapon.py"), n, str(clean), "--x2",
               "--grip-from-bottom", str(W[n][1]), "--install"]
        print(subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT).stdout.strip())


def sheet():
    names = [n for n in W if (RAW / f"{n}.png").exists()]
    S = 4
    sh = Image.new("RGBA", (len(names) * 48 * S // 2 + 10, 48 * S + 4), (58, 62, 74, 255))
    for i, n in enumerate(names):
        im = Image.open(RAW / f"{n}.png").convert("RGBA")
        sh.alpha_composite(im.resize((48 * S // 2, 48 * S // 2), Image.NEAREST), (i * 48 * S // 2, 0))
    sh.convert("RGB").save(WORK / "review_raw.png")
    print("wrote", WORK / "review_raw.png", names)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "bake", "sheet"])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    names = a.names or list(W)
    {"gen": lambda: gen(names), "bake": lambda: bake(names, a.force), "sheet": sheet}[a.cmd]()
