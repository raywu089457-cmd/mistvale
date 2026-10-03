"""make_heroes.py — l0veyou 生的 3×2 獵人表 → hero@1x/@2x.png + manifest（沿用原本格式）。

先用 sheet_to_atlas 去背切格（暫存前綴 zzhero），再把每格 LANCZOS 以高度為主縮進 78×68（2x）／39×34（1x），
排成 3×2、格 84×72／42×36（拿大武器的角色才不會被壓小），manifest scale 0.28／0.14（pixel-world.js 以 scale≥0.2 判斷 2x）。
用法：NO_SHADOW=1 HUE_TOL=16 python pipeline/scripts/align/make_heroes.py output/l0veyou/heroes-sheet-v1.png
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]; A = ROOT / "assets"
IDS = ["berserker", "ranger", "paladin", "sorcerer", "darkknight", "priest"]


def main(src):
    r = subprocess.run([sys.executable, str(ROOT / "pipeline/scripts/l0veyou/sheet_to_atlas.py"), src, "zzhero", "3x2", ",".join(IDS)], capture_output=True, text=True, encoding="utf-8")
    print(r.stdout.strip().splitlines()[0] if r.stdout else r.stderr)
    if r.returncode: return r.returncode
    sheet = Image.open(A / "zzhero@2x.png").convert("RGBA"); man = json.loads((A / "zzhero@2x.manifest.json").read_text(encoding="utf-8"))
    for tag, (cw, ch, fw, fh, sc) in {"2x": (84, 72, 78, 68, .28), "1x": (42, 36, 39, 34, .14)}.items():
        out = Image.new("RGBA", (cw * 3 + 4, ch * 2 + 4), (0, 0, 0, 0)); cells = {}
        for i, k in enumerate(IDS):
            c = man["cells"][k]; piece = sheet.crop((c["x"], c["y"], c["x"] + c["w"], c["y"] + c["h"]))
            s = min(fw / piece.width, fh / piece.height); w, h = max(1, round(piece.width * s)), max(1, round(piece.height * s))
            a = np.asarray(piece.resize((w, h), Image.LANCZOS)).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
            x, y = 2 + (i % 3) * cw + (cw - w) // 2, 2 + (i // 3) * ch + (ch - h)
            out.alpha_composite(Image.fromarray(a), (x, y))
            cells[k] = {"x": x, "y": y, "w": w, "h": h, "anchor": [x + w / 2, y + h]}
        out.save(A / f"hero@{tag}.png", optimize=True)
        (A / f"hero@{tag}.manifest.json").write_text(json.dumps({"version": 1, "kind": "mistvale-hero-atlas", "image": f"hero@{tag}.png",
            "sheetWidth": out.width, "sheetHeight": out.height, "cellWidth": cw, "cellHeight": ch, "cols": 3, "rows": 2, "scale": sc,
            "source": Path(src).name, "generator": "l0veyou.com GPT Image 2（概念圖角色當參考）", "cells": cells}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"hero@{tag}.png {out.size}", {k: (v['w'], v['h']) for k, v in cells.items()})
    for f in A.glob("zzhero@*"): f.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
