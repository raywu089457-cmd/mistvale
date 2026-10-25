"""add_attack_dirs.py — 把 PixelLab 的 8 方向攻擊條圖接成「5 個方向的攻擊列」。

    python add_attack_dirs.py --hero berserker \
        --src output/pixellab-incoming/berserker-attack-8dir

為什麼是 5 列而不是 8 列:遊戲的左半邊一律用右半邊的列 + 程式鏡像
（`moveDir()` 把螢幕空間切 8 個 45° 扇區，左邊三格對應右邊三格再翻轉），所以只需要
東（側面）、東南、南（正面）、東北、北（背面）這 5 個方向，另外三個用鏡像就等於原本畫的。

條圖規格（PixelLab 8 幀/9 格動畫的匯出格式）：768×768、3×3 共 9 格、每格 256。
**接法跟原本那列 `attack` 完全一樣**（腳本會先驗證：用同一個接法重做 `east`，跟現有
列比對必須 ≥ 85% 逐像素相同，否則停手）：
    1x  表：每格 NEAREST 縮一半 → 貼在 cell 128 的 (2, 25)
    @2x 表：原尺寸貼在 cell 256 的 (4, 50) —— 剛好是 1x 的兩倍，
           1x/2x 切換（縮放到 2x 門檻）時角色的位置不會跳（原本那列是 58，差 8 px）。
所以八個方向的角色大小、腳的位置、畫面中的高度都跟現有攻擊列一致，不會換方向就跳一下。

配件錨點 `head`（模組化頭髮/帽子用）跟 `add_battle_rows.py` 同一套算法：
格中心 ±12% 欄位裡最上面一列不透明像素的中心；頭頂離地面不到 0.8 身高就記 None（不戴）。

時間軸沿用現有攻擊列：frameTime 0.075、release 4、impact 5（9 格：前 4 格蓄力、第 5 格命中、後 4 格收招）。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
HEROES = REPO / "assets" / "heroes"

# 方向 → 動作列名（要跟 src/pixel-world.js 的 DIR_ACT 對得上）
ROWS = [
    ("east", "attack"),            # 側面（右）—— 左邊用鏡像
    ("south-east", "attackDownRight"),
    ("south", "attackDown"),       # 正面
    ("north-east", "attackUpRight"),
    ("north", "attackUp"),         # 背面
]
# 接法：來源 256 格 → 目標表。dx/dy 是貼在目標 cell 內的位移（沿用現有 attack 列的實測值）。
LOD = [
    {"suffix": "", "cell": 128, "scale": 0.5, "dx": 2, "dy": 25, "resample": Image.NEAREST},
    {"suffix": "@2x", "cell": 256, "scale": 1.0, "dx": 4, "dy": 50, "resample": None},
]
TIMING = {"frameTime": 0.075, "release": 4, "impact": 5}

# 腳底基準線檢查（移植 perfectpixel 的錨點對齊；PixelLab 的輸出本來就鎖錨點，
# 這裡當成防回歸的守門員：跨距超過容忍值就自己吸附並警告）。
ALIGN_TOL: float | None = None


def snap_baseline(cells: list[Image.Image], tol: float | None = None) -> list[Image.Image]:
    """量 9 格的「最低不透明像素（腳底）」，跨距超過 tol 就把每格平移到共用基準線。"""
    from align_frames import anchor_of

    tol = ALIGN_TOL if tol is None else tol
    if tol is None:
        return cells
    bottoms = [anchor_of(c)[1] for c in cells]
    spread = max(bottoms) - min(bottoms)
    if spread <= tol:
        print(f"  腳底基準線跨距 {spread}px（≤{tol}）— 不動")
        return cells
    target = max(bottoms)
    print(f"  ⚠ 腳底基準線跨距 {spread}px 超過 {tol}px — 吸附到 {target}")
    out = []
    for cell, bottom in zip(cells, bottoms):
        canvas = Image.new("RGBA", cell.size, (0, 0, 0, 0))
        canvas.alpha_composite(cell, (0, target - bottom))
        out.append(canvas)
    return out


def frames_3x3(path: Path, n: int = 9) -> tuple[list[Image.Image], int]:
    im = Image.open(path).convert("RGBA")
    if im.width != im.height or im.width % 3:
        raise SystemExit(f"{path.name}: 預期 3×3 方格條圖，得到 {im.size}")
    c = im.width // 3
    cells = [im.crop(((i % 3) * c, (i // 3) * c, (i % 3) * c + c, (i // 3) * c + c)) for i in range(9)]
    if n != 9:
        raise SystemExit("目前只支援 9 格（3×3）")
    return cells, c


def place(cells: list[Image.Image], lod: dict) -> list[Image.Image]:
    """把 9 格來源縮到目標解析度、貼進 cell 裡（同一個位移套用在每一格）。"""
    cells = snap_baseline(cells)
    out = []
    for cell in cells:
        im = cell
        if lod["scale"] != 1.0:
            size = round(cell.width * lod["scale"])
            im = cell.resize((size, size), lod["resample"])
        canvas = Image.new("RGBA", (lod["cell"], lod["cell"]), (0, 0, 0, 0))
        canvas.alpha_composite(im, (lod["dx"], lod["dy"]))
        out.append(canvas)
    return out


def heads(placed: list[Image.Image], cell: int, foot_from_bottom: int, hero_height: float) -> list:
    """頭頂錨點：格中心 ±12% 欄位裡最上面一列不透明像素的中心（配件用）。"""
    ground = cell - foot_from_bottom - 1
    result = []
    for im in placed:
        a = np.asarray(im)[..., 3] > 0
        lo, hi = int(cell / 2 - .12 * cell), int(cell / 2 + .12 * cell)
        ys = np.nonzero(a[:, lo:hi].any(1))[0]
        if not len(ys):
            result.append(None)
            continue
        top = int(ys.min())
        xs = np.nonzero(a[top:top + 4, lo:hi].any(0))[0] + lo
        result.append([round(float(xs.mean()), 1), top] if ground - top >= hero_height * .8 else None)
    return result


def verify_east(meta: dict, sheet: Image.Image, lod: dict, placed: list[Image.Image]) -> float:
    """用同一套接法重做 east，跟現有的 attack 列比對，確認位移/縮放沒跑掉。"""
    row = meta["actions"]["attack"]
    if row["cell"] != lod["cell"]:
        return 0.0
    scores = []
    for i, im in enumerate(placed):
        existing = np.asarray(sheet.crop((i * row["cell"], row["y"], (i + 1) * row["cell"], row["y"] + row["cell"]))).astype(int)
        made = np.asarray(im).astype(int)
        scores.append(float((np.abs(existing - made).max(-1) == 0).mean()))
    return round(sum(scores) / len(scores), 4)


def main() -> None:
    global ALIGN_TOL
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", required=True)
    parser.add_argument("--src", required=True, help="條圖資料夾（attack-<方向>.png）")
    parser.add_argument("--dry-run", action="store_true", help="只驗證接法，不寫檔")
    parser.add_argument("--force", action="store_true", help="已有的列也重做（統一接法用）")
    parser.add_argument("--align", type=float, nargs="?", const=2.0, default=None,
                        help="腳底基準線容忍值 px（預設 2）：超過就把每格吸附到共用基準線")
    args = parser.parse_args()
    ALIGN_TOL = args.align

    src = Path(args.src)
    sources = {}
    for direction, _ in ROWS:
        path = src / f"attack-{direction}.png"
        if not path.exists():
            raise SystemExit(f"缺少 {path}")
        sources[direction] = frames_3x3(path)[0]

    for lod in LOD:
        meta_path = HEROES / f"{args.hero}{lod['suffix']}.json"
        sheet_path = HEROES / f"{args.hero}{lod['suffix']}.png"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        sheet = Image.open(sheet_path).convert("RGBA")

        built = {direction: place(cells, lod) for direction, cells in sources.items()}
        score = verify_east(meta, sheet, lod, built["east"])
        print(f"{sheet_path.name}: east 接法相符度 {score:.3f}")
        if score < .85:
            raise SystemExit("接法跟現有的 attack 列對不上（位移/縮放/來源檔不同），先確認再寫檔")
        if args.dry_run:
            continue

        # 已經有同一格尺寸、同一格數的列 → 原地換掉(不留舊的重複列)；否則接在表最下面
        rows, height = [], sheet.height
        for direction, act, cells in [(d, a, built[d]) for d, a in ROWS]:
            row = meta["actions"].get(act)
            if row:
                if not args.force:
                    print(f"  跳過 {act}（已存在，要重做加 --force）")
                    continue
                if row["cell"] == lod["cell"] and row["frames"] == len(cells):
                    rows.append((direction, act, cells, row["y"]))
                    continue
                print(f"  警告 {act}: 舊列 cell/frames 不同（{row['cell']}/{row['frames']}），改成接在表尾")
            rows.append((direction, act, cells, height))
            height += lod["cell"]
        if not rows:
            print("  沒有要寫入的列")
            continue

        out = Image.new("RGBA", (sheet.width, max(sheet.height, height)), (0, 0, 0, 0))
        out.alpha_composite(sheet, (0, 0))
        for direction, act, cells, y in rows:
            out.paste((0, 0, 0, 0), (0, y, out.width, y + lod["cell"]))   # 先把整列擦乾淨(原地換掉時不能跟舊圖疊)
            for i, cell in enumerate(cells):
                out.alpha_composite(cell, (i * lod["cell"], y))
            meta["actions"][act] = {
                "y": y, "cell": lod["cell"], "frames": len(cells),
                "head": heads(cells, lod["cell"], meta["footFromBottom"], meta["heroHeight"]),
                **TIMING,
            }
            print(f"  {'換掉' if y < sheet.height else '新增'} {act:<16} y={y}  {len(cells)} 格  ({direction})")
        out.save(sheet_path)
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  → {sheet_path.name} {out.size}，共 {len(meta['actions'])} 列")


if __name__ == "__main__":
    sys.exit(main())
