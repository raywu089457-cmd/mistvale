# SPDX-License-Identifier: Apache-2.0
"""PixelLab backend for `sprite-gen gen` — subscription-credit route, native alpha.

PixelLab (api.pixellab.ai) is a pixel-art generation service with a credit
subscription (the `PIXELLAB_TOKEN` account Secret). Unlike grok Imagine it returns a
**genuinely transparent PNG** for character/object creation, so this adapter declares
`TRANSPARENCY_NATIVE` — no chroma keying is needed.

Route used here (the API has no single "prompt -> one image" call for characters; the
character call is the closest and is what this repo's character work wants):

    POST /v2/create-character-v3   (JSON)  -> background_job_ids -> GET /v2/background-jobs/{id}
    GET  /v2/characters/{id}               -> rotation_urls (south/east/... 8 directions)

The south-facing rotation is downloaded to `request.raw`; the other seven directions
are written next to it as `<stem>.<direction>.png` and listed in
`ProviderRun.extra["directions"]`, because the sprite-gen row pipeline wants every
view of the same character and re-generating them costs the same again.

With `--ref` images the first reference becomes `reference_image` (south-facing, 16–256px).

No vision model: `inspect_facing` / `inspect_image` fail loud rather than answer
wrongly (No Silent Fallback). Run the facing/logo checks on `codex`/`grok`.

Credential: `PIXELLAB_TOKEN`, else `~/.pixellab-token`. A call is billed to the
account's generation quota, so every call announces the charge on stderr first.
"""
from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from . import refusal, retry
from .base import (
    GEN_TIMEOUT_SECONDS,
    QUALITIES,
    TRANSPARENCY_NATIVE,
    GenRequest,
    ProviderRun,
    publish_png,
)

API_BASE = "https://api.pixellab.ai"
AUTH_ENV = "PIXELLAB_TOKEN"
TOKEN_FILES = (Path.home() / ".pixellab-token",)
# The one quality vocabulary level this backend can honour (the API takes no effort knob;
# `high` is the documented default for create-character-v3). Anything else is refused, not
# silently downgraded.
SUPPORTED_QUALITIES = ("auto", "high")
# PixelLab sizes the character call itself (128 or 256 px cells); the resolution tiers of
# grok Imagine do not map onto it, so this provider refuses the flag instead of ignoring it.
SUPPORTED_RESOLUTIONS: tuple[str, ...] = ()
DIRECTIONS = ("south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west")


def token() -> str:
    if os.environ.get(AUTH_ENV):
        return os.environ[AUTH_ENV].strip()
    for candidate in TOKEN_FILES:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    raise SystemExit(
        f"pixellab: no credential — set {AUTH_ENV} or write {TOKEN_FILES[0]} "
        "(the account Secret from https://www.pixellab.ai/account)"
    )


def _request(method: str, path: str, payload: dict[str, Any] | None = None, *, timeout: int = 120) -> dict[str, Any]:
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        API_BASE + path,
        data=body,
        method=method,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
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


class PixelLabProvider:
    """`sprite-gen gen --provider pixellab`."""

    name = "pixellab"
    transparency = TRANSPARENCY_NATIVE

    # -- generation ------------------------------------------------------------------
    def generate(self, request: GenRequest, workdir: Path) -> ProviderRun:
        if request.quality and request.quality not in SUPPORTED_QUALITIES:
            raise SystemExit(
                f"pixellab: --quality {request.quality} is not a level this backend honours "
                f"(it takes {', '.join(SUPPORTED_QUALITIES)}); refusing rather than downgrading"
            )
        if request.resolution:
            raise SystemExit(
                "pixellab: --resolution is a grok Imagine output tier; this backend sizes the "
                "character call itself (128/256 px cells) — drop the flag"
            )
        started = time.monotonic()
        announce = getattr(self, "_announce", None) or (lambda: None)
        announce()
        payload: dict[str, Any] = {
            "description": request.prompt,
            "image_size": {"width": 128, "height": 128},
            "view": "low top-down",
            "outline": "single color black outline",
            "shading": "basic shading",
            "detail": "medium detail",
        }
        if request.refs:
            reference = Path(request.refs[0])
            payload["reference_image"] = {
                "type": "base64",
                "base64": base64.b64encode(reference.read_bytes()).decode(),
            }
        created = _request("POST", "/v2/create-character-v3", payload)
        job_ids = created.get("background_job_ids") or ([created["background_job_id"]] if created.get("background_job_id") else [])
        character_id = created.get("character_id")
        if not job_ids and not character_id:
            raise SystemExit(f"pixellab: create-character-v3 returned neither a job id nor a character id: {json.dumps(created)[:200]}")
        for job_id in job_ids:
            deadline = time.monotonic() + GEN_TIMEOUT_SECONDS * 4
            while True:
                job = _request("GET", f"/v2/background-jobs/{job_id}")
                status = (job.get("status") or "").lower()
                if status in ("completed", "succeeded", "success"):
                    break
                if status in ("failed", "error"):
                    raise SystemExit(f"pixellab: job {job_id} failed: {json.dumps(job)[:200]}")
                if time.monotonic() > deadline:
                    raise SystemExit(f"pixellab: job {job_id} did not finish in {GEN_TIMEOUT_SECONDS * 4}s")
                time.sleep(5)
            character_id = job.get("character_id") or character_id
        if not character_id:
            raise SystemExit("pixellab: the job completed without a character id")
        character = _request("GET", f"/v2/characters/{character_id}")
        rotations = character.get("rotation_urls") or {}
        south = rotations.get("south")
        if not south:
            raise SystemExit(f"pixellab: character {character_id} has no south rotation")
        _download(south, request.raw)
        publish_png(request.raw, request.raw)
        extra: dict[str, Any] = {"character_id": character_id, "directions": {}, "rotation_urls": rotations}
        for direction, url in rotations.items():
            if direction == "south":
                extra["directions"][direction] = str(request.raw)
                continue
            dest = request.raw.with_name(f"{request.raw.stem}.{direction}.png")
            try:
                _download(url, dest)
                extra["directions"][direction] = str(dest)
            except Exception:  # a missing direction is reported, never silently invented
                extra.setdefault("directions_missing", []).append(direction)
        return ProviderRun(provider=self.name, elapsed_seconds=time.monotonic() - started,
                           model=request.model or "create-character-v3", session_id=character_id, extra=extra)

    # -- checks ----------------------------------------------------------------------
    def _no_vision(self, what: str) -> None:
        raise SystemExit(
            f"pixellab: no vision model, so the {what} check cannot run on this provider — "
            "run that check on codex or grok (--provider codex), or pass the flag that skips it"
        )

    def inspect_facing(self, path: Path, workdir: Path) -> tuple[str, dict[str, Any]]:
        self._no_vision("facing")

    def inspect_image(self, path: Path, workdir: Path, prompt: str, *, label: str = "inspect") -> tuple[str, dict[str, Any]]:
        self._no_vision(label)


def _announce_billing() -> None:
    print("pixellab: this call is billed to the account's generation quota (create-character-v3, 8 directions)", file=os.sys.stderr)


PixelLabProvider._announce = staticmethod(_announce_billing)  # type: ignore[attr-defined]
