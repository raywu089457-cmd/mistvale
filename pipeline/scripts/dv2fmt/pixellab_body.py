"""pixellab_body.py <class> [--install]

PixelLab character frames -> DV2-format BODY + HAND sheets, plus the per-cell neck and fist anchors.
(docs/PAPERDOLL.md §22.3; 2026-11-14 user: the AI-generated bodies twisted from frame to frame -> "use PixelLab".)

Input  output/dv2fmt/work/<class>/pixellab/map.json  (which PixelLab animation frame becomes which pose cell, per view)
       output/dv2fmt/work/<class>/pixellab/<frames_dir>/<anim>--<group8>/<north|east|south>/fNN.png   (pl.py get dump;
       f00 of every animation is the character's standing rotation, so all frames of one direction share its ground point)
Output (preview, default)  output/dv2fmt/work/<class>/pixellab/out/: <class>_body.png, <class>_hand.png, neck.json, fists.json,
       body_off.json ({"view:pose": [0, k]}: cell content lifted k px to fit, body layer drawn k px lower; apply_actions_class.py),
       preview_x8.png (every cell: blue = neck, red = weapon fist, green = off fist, head-track score)
       --install additionally copies body/hand into assets/paperdoll-dv2/src/ and neck/fists into output/dv2fmt/work/<class>/,
       and writes the marker output/dv2fmt/work/<class>/GENERATED.json (measure_neck.py / measure_class.py skip marked classes; not named PIXELLAB: Windows paths ignore case and pixellab/ is the frames folder).

Per frame:
  * ground: the standing rotation's feet row and bbox centre map to the cell foot (15, 30) -> every frame of that direction uses the
    same offset, so lunges / recoils keep their real displacement.
  * head: PixelLab draws a head; the game draws its own head layer (expressions). The rotation's head (rows above the narrowest
    neck row) is template-matched in every frame (exact colour matches), erased from the body, and its bottom row becomes the
    neck: neck point = row below the body's top row, i.e. the head's last row covers the body's first row (same as stand0 today).
  * fists: arm tips = skin pixels farthest from the torso centre; weapon hand = character's right hand (front: screen-left,
    back: screen-right, side: the farthest tip). map.json "fist_overrides" {"view:pose": {"wh": [x, y], "oh": [x, y]}} wins.
"""
import json, shutil, sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dv2fmt as F  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
VIEW_DIR = {"back": "north", "side": "east", "front": "south"}
TABLE_STAND0_NECK = (0, -16)        # actions_base idle stand0 head; apply_actions_class.py adds neck.json deltas to it
CELL = F.CELL


def load(p):
    return np.asarray(Image.open(p).convert("RGBA")).copy()


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


class Frames:
    def __init__(self, root: Path, groups: dict):
        self.dirs = {}
        for anim, g in groups.items():
            hits = [p for p in root.iterdir() if p.is_dir() and p.name.endswith(g)]
            if len(hits) != 1:
                raise SystemExit(f"animation {anim} ({g}): {len(hits)} folders in {root}")
            self.dirs[anim] = hits[0]

    def get(self, anim, d, i):
        p = self.dirs[anim] / d / f"f{i:02d}.png"
        if not p.exists():
            raise SystemExit(f"missing frame {p}")
        return load(p)


def ground(img):
    a = img[..., 3] > 0
    ys, xs = np.nonzero(a)
    cx_edge = (xs.min() + xs.max() + 1) // 2          # bbox centre on pixel edges
    return cx_edge - CELL // 2, ys.max() - (CELL - 1)  # frame (x, y) that lands on cell (0, 0): feet on row 29


def head_template(img):
    a = img[..., 3] > 0
    ys = np.nonzero(a.any(1))[0]
    top = ys.min()
    w = a.sum(1)
    neck = min(range(top + 9, top + 18), key=lambda y: (w[y], y))     # narrowest row under the face = the neck
    mask = a.copy()
    mask[neck:] = False
    xs = np.nonzero(mask.any(0))[0]
    return {"mask": mask, "rgba": img, "neck": neck, "cx_edge": (xs.min() + xs.max() + 1) / 2}


