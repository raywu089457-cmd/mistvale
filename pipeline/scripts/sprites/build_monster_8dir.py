"""build_monster_8dir.py — 把 PixelLab 8 方向旋轉圖（每方向一張 256）做成遊戲用魔物 sheet（8 方向／idle·walk·attack·hurt·death）。

    python pipeline/scripts/sprites/build_monster_8dir.py kobold           # 先試一隻（不寫檔，只出預覽）
    python pipeline/scripts/sprites/build_monster_8dir.py kobold --write   # 寫 assets/monsters3/
    python pipeline/scripts/sprites/build_monster_8dir.py all --write      # 21 隻全部

來源：output/l0veyou/mon8/<id>/<方向>.png（桌面「<中文>-<id>-8方向-256」那批，256×256、透明、無陰影）。
來源只有「每個方向一張站姿」，所以走路／攻擊／受擊／死亡都是**同一份像素的整數位移**（跟 make_rigged.py 同一套做法：
膝蓋帶壓縮、腳左右平移、上半身整列傾斜、整體位移），沒有縮放與插值 → 不會糊、不會出現新顏色。

規格：
- 色盤：8 個方向合併後取 16 色（unfake.limit_palette），所有列共用。
- 縮放：8 個方向用**同一個**比例 s = artSize / 最大內容邊長，所以每個方向的體型一致。
- 格子：內容 + 邊距（換算後 10%）後向上取偶數，比固定 144/176 省記憶體。
- 對位：每列用「腳底 6 列的重心 x」對到格中線、腳底對到 cell−footFromBottom−1（跟 add_dir_rows.py 一樣）。
- 動作：idle 1 格／walk 8 格（可 hop）／attack 8 格（release 4、impact 5）／hurt 4 格／death 8 格（沉入地面）。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import unfake  # noqa: E402

SRC = ROOT / "output/l0veyou/mon8"
HEROES = ROOT / "assets/monsters3"
FOOT = 8
TIMING = {"idle": .2, "walk": .1, "attack": .075, "hurt": .1, "death": .12}

# 方向 → (idle/walk/attack 的列名後綴, 動作列)
DIRS = [
    ("east",       "",           "attack"),
    ("south-east", "DownRight",  "attackDownRight"),
    ("south",      "Down",       "attackDown"),
    ("south-west", "DownLeft",   "attackDownLeft"),
    ("west",       "Left",       "attackLeft"),
    ("north-west", "UpLeft",     "attackUpLeft"),
    ("north",      "Up",         "attackUp"),
    ("north-east", "UpRight",    "attackUpRight"),
]

# id: (中文名, 地形, gameSize, 走法)  step = 左右腳交替, hop = 整體彈跳(沒有腳的)
MONS = {
    "sprout":     ("花芽妖",   "meadow",   22, "hop"),
    "ram":        ("捲角羊",   "meadow",   24, "step"),
    "mole":       ("鼴鼠",     "meadow",   24, "step"),
    "shroom":     ("蕈菇怪",   "forest",   22, "hop"),
    "boar":       ("野豬",     "forest",   26, "step"),
    "vine":       ("藤鞭怪",   "forest",   28, "step"),
    "wolfman":    ("灰毛狼人", "taiga",    29, "step"),
    "moss":       ("苔蘚巨魔", "taiga",    31, "step"),
    "snowhare":   ("雪兔",     "taiga",    22, "hop"),
    "yeti":       ("霜雪怪",   "snow",     33, "step"),
    "snowman":    ("雪人哨兵", "snow",     26, "step"),
    "icebeetle":  ("冰甲蟲",   "snow",     23, "hop"),
    "kobold":     ("礦穴地精", "mountain", 23, "step"),
    "boulder":    ("岩塊怪",   "mountain", 31, "step"),
    "goat":       ("鐵角羊",   "mountain", 26, "step"),
    "mummy":      ("木乃伊",   "desert",   28, "step"),
    "cactus":     ("仙人掌怪", "desert",   24, "hop"),
    "scorpion":   ("沙蠍",     "desert",   26, "step"),
    "floraspirit":("花妖精",   "birch",    22, "hop"),
    "birchling":  ("白樺樹精", "birch",    27, "hop"),
    "stag":       ("白樺雄鹿", "birch",    28, "step"),
}


# ---------- 整數位移工具（座標都在格子里） ----------
def shift(a: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(a)
    H, W = a.shape[:2]
    ys0, ys1 = max(0, dy), min(H, H + dy)
    xs0, xs1 = max(0, dx), min(W, W + dx)
    if ys1 <= ys0 or xs1 <= xs0:
        return out
    out[ys0:ys1, xs0:xs1] = a[max(0, -dy):max(0, -dy) + (ys1 - ys0), max(0, -dx):max(0, -dx) + (xs1 - xs0)]
    return out


def clamp(a: np.ndarray, m: int = 2) -> np.ndarray:
    """貼到格子邊就往內推（只動那一格幾 px）:位移/傾斜偶爾會把內容推出格子。"""
    al = a[..., 3] > 0
    ys = np.nonzero(al.any(0))[0]
    xs = np.nonzero(al.any(1))[0]
    if not len(ys) or not len(xs):
        return a
    dx = m - int(ys.min()) if ys.min() < m else (-(m - (a.shape[1] - 1 - ys.max())) if a.shape[1] - 1 - ys.max() < m else 0)
    dy = m - int(xs.min()) if xs.min() < m else 0
    return shift(a, dy, dx) if (dx or dy) else a


def body_frame(a: np.ndarray, d: int, knee: int, foot: int) -> np.ndarray:
    """d>0 膝蓋以上下沉(膝蓋帶壓縮),d<0 升高;腳 [foot:] 不動。"""
    if d == 0:
        return a.copy()
    out = np.zeros_like(a)
    band = a[knee:foot]
    n = len(band)
    if d > 0:
        out[d:knee + d] = a[:knee]
        keep = np.round(np.linspace(0, n - 1, n - d)).astype(int)
        out[knee + d:foot] = band[keep]
    else:
        m = -d
        out[:knee - m] = a[m:knee]
        keep = np.round(np.linspace(0, n - 1, n + m)).astype(int)
        out[knee - m:foot] = band[keep]
    out[foot:] = a[foot:]
    return out


def lean(a: np.ndarray, amount: float, knee: int) -> np.ndarray:
    """上半身以膝蓋為軸整列位移。"""
    if not amount:
        return a
    out = a.copy()
    for y in range(knee):
        s = int(round(amount * (knee - y) / max(1, knee)))
        if s:
            out[y] = shift(a[y:y + 1], 0, s)[0]
    return out


class Mon:
    """k = 動作幅度係數（以 art 為基準，小魔物不會位移過大、大魔物不會看起來沒動）。"""

    def __init__(self, key: np.ndarray, art: int = 80):
        self.key = key
        self.a = art
        self.k = art / 80
        self.H, self.W = key.shape[:2]
        al = key[..., 3] > 0
        ys, xs = np.nonzero(al)
        self.top, self.bot = int(ys.min()), int(ys.max())
        self.foot = self.bot + 1
        self.h = self.bot - self.top + 1
        self.knee = self.foot - max(4, round(self.h * .1))
        band = al[max(0, self.bot - 5):self.bot + 1]
        cols = np.nonzero(band.any(0))[0]
        runs = np.split(cols, np.nonzero(np.diff(cols) > 1)[0] + 1)
        if len(runs) >= 2:
            self.xl, self.xr = float(runs[0].mean()), float(runs[-1].mean())
        else:
            self.xl, self.xr = cols.min() + .25 * np.ptp(cols), cols.min() + .75 * np.ptp(cols)
        self.sx = (self.xl + self.xr) / 2
        self.body = key.copy()

    def compose(self, d=0, feet=None, lean_=0, dx=0, dy=0):
        body = body_frame(self.body, d, self.knee, self.foot)
        if feet:
            up, lo = body[:self.foot], body[self.foot:].copy()
            cols = np.arange(lo.shape[1])
            L = lo.copy(); L[:, cols >= round(self.sx)] = 0
            R = lo.copy(); R[:, cols < round(self.sx)] = 0
            lo = np.zeros_like(lo)
            for part, (fx, fy) in ((L, feet[0]), (R, feet[1])):
                m = shift(part, fy, fx)
                mm = m[..., 3] > 0
                lo[mm] = m[mm]
            body = np.concatenate([up, lo], 0)
        if lean_:
            body = lean(body, lean_, self.knee)
        return shift(body, dy, dx) if (dx or dy) else body

    # --- 動作 ---
    def walk(self, stride=None):
        W = stride or max(4, int(round(self.a * .10)))
        k = self.k
        sink = [0, max(1, round(k)), 0, max(-2, -round(k))]
        A, Bf = [W, W // 2, 0, -(W // 2)], [-W, -(W // 2), 0, W // 2]
        lift = [0, 0, max(1, round(k)), 0]
        out = []
        for k in range(8):
            h, p = divmod(k, 4)
            ax = A[p] if h == 0 else Bf[p]
            bx = Bf[p] if h == 0 else A[p]
            rx = ax + (self.xl + self.xr) / 2 - self.xr
            lx = bx + (self.xl + self.xr) / 2 - self.xl
            right_swing = h == 1
            fR = (int(round(rx)), -lift[p] if right_swing else 0)
            fL = (int(round(lx)), 0 if right_swing else -lift[p])
            out.append(self.compose(sink[p], feet=(fL, fR)))
        return out

    def hop(self):
        k = self.k
        return [self.compose(round(2 * k), dy=-round(h * k)) for h in [0, 1, 2, 3, 3, 2, 1, 0]]

    def attack(self):
        """1 待機 2 預備 3 蓄力 4 起手 5 出手(release) 6 命中 7 收招 8 回待機。dx/lean/sink 都是 art 的比例。"""
        a = self.a
        # 位移幅度要留在格子的邊距內（邊距 = 14% art）；引擎另外會疊自己的前衝（motionOf），所以這裡只要一點點
        spec = [(0, 0, 0), (-.02, -.035, .02), (-.04, -.06, .03), (.015, .015, 0),
                (.05, .04, -.02), (.055, .05, 0), (.02, .02, .02), (0, 0, 0)]
        return [self.compose(round(sink * a), lean_=lean * a, dx=round(dx * a)) for dx, lean, sink in spec]

    def hurt(self):
        a = self.a
        spec = [(0, 0, 0), (-.03, -.07, .02), (-.03, -.05, .02), (0, -.02, 0)]
        return [self.compose(round(sink * a), lean_=lean * a, dx=round(dx * a)) for dx, lean, sink in spec]

    def death(self):
        base = self.compose(0)
        h = self.h
        a = self.a
        frames = [self.compose(round(.02 * a), lean_=-.05 * a, dx=round(-.02 * a)),
                  self.compose(round(.04 * a), lean_=-.09 * a, dx=round(-.03 * a))]
        for f in (.15, .3, .45, .55, .55, .55):
            s = shift(base, int(round(h * f)), 0)
            s[self.bot + 1:] = 0
            frames.append(s)
        return frames[:8]


def load_dirs(mid: str) -> dict[str, Image.Image]:
    out = {}
    for d, _, _ in DIRS:
        p = SRC / mid / f"{d}.png"
        if not p.exists():
            raise SystemExit(f"缺少 {p}")
        out[d] = Image.open(p).convert("RGBA")
    return out


def bbox(a: np.ndarray):
    al = a[..., 3] > 0
    ys, xs = np.nonzero(al)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fill_transparent(a: np.ndarray) -> np.ndarray:
    """透明處填最近的實色再縮放，否則 LANCZOS 會把黑色/洋紅拉進邊緣（變髒、變暗）。"""
    from scipy import ndimage
    m = a[..., 3] > 0
    if m.all():
        return a
    idx = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    out = a.copy()
    out[..., :3] = a[..., :3][idx[0], idx[1]]
    return out


def quantize(im: Image.Image, n: int = 32) -> Image.Image:
    """縮放後併色：median cut 到 n 色（不放回洋紅），alpha 只留 0/255。"""
    a = np.asarray(im.convert("RGBA")).copy()
    m = a[..., 3] > 0
    px = a[..., :3][m].astype(np.uint8)
    if not len(px):
        return im
    side = int(np.ceil(np.sqrt(len(px))))
    buf = np.zeros((side * side, 3), np.uint8)
    buf[:len(px)] = px
    buf[len(px):] = px[0]
    q = Image.fromarray(buf.reshape(side, side, 3)).quantize(n, method=Image.Quantize.MEDIANCUT)
    pal = np.asarray(q.getpalette()[:n * 3]).reshape(-1, 3).astype(int)
    d = ((px[:, None, :].astype(int) - pal[None]) ** 2).sum(2)
    out = np.zeros_like(a)
    out[..., :3][m] = pal[d.argmin(1)]
    out[..., 3] = np.where(m, 255, 0)
    return Image.fromarray(out, "RGBA")


def load_walk(src: Path, d: str, s: float, cell: int) -> list[np.ndarray] | None:
    """讀 PixelLab 生的走路格（<src>/<方向>/frame-XX.png，256 或 128），縮放、去背、貼進格子。
    整列用第 0 格的腳底重心/底邊算一次位移，所以 8 格不會左右抖。"""
    files = sorted((src / d).glob("frame-*.png"))
    if not files:
        return None
    fr = []
    for f in files:
        a = fill_transparent(np.asarray(Image.open(f).convert("RGBA")).copy())
        w, h = max(1, round(a.shape[1] * s)), max(1, round(a.shape[0] * s))
        im = Image.fromarray(a, "RGBA").resize((w, h), Image.LANCZOS)
        b = np.asarray(im).copy()
        b[..., 3] = np.where(b[..., 3] >= 96, 255, 0)
        fr.append(b)
    x0, y0, x1, y1 = bbox(fr[0])
    al = fr[0][..., 3] > 0
    band = al[max(0, fr[0].shape[0] - 6):]
    cols = np.nonzero(band.any(0))[0]
    cx = float(cols.mean()) if len(cols) else (x0 + x1) / 2
    dx = int(round(cell / 2 - cx))
    out = []
    for b in fr:
        bx0, by0, bx1, by1 = bbox(b)
        dx = int(round(cell / 2 - cx))
        dy = cell - FOOT - (by1 - by0)
        canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        canvas.alpha_composite(Image.fromarray(b[by0:by1, bx0:bx1], "RGBA"), (dx, dy))
        out.append(np.asarray(quantize(canvas)).copy())
    return out


def build(mid: str, write: bool, walk_src: Path | None = None) -> None:
    cn, region, gameSize, mode = MONS[mid]
    art = round(gameSize * 72 / 21)
    imgs = load_dirs(mid)
    raw = {d: fill_transparent(np.asarray(im).copy()) for d, im in imgs.items()}
    biggest = max(max(b[2] - b[0], b[3] - b[1]) for b in (bbox(a) for a in raw.values()))
    s = art / biggest
    margin = max(10, round(art * .14))
    scaled = {}
    for d, a in raw.items():
        w, h = max(1, round(a.shape[1] * s)), max(1, round(a.shape[0] * s))
        im = Image.fromarray(a, "RGBA").resize((w, h), Image.LANCZOS)
        a2 = np.asarray(im).copy()
        a2[..., 3] = np.where(a2[..., 3] >= 96, 255, 0)      # 硬邊 alpha
        scaled[d] = a2
    big = max(max(b[2] - b[0], b[3] - b[1]) for b in (bbox(a) for a in scaled.values()))
    cell = big + margin * 2
    cell += cell % 2
    keys = {}
    for d, a in scaled.items():
        x0, y0, x1, y1 = bbox(a)
        crop = Image.fromarray(a[y0:y1, x0:x1], "RGBA")
        al = np.asarray(crop)[..., 3] > 0
        band = al[max(0, al.shape[0] - 6):]
        cols = np.nonzero(band.any(0))[0]
        cx = float(cols.mean()) if len(cols) else crop.width / 2
        dx = int(round(cell / 2 - cx))
        dx = min(max(dx, 2), cell - 2 - crop.width)      # 腳底重心對齊之餘,內容不可以被格子切到(藤鞭怪這種橫向很寬的)
        canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        canvas.alpha_composite(crop, (dx, cell - FOOT - crop.height))
        keys[d] = np.asarray(quantize(canvas)).copy()

    rows: list[tuple[str, list[np.ndarray], dict]] = []
    for d, suffix, atk in DIRS:
        M = Mon(keys[d], art)
        rows.append(("idle" + suffix, [M.compose(0)], {"frames": 1, "frameTime": TIMING["idle"]}))
        wf = load_walk(walk_src, d, s, cell) if walk_src else None
        if wf:
            rows.append(("walk" + suffix, wf, {"frames": len(wf), "frameTime": TIMING["walk"], "cycle": 85}))
        else:
            rows.append(("walk" + suffix, (M.hop() if mode == "hop" else M.walk()), {"frames": 8, "frameTime": TIMING["walk"], "cycle": 85}))
        rows.append((atk, M.attack(), {"frames": 8, "frameTime": TIMING["attack"], "release": 4, "impact": 5}))
    Me = Mon(keys["east"], art)
    rows.append(("hurt", Me.hurt(), {"frames": 4, "frameTime": TIMING["hurt"]}))
    rows.append(("death", Me.death(), {"frames": 8, "frameTime": TIMING["death"]}))

    sheet = Image.new("RGBA", (cell * 8, cell * len(rows)), (0, 0, 0, 0))
    acts = {}
    for r, (name, frames, spec) in enumerate(rows):
        head = []
        frames = [clamp(f) for f in frames]
        for i, f in enumerate(frames):
            sheet.alpha_composite(Image.fromarray(f, "RGBA"), (i * cell, r * cell))
            a = f[..., 3] > 0
            ys = np.nonzero(a[:, int(cell / 2 - .12 * cell):int(cell / 2 + .12 * cell)].any(1))[0]
            head.append([cell / 2, int(ys.min())] if len(ys) else None)
        acts[name] = {"y": r * cell, "cell": cell, "frames": len(frames), **spec, "head": head}
    meta = {"hero": mid, "heroHeight": 72, "footFromBottom": FOOT, "actions": acts, "monster": True,
            "size": gameSize, "artSize": art,
            "source": f"PixelLab 8 方向旋轉(每方向 1 張 256)+ 程式化 walk/attack/hurt/death;cell {cell}"}
    out_png, out_json = HEROES / f"{mid}.png", HEROES / f"{mid}.json"
    prev = HEROES / "_prev8dir" / f"{mid}.png"
    print(f"{mid:12s} cell={cell} art={art} sheet={sheet.size} rows={len(rows)}")
    if write:
        prev.parent.mkdir(exist_ok=True)
        if out_png.exists() and not prev.exists():
            import shutil
            shutil.copy2(out_png, prev)
            shutil.copy2(out_json, prev.with_suffix(".json"))
        sheet.save(out_png)
        out_json.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        (ROOT / "output/l0veyou/mon8_preview").mkdir(parents=True, exist_ok=True)
        sheet.save(ROOT / f"output/l0veyou/mon8_preview/{mid}.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--walk-src", default=None, help="PixelLab 生的走路格 <dir>/<方向>/frame-XX.png（沒給就用程式化走路）")
    a = ap.parse_args()
    ids = list(MONS) if a.ids == ["all"] else a.ids
    src = Path(a.walk_src) if a.walk_src else None
    for mid in ids:
        build(mid, a.write, src)
