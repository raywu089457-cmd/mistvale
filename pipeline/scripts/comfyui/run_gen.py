"""run_gen.py — 生像素素材（headless，不用開瀏覽器）。

流程：
    ComfyUI 生 512 原圖  →  下載  →  本機後處理成真 sprite

後處理不再用 ComfyUI-PixelArt-Detector 那個節點，因為它的「格線偵測」在 AI
輸出上不準（實測會給出 128x64 / 102x64 這種不一致答案），而且尺寸會亂跳。
現在改成固定倍率降採樣 + 自己控制調色盤，所以每張 sprite 尺寸都一樣。

用法：
  venv\\Scripts\\python.exe run_gen.py --batch 4
  venv\\Scripts\\python.exe run_gen.py --batch 4 --res 64 --colors 32
  venv\\Scripts\\python.exe run_gen.py --bg magenta --res 128
  venv\\Scripts\\python.exe run_gen.py --prompt "pixel art, ..." --seed 123
"""
from __future__ import annotations

import argparse
import io
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

import numpy as np

import pixelize

SERVER = "http://127.0.0.1:8188"
CKPT = "dreamshaper_8.safetensors"
LORA = "PixelArtRedmond15V.safetensors"

# 背景色 → 提示詞用的字 + 去背時的備援色（實際顏色還是會從圖上量）
BG_WORDS = {
    "magenta": "magenta",
    "green": "green",
    "cyan": "cyan",
    "blue": "blue",
}

POS_TMPL = (
    # 背景描述要放句尾、不要加括號強調。實測（knight, seed 3000/4000）：
    #   "solid green background" 句尾、不強調  → 背景飽和 0.14、主體銀色正常  ✓
    #   "((solid green background))" 開頭強調  → 背景飽和 0.44、但主體也變綠 ✗
    #   負面詞加 "green tint"                    → 背景直接變成灰色 ✗
    "pixel art, pixelartredmond, ((side view)), full body, "
    "a knight character sprite, holding a sword, "
    "solid {bg} background, game asset, 16-bit, sharp pixels, limited palette"
)
NEG = (
    "blurry, anti-aliasing, smooth, gradient, 3d render, photo, "
    "realistic, watermark, text, signature, jpeg artifacts, "
    "multiple views, cropped, out of frame"
)


# ---------------------------------------------------------------- workflow


