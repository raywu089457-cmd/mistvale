"""walk_fix.py — 把生圖 sheet 的走路修成「左右腳交替 + 身體起伏 + 頭部比例一致」。

為什麼需要:生圖模型(任何 image route)無法在單張 sheet 裡穩定做出鏡像的肢體相位。
實測 5 次(正面4格/正面6格/側面4格/逐格單獨生/側面8格嚴格提示詞)都被 Agent Sprite Forge 的
sheet_qc 判 leg_alternation fail —「duplicated half-cycle: the same leg leads in both halves」;
另外逐格/多格生成常伴隨 head_ratio ±8% 的身分漂移。

三個確定性修正(純像素操作,不重生成):
  1. 後半週期只把「腰線以下的腿」左右鏡像(繞角色中軸,不是畫布中心)→ 領先腳互換。
     上半身(手上的弓/劍、披風、臉)完全不動,所以不會出現「換手拿武器」。
  2. passing 格把「腰線以上的上半身」上移 N px → 身體起伏;腳仍踩在地線上(不浮空)。
  3. --qc 給 sheet_qc.json 時,依量到的 head_ratio 逐格縮放(以腳底為錨)把頭部比例拉回 1.0,
     縮放後再把腳底重新壓回同一條地線(避免出現「兩腳離地 flight」)。

用法:
  python walk_fix.py <frames_dir> <out_dir> [--pattern "*.png"] [--belt 0.55] [--bob 1]
                     [--passing 2,4] [--mirror-half 1] [--qc path/sheet-qc.json]
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image


def measure(arr):
    m = arr[..., 3] > 0
    ys, xs = np.nonzero(m)
    return (xs.min() + xs.max()) / 2, ys.min(), ys.max()


def mirror_lower(arr, cx, belt, width, window=0.0):
    """把腰線以下的腿左右鏡像。

    window > 0 時只動「以角色中軸為中心、寬 body_width*window」的視窗,視窗外的東西
    (側背的弓、箭袋)原封不動 —— 不這樣做的話弓會一起被翻到另一側,比原本的步態問題更明顯。
    """
    out = arr.copy()
    flipped = arr[:, ::-1, :][belt:, :, :]
    shift = int(round(cx - (width - 1 - cx)))
    if shift:
        flipped = np.roll(flipped, shift, axis=1)
    if not window:
        out[belt:, :, :] = flipped
        return out
    half = max(4, int(round(width * window / 2)))
    x0, x1 = max(0, int(round(cx)) - half), min(width, int(round(cx)) + half)
    out[belt:, x0:x1, :] = flipped[:, x0:x1, :]
    return out


def bob_upper(arr, belt, px):
    out = np.zeros_like(arr)
    out[belt:, :, :] = arr[belt:, :, :]
    out[:belt, :, :] = np.roll(arr[:belt, :, :], -px, axis=0)
    out[max(0, belt - px):belt, :, :] = 0
    return out


def scale_to_head(im, k, ground, cx):
    """把角色縮放 k 倍(最近鄰),貼回「同一個畫布尺寸」:腳底對齊 ground、中軸對齊 cx。
    (直接回傳縮放後的圖會讓畫布尺寸不同,後續 QC/打包要求所有格同尺寸。)"""
    W, H = im.size
    s = im.resize((max(1, int(round(W * k))), max(1, int(round(H * k)))), Image.NEAREST)
    sa = np.asarray(s).copy()
    scx, _, sbot = measure(sa)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(s, (int(round(cx - scx)), int(round(ground - sbot))))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--pattern", default="*.png")
    ap.add_argument("--belt", type=float, default=0.55)
    ap.add_argument("--bob", type=int, default=1)
    ap.add_argument("--passing", default="", help="哪幾格是 passing(1 起算,逗號分隔)")
    ap.add_argument("--mirror-half", type=int, default=1, help="後半週期鏡像腿(1=開)")
    ap.add_argument("--leg-window", type=float, default=0.0,
                    help="只鏡像角色中軸左右這個比例寬度的腿部視窗(0=整條下半身都鏡像)")
    ap.add_argument("--qc", default="", help="sheet_qc.json:用它的 head_ratio 把頭部比例拉回 1.0")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    passing = {int(x) for x in a.passing.split(",") if x}
    files = sorted(glob.glob(os.path.join(a.frames_dir, a.pattern)))
    n = len(files)
    ratios = None
    if a.qc and os.path.exists(a.qc):
        qc = json.load(open(a.qc, encoding="utf-8"))
        ratios = [c["head"]["head_ratio"] for c in qc["cells"]]
    # 地線 = 全部格腳底的最大值(修完要對回這裡)
    grounds = []
    for f in files:
        arr = np.asarray(Image.open(f).convert("RGBA"))
        grounds.append(measure(arr)[2])
    ground = max(grounds)
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA")
        arr = np.asarray(im).copy()
        cx, top, bot = measure(arr)
        belt = int(top + (bot - top) * a.belt)
        tags = []
        if ratios and abs(ratios[i] - 1.0) > 0.03:
            k = 1.0 / ratios[i]
            im = scale_to_head(im, k, ground, cx)
            arr = np.asarray(im).copy()
            cx, top, bot = measure(arr)
            belt = int(top + (bot - top) * a.belt)
            tags.append(f"頭x{k:.3f}")
        if a.mirror_half and i >= n // 2:
            arr = mirror_lower(arr, cx, belt, arr.shape[1], a.leg_window)
            tags.append("鏡像腿" + (f"(窗口{a.leg_window:.2f})" if a.leg_window else ""))
        if (i + 1) in passing and a.bob:
            arr = bob_upper(arr, belt, a.bob)
            tags.append(f"上半身+{a.bob}px")
        # 重新壓回地線(縮放/位移後腳底可能跑掉)
        out = arr
        _, _, b2 = measure(out)
        dy = ground - b2
        if dy:
            out = np.roll(out, dy, axis=0)
            if dy > 0:
                out[:dy, :, :] = 0
            else:
                out[dy:, :, :] = 0
            tags.append(f"壓地線{dy:+d}")
        Image.fromarray(out).save(os.path.join(a.out_dir, os.path.basename(f)))
        print(f"{os.path.basename(f)}: {' '.join(tags) if tags else '原樣'}")
    print(f"→ {a.out_dir} ({n} 格, 地線 y={ground})")


if __name__ == "__main__":
    main()
