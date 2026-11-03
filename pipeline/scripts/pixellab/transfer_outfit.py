"""transfer_outfit.py — T33: dress paladin frames in one armour design with PixelLab
`POST /v2/transfer-outfit-v2` (Pro), then keep the raw job JSON for the price ledger.

Token: PIXELLAB_TOKEN only (never falls back to ~/.pixellab-token = account 1).
Account 2 on this machine is ~/.pixellab-token2; the caller exports it.

Subcommands
  balance                       GET /v2/balance, prints JSON, appends to the ledger log
  prepare                       cut idle / walk / attack frames out of the paladin sheet and build
                                the outfit reference (paladin idle + T31 l0veyou v2 items) into
                                output/pixellab/layers/inputs/
  dress --action walk --frames 0,1,2 [--tag walk-a] [--cap 0.60]
                                ONE transfer-outfit-v2 call; refuses to start if the ledger's
                                cumulative USD + the last measured call cost would pass --cap.

T36: the bare-body base under the dressed frames (its own ledger, its own guard)
  bare                          ONE edit-image-pixen call on the dressed idle frame -> base/ref.png
  baseframes --action walk --frames 0,1,2 --tag walk-a
                                ONE transfer-outfit-v2 call with reference = base/ref.png and the
                                DRESSED T33 frames as input -> base/<action>/<tag>/
  spend                         print output/pixellab/layers/base/spend.json

Every paid call under T36 is guarded in code: output/pixellab/layers/base/spend.json holds the
running USD, and a call is refused when cumulative + $0.08 would pass the $0.70 hard cap. There is
no override flag on purpose.

Every T33 call writes output/pixellab/layers/<action>/<tag>/ (frames + job.json + request.json) and
adds one entry to output/pixellab/layers/ledger.json; T36 calls write into layers/base/ and the
base ledger instead, so the T33 raw outputs are never touched.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import time
from pathlib import Path

import requests
from PIL import Image

API = "https://api.pixellab.ai/v2"
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "output" / "pixellab" / "layers"
INPUTS = OUT / "inputs"
LEDGER = OUT / "ledger.json"
SHEET = ROOT / "assets" / "heroes" / "paladin.png"
SHEET_META = ROOT / "assets" / "heroes" / "paladin.json"
# T31 l0veyou v2 set, already placed on the sheet grid by place_layer_items.py.
L0V2_DIR = ROOT / "output" / "layer-demo" / "assets" / "layers"
SLOTS = ["chest", "helmet", "cape", "shield", "weapon"]

# ---- T36 bare-body base -------------------------------------------------
BASE = OUT / "base"
SPEND = BASE / "spend.json"
CAP_USD = 0.70        # T36 hard cap, approved by the user for account 2
UNIT_USD = 0.08       # one paid call at these sizes (T33 measured 10 generations = $0.08)
BARE = ("plain dark linen undershirt and dark trousers, bare head with short dark hair, "
        "no helmet, no plate armour, no cape, no shield, empty hands, holding nothing")


def token() -> str:
    tok = os.environ.get("PIXELLAB_TOKEN", "").strip()
    if not tok:
        raise SystemExit("PIXELLAB_TOKEN is not set; account 1 is forbidden on this card")
    return tok


def headers() -> dict:
    return {"Authorization": f"Bearer {token()}", "Content-Type": "application/json"}


def ledger() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    return {"calls": [], "balance": []}


def save_ledger(data: dict) -> None:
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    LEDGER.write_text(json.dumps(data, indent=1), encoding="utf-8")


def spend(entries: dict) -> float:
    return round(sum(float(c.get("usd") or 0.0) for c in entries["calls"]), 6)


# ------------------------------------------------------- T36 spend guard
# The guard is the rule: no judgement override, no "gate exception". It reads the base ledger,
# and refuses the next paid call when cumulative spend + one call would pass the hard cap.
def spend_ledger() -> dict:
    if SPEND.exists():
        return json.loads(SPEND.read_text(encoding="utf-8"))
    return {"cap_usd": CAP_USD, "unit_usd": UNIT_USD, "calls": []}


def guard(what: str) -> dict:
    entries = spend_ledger()
    spent = spend(entries)
    if spent + UNIT_USD > CAP_USD + 1e-9:
        raise SystemExit(f"spend guard: ${spent:.3f} spent + ${UNIT_USD:.2f} > cap ${CAP_USD:.2f}"
                         f" — refusing {what}")
    print(f"  guard ok: ${spent:.3f} + ${UNIT_USD:.2f} <= ${CAP_USD:.2f}  ({what})")
    return entries


def record(entries: dict, **entry) -> None:
    entry["at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    entries["calls"].append(entry)
    entries["cap_usd"] = CAP_USD
    entries["unit_usd"] = UNIT_USD
    entries["spent_usd"] = spend(entries)
    BASE.mkdir(parents=True, exist_ok=True)
    SPEND.write_text(json.dumps(entries, indent=1), encoding="utf-8")
    print(f"  spend ${entries['spent_usd']:.3f} / cap ${CAP_USD:.2f}")


# ------------------------------------------------------------------ balance
def cmd_balance(_args) -> None:
    r = requests.get(f"{API}/balance", headers=headers(), timeout=60)
    r.raise_for_status()
    data = r.json()
    print(json.dumps(data, ensure_ascii=False))
    entries = ledger()
    entries["balance"].append({"at": time.strftime("%Y-%m-%dT%H:%M:%S"), **data})
    save_ledger(entries)


# ------------------------------------------------------------------ prepare
def sheet_rows() -> dict:
    return json.loads(SHEET_META.read_text(encoding="utf-8"))["actions"]


def cut(action: str, frames: list[int], out_dir: Path, prefix: str) -> list[Path]:
    meta = sheet_rows()[action]
    cell = meta["cell"]
    sheet = Image.open(SHEET).convert("RGBA")
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for fi in frames:
        box = (fi * cell, meta["y"], fi * cell + cell, meta["y"] + cell)
        path = out_dir / f"{prefix}-{fi:02d}.png"
        sheet.crop(box).save(path)
        written.append(path)
    return written


def outfit_reference() -> Path:
    """Paladin idle frame dressed with the T31 l0veyou v2 items (the sheet already carries them
    in place, so cropping the idle cell out of both sheets gives the dressed reference)."""
    meta = sheet_rows()["idle"]
    cell, y = meta["cell"], meta["y"]
    base = Image.open(SHEET).convert("RGBA").crop((0, y, cell, y + cell))
    for slot in SLOTS:
        src = L0V2_DIR / f"paladin-l0v2-{slot}.png"
        if not src.exists():
            print(f"  (no {src.name})")
            continue
        base.alpha_composite(Image.open(src).convert("RGBA").crop((0, y, cell, y + cell)))
    path = INPUTS / "ref-outfit-idle100.png"
    base.save(path)
    # a 2x copy, in case a Pro model reads a 100 px character better at 200 px
    base.resize((cell * 2, cell * 2), Image.NEAREST).save(INPUTS / "ref-outfit-idle200.png")
    return path


def cmd_prepare(_args) -> None:
    INPUTS.mkdir(parents=True, exist_ok=True)
    for action in ("idle", "walk", "attack"):
        n = sheet_rows()[action]["frames"]
        cut(action, list(range(n)), INPUTS / action, action)
        print(f"{action}: {n} frames -> {INPUTS / action}")
    # the outfit reference crop uses the idle cell only, so also keep the raw frame it was built from
    cut("idle", [0], INPUTS / "idle", "idle-raw")
    ref = outfit_reference()
    print("reference:", ref, Image.open(ref).size)


# ------------------------------------------------------------------ payload
def b64_of(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def image_block(path: Path) -> dict:
    im = Image.open(path)
    return {"image": {"type": "base64", "base64": b64_of(path), "format": "png"},
            "size": {"width": im.width, "height": im.height}}


# ------------------------------------------------------------------ extract
def find_images(node, acc: list) -> None:
    if isinstance(node, dict):
        if "base64" in node and isinstance(node["base64"], str) and len(node["base64"]) > 200:
            acc.append(("b64", node["base64"], node.get("format") or "png"))
            return
        if "url" in node and isinstance(node["url"], str) and node["url"].startswith("http"):
            acc.append(("url", node["url"], "png"))
            return
        for v in node.values():
            find_images(v, acc)
    elif isinstance(node, list):
        for v in node:
            find_images(v, acc)


def write_frame(kind: str, data: str, out: Path, format_hint: str = "png") -> None:
    if kind == "b64":
        raw = data.split(",", 1)[1] if data.startswith("data:") else data
        img = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGBA")
    else:
        resp = requests.get(data, timeout=120)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGBA")
    img.save(out)


# ------------------------------------------------------------------ dress
def cmd_dress(args) -> None:
    frames = [int(x) for x in args.frames.split(",") if x.strip() != ""]
    if len(frames) < 2:
        raise SystemExit("transfer-outfit-v2 needs 2-16 frames per call")
    entries = ledger()
    last = entries["calls"][-1]["usd"] if entries["calls"] else 0.0
    if spend(entries) + float(last or 0.0) > args.cap:
        raise SystemExit(f"budget guard: spent {spend(entries)} + last call {last} > cap {args.cap}")

    out_dir = OUT / args.action / args.tag
    out_dir.mkdir(parents=True, exist_ok=True)
    frame_paths = [INPUTS / args.action / f"{args.action}-{fi:02d}.png" for fi in frames]
    missing = [str(p) for p in frame_paths if not p.exists()]
    if missing:
        raise SystemExit("missing input frames: " + ", ".join(missing))
    ref = INPUTS / args.ref
    if not ref.exists():
        raise SystemExit(f"missing reference image: {ref}")
    im = Image.open(frame_paths[0])
    payload = {
        "reference_image": image_block(ref),
        "frames": [image_block(p) for p in frame_paths],
        "image_size": {"width": im.width, "height": im.height},
        "seed": args.seed,
        "no_background": True,
        "additional_instructions": args.instructions,
    }
    (out_dir / "request.json").write_text(
        json.dumps({**payload,
                    "reference_image": {"file": ref.name, "size": [Image.open(ref).width, Image.open(ref).height]},
                    "frames": [{"file": p.name} for p in frame_paths]},
                   indent=1), encoding="utf-8")

    print(f"POST /transfer-outfit-v2  action={args.action} frames={frames} ref={ref.name} size={im.size}")
    r = requests.post(f"{API}/transfer-outfit-v2", headers=headers(), json=payload, timeout=900)
    if r.status_code != 202 and r.status_code != 200:
        print(f"HTTP {r.status_code}: {r.text[:800]}")
        (out_dir / "error.txt").write_text(f"HTTP {r.status_code}\n{r.text[:4000]}", encoding="utf-8")
        sys.exit(3)
    posted = r.json()
    job_id = posted["background_job_id"]
    (out_dir / "post.json").write_text(json.dumps(posted, indent=1), encoding="utf-8")
    print("  job", job_id, "post usage", posted.get("usage"))

    started = time.time()
    job = {}
    while time.time() - started < args.timeout:
        time.sleep(6)
        jr = requests.get(f"{API}/background-jobs/{job_id}", headers=headers(), timeout=120)
        if jr.status_code != 200:
            print(f"  poll HTTP {jr.status_code}: {jr.text[:200]}")
            continue
        job = jr.json()
        status = job.get("status")
        print(f"  [{int(time.time() - started)}s] {status}")
        if status in ("completed", "failed"):
            break
    (out_dir / "job.json").write_text(json.dumps(job, indent=1), encoding="utf-8")

    usage = job.get("usage") or posted.get("usage") or {}
    gens = usage.get("generations")
    # usage is billed in generations; every response also carries the USD value of that charge
    usd = float((job.get("last_response") or {}).get("usage_cost_usd") or usage.get("usd") or 0.0)
    if job.get("status") != "completed":
        print("  job did not complete:", job.get("status"))
    # the job carries `images` (the real frames) and `quantized_images` (the same frames again) —
    # take images first and only fall back to a generic scan when it is missing
    last = job.get("last_response") or {}
    images: list = []
    if isinstance(last.get("images"), list) and last["images"]:
        find_images(last["images"], images)
    else:
        find_images(last, images)
    saved = []
    for i, (kind, data, fmt) in enumerate(images):
        path = out_dir / f"frame-{i:02d}.png"
        try:
            write_frame(kind, data, path, fmt)
            saved.append(path.name)
        except Exception as exc:  # keep going; the raw job JSON still holds the payloads
            print("  frame save failed:", exc)
    print(f"  usage={usage} saved={len(saved)} frames -> {out_dir}")

    entries = ledger()
    entries["calls"].append({
        "action": args.action, "tag": args.tag, "frames": frames, "ref": ref.name,
        "job_id": job_id, "status": job.get("status"), "usd": usd, "generations": gens,
        "usage_raw": usage, "images": saved,
        "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })
    entries["spent_usd"] = spend(entries)
    save_ledger(entries)
    print(f"  cumulative spend ${entries['spent_usd']:.4f} / cap ${args.cap}")


# ------------------------------------------------- T36 base: shared runner
def strip_payload(node):
    """request.json keeps the shape of the call, never the base64 blobs."""
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if k == "base64" and isinstance(v, str):
                out[k] = f"<{len(v)} b64 chars>"
            else:
                out[k] = strip_payload(v)
        return out
    if isinstance(node, list):
        return [strip_payload(v) for v in node]
    return node


def usd_of(job: dict) -> tuple[float, dict]:
    """USD for one job. transfer-outfit-v2 reports usage_cost_usd; the pixen edit only reports
    generations, and T33 measured 10 generations = $0.08, so fall back on that rate."""
    usage = job.get("usage") or {}
    usd = (job.get("last_response") or {}).get("usage_cost_usd") or usage.get("usd")
    if not usd and usage.get("type") == "generations":
        usd = float(usage.get("generations") or 0.0) * UNIT_USD / 10.0
    return round(float(usd or 0.0), 6), usage


def run_job(path: str, payload: dict, out_dir: Path, timeout: float = 900.0,
            prefix: str = "frame") -> tuple[dict, list[str]]:
    """POST one paid call, wait for its background job, save every image it returned."""
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "request.json").write_text(json.dumps(strip_payload(payload), indent=1), encoding="utf-8")
    print(f"POST {path}")
    r = requests.post(API + path, headers=headers(), json=payload, timeout=900)
    if r.status_code not in (200, 202):
        (out_dir / "error.txt").write_text(f"HTTP {r.status_code}\n{r.text[:4000]}", encoding="utf-8")
        raise SystemExit(f"HTTP {r.status_code}: {r.text[:600]}")
    posted = r.json()
    (out_dir / "post.json").write_text(json.dumps(posted, indent=1), encoding="utf-8")
    job_id = posted.get("background_job_id") or posted.get("task_id")
    print("  job", job_id, "post usage", posted.get("usage"))
    job = posted
    if job_id:
        started = time.time()
        while time.time() - started < timeout:
            time.sleep(6)
            jr = requests.get(f"{API}/background-jobs/{job_id}", headers=headers(), timeout=120)
            if jr.status_code != 200:
                print(f"  poll HTTP {jr.status_code}: {jr.text[:200]}")
                continue
            job = jr.json()
            print(f"  [{int(time.time() - started)}s] {job.get('status')}")
            if job.get("status") in ("completed", "failed"):
                break
    (out_dir / "job.json").write_text(json.dumps(job, indent=1), encoding="utf-8")

    last = job.get("last_response") or {}
    images: list = []
    if isinstance(last.get("images"), list) and last["images"]:
        find_images(last["images"], images)
    elif isinstance(last.get("image"), (dict, list)) and last["image"]:
        find_images(last["image"], images)
    else:
        find_images(job, images)
    saved = []
    for i, (kind, data, fmt) in enumerate(images):
        p = out_dir / f"{prefix}-{i:02d}.png"
        try:
            write_frame(kind, data, p, fmt)
            saved.append(p.name)
        except Exception as exc:
            print("  image save failed:", exc)
    print(f"  usage={job.get('usage')} saved={len(saved)} -> {out_dir}")
    return job, saved


def dressed_frames(action: str) -> dict:
    """action frame index -> the T33 dressed frame that belongs to it (identical frames reused)."""
    slots: dict[int, Path] = {}
    for call in ledger()["calls"]:
        if call.get("action") != action:
            continue
        for i, fi in enumerate(call.get("frames") or []):
            if i < len(call.get("images") or []):
                slots[fi] = OUT / action / call["tag"] / call["images"][i]
    return slots


# ---------------------------------------------------- T36 step 2: base/ref.png
def cmd_bare(args) -> None:
    entries = guard("edit-image-pixen: bare-body reference")
    src = OUT / "idle" / "idle-a" / "frame-00.png"
    if not src.exists():
        raise SystemExit(f"missing dressed idle frame: {src}")
    im = Image.open(src)
    payload = {
        "image": {"type": "base64", "base64": b64_of(src), "format": "png"},
        "description": args.description,
        "width": im.width,
        "height": im.height,
        "seed": args.seed,
        "no_background": True,
    }
    out_dir = BASE / "ref"
    job, saved = run_job("/edit-image-pixen", payload, out_dir, args.timeout, prefix="edit")
    usd, usage = usd_of(job)
    record(entries, kind="edit-image-pixen", action="ref", tag="ref", frames=[0], images=saved,
           job_id=posted_id(out_dir), status=job.get("status"), usd=usd, usage_raw=usage,
           description=args.description)
    if not saved:
        raise SystemExit("edit-image-pixen returned no image")
    Image.open(out_dir / saved[0]).convert("RGBA").save(BASE / "ref.png")
    print("  reference:", BASE / "ref.png", Image.open(BASE / "ref.png").size)


def posted_id(out_dir: Path) -> str | None:
    p = out_dir / "post.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    return d.get("background_job_id") or d.get("task_id")


# ------------------------------------- T36 step 3: base frames per action
def cmd_baseframes(args) -> None:
    frames = [int(x) for x in args.frames.split(",") if x.strip() != ""]
    if len(frames) < 2:
        raise SystemExit("transfer-outfit-v2 needs 2-16 frames per call")
    entries = guard(f"transfer-outfit-v2 base {args.action} {args.tag} frames={frames}")
    ref = BASE / "ref.png"
    if not ref.exists():
        raise SystemExit(f"missing bare-body reference: {ref} (run `bare` first)")
    slots = dressed_frames(args.action)
    frame_paths = []
    for fi in frames:
        p = slots.get(fi)
        if not p or not p.exists():
            raise SystemExit(f"no dressed frame for {args.action} f{fi}")
        frame_paths.append(p)
    im = Image.open(frame_paths[0])
    payload = {
        "reference_image": image_block(ref),
        "frames": [image_block(p) for p in frame_paths],
        "image_size": {"width": im.width, "height": im.height},
        "seed": args.seed,
        "no_background": True,
        "additional_instructions": args.instructions,
    }
    out_dir = BASE / args.action / args.tag
    job, saved = run_job("/transfer-outfit-v2", payload, out_dir, args.timeout)
    usd, usage = usd_of(job)
    record(entries, kind="transfer-outfit-v2", action=args.action, tag=args.tag, frames=frames,
           inputs=[str(p.relative_to(ROOT)).replace("\\", "/") for p in frame_paths],
           images=saved, job_id=posted_id(out_dir), status=job.get("status"), usd=usd, usage_raw=usage)
    if job.get("status") != "completed":
        print("  job did not complete:", job.get("status"))


def cmd_spend(_args) -> None:
    entries = spend_ledger()
    print(json.dumps(entries, indent=1))
    print(f"total ${spend(entries):.3f} / cap ${CAP_USD:.2f}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("balance").set_defaults(fn=cmd_balance)
    sub.add_parser("prepare").set_defaults(fn=cmd_prepare)
    sub.add_parser("spend").set_defaults(fn=cmd_spend)
    d = sub.add_parser("dress")
    d.add_argument("--action", required=True)
    d.add_argument("--frames", required=True)
    d.add_argument("--tag", required=True)
    d.add_argument("--ref", default="ref-outfit-idle100.png")
    d.add_argument("--seed", type=int, default=None)
    d.add_argument("--instructions", default="side view, facing left; keep the walk pose of every frame")
    d.add_argument("--cap", type=float, default=0.60)
    d.add_argument("--timeout", type=float, default=900.0)
    d.set_defaults(fn=cmd_dress)
    b = sub.add_parser("bare")
    b.add_argument("--description", default=BARE)
    b.add_argument("--seed", type=int, default=7)
    b.add_argument("--timeout", type=float, default=900.0)
    b.set_defaults(fn=cmd_bare)
    bf = sub.add_parser("baseframes")
    bf.add_argument("--action", required=True)
    bf.add_argument("--frames", required=True)
    bf.add_argument("--tag", required=True)
    bf.add_argument("--seed", type=int, default=None)
    bf.add_argument("--instructions", default="side view, facing left; keep the exact pose, motion and ground line "
                                              "of every frame; only change the clothes to the plain bare-body look")
    bf.add_argument("--timeout", type=float, default=1200.0)
    bf.set_defaults(fn=cmd_baseframes)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
