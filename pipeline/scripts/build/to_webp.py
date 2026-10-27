"""to_webp.py — 把出貨用的 PNG 轉一份無損 WebP（同資料夾同名 .webp）。

    python pipeline/scripts/build/to_webp.py            # 只轉新的/改過的
    python pipeline/scripts/build/to_webp.py --force    # 全部重轉

為什麼：這些 sprite sheet 有大片透明區，PNG 的 zlib 壓不掉，無損 WebP 只要 **13–15%** 的大小
（實測 yeti 456 KB → 60 KB、kobold 218 KB → 34 KB）。畫素是完全一樣的（lossless），
只是換容器。build.mjs 會優先用 .webp，沒有才退回 .png。

來源（PNG）留著：其他工具（audit / pipeline 腳本）讀的是 PNG。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
DIRS = ["assets/heroes", "assets/monsters3", "assets/xilurus", "assets", "assets/atlas"]
SKIP = ("_pre_newpipe", "_prev8dir", "media")


def targets(force: bool):
    seen = set()
    for d in DIRS:
        for p in sorted((ROOT / d).glob("*.png")):
            if any(s in p.parts for s in SKIP) or p in seen:
                continue
            seen.add(p)
            out = p.with_suffix(".webp")
            if not force and out.exists() and out.stat().st_mtime >= p.stat().st_mtime:
                continue
            yield p, out


def main() -> None:
    force = "--force" in sys.argv
    n = 0
    before = after = 0
    for src, dst in targets(force):
        im = Image.open(src)
        im.save(dst, "WEBP", lossless=True, quality=100, method=6)
        n += 1
        before += src.stat().st_size
        after += dst.stat().st_size
    print(f"{n} webp, {before/1e6:.1f} MB png → {after/1e6:.1f} MB webp")


if __name__ == "__main__":
    main()
