"""selftest.py — 環境與管線自我檢查。

跑法：
    venv\\Scripts\\python.exe selftest.py

檢查項目：
  1. GPU / torch / CUDA 狀態
  2. 後處理管線：尺寸一致性、小圖不崩、透明通道正確
  3. PixelArtDetector 節點：小圖不再 ValueError（舊版的當機點）
  4. ComfyUI server 有沒有活著（沒開就跳過）
"""
from __future__ import annotations

import contextlib
import glob
import io
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "custom_nodes", "ComfyUI-PixelArt-Detector"))

import pixelize  # noqa: E402

OK, BAD = "  [OK]  ", "  [FAIL]"
_fails: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"{OK if cond else BAD} {name}" + (f"  — {detail}" if detail else ""))
    if not cond:
        _fails.append(name)


# ------------------------------------------------------------------ 1. 環境


def t_env() -> None:
    print("\n[1] 環境")
    try:
        import torch
        check("torch 匯入", True, torch.__version__)
        check("CUDA 可用", torch.cuda.is_available(),
              torch.cuda.get_device_name(0) if torch.cuda.is_available() else "沒有 GPU")
        if torch.cuda.is_available():
            cap = torch.cuda.get_device_capability(0)
            check("GPU 算力在編譯清單內",
                  f"sm_{cap[0]}{cap[1]}" in torch.cuda.get_arch_list(),
                  f"sm_{cap[0]}{cap[1]}, cuda {torch.version.cuda}")
            free, total = torch.cuda.mem_get_info()
            check("VRAM 讀取", True, f"{free / 2**30:.1f} / {total / 2**30:.1f} GB 可用")
    except Exception as e:
        check("torch 匯入", False, repr(e))


# ------------------------------------------------------------------ 2. 管線


def _fake(w: int, h: int, bg=(120, 150, 90)) -> Image.Image:
    """畫一張假的圖：純色底 + 中間一個方塊。"""
    a = np.zeros((h, w, 3), np.uint8)
    a[:, :] = bg
    a[h // 4:h * 3 // 4, w // 4:w * 3 // 4] = (200, 30, 40)
    return Image.fromarray(a)


def t_pipeline() -> None:
    print("\n[2] 後處理管線")
    sizes = set()
    for seed in range(6):
        rng = np.random.default_rng(seed)
        w = h = 512
        a = np.zeros((h, w, 3), np.uint8)
        a[:, :] = rng.integers(90, 160, 3)
        y0, y1 = int(rng.integers(60, 160)), int(rng.integers(300, 440))
        x0, x1 = int(rng.integers(60, 180)), int(rng.integers(300, 450))
        a[y0:y1, x0:x1] = rng.integers(0, 90, 3)
        sp, _ = pixelize.make_sprite(Image.fromarray(a), res=64, colors=32, canvas=64)
        sizes.add(sp.size)

    check("6 張不同內容 → 尺寸一致", len(sizes) == 1, f"{sizes}")

    # 舊版會在這裡砸掉：ValueError: cannot convert float NaN to integer
    for n in (8, 12, 16, 24, 48):
        try:
            sp, _ = pixelize.make_sprite(_fake(n, n), res=64, colors=32, canvas=64)
            ok = sp.size == (64, 64)
        except Exception as e:
            ok, sp = False, repr(e)
        check(f"{n}x{n} 小圖不崩且補到 64x64", ok, str(sp))

    sp, _ = pixelize.make_sprite(_fake(512, 512), res=64, colors=32, canvas=64)
    a = np.asarray(sp)
    check("有透明像素", (a[:, :, 3] == 0).any())
    check("有實心像素", (a[:, :, 3] == 255).any())
    check("alpha 是硬邊（只有 0/255）", set(np.unique(a[:, :, 3])) <= {0, 255},
          str(sorted(set(np.unique(a[:, :, 3])))))

    n_colors = int(np.asarray(sp.convert("RGB"))[a[:, :, 3] > 0].reshape(-1, 3).shape[0])
    uniq = len(np.unique(np.asarray(sp.convert("RGB"))[a[:, :, 3] > 0].reshape(-1, 3), axis=0))
    check("主體顏色數 <= --colors", uniq <= 32, f"{uniq} 色 / {n_colors} px")

    # 底部對齊：不同高度的主體，底部應該都在同一列
    bots = []
    for i in range(4):
        h = 80 + i * 60
        a = np.zeros((512, 512, 3), np.uint8)
        a[:, :] = (120, 150, 90)
        a[300 - h:300, 150:400] = (30, 40, 200)
        sp, _ = pixelize.make_sprite(Image.fromarray(a), res=64, colors=32,
                                     canvas=64, anchor="bottom")
        m = np.asarray(sp)[:, :, 3] > 0
        check(f"  高度 {h}px 的主體有被保留下來", m.any())
        if m.any():
            bots.append(int(np.nonzero(m)[0].max()))
    check("底部對齊", len(set(bots)) == 1, f"主體底列 {bots}")


# ------------------------------------------------------------------ 3. 節點


def t_node() -> None:
    print("\n[3] PixelArtDetector 節點（舊版當機點）")
    try:
        from pixelUtils import downscale_to_1x_keep_ar  # type: ignore
    except Exception as e:
        check("匯入 pixelUtils", False, repr(e))
        return

    bad = []
    for n in (8, 12, 16, 24, 32, 64, 128, 512):
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                downscale_to_1x_keep_ar(_fake(n, n))
        except Exception as e:
            bad.append(f"{n}x{n}: {type(e).__name__}: {e}")
    check("8~512px 都不會 ValueError", not bad, "; ".join(bad) or "全部通過")


# ------------------------------------------------------------------ 4. server


def t_server() -> None:
    print("\n[4] ComfyUI server")
    import json
    import urllib.request

    try:
        with urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=5) as r:
            d = json.loads(r.read())
        check("server 活著", True,
              f"ComfyUI {d['system']['comfyui_version']}, "
              f"{d['system']['pytorch_version']}")
        for p in d["system"].get("comfy_package_versions", []):
            check(f"  {p['name']} 版本符合", p["installed"] == p["required"],
                  f"{p['installed']} / 需要 {p['required']}")
    except Exception:
        print("  [SKIP] server 沒開（跑 D:\\AI\\start_comfyui.bat 後再測）")


def main() -> int:
    t_env()
    t_pipeline()
    t_node()
    t_server()
    print()
    if _fails:
        print(f"✗ {len(_fails)} 項失敗：")
        for f in _fails:
            print(f"   - {f}")
        return 1
    print("✓ 全部通過")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
