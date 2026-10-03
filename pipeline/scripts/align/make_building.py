"""make_building.py — l0veyou 生的單棟建築（洋紅底）→ 去背、碰邊檢查、裁切 → assets/concept-clean/<id>-concept-v3.png。

用法：python pipeline/scripts/align/make_building.py <src.png|jpg> <building-id>
去背沿用 l0veyou/sheet_to_atlas.py 的 key_out（色鍵＋影子＋洞＋內收 1px）；只留大塊（MIN_PX）。
"""
import os, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "l0veyou")); sys.path.insert(0, str(HERE.parent / "comfyui"))
from sheet_to_atlas import key_out, magenta_left  # noqa: E402

ROOT = HERE.parents[2]


def main(src, bid):
    im = Image.open(src); W, H = im.size
    rgb, alpha = key_out(im)
    lab, n = ndimage.label(alpha > 0)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= int(os.environ.get("MIN_PX", "400"))])
    ys, xs = np.nonzero(keep)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    if (x0 <= 1 or y0 <= 1 or x1 >= W - 1 or y1 >= H - 1) and not os.environ.get("ALLOW_EDGE"):
        print(f"FAIL {bid}: 建築碰到圖邊（被切掉）——重生，未寫入"); return 3
    rgba = np.dstack([rgb, np.where(keep, alpha, 0)]).astype(np.uint8)[y0:y1, x0:x1]
    out = ROOT / "assets" / "concept-clean" / f"{bid}-concept-v3.png"
    Image.fromarray(rgba, "RGBA").save(out, optimize=True)
    print(f"{out.name}: {x1 - x0}x{y1 - y0}, magenta殘留={magenta_left(rgba)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
