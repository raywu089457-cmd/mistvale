#!/usr/bin/env python3
"""align_frames.py — 把一串動作幀對齊到同一個錨點（並可選做像素化/共用調色盤）。

移植自 gykim80/perfectpixel-studio 的 `internal/sprite/pixelize.go`（MIT）三個做法：
  1. DetectPixelScale — AI 生的「假像素圖」實際的方塊邊長 = 同色連續長度的加權眾數（unfake.js 技法）
  2. Pixelize — 每 scale×scale 區塊取主色（區塊過半透明就留空），把圖真的吸附到像素格
  3. PixelPostProcess — 同一個動作的所有幀**共用一個調色盤**（避免幀與幀之間顏色漂移）、
     並且共用**中位數的方塊邊長**（避免每幀格線不一致）
另外補上它 demo 裡的質心對齊：每幀用「不透明區域的質心 X + 最低點（腳底）」當錨點，
把整幀平移對齊 —— 這是解決「錨點每幀亂抖」的關鍵。

用法:
    python align_frames.py --dir output/pixellab-anim-test/archer-bow-east/east --out /tmp/aligned
    python align_frames.py --dir <frames> --out <dir> --pixelize auto --palette 32 --anchor centroid
"""
from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

from PIL import Image

ALPHA_THRESHOLD = 8


def _rgb(img: Image.Image):
    return img.convert("RGBA").load(), img.size


