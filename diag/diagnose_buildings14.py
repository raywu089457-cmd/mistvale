"""診斷 mistvale 的 buildings14.png:現在的硬寫死切線到底切錯多少。

現況(src/pixel-world.js:171-173):
    sx = round((i%4)   * im.width /4)
    ex = round((i%4+1) * im.width /4)
    sy = round(rows[floor(i/4)]   * im.height)
    ey = round(rows[floor(i/4)+1] * im.height)
    rows = [0, .326, .66, 1]

也就是欄切在 1254/4 = 313.5 的倍數,列切在 409 / 828。
這裡量「洋紅去背後每個建築真正的 bbox」,看有沒有被切線切到。
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

SHEET = Path(r"C:\Users\ray\Documents\Codex\2026-09-29\new-chat\work\mistvale\assets\buildings14.png")
ROWS = [0, .326, .66, 1]
IDS = ['trading', 'restaurant', 'tavern', 'clinic',
       'forge', 'academy', 'training', 'sanctuary',
       'house', 'bounty', 'enhancement', 'dungeon']


def chroma_alpha(rgb: np.ndarray) -> np.ndarray:
    """跟遊戲同一條洋紅去背規則 (pixel-world.js:175)。"""
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    magenta = (r > 160) & (g < 130) & (b > 130) & (r > g * 1.5) & (b > g * 1.5)
    return ~magenta


def bbox(mask: np.ndarray):
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def main() -> None:
    im = Image.open(SHEET)
    print(f"圖檔 {SHEET.name}  {im.size}  mode={im.mode}")
    rgb = np.array(im.convert("RGB"))
    H, W = rgb.shape[:2]
    mask = chroma_alpha(rgb)

    # 洋紅覆蓋率(確認底色是乾淨的洋紅)
    print(f"非洋紅像素 {mask.sum()} / {H*W} ({mask.sum()/(H*W)*100:.1f}%)")

    # ── 找出「整條都是洋紅」的空隙帶 = 真正的格線 ─────────────────
    col_full = mask.all(axis=0)      # 每一欄是否全洋紅
    row_full = mask.all(axis=1)      # 每一列是否全洋紅

    def bands(flags: np.ndarray):
        out, start = [], None
        for i, v in enumerate(flags):
            if v and start is None:
                start = i
            elif not v and start is not None:
                out.append((start, i - 1)); start = None
        if start is not None:
            out.append((start, len(flags) - 1))
        return out

    print("\n=== 真正偵測到的空隙帶(= 格線位置)===")
    print("垂直空隙帶(切欄):", [f"{a}-{b}" for a, b in bands(col_full)])
    print("水平空隙帶(切列):", [f"{a}-{b}" for a, b in bands(row_full)])

    # ── 現在的硬寫死切線 ─────────────────────────────────────────
    print("\n=== 現在的切線 vs 真正的內容 ===")
    print(f"欄切線 x: {[round((i)*W/4) for i in range(5)]}   (W/4={W/4})")
    print(f"列切線 y: {[round(r*H) for r in ROWS]}   (均勻的話是 {[round(i*H/3) for i in range(4)]})")
    print()
    print(f"{'id':12s} {'現在 cell':>20s} {'真正 bbox':>20s}  裁切?")
    clipped = []
    for i, bid in enumerate(IDS):
        col, row = i % 4, i // 4
        sx, ex = round(col * W / 4), round((col + 1) * W / 4)
        sy, ey = round(ROWS[row] * H), round(ROWS[row + 1] * H)
        sub = mask[sy:ey, sx:ex]
        bb = bbox(sub)
        if bb is None:
            print(f"{bid:12s} {sx},{sy}-{ex},{ey}  空")
            continue
        gx0, gy0 = sx + bb[0], sy + bb[1]
        gx1, gy1 = sx + bb[2], sy + bb[3]
        touches = []
        if bb[0] == 0: touches.append("左")
        if bb[2] == sub.shape[1] - 1: touches.append("右")
        if bb[1] == 0: touches.append("上")
        if bb[3] == sub.shape[0] - 1: touches.append("下")
        flag = ("⚠ 被切到:" + "/".join(touches)) if touches else "ok"
        if touches:
            clipped.append((bid, touches))
        print(f"{bid:12s} {sx},{sy}-{ex},{ey}  "
              f"({ex-sx}x{ey-sy})   ({gx1-gx0+1}x{gy1-gy0+1})  {flag}")

    print(f"\n=== 結論 ===")
    print(f"12 格中有 {len(clipped)} 格被切線切到:")
    for bid, t in clipped:
        print(f"  ⚠ {bid}: {t} 邊被切")

    # ── 建議的 manifest ─────────────────────────────────────────
    print("\n=== 建議的 manifest(逐格精確 rect)===")
    cells = {}
    for i, bid in enumerate(IDS):
        col, row = i % 4, i // 4
        sx, ex = round(col * W / 4), round((col + 1) * W / 4)
        sy, ey = round(ROWS[row] * H), round(ROWS[row + 1] * H)
        sub = mask[sy:ey, sx:ex]
        bb = bbox(sub)
        if bb is None:
            continue
        cells[bid] = {
            "x": sx + bb[0], "y": sy + bb[1],
            "w": bb[2] - bb[0] + 1, "h": bb[3] - bb[1] + 1,
        }
    print(json.dumps({"sheet": SHEET.name, "sheetWidth": W, "sheetHeight": H,
                      "cells": cells}, ensure_ascii=False, indent=1)[:900])


if __name__ == "__main__":
    main()
