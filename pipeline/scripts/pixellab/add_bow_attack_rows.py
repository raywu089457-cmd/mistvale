"""add_bow_attack_rows.py — 把拉弓攻擊（每方向 9 幀）接成弓箭手的 8 個方向攻擊列（全部生成，不鏡像）。

    python pipeline/scripts/pixellab/add_bow_attack_rows.py --hero archer [--dry-run]

2026-10-24：遊俠（ranger）併入弓箭手（archer）——兩個職業是同一個角色 788cd873，遊戲只留弓箭手，這些列現在接在 archer 表上。

來源（2026-10-23，角色 788cd873 斗篷弓手 = 遊戲的 ranger 遊俠；交接文件寫「弓手／archer」是誤植）：
    east        output/pixellab-anim-test/archer-bow-east/east/00..08.png      "drawing a bow, aiming, releasing an arrow, side view"
    south-east / north-east   output/pixellab-anim-test/ranger-bow-4dir/<方向>/   "drawing a bow, aiming, releasing an arrow"
    south       output/pixellab-anim-test/ranger-bow-south2/south/   第一次往畫面右邊放箭 → 重生「面向鏡頭、箭朝鏡頭」，只用 0–5 格（見 ROWS）
    north       output/pixellab-anim-test/ranger-bow-north3-s7/north/         第三版（帳號 2，逐格背面往上射；之前兩版：轉成正面／往右射）
    north-west  output/pixellab-anim-test/ranger-bow-west2/north-west/   "drawing a bow, aiming, releasing an arrow"
    west / south-west   output/pixellab-anim-test/ranger-bow-acc2/<方向>/   帳號 2 的匯入角色 b9c7cfde（west＝"…, side view"；south-west＝逐格朝左下）

接法跟 build_class_sheet.py 的走路列同一套比例：@2x＝來源 1:1、1x＝來源每 2 px 取 1（原生像素）。
每列用「第 0 格（站姿）」算一次位移：中軸（不透明像素 x 中位數）→ 格中線、腳底 → cell−footFromBottom−1，
整列同一個位移（拉弓時弓往前伸，不能每格各自置中）。8 個方向都是生成的，遊戲不鏡像（dirSuffix／leftRow）。
節奏：0–6 拉弓瞄準＝蓄力格，7 放箭（release）、8 命中（impact）。已有的列原地換掉（1x 原本的 l0veyou attack 8 格 → 這次 9 格）。
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
SRC = ROOT / "output/pixellab-anim-test"
ROWS = [
    # 東南北西 4 個正方向＝使用者下載的攻擊短片（Grok 影片，灰底）→ paladin-anchor-lab/clips/process_clips.py（預設）
    # （灰底換綠 → sprite-gen video-frames --key green 去背 → 剝光暈／去飛箭／grid_snap_downscale／鎖 PixelLab 色盤 → 補 PixelLab 式外框）
    # → ranger-bow-clips-sg-ol/。2026-10-23 使用者定案用這個處理方式（影片沒有描邊，不補外框會有一圈淺色白邊）。
    # 舊版：ranger-bow-clips/（ffmpeg 去背、無外框）。換回 PixelLab 版：east＝archer-bow-east/east、south＝ranger-bow-south2/south + [0,1,2,3,4,5,5,4,4]
    ("attack", SRC / "ranger-bow-clips-sg-ol/east"),
    ("attackDownRight", SRC / "ranger-bow-4dir/south-east"),
    # south：第一次往畫面右邊放箭 → 重生 ranger-bow-south2（面向鏡頭、弓舉在胸前、箭朝鏡頭），
    # 但它最後 2 格又轉身、箭頭朝左 → 只用 0–5 格：滿弓停在 5，放箭用 4（手往前鬆開）
    ("attackDown", SRC / "ranger-bow-clips-sg-ol/south"),
    ("attackUpRight", SRC / "ranger-bow-4dir/north-east"),
    # north：north2（全程背面）箭往畫面右邊、弓幾乎看不到 → 帳號 2 重做（逐格：背面、弓立在身前、弓臂從左肩露出、往上方射），
    # 兩個種子挑 s7（弓尖從頭頂露出、右手肘拉弓、披風擺動；s21 幾乎不動）
    ("attackUp", SRC / "ranger-bow-clips-sg-ol/north"),  # 2026-10-23 改用使用者短片「- (2).mp4」；PixelLab 版＝ranger-bow-north3-s7/north
    # 左半邊也全部用生成的（不鏡像 → 拿弓的手不會左右顛倒）；dirSuffix／leftRow 有 Left／DownLeft／UpLeft 列就直接用。
    # west、south-west 在帳號 2（帳號 1 額度不夠）：把 788cd873 的 8 張站姿匯入成 b9c7cfde 再生成，身形比例一樣。
    # south-west 第一次（ranger-bow-west2）弓舉在臉前、看不出往左下 → 重做成逐格描述「朝左下瞄準、箭指左下」。
    ("attackLeft", SRC / "ranger-bow-clips-sg-ol/west"),  # 2026-10-23 改用使用者短片「- (3).mp4」；PixelLab 版＝ranger-bow-acc2/west（＋CLEAN 第 8 格）
    ("attackDownLeft", SRC / "ranger-bow-acc2/south-west"),
    ("attackUpLeft", SRC / "ranger-bow-west2/north-west"),
]
LOD = [{"suffix": "", "step": 2}, {"suffix": "@2x", "step": 1}]
# 個別格的清理（來源畫布座標，縮放前套用）：{來源資料夾: {來源格: 從這個 x 起往右整片擦掉}}
# 綁「來源資料夾」不綁列：2026-10-23 西向換成影片版後，這條規則還掛在 attackLeft 上，把影片版第 8 格右半身擦掉了。
# ranger-bow-acc2/west 第 8 格：放箭後手的後方又多畫一支往右（往後）的箭＋白色準星圈 → 擦掉手（x≈118）後方
CLEAN = {"ranger-bow-acc2/west": {8: 119}}
# windupFrameTime：蓄力 7 格每格 75ms 等速播（蓄力 0.525 秒；沒有這個值時引擎把 7 格擠在 0.3 秒、前段每格只有 22–36ms，
# 遊戲 30fps 下常整格沒畫到）。有這個值，引擎也會開「逐格不跳」（pixel-world.js noSkip）。出手時間點不變（遊俠攻擊間隔 1.2 秒）。
TIMING = {"frameTime": 0.075, "release": 7, "impact": 8, "windupFrameTime": 0.075}
FRAMES = 9


def axis_x(a: np.ndarray) -> float:
    m = a[..., 3] > 127
    cols = np.flatnonzero(m.any(0))
    return float(np.median(np.repeat(cols, m[:, cols].sum(0)))) if len(cols) else a.shape[1] / 2


def bottom(a: np.ndarray) -> int:
    return int(np.flatnonzero((a[..., 3] > 127).any(1)).max())


def heads(cells: list[np.ndarray], cell: int, foot_from_bottom: int, hero_height: float) -> list:
    ground = cell - foot_from_bottom - 1
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


def load(src: Path, i: int, clean: dict[int, int]) -> np.ndarray:
    a = np.asarray(Image.open(src / f"{i:02d}.png").convert("RGBA")).copy()
    if i in clean:
        a[:, clean[i]:] = 0
    return a


def build_row(src: Path, cell: int, step: int, foot_from_bottom: int, pick: list[int] | None = None,
              clean: dict[int, int] | None = None) -> list[np.ndarray]:
    frames = [load(src, i, clean or {})[::step, ::step] for i in (pick or range(FRAMES))]
    spread = max(bottom(f) for f in frames) - min(bottom(f) for f in frames)
    dx = round(cell / 2 - axis_x(frames[0]))
    dy = (cell - foot_from_bottom - 1) - bottom(frames[0])
    cells = []
    for f in frames:
        c = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        c.alpha_composite(Image.fromarray(f), (dx, dy))
        cells.append(np.asarray(c))
    edge = [i for i, a in enumerate(cells) if (lambda m: m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any())(a[..., 3] > 0)]
    print(f"    {src.parent.name}/{src.name:<11} 位移 ({dx:+d},{dy:+d})  腳底跨距 {spread}px  碰邊 {edge}")
    return cells


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hero", default="archer")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    for lod in LOD:
        meta_p, png_p = HEROES / f"{args.hero}{lod['suffix']}.json", HEROES / f"{args.hero}{lod['suffix']}.png"
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        sheet = Image.open(png_p).convert("RGBA")
        cell = meta["actions"]["idle"]["cell"]
        print(f"{png_p.name}: cell {cell}, footFromBottom {meta['footFromBottom']}")
        built = {act: build_row(src, cell, lod["step"], meta["footFromBottom"], *(rest or [None]),
                                clean=CLEAN.get(f"{src.parent.name}/{src.name}"))
                 for act, src, *rest in ROWS}
        width = max(sheet.width, cell * FRAMES)
        height, place = sheet.height, {}
        for act, *_ in ROWS:
            row = meta["actions"].get(act)
            if row and row["cell"] == cell:
                place[act] = row["y"]
            else:
                place[act] = height
                height += cell
        out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        out.alpha_composite(sheet, (0, 0))
        for act, *_ in ROWS:
            y = place[act]
            out.paste((0, 0, 0, 0), (0, y, width, y + cell))
            for i, a in enumerate(built[act]):
                out.alpha_composite(Image.fromarray(a), (i * cell, y))
            meta["actions"][act] = {"y": y, "cell": cell, "frames": FRAMES,
                                    "head": heads(built[act], cell, meta["footFromBottom"], meta["heroHeight"]), **TIMING}
            print(f"    {'換掉' if y < sheet.height else '新增'} {act:<16} y={y}")
        print(f"  → {out.size}（原 {sheet.size}）")
        if args.dry_run:
            out.save(ROOT / f"output/pixellab-anim-test/{args.hero}{lod['suffix']}-preview.png")
            continue
        bk = ROOT / "output/pixellab-anim-test/_backup_before_bow"
        bk.mkdir(exist_ok=True)
        for p in (meta_p, png_p):
            if not (bk / p.name).exists():
                shutil.copy2(p, bk / p.name)
        out.save(png_p)
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