def detect_pixel_scale(img: Image.Image, max_scale: int = 32) -> int:
    """同色連續長度的加權眾數（perfectpixel DetectPixelScale 的移植）。"""
    px, (w, h) = _rgb(img)
    if w < 32 or h < 32:
        return 1
    limit = max(2, min(max_scale, min(w, h) // 8))
    hist = [0] * (limit + 1)

    def near(a, b):
        return all(abs(a[i] - b[i]) <= 12 for i in range(3))

    for outer, inner, get in ((h, w, lambda o, i: px[i, o]), (w, h, lambda o, i: px[o, i])):
        for o in range(outer):
            run = 1
            prev = get(o, 0)
            for i in range(1, inner):
                cur = get(o, i)
                same = (cur[3] <= ALPHA_THRESHOLD and prev[3] <= ALPHA_THRESHOLD) or (
                    cur[3] > ALPHA_THRESHOLD and prev[3] > ALPHA_THRESHOLD and near(cur, prev)
                )
                if same:
                    run += 1
                else:
                    if 2 <= run <= limit:
                        hist[run] += 1
                    run = 1
                prev = cur
    best, best_weight = 1, 0
    for scale in range(2, limit + 1):
        if hist[scale] * scale > best_weight:
            best, best_weight = scale, hist[scale] * scale
    return best if best >= 2 else 1


def pixelize(img: Image.Image, scale: int) -> Image.Image:
    """每個 scale×scale 區塊取主色；區塊過半透明就留透明（perfectpixel Pixelize 的移植）。"""
    if scale < 2:
        return img
    src = img.convert("RGBA")
    px = src.load()
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    for by in range(0, h, scale):
        for bx in range(0, w, scale):
            bw, bh = min(scale, w - bx), min(scale, h - by)
            counts: Counter = Counter()
            opaque = 0
            for dy in range(bh):
                for dx in range(bw):
                    r, g, b, a = px[bx + dx, by + dy]
                    if a <= ALPHA_THRESHOLD:
                        continue
                    opaque += 1
                    counts[(r, g, b)] += 1
            if opaque * 2 < bw * bh or not counts:
                continue
            (r, g, b), _ = counts.most_common(1)[0]
            for dy in range(bh):
                for dx in range(bw):
                    dst[bx + dx, by + dy] = (r, g, b, 255)
    return out


def shared_palette(frames: list[Image.Image], size: int) -> list[tuple[int, int, int]]:
    """所有幀一起做中位切分（median cut）取共用調色盤（perfectpixel BuildSharedPalette 的簡化版）。"""
    pixels: list[tuple[int, int, int]] = []
    for frame in frames:
        px = frame.convert("RGBA").load()
        w, h = frame.size
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                r, g, b, a = px[x, y]
                if a > ALPHA_THRESHOLD:
                    pixels.append((r, g, b))
    if not pixels:
        return []
    boxes = [pixels]
    while len(boxes) < size:
        boxes.sort(key=len, reverse=True)
        box = boxes.pop(0)
        if len(box) < 2:
            boxes.append(box)
            break
        channel = max(range(3), key=lambda c: max(p[c] for p in box) - min(p[c] for p in box))
        box.sort(key=lambda p: p[channel])
        mid = len(box) // 2
        boxes.extend([box[:mid], box[mid:]])
    return [tuple(sum(p[c] for p in box) // len(box) for c in range(3)) for box in boxes if box]


def apply_palette(img: Image.Image, palette: list[tuple[int, int, int]]) -> Image.Image:
    """套用共用調色盤，alpha 二值化（perfectpixel ApplyPaletteBinarizesAlpha 的行為）。"""
    if not palette:
        return img
    src = img.convert("RGBA")
    px = src.load()
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= ALPHA_THRESHOLD:
                continue
            best = min(palette, key=lambda p: (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2)
            dst[x, y] = (best[0], best[1], best[2], 255)
    return out


def anchor_of(img: Image.Image, mode: str = "centroid") -> tuple[float, int]:
    """錨點：質心 X（預設）或底部帶重心 X；Y 一律取最低不透明像素（腳底）。"""
    px = img.convert("RGBA").load()
    w, h = img.size
    xs, ys, total = 0, 0, 0
    bottom = -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > ALPHA_THRESHOLD:
                xs += x
                ys += y
                total += 1
                bottom = max(bottom, y)
    if not total:
        return w / 2, h - 1
    if mode == "bottom":
        band = [x for y in range(max(0, bottom - 6), bottom + 1) for x in range(w) if px[x, y][3] > ALPHA_THRESHOLD]
        return (sum(band) / len(band) if band else xs / total), bottom
    return xs / total, bottom


def align_frames(frames: list[Image.Image], mode: str = "centroid", pad: int = 2) -> list[Image.Image]:
    """把每一幀平移到共用的錨點（畫布取所有幀的最大範圍，錨點放在畫布中央偏下）。"""
    anchors = [anchor_of(f, mode) for f in frames]
    max_w = max(f.width for f in frames)
    max_h = max(f.height for f in frames)
    width, height = max_w + pad * 2, max_h + pad * 2
    target_x, target_bottom = width / 2, height - pad - 1
    out = []
    for frame, (cx, bottom) in zip(frames, anchors):
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(frame, (round(target_x - cx), round(target_bottom - bottom)))
        out.append(canvas)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="把動作幀對齊到同一個錨點（可選像素化/共用調色盤）")
    parser.add_argument("--dir", required=True, help="輸入資料夾（*.png，依檔名排序）")
    parser.add_argument("--out", required=True)
    parser.add_argument("--anchor", default="centroid", choices=("centroid", "bottom"))
    parser.add_argument("--pixelize", default="off", help="off | auto | 整數方塊邊長")
    parser.add_argument("--palette", type=int, default=0, help="共用調色盤色數（0 = 不量化）")
    args = parser.parse_args()

    paths = sorted(Path(args.dir).glob("*.png"))
    if not paths:
        raise SystemExit(f"沒有 PNG：{args.dir}")
    frames = [Image.open(p).convert("RGBA") for p in paths]
    print(f"讀入 {len(frames)} 幀，尺寸 {frames[0].size}")

    if args.pixelize != "off":
        scales = [detect_pixel_scale(f) for f in frames]
        scale = sorted(scales)[len(scales) // 2] if args.pixelize == "auto" else int(args.pixelize)
        print(f"偵測到的方塊邊長 {scales} → 共用中位數 {scale}")
        if scale >= 2:
            frames = [pixelize(f, scale) for f in frames]
    if args.palette > 0:
        palette = shared_palette(frames, args.palette)
        print(f"共用調色盤 {len(palette)} 色")
        frames = [apply_palette(f, palette) for f in frames]

    aligned = align_frames(frames, args.anchor)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(aligned):
        frame.save(out_dir / f"{i:02d}.png")
    print(f"輸出 {len(aligned)} 幀 → {out_dir}（錨點 {args.anchor}，畫布 {aligned[0].size}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
