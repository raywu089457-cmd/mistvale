#!/usr/bin/env python3
"""phase6.py -- DV2 phase-6 art: one class description table drives every part (docs/DV2-PHASE6.md §2, docs/DV2-RIG-PROMPTS.md).

All art is ORIGINAL: PixelLab pixflux text prompts only (no DV2 / Kairosoft image as reference, init image, style image or palette).
Recipe = the accepted berserker recipe (docs/PAPERDOLL.md §22.6): 32x32 pixflux, one call per view (south=front, east=side,
north=back), view "low top-down", outline "single color black outline", detail "medium detail", seed 7.

  python phase6.py gen <class> <group> [--views ...]     groups: heads bodies fists poses2 cry female   (raw 32 px -> output/phase6/<class>/raw)
  python phase6.py finish <class>                        raw -> 2x canvases (head 25, body 21, fist 16), local outline-keeping downscale
  python phase6.py sheet <class> [name]                  QA review sheets (head on every body, x4 nearest) -> output/phase6/<class>/
  python phase6.py install <class> [--force]             copy the class set into assets/paperdoll-dv2/src/x2/<class>/ (never overwrites unless --force)
  python phase6.py ledger                                generations used so far (output/phase6/ledger.jsonl)

Downscale: PixelLab /resize costs 1 generation per part (as much as generating it) and adds colour noise; the local
"area-mode + outline priority" downscale (downscale()) keeps the palette and the 1-px outline at the ~0.7 scale used here and is free.
One scale per class and part kind (measured on the normal heads / stand bodies), so every pose and view of a class shares one scale.
"""
import argparse
import base64
import io
import json
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "pixellab"))
import v2_client as V  # noqa: E402

WORK = ROOT / "output" / "phase6"
SRC2X = ROOT / "assets" / "paperdoll-dv2" / "src" / "x2"
LEDGER = WORK / "ledger.jsonl"
VIEW = {"south": "front", "east": "side", "north": "back"}
DIRS = {v: k for k, v in VIEW.items()}

# ------------------------------------------------------------------ prompt kit
TAIL = "1-pixel dark outline, flat colours with 2-3 tones per material, light from top-left, no anti-aliasing, transparent background"
HEAD_PRE = "pixel art chibi RPG character part: a big round chibi head only, no neck, no body, "
BODY_PRE = "pixel art game sprite of a headless chibi body: only "
BODY_POST = ", arms ending in round stumps, nothing above the collar, empty space where the head would be, "
BODY_TAIL = ", 1-pixel dark outline, flat colours, transparent background"

EXPR = {
    "normal": "calm neutral expression",
    "blink": "both eyes closed as if blinking",
    "hurt": "pained expression with eyes squeezed shut and gritted teeth",
    "shout": "shouting fiercely with the mouth wide open and angry eyebrows",
    "happy": "big happy grin with the eyes closed in joy",
    "ko": "knocked out with eyes drawn as small x marks and a slack mouth",
    "cry": "crying sadly with big tears streaming down the cheeks, eyebrows slanted in sorrow, mouth turned down",
}
EXPR_MASK = {   # the assassin's mask hides the mouth: act with the eyes only
    "normal": "calm narrow eyes", "blink": "both eyes closed as if blinking", "hurt": "eyes squeezed shut in pain",
    "shout": "wide angry eyes with fierce slanted eyebrows", "happy": "eyes closed in joy, curved like happy arcs",
    "ko": "eyes drawn as small x marks", "cry": "sad slanted eyebrows and big tears streaming down from the eyes",
}
BACK = "seen from directly behind, the back of the head completely covered by {back}, no face, no eyes, no mouth"

POSES = {   # stands for the pose names of rig2x.POSE_PART / docs/DV2-PHASE6 §2.1
    "stand": "standing straight with the feet slightly apart and the arms hanging a little out from the sides",
    "walk_l": "mid-step walking pose with the left foot forward and the right foot back, arms swinging slightly opposite to the legs",
    "walk_r": "mid-step walking pose with the right foot forward and the left foot back, arms swinging slightly opposite to the legs",
    "windup": "getting ready to swing: both arm stumps together in front of the chest at shoulder height, torso leaning slightly back, feet apart",
    "chop": "finishing a heavy downward chop: lunging forward with the front knee bent, both arms reaching forward and down so the arm stumps are in front of the body near the ankles",
    "swing": "mid horizontal swing: the front arm stretched straight forward at shoulder height, shoulders twisted, feet apart in a wide stance",
    "hurt": "recoiling from a hit: torso leaning back, arms flung out to the sides at waist height, one foot stepping back",
    "crouch": "crouching low with both knees bent and both arms held forward at waist height",
    "cheer": "cheering in triumph with both arms raised high above the shoulders and slightly forward, feet apart",
    "lying": "collapsed and lying flat on its back on the ground, arms and legs relaxed",
    "thrust": "thrusting forward: lunging with the front knee bent, the front arm stretched straight forward at knee height",
    "aim": "standing sideways with the front arm stretched straight forward at waist height and the back arm bent with its stump in front of the chest, feet apart",
    "aim_full": "standing sideways with the front arm stretched straight forward at waist height and the back arm pulled all the way back so its stump is at the cheek, feet apart",
    "cast": "the front arm raised forward above the shoulder and the other arm held out to the side, feet apart",
    "cast_high": "both arms raised high above the head and slightly forward, arm stumps bare, nothing in the hands",
    # --- docs/DV2-PHASE6.md §2.1 (new life-action poses)
    "carry": "both arms raised straight up above the head with the arm stumps close together over the head, feet together, nothing in the hands",
    "carry_walk_l": "both arms raised straight up above the head with the arm stumps close together, nothing in the hands, walking with the left foot forward and the right foot back",
    "carry_walk_r": "both arms raised straight up above the head with the arm stumps close together, nothing in the hands, walking with the right foot forward and the left foot back",
    "pose": "striking a cool pose: one arm with the fist on the hip, the other arm stretched forward and diagonally up, weight on the back foot",
    "cry": "standing with both arms bent and the arm stumps pressed against the fluffy collar, shoulders hunched up, still headless with nothing above the collar",
    "cry_sit": "sitting on the ground with both legs stretched forward and both arm stumps pressed against the fluffy collar, still headless with nothing above the collar",
    "clap0": "about to clap: both arms bent with the two arm stumps held apart in front of the chest",
    "clap1": "clapping: both arms bent with the two arm stumps pressed together in front of the chest",
    "give0": "holding something: both arms bent with the arm stumps cupped together in front of the chest",
    "give1": "handing something over: both arms stretched straight forward with the arm stumps held out in front",
    "punch0": "boxing stance: both arms bent with the arm stumps raised in front of the chin, knees slightly bent",
    "punch1": "throwing a straight punch: the front arm stretched straight forward at shoulder height, the back arm bent at the chin",
    "punch2": "throwing a hook punch: torso twisted, the back arm swinging around at shoulder height, the front arm at the chin",
    "guard": "guarding: body crouched low with both arms crossed in front of the face",
}
P1_COMMON = ["stand", "walk_l", "walk_r", "windup", "chop", "swing", "hurt", "crouch", "cheer", "lying"]
P2_POSES = ["carry", "carry_walk_l", "carry_walk_r", "pose", "cry", "cry_sit", "clap0", "clap1", "give0", "give1",
            "punch0", "punch1", "punch2", "guard"]

