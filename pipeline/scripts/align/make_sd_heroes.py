"""make_sd_heroes.py — Q 版（約 2 頭身）英雄表 → hero@1x/2x/4x + heropose@1x/2x/4x。

待機表決定每個職業的倍率：待機高度縮到 34／68／136 px（1x／2x／4x，遊戲裡英雄畫 21 世界像素高）。
姿勢表（走路 A/B、蓄力、出手、受擊、休息）用「同職業待機圖的倍率 × 待機表寬 / 姿勢表寬」縮放，
所以換姿勢時人不會忽大忽小；每格記 foot（腳底中心 x），遊戲用它對齊。
manifest 的 scale：1x 0.14、2x 0.28、4x 0.56（pixel-world.js 依此分 LOD）。
用法：NO_SHADOW=1 HUE_TOL=16 python pipeline/scripts/align/make_sd_heroes.py idle.png walkA=… walkB=… strike=… windup=… hurt=… rest=…
"""
import json, os, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]; A = ROOT / "assets"
IDS = ["berserker", "ranger", "paladin", "sorcerer", "darkknight", "priest"]
LODS = {"1x": (34, .14), "2x": (68, .28), "4x": (136, .56)}


def cut(src, prefix):
    r = subprocess.run([sys.executable, str(ROOT / "pipeline/scripts/l0veyou/sheet_to_atlas.py"), src, prefix, "3x2", ",".join(IDS)],
                       capture_output=True, text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    print(((r.stdout or r.stderr).strip().splitlines() or ["?"])[0])
    if r.returncode: print(r.stdout, r.stderr); raise SystemExit(r.returncode)
    sheet = Image.open(A / f"{prefix}@2x.png").convert("RGBA"); man = json.loads((A / f"{prefix}@2x.manifest.json").read_text(encoding="utf-8"))
    out = {k: sheet.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])) for k, c in man["cells"].items()}
    for f in A.glob(f"{prefix}@*"): f.unlink()
    return out


def shrink(piece, s):
    w, h = max(1, round(piece.width * s)), max(1, round(piece.height * s))
    a = np.asarray(piece.resize((w, h), Image.LANCZOS)).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(a)


def foot_x(piece):
    a = np.asarray(piece)[..., 3] > 0; ys, xs = np.nonzero(a[int(a.shape[0] * .86):])
    return float(xs.mean()) if len(xs) else piece.width / 2


def pack(pieces, name, sc, extra):
    pad, x, y, shelf, W = 3, 2, 2, 0, 0; row_w = max(512, max(p.width for p in pieces.values()) + 4); places = {}
    for k, p in pieces.items():
        if x > 2 and x + p.width + pad > row_w: x, y, shelf = 2, y + shelf, 0
        places[k] = (x, y); x += p.width + pad; shelf = max(shelf, p.height + pad); W = max(W, x)
    sheet = Image.new("RGBA", (W + 2, y + shelf + 2), (0, 0, 0, 0)); cells = {}
    for k, p in pieces.items():
        px, py = places[k]; sheet.alpha_composite(p, (px, py))
        cells[k] = {"x": px, "y": py, "w": p.width, "h": p.height, "anchor": [px + p.width / 2, py + p.height], **extra.get(k, {})}
    sheet.save(A / f"{name}.png", optimize=True)
    (A / f"{name}.manifest.json").write_text(json.dumps({"version": 1, "kind": "mistvale-hero-atlas", "image": f"{name}.png", "sheetWidth": sheet.width,
        "sheetHeight": sheet.height, "packing": "shelf", "scale": sc, "generator": "l0veyou.com GPT Image 2（Q 版 2 頭身英雄）", "cells": cells}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(name, sheet.size, len(cells), "cells")


def main(idle_src, *specs):
    idle = cut(idle_src, "zzsdidle"); iw = Image.open(idle_src).width
    poses = [(p, cut(f, "zzsdpose"), Image.open(f).width) for p, f in (s.split("=", 1) for s in specs)]
    for tag, (h, sc) in LODS.items():
        hero, pose, extra = {}, {}, {}
        for k in IDS:
            s = h / idle[k].height; hero[k] = shrink(idle[k], s)
            for name, got, pw in poses:
                key = f"{k}_{name}"; p = shrink(got[k], s * iw / pw); pose[key] = p; extra[key] = {"foot": round(foot_x(p), 1)}
        pack(hero, f"hero@{tag}", sc, {}); pack(pose, f"heropose@{tag}", sc, extra)


if __name__ == "__main__":
    main(*sys.argv[1:])
