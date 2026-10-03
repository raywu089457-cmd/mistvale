"""make_plaza_tile.py — l0veyou 生的石板路材質 → 遊戲用的無縫廣場磚 assets/plaza.png。

1. 色調對齊：逐通道把平均／標準差配到 title.png（登入概念圖）廣場取樣值。
2. 無縫：把圖平移半格，再用十字遮罩把原圖接縫處交叉淡入。
3. LANCZOS 離線縮到 256（遊戲裡 1:1 pattern 貼上，不在瀏覽器縮）。

用法：python pipeline/scripts/l0veyou/make_plaza_tile.py output/l0veyou/cobble-v1.jpg
      python pipeline/scripts/l0veyou/make_plaza_tile.py output/l0veyou/dirt-v1.jpg road 205,158,78 26,24,30
      （第二個參數起：輸出名、目標平均、目標標準差；土路取樣自 title.png 小路）
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
# 概念圖廣場三個取樣點 (450,450)/(700,700)/(820,560) 的 60x60 平均
TARGET_MEAN = np.array([209.0, 179.0, 150.0])
TARGET_STD = np.array([34.0, 32.0, 29.0])
SIZE = 256


def main(src: str, name: str = "plaza", mean=TARGET_MEAN, std=TARGET_STD) -> None:
    a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    flat = a.reshape(-1, 3)
    a = (a - flat.mean(0)) / flat.std(0) * np.asarray(std, np.float32) + np.asarray(mean, np.float32)
    a = np.clip(a, 0, 255)

    h, w, _ = a.shape
    shifted = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    # 權重：原圖在中央為 1、靠邊為 0；平移圖反之 → 兩張的接縫都被對方蓋住
    ramp = lambda n: np.clip(np.minimum(np.arange(n), n - 1 - np.arange(n)) / (n * 0.18), 0, 1)
    wgt = np.minimum.outer(ramp(h), ramp(w))[..., None]
    out = a * wgt + shifted * (1 - wgt)

    img = Image.fromarray(out.astype(np.uint8), "RGB").resize((SIZE, SIZE), Image.LANCZOS)
    dst = ROOT / "assets" / f"{name}.png"
    img.save(dst, optimize=True)
    print(f"{dst.name}: {SIZE}x{SIZE}, mean={np.asarray(img).reshape(-1,3).mean(0).round()}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) >= 4:
        main(args[0], args[1], [float(v) for v in args[2].split(",")], [float(v) for v in args[3].split(",")])
    else:
        main(args[0])
