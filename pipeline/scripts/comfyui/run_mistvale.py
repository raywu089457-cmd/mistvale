"""run_mistvale.py — 生「暮影村」(Mistvale) 風格的像素素材。

對齊基準：Mistvale 的 `assets/title.png`（登入概念圖，也是專案的驗收基準）
以及 `assets/buildings14.png`（4x3 建築圖集）。

做法：
    SDXL base + pixel-art-xl LoRA + IPAdapter(以 title.png 當風格參考)
    → 洋紅底 → chroma key 去背 → 產出帶透明通道的 PNG

用法：
    venv\\Scripts\\python.exe run_mistvale.py --prompt "..." --name bakery
    venv\\Scripts\\python.exe run_mistvale.py --no-ref          # A/B：不掛風格參考
    venv\\Scripts\\python.exe run_mistvale.py --atlas           # 一次生 4x3 圖集
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

import numpy as np
from PIL import Image

import pixelize

SERVER = "http://127.0.0.1:8188"

CKPT = "sd_xl_base_1.0.safetensors"
LORA = "pixel-art-xl.safetensors"
IPADAPTER = "ip-adapter-plus_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
STYLE_REF = "mistvale_style_ref.png"          # 放在 ComfyUI input/

# Mistvale PROVENANCE.md 裡驗證過會過關的寫法，再加上強制洋紅底 / 3-4 俯視的約束。
# 第一版只寫 "solid magenta background"，IPAdapter 會把 title.png 的天空草地一起搬進構圖。
POS_BUILDING = (
    "pixel art sprite of one single medieval {subject}, a complete isolated building "
    "shown as a cutout on a flat plain magenta background that fills the whole frame "
    "edge to edge. Three-quarter elevated view, camera tilted down about 45 degrees "
    "looking at the building from above so both the roof and the front wall are "
    "visible. The whole building sits inside the frame with margin around it, not "
    "cropped. Fine detailed 16-bit pixel art with small pixels, dense texture on "
    "tiles, timber, stone, windows and lanterns. Warm earthy palette of wood brown, "
    "stone grey, muted green and warm amber window light. Thick dark outlines, crisp "
    "pixels, no anti-aliasing. No text, no people, no numbers, no border."
)
POS_ATLAS = (
    "Create ONE pixel-art sprite atlas image. Exactly 4 columns and 3 rows of equal "
    "square cells, pure solid magenta background filling the whole frame. One entire "
    "isolated building centered in each cell, none crossing cell boundaries, three-quarter "
    "elevated view from above. {rows} Dense tile, timber, brick, lantern, window and prop "
    "details, warm earthy palette, thick dark outlines, small crisp pixels, no "
    "anti-aliasing. No sky, no ground, no scenery. No text, people, numbers or borders. "
    "One atlas image only."
)
NEG = (
    "sky, clouds, blue sky, sun, ground, dirt, grass, floor, scenery, landscape, trees, "
    "foliage, horizon, vignette, gradient background, neon, oversaturated, purple sky, "
    "teal, photo, realistic, 3d render, blurry, anti-aliasing, smooth gradient, "
    "text, watermark, signature, numbers, ui, border, frame, multiple buildings, "
    "cropped, zoomed in, close-up, jpeg artifacts, low quality"
)


# ---------------------------------------------------------------- workflow


def build(prompt, negative, seed, size, steps, cfg, batch, lora_w,
          ref, ip_w, ip_type, ip_start, ip_end, init=None, denoise=1.0,
          controlnet=None, cn_image=None, cn_strength=0.7,
          cn_start=0.0, cn_end=0.8, height=0):
    wf = {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "LoraLoader",
              "inputs": {"model": ["1", 0], "clip": ["1", 1], "lora_name": LORA,
                         "strength_model": lora_w, "strength_clip": lora_w}},
        "3": {"class_type": "CLIPTextEncode",
              "inputs": {"text": prompt, "clip": ["2", 1]}},
        "4": {"class_type": "CLIPTextEncode",
              "inputs": {"text": negative, "clip": ["2", 1]}},
    }
    pos_src = ["3", 0]
    neg_src = ["4", 0]

    if controlnet and cn_image:
        # 用深度圖把 3/4 俯視的攝影機角度鎖死。
        # 純文字生圖控制不住角度，這一步是關鍵。
        wf["cn_img"] = {"class_type": "LoadImage", "inputs": {"image": cn_image}}
        wf["cn_load"] = {"class_type": "ControlNetLoader",
                         "inputs": {"control_net_name": controlnet}}
        wf["cn_apply"] = {"class_type": "ControlNetApplyAdvanced",
                          "inputs": {"positive": pos_src, "negative": neg_src,
                                     "control_net": ["cn_load", 0],
                                     "image": ["cn_img", 0],
                                     "strength": cn_strength,
                                     "start_percent": cn_start,
                                     "end_percent": cn_end}}
        pos_src, neg_src = ["cn_apply", 0], ["cn_apply", 1]

    if init:
        # img2img：用真的 3/4 建築當底圖，角度就是對的
        wf["5"] = {"class_type": "LoadImage", "inputs": {"image": init}}
        wf["5b"] = {"class_type": "VAEEncode",
                     "inputs": {"pixels": ["5", 0], "vae": ["1", 2]}}
        latent = ["5b", 0]
    else:
        wf["5"] = {"class_type": "EmptyLatentImage",
                   "inputs": {"width": size, "height": height or size,
                              "batch_size": batch}}
        latent = ["5", 0]

    model_src = ["2", 0]
    if ref:
        wf["6"] = {"class_type": "CLIPVisionLoader",
                   "inputs": {"clip_name": CLIP_VISION}}
        wf["7"] = {"class_type": "LoadImage", "inputs": {"image": ref}}
        wf["8"] = {"class_type": "IPAdapterModelLoader",
                   "inputs": {"ipadapter_file": IPADAPTER}}
        wf["9"] = {"class_type": "IPAdapterAdvanced",
                   "inputs": {"model": ["2", 0], "ipadapter": ["8", 0],
                              "image": ["7", 0], "clip_vision": ["6", 0],
                              "weight": ip_w, "weight_type": ip_type,
                              "combine_embeds": "concat",
                              "start_at": ip_start, "end_at": ip_end,
                              "embeds_scaling": "V only"}}
        model_src = ["9", 0]

    wf["10"] = {"class_type": "KSampler",
                "inputs": {"model": model_src, "positive": pos_src,
                           "negative": neg_src, "latent_image": latent,
                           "seed": seed, "steps": steps, "cfg": cfg,
                           "sampler_name": "dpmpp_2m", "scheduler": "karras",
                           "denoise": denoise}}
    wf["11"] = {"class_type": "VAEDecode",
                "inputs": {"samples": ["10", 0], "vae": ["1", 2]}}
    wf["12"] = {"class_type": "SaveImage",
                "inputs": {"images": ["11", 0], "filename_prefix": "mistvale/raw"}}
    return wf


# ---------------------------------------------------------------- http


def post(path, payload, timeout=300):
    req = urllib.request.Request(
        SERVER + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def get_json(path, timeout=60):
    with urllib.request.urlopen(SERVER + path, timeout=timeout) as r:
        return json.loads(r.read())


def get_image(ref):
    q = urllib.parse.urlencode({"filename": ref["filename"],
                                "subfolder": ref.get("subfolder", ""),
                                "type": ref.get("type", "output")})
    with urllib.request.urlopen(f"{SERVER}/view?{q}", timeout=180) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def wait_for(pid, timeout):
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = get_json(f"/history/{pid}")
        if pid in h:
            return h[pid], time.time() - t0
        time.sleep(0.5)
    return None, time.time() - t0


# ---------------------------------------------------------------- 後處理


def key_magenta(im: Image.Image, tol: float = 90.0, soft: float = 50.0):
    """去掉洋紅底 → 透明。回傳 (RGBA, 偵測到的背景色)。"""
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    bg = pixelize.border_bg(im.convert("RGB"), ring=max(2, im.size[0] // 40))
    rgb2, alpha = pixelize.chroma_alpha(
        rgb, bg, tol=tol, soft=soft, hue_key=True, hue_tol=45.0,
        sat_floor=0.18, flood=True, strong_frac=0.3)
    alpha = pixelize.harden_alpha(alpha, 0.5)
    rgba = np.dstack([np.clip(rgb2, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA"), bg


def main():
    ap = argparse.ArgumentParser(description="生 Mistvale 風格像素素材")
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--negative", default=NEG)
    ap.add_argument("--name", default=None, help="輸出檔名（預設用 seed）")
    ap.add_argument("--subject", default="tavern with a purple roof and barrels",
                    help="--atlas 以外時，要生的建築（會塞進模板）")
    ap.add_argument("--style", default="medieval village", help="風格形容詞")
    ap.add_argument("--atlas", action="store_true", help="改生 4x3 圖集")
    ap.add_argument("--rows", default=(
        "Row 1: green-roof market with fruit stalls, orange-roof bakery with bread "
        "oven, purple-roof tavern with barrels, ivory-roof herbal clinic with herb "
        "gardens. Row 2: slate-roof blacksmith with glowing forge, violet-roof magic "
        "academy with small tower, wooden training courtyard with archery targets, "
        "pale stone resurrection shrine with blue crystal. Row 3: small teal-roof "
        "hunter cottage, gold-roof bounty office with noticeboards, red-roof equipment "
        "refinement workshop with tools, stone dungeon cave with purple entrance."))
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--size", type=int, default=1024, help="正方形邊長")
    ap.add_argument("--height", type=int, default=0, help="非正方形用（例如角色 512x640）。0 = 跟 --size 一樣")
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--batch", type=int, default=1)
    ap.add_argument("--lora", type=float, default=0.8, help="pixel-art-xl 強度")
    ap.add_argument("--no-ref", action="store_true", help="不掛 title.png 風格參考")
    ap.add_argument("--ref", default="mistvale_ref_iso.png",
                    help="input/ 裡的風格參考圖。mistvale_ref_iso.png = 12 格去背建築；"
                         "mistvale_ref_one.png = 單一建築；mistvale_style_ref.png = title.png（有場景）")
    ap.add_argument("--ip", type=float, default=0.5, help="IPAdapter 強度（太高會把參考圖的構圖一起搬過來）")
    ap.add_argument("--ip-type", default="style transfer")
    ap.add_argument("--ip-start", type=float, default=0.0)
    ap.add_argument("--ip-end", type=float, default=0.7)
    ap.add_argument("--init", default=None,
                    help="img2img 底圖（input/ 裡的檔名）。用真的 3/4 建築當底圖才能保住俯視角度")
    ap.add_argument("--denoise", type=float, default=0.62,
                    help="img2img 改寫幅度：0.35 幾乎照抄、0.62 換材質配色、0.8 很自由但角度會跑掉")
    ap.add_argument("--controlnet", default=None,
                    help="ControlNet 模型檔名（models/controlnet/）。配 --cn-image 一起用")
    ap.add_argument("--cn-image", default=None, help="ControlNet 控制圖（input/ 裡的檔名）")
    ap.add_argument("--cn-strength", type=float, default=0.7, help="ControlNet 強度（角度鎖得夠不夠緊）")
    ap.add_argument("--cn-start", type=float, default=0.0)
    ap.add_argument("--cn-end", type=float, default=0.8,
                    help="ControlNet 什麼時候放手。太晚放手細節會被鎖死")
    ap.add_argument("--tol", type=float, default=90.0, help="洋紅底色差容許")
    ap.add_argument("--outdir", default="projects/mistvale/out")
    ap.add_argument("--no-key", action="store_true", help="不做去背")
    ap.add_argument("--timeout", type=int, default=1800)
    a = ap.parse_args()

    if a.prompt:
        prompt = a.prompt
    elif a.atlas:
        prompt = POS_ATLAS.format(rows=a.rows)
    else:
        prompt = POS_BUILDING.format(subject=a.subject, style=a.style)

    seed = a.seed if a.seed is not None else random.randint(0, 2**31 - 1)
    height = a.height or a.size
    wf = build(prompt, a.negative, seed, a.size, a.steps, a.cfg, a.batch,
               a.lora, None if a.no_ref else a.ref, a.ip, a.ip_type,
               a.ip_start, a.ip_end, init=a.init, denoise=a.denoise,
               controlnet=a.controlnet, cn_image=a.cn_image,
               cn_strength=a.cn_strength, cn_start=a.cn_start, cn_end=a.cn_end,
               height=height)

    print(f"seed={seed}  {a.size}x{height}  steps={a.steps}  cfg={a.cfg}  batch={a.batch}")
    print(f"lora={a.lora}  ip={'-' if a.no_ref else f'{a.ip} ({a.ip_type})'}")
    print(f"style ref: {'無' if a.no_ref else a.ref}")
    print(f"init: {a.init or '無（純文字生圖）'}" + (f"  denoise={a.denoise}" if a.init else ""))
    print(f"controlnet: {a.controlnet or '無'}"
          + (f"  圖={a.cn_image}  強度={a.cn_strength}  {a.cn_start}-{a.cn_end}" if a.controlnet else ""))
    print(f"subject: {a.subject if not a.atlas else '4x3 atlas'}")

    try:
        get_json("/system_stats", timeout=5)
    except Exception:
        print("\n連不上 ComfyUI，先跑 D:\\AI\\start_comfyui.bat")
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
        print(f"TIMEOUT {elapsed:.0f}s")
        return 1
    st = entry.get("status", {})
    if st.get("status_str") == "error":
        print("生成失敗：")
        for m in st.get("messages", []):
            print("  ", m)
        return 1

    refs = [im for out in entry.get("outputs", {}).values()
            for im in out.get("images", [])]
    print(f"完成 {elapsed:.1f}s，{len(refs)} 張")

    os.makedirs(a.outdir, exist_ok=True)
    for i, ref in enumerate(refs, 1):
        img = get_image(ref)
        stem = f"{a.name}_{i:02d}" if a.name else f"{seed}_{i:02d}"
        raw_path = os.path.join(a.outdir, f"{stem}_raw.png")
        img.save(raw_path)
        print(f"  {stem}_raw.png  {img.size}")

        if a.no_key:
            continue
        rgba, bg = key_magenta(img, tol=a.tol)
        bbox = rgba.getchannel("A").getbbox()
        if bbox:
            rgba = rgba.crop(bbox)
        out_path = os.path.join(a.outdir, f"{stem}.png")
        rgba.save(out_path)
        solid, warn = pixelize.bg_quality(bg)
        print(f"  {stem}.png  bg={bg} sat={solid:.2f} → {rgba.size}")
        if warn:
            print(f"    ⚠ {warn}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
