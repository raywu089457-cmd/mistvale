"""build_priest_8dir.py — 牧師：新 8 方向素材(idle 8 向 / walk 5 向+鏡像 / attack 8 向) → 遊戲用英雄 sheet。

    python pipeline/scripts/pixellab/build_priest_8dir.py            # 只出預覽
    python pipeline/scripts/pixellab/build_priest_8dir.py --write    # 寫 assets/heroes/priest.*

來源
  idle   ~/Desktop/牧師-8方向-256/idle/*.png            8 個方向、256×256、一張一個方向
  walk   output/pixellab-incoming/priest-walk/dl/walking-8-frames-<方向>/frame-XX.png
         西／西南／西北 = 東／東南／東北 的鏡像（牧師走路時兩手空著,鏡像不會換手）
  attack output/pixellab-incoming/priest-attack-8dir/named/<方向>.png  768=3×3、每格 256、用前 8 格

規則(跟其他英雄同一套)
  格 100（攻擊列 128，因為法杖＋法球會伸出身體）、腳底 = 格底上 8、軸 = 格中線、alpha 只留 0/255、median-cut 32 色。
  角色高 71 px（跟舊牧師一樣,換素材不會忽大忽小）。
  hurt / death / victory 沒有新素材 → 用 idle 做整數位移的程式化版本（跟魔物同一套做法）,畫風才不會變成兩個人。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/scripts/sprites"))
import build_monster_8dir as B  # noqa: E402  Mon / fill_transparent / quantize / clamp / shift

HOME = Path.home()
IDLE_SRC = HOME / "Desktop/牧師-8方向-256/idle"
WALK_SRC = ROOT / "output/pixellab-incoming/priest-walk/dl"
ATK_SRC = ROOT / "output/pixellab-incoming/priest-attack-8dir/named"
HEROES = ROOT / "assets/heroes"

FOOT = 8
ART_H = 71
CELL = 100
ACELL = 128
SUF = {"south": "Down", "south-east": "DownRight", "east": "", "north-east": "UpRight",
       "north": "Up", "north-west": "UpLeft", "west": "Left", "south-west": "DownLeft"}
ATK = {"east": "attack", "south-east": "attackDownRight", "south": "attackDown", "south-west": "attackDownLeft",
       "west": "attackLeft", "north-west": "attackUpLeft", "north": "attackUp", "north-east": "attackUpRight"}
MIRROR = {"west": "east", "south-west": "south-east", "north-west": "north-east"}
NUM = {"1": "south", "2": "south-east", "3": "east", "4": "north-east",
       "5": "north", "6": "north-west", "7": "west", "8": "south-west"}


def load_idle() -> dict[str, Path]:
    out = {}
    for p in IDLE_SRC.glob("*-256.png"):
        key = p.name.split("-")[0]
        if key in NUM:
            out[NUM[key]] = p
    return out


def scale_of(paths: list[Path]) -> float:
    """8 個方向用同一個縮放比（體型一致）：取最大內容高度當 1:1 基準。"""
    heights = []
    for p in paths:
        a = np.asarray(Image.open(p).convert("RGBA"))
        ys = np.nonzero((a[..., 3] > 0).any(1))[0]
        if len(ys):
            heights.append(ys.max() - ys.min() + 1)
    return ART_H / max(heights)


def place(img: Image.Image, s: float, cell: int, dx_ref: float | None = None) -> tuple[Image.Image, float]:
    """縮放 + 去背 + 對位（腳底貼地線、腳底重心對格中線），回傳格子圖與它用的 dx。"""
    a = B.fill_transparent(np.asarray(img.convert("RGBA")).copy())
    w, h = max(1, round(a.shape[1] * s)), max(1, round(a.shape[0] * s))
    b = np.asarray(Image.fromarray(a, "RGBA").resize((w, h), Image.LANCZOS)).copy()
    b[..., 3] = np.where(b[..., 3] >= 96, 255, 0)
    x0, y0, x1, y1 = B.bbox(b)
    crop = Image.fromarray(b[y0:y1, x0:x1], "RGBA")
    al = np.asarray(crop)[..., 3] > 0
    band = al[max(0, al.shape[0] - 6):]
    cols = np.nonzero(band.any(0))[0]
    cx = float(cols.mean()) if len(cols) else crop.width / 2
    dx = int(round(cell / 2 - cx)) if dx_ref is None else int(round(dx_ref))
    dx = min(max(dx, 2), cell - 2 - crop.width)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    canvas.alpha_composite(crop, (dx, cell - FOOT - crop.height))
    return B.quantize(canvas), dx


def mirror_cell(im: Image.Image) -> Image.Image:
    return im.transpose(Image.FLIP_LEFT_RIGHT)


def build(write: bool) -> None:
    idle_files = load_idle()
    missing = [d for d in SUF if d not in idle_files]
    if missing:
        raise SystemExit(f"idle 缺方向 {missing}")
    s = scale_of(list(idle_files.values()))
    print(f"scale {s:.3f}（角色 {ART_H}px / 來源最大高）")

    # 角色色盤（換色外觀用，pixel-world 的 variantMap 會直接 index 這個陣列）
    pal = set()
    for c in [np.asarray(place(Image.open(idle_files[d]), s, CELL)[0]) for d in SUF]:
        a = c[c[..., 3] > 0][:, :3]
        pal |= {tuple(int(v) for v in px) for px in a}
    palette = ["#%02x%02x%02x" % c for c in sorted(pal)]
    rows: list[tuple[str, list[np.ndarray], dict]] = []
    # ---- idle（8 個方向各 1 格）----
    for d, suf in SUF.items():
        cell, _ = place(Image.open(idle_files[d]), s, CELL)
        rows.append(("idle" + suf, [np.asarray(cell)], {"frames": 1, "frameTime": .16}))
    # ---- walk（5 向 + 鏡像 3 向）----
    walk_cells: dict[str, list[Image.Image]] = {}
    for d in SUF:
        src = d if d not in MIRROR else MIRROR[d]
        files = sorted((WALK_SRC / f"walking-8-frames-{src}").glob("frame-*.png"))
        if not files:
            raise SystemExit(f"走路缺 {src}")
        cells, dx = [], None
        for f in files:                       # 整列用第 0 格的 dx，8 格不會左右抖
            c, dx = place(Image.open(f), s, CELL, dx)
            cells.append(c)
        walk_cells[d] = [mirror_cell(c) for c in cells] if d in MIRROR else cells
    for d, suf in SUF.items():
        rows.append(("walk" + suf, [np.asarray(c) for c in walk_cells[d]],
                     {"frames": len(walk_cells[d]), "frameTime": .1, "cycle": 85}))
    # ---- attack（8 向 × 8 格，格子大一號：法杖與法球會伸出身體）----
    for d, act in ATK.items():
        p = ATK_SRC / f"{d}.png"
        im = Image.open(p).convert("RGBA")
        t = im.width // 3
        cells, dx = [], None
        for i in range(8):
            c = im.crop(((i % 3) * t, (i // 3) * t, (i % 3 + 1) * t, (i // 3 + 1) * t))
            cell, dx = place(c, s, ACELL, dx)
            cells.append(cell)
        rows.append((act, [np.asarray(c) for c in cells],
                     {"frames": 8, "frameTime": .075, "release": 4, "impact": 5, "windupFrameTime": .075}))
    # ---- hurt / death / victory：程式化（用 idle 東向當基準，跟魔物同一套位移）----
    base = np.asarray(place(Image.open(idle_files["east"]), s, CELL)[0])
    M = B.Mon(base, ART_H)
    rows.append(("hurt", [np.asarray(B.clamp(c)) for c in M.hurt()], {"frames": 4, "frameTime": .1}))
    rows.append(("death", [np.asarray(B.clamp(c)) for c in M.death()], {"frames": 8, "frameTime": .12}))
    rows.append(("victory", [np.asarray(base)], {"frames": 1, "frameTime": .16}))
    # skill 直接用攻擊列（法杖發法球）→ 同一份資料指向同一個 y
    rows.append(("skill", None, {}))

    width = max(CELL * 8, ACELL * 8)
    height = sum(max(CELL, ACELL if r[0].startswith("attack") else CELL) for r in rows)
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    acts = {}
    y = 0
    for name, frames, spec in rows:
        if name == "skill":
            acts["skill"] = {**acts["attack"], "y": acts["attack"]["y"]}
            continue
        cell = ACELL if name.startswith("attack") else CELL
        head = []
        for i, f in enumerate(frames):
            sheet.alpha_composite(Image.fromarray(f, "RGBA"), (i * cell, y))
            a = f[..., 3] > 0
            ys = np.nonzero(a[:, int(cell / 2 - .12 * cell):int(cell / 2 + .12 * cell)].any(1))[0]
            head.append([cell / 2, int(ys.min())] if len(ys) else None)
        acts[name] = {"y": y, "cell": cell, "frames": len(frames), **spec, "head": head}
        y += cell

    meta = {"hero": "priest", "heroHeight": ART_H, "footFromBottom": FOOT, "actions": acts,
            "source": "PixelLab 8 方向：idle 8 向(桌面)、walk 5 向+鏡像(模板 walking-8-frames)、attack 8 向(網站 3×3)；hurt/death/victory 程式化",
            "palette": palette, "groups": {"outfit": [], "metal": []}}
    print(f"sheet {sheet.size} rows {len(acts)}")
    if write:
        bak = HEROES / "_prev8dir"
        bak.mkdir(exist_ok=True)
        import shutil
        if (HEROES / "priest.png").exists() and not (bak / "priest.png").exists():
            shutil.copy2(HEROES / "priest.png", bak / "priest.png")
            shutil.copy2(HEROES / "priest.json", bak / "priest.json")
        sheet.save(HEROES / "priest.png")
        (HEROES / "priest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print("→ assets/heroes/priest.png/.json")
    else:
        out = ROOT / "output/l0veyou/priest8_preview.png"
        sheet.save(out)
        print("preview →", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    build(ap.parse_args().write)