def build(pos, neg, seed, width, height, steps, cfg, batch, lora_w):
    return {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "LoraLoader",
              "inputs": {"model": ["1", 0], "clip": ["1", 1], "lora_name": LORA,
                         "strength_model": lora_w, "strength_clip": lora_w}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": pos, "clip": ["2", 1]}},
        "4": {"class_type": "CLIPTextEncode",
              "inputs": {"text": neg, "clip": ["2", 1]}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": width, "height": height, "batch_size": batch}},
        "6": {"class_type": "KSampler",
              "inputs": {"model": ["2", 0], "positive": ["3", 0], "negative": ["4", 0],
                         "latent_image": ["5", 0], "seed": seed, "steps": steps,
                         "cfg": cfg, "sampler_name": "dpmpp_2m",
                         "scheduler": "karras", "denoise": 1.0}},
        "7": {"class_type": "VAEDecode",
              "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage",
              "inputs": {"images": ["7", 0], "filename_prefix": "gen/raw"}},
    }


# ---------------------------------------------------------------- http


def post(path, payload, timeout=120):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(SERVER + path, data=data,
                                headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def get_json(path, timeout=60):
    with urllib.request.urlopen(SERVER + path, timeout=timeout) as r:
        return json.loads(r.read())


def get_image(ref):
    q = urllib.parse.urlencode({
        "filename": ref["filename"],
        "subfolder": ref.get("subfolder", ""),
        "type": ref.get("type", "output"),
    })
    with urllib.request.urlopen(f"{SERVER}/view?{q}", timeout=120) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def wait_for(pid, timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = get_json(f"/history/{pid}")
        if pid in h:
            return h[pid], time.time() - t0
        time.sleep(0.5)
    return None, time.time() - t0


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description="生像素 sprite（含本機後處理）")
    ap.add_argument("--prompt", default=None, help="自訂正面提示詞")
    ap.add_argument("--negative", default=None)
    ap.add_argument("--bg", choices=sorted(BG_WORDS), default="green",
                    help="背景色關鍵字，預設 green（這個 LoRA 唯一穩定吃得到的）")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--width", type=int, default=512)
    ap.add_argument("--height", type=int, default=512)
    ap.add_argument("--steps", type=int, default=25)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--lora", type=float, default=0.8)
    # 後處理
    ap.add_argument("--res", type=int, default=64, help="1x 長邊像素數（預設 64）")
    ap.add_argument("--colors", "--palette", type=int, default=32, dest="colors",
                    help="調色盤上限，0 = 不減色")
    ap.add_argument("--canvas", type=int, default=None,
                    help="統一出圖尺寸，預設 = --res（保證同尺寸）")
    ap.add_argument("--tol", type=float, default=70.0)
    ap.add_argument("--pad", type=int, default=0)
    ap.add_argument("--anchor", choices=["bottom", "center"], default="bottom")
    ap.add_argument("--no-post", action="store_true", help="只存 512 原圖")
    ap.add_argument("--name", default=None,
                    help="素材名稱，用來取代檔名裡的 seed（例：--name knight → knight_01.png）")
    ap.add_argument("--raw-dir", default="output/raw")
    ap.add_argument("--outdir", default="output/sprite")
    ap.add_argument("--timeout", type=int, default=900)
    a = ap.parse_args()

    bg_word = BG_WORDS[a.bg]
    pos = a.prompt or POS_TMPL.format(bg=bg_word)
    neg = a.negative or NEG

    seed = a.seed if a.seed is not None else random.randint(0, 2**31 - 1)
    wf = build(pos, neg, seed, a.width, a.height, a.steps, a.cfg, a.batch, a.lora)

    print(f"seed={seed}  {a.width}x{a.height}  steps={a.steps}  batch={a.batch}  "
          f"lora={a.lora}  bg={a.bg}")
    print(f"post: res={a.res} colors={a.colors} canvas={a.canvas or a.res}")

    # 先確認 server 活著，免得等到 timeout 才發現
    try:
        get_json("/system_stats", timeout=5)
    except Exception:
        print(f"\n連不上 {SERVER} —— 先跑 D:\\AI\\start_comfyui.bat 把服務開起來。")
        return 2

    try:
        res = post("/prompt", {"prompt": wf})
    except urllib.error.HTTPError as e:
        print("SUBMIT FAILED", e.code)
        print(e.read().decode("utf-8", "replace")[:4000])
        return 1

    pid = res["prompt_id"]
    print("prompt_id:", pid)
    entry, elapsed = wait_for(pid, a.timeout)
    if entry is None:
        print(f"TIMEOUT：等了 {elapsed:.0f} 秒還沒好")
        return 1

    status = entry.get("status", {})
    if status.get("status_str") == "error":
        print("生成失敗：")
        for m in status.get("messages", []):
            print("  ", m)
        return 1

    refs = [im for out in entry.get("outputs", {}).values()
            for im in out.get("images", [])]
    if not refs:
        print("沒有任何輸出圖")
        return 1

    print(f"生成完成 {elapsed:.1f}s（{elapsed / max(len(refs), 1):.1f}s/張），"
          f"{len(refs)} 張\n")

    os.makedirs(a.raw_dir, exist_ok=True)
    if not a.no_post:
        os.makedirs(a.outdir, exist_ok=True)

    canvas = a.canvas if a.canvas is not None else a.res
    sizes = set()
    for i, ref in enumerate(refs, 1):
        img = get_image(ref)
        stem = f"{a.name}_{i:02d}" if a.name else f"{seed}_{i:02d}"
        img.save(os.path.join(a.raw_dir, f"{stem}_512.png"))

        if a.no_post:
            print(f"  {stem}_512.png   {img.size}")
            continue

        sprite, bgdet = pixelize.make_sprite(
            img, res=a.res, colors=a.colors, canvas=canvas,
            tol=a.tol, soft=40.0, pad=a.pad, anchor=a.anchor,
        )
        out1x = os.path.join(a.outdir, f"{stem}.png")
        sprite.save(out1x)
        pixelize.preview(sprite).save(os.path.join(a.outdir, f"{stem}_preview.png"))

        sizes.add(sprite.size)
        px = int((np.asarray(sprite)[:, :, 3] > 0).sum())
        print(f"  {stem}.png   bg={bgdet}  {sprite.size}  主體 {px} px "
              f"({px * 100 // (canvas * canvas)}%)")
        _, warn = pixelize.bg_quality(bgdet)
        if warn:
            print(f"    ⚠ {warn}")

    print(f"\n原圖：{a.raw_dir}")
    if not a.no_post:
        print(f"sprite：{a.outdir}")
        if len(sizes) == 1:
            print(f"✓ {len(refs)} 張全部 {sizes.pop()}，可直接排 sprite sheet")
        else:
            print(f"✗ 尺寸不一致：{sizes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
