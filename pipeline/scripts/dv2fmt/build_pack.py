#!/usr/bin/env python3
"""build_pack.py — assets/paperdoll-dv2/src/*.png + actions.json -> assets/paperdoll-dv2/paperdoll.json + atlases.

    python pipeline/scripts/dv2fmt/build_pack.py            # build
    python pipeline/scripts/dv2fmt/build_pack.py --check    # rebuild in memory, fail if the files on disk differ

The output uses the mistvale-paperdoll schema (docs/PAPERDOLL.md §2) that src/paperdoll.js renders; the sheet layout is
the DV2 format defined in pipeline/scripts/dv2fmt/dv2fmt.py / sprites/DV2_FORMAT_SPEC.md. All action numbers come from
pipeline/scripts/dv2fmt/actions.json (authored by us), never from DV2 data.

Atlases (one image per layer kind, every source sheet stacked vertically, 1 image px = 1 art px):
    atlas_body.png  atlas_hand.png  atlas_head.png  atlas_hat.png  atlas_armor.png  atlas_cape.png
    atlas_weapon.png  atlas_fx.png
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dv2fmt as F  # noqa: E402

PART_KINDS = [("body", "body"), ("hand", "hand"), ("head", "head")]


def load_src():
    """{kind: {name: Image}} from assets/paperdoll-dv2/src (missing optional pieces are simply absent)"""
    out = {k: {} for k in ("body", "hand", "head", "hat", "armor", "cape", "weapon", "effect")}
    for p in sorted(F.SRC_DIR.glob("*.png")):
        stem = p.stem
        for kind in ("body", "hand", "head"):
            if stem.endswith("_" + kind):
                im = Image.open(p).convert("RGBA")
                if kind == "head" and im.height == 2 * F.HEAD_CELL:
                    # 2-row head (back, 3/4 face): the face row also serves the front view (row 2 added 2026-11-14 for PixelLab heads)
                    full = Image.new("RGBA", F.sheet_size("head"), (0, 0, 0, 0))
                    full.alpha_composite(im, (0, 0))
                    full.alpha_composite(im.crop((0, F.HEAD_CELL, im.width, 2 * F.HEAD_CELL)), (0, 2 * F.HEAD_CELL))
                    im = full
                out[kind][stem[: -len(kind) - 1]] = im
                break
        else:
            kind, _, name = stem.partition("_")
            if kind == "armor":
                # class-aware armor (docs/DV2-ADOPTION-PLAN.md decision "open question 3"): armor_<set>_<class>.png -> skin key "<set>.<class>";
                # the shared armor_<set>.png stays as the plain "<set>" key, which lookFromHunter falls back to when a class sheet is missing
                aset, _, acls = name.partition("_")
                if acls:
                    if acls not in F.CLASSES:
                        print(f"skip {p.name}: unknown class {acls!r}", file=sys.stderr)
                        continue
                    name = f"{aset}.{acls}"
            if kind in out and name:
                out[kind][name] = Image.open(p).convert("RGBA")
    return out


def stack(images: dict, kind: str):
    """vertical atlas; returns (image, {name: y})"""
    W, H = F.sheet_size(kind)
    names = list(images)
    atlas = Image.new("RGBA", (W, max(1, H * len(names))), (0, 0, 0, 0))
    ys = {}
    for i, n in enumerate(names):
        im = images[n]
        if im.size != (W, H):
            raise SystemExit(f"{kind} {n}: size {im.size} != {(W, H)}")
        atlas.alpha_composite(im, (0, i * H))
        ys[n] = i * H
    return atlas, ys


def mirror_xy(v, m):
    return [-v[0] if m else v[0], v[1]]


# class -> weapon type (src/paperdoll.js CLASS_KIT): the per-type action variants (idle.axe, ...) carry that class's own neck
# (output/dv2fmt/work/apply_actions_class.py). warrior / darkknight share a type with paladin and keep the shared idle.
CLASS_TYPE = {"paladin": "sword", "berserker": "axe", "assassin": "dagger", "sorcerer": "staff", "priest": "holystaff", "archer": "bow"}


def standing_height(body: Image.Image, head: Image.Image, acts, cls: str = "") -> int:
    """opaque top of (stand0 front body + face head at the class's idle neck offset) -> foot line, in art px"""
    x, y = F.body_cell_xy("front", "stand0")
    canvas = Image.new("RGBA", (F.CELL + 20, F.CELL + 30), (0, 0, 0, 0))
    canvas.alpha_composite(body.crop((x, y, x + F.CELL, y + F.CELL)), (10, 30))
    idle = acts["actions"].get(f"idle.{CLASS_TYPE.get(cls, '')}") or acts["actions"]["idle"]
    hx, hy = idle["views"]["front"][0]["head"]
    cell = head.crop((0, F.HEAD_ROW["front"] * F.HEAD_CELL, F.HEAD_CELL, (F.HEAD_ROW["front"] + 1) * F.HEAD_CELL))
    canvas.alpha_composite(cell, (10 + F.FOOT[0] + hx - F.HEAD_ANCHOR[0], 30 + F.FOOT[1] + hy - F.HEAD_ANCHOR[1]))
    a = np.asarray(canvas)[..., 3]
    top = int(np.nonzero(a.any(1))[0].min())
    return 30 + F.FOOT[1] - top


def placeholder_sheets():
    try:
        srcs = json.loads((F.SRC_DIR / "sources.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    return sorted(n for n, v in srcs.items() if v.get("placeholder"))


# Layer kinds whose placeholder re-cuts are NOT shipped. Armor used to be listed here (the old placeholder blocks did not fit the
# original bodies); since 2026-11-13 armor is real art (shared armor_<set>.png + per-class armor_<set>_<class>.png) and ships.
SKIP_PLACEHOLDER_KINDS = ()

# DV2 has no armor layer: the outfit is painted into the body (89 body sheets). Classes listed here ship a body skin with their
# armor_<set>_<class>.png composited on top (same 300x300 grid, armor is drawn right after the body anyway); the bare
# <cls>_body.png source stays untouched. Must match src/paperdoll.js DV2_PARTS_ONLY (those classes no longer draw armor/cape/shield).
# 2026-11-14: user "只要跟 dv2 一樣的部位顯示…先做戰士出來看看" -> berserker first.
# 2026-11-14 later: the berserker body is now PixelLab art with the outfit already painted in (pipeline/scripts/dv2fmt/pixellab_body.py,
# docs/PAPERDOLL.md §22.3), so it no longer gets the leather overlay. Old baked look: output/dv2fmt/work/berserker/pre-rig/.
BAKED_OUTFIT = {}


def bake_outfits(src):
    for cls, aset in BAKED_OUTFIT.items():
        arm = src["armor"].get(f"{aset}.{cls}") or src["armor"].get(aset)
        if cls in src["body"] and arm is not None:
            assert arm.size == src["body"][cls].size, (cls, arm.size, src["body"][cls].size)
            src["body"][cls] = Image.alpha_composite(src["body"][cls], arm)


def downscale_2x(im: Image.Image) -> Image.Image:
    """2x weapon sheet (80x80 cells) -> 1x (40x40): each 2x2 block takes its most opaque pixel (thin 1 px lines survive)"""
    a = np.asarray(im.convert("RGBA"))
    h, w = a.shape[0] // 2, a.shape[1] // 2
    blocks = a[:h * 2, :w * 2].reshape(h, 2, w, 2, 4).transpose(0, 2, 1, 3, 4).reshape(h, w, 4, 4)
    pick = blocks[..., 3].argmax(axis=2)
    out = np.take_along_axis(blocks, pick[..., None, None], axis=2)[:, :, 0]
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def add_new_weapon_types(src):
    """Phase 6 (docs/DV2-PHASE6.md G2): rapier / spear / gun sheets for the 1x classes, derived from the art agent's 2x sheets
    (src/x2/weapon_<name>[_fine].png) when the 1x file is absent. No art at all -> handled in build() (fallback sheet or hidden)."""
    for base in ("rapier", "spear", "gun"):
        for name in (base, base + "_fine"):
            p = F.SRC_DIR / "x2" / f"weapon_{name}.png"
            if name not in src["weapon"] and p.exists():
                im = Image.open(p).convert("RGBA")
                if im.size == (F.WEAPON_CELL * F.WEAPON_COLS * 2, F.WEAPON_CELL * 2):
                    src["weapon"][name] = downscale_2x(im)
                else:
                    print(f"skip {p.name}: size {im.size}, want {(F.WEAPON_CELL * F.WEAPON_COLS * 2, F.WEAPON_CELL * 2)}", file=sys.stderr)


def build():
    src = load_src()
    skipped = []
    for n in placeholder_sheets():
        kind, _, rest = Path(n).stem.partition("_")
        if kind in SKIP_PLACEHOLDER_KINDS and rest in src.get(kind, {}):
            del src[kind][rest]
            skipped.append(n)
    bake_outfits(src)
    add_new_weapon_types(src)
    acts = json.loads(F.ACTIONS_JSON.read_text(encoding="utf-8"))
    classes = [c for c in F.CLASSES if c in src["body"] and c in src["head"]]
    if not classes:
        raise SystemExit("no <cls>_body.png + <cls>_head.png in " + str(F.SRC_DIR))
    files, images, skins, sebs = {}, {}, {}, {}

    def add_atlas(fname, key, imgs, kind, layer_skins):
        if not imgs:
            return
        atlas, ys = stack(imgs, kind)
        files[fname] = atlas
        images[key] = fname
        for layer, mapping in layer_skins.items():
            skins[layer] = {skin: {"img": key, "x": 0, "y": ys[n]} for skin, n in mapping(ys).items()}

    add_atlas("atlas_body.png", "body", {c: src["body"][c] for c in classes}, "body", {"body": lambda ys: {c: c for c in ys}})
    add_atlas("atlas_hand.png", "hand", {c: src["hand"][c] for c in classes if c in src["hand"]}, "hand", {"hand": lambda ys: {c: c for c in ys}})
    add_atlas("atlas_head.png", "head", {c: src["head"][c] for c in classes}, "head", {"head": lambda ys: {c: c for c in ys}})
    add_atlas("atlas_hat.png", "hat", dict(src["hat"]), "hat", {"helmet": lambda ys: {n: n for n in ys}})
    add_atlas("atlas_armor.png", "armor", dict(src["armor"]), "armor", {"armor": lambda ys: {n: n for n in ys}})
    add_atlas("atlas_cape.png", "cape", dict(src["cape"]), "cape", {"cape": lambda ys: {n: n for n in ys}})
    weapons_src = dict(src["weapon"])
    add_atlas("atlas_weapon.png", "weapon", weapons_src, "weapon", {
        "weapon": lambda ys: {n: n for n in ys if n != "shield"},
        "shield": lambda ys: {"round": "shield"} if "shield" in ys else {},
    })
    add_atlas("atlas_fx.png", "fx", dict(src["effect"]), "effect", {"effect": lambda ys: {n: n for n in ys}})
    skins.setdefault("cape", {})
    skins.setdefault("armor", {})   # "<set>" (shared) and "<set>.<class>" keys; empty when no armor art is in src/

    weapons = {}
    for n in weapons_src:
        base = n.replace("_fine", "")
        if base == "shield":
            weapons["round"] = {"skin": "round", "handle": list(F.WEAPON_TYPES["shield"]["grip"]), "type": "shield"}
        else:
            weapons[n] = {"skin": n, "handle": list(F.WEAPON_TYPES[base]["grip"]), "type": F.WEAPON_TYPES[base]["type"]}
    # Phase 6 (G2): every DV2 weapon type is holdable even before its art exists -- rapier/spear borrow a sheet of the same
    # silhouette family, gun without art is hidden, fist (DV2 PUNCH, spProcType 2 "no weapon layer") is always hidden
    for base, fb in F.NEW_WEAPON_FALLBACK_ART.items():
        for suf in ("", "_fine"):
            if base + suf not in weapons and fb + suf in weapons:
                weapons[base + suf] = {"skin": fb + suf, "handle": list(weapons[fb + suf]["handle"]), "type": base, "fallbackArt": fb + suf}
    for suf in ("", "_fine"):
        if "gun" + suf not in weapons:
            weapons["gun" + suf] = {"skin": None, "handle": [20, 29], "type": "gun", "hidden": True}
    weapons["fist"] = {"skin": None, "handle": [20, 28], "type": "fist", "hidden": True}

    # ---- sebs: slot layers (body/hand/armor share the grid), head expressions, hat, weapon, fx
    T = (-F.FOOT[0], -F.FOOT[1])
    HT = (-F.HEAD_ANCHOR[0], -F.HEAD_ANCHOR[1])
    for a, spec in acts["actions"].items():
        for d, dname in enumerate(F.DIRS):
            view, m = F.DIR_VIEW[d], F.DIR_MIRROR[d]
            frames = {}
            for i, sl in enumerate(spec["views"][view]):
                x, y = F.body_cell_xy(view, sl["cell"])
                frames[str(i)] = [x, y, F.CELL, F.CELL, T[0], T[1], m, 0]
            sebs[f"body/{a}/{dname}"] = {"max": len(frames), "frames": frames}
    ND = len(F.DIRS)   # 4 (up, right, down, left)
    for col, expr in enumerate(F.EXPRESSIONS):
        sebs[f"head/{expr}"] = {"max": ND, "frames": {
            str(d): [col * F.HEAD_CELL, F.HEAD_ROW[F.DIR_HEAD_ROW[d]] * F.HEAD_CELL, F.HEAD_CELL, F.HEAD_CELL, HT[0], HT[1], F.DIR_MIRROR[d], 0]
            for d in range(ND)}}
    # G4: the "cry" expression (DV2 head seb 7 cry2, used by 泣く1/2). 1x heads have no cry column -> same frames as "hurt"
    # (the 2x rig draws head_cry_<view>.png when the class has it, rig2x.py)
    sebs["head/cry"] = json.loads(json.dumps(sebs["head/hurt"]))
    sebs["hat/std"] = {"max": ND, "frames": {
        str(d): [0, F.HAT_ROW[F.DIR_HAT_ROW[d]] * F.HAT_CELL, F.HAT_CELL, F.HAT_CELL, HT[0], HT[1], F.DIR_MIRROR[d], 0]
        for d in range(ND)}}
    # one seb for every weapon: frame = sebF * 2 + mirror, i.e. F.WEAPON_COLS columns (four drawn tilt-angle cells) x ru flip
    NCERT = F.WEAPON_COLS
    sebs["weapon/std"] = {"max": NCERT * 2, "frames": {str(f): [(f // 2) * F.WEAPON_CELL, 0, F.WEAPON_CELL, F.WEAPON_CELL, 0, 0, f & 1, 0]
                                                      for f in range(NCERT * 2)}}
    # effects: 4 directions per sebF (frame = sebF * 4 + dir). Which of the 4 drawn columns (up/right/down/left) each direction uses
    # comes from actions.json fxDirCol (DV2-derived: e.g. the vertical slash uses the side arcs on every direction); default = natural.
    # fxAlias adds effect types that reuse another effect's art (hslash -> slash art, different columns).
    NATURAL = list(range(ND))
    fx_alias = acts.get("fxAlias", {})
    fx_names = list(src["effect"]) + [n for n, base_n in fx_alias.items() if base_n in src["effect"]]
    for fxn in fx_names:
        cols = acts.get("fxDirCol", {}).get(fxn, NATURAL)
        sebs[f"fx/{fxn}"] = {"max": ND * F.FX_ROWS, "frames": {str(f): [cols[f % ND] * F.FX_CELL, (f // ND) * F.FX_CELL, F.FX_CELL, F.FX_CELL,
                                                                    -F.FX_CELL // 2, -F.FX_CELL // 2, 0, 0] for f in range(ND * F.FX_ROWS)}}

    # ---- actions / rows
    orders = acts["orders"]
    actions = {}
    for a, spec in acts["actions"].items():
        rows = []
        for d, dname in enumerate(F.DIRS):
            view, m = F.DIR_VIEW[d], F.DIR_MIRROR[d]
            sl = spec["views"][view]
            # head/helmet follow the DV2 bob: row.off[2] alternates -8/-7 on the walk (tools/dv2-motion-derive.mjs stores the delta as `bob`)
            head_off = [mirror_xy([s["head"][0] + (s.get("bob") or (0, 0))[0],
                                   s["head"][1] + (s.get("bob") or (0, 0))[1]], m) for s in sl]
            # body cell lifted inside its 30x30 cell (a stepping foot drawn below the ground line, pixellab_body.py): draw it back down.
            # The hand layer follows the body (no own part), so it moves with it.
            body_off = [mirror_xy(s.get("body_off") or (0, 0), m) for s in sl] if any(s.get("body_off") for s in sl) else [[0, 0]]
            row = {"parts": {
                # the cape is drawn on the BODY grid: it reuses the body's cell
                # frames outright instead of shipping a duplicate seb per direction
                "cape": {"seb": f"body/{a}/{dname}", "off": body_off},
                "body": {"seb": f"body/{a}/{dname}", "off": body_off},
                "head": {"seb": f"head/{spec['head']}", "off": head_off},
                "helmet": {"seb": "hat/std", "off": head_off},
                "weapon": {"seb": ["weapon/std"], "sebF": [s["sebF"] for s in sl], "deg": [(-s["deg"] if m else s["deg"]) or 0 for s in sl],
                           "inv": [m for _ in sl], "show": [1 for _ in sl], "off": [mirror_xy(s["wh"], m) for s in sl]},
                "shield": {"seb": ["weapon/std"], "sebF": [1 if view == "side" else 0 for _ in sl], "deg": [0 for _ in sl],
                           "inv": [m for _ in sl], "show": [0 if s["cell"] == "lying" else 1 for s in sl],
                           "off": [mirror_xy(s["oh"], m) for s in sl]},
            }}
            dd = (spec.get("dirs") or {}).get(dname)
            if dd:
                # DV2-derived per-direction data (tools/dv2-motion-derive.mjs): already screen-space for this direction, NOT mirrored again.
                # The grip (wh) is ours (measured on our art), mirrored with the body cell.
                ds = dd["slots"]
                w = row["parts"]["weapon"]
                w["sebF"] = [x["sebF"] for x in ds]; w["deg"] = [x["deg"] for x in ds]
                w["inv"] = [x["inv"] for x in ds]; w["show"] = [x["show"] for x in ds]
                if any(x.get("carry") for x in ds):
                    # generated bodies (pixellab_body.py): carry poses hold the weapon at a low angle at the real fist instead of
                    # DV2's upright one at DV2's grip (apply_actions_class.py); marked so the DV2-kit test knows it is intentional
                    w["carry"] = [1 if x.get("carry") else 0 for x in ds]
                # DV2 的武器 / 非武器手握點（螢幕座標，已含方向與走路彈跳）優先；沒有才用我們量在自家美術上的 wh/oh
                if any(x.get("off") for x in ds):
                    w["off"] = [list(x["off"]) if x.get("off") else mirror_xy(s["wh"], m) for x, s in zip(ds, sl)]
                if any(x.get("oh") for x in ds):
                    row["parts"]["shield"]["off"] = [list(x["oh"]) if x.get("oh") else mirror_xy(s["oh"], m) for x, s in zip(ds, sl)]
                # swing sets use OUR grip (no x["off"]; tools/dv2-motion-derive.mjs SWING_SETS keeps DV2's as dv2off): move DV2's effect
                # by the same grip delta so the streak/arc stays on the blade (2026-11-14 audit: thrust streak sat at the feet, blade at the chest)
                def _fxo(x, i):
                    o = x.get("fxOff")
                    if o is None or not x.get("dv2off"):
                        return o
                    g = w["off"][i]
                    return [o[0] + g[0] - x["dv2off"][0], o[1] + g[1] - x["dv2off"][1]]
                fx = [(x["fx"], x.get("fxType", "slash"), _fxo(x, i)) if x.get("fx") is not None and x.get("fxType", "slash") in fx_names
                      else (s["fx"], s.get("fxType", "slash"), mirror_xy(s["fxOff"], m) if s.get("fxOff") else acts["fxOffset"][dname]) if s.get("fx") is not None
                      else None for i, (x, s) in enumerate(zip(ds, sl))]
                if any(f is not None for f in fx):
                    row["parts"]["effect"] = {"act": [0 if f is None else 1 for f in fx], "type": [f[1] if f else "slash" for f in fx],
                                              "sebF": [f[0] if f else 0 for f in fx], "off": [f[2] if f else [0, 0] for f in fx]}
                row["order"] = dd["order"]
                rows.append(row)
                continue
            if any(s["fx"] is not None for s in sl):
                row["parts"]["effect"] = {"act": [0 if s["fx"] is None else 1 for s in sl], "type": [s.get("fxType", "slash") for s in sl],
                                          "sebF": [s["fx"] or 0 for s in sl],
                                          "off": [mirror_xy(s["fxOff"], m) if s.get("fxOff") else acts["fxOffset"][dname] for s in sl]}
            base = orders["back" if view == "back" else view]
            if view == "back":
                # up / upRight / upLeft: the swing arc / burst happens on the far side of the hero (away from the camera),
                # so the effect is drawn first, behind the body and head (side/down rows keep it on top)
                base = ["effect"] + [l for l in base if l != "effect"]
            if a.split(".")[0] == "attack" and view != "back" and any(s["cell"] == "windup" for s in sl):
                # every attack variant (attack.sword/.axe/...): the windup cell raises the weapon behind the body.
                # per slot, keyed on the cell, so a variant whose first slot is not a windup cell (attack.bow: aim0) keeps the base order
                row["order"] = [orders["windup"] if s["cell"] == "windup" else base for s in sl]
            elif any(s["cell"] == "lying" for s in sl):
                row["order"] = [base if s["cell"] != "lying" else [l for l in orders["side"] if l not in ("head", "helmet")] for s in sl]   # the lying body cell carries its own head
            else:
                row["order"] = base
            rows.append(row)
        act = {"af": spec["af"], "loop": spec["loop"], "rows": rows}
        if spec.get("headMirror"):
            act["headMirror"] = True
        if spec.get("spProc"):
            act["spProc"] = spec["spProc"]   # DV2 spProcType kept as data (4 = RIDECHARGE2: the mount plays SEB_M charge2 in sync, docs/PAPERDOLL.md §20)
        if spec.get("dv2"):
            act["dv2"] = spec["dv2"]   # provenance only: which DV2 kit action set the motion structure follows
        if spec.get("tint"):
            act["tint"] = spec["tint"]   # G5 petrify: engine-level stone tint over every layer (src/paperdoll.js drawParts / tintPixels)
        if spec.get("hop"):
            act["hop"] = spec["hop"]     # jump_victory: parabola height over the whole action (art px; ours, DV2's jump is code, not data)
        if spec.get("impactSlot") is not None:
            act["impactSlot"] = spec["impactSlot"]
        if spec.get("releaseSlot") is not None:
            act["releaseSlot"] = spec["releaseSlot"]
        actions[a] = act

    heights = {c: standing_height(src["body"][c], src["head"][c], acts, c) for c in classes}
    data = {
        "format": "mistvale-paperdoll", "version": 1, "tickRate": 20,
        "meta": {
            "placeholder": [n for n in placeholder_sheets() if n not in skipped],   # shipped source sheets still from the placeholder re-cut (empty = all real art)
            "layout": "dv2fmt v1 (sprites/DV2_FORMAT_SPEC.md)",
            "generator": "pipeline/scripts/dv2fmt/build_pack.py",
            "heroHeight": round(sum(heights.values()) / len(heights)), "heroHeights": heights,
            "footFromBottom": 0, "cell": F.CELL, "dirs": F.DIRS, "effectDirs": ND,
            "defaultClass": "berserker", "classes": classes,
            "note": "Original mistvale art in the DV2 sheet format. 4 directions (up/right/down/left, left = mirrored side view), 1:1 with DV2 (spec §4).",
        },
        "weaponOrigin": {"dx": [0, 0, 0, 0], "dy": 0},
        "layers": {
            "cape":   {"kind": "slot", "follows": "body", "attach": {"before": "body"}},
            "body":   {"kind": "slot"},
            "armor":  {"kind": "slot", "follows": "body", "attach": {"after": "body"}},
            "shield": {"kind": "weapon"},
            "hand":   {"kind": "slot", "follows": "body"},
            "head":   {"kind": "dir"},
            "helmet": {"kind": "dir", "follows": "head", "attach": {"after": "head"}},
            "weapon": {"kind": "weapon"},
            "effect": {"kind": "effect"},
        },
        "images": images, "skins": skins, "sebs": sebs, "weapons": weapons,
        "effects": {n: {"seb": f"fx/{n}", "skin": fx_alias.get(n, n)} for n in fx_names},
        "actions": actions,
        # DV2 weapon combos (docs/PAPERDOLL.md §22): per weapon type, hits per charge + weighted pool of attack variants
        # ({action base name: weight}); src/paperdoll.js attackVariant rolls one per hit. Derived numbers, see tools/dv2-motion-derive.mjs.
        "combos": {t: {"count": c["count"], "pool": [[n, w] for n, w in c["pool"]]} for t, c in acts.get("combos", {}).items()},
        # G2: weapon types without their own action tables use another type's (resolveAction: <a>.<type> -> <a>.<alias> -> <a>)
        "typeAlias": dict(F.TYPE_ALIAS),
        "aliases": {"stand": "idle", "move": "walk", "cast": "skill", "damage": "hurt", "hit": "hurt",
                    "dead": "death", "falling": "death", "knockdown": "death", "cheer": "victory"},
    }
    # DV2 rig at 2x for classes built from separate PixelLab parts (docs/PAPERDOLL.md §22.6): adds the 2x atlases/sebs and rewrites
    # that class's weapon-type action rows with DV2's offsets x 2
    import rig2x
    rep = rig2x.apply(files, data, acts)
    if rep:
        print("rig2x", rep)
    return files, data


def png_bytes(im):
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    files, data = build()
    outs = {n: png_bytes(im) for n, im in files.items()}
    outs["paperdoll.json"] = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    # atlases this build no longer produces (e.g. atlas_armor.png once the placeholder armor is skipped): build.mjs copies every
    # *.png in the pack dir, so a stale one would still ship. --check reports them, a build deletes them.
    stale = sorted(p.name for p in F.PACK_DIR.glob("atlas_*.png") if p.name not in outs) if F.PACK_DIR.exists() else []
    if a.check:
        bad = [n for n, b in outs.items() if not (F.PACK_DIR / n).exists() or (F.PACK_DIR / n).read_bytes() != b]
        bad += [n + " (stale)" for n in stale]
        print("OK paperdoll-dv2 pack up to date" if not bad else "FAIL differs: " + ", ".join(bad))
        return 1 if bad else 0
    F.PACK_DIR.mkdir(parents=True, exist_ok=True)
    for n in stale:
        (F.PACK_DIR / n).unlink()
        print(f"removed stale assets/paperdoll-dv2/{n}")
    for n, b in outs.items():
        (F.PACK_DIR / n).write_bytes(b)
        extra = f" {files[n].width}x{files[n].height}" if n in files else ""
        print(f"wrote assets/paperdoll-dv2/{n} ({len(b) / 1024:.1f} KB){extra}")
    print("heroHeights", data["meta"]["heroHeights"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
