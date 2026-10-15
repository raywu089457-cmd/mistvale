"""rd_client.py — Retro Diffusion API 客戶端（像素圖／動畫，第三套生圖來源）。

    python rd_client.py credits
    python rd_client.py animate <輸入圖> <輸出目錄> --action walking [--frames 8] [--size 128] [--check]
    python rd_client.py rotate <輸入圖> <輸出目錄> [--size 64]      # 一張圖 → 8 方向轉盤

token：環境變數 `RD_TOKEN`，或 repo 根目錄 `.retrodiffusion-token`，或 `C:/Users/ray/.retrodiffusion-token`
（在 https://retrodiffusion.ai/app/devtools 建，**完整值只顯示一次**）

關鍵事實（2026-10-10 實測）：
  - 標頭是 **`X-RD-Token`**，不是 `Authorization: Bearer`
  - 基礎網址 `https://api.retrodiffusion.ai/v2`；POST `/inferences` → 回 task_id → 輪詢 `/inferences/tasks/{id}`
  - Advanced Animations：`input_image` **必填**，尺寸 32–256（8 的倍數），`frames_duration` 4/6/8/10/12/16
  - `return_spritesheet: true` 給 PNG 格狀圖（不然回 GIF）
  - 成本：走路 128 px / 8 格 = **$0.14**（≈1 credit）；`check_cost: true` 可免費試算
  - 送**原生像素尺寸**（我們遊戲的英雄圖是 4 倍放大：400×400 → 原生 100×100、角色 72 px）
  - 角色不要貼到畫布邊，四周留白；官方說**中性站姿**效果最好
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import time
from pathlib import Path

import requests

API = "https://api.retrodiffusion.ai/v2"
REPO_ROOT = Path(__file__).resolve().parents[3]
TOKEN_CANDIDATES = [REPO_ROOT / ".retrodiffusion-token", Path(r"C:\Users\ray\.retrodiffusion-token")]

ACTION_STYLES = {
    "walking": "rd_advanced_animation__walking",
    "idle": "rd_advanced_animation__idle",
    "jump": "rd_advanced_animation__jump",
    "crouch": "rd_advanced_animation__crouch",
    "attack": "rd_advanced_animation__attack",
    "destroy": "rd_advanced_animation__destroy",
    "subtle_motion": "rd_advanced_animation__subtle_motion",
    "custom_action": "rd_advanced_animation__custom_action",
    "rotate": "rd_advanced_animation__rotate",
}


def token() -> str:
    if os.environ.get("RD_TOKEN"):
        return os.environ["RD_TOKEN"].strip()
    for candidate in TOKEN_CANDIDATES:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    raise SystemExit(
        "找不到 Retro Diffusion token：設環境變數 RD_TOKEN，或寫入 "
        f"{TOKEN_CANDIDATES[0]}（從 https://retrodiffusion.ai/app/devtools 建）"
    )


def headers() -> dict:
    return {"X-RD-Token": token(), "Content-Type": "application/json"}


def b64(path: Path) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def credits() -> dict:
    response = requests.get(API + "/inferences/credits", headers=headers(), timeout=60)
    return response.json()


def run(payload: dict, out_dir: Path, label: str = "result") -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "request.json").write_text(
        json.dumps({k: v for k, v in payload.items() if not k.endswith("_image")}, indent=1), encoding="utf-8")
    response = requests.post(API + "/inferences", headers=headers(), json=payload, timeout=180)
    body = response.json() if response.content else {}
    if response.status_code != 200:
        raise SystemExit(f"POST /inferences -> {response.status_code}\n{json.dumps(body)[:500]}")
    task_id = body.get("task_id")
    if not task_id:
        raise SystemExit(f"沒拿到 task_id：{json.dumps(body)[:400]}")
    print("task:", task_id)
    started = time.time()
    while True:
        state = requests.get(API + f"/inferences/tasks/{task_id}", headers=headers(), timeout=60).json()
        print(f"  {state.get('status')} ({int(time.time() - started)}s)")
        if state.get("status") in ("succeeded", "failed", "cancelled"):
            (out_dir / "task.json").write_text(json.dumps(state, indent=1, ensure_ascii=False), encoding="utf-8")
            result = state.get("result") or {}
            print("  成本", result.get("balance_cost"), "credits", result.get("credit_cost"))
            saved = []
            for index, raw in enumerate(result.get("base64_images") or []):
                data = raw.split(",", 1)[1] if raw.startswith("data:") else raw
                path = out_dir / f"{label}-{index}.png"
                path.write_bytes(base64.b64decode(data))
                saved.append(path)
                print("  saved", path)
            for index, item in enumerate(result.get("outputs") or []):
                url = item.get("url") if isinstance(item, dict) else str(item)
                suffix = ".png" if url.split("?")[0].endswith(".png") else ".gif"
                path = out_dir / f"{label}-url-{index}{suffix}"
                path.write_bytes(requests.get(url, timeout=120).content)
                saved.append(path)
                print("  saved", path)
            return {"state": state, "saved": saved}
        if time.time() - started > 900:
            raise SystemExit("等太久")
        time.sleep(5)


def animate(image: Path, out_dir: Path, action: str, frames: int, size: int, seed: int,
            check_only: bool) -> None:
    payload = {
        "prompt": "",
        "prompt_style": ACTION_STYLES[action],
        "width": size,
        "height": size,
        "num_images": 1,
        "frames_duration": frames,
        "input_image": b64(image),
        "return_spritesheet": True,
        "seed": seed,
    }
    estimate = requests.post(API + "/inferences", headers=headers(), json={**payload, "check_cost": True}, timeout=120)
    print("成本試算:", json.dumps(estimate.json(), ensure_ascii=False)[:200])
    if check_only:
        return
    run(payload, out_dir, label=action)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("credits", help="查餘額")

    p_anim = sub.add_parser("animate", help="一張圖 → 動作（Advanced Animations）")
    p_anim.add_argument("input_image")
    p_anim.add_argument("out_dir")
    p_anim.add_argument("--action", default="walking", choices=sorted(ACTION_STYLES))
    p_anim.add_argument("--frames", type=int, default=8, choices=[4, 6, 8, 10, 12, 16])
    p_anim.add_argument("--size", type=int, default=128, help="輸出尺寸（要跟輸入圖同尺寸）")
    p_anim.add_argument("--seed", type=int, default=42)
    p_anim.add_argument("--check", action="store_true", help="只試算成本")

    p_gen = sub.add_parser("gen", help="吃文字的樣式（例：battle_sprites 四方向＋待機/走路/跳/攻擊）")
    p_gen.add_argument("out_dir")
    p_gen.add_argument("--style", required=True, help="prompt_style，例如 rd_animation__battle_sprites")
    p_gen.add_argument("--prompt", required=True)
    p_gen.add_argument("--size", type=int, default=64)
    p_gen.add_argument("--seed", type=int, default=42)
    p_gen.add_argument("--check", action="store_true")
    p_gen.add_argument("--input-image", default=None, help="需要輸入圖的樣式才給")

    p_rotate = sub.add_parser("rotate", help="一張圖 → 8 方向")
    p_rotate.add_argument("input_image")
    p_rotate.add_argument("out_dir")
    p_rotate.add_argument("--size", type=int, default=128)

    arguments = parser.parse_args()
    if arguments.command == "credits":
        print(json.dumps(credits(), ensure_ascii=False))
    elif arguments.command == "animate":
        animate(Path(arguments.input_image), Path(arguments.out_dir), arguments.action,
                arguments.frames, arguments.size, arguments.seed, arguments.check)
    elif arguments.command == "gen":
        payload = {
            "prompt": arguments.prompt,
            "prompt_style": arguments.style,
            "width": arguments.size,
            "height": arguments.size,
            "num_images": 1,
            "seed": arguments.seed,
        }
        if arguments.input_image:
            payload["input_image"] = b64(Path(arguments.input_image))
        estimate = requests.post(API + "/inferences", headers=headers(),
                                 json={**payload, "check_cost": True}, timeout=120)
        print("成本試算:", json.dumps(estimate.json(), ensure_ascii=False)[:200])
        if not arguments.check:
            run(payload, Path(arguments.out_dir), label=arguments.style.split("__")[-1])
    elif arguments.command == "rotate":
        image = Path(arguments.input_image)
        payload = {
            "prompt": "",
            "prompt_style": ACTION_STYLES["rotate"],
            "width": arguments.size,
            "height": arguments.size,
            "num_images": 1,
            "input_image": b64(image),
            "remove_bg": True,
            "return_spritesheet": True,
        }
        run(payload, Path(arguments.out_dir), label="rotate")


if __name__ == "__main__":
    main()