P2_GEN = P2_POSES    # the P2 poses with a silhouette of their own; the rest fall back (SKIP_POSES)

CLASSES = {
    "berserker": dict(
        head="spiky messy brown hair, fierce brown eyes, light stubble on the chin, tan skin", back="the same spiky messy brown hair", back_f="the same spiky messy brown hair with a short ponytail",
        head_f="spiky messy brown hair with a short ponytail, fierce brown eyes with long lashes, tan skin, smooth feminine face with no stubble",
        collar="a cream fur collar", outfit="a brown leather vest, heavy dark brown belt with a small iron buckle, brown trousers and dark brown boots, bare muscular arms",
        fist="tan skin with a thin brown leather wrist wrap", poses=[]),
    "paladin": dict(
        head="short tousled blond hair, blue eyes, fair skin", back="the same short tousled blond hair", back_f="the same blond hair with a small braid",
        head_f="shoulder-length wavy blond hair with a small braid, blue eyes with long lashes, fair skin, soft feminine face",
        collar="a thick fluffy dark brown fur collar", outfit="a slate-blue tunic with a silver breastplate with gold trim, a brown belt, steel greaves and steel boots, slate-blue sleeves",
        fist="a steel plate gauntlet with a gold rim", poses=["thrust"]),
    "archer": dict(
        head="short tousled brown hair under a teal cloth headband, green eyes, tan skin", back="the same brown hair and the teal cloth headband", back_f="the same brown hair in a high ponytail and the teal cloth headband",
        head_f="long brown hair in a high ponytail under a teal cloth headband, green eyes with long lashes, tan skin, soft feminine face",
        collar="a thick fluffy cream sheepskin collar", outfit="a sleeveless teal tunic, a brown leather strap across the chest, a brown belt, a leather bracer on the left forearm, olive-green leggings and soft brown boots, bare tan arms",
        fist="tan skin with a brown leather bracer edge", poses=["aim", "aim_full"]),
    "sorcerer": dict(
        head="a tall pointed violet wizard hat with a gold band and a bent tip, pale face, brown eyes, a little brown hair under the brim", back="the same tall pointed violet wizard hat and a little brown hair under the brim",
        head_f="a tall pointed violet wizard hat with a gold band and a bent tip, pale soft feminine face, brown eyes with long lashes, long brown hair under the brim",
        collar="a thick fluffy grey wolf fur collar", outfit="a violet robe with wide sleeves and lavender trim, a gold sash, the robe hem hides the feet",
        fist="pale skin peeking from a wide violet sleeve cuff", poses=["cast", "cast_high"]),
    "priest": dict(
        head="a white hood with a gold edge framing a calm face, brown eyes, a few light brown hair locks", back="the same white hood with the gold edge",
        head_f="a white hood with a gold edge framing a calm soft feminine face, brown eyes with long lashes, long light brown hair locks",
        collar="a thick fluffy white fur collar with a gold edge", outfit="a long white robe with wide sleeves, a red sash, a gold medallion on the chest",
        fist="pale skin peeking from a wide white sleeve cuff", poses=["cast", "cast_high"]),
    "assassin": dict(
        head="a near-black hood, the whole lower half of the face covered by a light grey cloth mask over the nose and mouth, only a narrow strip of skin with the eyes visible between the hood and the mask", back="the same near-black hood", back_f="the same near-black hood with a long dark ponytail hanging out of it",
        head_f="a near-black hood and a face mask covering the nose and mouth, only the eyes visible with long lashes, a light grey scarf under the chin, a long dark ponytail hanging out of the hood",
        collar="a thick fluffy light grey fur collar", outfit="close-fitting very dark charcoal clothes, a short dark charcoal cloak over the shoulders, small belt pouches, dark boots",
        fist="a dark leather glove", poses=["thrust"], mask=True),
}


