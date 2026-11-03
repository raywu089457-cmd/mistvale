#!/usr/bin/env python3
"""Build-time monster dye recolor (T24).

One source sheet + a palette ramp -> one or more recoloured variant sheets.
The game does not load these yet; this is a pipeline/art script only.

Method
------
For each opaque pixel: RGB -> HSV.
  * alpha is never touched (identical alpha channel is asserted per file);
  * pixels darker than `rules.outlineLuma` (the near-black outline/shadow pass)
    are left alone, as are pixels below `rules.satMin` saturation
    (whites, greys - eye highlights, teeth, bone);
  * pixels whose hue falls inside a dye channel's hue range are remapped by
    luminance onto that channel's ramp (hex stops, dark -> light).

Luminance is normalised per channel over the matched pixels of the whole sheet,
so every frame keeps the same relationship to the ramp (frame 0 is not
brightened relative to frame 40).

Usage
-----
    python pipeline/scripts/recolor_monster.py assets/monsters3/boar.png \
        sprites/dye/monster-dyes.json elite

    python pipeline/scripts/recolor_monster.py --all          # every monster x variant + contact.png
    python pipeline/scripts/recolor_monster.py --histogram    # hue census used to pick hue ranges
"""

from __future__ import annotations

import argparse
import colorsys
import json
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SHEET_DIR = os.path.join(ROOT, "assets", "monsters3")
DYE_JSON = os.path.join(ROOT, "sprites", "dye", "monster-dyes.json")
OUT_DIR = os.path.join(ROOT, "output", "monster-dye")

DEFAULT_RULES = {
    "alphaMin": 8,
    "outlineLuma": 0.14,
    "satMin": 0.10,
    "lumaPad": 0.0,
}

LUMA_W = (0.299, 0.587, 0.114)


# --------------------------------------------------------------------------- #
# small colour helpers
# --------------------------------------------------------------------------- #

def hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        raise ValueError(f"bad hex colour: {value!r}")
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


def pixels(img: Image.Image) -> list:
    """Flat RGBA list; getdata() is deprecated in Pillow 12."""
    getter = getattr(img, "get_flattened_data", None)
    return list(getter() if getter else img.getdata())


def rgb_to_hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c)))) for c in rgb)


def luma(r: int, g: int, b: int) -> float:
    return (LUMA_W[0] * r + LUMA_W[1] * g + LUMA_W[2] * b) / 255.0


def ramp_table(stops: list[str]) -> list[tuple[float, tuple[int, int, int]]]:
    if not stops:
        raise ValueError("channel ramp is empty")
    rgbs = [hex_to_rgb(s) for s in stops]
    if len(rgbs) == 1:
        return [(0.0, rgbs[0]), (1.0, rgbs[0])]
    step = 1.0 / (len(rgbs) - 1)
    return [(i * step, c) for i, c in enumerate(rgbs)]


def sample_ramp(table, t: float) -> tuple[int, int, int]:
    if t <= table[0][0]:
        return table[0][1]
    if t >= table[-1][0]:
        return table[-1][1]
    for i in range(len(table) - 1):
        t0, c0 = table[i]
        t1, c1 = table[i + 1]
        if t0 <= t <= t1:
            f = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            return (
                c0[0] + (c1[0] - c0[0]) * f,
                c0[1] + (c1[1] - c0[1]) * f,
                c0[2] + (c1[2] - c0[2]) * f,
            )
    return table[-1][1]


def hue_in_range(hue_deg: float, lo: float, hi: float) -> bool:
    """Hue window in degrees; lo > hi means the window wraps through 0."""
    if lo <= hi:
        return lo <= hue_deg <= hi
    return hue_deg >= lo or hue_deg <= hi


# --------------------------------------------------------------------------- #
# core
# --------------------------------------------------------------------------- #