def track(t, img, rng=(-10, 10, -8, 14)):
    ty, tx = np.nonzero(t["mask"])
    cols = t["rgba"][ty, tx]
    H, W = img.shape[:2]
    best = (-1, 0, 0)
    for dy in range(rng[2], rng[3] + 1):
        for dx in range(rng[0], rng[1] + 1):
            y, x = ty + dy, tx + dx
            ok = (y >= 0) & (y < H) & (x >= 0) & (x < W)
            f = img[y[ok], x[ok]]
            s = int(np.sum(np.all(f == cols[ok], axis=1) & (f[:, 3] > 0)))
            s2 = s - 0.01 * (abs(dx) + abs(dy))
            if s2 > best[0]:
                best = (s2, dx, dy)
    return best[1], best[2], best[0] / max(1, len(ty))


def shift(m, dx, dy):
    out = np.zeros_like(m)
    H, W = m.shape
    ys, xs = np.nonzero(m)
    ys, xs = ys + dy, xs + dx
    ok = (ys >= 0) & (ys < H) & (xs >= 0) & (xs < W)
    out[ys[ok], xs[ok]] = True
    return out


def cut(img, ox, oy):
    """frame -> 30x30 cell (frame pixel (ox, oy) = cell (0, 0)); returns cell and the number of opaque pixels clipped away"""
    H, W = img.shape[:2]
    cell = np.zeros((CELL, CELL, 4), np.uint8)
    y0, x0 = max(0, oy), max(0, ox)
    y1, x1 = min(H, oy + CELL), min(W, ox + CELL)
    cell[y0 - oy:y1 - oy, x0 - ox:x1 - ox] = img[y0:y1, x0:x1]
    clipped = int((img[..., 3] > 0).sum() - (cell[..., 3] > 0).sum())
    return cell, clipped


def fists(cell, view, neck_y, skin):
    a = cell[..., 3] > 0
    sk = np.zeros(a.shape, bool)
    for c in skin:
        sk |= a & (cell[..., 0] == c[0]) & (cell[..., 1] == c[1]) & (cell[..., 2] == c[2])
    rows = slice(max(0, neck_y), min(CELL, neck_y + 9))
    ty, tx = np.nonzero(a[rows])
    if not len(tx):
        return None, None
    cx, cy = tx.mean(), ty.mean() + rows.start
    ys, xs = np.nonzero(sk)
    if not len(xs):
        return None, None
    d = (xs - cx) ** 2 + (ys - cy) ** 2

    def tip(sel):
        if not sel.any():
            return None
        i = np.argmax(np.where(sel, d, -1))
        near = sel & ((xs - xs[i]) ** 2 + (ys - ys[i]) ** 2 <= 2.5)
        return [round(float(xs[near].mean()), 1), round(float(ys[near].mean()), 1)]

    if view == "front":
        wh, oh = tip(xs < cx), tip(xs > cx)
    elif view == "back":
        wh, oh = tip(xs > cx), tip(xs < cx)
    else:
        wh = tip(np.ones_like(xs, bool))
        far = ((xs - wh[0]) ** 2 + (ys - wh[1]) ** 2) >= 16
        oh = tip(far) or wh
    return wh or oh, oh or wh


