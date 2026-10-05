"""cheaprouter.py — 直接呼叫 cheaprouter.cc 的 OpenAI 相容圖像 API(取代 l0veyou 瀏覽器)。

金鑰只從環境變數 CHEAPROUTER_KEY 讀,不寫進任何檔案。
注意:Cloudflare 會擋預設 User-Agent(403 / error 1010),一定要帶瀏覽器 UA。

用法:
  CHEAPROUTER_KEY=sk-... python pipeline/scripts/imagegen/cheaprouter.py <prompt.txt> <out.png> [--ref 參考圖.png ...] [--size 1536x1024] [--model gpt-image-2]
  有 --ref 走 /v1/images/edits(參考圖決定角色外觀),沒有走 /v1/images/generations。
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = "https://cheaprouter.cc/v1"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"


def _post(url, body: bytes, ctype: str, key: str, timeout=600):
    req = urllib.request.Request(url, data=body, headers={"Authorization": "Bearer " + key, "Content-Type": ctype, "User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=timeout))


def _multipart(fields: dict, files: list[tuple[str, Path]]):
    b = "----mv" + uuid.uuid4().hex; out = bytearray()
    for k, v in fields.items():
        out += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for k, p in files:
        out += f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{p.name}\"\r\nContent-Type: image/png\r\n\r\n".encode() + p.read_bytes() + b"\r\n"
    out += f"--{b}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={b}"


def background_ok(raw: bytes):
    """圖邊一圈 ≥90% 像素要接近純洋紅 #FF00FF 或純綠 #00FF00(去背管線的前提)。"""
    import io
    import numpy as np
    from PIL import Image
    a = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")).astype(int)
    ring = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    mag = (ring[:, 0] > 200) & (ring[:, 2] > 200) & (ring[:, 1] < 70)
    grn = (ring[:, 1] > 200) & (ring[:, 0] < 70) & (ring[:, 2] < 70)
    f = max(mag.mean(), grn.mean())
    return f >= .9, f"{f:.0%} of border is key color"


def generate(prompt: str, out: Path, refs=(), size="1536x1024", model="gpt-image-2", tries=4) -> float:
    key = os.environ.get("CHEAPROUTER_KEY")
    if not key: sys.exit("CHEAPROUTER_KEY not set")
    for attempt in range(1, tries + 1):
        t = time.time()
        try:
            if refs:
                body, ctype = _multipart({"model": model, "prompt": prompt, "size": size, "n": "1"}, [("image[]", Path(r)) for r in refs])
                r = _post(f"{BASE}/images/edits", body, ctype, key)
            else:
                r = _post(f"{BASE}/images/generations", json.dumps({"model": model, "prompt": prompt, "size": size, "n": 1}).encode(), "application/json", key)
            d = r["data"][0]
            raw = base64.b64decode(d["b64_json"]) if d.get("b64_json") else urllib.request.urlopen(urllib.request.Request(d["url"], headers={"User-Agent": UA}), timeout=180).read()
            ok, why = background_ok(raw)
            if not ok:   # 模型偶爾不理洋紅底(畫成暗色光暈)→ 去背會壞,重生
                print(f"  attempt {attempt}: background not flat magenta/green ({why}), retrying", file=sys.stderr); continue
            out.parent.mkdir(parents=True, exist_ok=True); out.write_bytes(raw)
            return time.time() - t
        except urllib.error.HTTPError as e:
            msg = e.read()[:300]
            print(f"  attempt {attempt}: HTTP {e.code} {msg!r}", file=sys.stderr)
        except Exception as e:  # 逾時、連線中斷
            print(f"  attempt {attempt}: {e!r}", file=sys.stderr)
        time.sleep(5 * attempt)
    sys.exit(f"failed: {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt"); ap.add_argument("out"); ap.add_argument("--ref", action="append", default=[])
    ap.add_argument("--size", default="1536x1024"); ap.add_argument("--model", default="gpt-image-2")
    a = ap.parse_args()
    dt = generate(Path(a.prompt).read_text(encoding="utf-8").strip(), Path(a.out), a.ref, a.size, a.model)
    print(f"saved {a.out} ({dt:.0f}s, {a.model}{' +ref' if a.ref else ''})")