def head_prompt(cls, expr, view, female=False):
    c = CLASSES[cls]
    who = c["head_f"] if female else c["head"]
    if view == "north":
        back = c.get("back_f", c["back"]) if female else c["back"]
        return HEAD_PRE + BACK.format(back=back) + ", " + TAIL
    ex = (EXPR_MASK if c.get("mask") else EXPR)[expr]
    return HEAD_PRE + who + ", " + ex + ", " + TAIL


def body_prompt(cls, pose):
    c = CLASSES[cls]
    return BODY_PRE + c["collar"] + ", " + c["outfit"] + BODY_POST + POSES[pose] + BODY_TAIL


def fist_prompt(cls, view):
    c = CLASSES[cls]
    seen = ("seen from the side with the knuckles pointing to the right" if view == "east"
            else "seen from the front with the knuckles facing the viewer")
    return ("pixel art game sprite of one tiny closed fist only, no arm, " + c["fist"] + ", " + seen
            + ", 1-pixel dark outline, flat colours with 2-3 tones, light from top-left, no anti-aliasing, centered, transparent background, nothing else")


# ------------------------------------------------------------------ generation
def ledger(cls, what, gens=1.0):
    WORK.mkdir(parents=True, exist_ok=True)
    with LEDGER.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.strftime("%H:%M:%S"), "cls": cls, "what": what, "gens": gens}) + "\n")


NEG = {"head": "body, neck, shoulders, torso, hands, arms, legs, clothes below the chin",
       "body": "head, helmet, hat, hood, hair, face, skull, neck, hands, fingers, weapon, text", "fist": "arm, wrist, body, face"}


def gen_one(cls, part, direction, prompt, size=32, view="low top-down", seed=7, base=None):
    """base = None: text -> pixflux.  base = "<part>": PixelLab edit-image of that part's same-view image (keeps outfit / colours / head-less-ness)"""
    dst = WORK / cls / "raw" / part / f"{direction}.png"
    if dst.exists():
        return f"skip {part}/{direction}"
    tmp = WORK / cls / "raw" / part / f"_{direction}"
    if base:
        src = WORK / cls / "raw" / base / f"{direction}.png"
        if not src.exists():
            return f"NOBASE {part}/{direction}"
        tmp.mkdir(parents=True, exist_ok=True)
        r = V.edit_image(src, prompt[:499], out_dir=tmp, seed=seed)
        img = tmp / "edited-0.png"
        if not img.exists():
            shutil.rmtree(tmp, ignore_errors=True)
            return f"FAILED {part}/{direction}"
        img.replace(dst)
        shutil.rmtree(tmp, ignore_errors=True)
        ledger(cls, f"edit {part}/{direction}", 1.0)
        return f"edit {part}/{direction}"
    r = V.make_image(prompt, size, model="pixflux", view=view, direction=direction, outline="single color black outline",
                     detail="medium detail", seed=seed, negative=NEG[kind_of(part)], out_dir=tmp)
    img = tmp / "image-0.png"
    if not img.exists():
        shutil.rmtree(tmp, ignore_errors=True)
        return f"FAILED {part}/{direction}"
    img.replace(dst)
    shutil.rmtree(tmp, ignore_errors=True)
    ledger(cls, f"{part}/{direction}", (r.get("usage") or {}).get("generations", 1.0))
    return f"gen {part}/{direction}"


EDIT_BODY = "same headless chibi body, now {pose}, the same outfit and colours, the same fluffy collar with nothing above it, 1-pixel dark outline, transparent background"


def jobs_for(cls, group, views=("south", "east", "north")):
    c = CLASSES[cls]
    out = []
    if group in ("heads", "cry", "female"):
        female = group == "female"
        exprs = {"heads": ["normal", "blink", "hurt", "shout", "happy", "ko"], "cry": ["cry"],
                 "female": ["normal", "blink", "hurt", "shout", "happy", "ko", "cry"]}[group]
        pre = "head_f_" if female else "head_"
        if female:                       # the normal female head is text; every other expression is an edit of it
            for d in ("south", "east"):
                out.append((pre + "normal", d, head_prompt(cls, "normal", d, True), None))
            out.append(("head_f_back", "north", head_prompt(cls, "normal", "north", True), None))
        for e in exprs:
            if female and e == "normal":
                continue
            for d in ("south", "east"):
                out.append((pre + e, d, ("same head, " + (EXPR_MASK if c.get("mask") else EXPR)[e] + ", everything else exactly unchanged, same hair, colours and outline, nothing below the chin") if (group != "heads" or e != "normal") else head_prompt(cls, e, d, female),
                            pre + "normal" if e != "normal" else None))
        if group == "heads":
            out.append(("head_back", "north", head_prompt(cls, "normal", "north", False), None))
    elif group == "fists":
        out += [("fist_side", "east", fist_prompt(cls, "east"), None), ("fist_front", "south", fist_prompt(cls, "south"), None)]
    elif group in ("bodies", "poses2"):
        poses = (P1_COMMON + c["poses"]) if group == "bodies" else P2_GEN
        for p in poses:
            for d in (("east",) if p == "lying" else views):
                if p == "stand":
                    out.append(("body_stand", d, body_prompt(cls, p), None))
                else:
                    out.append(("body_" + p, d, EDIT_BODY.format(pose=POSES[p]), "body_stand"))
    return out


