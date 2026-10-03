"""make_combat_art.py — l0veyou 生的戰鬥姿勢表／村民表／魔物攻擊表 → 遊戲圖集。

三種模式（都先用 sheet_to_atlas.py 去背切格到暫存前綴，再重新縮放、排版）：

  heropose <strike> <windup> <hurt>
      3×2 英雄姿勢表（同 heroes-sheet-v1 的排法）→ heropose@1x/@2x，cell = <職業>_<姿勢>。
      倍率跟 hero@2x 一樣（以待機圖的高度換算，再乘「參考表寬 / 姿勢表寬」），人才不會因為姿勢忽大忽小；
      每格記 foot（腳底中心 x），pixel-world.js 用它對齊畫布中線。
  villagers <sheet>
      4×2 村民表 → villagers@1x/@2x。整張同一個倍率：成人中位高 = 65px@2x（英雄 68px＝21 世界單位，
      村民畫 20 單位高），跟英雄同一個像素密度——不再是 300px 原圖在瀏覽器裡最近鄰縮小。
  monsteratk <sheet>
      1×4 魔物攻擊表 → monsteratk@1x/@2x，cell = slime2/wolf2/golem2/boss2。
      倍率 = sqrt(待機格面積 / 攻擊格面積)，畫面上跟第 0 格一樣大。

用法：NO_SHADOW=1 HUE_TOL=16 python pipeline/scripts/align/make_combat_art.py heropose a.png b.png c.png
"""
import json, os, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]; A = ROOT / "assets"; L0 = ROOT / "output/l0veyou"
HEROES = ["berserker", "ranger", "paladin", "sorcerer", "darkknight", "priest"]
VILLAGERS = ["merchant", "farmer", "child", "elder", "smith", "maid", "cat", "dog"]
MONSTERS = ["slime", "wolf", "golem", "boss"]


def cut(src, prefix, grid, ids):
    """去背切格，回傳 {id: RGBA Image}（原尺寸）。"""
    r = subprocess.run([sys.executable, str(ROOT / "pipeline/scripts/l0veyou/sheet_to_atlas.py"), src, prefix, grid, ",".join(ids)],
                       capture_output=True, text=True, encoding="utf-8", env={**os.environ, "PYTHONIOENCODING": "utf-8"})
    print(((r.stdout or r.stderr).strip().splitlines() or ["(no output)"])[0])
    if r.returncode:
        print(r.stdout, r.stderr); raise SystemExit(r.returncode)
    sheet = Image.open(A / f"{prefix}@2x.png").convert("RGBA"); man = json.loads((A / f"{prefix}@2x.manifest.json").read_text(encoding="utf-8"))
    out = {k: sheet.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"])) for k, c in man["cells"].items()}
    for f in A.glob(f"{prefix}@*"): f.unlink()
    return out


def shrink(piece, s):
    w, h = max(1, round(piece.width * s)), max(1, round(piece.height * s))
    a = np.asarray(piece.resize((w, h), Image.LANCZOS)).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(a)


def foot_x(piece):
    a = np.asarray(piece)[..., 3] > 0; h = a.shape[0]; rows = a[int(h * .86):]
    ys, xs = np.nonzero(rows)
    return float(xs.mean()) if len(xs) else piece.width / 2


def pack(pieces, name, kind, scale_field, extra=None):
    pad, x, y, shelf, W = 3, 2, 2, 0, 0
    row_w = max(512, max(p.width for p in pieces.values()) + 4)
    places = {}
    for k, p in pieces.items():
        if x > 2 and x + p.width + pad > row_w: x, y, shelf = 2, y + shelf, 0
        places[k] = (x, y); x += p.width + pad; shelf = max(shelf, p.height + pad); W = max(W, x)
    sheet = Image.new("RGBA", (W + 2, y + shelf + 2), (0, 0, 0, 0)); cells = {}
    for k, p in pieces.items():
        px, py = places[k]; sheet.alpha_composite(p, (px, py))
        cells[k] = {"x": px, "y": py, "w": p.width, "h": p.height, "anchor": [px + p.width / 2, py + p.height], **((extra or {}).get(k, {}))}
    sheet.save(A / f"{name}.png", optimize=True)
    man = {"version": 1, "kind": kind, "image": f"{name}.png", "sheetWidth": sheet.width, "sheetHeight": sheet.height, "packing": "shelf",
           "generator": "l0veyou.com GPT Image 2（英雄／魔物表當參考圖）", "cells": cells}
    if scale_field is not None: man["scale"] = scale_field
    (A / f"{name}.manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{name}.png {sheet.size}", {k: (v['w'], v['h']) for k, v in cells.items()})


def heropose(strike, windup, hurt):
    idle_src = L0 / "heroes-sheet-v1.png"; idle = cut(str(idle_src), "zzidle", "3x2", HEROES)
    hman = json.loads((A / "hero@2x.manifest.json").read_text(encoding="utf-8"))["cells"]
    idle_w = Image.open(idle_src).width
    pieces2, pieces1, extra2, extra1 = {}, {}, {}, {}
    for pose, src in (("strike", strike), ("windup", windup), ("hurt", hurt)):
        got = cut(src, "zzpose", "3x2", HEROES); f = idle_w / Image.open(src).width
        for k in HEROES:
            s2 = hman[k]["h"] / idle[k].height * f   # 跟 hero@2x 同倍率
            p2 = shrink(got[k], s2); p1 = shrink(got[k], s2 / 2); key = f"{k}_{pose}"
            pieces2[key], pieces1[key] = p2, p1
            extra2[key] = {"foot": round(foot_x(p2), 1)}; extra1[key] = {"foot": round(foot_x(p1), 1)}
            print(f"  {key}: raw {got[k].size} idle {idle[k].size} → {p2.size}")
    pack(pieces2, "heropose@2x", "mistvale-hero-atlas", 0.28, extra2)
    pack(pieces1, "heropose@1x", "mistvale-hero-atlas", 0.14, extra1)


def villagers(src):
    got = cut(src, "zzvill", "4x2", VILLAGERS)
    adults = sorted(got[k].height for k in ["merchant", "farmer", "elder", "smith", "maid"]); s2 = 65 / adults[len(adults) // 2]
    pack({k: shrink(v, s2) for k, v in got.items()}, "villagers@2x", "mistvale-villagers-atlas", None)
    pack({k: shrink(v, s2 / 2) for k, v in got.items()}, "villagers@1x", "mistvale-villagers-atlas", 0.5)


def monsteratk(src):
    got = cut(src, "zzmatk", "4x1", [m + "2" for m in MONSTERS])
    ms = Image.open(A / "monsters@2x.png").convert("RGBA"); mm = json.loads((A / "monsters@2x.manifest.json").read_text(encoding="utf-8"))["cells"]
    area = lambda im: float((np.asarray(im)[..., 3] > 0).sum())
    p2 = {}
    for m in MONSTERS:
        c = mm[m + "0"]; ref = ms.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
        s = float(np.clip((area(ref) / area(got[m + "2"])) ** .5, .5, 2.0)); p2[m + "2"] = shrink(got[m + "2"], s)
        print(f"  {m}2: raw {got[m + '2'].size} ×{s:.2f} → {p2[m + '2'].size} (idle {ref.size})")
    pack(p2, "monsteratk@2x", "mistvale-monsteratk-atlas", None)
    pack({k: shrink(v, .5) for k, v in p2.items()}, "monsteratk@1x", "mistvale-monsteratk-atlas", 0.5)


if __name__ == "__main__":
    mode, *args = sys.argv[1:]
    {"heropose": heropose, "villagers": villagers, "monsteratk": monsteratk}[mode](*args)