def main():
    cls = sys.argv[1]
    install = "--install" in sys.argv
    W = ROOT / "output/dv2fmt/work" / cls
    PL = W / "pixellab"
    M = json.loads((PL / "map.json").read_text(encoding="utf-8"))
    fr = Frames(PL / M.get("frames_dir", "C_all"), M["groups"])
    skin = [hexrgb(h) for h in M.get("skin", ["#d5a174", "#f0c8a0", "#a56c4a"])]
    out = PL / "out"
    out.mkdir(parents=True, exist_ok=True)

    body = np.zeros((300, 300, 4), np.uint8)
    hand = np.zeros((300, 300, 4), np.uint8)
    necks, fist, report, notes, body_off = {}, {}, [], [], {}
    tmpl, origin = {}, {}
    for view, d in VIEW_DIR.items():
        r0 = fr.get(M["poses"]["stand0"][view][0], d, 0)
        tmpl[view] = head_template(r0)
        origin[view] = ground(r0)
    for pose, per in M["poses"].items():
        for view, (anim, idx) in per.items():
            d = VIEW_DIR[view]
            img = fr.get(anim, d, idx)
            ox, oy = ground(fr.get(anim, d, 0))       # same rotation for every animation of a direction; recomputed anyway
            t = tmpl[view]
            dx, dy, score = track(t, img)
            hm = shift(t["mask"], dx, dy)
            er = hm | shift(hm, 1, 0) | shift(hm, -1, 0) | shift(hm, 0, -1)
            er[t["neck"] + dy:] = False                # never erase the neck / shoulders below the head
            b = img.copy()
            b[er] = 0
            lab, n = ndi.label(b[..., 3] > 0, structure=np.ones((3, 3)))   # leftover specks of the erased head (< 4 px, not attached)
            if n > 1:
                sizes = ndi.sum(np.ones(lab.shape), lab, range(1, n + 1))
                for k, sz in enumerate(sizes, 1):
                    if sz < 4:
                        b[lab == k] = 0
            # low top-down view: walking toward / away from the camera, the stepping foot is drawn 2-3 px BELOW the standing
            # feet while the torso stays level. The cell cannot hold rows under 29, so the content is lifted by k inside the
            # cell and the body layer is drawn k px lower again (body_off) -> the torso stays put, the foot steps past the line.
            bottom = np.nonzero((b[..., 3] > 0).any(1))[0].max()
            k = int(max(0, bottom - (oy + CELL - 1)))
            if k:
                notes.append(f"{view}:{pose} foot {k}px below the ground line -> body_off {k}")
            cell, clipped = cut(b, ox, oy + k)
            neck_cell_y = t["neck"] + dy - oy + 1      # true position (not lifted): head's last row covers the body's first row
            neck_cell_x = t["cx_edge"] + dx - ox
            nk = [int(round(neck_cell_x - CELL / 2)), int(neck_cell_y - CELL)]
            wh, oh = fists(cell, view, t["neck"] + dy - oy - k, skin)       # measured in the (lifted) cell ...
            ov = (M.get("fist_overrides") or {}).get(f"{view}:{pose}") or {}
            wh, oh = ov.get("wh", wh), ov.get("oh", oh)                     # ... overrides are in cell pixels too
            hand_wh = wh
            wh = [wh[0], round(wh[1] + k, 1)] if wh else wh                  # fists.json = true screen position (body drawn k lower)
            oh = [oh[0], round(oh[1] + k, 1)] if oh else oh
            if k:
                body_off[f"{view}:{pose}"] = [0, k]
            x, y = F.body_cell_xy(view, pose)
            body[y:y + CELL, x:x + CELL] = cell
            if hand_wh:
                hx, hy = int(round(hand_wh[0])), int(round(hand_wh[1]))
                for yy in range(max(0, hy - 2), min(CELL, hy + 3)):
                    for xx in range(max(0, hx - 2), min(CELL, hx + 3)):
                        if cell[yy, xx, 3] > 0:
                            hand[y + yy, x + xx] = cell[yy, xx]
            necks[f"{view}:{pose}"] = [nk[0] - TABLE_STAND0_NECK[0], nk[1] - TABLE_STAND0_NECK[1]]
            fist[f"{view}:{pose}"] = {"wh": wh, "oh": oh}
            report.append((view, pose, anim, idx, dx, dy, round(score, 2), clipped, nk, wh, oh))
    # lying: the whole PixelLab figure (head included) — the lying body cell carries its own head
    la, li = M["lying"]
    img = fr.get(la, "east", li)
    a = img[..., 3] > 0
    ys, xs = np.nonzero(a)
    crop = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    lx, ly = F.body_cell_xy("side", "lying")
    cx0 = max(0, (CELL - w) // 2)
    sx = max(0, (w - CELL) // 2)
    part = crop[:, sx:sx + CELL]
    body[ly + CELL - h:ly + CELL, lx + cx0:lx + cx0 + part.shape[1]] = part
    report.append(("side", "lying", la, li, 0, 0, 1.0, int((crop[..., 3] > 0).sum() - (part[..., 3] > 0).sum()), None, None, None))

    Image.fromarray(body).save(out / f"{cls}_body.png")
    Image.fromarray(hand).save(out / f"{cls}_hand.png")
    (out / "neck.json").write_text(json.dumps(necks, indent=0), encoding="utf-8")
    (out / "fists.json").write_text(json.dumps(fist, indent=0), encoding="utf-8")
    (out / "body_off.json").write_text(json.dumps(body_off, indent=0), encoding="utf-8")

    # preview: every cell at 8x with markers
    Z = 8
    pv = Image.new("RGBA", (300 * Z, 210 * Z + 20), (47, 51, 68, 255))
    for yy in range(0, 210, 30):
        for xx in range(0, 300, 30):
            tile = Image.new("RGBA", (30, 30), (61, 66, 87, 255) if (xx + yy) // 30 % 2 else (70, 75, 98, 255))
            tile.alpha_composite(Image.fromarray(body[yy:yy + 30, xx:xx + 30]))
            pv.alpha_composite(tile.resize((30 * Z, 30 * Z), Image.NEAREST), (xx * Z, yy * Z))
    dr = ImageDraw.Draw(pv)
    for (view, pose, anim, idx, dx, dy, score, clipped, nk, wh, oh) in report:
        x, y = F.body_cell_xy(view, pose)
        dr.text((x * Z + 3, y * Z + 2), f"{view[0]}:{pose} {anim}{idx} s{score}" + (f" CLIP{clipped}" if clipped else ""), fill="white")
        k_ = (body_off.get(f"{view}:{pose}") or [0, 0])[1]   # preview shows the lifted cell: draw markers lifted too
        if nk:
            px, py = (x + 15 + nk[0]) * Z, (y + 30 + nk[1] - k_) * Z
            dr.rectangle((px - 4, py - 4, px + 4, py + 4), outline=(80, 160, 255), width=2)
        for f, col in ((wh, (255, 70, 70)), (oh, (70, 220, 120))):
            if f:
                px, py = (x + f[0] + 0.5) * Z, (y + f[1] - k_ + 0.5) * Z
                dr.ellipse((px - 6, py - 6, px + 6, py + 6), outline=col, width=3)
    pv.save(out / "preview_x8.png")
    for n_ in notes:
        print("  note", n_)
    bad = [r for r in report if r[6] < 0.45 or r[7] > 0]
    print(f"{cls}: {len(report)} cells -> {out}")
    for r in bad:
        print("  check", r[0], r[1], f"{r[2]} f{r[3]}", "score", r[6], "clipped px", r[7])

    if install:
        src = F.SRC_DIR
        shutil.copy(out / f"{cls}_body.png", src / f"{cls}_body.png")
        shutil.copy(out / f"{cls}_hand.png", src / f"{cls}_hand.png")
        shutil.copy(out / "neck.json", W / "neck.json")
        shutil.copy(out / "fists.json", W / "fists.json")
        shutil.copy(out / "body_off.json", W / "body_off.json")
        (W / "GENERATED.json").write_text(json.dumps({"generator": "pipeline/scripts/dv2fmt/pixellab_body.py", "character_id": M.get("character_id"),
                                                "map": str((PL / "map.json").relative_to(ROOT)).replace("\\", "/"), "date": str(date.today())}, indent=1), encoding="utf-8")
        print("installed into", src, "and", W)


if __name__ == "__main__":
    main()
