#!/usr/bin/env python3
"""pixellab_parts.py -- generate a class's DV2-rig 2x parts with PixelLab.

The prompt kit is docs/DV2-RIG-PROMPTS.md (sizes/anchors from dv2_rig.json). This
script is the executable version of it: one class at a time, four phases.

  gen      pixflux 32 px (48 px weapons) originals, south/east/north per part
  finish   premultiplied box downscale to DV2's 1x part heights + palette snap
  resize   one PixelLab /resize to the 2x part canvas (atlas_*_x2 cell size)
  install  copy into assets/paperdoll-dv2/src/x2/<class>/ with rig2x.py's names

  report   measure every part against dv2_rig.json and write a review sheet

Usage:
  python pipeline/scripts/dv2fmt/pixellab_parts.py gen paladin [--only body,head]
  python pipeline/scripts/dv2fmt/pixellab_parts.py finish paladin
  python pipeline/scripts/dv2fmt/pixellab_parts.py resize paladin
  python pipeline/scripts/dv2fmt/pixellab_parts.py install paladin
  python pipeline/scripts/dv2fmt/pixellab_parts.py report paladin
  python pipeline/scripts/dv2fmt/pixellab_parts.py all paladin

Scratch data lives in output/hv-parts2/<class>/{px,final,x2}/ (not committed);
only the install phase writes into assets/.  A phase skips work that is already
on disk, so an interrupted run can simply be started again.
"""
import argparse
import base64
import io
import json
import re
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "pixellab"))
import v2_client as V  # noqa: E402

WORK = ROOT / "output" / "hv-parts2"
SRC2X = ROOT / "assets" / "paperdoll-dv2" / "src" / "x2"
ART = "output/dv2fmt"

# ---------------------------------------------------------------- the prompt kit
TAIL = ("1-pixel dark outline, flat colours with 2-3 tones per material, light from "
        "top-left, no anti-aliasing, transparent background")
STYLE = "pixel art chibi RPG character part: "

# docs/DV2-RIG-PROMPTS.md sect.1.2 -- expressions are "same head, <edit>, everything else exactly unchanged"
EXPRESSIONS = {
    "blink": "both eyes closed as if blinking",
    "hurt": "a pained expression with the eyes squeezed shut and gritted teeth",
    "shout": "shouting with the mouth wide open and angry eyebrows",
    "happy": "a big happy grin with the eyes closed in joy",
    "ko": "knocked out with the eyes drawn as small x marks and a slack mouth",
}

# sect.1.5 -- body pose states (DV2 pose-part names from rig2x.POSE_PART)
POSES = {
    "stand": "standing with the feet slightly apart and the arms hanging a little out from the sides",
    "walk_l": "mid-step walking pose with the left foot forward and the right foot back, arms swinging slightly opposite to the legs",
    "walk_r": "mid-step walking pose with the right foot forward and the left foot back, arms swinging slightly opposite to the legs",
    "windup": "winding up: both wrist stumps together in front of the chest at shoulder height, torso leaning slightly back, feet apart",
    "chop": "lunging forward with the front knee bent, both arms reaching forward and down so the wrist stumps are in front of the body near the ankles",
    "swing": "the front arm stretched straight forward at shoulder height, shoulders twisted, feet apart in a wide stance",
    "hurt": "torso leaning back, arms flung out to the sides at waist height, one foot stepping back",
    "crouch": "crouching low with both knees bent and both arms held forward at waist height",
    "cheer": "both arms raised high above the shoulders and slightly forward, feet apart",
    "lying": "collapsed and lying flat on its back on the ground, arms and legs relaxed",
}
# sword/dagger/bow/staff classes carry extra poses (sect.1.5); rig2x maps them with fallbacks
EXTRA_POSES = {
    "thrust": "lunging with the front knee bent, the front arm stretched straight forward at knee height",
    "aim": "the front arm stretched straight forward at waist height, the back arm bent with its wrist in front of the chest, feet apart sideways",
    "aim_full": "the back arm pulled all the way back so its wrist is at the cheek, feet apart sideways",
    "cast": "the front arm raised forward above the shoulder, the other arm held out to the side",
    "cast_high": "both arms raised high above the head and slightly forward",
}

