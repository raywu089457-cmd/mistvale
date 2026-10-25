"""assassin_south41.py — 刺客南向攻擊改用 PixelLab 原始 41 格，播放加速到跟其他方向（9 格）一樣長（試看用，可一鍵換回）。

    python pipeline/scripts/pixellab/assassin_south41.py            # 換成 41 格
    python pipeline/scripts/pixellab/assassin_south41.py --revert   # 換回 9 格（add_attack_rows_gif.py 做的那列）

2026-10-24 使用者：「41 格都進去南向，然後加速播放速度達到原本刺客攻擊時長讓我看」。
- 來源 output/pixellab-incoming/assassin-attack-8dir/gif/south.gif（41 格：拔刀 0–5、高舉 6–10、X 字斬 11–13、交叉收刀刀光漸消 14–19、停住 20–33、回站姿 34–40）。
- 接法跟 add_attack_rows_gif.py 一樣（第 0 格對齊、攻擊列 footFromBottom @2x 30／1x 15），41 格太寬 → 每行 9 格換行（列的 cols＝9，引擎 sheetFrame 支援），接在表的最下面。
- 節奏（ownTiming：這一列用自己的節奏）：大 X 字在第 12 格 → release 12、impact 13；
  蓄力 12 格 × 0.03125 秒＝0.375 秒（＝其他方向 5 格 × 0.075），出手後 29 格 × 0.01034 秒＝0.3 秒（＝其他方向 4 格 × 0.075）。
  noSkip:false：格數多到畫面更新跟不上（出手段每秒 97 格，遊戲 30fps），維持總長、畫面能畫幾格就畫幾格；逐格不跳會把它拖成 1.4 秒、比攻擊間隔還長。
- 原本 9 格那列的設定存在 attackDown9（圖還在原位），--revert 換回來。
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[3]
HEROES = ROOT / "assets/heroes"
GIF = ROOT / "output/pixellab-incoming/assassin-attack-8dir/gif/south.gif"
LOD = [{"suffix": "", "step": 2}, {"suffix": "@2x", "step": 1}]
COLS, FOOT2X, REL = 9, 30, 12
WINDUP, STRIKE = 0.375, 0.3


def axis_x(a):
    m = a[..., 3] > 127
    cols = np.flatnonzero(m.any(0))
    return float(np.median(np.repeat(cols, m[:, cols].sum(0))))


def bottom(a):
    return int(np.flatnonzero((a[..., 3] > 127).any(1)).max())


def heads(cells, cell, foot, hero_height):
    ground = cell - foot - 1
    out = []
    for a in cells:
        m = a[..., 3] > 0
        lo, hi = int(cell / 2 - .12 * cell), int(cell / 2 + .12 * cell)
        ys = np.flatnonzero(m[:, lo:hi].any(1))
        if not len(ys):
            out.append(None)
            continue
        top = int(ys.min())
        xs = np.flatnonzero(m[top:top + 4, lo:hi].any(0)) + lo
        out.append([round(float(xs.mean()), 1), top] if ground - top >= hero_height * .8 else None)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()
    frames2x = [np.asarray(f.convert("RGBA")) for f in ImageSequence.Iterator(Image.open(GIF))]
    n = len(frames2x)
    for lod in LOD:
        meta_p, png_p = HEROES / f"assassin{lod['suffix']}.json", HEROES / f"assassin{lod['suffix']}.png"
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        acts = meta["actions"]
        if args.revert:
            if "attackDown9" not in acts:
                print(f"{png_p.name}: 沒有 attackDown9，已經是 9 格")
                continue
            acts["attackDown41"] = acts["attackDown"]
            acts["attackDown"] = acts.pop("attackDown9")
            meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{png_p.name}: 換回 9 格（41 格存在 attackDown41）")
            continue
        if acts["attackDown"].get("frames") == n:
            print(f"{png_p.name}: 已經是 {n} 格")
            continue
        bk = ROOT / "output/pixellab-anim-test/_backup_before_south41"
        bk.mkdir(exist_ok=True)
        for p in (meta_p, png_p):
            if not (bk / p.name).exists():
                shutil.copy2(p, bk / p.name)
        sheet = Image.open(png_p).convert("RGBA")
        cell, step = acts["idle"]["cell"], lod["step"]
        foot = FOOT2X if step == 1 else FOOT2X // 2
        if "attackDown41" in acts and acts["attackDown41"]["cell"] == cell:   # 之前做過、只是換回 9 格 → 直接換回 41 格
            acts["attackDown9"] = acts["attackDown"]
            acts["attackDown"] = acts.pop("attackDown41")
            meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"{png_p.name}: 換成 41 格（沿用之前接好的圖）")
            continue
        frs = [a[::step, ::step] for a in frames2x]
        dx = round(cell / 2 - axis_x(frs[0]))
        dy = (cell - foot - 1) - bottom(frs[0])
        cells = []
        for f in frs:
            c = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            c.alpha_composite(Image.fromarray(f), (dx, dy))
            cells.append(np.asarray(c))
        lost = [k for k, f in enumerate(frs) if (f[..., 3] > 0).sum() != (cells[k][..., 3] > 0).sum()]
        lines = -(-n // COLS)
        y0 = sheet.height
        out = Image.new("RGBA", (max(sheet.width, cell * COLS), sheet.height + cell * lines), (0, 0, 0, 0))
        out.alpha_composite(sheet, (0, 0))
        for k, a in enumerate(cells):
            out.alpha_composite(Image.fromarray(a), ((k % COLS) * cell, y0 + (k // COLS) * cell))
        acts["attackDown9"] = acts["attackDown"]
        acts["attackDown"] = {"y": y0, "cell": cell, "frames": n, "cols": COLS, "footFromBottom": foot,
                              "head": heads(cells, cell, foot, meta["heroHeight"]),
                              "frameTime": round(STRIKE / (n - REL), 6), "release": REL, "impact": REL + 1,
                              "windupFrameTime": round(WINDUP / REL, 6), "ownTiming": True, "noSkip": False}
        out.save(png_p)
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{png_p.name}: 南向 {n} 格（每行 {COLS} 格、{lines} 行）y={y0}  位移 ({dx:+d},{dy:+d})  被格子切掉像素的格 {lost}  → {out.size}")


if __name__ == "__main__":
    main()
