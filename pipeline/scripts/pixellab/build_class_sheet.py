"""build_class_sheet.py — 把 PixelLab 匯出的角色（8 方向旋轉 + 走路）做成遊戲的職業英雄 sheet。

    python build_class_sheet.py --source <解壓後的資料夾> --name sorcerer

PixelLab 的匯出長相（export_version 3.1）：

    <來源>/rotations/{south,north,east,...}.png          8 方向站姿
    <來源>/animations/{Walking,walking}/<方向>/frame_*.png  每方向 8 格走路

來源是 **2 倍放大**（單一「美術像素」在檔案裡佔 2×2），所以整數 2:1 降採樣取回原生像素；
用 LANCZOS 會產生中間色與柔邊（毛邊），量化救不回來。

輸出 `assets/heroes/<name>.png` + `.json`，格式跟其他英雄一致（cell 100、腳底距底 8、16 色共用色盤）。

會做的列：
    idle / walk / walkDown / walkUp / walkDownRight / walkUpRight   ← 素材直出（左邊一律程式鏡像）
    hurt / victory / death                                          ← 確定性合成（見下方註解）
PixelLab 目前沒有攻擊／技能動畫，所以這兩列**不做**：執行期 `sheetFrame()` 會退回 idle
（不會像以前那樣整隻消失）。等生到 attack 動畫再補。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[3]
OUT_DIR = REPO / "assets" / "heroes"
CELL = 100
FOOT_FROM_BOTTOM = 8
COLORS = 0        # 0 = 不量化（預設）。要壓色盤就用 --colors N

# 遊戲的 8 方向機制：左半邊一律用右半邊的列 + 程式鏡像，所以只需要這幾列
DIRECTIONS = {
    "walk": "east",
    "walkDown": "south",
    "walkUp": "north",
    "walkDownRight": "south-east",
    "walkUpRight": "north-east",
}
IDLE_DIRECTIONS = {"idle": "east", "idleDown": "south", "idleUp": "north"}


def native(image: Image.Image, factor: int) -> Image.Image:
    """整數降採樣 → 原生像素（NEAREST，不產生新顏色）。"""
    array = np.asarray(image.convert("RGBA"))
    if factor > 1:
        array = array[::factor, ::factor]
    return Image.fromarray(array, "RGBA")


def bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(image)[..., 3] > 127
    if not alpha.any():
        return 0, 0, -1, -1
    rows = np.flatnonzero(alpha.any(axis=1))
    columns = np.flatnonzero(alpha.any(axis=0))
    return int(columns.min()), int(rows.min()), int(columns.max()), int(rows.max())


def axis_x(image: Image.Image) -> float:
    """角色的水平中軸：不透明像素 x 的中位數（比 bbox 中心穩：手臂／腿擺動不會拉著它跑）。"""
    alpha = np.asarray(image)[..., 3] > 127
    columns = np.flatnonzero(alpha.any(axis=0))
    if not len(columns):
        return image.width / 2
    xs = np.repeat(columns, alpha[:, columns].sum(axis=0))
    return float(np.median(xs))


def place(image: Image.Image, shift_x: float, shift_y: float) -> Image.Image:
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    canvas.alpha_composite(image, (round(shift_x), round(shift_y)))
    return canvas


def align_rows(rows: dict[str, list[Image.Image]]) -> dict[str, list[Image.Image]]:
    """每一列用同一個位移，不是每格各對一次。

    理由：走路的擺動腳本來就會比支撐腳高，若把「每格的最低點」都硬壓到地面線，
    身體會隨步伐上下抖；可是每一列（方向）又都要站在同一條地面上、同一根中軸上。
    所以：每列算一次中位數腳底與中軸，把整列平移過去；列內各格的相對關係原樣保留。
    """
    out = {}
    for action, row in rows.items():
        axis = float(np.median([axis_x(f) for f in row]))
        bottom = float(np.median([bounds(f)[3] for f in row]))
        dx = CELL / 2 - axis
        dy = (CELL - FOOT_FROM_BOTTOM - 1) - bottom
        out[action] = [place(f, dx, dy) for f in row]
        print(f"    對齊 {action:15s} 中軸 {axis:6.1f} → 50｜腳底 {bottom:5.0f} → {CELL - FOOT_FROM_BOTTOM - 1}（位移 {dx:+.0f},{dy:+.0f}）")
    return out


def shifted(frame: Image.Image, dx: int = 0, dy: int = 0) -> Image.Image:
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    out.alpha_composite(frame, (dx, dy))
    return out


def fall_over(frame: Image.Image, angle: float) -> Image.Image:
    """確定性倒地：以腳底為軸把站姿轉到躺平（angle 度）。"""
    _, _, _, bottom = bounds(frame)
    centre = frame.width / 2
    rotated = frame.rotate(angle, resample=Image.Resampling.NEAREST, expand=True, center=(centre, bottom))
    out = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    # 轉完之後，把圖的腳底重新對回原本的腳底線
    _, _, _, rbottom = bounds(rotated)
    out.alpha_composite(rotated, (round(centre - rotated.width / 2), round(bottom - rbottom)))
    return out


def synth_pose(idle: Image.Image, action: str, count: int) -> list[Image.Image]:
    """從站姿合成「受擊／勝利／倒下」。

    專案本來就有這個前例（早期獵魔人的 hurt/death/victory 也是程式湊的，之後生圖再換）。
    動作刻意做得小，只求打擊感與可辨識，不假裝是生成動畫。
    """
    if action == "hurt":          # 往後退兩格再回正
        plan = [(2, 0), (4, 1), (2, 0), (0, 0)][:count]
    elif action == "victory":     # 原地小跳兩下
        plan = [(0, -1), (0, -4), (0, -1), (0, -3), (0, 0)][:count]
    elif action == "death":       # 腳底不動，身體往外倒
        angles = [0, 12, 28, 46, 64, 78, 88, 90]
        return [fall_over(idle, angles[min(i, len(angles) - 1)]) for i in range(count)]
    else:
        raise ValueError(action)
    return [shifted(idle, dx, dy) for dx, dy in plan]


def load_frames(source: Path, direction: str) -> list[Image.Image]:
    for folder in ("Walking", "walking"):
        candidates = sorted((source / "animations" / folder / direction).glob("frame_*.png"))
        if candidates:
            return [Image.open(p) for p in candidates]
    return []


def mirror_frames(source: Path, direction: str) -> list[Image.Image]:
    """側面的另一邊 = 現有那一邊左右翻。

    遊戲本來就是「左邊一律用右邊的列 + 程式鏡像」，所以這裡自己翻是等價的，不是偷吃步。
    PixelLab 滙出有時會缺一個側面（例如只有 west），這條會把它補起來。
    """
    for folder in ("Walking", "walking"):
        candidates = sorted((source / "animations" / folder / direction).glob("frame_*.png"))
        if candidates:
            return [Image.open(p).transpose(Image.Transpose.FLIP_LEFT_RIGHT) for p in candidates]
    return []


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, help="解壓後的 PixelLab 角色資料夾")
    parser.add_argument("--name", required=True, help="輸出檔名 = 職業 id（例如 sorcerer）")
    parser.add_argument("--downscale", type=int, default=2, help="來源放大倍率（預設 2）")
    parser.add_argument("--columns", type=int, default=8)
    parser.add_argument("--no-synth", action="store_true", help="不要合成 hurt/victory/death")
    parser.add_argument("--colors", type=int, default=COLORS, help=f"色盤上限（預設 {COLORS}；0 = 不量化、原色全留）")
    args = parser.parse_args()

    source = Path(args.source)
    if not (source / "rotations").exists():
        raise SystemExit(f"{source} 底下找不到 rotations/（解壓了嗎？）")

    sys.path.insert(0, str(REPO / "pipeline" / "scripts" / "sprites"))
    from unfake import apply_palette, limit_palette  # noqa: E402

    rows: dict[str, list[Image.Image]] = {}
    for action, direction in DIRECTIONS.items():
        frames = load_frames(source, direction)
        if not frames:
            frames = mirror_frames(source, "west" if direction == "east" else "east")   # 缺側面 → 用另一邊翻
            if frames:
                print(f"  {action:15s} ← {direction}（缺，用另一側鏡像）{len(frames)} 格")
        if not frames:
            print(f"  ! {action}: 找不到 {direction} 的走路素材，跳過")
            continue
        rows[action] = [native(f, args.downscale) for f in frames]
        heights = [bounds(f)[3] - bounds(f)[1] + 1 for f in rows[action]]
        print(f"  {action:15s} ← {direction:11s} {len(frames)} 格 高 {min(heights)}–{max(heights)}")

    for action, direction in IDLE_DIRECTIONS.items():
        path = source / "rotations" / f"{direction}.png"
        if not path.exists():
            continue
        rows[action] = [native(Image.open(path), args.downscale)]
        print(f"  {action:15s} ← rotations/{direction}.png")

    if "idle" not in rows:
        raise SystemExit("沒有 idle 列（rotations/east.png 不存在？）")

    rows = align_rows(rows)

    if not args.no_synth:
        idle = rows["idle"][0]
        rows["hurt"] = synth_pose(idle, "hurt", 4)
        rows["victory"] = synth_pose(idle, "victory", 5)
        rows["death"] = synth_pose(idle, "death", 8)

    # 畫質優先:預設**不量化** —— 2:1 降採樣已經取回原生像素(整數抽取,不改任何顏色),
    # 再壓色盤就只是把原本的顏色換掉(平白降級)。--colors N 才是真的壓色盤。
    if args.colors and args.colors > 0:
        palette = limit_palette([f for row in rows.values() for f in row], n=args.colors)
        rows = {action: [apply_palette(f, palette) for f in row] for action, row in rows.items()}
        print(f"  色盤 {len(palette)} 色（量化）")
    else:
        flat = np.concatenate([np.asarray(f).reshape(-1, 4) for row in rows.values() for f in row])
        unique = np.unique(flat[flat[:, 3] > 127][:, :3], axis=0)
        palette = unique
        print(f"  色盤 {len(unique)} 色（原色全留，不量化）")

    order = ["idle", "idleDown", "idleUp", "walk", "walkDown", "walkUp", "walkDownRight", "walkUpRight",
             "hurt", "victory", "death"]
    rows = {key: rows[key] for key in order if key in rows}

    sheet = Image.new("RGBA", (CELL * args.columns, CELL * len(rows)), (0, 0, 0, 0))
    actions = {}
    for index, (action, row) in enumerate(rows.items()):
        for column, frame in enumerate(row[:args.columns]):
            sheet.alpha_composite(frame, (column * CELL, index * CELL))
        actions[action] = {"y": index * CELL, "cell": CELL, "frames": min(len(row), args.columns),
                           "frameTime": 0.16 if action.startswith("idle") else 0.1}
        if action.startswith("walk"):
            # 2026-10-12: 走路列改成固定 8 fps（＝PixelLab 網站的預覽速度，實測 125ms/格）。
            # 舊的 cycle=85 是「看移動距離推進」，走得慢的角色（街上 NPC 0.8 單位/秒）會慢到 2.6 fps。
            actions[action]["frameTime"] = 0.125

    heights = [bounds(f)[3] - bounds(f)[1] + 1 for row in rows.values() for f in row]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT_DIR / f"{args.name}.png")

    groups = {"outfit": [], "metal": []}
    try:
        sys.path.insert(0, str(REPO / "pipeline" / "scripts" / "heroes"))
        from build_hero import material_groups  # noqa: E402
        groups = material_groups(args.name, np.asarray(palette))
    except Exception as error:                                  # 沒有這個職業的色相設定就先不做換色
        print(f"  （{args.name} 沒有 SWAP 設定，跳過材質分組：{error}）")

    meta = {
        "hero": args.name,
        "heroHeight": max(heights),
        "footFromBottom": FOOT_FROM_BOTTOM,
        "actions": actions,
        "palette": ["#%02x%02x%02x" % tuple(int(v) for v in colour) for colour in palette],
        "groups": groups,
        "source": f"PixelLab 匯出（{source.name}）：8 方向旋轉 + 走路；{args.downscale}:1 降採樣回原生像素；"
                  f"hurt/victory/death 為確定性合成",
    }
    (OUT_DIR / f"{args.name}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"→ {OUT_DIR / (args.name + '.png')} {sheet.size}｜角色高 {min(heights)}–{max(heights)}｜列 {list(rows)}")


if __name__ == "__main__":
    main()