# sect.2 -- the class designs.  {HEAD} / {BODY} / {FIST} become prompt fragments.
CLASSES = {
    "paladin": {
        "type": "sword", "weapons": ["sword", "sword_fine"], "poses": ["thrust"],
        "head": "short tousled blond hair, blue eyes, fair skin",
        "body": "a slate-blue tunic under a silver plate chest piece with gold trim, a brown belt, steel greaves and steel boots",
        "fist": "tan skin and a steel plate gauntlet with a gold rim",
        "weapon": "a single straight steel longsword with a simple brown leather grip and a plain crossguard",
        "weapon_fine": "a single ornate steel longsword with a gold crossguard, a blue gem in the pommel and a gold-wrapped grip",
    },
    "archer": {
        "type": "bow", "weapons": ["bow", "bow_fine"], "poses": ["aim", "aim_full"],
        "head": "short tousled brown hair under a teal cloth headband, green eyes, tan skin",
        "body": "a sleeveless teal tunic, a brown leather quiver strap across the chest with arrows over the shoulder, an olive-green leggings and soft brown boots",
        "fist": "tan skin and a brown leather bracer edge",
        "weapon": "a single wooden recurve bow standing upright with its string on the right side, relaxed string, no arrow",
        "weapon_fine": "a single ornate wooden recurve bow with gold tips and a leather grip, string relaxed, no arrow",
    },
    "sorcerer": {
        "type": "staff", "weapons": ["staff", "staff_fine"], "poses": ["cast", "cast_high"],
        "head": "pale skin, brown eyes, little brown hair, a tall pointed violet wizard hat with a gold band and a bent tip",
        "body": "a violet robe with wide sleeves and lavender trim, a gold sash, the hem hides the feet",
        "fist": "pale skin peeking from a wide violet sleeve cuff",
        "weapon": "a single wooden staff with a round lavender crystal orb held in a wooden claw at the top",
        "weapon_fine": "a single dark wooden staff with a large glowing violet crystal held in gold prongs at the top",
    },
    "priest": {
        "type": "holystaff", "weapons": ["holystaff", "holystaff_fine"], "poses": ["cast", "cast_high"],
        "head": "brown eyes, a few light brown hair locks, a white hood with a gold edge framing the face",
        "body": "a long white robe with wide sleeves, a red sash, a gold medallion on the chest, a white shoulder cowl",
        "fist": "pale skin peeking from a wide white sleeve cuff",
        "weapon": "a single gold staff with an open gold ring halo at the top",
        "weapon_fine": "a single white-and-gold staff with a gold ring halo and a small sun emblem at the top",
    },
    "assassin": {
        "type": "dagger", "weapons": ["dagger", "dagger_fine"], "poses": ["thrust"],
        "head": "only the eyes visible between a near-black hood and a face mask that covers the nose and mouth, a light grey scarf under the chin",
        "body": "close-fitting near-black clothes, a short dark cloak over the shoulders, a light grey scarf, small belt pouches, dark boots",
        "fist": "dark leather glove",
        "weapon": "a single short steel dagger with a dark leather grip",
        "weapon_fine": "a single curved ornate dagger with a gold guard and a purple gem in the pommel",
    },
}

# 2x cell sizes / 1x part heights -- from docs/PAPERDOLL.md §22.6 and dv2_rig.json
BODY_1X_H = 9          # DV2 body_bbox height (median 8-9)
HEAD_1X_H = 10         # DV2 head content height
FIST_1X_H = 5          # fists ~11-13 px at 2x
TARGET_CONTENT_H = {"body": 18, "head": 20, "fist": 8, "weapon": 44}   # 2x content height to aim at


def src_dir(cls):
    return WORK / cls


def bbox(im):
    a = np.asarray(im.convert("RGBA"))[..., 3] > 8
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def content(im):
    b = bbox(im)
    return (b[2] - b[0], b[3] - b[1]) if b else (0, 0)


# ------------------------------------------------------------------------ gen
def head_prompt(cls, expr=None):
    c = CLASSES[cls]
    if expr:
        return (STYLE + "a big round chibi head only, no neck, no body, " + c["head"] + ", " + TAIL
                + " -- same head, " + EXPRESSIONS[expr] + ", everything else exactly unchanged")
    return (STYLE + "a big round chibi head only, no neck, no body, " + c["head"]
            + ", the chin is the lowest point, " + TAIL)


