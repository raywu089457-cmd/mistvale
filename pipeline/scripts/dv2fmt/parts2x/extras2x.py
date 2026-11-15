#!/usr/bin/env python3
"""extras2x.py -- phase-6 hats (2x) and the two 1x effects (docs/DV2-PHASE6.md §2.4, §2.5). Text-prompt PixelLab only.

  python extras2x.py hats gen            pixflux 32 px hat_<name> x (south, east, north) -> output/phase6/hats/raw
  python extras2x.py hats finish         local downscale -> output/phase6/hats/x2/hat_<name>_<view>.png (25x25 canvas, content ~22 wide)
  python extras2x.py hats install        copy to assets/paperdoll-dv2/src/x2/ (never overwrites)
  python extras2x.py fx gen              pixflux 32 px punch star + gun flash -> output/phase6/fx/raw
  python extras2x.py fx build            build effect_punch.png / effect_gunfire.png (120x60, 4 dir columns x 2 sebF rows of 30x30) and install
"""
import argparse
import json
import shutil
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import phase6 as P  # noqa: E402

ROOT = P.ROOT
V = P.V
OUT = ROOT / "output" / "phase6"
SRC = ROOT / "assets" / "paperdoll-dv2" / "src"

HATS = {
    "leather_cap": "a simple brown leather cap with two short ear flaps and a stitched seam",
    "iron_helm": "a plain round steel helmet with a small nose guard and a brass rivet band",
    "feather_hat": "a green felt hat with a wide brim and one long red feather",
    "straw_hat": "a round straw hat with a wide brim and a red ribbon band",
    "bandana": "a red cloth bandana tied tightly around the forehead, a small knot and two short tails",
    "crown": "a small golden crown with three points and red gems",
}
HAT_PRE = "pixel art chibi RPG hat only: "
HAT_POST = ", worn on top of a big round chibi head but with no head inside, no face, no hair, no body, seen from the {v}, 1-pixel dark outline, flat colours with 2-3 tones per material, light from top-left, no anti-aliasing, transparent background"
VIEWTXT = {"south": "front", "east": "side", "north": "back"}


CUT = {"leather_cap": 0.56, "iron_helm": 0.56, "feather_hat": 0.52, "straw_hat": 0.50, "bandana": 0.50, "crown": 0.42}   # keep the top fraction: PixelLab draws a head under the hat


def cut_hat(im, f):
    """keep the top fraction f of the content (the hat), then close the new bottom edge with a 1-px outline"""
    a = np.asarray(im.convert("RGBA")).copy()
    x0, y0, x1, y1 = P.bbox(im)
    cut = y0 + int(round((y1 - y0) * f))
    a[cut:] = 0
    op = a[..., 3] > 0
    pal = a[op][:, :3].astype(int)
    dark = pal[pal.sum(1).argmin()] if len(pal) else np.array([20, 12, 16])
    for x in range(a.shape[1]):
        ys = np.nonzero(op[:, x])[0]
        if len(ys) and ys.max() == cut - 1 and cut < a.shape[0]:
            a[cut, x] = (*dark, 255)
    return Image.fromarray(a, "RGBA")


def hats(cmd):
    raw = OUT / "hats" / "raw"
    x2 = OUT / "hats" / "x2"
    if cmd == "gen":
        from concurrent.futures import ThreadPoolExecutor

        def one(it):
            n, d = it
            dst = raw / n / f"{d}.png"
            if dst.exists():
                return f"skip {n}/{d}"
            tmp = raw / n / f"_{d}"
            r = V.make_image(HAT_PRE + HATS[n] + HAT_POST.format(v=VIEWTXT[d]), 32, model="pixflux", view="low top-down", direction=d,
                             outline="single color black outline", detail="medium detail", seed=7,
                             negative="head, face, hair, skin, body, neck, shoulders", out_dir=tmp)
            (tmp / "image-0.png").replace(dst)
            shutil.rmtree(tmp, ignore_errors=True)
            P.ledger("hats", f"{n}/{d}", (r.get("usage") or {}).get("generations", 1.0))
            return f"gen {n}/{d}"
        jobs = [(n, d) for n in HATS for d in ("south", "east", "north")]
        with ThreadPoolExecutor(6) as ex:
            for r in ex.map(one, jobs):
                print(r, flush=True)
    elif cmd == "finish":
        for n in HATS:
            ims = {d: cut_hat(Image.open(raw / n / f"{d}.png").convert("RGBA"), CUT[n]) for d in ("south", "east", "north") if (raw / n / f"{d}.png").exists()}
            if not ims:
                continue
            ws = [P.bbox(im)[2] - P.bbox(im)[0] for im in ims.values()]
            sc = min(1.0, 22.0 / float(np.mean(ws)))
            for d, im in ims.items():
                sp = P.downscale(im, sc)
                cv, clip = P.to_canvas(sp, 25, 3)
                dst = x2 / f"hat_{n}_{P.VIEW[d]}.png"
                dst.parent.mkdir(parents=True, exist_ok=True)
                cv.save(dst)
                print("hat", n, d, "scale %.2f" % sc, P.bbox(cv), "CLIPPED" if clip else "")
    elif cmd == "install":
        made = 0
        for p in sorted(x2.glob("*.png")):
            t = P.SRC2X / p.name
            if t.exists():
                print("exists", t.name)
                continue
            shutil.copy2(p, t)
            made += 1
        print("installed", made)


