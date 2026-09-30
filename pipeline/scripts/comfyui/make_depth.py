"""make_depth.py — 產生 ControlNet 用的深度圖。

為什麼需要這個：
    純文字生圖（text-to-image）控制不住 Mistvale 的 3/4 俯視角度 —— 提示詞寫滿
    isometric / three-quarter 也沒用。ControlNet-depth 可以把「攝影機角度」鎖死：
    先從一張標準的 3/4 建築算出深度圖，之後每一張生圖都吃同一張深度圖，
    角度就永遠一致，但建築造型可以完全不同。

用 Depth Anything V2 Small（transformers 版，約 100MB），不需要額外套件。

用法：
    venv\\Scripts\\python.exe make_depth.py input/mistvale_init_tavern.png
    venv\\Scripts\\python.exe make_depth.py --batch input/mistvale_init_*.png --outdir projects/mistvale/depth
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

import numpy as np
import torch
from PIL import Image

MODEL_DIR = "aux_models/depth-anything-v2-small"


def load_model():
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    if not os.path.isdir(MODEL_DIR):
        raise SystemExit(
            f"找不到深度模型 {MODEL_DIR}\n"
            "先跑：\n"
            "  venv\\Scripts\\python.exe -c \"from huggingface_hub import snapshot_download; "
            "snapshot_download('depth-anything/Depth-Anything-V2-Small-hf', "
            "local_dir='aux_models/depth-anything-v2-small')\""
        )
    proc = AutoImageProcessor.from_pretrained(MODEL_DIR)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_DIR)
    model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return proc, model.to(device), device


def depth_map(proc, model, device, im: Image.Image, invert: bool = True,
              mask_magenta: bool = True, bg_value: int = 0) -> Image.Image:
    """回傳 8-bit 灰階深度圖。

    invert=True 讓「近的」變亮（白）—— ControlNet-depth 的慣例是白的在近處。
    mask_magenta: Depth Anything 沒有「背景」這個概念，洋紅底會被估成一片中灰色，
                   ControlNet 會把它當成真的幾何去生東西。所以先把洋紅區遮成 bg_value。
    """
    im = im.convert("RGB")
    inputs = proc(images=im, return_tensors="pt").to(device)
    with torch.no_grad():
        out = model(**inputs).predicted_depth
    d = torch.nn.functional.interpolate(
        out.unsqueeze(1), size=im.size[::-1], mode="bicubic", align_corners=False
    )[0, 0]
    d = d.detach().cpu().numpy()
    d = (d - d.min()) / max(d.max() - d.min(), 1e-6)
    if invert:
        d = 1.0 - d

    if mask_magenta:
        a = np.asarray(im).astype(np.int16)
        mag = (np.abs(a - np.array([255, 0, 255])).max(2) < 110)
        # 稍微往外長一點，把邊緣的抗鋸齒也算進去
        from scipy import ndimage
        mag = ndimage.binary_dilation(mag, np.ones((5, 5)), iterations=2)
        d[mag] = bg_value / 255.0

    return Image.fromarray((d * 255).astype(np.uint8), "L")


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="產生 ControlNet 深度圖")
    ap.add_argument("inputs", nargs="+", help="輸入圖或 wildcard")
    ap.add_argument("-o", "--outdir", default="projects/mistvale/depth")
    ap.add_argument("--size", type=int, default=1024, help="輸出邊長（正方形補洋紅）")
    ap.add_argument("--no-invert", action="store_true", help="不要反轉（近=暗）")
    ap.add_argument("--keep-bg", action="store_true", help="不要把洋紅底遮成黑")
    ap.add_argument("--preview", action="store_true", help="順便存一張彩色預覽")
    a = ap.parse_args()

    files: list[str] = []
    for pat in a.inputs:
        files.extend(sorted(glob.glob(pat)) or [pat])
    if not files:
        print("找不到輸入檔")
        return 1

    proc, model, device = load_model()
    print(f"深度模型就緒（{device}）")
    os.makedirs(a.outdir, exist_ok=True)

    for f in files:
        im = Image.open(f)
        d = depth_map(proc, model, device, im, invert=not a.no_invert,
                      mask_magenta=not a.keep_bg)
        # 等比縮進正方形，邊緣補黑（ControlNet 對黑邊視為無條件）
        s = min(a.size / d.width, a.size / d.height)
        r = d.resize((max(1, int(d.width * s)), max(1, int(d.height * s))), Image.LANCZOS)
        canvas = Image.new("L", (a.size, a.size), 0)
        canvas.paste(r, ((a.size - r.width) // 2, (a.size - r.height) // 2))
        stem = os.path.splitext(os.path.basename(f))[0]
        out = os.path.join(a.outdir, f"{stem}_depth.png")
        canvas.save(out)
        dmin, dmax = np.asarray(canvas).min(), np.asarray(canvas).max()
        print(f"  {stem:34s} {im.size} → {canvas.size}  灰階 {dmin}..{dmax}  → {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
