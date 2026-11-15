"""rig2x.py -- the DV2 rig at 2x for classes built from separate PixelLab parts (docs/PAPERDOLL.md §22.6, §23).

Called at the end of build_pack.build(). Phase 6 (docs/DV2-PHASE6.md G9) generalised it from the berserker to every game class:
a class runs the 2x rig as soon as assets/paperdoll-dv2/src/x2/<class>/ has body_stand_front.png and head_normal_front.png;
otherwise it stays on its 1x sheets exactly as before.

Output (all added to the pack built by build_pack.py):
  * "<action>@2x" for every 1x action key: the same DV2 motion (af, weapon angle/flip/column/visibility, draw order, effect slots)
    with DV2's offsets x 2 (pipeline/scripts/dv2fmt/dv2_rig.json, numbers measured from the kit): head, hat, weapon grip, effect.
    The rows are CLASS-AGNOSTIC: body / hand sebs are named "body2x/{v}/<id>" / "hand2x/{v}/<id>" and src/paperdoll.js fills {v}
    with the layer's look variant (= the class), so one row serves every 2x class. "<base>.<type>@2x" rows identical to "<base>@2x"
    are dropped (resolveAction falls back to the base row).
  * per class: body cells = the class's PixelLab pose part for each slot (pose -> part fallback chain POSE_PART, always ending at
    "stand"), moved so the collar meets DV2's neck (folded into the frame's tx/ty, per class); hands = the class's fists (weapon fist
    on DV2's grip while the weapon is shown, otherwise on the arm tip); heads with 7 expressions (cry falls back to hurt);
    female heads (head_f_*) as head skin "<class>.f" when present (G6).
  * weapons "<id>@2x": the art agent's src/x2/weapon_<id>.png (80x80 cells, grip (40,58)) or, without it, the 1x sheet x2 nearest.
  * helmets "<hat>@2x": 1x hats x2; art hats src/x2/hat_<name>_<view>.png placed on each class's own head: "<name>@2x.<class>".
  * effects "<name>@2x": x2 nearest copies.
Everything is shifted down by GROUND: DV2 draws its feet 4 px (1x) above the foot anchor, our classes stand on it.
"""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

import dv2fmt as F

S = 2
# class -> its weapon type (src/paperdoll.js CLASS_KIT); every game class can run the 2x rig once its parts exist
CLASS_TYPES = {"archer": "bow", "sorcerer": "staff", "priest": "holystaff", "paladin": "sword", "berserker": "axe", "assassin": "dagger"}
GROUND = 6
BC, HC, WC = F.CELL * S, F.HEAD_CELL * S, F.WEAPON_CELL * S          # 60, 40, 80
GRIP = (40, 58)
# DV2's bow handle (20,33) is NOT the grip: it sits ~13.5 px below the bow's middle (our 1x bow, drawn to DV2's format, spans
# rows 12..27 with handle row 33). Since 2026-11-15 every 2x bow's handle is the bow's middle (art bows: fix_weapons2x.py puts it
# on GRIP; a 1x bow x2 gets its middle row) and the fist on DV2's (mapped) handle point holds it there -- no lift any more.
CHIN_ROW = 34          # our head's last row inside its 40x40 cell (DV2: row 17 of 20)
NECK_OVERLAP = 3       # rows of the body's top the chin covers (DV2's neck)
NECK_MIN, NECK_MAX = 2, 7   # how far the chin may deviate from that to keep the feet on the ground (layout)
# our own effects drawn at their 1x art size on the 2x rig: they were sized for the 29 px 1x hero, x2 they outgrew the ~35 px 2x
# hero (punch star 30x36, staff burst 40x40 over the face, arrow 42 px, muzzle flash 14x26). DV2's slash/hslash/thrust keep x2.
FX_NATIVE = {"punch", "burst", "arrow", "gunfire"}
# 2x art staffs reach 12 px below the grip: with the hand at the hip the foot of the staff went 5-11 px into the ground (idle,
# walk, cast). Held lower on the shaft (the pivot moves down, the head rises above the hand)
HOLD_LOWER = {"staff": 6, "holystaff": 6}
FX_AT_TIP = {"burst"}   # our own effects drawn on the far end of the weapon art (the staff head), not at the 1x offset x2
FX_FIST_PUSH = 3       # an effect on a bare fist (punch) is centred this far beyond the punching arm's tip
SHIELD_HALF = 11       # the round shield's 2x art reaches 11 rows below its handle (centre)
HAND_REACH = 2.0      # a weapon fist's centre sits at most this far from its arm's nearest pixel (the ~8 px fist overlaps it)
HAT_SINK = 7          # a 2x hat's bottom row sits this many rows below the top of the class's head (it wraps the skull)
DV2_DIR = [0, 1, 1, 2]
VIEW_OF = F.DIR_VIEW   # up back, right side, down front, left side (mirrored)
# docs/DV2-RIG-PROMPTS.md 0.4 + docs/DV2-PHASE6.md §2.1 (Phase 6 poses)
PARTS = ["stand", "walk_l", "walk_r", "windup", "chop", "swing", "hurt", "crouch", "cheer", "lying",
         "thrust", "aim", "aim_full", "cast", "cast_high",
         "carry", "carry_walk_l", "carry_walk_r", "pose", "cry", "cry_sit", "clap0", "clap1", "give0", "give1",
         "punch0", "punch1", "punch2", "guard"]