def channel_match(r, g, b, channel, rules) -> tuple[bool, float, float]:
    """Return (matched, hue_deg, luma) for one pixel against one channel."""
    lum = luma(r, g, b)
    if lum < channel.get("outlineLuma", rules["outlineLuma"]):
        return False, 0.0, lum
    hue, sat, val = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    hue_deg = hue * 360.0
    if sat < channel.get("satMin", rules["satMin"]):
        return False, hue_deg, lum
    lo, hi = channel["hue"]
    if not hue_in_range(hue_deg, lo, hi):
        return False, hue_deg, lum
    return True, hue_deg, lum


def recolor(sheet: Image.Image, channels: list[dict], rules: dict) -> tuple[Image.Image, list[dict]]:
    sheet = sheet.convert("RGBA")
    src = pixels(sheet)
    alpha_min = rules["alphaMin"]

    # pass 1: luminance window per channel, over the whole sheet
    windows = []
    for ch in channels:
        lo_v, hi_v, hits = 1.0, 0.0, 0
        for r, g, b, a in src:
            if a < alpha_min:
                continue
            matched, _hue, lum = channel_match(r, g, b, ch, rules)
            if matched:
                hits += 1
                lo_v = min(lo_v, lum)
                hi_v = max(hi_v, lum)
        windows.append({"lo": lo_v, "hi": hi_v, "hits": hits})

    # pass 2: rewrite RGB of matched pixels, alpha untouched
    out = []
    touched = [0] * len(channels)
    for r, g, b, a in src:
        if a < alpha_min:
            out.append((r, g, b, a))
            continue
        for idx, ch in enumerate(channels):
            matched, _hue, lum = channel_match(r, g, b, ch, rules)
            if not matched:
                continue
            win = windows[idx]
            span = win["hi"] - win["lo"]
            t = 0.5 if span <= 1e-6 else (lum - win["lo"]) / span
            if rules["lumaPad"]:
                pad = rules["lumaPad"]
                t = (t - pad) / max(1e-6, 1.0 - 2 * pad)
            nr, ng, nb = sample_ramp(ch["_table"], max(0.0, min(1.0, t)))
            r, g, b = int(round(nr)), int(round(ng)), int(round(nb))
            touched[idx] += 1
            break  # first matching channel wins; channels must not overlap on purpose
        out.append((r, g, b, a))

    img = Image.new("RGBA", sheet.size)
    img.putdata(out)
    stats = [
        {
            "name": ch["name"],
            "hits": windows[i]["hits"],
            "pixels": touched[i],
            "luma": [round(windows[i]["lo"], 3), round(windows[i]["hi"], 3)],
        }
        for i, ch in enumerate(channels)
    ]
    return img, stats


def alpha_identical(a: Image.Image, b: Image.Image) -> bool:
    return a.size == b.size and a.getchannel("A").tobytes() == b.getchannel("A").tobytes()


# --------------------------------------------------------------------------- #
# config / io
# --------------------------------------------------------------------------- #

def load_dye(path: str) -> dict:
    with open(path, encoding="utf-8") as fh:
        cfg = json.load(fh)
    rules = dict(DEFAULT_RULES)
    rules.update(cfg.get("rules", {}))
    return {"raw": cfg, "rules": rules, "monsters": cfg.get("monsters", {})}


def prepare_channels(variant_cfg: dict) -> list[dict]:
    channels = []
    for ch in variant_cfg.get("channels", []):
        c = dict(ch)
        c["_table"] = ramp_table(c["ramp"])
        channels.append(c)
    return channels


