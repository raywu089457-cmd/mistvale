# SPDX-License-Identifier: Apache-2.0
"""PixelLab animation route — the video pipeline's replacement.

sprite-gen's video path films a still with Grok Imagine video and keys the clip frame
by frame (`docs/video-pipeline.md`). PixelLab has no video model, but it does not need
one: `POST /v2/characters/animations` (mode `v3`) animates a character the account
already owns and answers with **per-direction frames**, which is exactly what the row
pipeline downstream consumes.

What this module produces — the same shape the video path hands over, so curation,
chroma/alpha handling and the atlas export run unchanged:

    <out-dir>/<direction>/00.png … NN.png     the frames, one directory per direction
    <out-dir>/pixellab-animation.json         direction list, frame counts, action, model,
                                              character id, billed-per-direction note

Billing (docs measured 2026-10-20): `ceil(canvas² · frames / 65536)` generations **per
direction** — 128px·8f = 4, 256px·8f = 8 — so a 5-direction 8-frame set at 256px is 40
generations. The caller is told this on stderr before the first request leaves.

CLI:
    python -m sprite_gen.gen.pixellab_animation --character <id> --action walking \
        --directions south,east,south-east --frames 8 --size 128 --out-dir runs/walk [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API_BASE = "https://api.pixellab.ai"
AUTH_ENV = "PIXELLAB_TOKEN"
TOKEN_FILES = (Path.home() / ".pixellab-token",)
# The eight views the API answers with; the left-facing three are the mirror of the right.
DIRECTIONS = ("south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west")
# What the API calls the built-in actions (`animation_type` comes back as `v3:<action>`).
ACTIONS = ("walking", "walk", "attack", "skill", "idle", "death", "hurt", "victory", "run", "jump")
# v3 收的是動作的「文字描述」,不是代號;這些是各動作對應的描述(可以自己改字)。
ACTION_DESCRIPTIONS = {
    "walking": "walking cycle, arms swinging, steady pace",
    "walk": "walking cycle, arms swinging, steady pace",
    "run": "running cycle, leaning forward, fast pace",
    "attack": "heavy one-handed sword slash, wind-up then strike then recover",
    "skill": "casting a skill, raising the hand then releasing the spell",
    "idle": "idle breathing loop, subtle up and down motion",
    "death": "taking a fatal hit then falling to the ground",
    "hurt": "flinching backwards from a hit",
    "victory": "cheering with the weapon raised",
    "jump": "jumping up and landing",
}


def token() -> str:
    if os.environ.get(AUTH_ENV):
        return os.environ[AUTH_ENV].strip()
    for candidate in TOKEN_FILES:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    raise SystemExit(f"pixellab: no credential — set {AUTH_ENV} or write {TOKEN_FILES[0]}")


def _request(method: str, path: str, payload: dict[str, Any] | None = None, *, timeout: int = 120) -> dict[str, Any]:
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API_BASE + path, data=body, method=method,
                                 headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        if error.code == 429:
            raise SystemExit(f"pixellab: rate limited (429) — one generation at a time per account: {detail}")
        raise SystemExit(f"pixellab: HTTP {error.code} on {method} {path}: {detail}")


def _download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "sprite-gen/pixellab"})
    with urllib.request.urlopen(req, timeout=180) as response:
        dest.write_bytes(response.read())


def cost_per_direction(size: int, frames: int) -> int:
    """Generations billed per direction (the API's own formula)."""
    return math.ceil(size * size * frames / 65536)


def animate(*, character_id: str | None, action: str, directions: list[str], frames: int, size: int,
            out_dir: Path, reference_image: Path | None = None, dry_run: bool = False,
            description: str | None = None) -> dict[str, Any]:
    """Ask PixelLab for one action in `directions` and write the frames as rows."""
    unknown = [d for d in directions if d not in DIRECTIONS]
    if unknown:
        raise SystemExit(f"pixellab: unknown direction(s) {', '.join(unknown)}; expected {', '.join(DIRECTIONS)}")
    if action not in ACTIONS:
        raise SystemExit(f"pixellab: unknown action {action!r}; expected one of {', '.join(ACTIONS)}")
    per_direction = cost_per_direction(size, frames)
    plan = {"character_id": character_id, "action": action, "directions": directions, "frames": frames,
            "size": size, "cost_per_direction": per_direction, "cost_total": per_direction * len(directions)}
    print(f"pixellab: {len(directions)} direction(s) × {frames} frames at {size}px = "
          f"{plan['cost_total']} generations billed to the account quota", file=sys.stderr)
    if dry_run:
        return {**plan, "dry_run": True}
    if not character_id:
        raise SystemExit("pixellab: --character is required (create-character-v3 / the website gives the id; "
                         "an animation is applied to a character the account already owns)")
    # v3 的 schema:用 action_description(文字描述)而不是動作代號;尺寸由角色自己決定,
    # 沒有 image_size 這個欄位(2026-10-23 用 422 的 detail 實測出來)。
    payload: dict[str, Any] = {
        "character_id": character_id,
        "mode": "v3",
        "action_description": description or ACTION_DESCRIPTIONS.get(action, action),
        "frame_count": frames,
        "directions": directions,
    }
    if reference_image:
        payload["reference_image"] = {"type": "path", "path": str(reference_image)}
    created = _request("POST", "/v2/characters/animations", payload)
    group_id = created.get("animation_group_id")
    job_ids = created.get("background_job_ids") or ([created["background_job_id"]] if created.get("background_job_id") else [])
    if not job_ids:
        raise SystemExit(f"pixellab: characters/animations returned no job id: {json.dumps(created)[:200]}")
    deadline = time.monotonic() + 30 * 60
    while True:
        states = [_request("GET", f"/v2/background-jobs/{job_id}") for job_id in job_ids]
        if all((s.get("status") or "").lower() in ("completed", "succeeded", "success") for s in states):
            break
        failed = [s for s in states if (s.get("status") or "").lower() in ("failed", "error")]
        if failed:
            raise SystemExit(f"pixellab: animation job failed: {json.dumps(failed[0])[:200]}")
        if time.monotonic() > deadline:
            raise SystemExit("pixellab: animation did not finish in 30 minutes")
        time.sleep(8)

    character = _request("GET", f"/v2/characters/{character_id}")
    animations = character.get("animations") or []
    # 用建立時回傳的 animation_group_id 精準對應;對不到就**報錯**(以前會退回最後一個動畫,
    # 結果把 walking 的幀當成 attack 下載 —— 2026-10-23 踩過)。v3 的 animation_type 是
    # 自訂描述文字,不含動作代號,所以不能靠字串比對。
    wanted = next((a for a in animations if group_id and a.get("animation_group_id") == group_id), None)
    if not wanted:
        raise SystemExit(f"pixellab: the job finished but character {character_id} has no animation with "
                         f"group {group_id} (found {[(a.get('animation_type'), a.get('animation_group_id')) for a in animations]})")
    out_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, int] = {}
    for entry in wanted.get("directions") or []:
        direction = entry.get("direction")
        if direction not in directions:
            continue
        directory = out_dir / direction
        directory.mkdir(parents=True, exist_ok=True)
        for index, url in enumerate(entry.get("frames") or []):
            _download(url, directory / f"{index:02d}.png")
        written[direction] = len(entry.get("frames") or [])
    report = {**plan, "animation_type": wanted.get("animation_type"), "animation_group_id": wanted.get("animation_group_id"),
              "frames_written": written, "directions_missing": [d for d in directions if d not in written]}
    (out_dir / "pixellab-animation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="PixelLab animation route (replaces the Grok Imagine video path)")
    parser.add_argument("--character", help="character id the animation is applied to")
    parser.add_argument("--action", default="walking", choices=ACTIONS)
    parser.add_argument("--directions", default="south,east,south-east,north-east,north",
                        help="comma-separated; the left-facing views are the mirror of the right")
    parser.add_argument("--frames", type=int, default=8)
    parser.add_argument("--size", type=int, default=128, choices=(128, 256))
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--reference-image", type=Path)
    parser.add_argument("--description", help="override the action description (v3 takes a text description)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and the billed generations, call nothing")
    args = parser.parse_args(argv)
    report = animate(character_id=args.character, action=args.action,
                     directions=[d.strip() for d in args.directions.split(",") if d.strip()],
                     frames=args.frames, size=args.size, out_dir=Path(args.out_dir),
                     reference_image=args.reference_image, dry_run=args.dry_run,
                     description=args.description)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