# pose (actions.json views[].pose, else the 1x cell name) -> parts to try in order; "stand" is always appended (every class has it)
POSE_PART = {"stand0": ["stand"], "stand1": ["stand"], "walk0": ["stand"], "walk1": ["walk_l"], "walk2": ["stand"], "walk3": ["walk_r"],
             "windup": ["windup"], "strike1": ["chop"], "strike0": ["swing"], "thrust": ["thrust", "swing"], "hurt": ["hurt"],
             "kneel": ["crouch"], "victory0": ["stand"], "victory1": ["cheer"], "cast0": ["cast", "cheer"], "cast1": ["cast_high", "cheer"],
             # aim (bow): the punch1 part first -- front arm straight out at shoulder height, back hand at the chin = a drawn bow.
             # The archer's own aim/aim_full parts came out ~ stand (docs/DV2-PHASE6.md §4.1), so the bow was held at the hip with
             # its lower limb through the ground (2026-11-15 audit)
             "aim0": ["punch1", "aim", "swing"], "aim1": ["punch1", "aim_full", "windup"], "lying": ["lying"],
             # Phase 6 (G1): DV2 sets 4-27
             "carry": ["carry", "cheer"], "carry_walk_l": ["carry_walk_l", "carry", "cheer"], "carry_walk_r": ["carry_walk_r", "carry", "cheer"],
             "pose": ["pose", "swing"], "cry": ["cry", "hurt"], "cry_b": ["cry", "hurt"], "cry_sit": ["cry_sit", "crouch"],
             "clap0": ["clap0", "windup"], "clap1": ["clap1", "windup"], "give0": ["give0", "windup"], "give1": ["give1", "swing"],
             "punch0": ["punch0", "windup"], "punch1": ["punch1", "swing"], "punch2": ["punch2", "swing"], "guard": ["guard", "windup"],
             "handshake": ["aim", "swing"], "gun": ["swing"], "petrify": ["stand"]}
POSE_DY = {"cry_b": 2}   # 泣く1 second cell = the same cry part sunk 1 DV2 px (docs/DV2-PHASE6.md §2.1)
EXPR2X = ["normal", "blink", "hurt", "shout", "happy", "ko", "cry"]
EXPR_FALLBACK = {"cry": "hurt"}   # G4: no cry art yet -> the hurt face
RIG = Path(__file__).resolve().parent / "dv2_rig.json"
LYING_NECK = {"berserker": "left"}   # which end of the side-view lying part is the neck (looked at the art); default right
LYING_RIGHT_EDGE = -2                # lying body's neck end, relative to the foot anchor: just inside the head's back edge


def rgba(p):
    return np.asarray(Image.open(p).convert("RGBA")).copy()


# 2026-11-15 coordination audit: every installed *_side.png (heads, female heads, bodies, fists, art hats -- all six classes)
# is drawn FACING LEFT (3/4 faces look left, punch1 reaches left, fists' knuckles and cap brims point left), but the side
# view is played unmirrored for "right" (dv2fmt.DIR_MIRROR) with DV2's weapon in front at +x: a hero walking right looked
# back over its shoulder. The side art is mirrored once on load so it faces right like DV2's (left = mirrored again).
# The lying part keeps its own orientation rule (LYING_NECK).
SIDE_ART_FACES_LEFT = True


def art(p):
    """an art part; a side view (file *_side.png, not the lying body) mirrored to face right (SIDE_ART_FACES_LEFT)"""
    img = rgba(p)
    p = Path(p)
    if SIDE_ART_FACES_LEFT and p.stem.endswith("_side") and "_lying_" not in p.name:
        img = img[:, ::-1].copy()
    return img


def place(img, cell, cx, bottom):
    """img content into a cell: content x-centre on cx (edge coords), last row on `bottom`"""
    a = img[..., 3] > 0
    ys, xs = np.nonzero(a)
    out = np.zeros((cell, cell, 4), np.uint8)
    if not len(xs):
        return out
    crop = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    x0, y0 = int(round(cx - w / 2)), bottom - h + 1
    sy0, sx0 = max(0, -y0), max(0, -x0)
    ey, ex = min(h, cell - y0), min(w, cell - x0)
    if ey > sy0 and ex > sx0:
        out[y0 + sy0:y0 + ey, x0 + sx0:x0 + ex] = crop[sy0:ey, sx0:ex]
    return out


def collar_x(img):
    a = img[..., 3] > 0
    ys, xs = np.nonzero(a)
    top = ys.min()
    band = a[top:top + 3]
    bx = np.nonzero(band.any(0))[0]
    return (bx.min() + bx.max() + 1) / 2