def body_prompt(cls, pose):
    c = CLASSES[cls]
    return (STYLE + "a short squat chibi body that is wider than it is tall, with no head and no hands, "
            + c["body"] + ", the top of the body is a collar at shoulder level with nothing above it, "
              "both arms end in round wrist stumps, very short thick legs, broad shoulders, "
            + POSES.get(pose, EXTRA_POSES.get(pose, pose)) + ", " + TAIL)


def fist_prompt(cls, view):
    c = CLASSES[cls]
    seen = ("seen from the side with the knuckles pointing to the right" if view == "east"
            else "seen from the front with the knuckles facing the viewer")
    return ("pixel art game sprite of one tiny closed fist only, no arm, " + c["fist"] + ", " + seen
            + ", 1-pixel dark outline, centered, transparent background, nothing else")


def weapon_prompt(cls, fine):
    c = CLASSES[cls]
    desc = c["weapon_fine" if fine else "weapon"] if (fine and "weapon_fine" in c) else c["weapon"]
    return desc + ", standing perfectly upright and vertical, the handle pointing straight down, chibi RPG style, centered, nothing else"


def master_jobs(cls, only):
    """The 10 parts that are generated from nothing (pixflux); everything else derives from these."""
    c = CLASSES[cls]
    jobs = []
    if not only or "head" in only:
        for d in ("south", "east", "north"):
            jobs.append(("head", head_prompt(cls), 32, d, "head"))
    if not only or "body" in only:
        for d in ("south", "east", "north"):
            jobs.append(("body_stand", body_prompt(cls, "stand"), 32, d, "body"))
    if not only or "fist" in only:
        jobs += [("fist_side", fist_prompt(cls, "east"), 32, "east", "fist"),
                 ("fist_front", fist_prompt(cls, "south"), 32, "south", "fist")]
    if not only or "weapon" in only:
        for fine in (False, True):
            nm = c["weapons"][1 if fine else 0]
            jobs.append((f"weapon_{nm}", weapon_prompt(cls, fine), 48, "south", "weapon"))
    return jobs


def body_edit_prompt(cls, pose):
    """<500 chars (the /edit-image-pixen description cap). Style comes from the master image."""
    desc = POSES.get(pose, EXTRA_POSES.get(pose, pose))
    return ("same headless chibi body, now " + desc
            + ", keep the same clothes, colours and 1-pixel outline, transparent background")


def derive_jobs(cls, only):
    """Pose / expression variants: edited from the matching master so palette + shape stay locked."""
    c = CLASSES[cls]
    jobs = []
    if not only or "body" in only:
        poses = ["walk_l", "walk_r", "windup", "chop", "swing", "hurt", "crouch", "cheer", "lying"] + c["poses"]
        for pose in poses:
            dirs = ("east",) if pose == "lying" else ("south", "east", "north")
            for d in dirs:
                jobs.append((f"body_{pose}", body_edit_prompt(cls, pose), "body_stand", d, "body"))
    if not only or "head" in only:
        for expr in EXPRESSIONS:
            for d in ("south", "east"):
                jobs.append((f"head_{expr}",
                             "same head, " + EXPRESSIONS[expr] + ", everything else exactly unchanged",
                             "head", d, "head"))
        jobs.append(("head_back",
                     "same head seen from directly behind, the back of the head only with no face, "
                     "keep the same hair, colours and 1-pixel outline, transparent background",
                     "head", "north", "head"))
    return jobs