def cmd_gen(a):
    cls = a.cls
    jobs = jobs_for(cls, a.group)
    if a.only:
        keep = set(a.only.split(","))
        jobs = [j for j in jobs if j[0] in keep or f"{j[0]}/{j[1]}" in keep]
    if a.redo:
        for part, d, *_ in jobs:
            p = WORK / cls / "raw" / part / f"{d}.png"
            if p.exists():
                (WORK / cls / "raw_old").mkdir(parents=True, exist_ok=True)
                shutil.move(str(p), str(WORK / cls / "raw_old" / f"{part}_{d}_{int(time.time())}.png"))
    print(f"{cls} {a.group}: {len(jobs)} calls", flush=True)

    def go(j):
        try:
            return gen_one(cls, j[0], j[1], j[2], base=j[3], seed=a.seed)
        except BaseException as e:   # SystemExit from v2_client.post
            return f"ERR {j[0]}/{j[1]} {e}"
    with ThreadPoolExecutor(a.workers) as ex:
        for i, r in enumerate(ex.map(go, jobs), 1):
            print(f"[{i}/{len(jobs)}] {r}", flush=True)


# ------------------------------------------------------------------ edit (north head -> back of head)
def edit_image(src: Path, out: Path, desc: str, seed=7):
    import requests
    im = Image.open(src)
    W, H = im.size
    r = V.post("/edit-image", {
        "image": {"type": "base64", "base64": base64.b64encode(Path(src).read_bytes()).decode()}, "image_size": {"width": W, "height": H},
        "description": desc, "width": W, "height": H, "seed": seed, "no_background": True, "text_guidance_scale": 8})
    res = V.wait_job(r, "edit") if not isinstance(r.get("image"), dict) else r
    lr = res.get("last_response") or res
    img = lr.get("image") or (lr.get("images") or [None])[0]
    raw = base64.b64decode(img["base64"].split(",", 1)[-1]) if isinstance(img, dict) and img.get("base64") else requests.get(img["url"] if isinstance(img, dict) else img, timeout=60).content
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    ledger(out.parts[-4] if len(out.parts) > 4 else "?", f"edit {out.name}", (res.get("usage") or lr.get("usage") or {}).get("generations", 1.0))


def cmd_editback(a):
    """edit <class> <part> : head_back/north.png (a face) -> back of the head. original kept as north_face.png"""
    p = WORK / a.cls / "raw" / a.part / "north.png"
    shutil.copy(p, p.with_name("north_face.png"))
    desc = ("the same chibi head seen from directly behind: the back of the head fully covered by the same hair or hood, "
            "no face, no eyes, no mouth, same size and position")
    edit_image(p.with_name("north_face.png"), p, desc)
    print("edited", p)


# ------------------------------------------------------------------ finishing: local downscale
def bbox(im):
    a = np.asarray(im.convert("RGBA"))[..., 3] > 8
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def downscale(im, scale, dark_lum=70, outline_frac=0.34):
    """area-mode downscale of an RGBA sprite (content only); a block that is >= outline_frac dark becomes the outline colour (keeps the 1-px line)."""
    im = im.convert("RGBA")
    bb = bbox(im)
    x0, y0, x1, y1 = bb
    a = np.asarray(im).astype(float)
    H, W = a.shape[:2]
    cw, ch = x1 - x0, y1 - y0
    ow, oh = max(1, round(cw * scale)), max(1, round(ch * scale))
    sx, sy = cw / ow, ch / oh
    lum = a[..., 0] * .3 + a[..., 1] * .59 + a[..., 2] * .11
    op = a[..., 3] > 128
    out = np.zeros((oh, ow, 4), np.uint8)
    for j in range(oh):
        ya, yb = y0 + j * sy, y0 + (j + 1) * sy
        for i in range(ow):
            xa, xb = x0 + i * sx, x0 + (i + 1) * sx
            cols, darkc, tot, cov, dark = {}, {}, 0.0, 0.0, 0.0
            for yy in range(int(np.floor(ya)), int(np.ceil(yb))):
                wy = min(yy + 1, yb) - max(yy, ya)
                if wy <= 0 or yy < 0 or yy >= H:
                    continue
                for xx in range(int(np.floor(xa)), int(np.ceil(xb))):
                    wx = min(xx + 1, xb) - max(xx, xa)
                    if wx <= 0 or xx < 0 or xx >= W:
                        continue
                    w = wx * wy
                    tot += w
                    if op[yy, xx]:
                        cov += w
                        c = tuple(int(v) for v in a[yy, xx, :3])
                        cols[c] = cols.get(c, 0) + w
                        if lum[yy, xx] < dark_lum:
                            dark += w
                            darkc[c] = darkc.get(c, 0) + w
            if tot == 0 or cov / tot < 0.5:
                continue
            if dark / cov >= outline_frac:
                c = max(darkc, key=darkc.get)
            else:
                nd = {k: v for k, v in cols.items() if k[0] * .3 + k[1] * .59 + k[2] * .11 >= dark_lum}
                pick = nd or cols
                c = max(pick, key=pick.get)
            out[j, i] = (*c, 255)
    return Image.fromarray(out, "RGBA")


def scale_for(ims, target_area):
    """one scale so the mean content area of ims (the normal heads / stand bodies) is target_area"""
    areas = []
    for im in ims:
        b = bbox(im)
        if b:
            areas.append((b[2] - b[0]) * (b[3] - b[1]))
    return float(np.sqrt(target_area / np.mean(areas))) if areas else 0.7


HEAD_AREA = 22 * 21      # berserker head normal content ~22x21
BODY_AREA = 13 * 20      # berserker stand content ~13x20 (front)
FIST_H = 8
CANVAS = {"head": 25, "body": 21, "fist": 16}


def kind_of(part):
    return "body" if part.startswith("body") else "fist" if part.startswith("fist") else "head"


def to_canvas(sp, canvas, bottom_margin):
    """content onto a square canvas: centred, last content row at canvas-1-bottom_margin (clipped content is a failure)"""
    b = bbox(sp)
    c = sp.crop(b)
    canvas = max(canvas, c.width, c.height)
    out = Image.new("RGBA", (canvas, canvas))
    x = (canvas - c.width) // 2
    y = canvas - 1 - bottom_margin - c.height + 1
    out.alpha_composite(c, (x, max(0, y)))
    return out, False