def build_variant(monster: str, variant: str, cfg: dict, sheet_path: str, json_path: str,
                  outdir: str) -> dict:
    vcfg = cfg["monsters"][monster]["variants"][variant]
    channels = prepare_channels(vcfg)
    sheet = Image.open(sheet_path).convert("RGBA")
    out, stats = recolor(sheet, channels, cfg["rules"])

    base = os.path.join(outdir, f"{monster}-{variant}")
    os.makedirs(outdir, exist_ok=True)
    out.save(base + ".png")

    with open(json_path, encoding="utf-8") as fh:
        meta = json.load(fh)
    meta["dye"] = {
        "variant": variant,
        "source": os.path.relpath(sheet_path, ROOT).replace("\\", "/"),
        "channels": [
            {"name": ch["name"], "hue": ch["hue"], "ramp": ch["ramp"]}
            for ch in channels
        ],
        "note": "build-time recolour by pipeline/scripts/recolor_monster.py; game does not load this yet",
    }
    with open(base + ".json", "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    ok = alpha_identical(sheet, out)
    tag = "OK  " if ok else "FAIL"
    detail = " ".join(f"{s['name']}={s['pixels']}px" for s in stats)
    print(f"{tag} {monster}-{variant}.png  size={out.size[0]}x{out.size[1]} "
          f"alpha={'identical' if ok else 'CHANGED'}  {detail}")
    return {
        "monster": monster,
        "variant": variant,
        "png": base + ".png",
        "json": base + ".json",
        "ok": ok,
        "stats": stats,
    }


# --------------------------------------------------------------------------- #
# contact sheet
# --------------------------------------------------------------------------- #

def frame0(sheet_path: str, json_path: str) -> Image.Image:
    with open(json_path, encoding="utf-8") as fh:
        meta = json.load(fh)
    acts = meta.get("actions") or {}
    if not acts:
        return Image.open(sheet_path).convert("RGBA")
    cell = int(next(iter(acts.values())).get("cell", 0)) or 0
    top = min(int(a.get("y", 0)) for a in acts.values())
    img = Image.open(sheet_path).convert("RGBA")
    if cell <= 0:
        return img
    return img.crop((0, top, min(cell, img.width), min(top + cell, img.height)))


def build_contact(monsters: list[str], variants: list[str], outdir: str,
                  sheet_dir: str = SHEET_DIR) -> str:
    tile = 112
    pad = 8
    label_w = 130
    head_h = 26
    cols = 1 + len(variants)

    rows = []
    for monster in monsters:
        png = os.path.join(sheet_dir, monster + ".png")
        js = os.path.join(sheet_dir, monster + ".json")
        if not os.path.exists(png):
            continue
        cells = [("original", png, js)]
        for variant in variants:
            vpng = os.path.join(outdir, f"{monster}-{variant}.png")
            if os.path.exists(vpng):
                cells.append((variant, vpng, js))
        rows.append((monster, cells))

    width = label_w + cols * (tile + pad) + pad
    height = head_h + len(rows) * (tile + pad) + pad
    sheet = Image.new("RGBA", (width, height), (16, 16, 20, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default(size=15)
        small = ImageFont.load_default(size=13)
    except Exception:  # Pillow < 10
        font = small = ImageFont.load_default()

    for i, variant in enumerate(["original"] + list(variants)):
        x = label_w + i * (tile + pad)
        draw.text((x + 2, 6), variant, fill=(190, 190, 205, 255), font=font)

    for ri, (monster, cells) in enumerate(rows):
        y = head_h + ri * (tile + pad)
        draw.text((pad, y + tile // 2 - 8), monster, fill=(214, 214, 226, 255), font=font)
        for ci, (label, path, js) in enumerate(cells):
            x = label_w + ci * (tile + pad)
            draw.rectangle([x, y, x + tile - 1, y + tile - 1], fill=(26, 26, 32, 255),
                           outline=(52, 52, 62, 255))
            crop = frame0(path, js)
            crop.thumbnail((tile - 4, tile - 4), Image.NEAREST)
            ox = x + (tile - crop.width) // 2
            oy = y + (tile - crop.height) // 2
            sheet.alpha_composite(crop, (ox, oy))
        draw.text((pad, y + tile // 2 + 8), f"cell {Image.open(cells[0][1]).width // 8}px",
                  fill=(120, 120, 134, 255), font=small)

    path = os.path.join(outdir, "contact.png")
    sheet.convert("RGB").save(path)
    print(f"OK   contact.png  {width}x{height}  rows={len(rows)} cols={cols}")
    return path


# --------------------------------------------------------------------------- #
# hue census (used to pick hue ranges; --histogram)
# --------------------------------------------------------------------------- #

def hue_census(sheet_path: str, buckets: int = 24) -> None:
    img = Image.open(sheet_path).convert("RGBA")
    hist = [0] * buckets
    total = dark = grey = 0
    for r, g, b, a in pixels(img):
        if a < 8:
            continue
        total += 1
        if luma(r, g, b) < DEFAULT_RULES["outlineLuma"]:
            dark += 1
            continue
        h, s, _v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        if s < DEFAULT_RULES["satMin"]:
            grey += 1
            continue
        hist[min(buckets - 1, int(h * buckets))] += 1
    span = 360 // buckets
    print(f"{os.path.basename(sheet_path)}: opaque={total} dark={dark} grey={grey}")
    for i, n in enumerate(hist):
        if not n:
            continue
        pct = 100.0 * n / max(1, total)
        if pct < 0.5:
            continue
        bar = "#" * max(1, int(pct / 2))
        print(f"  {i * span:3d}-{i * span + span:3d}  {pct:5.1f}%  {bar}")


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #

def monster_from_sheet(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Build-time monster dye recolor")
    p.add_argument("sheet", nargs="?", help="source sheet png (assets/monsters3/<monster>.png)")
    p.add_argument("dye", nargs="?", default=DYE_JSON, help="dye config json")
    p.add_argument("variant", nargs="?", help="variant name from the config (elite, frost, ...)")
    p.add_argument("--monster", help="monster key in the config (default: sheet file name)")
    p.add_argument("--outdir", default=OUT_DIR)
    p.add_argument("--all", action="store_true", help="every monster x variant, then contact.png")
    p.add_argument("--histogram", action="store_true", help="print hue census of the sheet(s)")
    args = p.parse_args(argv)

    cfg = load_dye(args.dye)
    monsters_cfg = cfg["monsters"]

    if args.histogram:
        targets = ([args.sheet] if args.sheet
                   else [os.path.join(SHEET_DIR, m + ".png") for m in monsters_cfg])
        for path in targets:
            hue_census(path)
        return 0

    if args.all:
        monsters = list(monsters_cfg)
        variants = sorted({v for m in monsters for v in monsters_cfg[m]["variants"]})
        results = []
        for monster in monsters:
            sheet = os.path.join(SHEET_DIR, monster + ".png")
            js = os.path.join(SHEET_DIR, monster + ".json")
            if not (os.path.exists(sheet) and os.path.exists(js)):
                print(f"SKIP {monster}: sheet or json missing")
                continue
            for variant in monsters_cfg[monster]["variants"]:
                results.append(build_variant(monster, variant, cfg, sheet, js, args.outdir))
        bad = [r for r in results if not r["ok"]]
        contact = build_contact([m for m in monsters if any(r["monster"] == m for r in results)],
                               variants, args.outdir)
        print(f"SUMMARY variants={len(results)} failed={len(bad)} contact={os.path.relpath(contact, ROOT)}")
        return 1 if bad else 0

    if not args.sheet or not args.variant:
        p.error("need <sheet.png> [dye.json] <variant>, or --all / --histogram")

    monster = args.monster or monster_from_sheet(args.sheet)
    if monster not in monsters_cfg:
        p.error(f"monster {monster!r} not in {args.dye}")
    if args.variant not in monsters_cfg[monster]["variants"]:
        p.error(f"variant {args.variant!r} not defined for {monster!r}")
    js = os.path.splitext(args.sheet)[0] + ".json"
    result = build_variant(monster, args.variant, cfg, args.sheet, js, args.outdir)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