def arm_tips(cell, view):
    """(weapon-side tip, off-side tip) as pixel centres in cell coords: the outermost points of the arms (legs excluded)"""
    a = cell[..., 3] > 0
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None, None
    top, bot = ys.min(), ys.max()
    cx = collar_x(cell)
    sel = (ys >= top + 2) & (ys <= bot - max(4, (bot - top) // 4))
    px, py = xs[sel] + 0.5, ys[sel] + 0.5
    if not len(px):
        return None, None

    def tip(m):
        if not m.any():
            return None
        d = np.where(m, np.abs(px - cx) * 3 + (py - top) * 0.2, -1)
        i = int(np.argmax(d))
        near = m & ((px - px[i]) ** 2 + (py - py[i]) ** 2 <= 4)
        return [float(px[near].mean()), float(py[near].mean())]

    left, right = tip(px < cx), tip(px > cx)
    if view == "front":
        return left, right            # character's right hand is on screen-left
    if view == "back":
        return right, left
    far = tip(np.ones_like(px, bool))  # side view facing right: the near (weapon) arm reaches farthest
    other = right if far and left and abs(far[0] - left[0]) < 0.6 else left
    return far, other


def stack(images):
    W = max(im.shape[1] for im in images.values())
    H = sum(im.shape[0] for im in images.values())
    out = np.zeros((H, W, 4), np.uint8)
    ys, y = {}, 0
    for n, im in images.items():
        out[y:y + im.shape[0], :im.shape[1]] = im
        ys[n] = y
        y += im.shape[0]
    return Image.fromarray(out), ys


def x2(a):
    return np.repeat(np.repeat(a, S, axis=0), S, axis=1)


def active_classes():
    """classes whose 2x parts are installed (docs/DV2-PHASE6.md G9): body_stand_front + head_normal_front, else they stay 1x"""
    out = []
    for cls in CLASS_TYPES:
        src = F.SRC_DIR / "x2" / cls
        if (src / "body_stand_front.png").exists() and (src / "head_normal_front.png").exists():
            out.append(cls)
    return out


def head_sheet(src, prefix, back_file, fallback_back=None):
    """7 expressions x (back, face = side, front), content centred, chin on CHIN_ROW. Missing art falls back: expression ->
    EXPR_FALLBACK -> normal; front -> side; back -> fallback_back (the male back) -> the normal front."""
    hs = np.zeros((HC * 3, HC * len(EXPR2X), 4), np.uint8)
    back = rgba(src / back_file) if (src / back_file).exists() else fallback_back
    for ci, expr in enumerate(EXPR2X):
        for ri, view in enumerate(["back", "side", "front"]):
            img = None
            if view == "back":
                img = back
            else:
                for e in (expr, EXPR_FALLBACK.get(expr, "normal"), "normal"):
                    for v in ((view, "side") if view == "front" else (view, "front")):
                        p = src / f"{prefix}{e}_{v}.png"
                        if p.exists():
                            img = art(p)
                            break
                    if img is not None:
                        break
            if img is None and back is None and view == "back":
                p = src / f"{prefix}normal_front.png"
                img = rgba(p) if p.exists() else None
            if img is None:
                continue
            hs[ri * HC:(ri + 1) * HC, ci * HC:(ci + 1) * HC] = place(img, HC, HC / 2, CHIN_ROW)
    return hs, back


def apply(files, data, acts):
    rig = json.loads(RIG.read_text(encoding="utf-8"))
    dv2 = {(r["set"], r["direct"]): r["slots"] for r in rig["rows"]}
    images, skins, sebs = data["images"], data["skins"], data["sebs"]
    ND = len(F.DIRS)

    # ---- effects x2 (shared by every 2x class)
    fx_img = files.get("atlas_fx.png")
    if fx_img is not None:
        big = fx_img.resize((fx_img.width * S, fx_img.height * S), Image.NEAREST)
        files["atlas_fx_x2.png"] = big
        images["fx2x"] = "atlas_fx_x2.png"
        for n, e in list(data["effects"].items()):
            if n.endswith("@2x"):
                continue
            sk = skins["effect"][e["skin"]]
            if n in FX_NATIVE:          # drawn at its 1x art size on the 2x hero (same 1x cells, no x2 copy)
                skins["effect"][e["skin"] + "@2x"] = dict(sk)
                data["effects"][n + "@2x"] = {"seb": e["seb"], "skin": e["skin"] + "@2x"}
                continue
            skins["effect"][e["skin"] + "@2x"] = {"img": "fx2x", "x": sk.get("x", 0) * S, "y": sk.get("y", 0) * S}
            fr = sebs[e["seb"]]["frames"]
            sebs[e["seb"].replace("fx/", "fx2x/")] = {"max": sebs[e["seb"]]["max"], "frames": {
                k: [q[0] * S, q[1] * S, q[2] * S, q[3] * S, q[4] * S, q[5] * S, q[6], q[7]] for k, q in fr.items()}}
            data["effects"][n + "@2x"] = {"seb": e["seb"].replace("fx/", "fx2x/"), "skin": e["skin"] + "@2x"}

    classes = active_classes()
    if not classes:
        return {}

    # ---- per class: body / head / hand sources
    body_sheets, head_sheets, fists, canons, report = {}, {}, {}, {}, {}
    cellpos = {(view, part): (pi * BC, vi * BC) for vi, view in enumerate(["back", "side", "front"]) for pi, part in enumerate(PARTS)}
    for cls in classes:
        src = F.SRC_DIR / "x2" / cls
        canon = {}
        sheet = np.zeros((BC * 3, BC * len(PARTS), 4), np.uint8)    # unused part columns stay empty
        for vi, view in enumerate(["back", "side", "front"]):
            for pi, part in enumerate(PARTS):
                p = src / f"body_{part}_{view}.png"
                if not p.exists():
                    p = src / f"body_{part}_side.png"            # lying: side only; a missing back/front view borrows the side
                if not p.exists():
                    continue
                img = art(p)
                if not (img[..., 3] > 0).any():
                    continue
                if part == "lying":
                    # DV2 draws the downed hero's (upright) head on the ground at the body's end (side view: head at x +3 at 1x):
                    # turn the body so its neck end faces the head and tuck that end in under the head's back edge
                    if LYING_NECK.get(cls, "right") == "left":
                        img = img[:, ::-1]
                    xs_ = np.nonzero((img[..., 3] > 0).any(0))[0]
                    w_ = xs_.max() - xs_.min() + 1
                    c = place(img, BC, BC / 2 + LYING_RIGHT_EDGE - w_ / 2, BC - 1)
                else:
                    xs_ = np.nonzero((img[..., 3] > 0).any(0))[0]
                    centre = (xs_.min() + xs_.max() + 1) / 2
                    c = place(img, BC, BC / 2 - (collar_x(img) - centre), BC - 1)     # collar on x = 30, feet on the last row
                sheet[vi * BC:(vi + 1) * BC, pi * BC:(pi + 1) * BC] = c
                a = c[..., 3] > 0
                ys_, xs_ = np.nonzero(a)
                canon[(view, part)] = {"top": int(ys_.min()), "tips": arm_tips(c, view),
                                       "px": np.stack([xs_ + 0.5, ys_ + 0.5], 1).astype(float)}
        body_sheets[cls], canons[cls] = sheet, canon
        hs, back = head_sheet(src, "head_", "head_back.png")
        head_sheets[cls] = hs
        if (src / "head_f_normal_front.png").exists():       # G6: female head set, bodies shared
            head_sheets[cls + ".f"], _ = head_sheet(src, "head_f_", "head_f_back.png", back)
        f = {}
        for v in ("side", "front"):
            if (src / f"fist_{v}.png").exists():
                f[v] = art(src / f"fist_{v}.png")
        if f:
            f.setdefault("side", f.get("front"))
            f.setdefault("front", f.get("side"))
            f["back"] = f["front"]
        fists[cls] = f

    def choose(cls, view, pose):
        canon = canons[cls]
        for p_ in POSE_PART.get(pose, [pose]) + ["stand"]:
            if (view, p_) in canon:
                return view, p_
        for v in ("front", "side", "back"):
            if (v, "stand") in canon:
                return v, "stand"
        return None

    def layout(cls, view, m, slots):
        """per slot: (u, v, body offset, part, src view) for this class; slots = [(pose, hrel)]"""
        out, cell_off = [], {}
        for pose, hrel in slots:
            ch = choose(cls, view, pose)
            if ch is None:
                out.append(None)
                continue
            sv, part = ch
            key = (sv, part, pose, tuple(hrel))
            if key not in cell_off:
                if part == "lying":
                    cell_off[key] = [0, 0, 0]
                else:
                    chin = hrel[1] - HC + CHIN_ROW
                    top_rel = canons[cls][(sv, part)]["top"] - BC
                    hang = (chin - NECK_OVERLAP + 1) - top_rel + POSE_DY.get(pose, 0)
                    # 2026-11-15 audit: hanging every body from DV2's neck put the feet 2-4 px under the ground on most frames (our
                    # parts are taller than DV2's 8 px body; DV2's walk bob lowers the head, not the feet) and up to 9 px on the
                    # sitting / punching parts. Feet on the ground (y 0) when the chin then still overlaps the body top by
                    # NECK_MIN..NECK_MAX rows; a part too tall even for NECK_MAX keeps its feet on the ground and lifts THIS
                    # class's head by the rest (head dy, parts.head/helmet.offBy); a part too short hangs (feet up) at NECK_MIN.
                    lo, hi = hang - (NECK_MAX - NECK_OVERLAP), hang + (NECK_OVERLAP - NECK_MIN)
                    y = int(min(max(0, lo), hi))
                    hdy = 0
                    if y > 0:
                        hdy, y = -y, 0
                    cell_off[key] = [hrel[0], y, hdy]
            u, v = cellpos[(sv, part)]
            out.append((u, v, cell_off[key], part, sv))
        return out

    def body_pts(cls, L, m):
        """the slot's body pixels (pixel centres) in foot-relative 2x coords, mirrored like the cell"""
        _, _, bo, part, sv = L
        P = canons[cls][(sv, part)]["px"]
        X = (BC - P[:, 0]) if m else P[:, 0]
        return np.stack([X - BC / 2 + bo[0], P[:, 1] - BC + bo[1]], 1)

    def hand_target(pts, g, dbb):
        """DV2's hand point g (2x, foot-relative) moved onto OUR body (docs/PAPERDOLL.md §23.1): mapped from DV2's body box to
        ours per axis (DV2's 2x body is ~28 px wide, ours ~13: DV2's grip x 2 lands beside our arm), then pulled to within
        HAND_REACH of our nearest body pixel, so the fist sits on the arm the art draws in that direction"""
        ob = (pts[:, 0].min() - 0.5, pts[:, 1].min() - 0.5, pts[:, 0].max() + 0.5, pts[:, 1].max() + 0.5)
        p = np.zeros(2)
        for k in (0, 1):
            dc, dh = (dbb[k] + dbb[k + 2]) / 2, max(1.0, (dbb[k + 2] - dbb[k]) / 2)
            oc, oh = (ob[k] + ob[k + 2]) / 2, (ob[k + 2] - ob[k]) / 2
            p[k] = oc + (g[k] - dc) / dh * oh
        d = np.hypot(pts[:, 0] - p[0], pts[:, 1] - p[1])
        j = int(d.argmin())
        if d[j] <= HAND_REACH:
            return p
        return pts[j] + (p - pts[j]) / d[j] * HAND_REACH

    def side_tip(cls, L, m, gx):
        """the arm tip (foot-relative) on the side of x = gx: of this part's two arm tips the one whose x lies the same way from
        the body's centre as gx (DV2's grip); gx near the centre -> the weapon-arm tip"""
        _, _, bo, part, sv = L
        tips = [t for t in canons[cls][(sv, part)]["tips"] if t is not None]
        if not tips:
            return [gx, -10.0]

        def rel(t):
            cx = (BC - t[0]) if m else t[0]
            return [cx - BC / 2 + bo[0], t[1] - BC + bo[1]]
        rt = [rel(t) for t in tips]
        pts = body_pts(cls, L, m)
        c = float(np.median(pts[:, 0]))
        reach = sorted(rt, key=lambda t: -abs(t[0] - c))
        if len(reach) == 2 and abs(reach[0][0] - c) - abs(reach[1][0] - c) >= 3:
            return reach[0]          # one arm clearly stretched out (punch1 = the aim pose): the bow goes in that hand
        if abs(gx - c) < 2:
            return rt[0]
        return max(rt, key=lambda t: (t[0] - c) * np.sign(gx - c))

    tip_cache = {}

    def art_handle(wid):
        """the handle (pivot) of a 2x art weapon: GRIP, a staff held HOLD_LOWER rows further down its shaft"""
        return [GRIP[0], GRIP[1] + HOLD_LOWER.get(wid.replace("_fine", ""), 0)]

    def weapon_tip(wtype, w, i):
        """offset (2x px) from the grip to the far end of the weapon type's own 2x art (its column sebF, flipped by inv, turned by
        deg like src/paperdoll.js draws it); None without art"""
        if not wtype or not w or not at(w.get("show") or [1], i):
            return None
        p_ = F.SRC_DIR / "x2" / f"weapon_{wtype}.png"
        if wtype not in tip_cache:
            tip_cache[wtype] = rgba(p_) if p_.exists() else None
        sheet = tip_cache[wtype]
        if sheet is None:
            return None
        col = int(at(w.get("sebF") or [0], i) or 0)
        a = sheet[:, col * WC:(col + 1) * WC, 3] > 0
        ys_, xs_ = np.nonzero(a)
        if not len(ys_):
            return None
        gx_, gy_ = art_handle(wtype)
        d2 = (xs_ - gx_) ** 2 + (ys_ - gy_) ** 2
        j = int(np.argmax(d2))
        dx, dy = xs_[j] - gx_, ys_[j] - gy_
        if at(w.get("inv") or [0], i) == 1:
            dx = -dx
        r = math.radians(at(w.get("deg") or [0], i) or 0)
        return [int(round(dx * math.cos(r) - dy * math.sin(r))), int(round(dx * math.sin(r) + dy * math.cos(r)))]

    def dv2_box(r, sx):
        bb = r.get("body_bbox") or [-6, -12, 5, -4]
        xs = sorted([S * bb[0] * sx, S * (bb[2] + 1) * sx])
        return (xs[0], S * bb[1] + GROUND, xs[1], S * (bb[3] + 1) + GROUND)

    hand_cells = {cls: [np.zeros((BC, BC, 4), np.uint8)] for cls in classes}
    hand_index = {cls: {} for cls in classes}
    sig_ids, done = {}, set()

    def body_seb(sig, view, m, slots):
        if sig not in sig_ids:
            sig_ids[sig] = f"b{sum(1 for k in sig_ids if k[0] == 'b')}"
        bid = sig_ids[sig]
        for cls in classes:
            if (cls, sig) in done:
                continue
            done.add((cls, sig))
            frames = {}
            for i, L in enumerate(layout(cls, view, m, slots)):
                if L is None:
                    continue
                u, v, bo, _, _ = L
                frames[str(i)] = [u, v, BC, BC, -BC // 2 + int(bo[0]), -BC + int(bo[1]), m, 0]
            sebs[f"body2x/{cls}/{bid}"] = {"max": len(slots), "frames": frames}
        return f"body2x/{{v}}/{bid}"

    def hands_at(cls, L, m, wq):
        """(weapon fist, off fist) centres, foot-relative: the weapon fist at wq (class-aware grip) or on the weapon arm's tip,
        the other on the other arm's tip (or the weapon arm's, when the weapon fist took the off arm: bow in the stretched arm)"""
        _, _, bo, part, sv = L
        wt, ot = canons[cls][(sv, part)]["tips"]

        def rel(t):
            if t is None:
                return None
            cx = (BC - t[0]) if m else t[0]
            return [cx - BC / 2 + bo[0], t[1] - BC + bo[1]]
        wf = list(wq) if wq is not None else rel(wt)
        oq = rel(ot)
        if oq is not None and wq is not None and wt is not None and np.hypot(oq[0] - wq[0], oq[1] - wq[1]) < 4:
            oq = rel(wt)
        return wf, oq

    def hand_seb(sig, view, m, slots, cfist):
        """cfist[cls][i] = the weapon fist's centre for that slot (class-aware, hand_target) or None = on the weapon arm's tip"""
        if sig not in sig_ids:
            sig_ids[sig] = f"h{sum(1 for k in sig_ids if k[0] == 'h')}"
        hid = sig_ids[sig]
        for cls in classes:
            if (cls, sig) in done:
                continue
            done.add((cls, sig))
            frames = {}
            fist = fists[cls]
            for i, L in enumerate(layout(cls, view, m, slots)):
                wq = cfist[cls][i]
                fl = []
                if L is not None and L[3] != "lying" and fist:
                    fl = [q for q in hands_at(cls, L, m, wq) if q is not None]
                k = (view, m, tuple(tuple(round(c) for c in q) for q in fl if q))
                if k not in hand_index[cls]:
                    cellimg = np.zeros((BC, BC, 4), np.uint8)
                    if fist:
                        fimg = fist[view][:, ::-1] if m else fist[view]
                        fa = fimg[..., 3] > 0
                        fys, fxs = np.nonzero(fa)
                        if len(fxs):
                            fcx, fcy = (fxs.min() + fxs.max() + 1) / 2, (fys.min() + fys.max() + 1) / 2
                            for q in fl:
                                if not q:
                                    continue
                                ox, oy = int(round(BC / 2 + q[0] - fcx)), int(round(BC + q[1] - fcy))
                                for yy, xx in zip(fys, fxs):
                                    ty, tx = oy + yy, ox + xx
                                    if 0 <= ty < BC and 0 <= tx < BC:
                                        cellimg[ty, tx] = fimg[yy, xx]
                    hand_index[cls][k] = len(hand_cells[cls])
                    hand_cells[cls].append(cellimg)
                hi = hand_index[cls][k]
                frames[str(i)] = [(hi % 10) * BC, (hi // 10) * BC, BC, BC, -BC // 2, -BC, 0, 0]
            sebs[f"hand2x/{cls}/{hid}"] = {"max": len(slots), "frames": frames}
        return f"hand2x/{{v}}/{hid}"

    # ---- action rows: "<key>@2x" for every 1x key (base keys first so the per-type duplicates can be dropped)
    keys = [k for k in data["actions"] if not k.endswith("@2x")]
    keys.sort(key=lambda k: ("." in k, k))
    new_acts, dropped = {}, 0
    for key in keys:
        act1 = data["actions"][key]
        spec = acts["actions"].get(key)
        dset = (act1.get("dv2") or {}).get("set")
        if dset is None or spec is None:
            continue
        act = copy.deepcopy(act1)
        act["rig"] = S          # 2x rows: only a 2x-rig class plays them (src/paperdoll.js resolveAction with look.rig = 2)
        if act.get("hop"):
            act["hop"] = act["hop"] * S
        ok = True
        for d, dname in enumerate(F.DIRS):
            row = act["rows"][d]
            view, m = VIEW_OF[d], F.DIR_MIRROR[d]
            sl = spec["views"][view]
            ds = (spec.get("dirs") or {}).get(dname, {}).get("slots") or [{} for _ in sl]
            mirrored = d == 3 and any(x.get("mirrorOf") == "right" for x in ds)
            rslots = dv2.get((dset, 1 if mirrored else DV2_DIR[d]))
            if not rslots:
                ok = False
                break
            sx = -1 if mirrored else 1
            n = len(act["af"])

            def at(lst, i):
                return lst[min(i, len(lst) - 1)]
            head_off, hat_off, w_off, fx_off, slots, shown_l, grip_pt, dbox = [], [], [], [], [], [], [], []
            parts = row["parts"]
            w = parts.get("weapon", {})
            ktype = (key.split(".")[1:2] or [None])[0]
            if key.split(".")[0] == "shoot" and ktype not in (None, "gun") and "weapon" in parts:
                # DV2 銃 (set 25) is a gun pose: only the gun is held out like that. Other weapon types play it empty-handed (no
                # weapon, no muzzle flash) instead of a bow / sword lying flat in front of the hero (2026-11-15 audit)
                w["show"] = [0] * n
                if "effect" in parts:
                    parts["effect"]["act"] = [0] * n
            for i in range(n):
                r = at(rslots, i)
                s = at(sl, i)
                hx, hy = (r.get("head") or [0, -8])
                hrel = [S * hx * sx, S * hy + GROUND]
                head_off.append(hrel)
                tx_, ty_ = (r.get("hat") or r.get("head") or [0, -8])
                hat_off.append([S * tx_ * sx, S * ty_ + GROUND])
                wo = r.get("woff") or [0, 0]
                grip = [S * wo[0] * sx, S * wo[1] + GROUND]
                w_off.append(grip)
                grip_pt.append((grip[0] + 0.5, grip[1] + 0.5))     # the handle pixel's centre
                dbox.append(dv2_box(r, sx))
                x = at(ds, i) if ds else {}
                fo = x.get("fxOff")
                fx_off.append([S * fo[0], S * fo[1] + GROUND] if fo else None)
                pose = s.get("pose") or s["cell"]
                shown = at(w.get("show") or [1], i) if s["cell"] != "lying" else 0
                slots.append((pose, tuple(hrel)))
                shown_l.append(int(shown))
            # class-aware grip (2026-11-15 audit): DV2's grip x 2 was measured on DV2's ~28 px wide 2x body, ours are ~13 px, so the
            # weapon fist and the weapon hung beside the arm. Per class and slot the weapon fist goes to hand_target (DV2's hand point
            # mapped onto this class's own pose part); the weapon's handle follows the fist (parts.weapon.offBy[class]); DV2's angle /
            # flip / column / visibility, draw order and timing are untouched. A bow is held at its middle (BOW_LIFT above the handle).
            cfist, cgrip, cdelta, chead = {}, {}, {}, {}
            for cls in classes:
                lay = layout(cls, view, m, slots)
                chead[cls] = [L[2][2] if L is not None else 0 for L in lay]
                cf, cg, cd = [], [], []
                for i in range(n):
                    L = lay[i]
                    if L is None or L[3] == "lying":
                        cf.append(None); cg.append(list(w_off[i])); cd.append((0.0, 0.0))
                        continue
                    pts = body_pts(cls, L, m)
                    if ktype == "bow":
                        # DV2's bow "handle" is not where DV2's hand is (BOW_LIFT note), so its y says nothing about our arm: the bow
                        # hand is this pose's arm tip on the side DV2 holds the bow (aim = punch1: the straight front arm)
                        q = np.array(side_tip(cls, L, m, grip_pt[i][0]))
                    else:
                        q = hand_target(pts, grip_pt[i], dbox[i])
                    if shown_l[i]:
                        cf.append((float(q[0]), float(q[1])))
                        g2 = [int(round(q[0] - 0.5)), int(round(q[1] - 0.5))]   # every 2x weapon's handle = where the fist holds it
                        cg.append(g2)
                        cd.append((g2[0] - w_off[i][0], g2[1] - w_off[i][1]))
                    else:
                        cf.append(None); cg.append(list(w_off[i]))
                        cd.append(None)            # no weapon: an effect is mapped onto the body like a hand (below)
                cfist[cls], cgrip[cls], cdelta[cls] = cf, cg, cd
            bsig = ("b", view, m, tuple(slots))
            hsig = ("h", view, m, tuple(slots), tuple((c, tuple(tuple(round(v, 1) for v in q) if q else None for q in cfist[c])) for c in classes))
            parts["body"] = {"seb": body_seb(bsig, view, m, slots), "off": [[0, 0]]}
            parts.pop("cape", None)          # 1x art; a 2x class wears no cape / armour (src/paperdoll.js lookFromHunter)
            parts["hand"] = {"seb": hand_seb(hsig, view, m, slots, cfist), "off": [[0, 0]]}
            expr = parts.get("head", {}).get("seb", "head/normal").split("/", 1)[1]
            parts["head"] = {"seb": f"head2x/{expr if expr in EXPR2X else 'normal'}", "off": head_off}
            parts["helmet"] = {"seb": "hat2x/std", "off": hat_off}
            # a class whose pose part is too tall to hang from DV2's neck: its head (and hat) lifted, the feet stay on the ground (layout)
            for nm, base_off in (("head", head_off), ("helmet", hat_off)):
                ob = {c: [[o[0], o[1] + chead[c][i]] for i, o in enumerate(base_off)] for c in classes if any(chead[c])}
                if ob:
                    parts[nm]["offBy"] = ob
            w1x = list((parts.get("weapon") or {}).get("off") or [[0, 0]])   # the 1x grip, before it is replaced
            if "weapon" in parts:
                parts["weapon"]["off"] = w_off       # DV2's grip x 2, kept as data (kit parity); drawn at offBy[class]
                parts["weapon"].pop("carry", None)
                ob = {c: cgrip[c] for c in classes if cgrip[c] != w_off}
                if ob:
                    parts["weapon"]["offBy"] = ob
            if "shield" in parts:
                # DV2 has no shield: the 1x off-hand numbers measured on the paladin (the shield bearer, "<base>.sword") x 2, the same for
                # every type so the per-type rows stay identical to the base row (and are dropped as duplicates)
                sw = data["actions"].get(key.split(".")[0] + ".sword")
                so = (sw["rows"][d]["parts"].get("shield") or {}).get("off") if sw and len(sw["af"]) == n else None
                parts["shield"]["off"] = [[S * o[0], S * o[1] + GROUND] for o in (so or parts["shield"].get("off") or [[0, 0]])]
                # 2026-11-15 audit: those 1x numbers x2 missed the 2x arms (front view: shield on the sword side; side view: the edge-on
                # shield hung below the feet like a black pole). Per class the shield's centre (its handle) sits on the off-hand fist.
                ob = {}
                for c in classes:
                    lay = layout(c, view, m, slots)
                    so2 = []
                    for i in range(n):
                        L = lay[i]
                        oq = hands_at(c, L, m, cfist[c][i])[1] if L is not None and L[3] != "lying" else None
                        so2.append([int(round(oq[0] - 0.5)), min(int(round(oq[1] - 0.5)), -SHIELD_HALF - 2)] if oq is not None else at(parts["shield"]["off"], i))
                    if so2 != parts["shield"]["off"]:
                        ob[c] = so2
                if ob:
                    parts["shield"]["offBy"] = ob
            if "effect" in parts:
                e = parts["effect"]
                # DV2 effects: DV2's offset x 2. Our own effects (staff burst, bow arrow: no DV2 fxOff) keep their 1x position RELATIVE TO
                # THE GRIP, x 2, on the 2x grip -- the 1x grip is measured on our 1x art, the 2x one is DV2's (else the burst floats off the staff)
                e1 = [at(e["off"], i) for i in range(n)]

                def eff(grips, delta, cls=None):
                    out = []
                    for i in range(n):
                        tip = weapon_tip(ktype, w, i) if at(e["type"], i).split("@")[0] in FX_AT_TIP else None
                        if not fx_off[i] and tip is not None:
                            # our staff burst on the staff's head: the 2x art's top pixel, turned like the weapon (sebF/inv/deg)
                            out.append([grips[i][0] + tip[0], grips[i][1] + tip[1]])
                        elif not fx_off[i]:
                            out.append([grips[i][0] + S * (e1[i][0] - at(w1x, i)[0]), grips[i][1] + S * (e1[i][1] - at(w1x, i)[1])])
                        elif delta is None:
                            out.append(fx_off[i])
                        elif delta[i] is not None:     # DV2's effect moves with the weapon (the same delta as the grip)
                            out.append([fx_off[i][0] + delta[i][0], fx_off[i][1] + delta[i][1]])
                        else:
                            # weapon hidden (punch): DV2's fxOff is at ground level beside DV2's wide body; ours goes on the
                            # punching fist = the weapon arm's tip of this class's pose part, pushed FX_FIST_PUSH outward
                            L = layout(cls, view, m, slots)[i]
                            tip = None if L is None or L[3] == "lying" else canons[cls][(L[4], L[3])]["tips"][0]
                            if tip is None:
                                out.append(fx_off[i])
                            else:
                                bo = L[2]
                                cx = (BC - tip[0]) if m else tip[0]
                                q = [cx - BC / 2 + bo[0], tip[1] - BC + bo[1]]
                                q[0] += FX_FIST_PUSH if q[0] >= 0 else -FX_FIST_PUSH
                                out.append([int(round(q[0])), int(round(q[1]))])
                    return out
                e["off"] = eff(w_off, None)
                ob = {c: eff(cgrip[c], cdelta[c], c) for c in classes}
                ob = {c: v for c, v in ob.items() if v != e["off"]}
                if ob:
                    e["offBy"] = ob
                e["type"] = [t if t.endswith("@2x") else t + "@2x" for t in e["type"]]
            # the lying cell: DV2 draws the (upright) head on the ground next to the body
            if any(at(sl, i)["cell"] == "lying" for i in range(n)):
                o = row["order"]

                def with_head(lst):
                    lst = list(lst)
                    if "head" not in lst:
                        lst.insert(lst.index("body") + 1 if "body" in lst else 0, "head")
                    return lst
                row["order"] = [with_head(x) for x in o] if o and isinstance(o[0], list) else with_head(o)
        if not ok:
            continue
        base = key.split(".")[0]
        if "." in key and base + "@2x" in new_acts and json.dumps(new_acts[base + "@2x"], sort_keys=True) == json.dumps(act, sort_keys=True):
            dropped += 1            # identical to the base 2x row: resolveAction's fallback gives the same picture
            continue
        new_acts[key + "@2x"] = act
    data["actions"].update(new_acts)

    # ---- 2x weapons: the art agent's src/x2/weapon_<id>.png, else the 1x sheet x2 (every weapon, incl. the shield)
    wsrc = files.get("atlas_weapon.png")
    warr = np.asarray(wsrc.convert("RGBA")) if wsrc is not None else None
    weapon_sheets, wmeta = {}, {}
    for wid, wd in list(data["weapons"].items()):
        if wid.endswith("@2x") or wd.get("hidden") or not wd.get("skin"):
            continue
        layer = "shield" if wd.get("type") == "shield" else "weapon"
        p = F.SRC_DIR / "x2" / f"weapon_{wid}.png"
        if p.exists() and Image.open(p).size == (WC * F.WEAPON_COLS, WC):
            weapon_sheets[wid] = rgba(p)
            # art bows (fix_weapons2x.py) have the bow's middle on GRIP, in DV2's bow columns (rest / drawn / released)
            wmeta[wid] = (layer, art_handle(wid), "art")
        elif warr is not None and wd["skin"] in skins.get(layer, {}):
            sk = skins[layer][wd["skin"]]
            cut = warr[sk["y"]:sk["y"] + F.WEAPON_CELL, sk.get("x", 0):sk.get("x", 0) + F.WEAPON_CELL * F.WEAPON_COLS]
            weapon_sheets[wid] = x2(cut)
            handle = [wd["handle"][0] * S, wd["handle"][1] * S]
            if wd.get("type") == "bow":    # DV2's bow handle sits BOW_LIFT/2 below the bow's middle: 2x bows are held at the middle
                ys_ = np.nonzero((weapon_sheets[wid][:, :WC, 3] > 0).any(1))[0]
                if len(ys_):
                    handle[1] = int(ys_.min() + ys_.max() + 1) // 4 * 2
            wmeta[wid] = (layer, handle, "x2")
    if weapon_sheets:
        im, ys = stack(weapon_sheets)
        files["atlas_weapon_x2.png"] = im
        images["weapon2x"] = "atlas_weapon_x2.png"
        sebs["weapon2x/std"] = {"max": F.WEAPON_COLS * 2, "frames": {str(f): [(f // 2) * WC, 0, WC, WC, 0, 0, f & 1, 0] for f in range(F.WEAPON_COLS * 2)}}
        for wid, y in ys.items():
            layer, handle, how = wmeta[wid]
            skins.setdefault(layer, {})[wid + "@2x"] = {"img": "weapon2x", "x": 0, "y": y}
            data["weapons"][wid + "@2x"] = {"skin": wid + "@2x", "handle": handle, "type": data["weapons"][wid]["type"], "seb": "weapon2x/std",
                                           **({"upscaled": True} if how == "x2" else {})}

    # ---- 2x helmets: 1x hats x2 (generic) + art hats placed on each class's head (per class)
    hat_sheets = {}
    hsrc = files.get("atlas_hat.png")
    if hsrc is not None:
        harr = np.asarray(hsrc.convert("RGBA"))
        for n, sk in list(skins.get("helmet", {}).items()):
            if "@2x" in n:
                continue
            hat_sheets[n + "@2x"] = x2(harr[sk["y"]:sk["y"] + F.HAT_CELL * 3, sk.get("x", 0):sk.get("x", 0) + F.HAT_CELL])
    art_hats = sorted({p.stem[len("hat_"):].rsplit("_", 1)[0] for p in (F.SRC_DIR / "x2").glob("hat_*_*.png")})
    for name in art_hats:
        views = {v: F.SRC_DIR / "x2" / f"hat_{name}_{v}.png" for v in ("back", "side", "front")}
        if not any(p.exists() for p in views.values()):
            continue
        for cls in classes:
            hs = head_sheets[cls]
            sec = np.zeros((HC * 3, HC, 4), np.uint8)
            for ri, view in enumerate(["back", "side", "front"]):
                p = views[view] if views[view].exists() else (views["side"] if views["side"].exists() else views["front"])
                if not p.exists():
                    continue
                hd = hs[ri * HC:(ri + 1) * HC, 0:HC, 3] > 0
                if not hd.any():
                    continue
                top = int(np.nonzero(hd.any(1))[0].min())
                xs_ = np.nonzero(hd.any(0))[0]
                sec[ri * HC:(ri + 1) * HC] = place(art(p), HC, (xs_.min() + xs_.max() + 1) / 2, min(HC - 1, top + HAT_SINK))
            hat_sheets[f"{name}@2x.{cls}"] = sec
    if hat_sheets:
        im, ys = stack(hat_sheets)
        files["atlas_hat_x2.png"] = im
        images["hat2x"] = "atlas_hat_x2.png"
        for n, y in ys.items():
            skins.setdefault("helmet", {})[n] = {"img": "hat2x", "x": 0, "y": y}
    sebs["hat2x/std"] = {"max": ND, "frames": {
        str(d): [0, [0, 1, 2, 1][d] * HC, HC, HC, -HC // 2, -HC, F.DIR_MIRROR[d], 0] for d in range(ND)}}

    # ---- atlases + skins
    im, ys = stack(body_sheets)
    files["atlas_body_x2.png"] = im
    images["body2x"] = "atlas_body_x2.png"
    for cls, y in ys.items():
        skins["body"][cls] = {"img": "body2x", "x": 0, "y": y}
    im, ys = stack(head_sheets)
    files["atlas_head_x2.png"] = im
    images["head2x"] = "atlas_head_x2.png"
    for n, y in ys.items():
        skins["head"][n] = {"img": "head2x", "x": 0, "y": y}
    hand_imgs = {}
    for cls, cells in hand_cells.items():
        rows_ = (len(cells) + 9) // 10
        a = np.zeros((rows_ * BC, 10 * BC, 4), np.uint8)
        for i, c in enumerate(cells):
            a[(i // 10) * BC:(i // 10 + 1) * BC, (i % 10) * BC:(i % 10 + 1) * BC] = c
        hand_imgs[cls] = a
    im, ys = stack(hand_imgs)
    files["atlas_hand_x2.png"] = im
    images["hand2x"] = "atlas_hand_x2.png"
    for cls, y in ys.items():
        skins["hand"][cls] = {"img": "hand2x", "x": 0, "y": y}
    # head sebs: frame = direction (back, face, front, face mirrored)
    for ci, expr in enumerate(EXPR2X):
        sebs[f"head2x/{expr}"] = {"max": ND, "frames": {
            str(d): [ci * HC, [0, 1, 2, 1][d] * HC, HC, HC, -HC // 2, -HC, F.DIR_MIRROR[d], 0] for d in range(ND)}}
    # ---- standing height from the 2x front stand (anchor -> top of the head)
    for cls in classes:
        idle = data["actions"].get(f"idle.{CLASS_TYPES[cls]}@2x") or data["actions"].get("idle@2x")
        if not idle:
            continue
        hy = idle["rows"][2]["parts"]["head"]["off"][0][1]
        hs = head_sheets[cls][2 * HC:3 * HC, 0:HC]
        top = int(np.nonzero((hs[..., 3] > 0).any(1))[0].min())
        data["meta"]["heroHeights"][cls] = int(-(hy - HC + top))
        report[cls] = {"hand_cells": len(hand_cells[cls]), "female_head": (cls + ".f") in head_sheets}
    data["meta"]["rig2x"] = {cls: S for cls in classes}
    report["_rows"] = {"2x actions": len(new_acts), "dropped duplicates": dropped, "body/hand sebs per class": len(sig_ids),
                       "weapons@2x": len(weapon_sheets), "hats@2x": len(hat_sheets)}
    return report
