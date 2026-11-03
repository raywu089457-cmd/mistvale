"""clean_edge_fx.py — 刪掉攻擊動畫裡「被圖框切掉」的特效（法師魔法球／光束飛出 256 畫布邊緣，只剩半顆或一截）。

    python pipeline/scripts/pixellab/clean_edge_fx.py --src output/pixellab-incoming/sorcerer-attack-8dir/named \
        --out output/pixellab-incoming/sorcerer-attack-8dir/named-clean
    再用 add_attack_rows_gif.py --src …/named-clean 重接攻擊列（同樣參數，見該檔紀錄）。

2026-10-25 使用者：「法師攻擊動畫的魔法球刪除被圖框遮住的部分」。
做法（每個方向 spritesheet 的每一格）：
- 特效像素＝顏色判斷：色相 245–335°、飽和度 ≥ 0.7（亮紫／粉紫／深紫外框），或幾乎全白（亮度 ≥ 0.95）。
  身體是膚色（色相 0–40°）跟低飽和的深藍紫法袍，不會被判成特效（量過：東北第 5 格光束 vs 身體的顏色表）。
- 特效像素的連通塊（8 鄰接）只要碰到畫布邊緣就整塊刪掉；沒碰邊的（手上的球、還在畫面裡飛的球）不動。
- 有刪東西的格，再清掉跟身體分開、小於 30 px 的殘渣（光束邊上的膚色光暈等）。
- 另外，任何跟身體分開、又碰到畫布邊緣的小塊（< 200 px，顏色不像特效的光束尾端碎片，例：西北第 7 格左緣、北第 7 格上緣）也刪。
來源只讀，輸出到 --out（檔名照舊），印出每一格刪了多少像素。
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
TILE = 256


def fx_mask(t: np.ndarray) -> np.ndarray:
    rgb = t[..., :3].astype(float) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    l = (mx + mn) / 2
    d = mx - mn
    s = np.where(d == 0, 0, d / (1 - np.abs(2 * l - 1) + 1e-9))
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, (g - b) / (d + 1e-9) % 6, np.where(mx == g, (b - r) / (d + 1e-9) + 2, (r - g) / (d + 1e-9) + 4)) * 60
    return (t[..., 3] > 0) & ((((h >= 245) & (h <= 335)) & (s >= .7)) | (l >= .95))


def clean_tile(t: np.ndarray) -> tuple[np.ndarray, int]:
    m = fx_mask(t)
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    out = t.copy()
    if edge:
        out[np.isin(lab, list(edge))] = 0
    # 跟身體分開、碰到邊緣的小碎片（不管顏色）
    al = out[..., 3] > 0
    lab1, n1 = ndimage.label(al, structure=np.ones((3, 3)))
    if n1 > 1:
        sizes = ndimage.sum(al, lab1, range(1, n1 + 1))
        body = int(np.argmax(sizes)) + 1
        border = set(np.unique(np.concatenate([lab1[0], lab1[-1], lab1[:, 0], lab1[:, -1]]))) - {0, body}
        for k in border:
            if sizes[k - 1] < 200:
                out[lab1 == k] = 0
                edge.add(-k)
    if not edge:
        return t, 0
    # 殘渣：跟身體（最大塊）分開、< 30 px 的小塊
    al = out[..., 3] > 0
    lab2, n2 = ndimage.label(al, structure=np.ones((3, 3)))
    if n2 > 1:
        sizes = ndimage.sum(al, lab2, range(1, n2 + 1))
        body = int(np.argmax(sizes)) + 1
        for k in range(1, n2 + 1):
            if k != body and sizes[k - 1] < 30:
                out[lab2 == k] = 0
    return out, int((t[..., 3] > 0).sum() - (out[..., 3] > 0).sum())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    src, out = ROOT / args.src, ROOT / args.out
    out.mkdir(parents=True, exist_ok=True)
    for p in sorted(src.glob("*.png")):
        a = np.asarray(Image.open(p).convert("RGBA")).copy()
        msg = []
        for y in range(0, a.shape[0], TILE):
            for x in range(0, a.shape[1], TILE):
                t, n = clean_tile(a[y:y + TILE, x:x + TILE])
                if n:
                    a[y:y + TILE, x:x + TILE] = t
                    msg.append(f"第 {(y // TILE) * (a.shape[1] // TILE) + x // TILE} 格 −{n} px")
        Image.fromarray(a).save(out / p.name)
        print(f"{p.stem:<11} {'、'.join(msg) or '沒有碰邊的特效'}")


if __name__ == "__main__":
    main()
