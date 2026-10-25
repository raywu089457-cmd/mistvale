"""add_dir_rows.py — 幫 PixelLab 職業補「畫好的方向」待機／走路列，遊戲就不用退回別的方向或即時鏡像。

    python pipeline/scripts/pixellab/add_dir_rows.py --hero archer --source output/pixellab-incoming/788cd873 \
        [--rows idleLeft,walkLeft,idleDownRight,idleUpRight] [--dry-run]

可以補的列（--rows，預設全部；已經有的列不動）：
    idleLeft        ← rotations/west.png             西向待機（不然＝東向待機鏡像，拿弓的手跟 attackLeft／walkLeft 相反）
    walkLeft        ← animations/*/west/*.png        西向走路（1x 表原本沒有，只有 @2x 有）
    idleDownRight   ← rotations/south-east.png       右下待機（不然斜走停下會退回 idleDown＝轉成正面；左下＝它的鏡像，跟 walkDownRight 一樣）
    idleUpRight     ← rotations/north-east.png       右上待機（不然退回 idleUp＝轉成背面；左上＝鏡像）
    idleDownLeft／idleUpLeft     ← rotations/south-west.png／north-west.png   左下／左上待機（畫好的，不用右斜鏡像）
    walkDownLeft／walkUpLeft     ← animations/*/south-west|north-west/*.png  左下／左上走路（跟左斜待機一起補，不然走路鏡像、停下畫好的，弓會換手）
    （引擎 pixel-world.js leftRow：面向左的 idle／walk 斜向列，有 <動作>DownLeft／UpLeft 就直接用、不鏡像）
旋轉圖也接受 PixelLab 網站下載的 rotation-<方向>.png 命名。

接法跟 build_class_sheet.py 的 align_rows 完全一樣（@2x＝來源 1:1、1x＝來源每 2 px 取 1；整列一個位移：
中軸中位數 → 格中線、腳底中位數 → cell−footFromBottom−1）。防呆：先用同一套接法重做表上現有的 idle（rotations/east），
要逐像素相同才動手（不同＝來源資料夾不是這張表的角色，或表被別的方式改過），--force 才略過。
缺的列接在表的最下面，列設定（frameTime 等）照抄對應的 idle／walk 列。

紀錄：2026-10-23 遊俠補 idleLeft＋1x walkLeft；2026-10-24 遊俠併入弓箭手後，弓箭手補 idleDownRight／idleUpRight（斜走停下不再轉正面／背面），
再補左斜四列（使用者給的左下參考圖＝PixelLab south-west 原圖，要畫好的、不要鏡像）。
2026-10-25 使用者：「修正每個職業，斜向攻擊後會自己轉向」→ 另外四個職業一樣補齊（攻擊列已有 8 方向，待機只有正／背／側，斜向攻擊完退回正面／背面）：
    --hero assassin  --source output/pixellab-incoming/3d3020ce --glob walkDownLeft=animations/Walking/south-west-ac3bf8ab/*.png
                     （南西走路有兩次生成，用斗篷擺動跟東南走路一樣的 ac3bf8ab）
    --hero sorcerer  --source output/pixellab-incoming/5955ea9f
    --hero paladin   --source output/pixellab-incoming/d06dcc3a
    --hero berserker --source output/pixellab/berserker-wide --glob walkLeft=walk/west/*.png
                     --glob walkDownLeft=walk/south-west/*.png --glob walkUpLeft=walk/north-west/*.png
    來源對法：防呆（重做 idle 逐像素相同），右斜走路也重做比對過（除了聖騎士 @2x walkUpRight 之外全部逐像素相同）。
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HEROES = ROOT / "assets/heroes"
LOD = [{"suffix": "", "step": 2}, {"suffix": "@2x", "step": 1}]
ROWS = {
    "idleLeft": ("idle", "west"),
    "walkLeft": ("walk", "animations/*/west/*.png"),
    "idleDownRight": ("idle", "south-east"),
    "idleUpRight": ("idle", "north-east"),
    "idleDownLeft": ("idle", "south-west"),
    "idleUpLeft": ("idle", "north-west"),
    "walkDownLeft": ("walkDownRight", "animations/*/south-west/*.png"),
    "walkUpLeft": ("walkUpRight", "animations/*/north-west/*.png"),
}


def axis_x(a: np.ndarray) -> float:
    m = a[..., 3] > 127
    cols = np.flatnonzero(m.any(0))
    return float(np.median(np.repeat(cols, m[:, cols].sum(0))))


def bottom(a: np.ndarray) -> int:
    return int(np.flatnonzero((a[..., 3] > 127).any(1)).max())


def sources(source: Path, spec: str) -> list[Path]:
    if "/" in spec:   # 走路動畫的 glob
        return sorted(source.glob(spec))
    for p in (source / "rotations" / f"{spec}.png", source / f"rotation-{spec}.png"):
        if p.exists():
            return [p]
    return []


def build_row(files: list[Path], cell: int, step: int, foot_from_bottom: int, quiet: bool = False) -> list[np.ndarray]:
    frames = [np.asarray(Image.open(p).convert("RGBA"))[::step, ::step] for p in files]
    dx = round(cell / 2 - float(np.median([axis_x(f) for f in frames])))
    dy = round(cell - foot_from_bottom - 1 - float(np.median([bottom(f) for f in frames])))
    out = []
    for f in frames:
        c = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        c.alpha_composite(Image.fromarray(f), (dx, dy))
        out.append(np.asarray(c))
    if not quiet:
        edge = [i for i, a in enumerate(out) if (lambda m: m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any())(a[..., 3] > 0)]
        print(f"    {len(files)} 格  位移 ({dx:+d},{dy:+d})  碰邊 {edge}")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hero", default="archer")
    ap.add_argument("--source", required=True, help="PixelLab 匯出資料夾（rotations/、animations/，或 rotation-<方向>.png）")
    ap.add_argument("--rows", default=",".join(ROWS), help=f"要補的列，逗號分隔（可選 {', '.join(ROWS)}）")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="略過「重做現有 idle 要逐像素相同」的防呆")
    ap.add_argument("--glob", action="append", default=[], help="列=來源 glob，換掉預設來源（可重複），例 walkDownLeft=walk/south-west/*.png")
    args = ap.parse_args()
    want = [r for r in args.rows.split(",") if r]
    bad = [r for r in want if r not in ROWS]
    if bad:
        raise SystemExit(f"不認得的列：{bad}")
    for g in args.glob:
        act, pat = g.split("=", 1)
        if act not in ROWS:
            raise SystemExit(f"--glob 不認得的列：{act}")
        ROWS[act] = (ROWS[act][0], pat)
    source = ROOT / args.source if not Path(args.source).is_absolute() else Path(args.source)
    for lod in LOD:
        meta_p, png_p = HEROES / f"{args.hero}{lod['suffix']}.json", HEROES / f"{args.hero}{lod['suffix']}.png"
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        sheet = Image.open(png_p).convert("RGBA")
        cell, foot = meta["actions"]["idle"]["cell"], meta["footFromBottom"]
        print(f"{png_p.name}: cell {cell}, footFromBottom {foot}")
        east = sources(source, "east")
        if east and not args.force:
            idle = meta["actions"]["idle"]
            rebuilt = build_row(east, cell, lod["step"], foot, quiet=True)[0]
            on_sheet = np.asarray(sheet)[idle["y"]:idle["y"] + cell, 0:cell]
            diff = int((rebuilt != on_sheet).any(-1).sum())
            if diff:
                raise SystemExit(f"  防呆：用 {source} 重做 idle 跟表上差 {diff} px → 來源不是這個角色？（--force 略過）")
            print("  防呆通過：重做 idle 跟表上逐像素相同")
        add = {}
        for act in want:
            right, spec = ROWS[act]
            if act in meta["actions"]:
                print(f"  {act:<13} 已有，不動")
                continue
            files = sources(source, spec)
            if not files:
                print(f"  {act:<13} 找不到 {spec}，跳過")
                continue
            print(f"  {act:<13} ← {files[0].relative_to(source) if len(files) == 1 else spec}")
            add[act] = (right, build_row(files, cell, lod["step"], foot))
        if not add:
            continue
        out = Image.new("RGBA", (sheet.width, sheet.height + cell * len(add)), (0, 0, 0, 0))
        out.alpha_composite(sheet, (0, 0))
        y = sheet.height
        for act, (right, cells) in add.items():
            for i, a in enumerate(cells):
                out.alpha_composite(Image.fromarray(a), (i * cell, y))
            row = {k: v for k, v in meta["actions"][right].items() if k != "head"}
            meta["actions"][act] = {**row, "y": y, "frames": len(cells)}
            print(f"    新增 {act:<13} y={y}")
            y += cell
        print(f"  → {out.size}（原 {sheet.size}）")
        if args.dry_run:
            out.save(ROOT / f"output/pixellab-anim-test/{args.hero}{lod['suffix']}-dirrows-preview.png")
            continue
        bk = ROOT / f"output/pixellab-anim-test/_backup_before_dirrows_{args.hero}"
        bk.mkdir(exist_ok=True)
        for p in (meta_p, png_p):
            if not (bk / p.name).exists():
                shutil.copy2(p, bk / p.name)
        out.save(png_p)
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
