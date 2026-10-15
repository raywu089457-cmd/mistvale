"""pl_client.py — PixelLab API v1 的小客戶端（骨架動畫那條線在用的）。

token 讀取順序：
  1. 環境變數 `PIXELLAB_TOKEN`
  2. repo 根目錄的 `.pixellab-token`（已列入 .gitignore）
  3. `C:/Users/ray/.pixellab-token`（本機預設）

v1 常用端點：
  GET  /balance              查餘額
  POST /estimate-skeleton    從圖反推 18 個關節點（＝PixelLab 的內建骨架估計，0.1 次額度）
  POST /animate-with-skeleton 照關節點生圖（**剛好 3 格**／16,32,64,128,256 正方形）
  POST /animate-with-text    文字生動畫（**只能 64x64**，一次回 4 格）
  POST /inpaint              遮罩重畫
  POST /rotate               轉方向

v2（角色 + 內建動作模板）在 v2_client.py。
"""
from __future__ import annotations

import base64
import io
import json
import os
import time
from pathlib import Path

import requests
from PIL import Image

API = "https://api.pixellab.ai/v1"
REPO_ROOT = Path(__file__).resolve().parents[3]
TOKEN_CANDIDATES = [REPO_ROOT / ".pixellab-token", Path(r"C:\Users\ray\.pixellab-token")]


def token() -> str:
    if os.environ.get("PIXELLAB_TOKEN"):
        return os.environ["PIXELLAB_TOKEN"].strip()
    for candidate in TOKEN_CANDIDATES:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    raise SystemExit(
        "找不到 PixelLab token：設環境變數 PIXELLAB_TOKEN，或寫入 "
        f"{TOKEN_CANDIDATES[0]}（從 https://www.pixellab.ai/account 的 Secret 複製）"
    )


def _headers() -> dict:
    return {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}


def _post(path: str, payload: dict, timeout: int = 600, retries: int = 8, wait: float = 20.0) -> dict:
    """POST，並自動重試 429（免費方案同時只能跑一個生成）與 5xx。"""
    started = time.time()
    for attempt in range(1, retries + 1):
        response = requests.post(API + path, headers=_headers(), json=payload, timeout=timeout)
        if response.status_code == 200:
            data = response.json()
            print(f"  POST {path} ok in {time.time() - started:.1f}s usage={data.get('usage')}")
            return data
        if response.status_code in (429, 500, 502, 503, 504) and attempt < retries:
            print(f"  {response.status_code}（第 {attempt} 次）… 等 {wait:.0f}s 再試")
            time.sleep(wait)
            continue
        raise SystemExit(f"POST {path} -> {response.status_code}\n{response.text[:800]}")
    raise SystemExit(f"POST {path} 重試 {retries} 次都失敗")


def _get(path: str, timeout: int = 60) -> dict:
    response = requests.get(API + path, headers=_headers(), timeout=timeout)
    if response.status_code != 200:
        raise SystemExit(f"GET {path} -> {response.status_code}\n{response.text[:400]}")
    return response.json()


def balance() -> dict:
    return _get("/balance")


def b64_of(path_or_image) -> str:
    """回傳不含 data: 前綴的純 base64。"""
    if isinstance(path_or_image, (str, Path)):
        raw = Path(path_or_image).read_bytes()
    else:
        buffer = io.BytesIO()
        path_or_image.save(buffer, format="PNG")
        raw = buffer.getvalue()
    return base64.b64encode(raw).decode("ascii")


def image_of(base64_string: str) -> Image.Image:
    if base64_string.startswith("data:"):
        base64_string = base64_string.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(base64_string))).convert("RGBA")


def save_images(images: list[dict], out_dir, prefix: str = "frame") -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for index, item in enumerate(images):
        path = out_dir / f"{prefix}-{index:02d}.png"
        image_of(item["base64"]).save(path)
        written.append(path)
    return written


def estimate_skeleton(image_path, out_json=None) -> list[dict]:
    data = _post("/estimate-skeleton", {"image": {"type": "base64", "base64": b64_of(image_path)}})
    if out_json:
        Path(out_json).write_text(json.dumps(data, indent=1), encoding="utf-8")
    return data["keypoints"]


def animate_with_skeleton(payload: dict) -> dict:
    return _post("/animate-with-skeleton", payload)


if __name__ == "__main__":
    print(json.dumps(balance(), ensure_ascii=False))