def phase_gen(cls, only, workers=6):
    d = src_dir(cls)
    masters = master_jobs(cls, only)
    derived = derive_jobs(cls, only)

    def one(job):
        name, desc, size, direction, kind = job
        dst = d / "px" / name / f"{direction}.png"
        if dst.exists():
            return f"skip {name}/{direction}"
        if kind == "weapon":
            out = d / "px" / name
            out.mkdir(parents=True, exist_ok=True)
            if (out / "image-0.png").exists():
                return f"skip {name}"
            V.make_image(desc, size, model="pixflux", view="side", direction="south",
                         outline="single color black outline", detail="medium detail", seed=7, out_dir=out)
            return f"gen {name}"
        out = d / "px" / name / direction
        out.mkdir(parents=True, exist_ok=True)
        V.make_image(desc, size, model="pixflux", view="low top-down", direction=direction,
                     outline="single color black outline", detail="medium detail", seed=7, out_dir=out)
        (out / "image-0.png").replace(dst)
        for f in out.glob("*"):
            f.unlink()
        out.rmdir()
        return f"gen {name}/{direction}"

    def one_derived(job):
        name, desc, master, direction, kind = job
        dst = d / "px" / name / f"{direction}.png"
        if dst.exists():
            return f"skip {name}/{direction}"
        ref = d / "px" / master / f"{direction}.png"
        if not ref.exists():
            return f"MISSING master {ref}"
        out = d / "px" / name / direction
        out.mkdir(parents=True, exist_ok=True)
        V.edit_image(ref, desc[:499], out_dir=out)
        made = sorted(out.glob("edited-*.png"))
        if not made:
            return f"FAILED edit {name}/{direction}"
        made[0].replace(dst)
        for f in out.glob("*"):
            f.unlink()
        out.rmdir()
        return f"edit {name}/{direction}"

    print(f"--- masters ({len(masters)})", flush=True)
    with ThreadPoolExecutor(workers) as ex:
        for i, r in enumerate(ex.map(one, masters), 1):
            print(f"[m{i}/{len(masters)}] {r}", flush=True)
    print(f"--- derived ({len(derived)})", flush=True)
    with ThreadPoolExecutor(workers) as ex:
        for i, r in enumerate(ex.map(one_derived, derived), 1):
            print(f"[d{i}/{len(derived)}] {r}", flush=True)


# --------------------------------------------------------------------- finish
def shrink(src, dst, factor):
    """Premultiplied box downscale + palette snap + alpha threshold (see output/hv-parts/finalize.py)."""
    im = Image.open(src).convert("RGBA")
    side = max(1, round(im.width * factor)), max(1, round(im.height * factor))
    a = np.asarray(im).astype(float)
    a[..., :3] *= a[..., 3:4] / 255
    big = Image.fromarray(a.astype("uint8"), "RGBA").resize(side, Image.BOX)
    b = np.asarray(big).astype(float)
    al = b[..., 3:4]
    rgb = np.where(al > 0, b[..., :3] * 255 / np.maximum(al, 1), 0)
    src_a = np.asarray(im)
    pal = np.unique(src_a.reshape(-1, 4)[src_a[..., 3].reshape(-1) > 200][:, :3], axis=0).astype(float)
    if len(pal):
        q = pal[((rgb.reshape(-1, 1, 3) - pal[None]) ** 2).sum(2).argmin(1)].reshape(rgb.shape)
    else:
        q = rgb
    out = np.concatenate([q, np.where(al > 110, 255, 0)], 2).astype("uint8")
    out[out[..., 3] == 0] = 0
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(dst)


def kind_of(name):
    base = name.split("/")[0]
    if base.startswith("body"):
        return "body"
    if base.startswith("head"):
        return "head"
    if base.startswith("fist"):
        return "fist"
    return "weapon"


def px_parts(cls):
    """[(part, direction, path)] for every generated part under px/.

    Layout written by the gen phase: px/<part>/<direction>.png (flat). Older runs left
    px/<part>/<direction>/<direction>.png, so both shapes are accepted.
    Weapons are px/weapon_<name>/image-0.png and go through pixellab_weapon.py, not this file.
    """
    out, seen = [], set()
    for p in sorted((src_dir(cls) / "px").rglob("*.png")):
        rel = p.relative_to(src_dir(cls) / "px").parts
        if rel[0].startswith("weapon_"):
            continue
        if len(rel) == 2 and rel[1] == f"{rel[0]}.png":            # <part>/<part>.png is not ours
            continue
        if len(rel) == 2 and rel[1].endswith(".png"):              # <part>/<dir>.png
            part, direction = rel[0], rel[1][:-4]
        elif len(rel) == 3 and rel[2] == f"{rel[1]}.png":          # <part>/<dir>/<dir>.png
            part, direction = rel[0], rel[1]
        elif len(rel) == 4 and rel[3] == "image-0.png":            # <part>/<dir>/<dir>/image-0.png
            part, direction = rel[0], rel[1]
        else:
            continue
        if (part, direction) in seen:
            continue
        seen.add((part, direction))
        out.append((part, direction, p))
    return out


