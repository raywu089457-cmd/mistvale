"""sprite_out.py — 把已經生好的圖轉成去背 sprite（可批次）。

它是 pixelize.py 的薄殼，差別是：
  * 支援 batch / wildcard
  * 支援舊版的三個位置參數寫法（相容 PIXELART_README 的舊指令）
  * 輸出尺寸統一，方便排 sprite sheet

用法：
  # 新寫法
  venv\\Scripts\\python.exe sprite_out.py -i "output/raw/*_512.png" -o output/sprite --res 64 --colors 32

  # 舊寫法（還是可以用）
  venv\\Scripts\\python.exe sprite_out.py in.png out.png out_preview.png
"""
from __future__ import annotations

import glob
import os
import re
import sys

import numpy as np
from PIL import Image

import pixelize


def run_legacy(argv: list[str]) -> int:
    src, out1x, outprev = argv
    im = Image.open(src)
    sprite, bg = pixelize.make_sprite(im, res=64, colors=32, canvas=64)

    os.makedirs(os.path.dirname(os.path.abspath(out1x)), exist_ok=True)
    sprite.save(out1x)
    pixelize.preview(sprite).save(outprev)

    px = int((np.asarray(sprite)[:, :, 3] > 0).sum())
    print(f"background: {bg}")
    print(f"opaque pixels: {px}/{sprite.size[0] ** 2} "
          f"({px * 100 // (sprite.size[0] ** 2)}%)")
    print(f"wrote {out1x} {sprite.size} and {outprev}")
    return 0


def main(argv: list[str]) -> int:
    # 舊版相容：剛好三個位置參數，而且第三個是預覽檔
    if len(argv) == 3 and argv[2].endswith("_preview.png"):
        return run_legacy(argv)

    import argparse

    ap = argparse.ArgumentParser(
        prog="sprite_out.py",
        description="把圖去背轉成 sprite（批次、固定尺寸）",
    )
    ap.add_argument("-i", "--inputs", nargs="+", required=True,
                    help="輸入圖或 wildcard")
    ap.add_argument("-o", "--outdir", default="output/sprite")
    ap.add_argument("--res", type=int, default=64, help="1x 長邊像素數（預設 64）")
    ap.add_argument("--colors", type=int, default=32, help="調色盤上限，0 = 不減色")
    ap.add_argument("--canvas", type=int, default=None, help="統一出圖尺寸，預設 = --res")
    ap.add_argument("--tol", type=float, default=70.0, help="背景色容差")
    ap.add_argument("--pad", type=int, default=0)
    ap.add_argument("--anchor", choices=["bottom", "center"], default="bottom")
    ap.add_argument("--resample", choices=["box", "nearest", "lanczos"], default="box")
    ap.add_argument("--strip", default=r"_\d{3,4}$",
                    help="從檔名尾巴去掉的字串（regex）。預設去掉 _512 這種解析度標記")
    ap.add_argument("--no-strip", action="store_true", help="不要動檔名")
    ap.add_argument("--force", action="store_true",
                    help="輸入已去過背時，強制重新去背（一般不需要；預設會沿用既有透明通道）")
    ap.add_argument("--no-preview", action="store_true")
    a = ap.parse_args(argv)

    files: list[str] = []
    for pat in a.inputs:
        files.extend(sorted(glob.glob(pat)) or [pat])
    if not files:
        print("找不到輸入檔")
        return 1

    resample = {"box": Image.BOX, "nearest": Image.NEAREST,
                "lanczos": Image.LANCZOS}[a.resample]
    canvas = a.canvas if a.canvas is not None else a.res
    os.makedirs(a.outdir, exist_ok=True)

    sizes = set()
    strip_re = None if a.no_strip else re.compile(a.strip)
    for f in files:
        try:
            im = Image.open(f)
        except Exception as e:
            print(f"跳過 {f}：{e}")
            continue

        reused = pixelize.make_sprite_uses_alpha(im, a.force)
        sprite, bg = pixelize.make_sprite(
            im, res=a.res, colors=a.colors, canvas=canvas,
            tol=a.tol, pad=a.pad, anchor=a.anchor, resample=resample,
            alpha_mode="key" if a.force else "auto",
        )
        stem = os.path.splitext(os.path.basename(f))[0]
        if strip_re:
            stem = strip_re.sub("", stem)
        out1x = os.path.join(a.outdir, f"{stem}.png")
        sprite.save(out1x)
        if not a.no_preview:
            pixelize.preview(sprite).save(os.path.join(a.outdir, f"{stem}_preview.png"))

        sizes.add(sprite.size)
        px = int((np.asarray(sprite)[:, :, 3] > 0).sum())
        info = "沿用既有透明" if reused else f"bg={bg}"
        print(f"{stem:26s} {info}  ->  {sprite.size}  {px} px "
              f"({px * 100 // (canvas * canvas)}%)")

    if not sizes:
        print("沒有任何產出")
        return 1
    if len(sizes) == 1:
        print(f"\n✓ {len(files)} 張全部 {sizes.pop()}")
    else:
        print(f"\n✗ 尺寸不一致：{sizes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