FXPRE = "pixel art game visual effect on a transparent background: "
FX = {
    "punch": FXPRE + "a bright yellow-white impact star burst with eight sharp spikes and a white core, no character, no hand, centered, 1-pixel outline, flat colours",
    "gun": FXPRE + "a muzzle flash pointing to the right: a bright yellow-white fiery cone with a few orange sparks and a small grey smoke puff behind it, no gun, no hand, centered, flat colours",
}


def fx(cmd):
    raw = OUT / "fx" / "raw"
    if cmd == "gen":
        for n, pr in FX.items():
            dst = raw / f"{n}.png"
            if dst.exists():
                continue
            tmp = raw / f"_{n}"
            r = V.make_image(pr, 32, model="pixflux", view="side", direction="east", outline="lineless", detail="medium detail", seed=7,
                             negative="character, hand, gun, weapon, text", out_dir=tmp)
            (tmp / "image-0.png").replace(dst)
            shutil.rmtree(tmp, ignore_errors=True)
            P.ledger("fx", n, (r.get("usage") or {}).get("generations", 1.0))
            print("gen", n)
    elif cmd == "build":
        def cell(im, size=28):
            b = P.bbox(im)
            c = im.crop(b)
            s = min(size / c.width, size / c.height, 1.0)
            if s < 1:
                c = P.downscale(c, s)
            out = Image.new("RGBA", (30, 30))
            out.alpha_composite(c, ((30 - c.width) // 2, (30 - c.height) // 2))
            return out

        def dim(im, k):
            a = np.asarray(im).astype(float)
            a[..., :3] = a[..., :3] * k + (1 - k) * np.array([200, 160, 60])
            return Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")

        def shrink(im, f):
            c = im.crop(P.bbox(im))
            c = P.downscale(c, f)
            out = Image.new("RGBA", (30, 30))
            out.alpha_composite(c, ((30 - c.width) // 2, (30 - c.height) // 2))
            return out
        punch = cell(Image.open(raw / "punch.png").convert("RGBA"))
        gun = Image.open(raw / "gun.png").convert("RGBA")
        ga = np.asarray(gun).copy()
        mx, mn = ga[..., :3].max(2).astype(int), ga[..., :3].min(2).astype(int)
        ga[((mx - mn) < 60) & (mx < 190)] = 0           # PixelLab drew the pistol anyway: keep only the fire (bright / saturated pixels)
        ga[:, 18:] = 0
        gun = Image.fromarray(ga, "RGBA")
        # the generated flash points LEFT; make the right-pointing base
        gun = gun.transpose(Image.FLIP_LEFT_RIGHT) if P.bbox(gun)[0] < 16 else gun
        gunc = cell(gun)
        sheets = {}
        # punch: the star is symmetric; the 4 direction columns get the same burst, the fade row is a smaller, dimmer one
        row0 = [punch] * 4
        row1 = [dim(shrink(punch, 0.7), 0.7)] * 4
        sheets["punch"] = (row0, row1)
        # gunfire: up, right, down, left = rotate the right-pointing flash
        def rot(im, k):    # k: quarter turns anticlockwise
            return im.rotate(90 * k, resample=Image.NEAREST, expand=False)
        r0 = [rot(gunc, 1), gunc, rot(gunc, 3), gunc.transpose(Image.FLIP_LEFT_RIGHT)]
        g1 = dim(shrink(gunc, 0.7), 0.7)
        r1 = [rot(g1, 1), g1, rot(g1, 3), g1.transpose(Image.FLIP_LEFT_RIGHT)]
        sheets["gunfire"] = (r0, r1)
        for n, (a, b) in sheets.items():
            sh = Image.new("RGBA", (120, 60))
            for i in range(4):
                sh.alpha_composite(a[i], (i * 30, 0))
                sh.alpha_composite(b[i], (i * 30, 30))
            dst = OUT / "fx" / f"effect_{n}.png"
            dst.parent.mkdir(parents=True, exist_ok=True)
            sh.save(dst)
            t = SRC / f"effect_{n}.png"
            if t.exists():
                print("exists, not overwriting", t)
            else:
                shutil.copy2(dst, t)
                print("installed", t)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["hats", "fx"])
    ap.add_argument("cmd")
    a = ap.parse_args()
    {"hats": hats, "fx": fx}[a.what](a.cmd)
