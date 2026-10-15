"""v2_client.py — PixelLab API v2（= MCP 背後那套）的角色 ＋ 内建動作模板流程。

v1 只能「一張圖 ＋ 自己給關節點」；**v2 才有角色庫與内建動作模板**：

    create  → POST /v2/create-character-v3   一張圖 → 4／8 方向角色
              （成本 ceil(w*h*directions / 65536)；128x128 四方向 = 2 次額度）
    animate → POST /v2/animate-character     對角色套**内建動作模板**，1 次額度/方向
    get     → GET  /v2/characters/{id}       看角色、方向圖、已生成的動畫
    download→ 把方向圖與動畫格抓成本機檔案
    job     → GET  /v2/background-jobs/{id}  背景工作狀態

内建動作模板（template_animation_id）有幾十種，常用的：
    walk, walking, walking-2 … walking-10, walking-4/6/8-frames,
    running-4/6/8-frames, sad-walk, scary-walk, crouched-walking,
    breathing-idle, fight-stance-idle-8-frames, cross-punch, high-kick,
    roundhouse-kick, leg-sweep, backflip, front-flip, two-footed-jump,
    running-jump, taking-punch, falling-back-death, getting-up, picking-up …

其他 v2 好用的端點：
    POST /v2/animate-with-text-v3      文字生動畫，最大 256x256，8 格＝走路建議值（〜2 次額度/方向）
    POST /v2/animate-pixminimax        MiniMax 模型，4–40 格（beta，Tier 1+）
    POST /v2/animate-with-skeleton-v3  **一幀一個骨架**（不是 v1 的 3 格）＋ first_frame_keypoints
                                       ＋ template_id（mannequin/bear/cat/dog/horse/lion）＝内建骨架
    POST /v2/estimate-skeleton         反推關節點（可用來把既有動畫的動作搬到別的角色）
    GET  /v2/characters/{id}/spritesheet  匯出成 sprite sheet
    GET  /v2/characters/{id}/zip          匯出 zip
    完整清單：https://api.pixellab.ai/v2/llms.txt ／ 規格：/v2/openapi.json（100 個端點）

注意：把一張**側面圖**當參考丟進 create-character-v3 時，它會被當成 south（正面朝鏡頭），
所以整套方向標籤會偏 90° —— 要自己重貼方向名。
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pl_client import b64_of, token  # noqa: E402

API = "https://api.pixellab.ai/v2"
REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE = REPO_ROOT / "output" / "pixellab" / "v2"
CACHE.mkdir(parents=True, exist_ok=True)


def headers() -> dict:
    return {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}


def post(path: str, payload: dict, timeout: int = 300, retries: int = 40, wait: float = 30.0) -> dict:
    """v2 的建立類端點回 **202 Accepted**（背景工作），不是 200。

    Tier 1 同時最多 8 個背景工作；撞到 429 就等一個跑完再送（自動重試）。
    """
    for attempt in range(1, retries + 1):
        response = requests.post(API + path, headers=headers(), json=payload, timeout=timeout)
        if response.status_code in (200, 201, 202):
            return response.json()
        if response.status_code == 429 and attempt < retries:
            print(f"  429（第 {attempt} 次）：{response.text[:120]} … 等 {wait:.0f}s")
            time.sleep(wait)
            continue
        raise SystemExit(f"POST {path} -> {response.status_code}\n{response.text[:800]}")
    raise SystemExit(f"POST {path} 重試 {retries} 次都失敗")


def get(path: str, timeout: int = 120) -> dict:
    response = requests.get(API + path, headers=headers(), timeout=timeout)
    if response.status_code != 200:
        raise SystemExit(f"GET {path} -> {response.status_code}\n{response.text[:800]}")
    return response.json()


def poll(job_id: str, label: str = "job", every: int = 5, limit: int = 1800) -> dict:
    started = time.time()
    while True:
        data = get(f"/background-jobs/{job_id}")
        status = data.get("status")
        print(f"  [{label}] {status} ({int(time.time() - started)}s)")
        if status in ("completed", "failed"):
            (CACHE / f"{label}-{job_id}.json").write_text(
                json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
            if status == "failed":
                print(json.dumps(data, ensure_ascii=False)[:800])
            return data
        if time.time() - started > limit:
            raise SystemExit("等太久")
        time.sleep(every)


def wait_job(data: dict, label: str) -> dict:
    """create/animate 回傳的欄位名不一致（單數或複數），這裡統一處理。"""
    job = data.get("background_job_id") or (data.get("background_job_ids") or [None])[0]
    if not job:
        print(json.dumps(data, ensure_ascii=False)[:500])
        raise SystemExit("回應裡找不到 job id")
    return poll(job, label=label)


def create(reference: Path | None, directions: int, view: str, description: str, name: str,
           size: int | None = None, proportions: str | None = None) -> dict:
    """reference 給 None 就是**純文字**生成（先用 Pixen 生 south 視圖，再 v3 轉 4/8 方向）。"""
    payload = {
        "description": description,
        "name": name,
        "n_directions": directions,
        "view": view,
        "template_id": "mannequin",
        "no_background": True,
        "seed": 7,
    }
    if reference is not None:
        payload["reference_image"] = {"type": "base64", "base64": b64_of(reference)}
    if size:
        payload["image_size"] = {"width": size, "height": size}
    if proportions:
        payload["proportions"] = proportions
    result = wait_job(post("/create-character-v3", payload), "create-character")
    character_id = (result.get("last_response") or {}).get("character_id")
    print("character_id:", character_id)
    return result


def make_image(description: str, size: int, model: str = "pixen", view: str = "high top-down",
               direction: str = "south", outline: str = "single color outline",
               detail: str = "highly detailed", seed: int = 7, negative: str = "",
               out_dir: Path | None = None) -> dict:
    """文字生單張圖。model: pixen（新版，最細）/ pixflux（<=400）/ pro-flash（Pro）。"""
    payload = {
        "description": description,
        "image_size": {"width": size, "height": size},
        "no_background": True,
        "seed": seed,
    }
    if model == "pixen":
        payload.update({"view": view, "direction": direction, "outline": outline, "detail": detail})
        path = "/create-image-pixen"
    elif model == "pixflux":
        payload.update({"view": view, "direction": direction, "outline": outline, "detail": detail,
                        "negative_description": negative})
        path = "/create-image-pixflux"
    else:
        path = "/create-image-pro-flash"
    data = post(path, payload)
    # pixen / pixflux 同步回傳 {"usage": ..., "image": {...}}；pro-flash 走背景工作
    if isinstance(data.get("image"), dict):
        images = [data["image"]]
        result = data
    else:
        job = data.get("background_job_id") or data.get("task_id")
        if not job:
            print(json.dumps(data, ensure_ascii=False)[:400])
            raise SystemExit("沒有 job id")
        result = poll(job, label=f"image-{model}")
        images = (result.get("last_response") or {}).get("images") or result.get("images") or []
    if out_dir and images:
        import base64 as _b64
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(images):
            raw = item.get("base64") if isinstance(item, dict) else str(item)
            if not raw:
                continue
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            (out_dir / f"image-{index}.png").write_bytes(_b64.b64decode(raw))
            print("  saved", out_dir / f"image-{index}.png")
    elif not images:
        print(json.dumps(result, ensure_ascii=False)[:600])
    return result


def styled(description: str, style_image: Path, size: int, seed: int = 7, out_dir: Path | None = None,
           reference: Path | None = None, style_usage: str = "", ref_usage: str = "",
           palette: bool = True, outline: bool = True, detail: bool = True, shading: bool = True) -> dict:
    """文字 ＋ **風格參考圖** 生圖（`/generate-image-v2` Pro）。style_image 最大 512x512。

    style_image 是「借畫風」（色盤／描邊／細節／陰影可分別開關）；
    reference_image 是「借主體」（例如上一版角色）。
    """
    from PIL import Image as _Image

    def _image_block(path: Path) -> dict:
        with _Image.open(path) as im:
            width, height = im.size
        return {"image": {"type": "base64", "base64": b64_of(path)}, "size": {"width": width, "height": height}}

    style_block = _image_block(style_image)
    if style_usage:
        style_block["usage_description"] = style_usage
    payload = {
        "description": description,
        "image_size": {"width": size, "height": size},
        "no_background": True,
        "seed": seed,
        "style_image": style_block,
        "style_options": {"color_palette": palette, "outline": outline, "detail": detail, "shading": shading},
    }
    if reference is not None:
        ref_block = _image_block(reference)
        if ref_usage:
            ref_block["usage_description"] = ref_usage
        payload["reference_images"] = [ref_block]
    data = post("/generate-image-v2", payload)
    job = data.get("background_job_id") or data.get("task_id")
    if not job:
        print(json.dumps(data, ensure_ascii=False)[:400])
        raise SystemExit("沒有 job id")
    result = poll(job, label="styled-image")
    images = (result.get("last_response") or {}).get("images") or result.get("images") or []
    if out_dir and images:
        import base64 as _b64
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(images):
            raw = item.get("base64") if isinstance(item, dict) else str(item)
            if not raw:
                continue
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            (out_dir / f"styled-{index}.png").write_bytes(_b64.b64decode(raw))
            print("  saved", out_dir / f"styled-{index}.png")
    return result


def edit_image(image: Path, description: str, out_dir: Path | None = None, seed: int = 7,
               model: str = "pixen") -> dict:
    """用文字改一張現成的像素圖（`/edit-image-pixen`：**保留姿態與像素風格**，只改你要的）。

    用途：拿身體模板去「穿上裝備」→ 再跟原圖 diff 就能抽裝備圖層。
    model="pro" 走 `/edit-image`（可指定輸出尺寸）。
    """
    from PIL import Image as _Image
    with _Image.open(image) as im:
        width, height = im.size
    payload = {
        "image": {"type": "base64", "base64": b64_of(image)},
        "description": description,
        "width": width,
        "height": height,
        "no_background": True,
        "seed": seed,
    }
    path = "/edit-image-pixen" if model == "pixen" else "/edit-image"
    if model != "pixen":
        payload["image_size"] = {"width": width, "height": height}
    data = post(path, payload)
    job = data.get("background_job_id") or data.get("task_id")
    if not job:
        print(json.dumps(data, ensure_ascii=False)[:400])
        raise SystemExit("沒有 job id")
    result = poll(job, label="edit-image")
    images = (result.get("last_response") or {}).get("images") or result.get("images") or []
    if out_dir and images:
        import base64 as _b64
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(images):
            raw = item.get("base64") if isinstance(item, dict) else str(item)
            if not raw:
                continue
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            (out_dir / f"edited-{index}.png").write_bytes(_b64.b64decode(raw))
            print("  saved", out_dir / f"edited-{index}.png")
    return result


def inpaint(image: Path, mask: Path, description: str, out_dir: Path | None = None, seed: int = 7,
            crop_to_mask: bool = False) -> dict:
    """遮罩重畫（`/inpaint-v3`）：遮罩白色＝要重畫的區域，其餘保留。

    用途：把身體的某個部位（軀幹／腳／手）遮起來，請模型「在那裡畫上裝備」——
    因為其他像素不動，所以可以直接跟原圖 diff 抽出裝備圖層。
    """
    from PIL import Image as _Image

    def _block(path: Path) -> dict:
        with _Image.open(path) as im:
            width, height = im.size
        return {"image": {"type": "base64", "base64": b64_of(path)}, "size": {"width": width, "height": height}}

    payload = {
        "description": description,
        "inpainting_image": _block(image),
        "mask_image": _block(mask),
        "no_background": True,
        "crop_to_mask": crop_to_mask,
        "seed": seed,
    }
    data = post("/inpaint-v3", payload)
    job = data.get("background_job_id") or data.get("task_id")
    if not job:
        print(json.dumps(data, ensure_ascii=False)[:400])
        raise SystemExit("沒有 job id")
    result = poll(job, label="inpaint")
    images = (result.get("last_response") or {}).get("images") or result.get("images") or []
    if out_dir and images:
        import base64 as _b64
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(images):
            raw = item.get("base64") if isinstance(item, dict) else str(item)
            if not raw:
                continue
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            (out_dir / f"inpainted-{index}.png").write_bytes(_b64.b64decode(raw))
            print("  saved", out_dir / f"inpainted-{index}.png")
    return result


def transfer_outfit(dressed: Path, frames: list[Path], out_dir: Path | None = None, seed: int = 7,
                    instructions: str = "", no_background: bool = True) -> dict:
    """把一套外觀（`dressed` 參考圖）套到整段動畫的所有格（`/transfer-outfit-v2`，一次 2–16 格）。"""
    from PIL import Image as _Image
    with _Image.open(frames[0]) as im:
        width, height = im.size
    payload = {
        "reference_image": {
            "image": {"type": "base64", "base64": b64_of(dressed)},
            "size": {"width": _Image.open(dressed).width, "height": _Image.open(dressed).height},
        },
        "frames": [{"image": {"type": "base64", "base64": b64_of(f)},
                    "size": {"width": _Image.open(f).width, "height": _Image.open(f).height}} for f in frames],
        "image_size": {"width": width, "height": height},
        "no_background": no_background,
        "seed": seed,
    }
    if instructions:
        payload["additional_instructions"] = instructions
    data = post("/transfer-outfit-v2", payload)
    job = data.get("background_job_id") or data.get("task_id")
    if not job:
        print(json.dumps(data, ensure_ascii=False)[:400])
        raise SystemExit("沒有 job id")
    result = poll(job, label="transfer-outfit", every=8, limit=2400)
    response = result.get("last_response") or result
    images = response.get("images") or ([response["image"]] if response.get("image") else [])
    if out_dir and images:
        import base64 as _b64
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, item in enumerate(images):
            raw = item.get("base64") if isinstance(item, dict) else str(item)
            if not raw:
                continue
            if raw.startswith("data:"):
                raw = raw.split(",", 1)[1]
            (out_dir / f"frame-{index:02d}.png").write_bytes(_b64.b64decode(raw))
        print(f"  saved {len(images)} 格 → {out_dir}")
    return result


def create_state(character_id: str, edit: str, state_name: str = "", palette_lock: bool = True,
                 seed: int = 7) -> dict:
    """替既有角色做一個「狀態」（新裝備／新姿勢）：`/create-character-state`。

    同一個文字編輯會**一致套用到全部 4/8 方向**，結果存成同一 group 的新角色。
    成本約 10–25 次生成（依畫布大小）。之後就能對新角色生動作。
    """
    payload = {
        "character_id": character_id,
        "edit_description": edit,
        "use_color_palette_from_reference": palette_lock,
        "no_background": True,
        "seed": seed,
    }
    if state_name:
        payload["state_name"] = state_name
    data = post("/create-character-state", payload)
    job = data.get("background_job_id") or data.get("task_id")
    if not job:
        print(json.dumps(data, ensure_ascii=False)[:400])
        raise SystemExit("沒有 job id")
    result = poll(job, label="character-state", every=10, limit=2400)
    response = result.get("last_response") or result
    print("  new character_id:", response.get("character_id"))
    return result


def animate(character_id: str, directions: list[str], template: str | None = None,
            action: str = "walking", mode: str | None = None, frames: int = 8,
            freedom: int = 0) -> dict:
    """mode：
      template   —— 内建動作模板（`template`，1 gen/方向，但步幅小）
      v3         —— 文字描述動作（`action`），**走路用這個**，8 格標準
      pixminimax —— MiniMax 模型，4–40 格（beta）
      skeleton-v3—— 模板骨架套到角色身上（2–4 gen/方向）
    """
    payload = {
        "character_id": character_id,
        "directions": directions,
        "animation_name": template or action,
    }
    if mode:
        payload["mode"] = mode
    if template:
        payload["template_animation_id"] = template
    else:
        payload["action_description"] = action
        payload["frame_count"] = frames
    if freedom:
        payload["ai_freedom"] = freedom
    label = template or f"v3-{action}"
    return wait_job(post("/animate-character", payload), f"animate-{label}")


def show(character_id: str) -> dict:
    data = get(f"/characters/{character_id}")
    (CACHE / f"character-{character_id}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False),
                                                          encoding="utf-8")
    print(f"name={data.get('name')} status={data.get('status')} size={data.get('size')} "
          f"directions={data.get('directions')} animations={data.get('animation_count')}")
    for key, url in (data.get("rotation_urls") or {}).items():
        if url:
            print(f"  rotation {key}: {url.split('?')[0].split('/')[-1]}")
    for animation in data.get("animations") or []:
        for direction in animation.get("directions") or []:
            print(f"  animation {animation.get('animation_type')} [{direction.get('direction')}] "
                  f"{direction.get('frame_count')} 格")
    return data


def download(character_id: str, out_dir: Path) -> None:
    data = show(character_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    for key, url in (data.get("rotation_urls") or {}).items():
        if not url:
            continue
        (out_dir / f"rotation-{key}.png").write_bytes(requests.get(url, timeout=60).content)
    for animation in data.get("animations") or []:
        kind = (animation.get("animation_type") or "animation").replace(":", "-")
        for direction in animation.get("directions") or []:
            folder = out_dir / f"{kind}-{direction.get('direction')}"
            folder.mkdir(exist_ok=True)
            for index, url in enumerate(direction.get("frames") or []):
                (folder / f"frame-{index:02d}.png").write_bytes(requests.get(url, timeout=60).content)
            print(f"  {folder} {len(direction.get('frames') or [])} 格")
    print("→", out_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser("create", help="一張圖（或純文字）→ 4/8 方向角色")
    p_create.add_argument("reference", nargs="?", default=None, help="參考圖；省略＝純文字生成")
    p_create.add_argument("--directions", type=int, default=4)
    p_create.add_argument("--view", default="side", choices=["side", "low top-down", "high top-down"])
    p_create.add_argument("--desc", default="young warrior, silver hair, cream tunic, brown leather vest, brown boots")
    p_create.add_argument("--name", default="")
    p_create.add_argument("--size", type=int, default=None, help="輸出尺寸（純文字模式用，預設 64）")
    p_create.add_argument("--proportions", default=None,
                          help='比例 JSON，例如 {"type":"preset","name":"stylized"}（preset: default/chibi/cartoon/stylized/realistic_male/realistic_female/heroic）')

    p_animate = sub.add_parser("animate", help="生動作（預設 v3 文字模式；給 --template 才是内建模板）")
    p_animate.add_argument("character_id")
    p_animate.add_argument("--template", default=None, help="内建模板 id；給了就走 template 模式")
    p_animate.add_argument("--mode", default=None,
                           choices=["template", "v3", "pixminimax", "skeleton-v3"], help="預設：有 template 就是 template，否則 v3")
    p_animate.add_argument("--action", default="walking", help="v3 模式的動作描述，例如 walking / running")
    p_animate.add_argument("--frames", type=int, default=8, help="v3 模式格數（4-16，2 的倍數）")
    p_animate.add_argument("--directions", default="south")
    p_animate.add_argument("--freedom", type=int, default=0, help="AI 自由度 0-900（只有 template 模式有效）")

    p_get = sub.add_parser("get")
    p_get.add_argument("character_id")

    p_download = sub.add_parser("download")
    p_download.add_argument("character_id")
    p_download.add_argument("out_dir")

    sub.add_parser("list")
    p_job = sub.add_parser("job")
    p_job.add_argument("job_id")

    p_state = sub.add_parser("state", help="替角色做新狀態（換裝備/新姿勢，全方向一致）")
    p_state.add_argument("character_id")
    p_state.add_argument("--edit", required=True, help="例如 \"wearing steel plate armour and holding a longsword\"")
    p_state.add_argument("--name", default="")
    p_state.add_argument("--seed", type=int, default=7)
    p_state.add_argument("--no-palette-lock", action="store_true")

    p_tr = sub.add_parser("transfer-outfit", help="把一套外觀套到整段動畫（2-16 格）")
    p_tr.add_argument("out_dir")
    p_tr.add_argument("--dressed", required=True, help="穿好裝備的參考圖")
    p_tr.add_argument("--frames", required=True, help="動畫格，逗號分隔（2-16 張）")
    p_tr.add_argument("--instructions", default="")
    p_tr.add_argument("--seed", type=int, default=7)

    p_inp = sub.add_parser("inpaint", help="遮罩重畫（白＝要重畫）")
    p_inp.add_argument("out_dir")
    p_inp.add_argument("--image", required=True)
    p_inp.add_argument("--mask", required=True)
    p_inp.add_argument("--desc", required=True)
    p_inp.add_argument("--seed", type=int, default=7)
    p_inp.add_argument("--crop", action="store_true", help="只回遮罩區（預設回整張）")

    p_edit = sub.add_parser("edit", help="用文字改一張圖（保留姿態/風格）")
    p_edit.add_argument("out_dir")
    p_edit.add_argument("--image", required=True)
    p_edit.add_argument("--desc", required=True)
    p_edit.add_argument("--model", default="pixen", choices=["pixen", "pro"])
    p_edit.add_argument("--seed", type=int, default=7)

    p_styled = sub.add_parser("styled", help="文字 ＋ 風格參考圖 生圖（Pro）")
    p_styled.add_argument("out_dir")
    p_styled.add_argument("--desc", required=True)
    p_styled.add_argument("--style", required=True, help="風格參考圖路徑（最大 512x512）")
    p_styled.add_argument("--style-usage", default="", help="這張風格圖要借什麼（給模型的說明）")
    p_styled.add_argument("--reference", default=None, help="主體參考圖（可選）")
    p_styled.add_argument("--ref-usage", default="")
    p_styled.add_argument("--size", type=int, default=192)
    p_styled.add_argument("--seed", type=int, default=7)
    p_styled.add_argument("--no-palette", action="store_true")
    p_styled.add_argument("--no-outline", action="store_true")
    p_styled.add_argument("--no-detail", action="store_true")
    p_styled.add_argument("--no-shading", action="store_true")

    p_image = sub.add_parser("image", help="文字生單張圖（pixen / pixflux / pro）")
    p_image.add_argument("out_dir")
    p_image.add_argument("--desc", required=True)
    p_image.add_argument("--size", type=int, default=160)
    p_image.add_argument("--model", default="pixen", choices=["pixen", "pixflux", "pro"])
    p_image.add_argument("--view", default="high top-down", choices=["side", "low top-down", "high top-down"])
    p_image.add_argument("--direction", default="south")
    p_image.add_argument("--outline", default="single color outline",
                         choices=["single color black outline", "single color outline", "selective outline", "lineless"])
    p_image.add_argument("--detail", default="highly detailed", choices=["low detail", "medium detail", "highly detailed"])
    p_image.add_argument("--seed", type=int, default=7)

    arguments = parser.parse_args()
    if arguments.command == "create":
        reference = Path(arguments.reference) if arguments.reference else None
        create(reference, arguments.directions, arguments.view, arguments.desc,
               arguments.name or (reference.stem if reference else "character"),
               arguments.size, arguments.proportions)
    elif arguments.command == "animate":
        animate(arguments.character_id, arguments.directions.split(","),
                arguments.template, arguments.action, arguments.mode, arguments.frames, arguments.freedom)
    elif arguments.command == "get":
        show(arguments.character_id)
    elif arguments.command == "download":
        download(arguments.character_id, Path(arguments.out_dir))
    elif arguments.command == "state":
        create_state(arguments.character_id, arguments.edit, arguments.name,
                     not arguments.no_palette_lock, arguments.seed)
    elif arguments.command == "transfer-outfit":
        transfer_outfit(Path(arguments.dressed), [Path(f) for f in arguments.frames.split(",")],
                        Path(arguments.out_dir), arguments.seed, arguments.instructions)
    elif arguments.command == "inpaint":
        inpaint(Path(arguments.image), Path(arguments.mask), arguments.desc,
                Path(arguments.out_dir), arguments.seed, arguments.crop)
    elif arguments.command == "edit":
        edit_image(Path(arguments.image), arguments.desc, Path(arguments.out_dir),
                   arguments.seed, arguments.model)
    elif arguments.command == "styled":
        styled(arguments.desc, Path(arguments.style), arguments.size, arguments.seed,
               out_dir=Path(arguments.out_dir), style_usage=arguments.style_usage,
               reference=Path(arguments.reference) if arguments.reference else None,
               ref_usage=arguments.ref_usage, palette=not arguments.no_palette,
               outline=not arguments.no_outline, detail=not arguments.no_detail,
               shading=not arguments.no_shading)
    elif arguments.command == "image":
        make_image(arguments.desc, arguments.size, arguments.model, arguments.view, arguments.direction,
                   arguments.outline, arguments.detail, arguments.seed, out_dir=Path(arguments.out_dir))
    elif arguments.command == "job":
        poll(arguments.job_id, label="job")
    else:
        print(json.dumps(get("/characters"), indent=1, ensure_ascii=False)[:4000])


if __name__ == "__main__":
    main()