PROC_WALK = {"archer"}
SUBST = {"archer": {"body_chop_back.png": "body_swing_back.png"}}      # chop_back: three text/edit tries all drew another character
CREAM_COLLAR = {"archer", "sorcerer", "berserker"}                      # fur collar is skin-coloured: the 'skin blob above the collar' check is meaningless


def cmd_finish(a):
    cls = a.cls
    raw = WORK / cls / "raw"
    sc_file = WORK / cls / "scales.json"
    scales = json.loads(sc_file.read_text()) if sc_file.exists() else {}
    # head scale from head_normal front/side (male); female heads reuse the male scale for the same class
    def load(part, d):
        p = raw / part / f"{d}.png"
        return Image.open(p).convert("RGBA") if p.exists() else None
    if "head" not in scales:
        hs = [load("head_normal", d) for d in ("south", "east")]
        scales["head"] = scale_for([h for h in hs if h], HEAD_AREA) if any(hs) else 0.75
    if "body" not in scales:
        bs = [load("body_stand", d) for d in ("south", "east", "north")]
        scales["body"] = scale_for([b for b in bs if b], BODY_AREA) if any(bs) else 0.7
    fs = [load("fist_side", "east"), load("fist_front", "south")]
    if "fist" not in scales and any(fs):
        hh = [bbox(f)[3] - bbox(f)[1] for f in fs if f]
        scales["fist"] = FIST_H / float(np.mean(hh))
    sc_file.write_text(json.dumps(scales, indent=1))
    print(cls, "scales", scales)
    done, clipped = 0, []
    for pdir in sorted(raw.iterdir()):
        if not pdir.is_dir() or pdir.name.startswith("_"):
            continue
        part = pdir.name
        kind = kind_of(part)
        for png in sorted(pdir.glob("*.png")):
            d = png.stem
            if d not in VIEW:
                continue
            name = out_name(part, d)
            dst = WORK / cls / "x2" / name
            if dst.exists() and not a.force:
                continue
            im = Image.open(png).convert("RGBA")
            if not bbox(im):
                print("EMPTY", png)
                continue
            if part in ("body_lying", "body_cry_sit") and part == "body_lying":
                im = neck_left(im)
            if kind == "head":
                im = trim_chin(im)
                if cls == "assassin":
                    im = fix_red_outline(im)
            sp = downscale(im, scales[kind])
            cv, clip = to_canvas(sp, CANVAS[kind], 1 if kind != "fist" else 3)
            dst.parent.mkdir(parents=True, exist_ok=True)
            cv.save(dst)
            done += 1
            if clip:
                clipped.append(name)
    for dstn, srcn in SUBST.get(cls, {}).items():
        shutil.copy(WORK / cls / "x2" / srcn, WORK / cls / "x2" / dstn)
        print("substituted", dstn, "<-", srcn)
    if cls in PROC_WALK:
        for v in ("back", "side", "front"):
            st = load_x2(cls, f"body_stand_{v}.png")
            for left in (True, False):
                n = f"body_walk_{'l' if left else 'r'}_{v}.png"
                proc_walk(st, left, v).save(WORK / cls / "x2" / n)
        print("walk_l / walk_r procedural (from stand)")
    print(f"finished {done} parts; clipped (content larger than canvas): {clipped}")


def trim_chin(im, frac=0.45):
    """heads: drop the little body bits (shoulders / scarf / hands) the model sometimes draws under the chin:
    everything below the last row that is >= frac of the widest row"""
    a = np.asarray(im.convert("RGBA")).copy()
    m = a[..., 3] > 8
    w = m.sum(1)
    if not w.any():
        return im
    rows = np.nonzero(w >= frac * w.max())[0]
    a[rows.max() + 1:] = 0
    return Image.fromarray(a, "RGBA")


def proc_walk(stand, left, view):
    """walk_l / walk_r made from the class's own stand (same design by construction): the stepping half of the legs (bottom 5 rows)
    lifts 1 px, and on the side view moves 1 px along x (back leg back / front leg forward)"""
    a = np.asarray(stand.convert("RGBA")).copy()
    x0, y0, x1, y1 = bbox(stand)
    rows = slice(y1 - 5, y1)
    cx = (x0 + x1) // 2
    out = a.copy()
    out[rows] = 0
    leg = a[rows]
    mask_left = np.zeros(leg.shape[:2], bool)
    mask_left[:, :cx] = True
    moving = mask_left if left else ~mask_left
    dx = (-1 if left else 1) if view == "side" else 0
    still = leg.copy(); still[moving] = 0
    out[rows] = np.maximum(out[rows], still)
    mv = np.zeros_like(leg); mv[moving] = leg[moving]
    mv = np.roll(mv, dx, axis=1)
    h = out.shape[0]
    tgt = a.copy() * 0
    tgt[y1 - 6:y1 - 1] = mv
    for yy in range(h):
        for xx in range(out.shape[1]):
            if tgt[yy, xx, 3] > 0 and out[yy, xx, 3] == 0:
                out[yy, xx] = tgt[yy, xx]
    return Image.fromarray(out, "RGBA")


def fix_red_outline(im):
    """PixelLab edit-image sometimes paints a salmon/red halo around the silhouette: boundary pixels that are red-ish become the dark outline"""
    a = np.asarray(im.convert("RGBA")).copy()
    op = a[..., 3] > 8
    pad = np.pad(op, 1)
    edge = op & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    red = edge & (r > g + 35) & (r > b + 20)
    dark = a[op][:, :3].astype(int)
    dk = dark[dark.sum(1).argmin()]
    a[red, :3] = dk
    return Image.fromarray(a, "RGBA")


