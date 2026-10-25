"""add_attack_rows_gif.py — 把 PixelLab 網站下載的 8 方向攻擊 GIF 接成英雄的 8 個攻擊列（全部生成，不鏡像）。

    python pipeline/scripts/pixellab/add_attack_rows_gif.py --hero assassin \
        --src output/pixellab-incoming/assassin-attack-8dir/gif \
        --pick south=0,3,5,8,11,12,14,17,36 --release 5 --impact 6 --foot2x 30 [--dry-run]

來源：<src>/<方向>.gif（east、south-east、south、south-west、west、north-west、north、north-east），
或網站下載的 spritesheet <src>/<方向>.png（每格 --tile px、由左到右由上到下，例：9 格＝3×3 的 768×768；後面全空的格不算）。
網站 GIF／spritesheet 每格 256×256、跟 PixelLab 旋轉圖同一個比例（角色約 126 px 高）＝ @2x 表 1:1；1x 表＝每 2 px 取 1（跟 build_class_sheet.py 一樣）。
--cell2x：攻擊列自己的格子大小（@2x 的值，1x 取一半；預設＝待機列）。特效飛出身體很遠（法球）時用 256，整格原圖都放得進去不被切。
--flag：額外的列設定，例 bakedMotion（素材自帶動作，不疊執行期假前衝／切身體）、fxInSprite（特效畫在攻擊列裡，不畫蓄力光點）。
每個方向取 --frames 格（預設前 9 格）；某方向格數不同（例：南向那次生成了 41 格）用 --pick 方向=格號,… 挑。
挑好的格另存成 output/pixellab-anim-test/<hero>-attack-8dir/<方向>/NN.png（看得到、可重跑）。

接法跟 add_bow_attack_rows.py 一樣：整列用第 0 格（站姿）算一次位移（中軸 → 格中線、腳底 → 腳底線），不每格各自置中。
刀光會伸到腳下 → 攻擊列自帶 footFromBottom（--foot2x，@2x 的值；1x 自動取一半，兩份表維持嚴格 2 倍），格子大小跟待機列一樣。
節奏：frameTime 每格秒數、release 出手格、impact 命中格；windupFrameTime＝蓄力格等速播＋引擎「逐格不跳」（pixel-world.js noSkip）。
已有的同名列（格子大小相同）原地換掉，其他接在表的最下面。改前備份 output/pixellab-anim-test/_backup_before_attack8_<hero>/。

紀錄：2026-10-24 刺客（assassin，PixelLab 3d3020ce）雙手拔匕首→高舉→X 字斬（白色刀光）→收招，使用者在網站生成 8 方向。
2026-10-25 法師（sorcerer，PixelLab 5955ea9f）手勢發射魔法球，網站 spritesheet（3×3、9 格）：
    --hero sorcerer --src output/pixellab-incoming/sorcerer-attack-8dir/named --release 5 --impact 6
    --foot2x 64 --cell2x 256 --flag bakedMotion --flag fxInSprite
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
DIRS = {"east": "attack", "south-east": "attackDownRight", "south": "attackDown", "north-east": "attackUpRight",
        "north": "attackUp", "south-west": "attackDownLeft", "north-west": "attackUpLeft", "west": "attackLeft"}
LOD = [{"suffix": "", "step": 2}, {"suffix": "@2x", "step": 1}]


def axis_x(a: np.ndarray) -> float:
    m = a[..., 3] > 127
    cols = np.flatnonzero(m.any(0))
    return float(np.median(np.repeat(cols, m[:, cols].sum(0))))


def bottom(a: np.ndarray) -> int:
    return int(np.flatnonzero((a[..., 3] > 127).any(1)).max())


def heads(cells: list[np.ndarray], cell: int, foot: int, hero_height: float) -> list:
    """頭飾錨點（跟 add_bow_attack_rows.py 同一套）：格中線 ±12% 欄位裡最上面那排；頭離地面不到身高 8 成（蹲低、彎腰）就不畫頭飾。"""
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


def load_frames(src: Path, d: str, tile: int) -> list[np.ndarray]:
    if (src / f"{d}.gif").exists():
        return [np.asarray(f.convert("RGBA")) for f in ImageSequence.Iterator(Image.open(src / f"{d}.gif"))]
    a = np.asarray(Image.open(src / f"{d}.png").convert("RGBA"))
    if a.shape[0] % tile or a.shape[1] % tile:
        raise SystemExit(f"{d}.png {a.shape[1]}×{a.shape[0]} 不是 {tile} 的倍數")
    cells = [a[r:r + tile, c:c + tile] for r in range(0, a.shape[0], tile) for c in range(0, a.shape[1], tile)]
    while cells and not (cells[-1][..., 3] > 0).any():
        cells.pop()
    return cells


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hero", required=True)
    ap.add_argument("--src", required=True, help="放 <方向>.gif 的資料夾")
    ap.add_argument("--frames", type=int, default=9)
    ap.add_argument("--pick", action="append", default=[], help="方向=格號,格號,…（可重複）")
    ap.add_argument("--release", type=int, required=True)
    ap.add_argument("--impact", type=int, required=True)
    ap.add_argument("--frame-time", type=float, default=0.075)
    ap.add_argument("--windup-frame-time", type=float, default=0.075)
    ap.add_argument("--foot2x", type=int, required=True, help="攻擊列 @2x 的 footFromBottom（偶數；1x 取一半）")
    ap.add_argument("--cell2x", type=int, default=0, help="攻擊列 @2x 的格子大小（偶數；1x 取一半；預設＝待機列）")
    ap.add_argument("--tile", type=int, default=256, help="spritesheet PNG 每格 px")
    ap.add_argument("--flag", action="append", default=[], help="列設定設成 true（可重複）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.foot2x % 2 or args.cell2x % 2:
        raise SystemExit("--foot2x／--cell2x 要是偶數（1x 取一半要整數）")
    src = ROOT / args.src
    picks = {k: [int(x) for x in v.split(",")] for k, v in (p.split("=", 1) for p in args.pick)}
    record = ROOT / f"output/pixellab-anim-test/{args.hero}-attack-8dir"
    frames2x: dict[str, list[np.ndarray]] = {}
    for d in DIRS:
        gif = load_frames(src, d, args.tile)
        pick = picks.get(d, list(range(args.frames)))
        if len(pick) != args.frames or max(pick) >= len(gif):
            raise SystemExit(f"{d}: 要 {args.frames} 格，挑了 {pick}（GIF 有 {len(gif)} 格）")
        frames2x[d] = [gif[i] for i in pick]
        (record / d).mkdir(parents=True, exist_ok=True)
        for k, a in enumerate(frames2x[d]):
            Image.fromarray(a).save(record / d / f"{k:02d}.png")
        print(f"  {d:<10} {len(gif)} 格 → 用 {pick}")
    timing = {"frameTime": args.frame_time, "release": args.release, "impact": args.impact, "windupFrameTime": args.windup_frame_time,
              **{f: True for f in args.flag}}
    for lod in LOD:
        meta_p, png_p = HEROES / f"{args.hero}{lod['suffix']}.json", HEROES / f"{args.hero}{lod['suffix']}.png"
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        sheet = Image.open(png_p).convert("RGBA")
        step = lod["step"]
        cell = (args.cell2x if step == 1 else args.cell2x // 2) if args.cell2x else meta["actions"]["idle"]["cell"]
        foot = args.foot2x if step == 1 else args.foot2x // 2
        print(f"{png_p.name}: cell {cell}, 攻擊列 footFromBottom {foot}（待機 {meta['footFromBottom']}）")
        built = {}
        for d, act in DIRS.items():
            frs = [a[::step, ::step] for a in frames2x[d]]
            dx = round(cell / 2 - axis_x(frs[0]))
            dy = (cell - foot - 1) - bottom(frs[0])
            cells = []
            for f in frs:
                c = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                c.alpha_composite(Image.fromarray(f), (dx, dy))
                cells.append(np.asarray(c))
            lost = [k for k, f in enumerate(frs) if (f[..., 3] > 0).sum() != (cells[k][..., 3] > 0).sum()]
            edge = [k for k, a in enumerate(cells) if (lambda m: m[0].any() or m[-1].any() or m[:, 0].any() or m[:, -1].any())(a[..., 3] > 0)]
            print(f"    {act:<16} ← {d:<10} 位移 ({dx:+d},{dy:+d})  碰邊 {edge}  被格子切掉像素的格 {lost}")
            built[act] = cells
        width = max(sheet.width, cell * args.frames)
        height, place = sheet.height, {}
        for act in DIRS.values():
            row = meta["actions"].get(act)
            if row and row["cell"] == cell:
                place[act] = row["y"]
            else:
                place[act] = height
                height += cell
        out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        out.alpha_composite(sheet, (0, 0))
        for act in DIRS.values():
            y = place[act]
            out.paste((0, 0, 0, 0), (0, y, width, y + cell))
            for i, a in enumerate(built[act]):
                out.alpha_composite(Image.fromarray(a), (i * cell, y))
            meta["actions"][act] = {"y": y, "cell": cell, "frames": args.frames, "footFromBottom": foot,
                                    "head": heads(built[act], cell, foot, meta["heroHeight"]), **timing}
            print(f"    {'換掉' if y < sheet.height else '新增'} {act:<16} y={y}")
        print(f"  → {out.size}（原 {sheet.size}）")
        if args.dry_run:
            out.save(ROOT / f"output/pixellab-anim-test/{args.hero}{lod['suffix']}-attack8-preview.png")
            continue
        bk = ROOT / f"output/pixellab-anim-test/_backup_before_attack8_{args.hero}"
        bk.mkdir(exist_ok=True)
        for p in (meta_p, png_p):
            if not (bk / p.name).exists():
                shutil.copy2(p, bk / p.name)
        out.save(png_p)
        meta_p.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
