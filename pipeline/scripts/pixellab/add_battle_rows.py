"""add_battle_rows.py — 把 l0veyou 生的攻擊／技能表「加一列」進現有的英雄 sheet。

    python add_battle_rows.py --hero sorcerer --action attack --source output/l0veyou/gen-sorcerer-attack.png
    python add_battle_rows.py --hero sorcerer --action skill  --source output/l0veyou/gen-sorcerer-skill.png

為什麼是「加一列」而不是重跑 `build_hero.py`：走路／待機已經是 PixelLab 的原生像素（不量化、不重取樣），
重跑整隻會把那些好素材換成 l0veyou 的版本。這裡只補缺的那一列，其他列一個像素都不動。

流程（每一步都跟既有素材對齊）：
    去背／切格（沿用 build_hero.cut）→ 縮到跟本體一樣高（LANCZOS）→ alpha 二值化
    → 顏色映射到**這隻角色自己的色盤**（不是通用 16 色，所以不會把金屬反光吃掉）
    → 依「不透明像素 x 的中位數」對齊中軸、腳底對到地面線 → 接在 sheet 最下面一列 → 更新 meta。
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
sys.path.insert(0, str(REPO / "pipeline" / "scripts" / "heroes"))
sys.path.insert(0, str(REPO / "pipeline" / "scripts" / "xilurus"))
sys.path.insert(0, str(REPO / "pipeline" / "scripts" / "l0veyou"))

TIMING = {"attack": {"frameTime": 0.075, "release": 4, "impact": 5},
          "skill": {"frameTime": 0.075, "release": 4},
          # 走路列：cycle = 一輪走路應該前進的美術像素（遊戲依實際移動距離推進走路格，腳才不打滑）。
          # 這裡沿用 `build_class_sheet.py` 算出來的值（PixelLab 的走路列也是 85），四方向才一致。
          "walk": {"frameTime": 0.125},
          "walkDown": {"frameTime": 0.125},
          "walkUp": {"frameTime": 0.125},
          "walkDownRight": {"frameTime": 0.125},
          "walkUpRight": {"frameTime": 0.125}}


def axis_x(image: Image.Image) -> float:
    alpha = np.asarray(image)[..., 3] > 127
    columns = np.flatnonzero(alpha.any(axis=0))
    if not len(columns):
        return image.width / 2
    xs = np.repeat(columns, alpha[:, columns].sum(axis=0))
    return float(np.median(xs))


def map_to_palette(image: Image.Image, palette: np.ndarray) -> Image.Image:
    """每個像素找最近的色盤色（整數、不內插）。色盤可以超過 256 色，所以不用 PIL 的 quantize。"""
    array = np.asarray(image).astype(np.int16)
    rgb, alpha = array[..., :3], array[..., 3]
    flat = rgb.reshape(-1, 3)
    out = np.empty_like(flat)
    for start in range(0, len(flat), 65536):                       # 分塊算，避免一次開太大的距離矩陣
        chunk = flat[start:start + 65536]
        distance = ((chunk[:, None, :].astype(np.int32) - palette[None, :, :].astype(np.int32)) ** 2).sum(-1)
        out[start:start + 65536] = palette[distance.argmin(1)]
    return Image.fromarray(np.dstack([out.reshape(rgb.shape).astype(np.uint8), alpha.astype(np.uint8)]), "RGBA")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", required=True)
    parser.add_argument("--action", required=True, choices=sorted(TIMING))
    parser.add_argument("--source", required=True, help="l0veyou 生的表（綠底、N 格）")
    parser.add_argument("--grid", default="4x2", help="來源格線，例如 4x2")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--scale-to", default="body", choices=["body", "fixed"],
                        help="body = 縮到跟本體一樣高（預設）；fixed = 用 --height 指定")
    parser.add_argument("--no-quantize", action="store_true", help="不要映射到角色色盤（保留生成原色）")
    args = parser.parse_args()

    sheet_path = HEROES / f"{args.hero}.png"
    meta_path = HEROES / f"{args.hero}.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sheet = Image.open(sheet_path).convert("RGBA")
    cell = meta["actions"]["idle"]["cell"]
    ground = cell - meta["footFromBottom"] - 1
    palette = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in meta["palette"]], dtype=np.int16)

    from build_hero import cut, body_h                                  # noqa: E402
    cols, rows = (int(v) for v in args.grid.split("x"))
    frames = [f for f in cut(Path(args.source), (cols, rows)) if f][:args.frames]
    print(f"  切出 {len(frames)} 格")

    idle = sheet.crop((0, meta["actions"]["idle"]["y"], cell, meta["actions"]["idle"]["y"] + cell))
    target_h = body_h(idle)
    print(f"  本體身高 {target_h:.0f} px（新素材縮到這個大小）")

    placed = []
    for image, _ in frames:
        scale = target_h / body_h(image)
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        small = image.resize(size, Image.LANCZOS)
        alpha = np.where(np.asarray(small)[..., 3] >= 110, 255, 0).astype(np.uint8)
        rgb = np.dstack([np.asarray(small)[..., :3], alpha])
        small = Image.fromarray(rgb, "RGBA")
        if not args.no_quantize:
            small = map_to_palette(small, palette)
        # 對齊：中軸對到格中心、腳底對到地面線
        dx = round(cell / 2 - axis_x(small))
        dy = ground - small.height
        canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        canvas.alpha_composite(small, (dx, dy))
        placed.append(canvas)

    y = sheet.height
    out = Image.new("RGBA", (sheet.width, y + cell), (0, 0, 0, 0))
    out.alpha_composite(sheet, (0, 0))
    for i, frame in enumerate(placed):
        out.alpha_composite(frame, (i * cell, y))
    out.save(sheet_path)

    # 頭頂錨點（配件用）：軀幹中線 ±12% 欄裡最上面一列不透明像素
    array = np.asarray(out)
    heads = []
    for i in range(len(placed)):
        f = array[y:y + cell, i * cell:(i + 1) * cell, 3] > 0
        lo, hi = int(cell / 2 - .12 * cell), int(cell / 2 + .12 * cell)
        ys = np.nonzero(f[:, lo:hi].any(1))[0]
        if not len(ys):
            heads.append(None)
            continue
        top = int(ys.min()); xs = np.nonzero(f[top:top + 4, lo:hi].any(0))[0] + lo
        heads.append([round(float(xs.mean()), 1), top] if ground - top >= target_h * .8 else None)

    meta["actions"][args.action] = {"y": y, "cell": cell, "frames": len(placed),
                                    "head": heads, **TIMING[args.action]}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {sheet_path.name} {out.size}｜{args.action} 加在第 {y // cell} 列，{len(placed)} 格"
          f"｜角色高 {meta['heroHeight']}")


if __name__ == "__main__":
    main()