def neck_left(im):
    """lying body: the neck (shoulder) end is the taller end; rig2x.LYING_NECK = left for every class -> flip when it is on the right"""
    a = np.asarray(im.convert("RGBA"))[..., 3] > 8
    ys, xs = np.nonzero(a)
    x0, x1 = xs.min(), xs.max() + 1
    third = max(1, (x1 - x0) // 3)
    h = a.sum(0)
    left, right = h[x0:x0 + third].mean(), h[x1 - third:x1].mean()
    return im.transpose(Image.FLIP_LEFT_RIGHT) if right > left else im


def out_name(part, d):
    v = VIEW[d]
    if part in ("fist_side", "fist_front"):
        return part + ".png"
    if part in ("head_back", "head_f_back"):
        return part + ".png"
    return f"{part}_{v}.png"


# ------------------------------------------------------------------ QA sheets
def load_x2(cls, name):
    p = WORK / cls / "x2" / name
    return Image.open(p).convert("RGBA") if p.exists() else None


def collar_x(a):
    ys, xs = np.nonzero(a[..., 3] > 0)
    top = ys.min()
    band = a[top:top + 3, :, 3] > 0
    bx = np.nonzero(band.any(0))[0]
    return (bx.min() + bx.max() + 1) / 2


def compose(body, head):
    """head chin covering the body's top 3 rows, head centred on the collar (rig2x logic); returns an RGBA tile"""
    ba = np.asarray(body)
    bb = bbox(body)
    bc = body.crop(bb)
    cx = collar_x(np.asarray(bc))
    hb = bbox(head)
    hc = head.crop(hb)
    W = 44
    Ht = hc.height + bc.height + 2
    out = Image.new("RGBA", (W, Ht))
    bx = int(round(W / 2 - cx))
    by = hc.height - 2
    out.alpha_composite(bc, (bx, by))
    out.alpha_composite(hc, (int(round(W / 2 - hc.width / 2)), 0))
    return out


def cmd_sheet(a):
    cls = a.cls
    poses = (P1_COMMON + CLASSES[cls]["poses"] + P2_POSES) if not a.poses else a.poses.split(",")
    poses = [p for p in poses if load_x2(cls, f"body_{p}_side.png") is not None]
    S = 4
    cw, ch = 44 * S, 52 * S
    per_row = 3
    BG = (58, 62, 74, 255)
    groups = [poses[i:i + 15] for i in range(0, len(poses), 15)]
    for gi, grp in enumerate(groups):
        rows = (len(grp) + per_row - 1) // per_row
        sheet = Image.new("RGBA", (per_row * 3 * cw, rows * ch), BG)
        for k, p in enumerate(grp):
            gx, gy = (k % per_row) * 3 * cw, (k // per_row) * ch
            for vi, v in enumerate(("back", "side", "front")):
                body = load_x2(cls, f"body_{p}_{v}.png")
                if body is None and p == "lying":
                    body = load_x2(cls, "body_lying_side.png")
                if body is None:
                    continue
                head = load_x2(cls, "head_back.png" if v == "back" else f"head_normal_{v}.png")
                if p == "lying" or head is None:
                    t = body.crop(bbox(body))
                    tile = Image.new("RGBA", (44, 52)); tile.alpha_composite(t, (22 - t.width // 2, 8))
                else:
                    t = compose(body, head)
                    tile = Image.new("RGBA", (44, 52)); tile.alpha_composite(t, (0, 2))
                sheet.alpha_composite(tile.resize((cw, ch), Image.NEAREST), (gx + vi * cw, gy))
        out = WORK / cls / f"review_poses_{gi + 1}.png"
        sheet.convert("RGB").save(out)
        print("wrote", out, [p for p in grp])
    # expressions
    exprs = [e for e in EXPR if load_x2(cls, f"head_{e}_side.png") is not None]
    if exprs:
        sheet = Image.new("RGBA", (len(exprs) * 2 * 25 * S, 2 * 25 * S), BG)
        for i, e in enumerate(exprs):
            for j, v in enumerate(("side", "front")):
                h = load_x2(cls, f"head_{e}_{v}.png")
                if h is not None:
                    sheet.alpha_composite(h.resize((25 * S, 25 * S), Image.NEAREST), ((i * 2 + j) * 25 * S, 0))
        hb = load_x2(cls, "head_back.png")
        if hb is not None:
            sheet.alpha_composite(hb.resize((25 * S, 25 * S), Image.NEAREST), (0, 25 * S))
        for k, n in enumerate(("fist_side.png", "fist_front.png")):
            f = load_x2(cls, n)
            if f is not None:
                sheet.alpha_composite(f.resize((f.width * S, f.height * S), Image.NEAREST), ((1 + k) * 25 * S, 25 * S))
        fem = [e for e in EXPR if load_x2(cls, f"head_f_{e}_side.png") is not None]
        for i, e in enumerate(fem):
            for j, v in enumerate(("side", "front")):
                h = load_x2(cls, f"head_f_{e}_{v}.png")
                if h is not None:
                    sheet.alpha_composite(h.resize((25 * S, 25 * S), Image.NEAREST), ((i * 2 + j) * 25 * S, 25 * S))
        out = WORK / cls / "review_heads.png"
        sheet.convert("RGB").save(out)
        print("wrote", out)


def cmd_raw(a):
    """raw <class> <prefix> : contact sheet of the 32 px originals (rows = parts, cols = south/east/north) x3, labelled"""
    from PIL import ImageDraw
    raw = WORK / a.cls / "raw"
    pre = tuple(a.prefix.split(","))
    parts = sorted(p.name for p in raw.iterdir() if p.is_dir() and p.name.startswith(pre) and not p.name.startswith("_"))
    S = 3
    cell = 32 * S
    sheet = Image.new("RGBA", (3 * cell + 150, len(parts) * cell), (58, 62, 74, 255))
    dr = ImageDraw.Draw(sheet)
    for r, part in enumerate(parts):
        dr.text((3, r * cell + 4), part, fill=(255, 255, 255, 255))
        for c, d in enumerate(("south", "east", "north")):
            p = raw / part / f"{d}.png"
            if p.exists():
                sheet.alpha_composite(Image.open(p).convert("RGBA").resize((cell, cell), Image.NEAREST), (150 + c * cell, r * cell))
    out = WORK / a.cls / f"raw_{a.prefix.replace(',', '_') or 'all'}.png"
    sheet.convert("RGB").save(out)
    print("wrote", out, sheet.size)


# ------------------------------------------------------------------ install
# P2 poses the generator draws as the stand again / with props (clap0/1, give0/1, punch0, pose) or with a box (carry*): not installed
# (rig falls back per docs/DV2-PHASE6.md §2.1); HOLD = single parts that failed QA and are flagged
SKIP_POSES = []
HOLD = {}


def cmd_install(a):
    cls = a.cls
    dst = SRC2X / cls
    if cls == "berserker" and a.force:
        raise SystemExit("never overwrite berserker files")
    dst.mkdir(parents=True, exist_ok=True)
    made, skipped = [], []
    skip_poses = tuple(f"body_{x}_" for x in SKIP_POSES)
    for p in sorted((WORK / cls / "x2").glob("*.png")):
        if p.name.startswith(skip_poses) or p.name in HOLD.get(cls, ()):
            skipped.append(p.name)
            continue
        t = dst / p.name
        if t.exists() and not a.force:
            skipped.append(p.name)
            continue
        shutil.copy2(p, t)
        made.append(p.name)
    note = dst / "SOURCE.md"
    if cls != "berserker" and (a.force or not note.exists() or "phase6.py" not in note.read_text(encoding="utf-8")):
        note.write_text(
            f"{cls.capitalize()} parts for the DV2 rig at 2x (docs/PAPERDOLL.md 22.6, docs/DV2-PHASE6.md).\n"
            "Generated with PixelLab pixflux 32x32 from text prompts only (no DV2 / Kairosoft image as input, reference, style or palette):\n"
            "pipeline/scripts/dv2fmt/parts2x/phase6.py (class table + prompts), raw 32 px originals in output/phase6/" + cls + "/raw/.\n"
            "Shrunk to 2x-DV2 size with one outline-keeping local downscale (head 25 / body 21 canvas, same scale for every pose and view).\n"
            "head_back.png = the back of the head (PixelLab pixflux north view, or PixelLab edit-image of it where it showed a face).\n"
            "Weapons for this class: ../weapon_<name>.png, ../weapon_<name>_fine.png (pixellab_weapon.py --x2).\n", encoding="utf-8")
    print(f"installed {len(made)}, skipped {len(skipped)} existing -> {dst}")


def pose_diff(cls):
    """fraction of the stand body's silhouette pixels that differ from each pose (mean over views) -- ~0 means the model drew the stand again"""
    res = {}
    for pose in P1_COMMON + P2_POSES + ["thrust", "aim", "aim_full", "cast", "cast_high"]:
        ds = []
        for v in ("back", "side", "front"):
            a, b = load_x2(cls, f"body_stand_{v}.png"), load_x2(cls, f"body_{pose}_{v}.png")
            if a is None or b is None:
                continue
            A, B = np.asarray(a)[..., 3] > 0, np.asarray(b)[..., 3] > 0
            ds.append((A ^ B).sum() / max(1, (A | B).sum()))
        if ds:
            res[pose] = round(float(np.mean(ds)), 2)
    return res


# ------------------------------------------------------------------ automated QA gate (before any install)
def components(alpha, join=1):
    """8-connected components of the opaque mask (after dilating by `join` px so a gap of < 2*join px does not split a limb), sizes of the ORIGINAL pixels"""
    from scipy import ndimage
    m = alpha > 0
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=join) if join else m, structure=np.ones((3, 3)))
    return [(int((m & (lab == i)).sum())) for i in range(1, n + 1)]


def class_skin(cls):
    """face skin colour = most common colour in the middle band of head_normal_front"""
    h = load_x2(cls, "head_normal_front.png")
    if h is None:
        return None
    a = np.asarray(h)
    b = bbox(h)
    band = a[b[1] + (b[3] - b[1]) // 2: b[1] + (b[3] - b[1]) * 4 // 5, b[0] + 4:b[2] - 4].reshape(-1, 4)
    band = band[band[:, 3] > 0][:, :3]
    if not len(band):
        return None
    u, c = np.unique(band, axis=0, return_counts=True)
    return u[c.argmax()].astype(int)


LOOSE_H = {"lying", "crouch", "cry_sit", "guard", "cheer", "carry", "carry_walk_l", "carry_walk_r"}


def qa_part(cls, name, stand, skin):
    """returns list of problems (empty = pass) for body_<pose>_<view>.png vs the class's stand of the same view"""
    im = load_x2(cls, name)
    a = np.asarray(im)
    pose = name[len("body_"):].rsplit("_", 1)[0]
    probs = []
    comps = [c for c in components(a[..., 3]) if c >= 6]
    if len(comps) != 1:
        probs.append(f"{len(comps)} components")
    b, sb = bbox(im), bbox(stand)
    h, sh = b[3] - b[1], sb[3] - sb[1]
    tol = 0.45 if pose in LOOSE_H else 0.30
    if pose != "lying" and abs(h - sh) > tol * sh:
        probs.append(f"height {h} vs stand {sh}")
    sa = np.asarray(stand)
    pal = np.unique(sa.reshape(-1, 4)[sa[..., 3].reshape(-1) > 0][:, :3], axis=0).astype(int)
    px = a.reshape(-1, 4)[a[..., 3].reshape(-1) > 0][:, :3].astype(int)
    d = np.sqrt(((px[:, None, :] - pal[None]) ** 2).sum(2)).min(1)
    share = float((d <= 36).mean())
    if share < 0.72:
        probs.append(f"palette {share:.2f}")
    if skin is not None and pose != "lying" and cls not in CREAM_COLLAR:
        def top_skin(img):
            q = np.asarray(img)
            bb = bbox(img)
            cw = bb[2] - bb[0]
            t = q[bb[1]:bb[1] + 5, bb[0] + cw // 3:bb[2] - cw // 3].reshape(-1, 4)
            return int(((t[:, 3] > 0) & (np.abs(t[:, :3].astype(int) - skin).sum(1) < 40)).sum())
        n, n0 = top_skin(im), top_skin(stand)       # the collar itself may be skin-like (cream fur): compare with the stand's
        if n > n0 * 1.6 + 4:
            probs.append(f"skin blob on top ({n} px vs stand {n0})")
    return probs


def cmd_qa(a):
    cls = a.cls
    skin = class_skin(cls)
    report = {}
    for p in sorted((WORK / cls / "x2").glob("body_*.png")):
        pose, view = p.stem[len("body_"):].rsplit("_", 1)
        if pose == "stand":
            continue
        st = load_x2(cls, f"body_stand_{'side' if pose == 'lying' else view}.png")
        if st is None:
            continue
        pr = qa_part(cls, p.name, st, skin)
        report[p.name] = pr
    bad = {k: v for k, v in report.items() if v}
    (WORK / cls / "qa.json").write_text(json.dumps({"checked": len(report), "failed": bad}, indent=1))
    print(f"{cls}: {len(report) - len(bad)}/{len(report)} body parts pass")
    for k, v in bad.items():
        print("  FAIL", k, "; ".join(v))


def qa_heads(cls):
    """head_*.png vs head_normal of the same view: one component, bbox within +-25 %, palette share"""
    bad = {}
    for p in sorted((WORK / cls / "x2").glob("head_*.png")):
        n = p.stem
        view = "front" if n.endswith("front") else "side" if n.endswith("side") else None
        im = load_x2(cls, p.name)
        probs = []
        comps = [c for c in components(np.asarray(im)[..., 3]) if c >= 6]
        if len(comps) != 1:
            probs.append(f"{len(comps)} components")
        if view:
            ref = load_x2(cls, f"head_normal_{view}.png")
            if ref is not None and p.name != f"head_normal_{view}.png":
                b, rb = bbox(im), bbox(ref)
                for k, (x, y) in {"w": (b[2] - b[0], rb[2] - rb[0]), "h": (b[3] - b[1], rb[3] - rb[1])}.items():
                    if abs(x - y) > 0.25 * y:
                        probs.append(f"{k} {x} vs {y}")
                ra = np.asarray(ref)
                pal = np.unique(ra.reshape(-1, 4)[ra[..., 3].reshape(-1) > 0][:, :3], axis=0).astype(int)
                a = np.asarray(im)
                px = a.reshape(-1, 4)[a[..., 3].reshape(-1) > 0][:, :3].astype(int)
                share = float((np.sqrt(((px[:, None, :] - pal[None]) ** 2).sum(2)).min(1) <= 40).mean())
                if share < 0.7:
                    probs.append(f"palette {share:.2f}")
        if probs:
            bad[p.name] = probs
    return bad


def cmd_qaheads(a):
    bad = qa_heads(a.cls)
    print(a.cls, "head failures:", bad if bad else "none")


def cmd_diff(a):
    print(a.cls, pose_diff(a.cls))


def cmd_ledger(a):
    tot, by = 0.0, {}
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        tot += r["gens"]
        by[r["cls"]] = by.get(r["cls"], 0) + r["gens"]
    print("total generations (ledger):", tot, by)


def main():
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    g = sp.add_parser("gen"); g.add_argument("cls"); g.add_argument("group", choices=["heads", "bodies", "fists", "poses2", "cry", "female"])
    g.add_argument("--only", default=""); g.add_argument("--redo", action="store_true"); g.add_argument("--workers", type=int, default=6); g.add_argument("--seed", type=int, default=7)
    e = sp.add_parser("editback"); e.add_argument("cls"); e.add_argument("part")
    f = sp.add_parser("finish"); f.add_argument("cls"); f.add_argument("--force", action="store_true")
    s = sp.add_parser("sheet"); s.add_argument("cls"); s.add_argument("--poses", default="")
    i = sp.add_parser("install"); i.add_argument("cls"); i.add_argument("--force", action="store_true")
    sp.add_parser("ledger")
    qh = sp.add_parser("qaheads"); qh.add_argument("cls")
    q = sp.add_parser("qa"); q.add_argument("cls")
    d = sp.add_parser("diff"); d.add_argument("cls")
    rw = sp.add_parser("raw"); rw.add_argument("cls"); rw.add_argument("prefix", nargs="?", default="")
    a = ap.parse_args()
    {"gen": cmd_gen, "editback": cmd_editback, "finish": cmd_finish, "sheet": cmd_sheet, "install": cmd_install, "ledger": cmd_ledger, "diff": cmd_diff, "qa": cmd_qa, "qaheads": cmd_qaheads, "raw": cmd_raw}[a.cmd](a)


if __name__ == "__main__":
    main()
