"""sheet_to_atlas.py — 把 l0veyou（GPT Image 2）生的洋紅底 sprite sheet 轉成遊戲圖集。

流程：洋紅底色鍵去背（沿用 comfyui/pixelize.chroma_alpha）→ 連通區塊依格線分組
→ 每格裁切 → 排成 @2x 圖集 → LANCZOS 離線縮成 @1x → 寫 sprite-gen manifest。

manifest 格式跟 details@1x/@2x 相同（cells: {id: {x,y,w,h,anchor}}，@1x 帶 scale:0.5），
所以 pixel-world.js 的 drawAtlasDetail() 不用改就能吃。

用法：
  python pipeline/scripts/l0veyou/sheet_to_atlas.py <sheet.png|jpg> <out-prefix> <cols>x<rows> id1,id2,...
  （id 依「左到右、上到下」；填 - 表示該格略過）
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "comfyui"))
from pixelize import border_bg, chroma_alpha  # noqa: E402

ROOT = HERE.parents[2]
ASSETS = ROOT / "assets"


def key_out(im: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    rgb = np.asarray(im.convert("RGB"))
    bg = border_bg(im)
    # JPEG 壓縮的洋紅底會飄（實測約 247,12,227），容差要比 PNG 寬。
    # HUE_TOL：表裡有粉紅色（粉花）時要調窄，不然花瓣會被當成洋紅背景吃掉。
    hue_tol = float(os.environ.get("HUE_TOL", "32"))
    out, key_alpha = chroma_alpha(rgb, bg, tol=80.0, soft=30.0, flood=False, hue_tol=hue_tol)
    key = 1.0 - key_alpha
    r, g_, b = [rgb[..., i].astype(int) for i in range(3)]
    # 模型會在物件腳下畫一塊深紫影子（藍 >= 紅、綠很低）：跟背景連通才算背景。
    # 粉花是紅 >> 藍、藍花是紅 < 綠，都不會被這條吃掉。
    shadow = (b > g_ + 40) & (r > g_ + 30) & (b >= r - 10) & (g_ < 90)
    if os.environ.get("NO_SHADOW"):  # 表裡有紫色主體（法球）又沒有影子時關掉，不然紫球會被當影子吃掉
        shadow[:] = False
    cand = (key > 0.5) | shadow
    key = np.where(cand, np.maximum(key, 1.0), key)
    # 跟畫面邊界連通的背景才算背景（主體身上的紫/粉色不會被吃掉）
    lab, _ = ndimage.label(key > 0.5)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    reach = np.isin(lab, list(border))
    dist = np.sqrt(((rgb.astype(np.float32) - np.array(bg, np.float32)) ** 2).sum(2))
    strong = dist < 40
    bgmask = (reach & (key > 0.5)) | strong
    alpha = (~bgmask).astype(np.uint8) * 255
    # 被主體圍住的洋紅洞（木桶縫、旗面邊）flood 摸不到：用色相再清一次。
    # 門檻刻意窄：紅旗（b 低）、藍旗（r 低）、粉花（g 高）都不會中。
    magenta = (r > 140) & (b > 120) & (g_ < 100) & (r - g_ > 90) & (b - g_ > 70) & (np.abs(r - b) < 70)
    if not os.environ.get("NO_HOLES"):  # 表裡沒有被包住的洋紅洞、又有紫色主體時關掉
        alpha[magenta] = 0
    # 去除邊緣殘留的洋紅色暈：一圈內收
    alpha = ndimage.binary_erosion(alpha > 0, iterations=1).astype(np.uint8) * 255
    # alpha 是硬邊，留下來的都是完全不透明的主體像素 → 用原色。despill 只對半透明邊有意義，
    # 套在不透明像素上反而會把粉紅花瓣算出綠色雜點。
    return rgb.copy(), alpha


def magenta_left(rgba: np.ndarray) -> int:
    r, g, b, a = [rgba[..., i].astype(int) for i in range(4)]
    return int(((a > 0) & (r > 200) & (b > 180) & (g < 80)).sum())


def main(argv: list[str]) -> int:
    src, prefix, grid, ids = argv[1], argv[2], argv[3], argv[4].split(",")
    cols, rows = map(int, grid.lower().split("x"))
    assert len(ids) == cols * rows, f"需要 {cols*rows} 個 id，拿到 {len(ids)}"
    im = Image.open(src)
    W, H = im.size
    rgb, alpha = key_out(im)

    lab, n = ndimage.label(alpha > 0)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    # 模型不會把格線排滿整張圖（常常下方留白），所以格線以「內容外框」切，不用整張圖。
    min_px = int(os.environ.get("MIN_PX", "30"))  # <30 是 JPEG 雜點；魔物表的飄葉要更大門檻
    keep = [i for i, sz in enumerate(sizes, start=1) if sz >= min_px]
    objs = ndimage.find_objects(lab)
    cents = ndimage.center_of_mass(np.ones_like(lab), lab, keep)
    big = [i for i in keep if sizes[i - 1] >= 800]
    bx0 = min(objs[i - 1][1].start for i in big); bx1 = max(objs[i - 1][1].stop for i in big)
    by0 = min(objs[i - 1][0].start for i in big); by1 = max(objs[i - 1][0].stop for i in big)
    cells: dict[int, list[int]] = {}
    for i, (cy, cx) in zip(keep, cents):
        c = int(np.clip((cx - bx0) / ((bx1 - bx0) / cols), 0, cols - 1))
        r = int(np.clip((cy - by0) / ((by1 - by0) / rows), 0, rows - 1))
        cells.setdefault(r * cols + c, []).append(i)

    rgba = np.dstack([rgb, alpha])
    crops: dict[str, Image.Image] = {}
    clipped: list[str] = []
    for idx, name in enumerate(ids):
        if name == "-":
            continue
        comps = cells.get(idx)
        if not comps:
            print(f"WARN 第 {idx} 格（{name}）沒偵測到物件")
            continue
        m = np.isin(lab, comps)
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        # 物件碰到圖邊 = 被模型畫出畫布外、切平了（實測 1:1 的 4x2 表，寬物件常被切）。
        # key_out 最後內收 1px（圖邊那一圈也會被收掉），所以「碰邊」是距邊 ≤1px。
        if x0 <= 1 or y0 <= 1 or x1 >= W - 1 or y1 >= H - 1:
            clipped.append(name)
        piece = rgba[y0:y1, x0:x1].copy()
        piece[..., 3] = np.where(m[y0:y1, x0:x1], piece[..., 3], 0)
        crops[name] = Image.fromarray(piece, "RGBA")
    # 被切到的物件不能用：直接中止、不寫圖集，換比例（4 欄用 16:9）重生。ALLOW_EDGE=1 可略過。
    if clipped and not os.environ.get("ALLOW_EDGE"):
        print(f"FAIL 物件碰到圖邊（被切掉）：{','.join(clipped)}——重生這張表，未寫入任何檔案")
        return 3

    # STRIP_IDS=name:N：把「正面、可水平拼接」的欄杆段（左柱＋往右的橫桿）接成 N 段長條，
    # 再剪切成等角斜向（往右每 1px 下降 0.5px，對上 iso 的 9:4.5）。遊戲每個欄杆裝飾
    # 只畫長條的一小段，所以柱距不受「一格世界單位」限制，比例也不用壓扁。
    # 剪切只位移 y：第 x 欄的柱腳在 frontH + x*0.5。
    extra: dict[str, dict] = {}
    for spec in [t for t in os.environ.get("STRIP_IDS", "").split(",") if t]:
        name, n_tiles = spec.split(":")
        if name not in crops:
            continue
        c = np.asarray(crops[name])
        h, w = c.shape[:2]
        cov = (c[..., 3] > 0).sum(0)
        post_w = int(np.argmax(cov < cov.max() * 0.8))  # 左柱寬：覆蓋率掉下來的第一欄
        strip = np.concatenate([c] * int(n_tiles) + [c[:, :post_w]], axis=1)  # 尾端補一根柱子
        sw = strip.shape[1]
        out = np.zeros((h + (sw + 1) // 2, sw, 4), np.uint8)
        for x in range(sw):
            out[x // 2:x // 2 + h, x] = strip[:, x]
        crops[name] = Image.fromarray(out, "RGBA")
        extra[name] = {"shear": 0.5, "frontH": h, "tileW": w, "postW": post_w}

    # @2x：原尺寸（1024 sheet 上的物件約 150~250px），@1x：LANCZOS 縮半後硬化 alpha
    for scale_tag, factor in (("2x", 1.0), ("1x", 0.5)):
        pieces = {}
        for k, c in crops.items():
            if factor != 1.0:
                w, h = max(1, round(c.width * factor)), max(1, round(c.height * factor))
                c = c.resize((w, h), Image.LANCZOS)
                a = np.asarray(c).copy()
                a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
                c = Image.fromarray(a, "RGBA")
            pieces[k] = c
        # 書架式排版：每塊只佔自己的寬度（長條欄杆才不會把每一格都撐大）。
        pad = 4
        row_w = max(1024 if factor == 1.0 else 512, max(p.width for p in pieces.values()) + pad)
        places, x, y, shelf_h, sheet_w = {}, 0, 0, 0, 0
        for k, p in pieces.items():
            if x and x + p.width + pad > row_w:
                x, y, shelf_h = 0, y + shelf_h, 0
            places[k] = (x, y)
            x += p.width + pad
            shelf_h = max(shelf_h, p.height + pad)
            sheet_w = max(sheet_w, x)
        sheet = Image.new("RGBA", (sheet_w, y + shelf_h), (0, 0, 0, 0))
        cw = ch = acols = arows = 0  # 書架排版沒有固定格；manifest 只看 cells
        man_cells = {}
        for k, p in pieces.items():
            x, y = places[k]
            sheet.alpha_composite(p, (x, y))
            man_cells[k] = {"x": x, "y": y, "w": p.width, "h": p.height,
                            "anchor": [x + p.width / 2, y + p.height]}
            if k in extra:  # 剪切資訊換算到這一級 LOD 的座標
                e = extra[k]
                man_cells[k].update(shear=e["shear"], frontH=round(e["frontH"] * factor),
                                    tileW=round(e["tileW"] * factor), postW=round(e["postW"] * factor))
        leak = magenta_left(np.asarray(sheet))
        out_png = ASSETS / f"{prefix}@{scale_tag}.png"
        sheet.save(out_png, optimize=True)
        man = {"version": 1, "kind": f"mistvale-{prefix}-atlas", "image": out_png.name,
               "sheetWidth": sheet.width, "sheetHeight": sheet.height, "packing": "shelf", "source": Path(src).name,
               "sourceSheet": [W, H], "chromaKey": "#FF00FF", "generator": "l0veyou.com GPT Image 2",
               "cells": man_cells}
        if factor == 0.5:
            man["scale"] = 0.5
        (ASSETS / f"{prefix}@{scale_tag}.manifest.json").write_text(
            json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{out_png.name}: {sheet.width}x{sheet.height}, {len(pieces)} cells, magenta殘留={leak}")
    for k, c in crops.items():
        print(f"  {k}: {c.width}x{c.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
