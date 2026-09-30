"""pixelize.py — 可靠的像素素材後處理。

把 AI 生的 512 大圖變成可以直接用的 sprite：

    降採樣 → 去背 → 去背景色殘留(despill) → 量化調色盤 → 裁切 → 貼到固定畫布

重點：所有 sprite 都會被貼到同一個尺寸的畫布上，而且底部對齊，
所以可以直接排 sprite sheet / 疊動畫，不會有 64 跟 73 混在一起的情況。

不需要 scipy、不需要 ComfyUI，只要有 numpy + Pillow。
"""
from __future__ import annotations

import sys
from collections import Counter

import numpy as np
from PIL import Image

# ---------------------------------------------------------------- 降採樣


def already_cut_out(im: Image.Image, threshold: float = 0.02) -> float:
    """回傳透明像素比例。

    已經去過背的圖不能再跑一次去背 —— 透明區域會被轉成黑色，黑色又會被當成
    「背景」，結果主體被再挖一次，越跑越小。這支函式就是用來擋這件事。
    """
    if im.mode not in ("RGBA", "LA", "PA") and "transparency" not in im.info:
        return 0.0
    a = np.asarray(im.convert("RGBA"))[:, :, 3]
    return float((a < 250).mean())


def downscale(im: Image.Image, res: int, resample: int = Image.BOX) -> Image.Image:
    """把圖的長邊縮到 res。

    優先用整數倍率（讓像素格乾淨），真的除不盡才退回一般重採樣。
    """
    w, h = im.size
    long_side = max(w, h)
    if long_side <= res:
        return im.convert("RGB")

    factor = long_side / res
    nearest_int = max(1, round(factor))
    if abs(factor - nearest_int) <= 0.25:
        factor = nearest_int  # 整數倍，最乾淨

    nw = max(1, round(w / factor))
    nh = max(1, round(h / factor))
    return im.convert("RGB").resize((nw, nh), resample)


# ---------------------------------------------------------------- 背景偵測


