"""dv2fmt.py — the DV2-format sheet layout for mistvale's ORIGINAL hero art (single source of truth).

Spec (human-readable, for artists / the art agent): sprites/DV2_FORMAT_SPEC.md.
This module is imported by make_templates.py, import_sheet.py and build_pack.py; change a layout here and in the spec together.

We copy the FORMAT of the DV2 paperdoll kit (layer split, cell sizes, anchors, frame = slot / direction,
weapon grip pivot), never its art or data. All numbers below are mistvale's own.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = ROOT / "assets" / "paperdoll-dv2" / "src"
PACK_DIR = ROOT / "assets" / "paperdoll-dv2"
OUT_DIR = ROOT / "output" / "dv2fmt"
TEMPLATE_DIR = OUT_DIR / "templates"
ACTIONS_JSON = Path(__file__).resolve().parent / "actions.json"
PALETTES_JSON = Path(__file__).resolve().parent / "palettes.json"

UPSCALE = 8  # templates and AI inputs are 8x the 1x sheet

# ------------------------------------------------------------------ sheet geometry (1x pixels)
CELL = 30                      # BODY / HAND / ARMOR cell
BODY_COLS, BODY_ROWS = 10, 10  # 300x300 virtual sheet
FOOT = (15, 30)                # foot anchor inside a body cell (bottom centre) -> seb trans (-15, -30)

HEAD_CELL = 20
HEAD_COLS, HEAD_ROWS = 7, 3    # 140x60 (row 2 = front face, 2026-11-14; 140x40 sheets are padded with their face row by build_pack)
HEAD_ANCHOR = (10, 20)         # neck point = bottom centre of a head cell -> trans (-10, -20)

HAT_CELL = 20
HAT_COLS, HAT_ROWS = 1, 3      # 20x60
WEAPON_CELL = 40
WEAPON_COLS = 4                # column = sebF, one per baked tilt angle (0 deg, +22, +36, -20 like DV2's weapon sheet);
                               # exceptions keep their own layout in cells 1..: bow draws cell 1 = drawn bow, shield cell 1 = edge-on
FX_CELL = 30
FX_COLS, FX_ROWS = 4, 2        # column = direction (up, right, down, left), row = sebF (0 = bright, 1 = fading)

# ------------------------------------------------------------------ body grid: which cell is which pose
VIEWS = ["back", "side", "front"]          # side = facing screen-right; left is the mirror
VIEW_BAND = {"back": 0, "side": 2, "front": 4}  # first grid row of each view's 2-row band
POSE_CELLS = {                              # (col, row-in-band)
    "walk0": (0, 0), "walk1": (1, 0), "walk2": (2, 0), "walk3": (3, 0),
    "stand0": (4, 0), "stand1": (5, 0),
    "windup": (6, 0), "strike0": (7, 0), "strike1": (8, 0), "hurt": (9, 0),
    "cast0": (0, 1), "cast1": (1, 1), "aim0": (2, 1), "aim1": (3, 1),
    "kneel": (4, 1), "victory0": (5, 1), "victory1": (6, 1), "thrust": (7, 1),
}
LYING = (0, 6)                 # one shared cell (side view, mirrored for left-facing directions)
RESERVED = "row 1/3/5 cols 8-9, row 6 cols 1-9, rows 7-9: reserved (unused since the game went 4-directional); keep transparent"


def body_cell_xy(view: str, pose: str) -> tuple[int, int]:
    """top-left pixel of a pose cell in a BODY/HAND/ARMOR sheet"""
    if pose == "lying":
        c, r = LYING
    else:
        c, r = POSE_CELLS[pose]
        r += VIEW_BAND[view]
    return c * CELL, r * CELL


def all_body_cells():
    """[(view, pose, x, y)] for every used cell"""
    out = [(v, p, *body_cell_xy(v, p)) for v in VIEWS for p in POSE_CELLS]
    out.append(("side", "lying", *body_cell_xy("side", "lying")))
    return out


# head sheet: column = expression, row 0 = back of head, row 1 = face (3/4 front, looking toward screen-right)
EXPRESSIONS = ["normal", "blink", "hurt", "shout", "happy", "ko", "spare"]
HEAD_ROW = {"back": 0, "face": 1, "front": 2}   # face = side/3-4 view looking screen-right; front = facing the viewer (down)
# hat sheet rows
HAT_ROW = {"back": 0, "side": 1, "front": 2}

# ------------------------------------------------------------------ 4 directions -> view + mirror (explicit, no engine fallback)
# 2026-11-13: the game is 4-directional (docs/DV2-ADOPTION-PLAN.md Phase 2), 1:1 with DV2. The old diagonals are gone.
DIRS = ["up", "right", "down", "left"]
DIR_VIEW = ["back", "side", "front", "side"]
DIR_MIRROR = [0, 0, 0, 1]
DIR_HEAD_ROW = ["back", "face", "front", "face"]
DIR_HAT_ROW = ["back", "side", "front", "side"]

# ------------------------------------------------------------------ weapons (one 80x40 sheet per weapon, 2 cells of 40)
# grip = pixel the hand holds = rotation pivot. x MUST be 20 (cell centre) so the mirrored frame keeps the grip in place.
WEAPON_TYPES = {
    "sword":     {"grip": (20, 28), "type": "sword"},
    "axe":       {"grip": (20, 28), "type": "axe"},
    "dagger":    {"grip": (20, 28), "type": "dagger"},
    "staff":     {"grip": (20, 28), "type": "staff"},
    "holystaff": {"grip": (20, 28), "type": "holystaff"},   # = src/paperdoll.js CLASS_KIT.priest.type (its own *.holystaff action tables)
    "bow":       {"grip": (20, 33), "type": "bow"},         # DV2 handleOffset = [20,33]: the grip sits low in the cell
    "shield":    {"grip": (20, 20), "type": "shield"},
    # Phase 4 variants: same grip + action-table type as their base weapon (assets/paperdoll-dv2/src/weapon_<name>[_fine].png)
    "sword_long":    {"grip": (20, 28), "type": "sword"},
    "axe_double":    {"grip": (20, 28), "type": "axe"},
    "staff_crystal": {"grip": (20, 28), "type": "staff"},
    # Phase 6 (docs/DV2-PHASE6.md G2): DV2 weapon types RAPIR / SPEAR / GUN. Their art is drawn at 2x only (src/x2/weapon_<name>.png,
    # grip (40,58)); build_pack.py derives the 1x sheet from it (grip (20,29)) for the 1x classes. PUNCH = "fist": no art, hidden.
    "rapier":    {"grip": (20, 29), "type": "rapier"},
    "spear":     {"grip": (20, 29), "type": "spear"},
    "gun":       {"grip": (20, 29), "type": "gun"},
}
# new weapon types without art fall back to an existing sheet (same grip family) so a hunter given one never draws nothing
NEW_WEAPON_FALLBACK_ART = {"rapier": "sword", "spear": "staff"}      # gun without art: hidden (no sensible stand-in)
# action tables of a new type = an existing type's (the per-type grips/necks were measured on that class's art); resolveAction tries
# <action>.<type>, then <action>.<alias>, then <action>. fist / gun use the base (type-less) tables.
TYPE_ALIAS = {"rapier": "sword", "spear": "sword"}
FINE = ("sword", "axe", "dagger", "staff", "holystaff", "bow")   # also ship <type>_fine (gold/upgraded recolour)
ARMORS = ("leather", "plate", "mantle")
CAPES = ("cloak",)               # back layer: drawn before BODY on the same 30px grid, may hang past the body ±4 px
EFFECTS = ("slash", "burst", "arrow")   # + hslash / thrust / punch / gunfire when their src/effect_<name>.png exists (build_pack.py picks up any)

# ------------------------------------------------------------------ classes
CLASSES = ["archer", "sorcerer", "priest", "paladin", "berserker", "assassin", "darkknight", "warrior"]
OUTLINE = "#0e0c14"


def palettes() -> dict:
    """class -> list of hex colours (index 0 = outline). Built from assets/heroes/<cls>.json once, then authored here."""
    return json.loads(PALETTES_JSON.read_text(encoding="utf-8"))


def sheet_size(kind: str) -> tuple[int, int]:
    return {
        "body": (CELL * BODY_COLS, CELL * BODY_ROWS),
        "hand": (CELL * BODY_COLS, CELL * BODY_ROWS),
        "armor": (CELL * BODY_COLS, CELL * BODY_ROWS),
        "cape": (CELL * BODY_COLS, CELL * BODY_ROWS),
        "head": (HEAD_CELL * HEAD_COLS, HEAD_CELL * HEAD_ROWS),
        "hat": (HAT_CELL * HAT_COLS, HAT_CELL * HAT_ROWS),
        "weapon": (WEAPON_CELL * WEAPON_COLS, WEAPON_CELL),
        "effect": (FX_CELL * FX_COLS, FX_CELL * FX_ROWS),
    }[kind]


def cells_of(kind: str):
    """[(label, x, y, w, h, anchor_xy_or_None, bottom_edge_allowed)] for the edge-touch check and templates"""
    if kind in ("body", "hand", "armor", "cape"):
        return [(f"{v}:{p}", x, y, CELL, CELL, FOOT, True) for v, p, x, y in all_body_cells()]
    if kind == "head":
        return [(f"{r}:{e}", c * HEAD_CELL, ri * HEAD_CELL, HEAD_CELL, HEAD_CELL, HEAD_ANCHOR, True)
                for ri, r in enumerate(["back", "face", "front"]) for c, e in enumerate(EXPRESSIONS)]
    if kind == "hat":
        return [(r, 0, i * HAT_CELL, HAT_CELL, HAT_CELL, HEAD_ANCHOR, True) for i, r in enumerate(["back", "side", "front"])]
    if kind == "weapon":
        return [(f"sebF{c}", c * WEAPON_CELL, 0, WEAPON_CELL, WEAPON_CELL, None, False) for c in range(WEAPON_COLS)]
    if kind == "effect":
        return [(f"{DIRS[c]}:sebF{r}", c * FX_CELL, r * FX_CELL, FX_CELL, FX_CELL, (FX_CELL // 2, FX_CELL // 2), False)
                for r in range(FX_ROWS) for c in range(FX_COLS)]
    raise KeyError(kind)


def src_name(kind: str, name: str) -> str:
    """file name in assets/paperdoll-dv2/src/: <cls>_body.png, weapon_sword.png, armor_plate.png, effect_slash.png ..."""
    if kind in ("body", "hand", "head"):
        return f"{name}_{kind}.png"           # per class
    if kind == "hat":
        return f"hat_{name}.png"              # equipment item (e.g. hat_helm.png)
    return f"{kind}_{name}.png"