def phase_finish(cls):
    d = src_dir(cls)
    fin = d / "final"
    shutil.rmtree(fin, ignore_errors=True)
    for part, direction, p in px_parts(cls):
        kind = kind_of(part)
        target = {"body": BODY_1X_H, "head": HEAD_1X_H, "fist": FIST_1X_H}[kind]
        cw, ch = content(Image.open(p).convert("RGBA"))
        if not ch:
            print("empty!", p)
            continue
        dst = fin / part / f"{direction}.png"
        shrink(p, dst, target / ch)
        print(f"finish {part}/{direction} content {cw}x{ch} -> {content(Image.open(dst).convert('RGBA'))}")



# --------------------------------------------------------------------- resize
def b64_of(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return base64.b64encode(b.getvalue()).decode()


def pl_resize(im, w, h):
    payload = {
        "description": "pixel art game sprite",
        "reference_image": {"type": "base64", "base64": b64_of(im)},
        "reference_image_size": {"width": im.width, "height": im.height},
        "target_size": {"width": w, "height": h},
        "no_background": True,
        "view": "low top-down",
        "seed": 7,
    }
    r = V.post("/resize", payload)
    raw = r.get("image")
    if not isinstance(raw, dict):
        got = V.wait_job(r, "rs")
        lr = got.get("last_response") or got
        raw = lr.get("image") or (lr.get("images") or [None])[0]
    raw = raw["base64"] if isinstance(raw, dict) else raw
    return Image.open(io.BytesIO(base64.b64decode(raw.split(",", 1)[-1]))).convert("RGBA")


def normalise(im, want_h):
    """Bring the part's content to exactly want_h px with a deterministic box downscale.

    The PixelLab /resize adds real detail but its content size drifts from image to image;
    rig2x needs every head / body / fist of a class to be the same size, so the generative
    step only supplies detail and this step fixes the size (and re-snaps the palette).
    """
    cw, ch = content(im)
    if not ch:
        return im
    f = want_h / ch
    side = (max(1, round(im.width * f)), max(1, round(im.height * f)))
    a = np.asarray(im).astype(float)
    a[..., :3] *= a[..., 3:4] / 255
    sm = Image.fromarray(a.astype("uint8"), "RGBA").resize(side, Image.BOX)
    b = np.asarray(sm).astype(float)
    al = b[..., 3:4]
    rgb = np.where(al > 0, b[..., :3] * 255 / np.maximum(al, 1), 0)
    src = np.asarray(im)
    pal = np.unique(src.reshape(-1, 4)[src[..., 3].reshape(-1) > 200][:, :3], axis=0).astype(float)
    out = np.concatenate([rgb, np.where(al > 110, 255, 0)], 2).astype("uint8")
    if len(pal):
        flat = out[..., :3].reshape(-1, 3).astype(float)
        q = pal[((flat[:, None, :] - pal[None]) ** 2).sum(2).argmin(1)].reshape(out[..., :3].shape)
        out[..., :3] = q.astype("uint8")
    out[out[..., 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def resize_one(args):
    src, dst, kind = args
    im = Image.open(src).convert("RGBA")
    cw, ch = content(im)
    if not ch:
        return f"empty {src}"
    want = TARGET_CONTENT_H[kind]
    # /resize needs a >= 16 px reference: pad the tiny 1x part onto a 16 px canvas and let the
    # model paint it up at 4x, then fix the size deterministically (normalise).
    side = max(16, im.width, im.height)
    pad = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    pad.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    big = 64 if want >= 12 else 40
    try:
        out = pl_resize(pad, big, big)
    except Exception as e:                       # one bad part must not kill the whole class
        return f"FAILED {dst.parent.name}/{src.stem}: {e}"
    out = normalise(out, want)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst)
    return f"resize {dst.parent.name}/{src.stem} {cw}x{ch} -> {content(out)} (want h~{want})"




def phase_resize(cls, workers=6):
    d = src_dir(cls)
    jobs = []
    for p in sorted((d / "final").rglob("*.png")):
        name = p.parent.name
        kind = kind_of(name)
        dst = d / "x2" / name / p.name
        if dst.exists():
            continue
        jobs.append((p, dst, kind))
    with ThreadPoolExecutor(workers) as ex:
        for r in ex.map(resize_one, jobs):
            print(r, flush=True)


# -------------------------------------------------------------------- install
VIEW = {"south": "front", "east": "side", "north": "back"}


def install_map(cls):
    """scratch name -> installed name (rig2x.py / pixellab_weapon.py conventions)."""
    out = {}
    for png in sorted((src_dir(cls) / "x2").rglob("*.png")):
        name, direction = png.parent.name, png.stem
        if name.startswith("body_"):
            pose = name[len("body_"):]
            out[png] = f"body_{pose}_{VIEW[direction]}.png"
        elif name.startswith("head_"):
            out[png] = f"head_{name[len('head_'):]}_{VIEW[direction]}.png"
        elif name == "head":
            out[png] = f"head_normal_{VIEW[direction]}.png" if direction != "north" else "head_back.png"
        elif name == "fist_side":
            out[png] = "fist_side.png"
        elif name == "fist_front":
            out[png] = "fist_front.png"
    return out


def phase_install(cls, force=False):
    dst_dir = SRC2X / cls
    dst_dir.mkdir(parents=True, exist_ok=True)
    made = []
    for src, name in install_map(cls).items():
        dst = dst_dir / name
        if dst.exists() and not force:
            continue
        shutil.copy2(src, dst)
        made.append(name)
    print(f"installed {len(made)} parts into {dst_dir.relative_to(ROOT)}")
    for m in made:
        print("  ", m)
    note = dst_dir / "SOURCE.md"
    note.write_text(
        f"{cls.capitalize()} parts for the DV2 rig at 2x (docs/PAPERDOLL.md 22.6).\n"
        "Generated with PixelLab from the text prompts of docs/DV2-RIG-PROMPTS.md\n"
        "(pipeline/scripts/dv2fmt/pixellab_parts.py: gen -> finish -> resize -> install).\n"
        "No DV2 / Kairosoft image was used as input. Weapons: ../weapon_<name>.png via\n"
        "pipeline/scripts/dv2fmt/pixellab_weapon.py --x2.\n", encoding="utf-8")


# --------------------------------------------------------------------- report
def phase_report(cls):
    d = src_dir(cls)
    rig = json.loads((ROOT / "pipeline" / "scripts" / "dv2fmt" / "dv2_rig.json").read_text(encoding="utf-8"))
    rows = []
    for png in sorted((d / "x2").rglob("*.png")):
        im = Image.open(png).convert("RGBA")
        c = content(im)
        rows.append({"part": f"{png.parent.name}/{png.stem}", "canvas": list(im.size),
                     "content": list(c)})
    rep = {"class": cls, "targets_2x": {"body_content_h": TARGET_CONTENT_H["body"],
                                        "head_content_h": TARGET_CONTENT_H["head"],
                                        "fist_content_h": TARGET_CONTENT_H["fist"]},
           "parts": rows,
           "dv2_body_bbox_1x_sample": [s["body_bbox"] for r in rig["rows"][:4] for s in r["slots"]][:4]}
    out = ROOT / ART / "work" / f"parts_{cls}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, indent=1), encoding="utf-8")
    bad = [r for r in rows if not r["content"][0]]
    print(f"report -> {out}  parts={len(rows)} empty={len(bad)}")
    for b in bad:
        print("  EMPTY", b["part"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["gen", "finish", "resize", "install", "report", "all"])
    ap.add_argument("cls")
    ap.add_argument("--only", default="", help="gen phase: comma list of body,head,fist,weapon")
    ap.add_argument("--force", action="store_true", help="install: overwrite existing parts")
    a = ap.parse_args()
    cls = a.cls.lower()
    if cls not in CLASSES:
        sys.exit(f"unknown class {cls}; known: {', '.join(CLASSES)}")
    only = [x for x in a.only.split(",") if x]
    if a.phase in ("gen", "all"):
        phase_gen(cls, only)
    if a.phase in ("finish", "all"):
        phase_finish(cls)
    if a.phase in ("resize", "all"):
        phase_resize(cls)
    if a.phase in ("install", "all"):
        phase_install(cls, a.force)
    if a.phase in ("report", "all"):
        phase_report(cls)


if __name__ == "__main__":
    main()