def border_bg(im: Image.Image, ring: int = 2) -> tuple[int, int, int]:
    """從外框抓背景色。

    用「出現最多次的顏色」而不是四角平均 —— 主體碰到角落也不會猜錯。
    """
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    r = max(1, min(ring, h // 2, w // 2))
    border = np.concatenate([
        a[:r].reshape(-1, 3),
        a[-r:].reshape(-1, 3),
        a[:, :r].reshape(-1, 3),
        a[:, -r:].reshape(-1, 3),
    ])

    # 先粗量化（每階 8）再取眾數，避免雜訊把同一個顏色拆散
    coarse = (border // 8) * 8
    mode = Counter(map(tuple, coarse)).most_common(1)[0][0]
    same = np.all(coarse == np.array(mode, dtype=np.int16), axis=1)
    if not same.any():
        return tuple(int(v) for v in border.mean(0).round())
    # 回傳該群組的平均，比粗量化後的格子中心準
    return tuple(int(v) for v in border[same].mean(0).round())


# ---------------------------------------------------------------- 去背


def _hsv(a: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """RGB(0..255) → (hue 0..360, sat 0..1, val 0..1)，純 numpy 沒有迴圈。"""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = a.max(2)
    mn = a.min(2)
    df = mx - mn
    safe = np.maximum(df, 1e-6)

    v = mx / 255.0
    s = np.where(mx > 0, df / np.maximum(mx, 1e-6), 0.0)

    h = np.zeros_like(mx)
    m = mx == r
    h[m] = (60.0 * ((g - b) / safe) % 360.0)[m]
    m = mx == g
    h[m] = (60.0 * ((b - r) / safe) + 120.0)[m]
    m = mx == b
    h[m] = (60.0 * ((r - g) / safe) + 240.0)[m]
    h[df < 1e-6] = 0.0
    return h, s, v


def border_bg_hue(bg: tuple[int, int, int]) -> tuple[float, float]:
    h, s, _ = _hsv(np.array([[list(bg)]], dtype=np.float32))
    return float(h[0, 0]), float(s[0, 0])


def bg_quality(bg: tuple[int, int, int]) -> tuple[float, str | None]:
    """檢查偵測到的背景夠不夠「有色」。

    模型沒聽話、背景變成灰白時，去背會很難做 —— 因為主體的銀色/灰色跟背景
    幾乎一樣，距離法分不出來。這種情況只能提示使用者重跑。
    """
    _, s, _ = _hsv(np.array([[list(bg)]], dtype=np.float32))
    sat = float(s[0, 0])
    if sat < 0.12:
        return sat, (
            f"背景幾乎沒顏色（飽和度只有 {sat:.2f}，呈色 {bg}）—— "
            "模型這次沒生出綠幕，主體跟背景太像會留殘邊。建議重跑，或加大 --tol。"
        )
    return sat, None


def flood_from_border(mask: np.ndarray) -> np.ndarray:
    """從影像邊界往內長，只回傳跟邊界連通的區域。

    去背的一大重點：主角身上剛好有一塊跟背景同色的東西（例如綠底配綠披風）
    時，那道色塊如果沒接到畫面邊界，就不該被當成背景。這個函式就是用來
    區分「背景」跟「主角身上的同色塊」。
    """
    if not mask.any():
        return mask.copy()

    h, w = mask.shape
    reach = np.zeros_like(mask)
    reach[0, :] |= mask[0, :]
    reach[-1, :] |= mask[-1, :]
    reach[:, 0] |= mask[:, 0]
    reach[:, -1] |= mask[:, -1]

    while True:
        prev = reach
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        reach = grown & mask
        if np.array_equal(reach, prev):
            return reach


def chroma_alpha(
    rgb: np.ndarray,
    bg: tuple[int, int, int],
    tol: float = 70.0,
    soft: float = 40.0,
    despill: bool = True,
    hue_key: bool = True,
    hue_tol: float = 32.0,
    sat_floor: float = 0.22,
    sat_soft: float = 0.15,
    flood: bool = True,
    strong_frac: float = 0.35,
) -> tuple[np.ndarray, np.ndarray]:
    """計算 alpha，並把殘留的背景色從邊緣像素裡扣掉。

    兩道判斷並用（取最寬鬆的那個）：

    1. 近距離 tol：跟背景色差小於 tol 的像素直接算背景。
    2. 色相 hue_tol：跟背景「同色系又夠飽和」的像素也算背景。
       這道是必要的 —— AI 很愛在腳下畫一塊更飽和的綠色地面或陰影，
       它跟橄欖綠背景的距離超過 tol，純距離法一定會留下綠色色塊。
       加上飽和度下限，灰色/黑色的主體輪廓線就不會被吃掉。

    flood: 只消除跟畫面邊界連通的背景。不然主角身上的綠披風會被一起吃掉。
           但這樣會漏掉「被主體圍住的背景洞」（例如手臂跟身體之間的空隙），
           所以再加一道 strong_frac：跟背景幾乎一模一樣的像素不管連通都算背景。
    despill: 把邊緣像素混到的背景色反解掉，避免綠邊/紫邊
    """
    a = rgb.astype(np.float32)
    bgv = np.array(bg, dtype=np.float32)

    dist = np.sqrt(((a - bgv) ** 2).sum(2))
    key = np.clip((tol + soft - dist) / max(soft, 1e-6), 0.0, 1.0)

    if hue_key:
        bg_h, bg_s = border_bg_hue(bg)
        if bg_s >= 0.10:  # 背景本身要有色相，灰底就別用這招
            h, s, v = _hsv(a)
            d = np.abs(h - bg_h)
            d = np.minimum(d, 360.0 - d)
            # 飽和度下限跟著背景自己走：背景越淡，門檻就要越低。
            # 不然像「淡綠地面陰影」這種低飽和綠（sat 0.20）會剛好躲過固定門檻 0.22。
            floor = float(np.clip(bg_s * 0.55, 0.08, sat_floor))
            sat_gate = np.clip((s - floor) / max(sat_soft, 1e-6), 0.0, 1.0)
            val_gate = np.clip((v - 0.03) / 0.08, 0.0, 1.0)
            hue_gate = np.clip((hue_tol - d) / max(hue_tol * 0.5, 1e-6), 0.0, 1.0)
            key = np.maximum(key, hue_gate * sat_gate * val_gate)

    if flood:
        reach = flood_from_border(key > 0.5)
        # 幾乎就是背景色的像素（例如被主體圍住的洞）不需要連通也算背景
        strong = dist < max(12.0, tol * strong_frac)
        key = key * np.maximum(reach, strong)

    alpha = 1.0 - key

    out = a.copy()
    if despill:
        # a = subject*alpha + bg*(1-alpha)  → 反解 subject
        m = alpha > 0.01
        if m.any():
            al = alpha[m][:, None]
            out[m] = np.clip((a[m] - bgv * (1.0 - al)) / al, 0, 255)

    return out, alpha


def harden_alpha(alpha: np.ndarray, threshold: float = 0.5) -> np.ndarray:
    """像素素材要的是硬邊，不要半透明。"""
    return (alpha >= threshold).astype(np.float32)


# ---------------------------------------------------------------- 調色盤


def quantize(
    rgb: np.ndarray,
    alpha: np.ndarray,
    colors: int,
) -> np.ndarray:
    """只把調色盤的額度花在主體上。

    做法：先把非主體像素全部填成同一個顏色（只會佔 1 個色格），
    再用 median-cut 量化，最後把透明的地方還原。
    """
    if colors <= 0:
        return rgb

    subject = alpha > 0
    if not subject.any():
        return rgb

    n_unique = len(np.unique(rgb[subject].reshape(-1, 3), axis=0))
    colors = max(2, min(colors, 256))
    if n_unique <= colors:
        return rgb  # 本來就夠少色，不用動

    work = rgb.copy()
    work[~subject] = rgb[subject][0]  # 單一填充色，只吃 1 格

    # 6-bit 量化後再 median-cut 比較穩
    q = Image.fromarray(work.astype(np.uint8)).quantize(
        colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE
    )
    return np.asarray(q.convert("RGB")).astype(np.float32)


# ---------------------------------------------------------------- 裁切 / 畫布


def trim(rgba: Image.Image, pad: int = 0) -> Image.Image:
    """裁掉透明邊，留 pad 的空隙。"""
    a = np.asarray(rgba)
    mask = a[:, :, 3] > 0
    if not mask.any():
        return rgba
    ys, xs = np.nonzero(mask)
    x0, x1 = max(0, xs.min() - pad), min(rgba.width, xs.max() + 1 + pad)
    y0, y1 = max(0, ys.min() - pad), min(rgba.height, ys.max() + 1 + pad)
    return rgba.crop((x0, y0, x1, y1))


def place(rgba: Image.Image, canvas: int, anchor: str = "bottom") -> Image.Image:
    """貼到 canvas x canvas 的畫布上。

    anchor="bottom" → 水平置中、底部對齊（所有 sprite 站在同一條地平線）
    anchor="center" → 正中央
    """
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    w, h = rgba.size
    if w > canvas or h > canvas:
        # 塞不下就等比縮到剛好
        s = min(canvas / w, canvas / h)
        rgba = rgba.resize((max(1, int(w * s)), max(1, int(h * s))), Image.BOX)
        w, h = rgba.size
    x = (canvas - w) // 2
    y = canvas - h if anchor == "bottom" else (canvas - h) // 2
    out.paste(rgba, (x, y))
    return out


# ---------------------------------------------------------------- 一條龍


def make_sprite(
    im: Image.Image,
    res: int = 64,
    colors: int = 32,
    canvas: int | None = None,
    tol: float = 70.0,
    soft: float = 40.0,
    hard: bool = True,
    pad: int = 0,
    anchor: str = "bottom",
    resample: int = Image.BOX,
    bg: tuple[int, int, int] | None = None,
    hue_key: bool = True,
    hue_tol: float = 32.0,
    flood: bool = True,
    alpha_mode: str = "auto",
) -> tuple[Image.Image, tuple[int, int, int]]:
    """回傳 (1x sprite PNG, 偵測到的背景色)。

    alpha_mode:
      "auto"  — 輸入已經有透明通道就沿用（例如想把 64 改成 128），
                沒有的話才跑去背。
      "key"   — 強制重新去背（透明區域會被當成黑色，一般不要用）。
    """
    reuse_alpha = False
    if alpha_mode == "auto":
        reuse_alpha = already_cut_out(im) > 0.02
    elif alpha_mode != "key":
        raise ValueError(f"alpha_mode 只能是 auto / key，收到 {alpha_mode!r}")

    src = im.convert("RGBA") if reuse_alpha else im
    small = downscale(src.convert("RGB"), res, resample)
    if bg is None:
        bg = border_bg(small, ring=max(1, small.size[0] // 16))

    rgb = np.asarray(small.convert("RGB")).astype(np.float32)

    if reuse_alpha:
        # 已有的透明通道一起降採樣，不去背、也不 despill
        a_small = downscale(src.getchannel("A").convert("RGB"), res, resample)
        alpha = np.asarray(a_small)[:, :, 0].astype(np.float32) / 255.0
        rgb2 = rgb
    else:
        rgb2, alpha = chroma_alpha(rgb, bg, tol=tol, soft=soft,
                                   hue_key=hue_key, hue_tol=hue_tol, flood=flood)

    if hard:
        alpha = harden_alpha(alpha, 0.5)

    rgb2 = quantize(rgb2, alpha, colors)

    rgba = np.dstack([np.clip(rgb2, 0, 255), alpha * 255]).astype(np.uint8)
    out = Image.fromarray(rgba, mode="RGBA")
    out = trim(out, pad=pad)

    if canvas:
        out = place(out, canvas, anchor=anchor)
    return out, bg


def preview(im: Image.Image, size: int = 256, bg=(40, 40, 48, 255)) -> Image.Image:
    """最近鄰放大預覽，棋盤底方便看透明區。"""
    w, h = im.size
    s = max(1, size // max(w, h))
    big = im.resize((w * s, h * s), Image.NEAREST)

    tile = max(4, s * 2)
    board = Image.new("RGBA", big.size)
    for y in range(0, big.height, tile):
        for x in range(0, big.width, tile):
            shade = 60 if ((x // tile) + (y // tile)) % 2 else 40
            board.paste((shade, shade, shade + 8, 255),
                        (x, y, min(x + tile, big.width), min(y + tile, big.height)))
    board.alpha_composite(big)
    return board


# ---------------------------------------------------------------- CLI


def _cli() -> int:
    import argparse
    import glob
    import os

    ap = argparse.ArgumentParser(description="把圖變成像素 sprite（可批次）")
    ap.add_argument("inputs", nargs="+", help="輸入圖，可用 wildcard")
    ap.add_argument("-o", "--outdir", default="output/sprite")
    ap.add_argument("--res", type=int, default=64, help="1x 長邊像素數（預設 64）")
    ap.add_argument("--colors", type=int, default=32, help="調色盤上限，0 = 不減色")
    ap.add_argument("--canvas", type=int, default=None,
                    help="統一出圖尺寸，預設跟 --res 一樣（保證每張同尺寸）")
    ap.add_argument("--tol", type=float, default=70.0, help="背景色容差")
    ap.add_argument("--soft", type=float, default=40.0, help="邊緣漸層寬度")
    ap.add_argument("--no-hue-key", action="store_true",
                    help="關掉色相去背，只用距離（背景不是純色時改用這個）")
    ap.add_argument("--hue-tol", type=float, default=32.0, help="色相容差（度）")
    ap.add_argument("--no-flood", action="store_true",
                    help="關掉連通判斷（背景色跟主角同色時反而該關）")
    ap.add_argument("--pad", type=int, default=0, help="裁切後留白")
    ap.add_argument("--anchor", choices=["bottom", "center"], default="bottom")
    ap.add_argument("--resample", choices=["box", "nearest", "lanczos"], default="box")
    ap.add_argument("--keep-raw", action="store_true", help="連 512 原圖一起複製過去")
    ap.add_argument("--force", action="store_true",
                    help="輸入已去過背時，強制重新去背（一般不需要；預設會沿用既有透明通道）")
    ap.add_argument("--no-preview", action="store_true")
    a = ap.parse_args()

    files: list[str] = []
    for pat in a.inputs:
        found = glob.glob(pat)
        files.extend(found or [pat])
    if not files:
        print("找不到輸入檔")
        return 1

    resample = {"box": Image.BOX, "nearest": Image.NEAREST, "lanczos": Image.LANCZOS}[a.resample]
    canvas = a.canvas if a.canvas is not None else a.res
    os.makedirs(a.outdir, exist_ok=True)

    sizes = set()
    skipped = 0
    for f in files:
        im = Image.open(f)
        reused = make_sprite_uses_alpha(im, a.force)
        sprite, bg = make_sprite(im, res=a.res, colors=a.colors, canvas=canvas,
                                 tol=a.tol, soft=a.soft, pad=a.pad,
                                 anchor=a.anchor, resample=resample,
                                 hue_key=not a.no_hue_key, hue_tol=a.hue_tol,
                                 flood=not a.no_flood,
                                 alpha_mode="key" if a.force else "auto")
        stem = os.path.splitext(os.path.basename(f))[0]
        out1x = os.path.join(a.outdir, f"{stem}.png")
        sprite.save(out1x)

        if not a.no_preview:
            preview(sprite).save(os.path.join(a.outdir, f"{stem}_preview.png"))

        if a.keep_raw:
            shutil_copy(f, os.path.join(a.outdir, f"{stem}_raw.png"))

        sizes.add(sprite.size)
        opaque = int((np.asarray(sprite)[:, :, 3] > 0).sum())
        info = "沿用既有透明" if reused else f"bg={bg}"
        print(f"{stem:26s} {info}  ->  {sprite.size}  主體 {opaque} px  "
              f"({opaque * 100 // (sprite.size[0] ** 2)}%)")
        if not reused:
            _, warn = bg_quality(bg)
            if warn:
                print(f"  ⚠ {warn}")

    if not sizes:
        print("沒有任何產出")
        return 1
    if len(sizes) == 1:
        print(f"\n全部 {len(files) - skipped} 張都是 {sizes.pop()}，可以直接排 sprite sheet。")
    else:
        print(f"\n警告：尺寸不一致 {sizes}")
    return 0


def make_sprite_uses_alpha(im: Image.Image, force: bool) -> bool:
    """僅供 CLI 顯示用：這次會不會沿用既有的透明通道。"""
    return (not force) and already_cut_out(im) > 0.02


def shutil_copy(src: str, dst: str) -> None:
    import shutil

    shutil.copyfile(src, dst)


if __name__ == "__main__":
    sys.exit(_cli())
