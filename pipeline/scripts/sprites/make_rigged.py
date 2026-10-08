"""make_rigged.py — 規格預設做法「關鍵姿勢 + 圖層位移」:walk / hurt 全由待機關鍵姿勢位移產生,attack / death 由少數關鍵姿勢 + 位移補格。

用法:python pipeline/scripts/sprites/make_rigged.py sprites/characters/<ID> [walk hurt attack death]

rig.json 需要:knee、foot、layers、anchors(LEFT_FOOT/RIGHT_FOOT)、rigged:{
  walk:{stride, swing}, hurt:{},
  attack:{keys:{wind:[sheetKey,frame], max:[..], rec:[..]}}, death:{keys:{...}} }
關鍵姿勢 = AI 逐格生成後挑出的 1 格(來源 anims 的表,真像素 + 共用色盤),其餘格 = 同一份像素的整數位移(列位移 / 傾斜 / 腳平移),沒有縮放與內插。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "heroes"))
import make_idle as MI  # noqa: E402
import make_anim as MA  # noqa: E402
import unfake  # noqa: E402
import build_hero as B  # noqa: E402

LCELL, GROUND, AXIS = MI.LCELL, MI.GROUND, MI.AXIS
PX, PY = 14, 4   # 逐字位移用的邊距


def pad(a):
    return np.pad(a, ((PY, PY), (PX, PX), (0, 0)))


def shift(a, dy, dx):
    return MI.shift(a, dy, dx)


def body_frame(a, d, knee, foot):
    """d>0 膝蓋以上下沉 d(膝蓋帶壓縮);d<0 升高 |d|(膝蓋帶拉長)。腳 [foot:) 不動。座標已含 PY。"""
    k, f = knee + PY, foot + PY
    if d == 0: return a.copy()
    out = np.zeros_like(a); band = a[k:f]; n = len(band)
    if d > 0:
        out[d:k + d] = a[:k]; keep = np.round(np.linspace(0, n - 1, n - d)).astype(int); out[k + d:f] = band[keep]
    else:
        m = -d; out[:k - m] = a[m:k]; keep = np.round(np.linspace(0, n - 1, n + m)).astype(int); out[k - m:f] = band[keep]
    out[f:] = a[f:]
    return out


def lean(a, amount, knee):
    """上半身以膝蓋為軸整列位移(amount>0 = 頂端往右,<0 = 往左);腳不動。"""
    if amount == 0: return a
    out = a.copy(); k = knee + PY
    for y in range(k):
        s = int(round(amount * (k - y) / k)); out[y] = shift(a[y:y + 1], 0, s)[0] if s else a[y]
    return out


class Rig:
    def __init__(self, char_dir: Path):
        self.dir = char_dir
        self.rig = rig = json.loads((char_dir / "rig.json").read_text(encoding="utf-8"))
        src = rig["source"]; fr = B.cut(ROOT / src["sheet"], tuple(src["grid"])); im = fr[src["frame"]][0]
        if src.get("keysheet"):
            us, _ = MA.sheet_frames({"sheet": src["sheet"], "grid": src["grid"], "frames": src["grid"][0] * src["grid"][1], "pixelize": src.get("pixelize")}); u = us[src["frame"]]
        else:
            u, _ = unfake.unfake(im)
        self.pal = np.array(json.loads((char_dir / "palette.json").read_text()), np.uint8)
        key = np.asarray(unfake.apply_palette(u, self.pal)).copy()
        key = MI.clean_key(key, rig)
        self.H, self.W = key.shape[:2]; opaque = key[..., 3] > 0
        light = key[..., :3].astype(int).mean(2) > 110
        lm = {n: MI.layer_mask((self.H, self.W), L) & opaque & (~light if L.get("excludeLight") else True) for n, L in rig["layers"].items()}
        body = key.copy()
        for m in lm.values(): body[m] = 0
        self.key = pad(key); self.body = pad(body)
        self.layers = {n: pad(np.where(m[..., None], key, 0).astype(np.uint8)) for n, m in lm.items()}
        self.ox = AXIS - int(round(B.torso_x(Image.fromarray(key, "RGBA")))); self.oy = GROUND - self.H
        self.knee, self.foot = rig["knee"], rig["foot"]
        an = rig["anchors"]; self.xl, self.xr = an["LEFT_FOOT"][0], an["RIGHT_FOOT"][0]
        self.sx = (self.xl + self.xr) / 2 + PX
        self.tops = []

    def to_cell(self, a, dx=0, dy=0):
        cell = np.zeros((LCELL, LCELL, 4), np.uint8); H, W = a.shape[:2]
        ox, oy = self.ox - PX + dx, self.oy - PY + dy
        ys0, xs0 = max(0, -oy), max(0, -ox); ys1, xs1 = min(H, LCELL - oy), min(W, LCELL - ox)
        cell[oy + ys0:oy + ys1, ox + xs0:ox + xs1] = a[ys0:ys1, xs0:xs1]
        return cell

    def compose(self, d=0, lay=None, feet=None, lean_=0, dx=0, dy=0):
        """d 身體下沉;lay {層名:(dy,dx)};feet=(aL,aR) 左/右腳 (dx,dy) 位移;lean_ 上半身傾斜;dx/dy 整體位移。"""
        lay = lay or {}
        body = body_frame(self.body, d, self.knee, self.foot)
        if feet:
            f0 = self.foot + PY
            up_, lo = body[:f0], body[f0:].copy(); L = lo.copy(); R = lo.copy()
            cols = np.arange(lo.shape[1]); L[:, cols >= round(self.sx)] = 0; R[:, cols < round(self.sx)] = 0
            lo = np.zeros_like(lo)
            for part, (fx, fy) in ((L, feet[0]), (R, feet[1])):
                m = shift(part, fy, fx); mm = m[..., 3] > 0; lo[mm] = m[mm]
            body = np.concatenate([up_, lo], 0)
            # 腳抬起時露出的列由身體帶補:不補,腳底留空即可(腳離地)
        parts = [(n, a) for n, L_ in self.rig["layers"].items() if L_.get("z") == "back" for a in [self.layers[n]]]
        parts += [("body", body)] + [(n, self.layers[n]) for n, L_ in self.rig["layers"].items() if L_.get("z") != "back"]
        out = np.zeros_like(self.body)
        for n, a in parts:
            if n != "body":
                ldy, ldx = lay.get(n, (d, 0))
                gb = np.nonzero(self.body[..., 3].any(1))[0].max(); lb = np.nonzero(a[..., 3].any(1))[0].max()
                if lb <= gb: ldy = min(ldy, gb - lb)   # 武器底端在地面上時不可沉到地線以下(拄杖著地)
                a = shift(a, ldy, ldx)
            m = a[..., 3] > 0; out[m] = a[m]
        if lean_: out = lean(out, lean_, self.knee)
        return out if not (dx or dy) else shift(out, dy, dx)

    # ---------- 動畫 ----------
    def walk(self, stride=None, swing=0):
        W = stride or max(4, int(round(abs(self.xr - self.xl) / 2)))
        sink = [0, 1, 0, -1]; A = [W, W // 2, 0, -(W // 2)]; Bf = [-W, -(W // 2), 0, W // 2]
        lift = [0, 0, 1, 0]; frames = []
        # 右腳=A(起始在前),左腳=B
        for k in range(8):
            h, p = divmod(k, 4)
            ax = A[p] if h == 0 else Bf[p]; bx = Bf[p] if h == 0 else A[p]       # 右腳 / 左腳 目標(相對 center)
            rx = ax + (self.xl + self.xr) / 2 - self.xr; lx = bx + (self.xl + self.xr) / 2 - self.xl   # 轉成相對原位的位移
            # 擺動腳 = 目標往前走的那隻
            right_swing = (h == 1)
            fR = (int(round(rx)), -lift[p] if right_swing else 0); fL = (int(round(lx)), 0 if right_swing else -lift[p])
            d = sink[p]; s = -int(round(swing * np.cos(2 * np.pi * k / 8)))
            lay = {n: (d, s if n == "weapon" else sink[(p - 1) % 4]) for n in self.rig["layers"]}
            lay = {n: ((d, s) if n == "weapon" else (max(sink[(k - 1) % 4], 0), 0)) for n in self.rig["layers"]}
            frames.append(self.compose(d, lay, feet=(fL, fR)))
        return frames

    def hurt(self, h=None):
        """1 Normal · 2 Hit(後仰、頭偏)· 3 Knockback(≤2px)· 4 Return。h:{"lean":[3格],"wdx":[3格],"dx":[3格]} 可覆寫(武器易脫離的角色用小值)。"""
        h = h or {}; ln = h.get("lean", [-3, -2, -1]); wd = h.get("wdx", [-3, -2, 0]); dx = h.get("dx", [-1, -1, -1]); wy = h.get("wdy", [0, 1, 1])
        return [self.compose(0),
                self.compose(1, self.wl(1, wy[0], wd[0]), lean_=ln[0], dx=dx[0]),
                self.compose(1, self.wl(1, wy[1], wd[1]), lean_=ln[1], dx=dx[1]),
                self.compose(0, self.wl(0, wy[2], wd[2]), lean_=ln[2], dx=dx[2])]

    def wl(self, d, dy, dx):
        return {n: ((dy, dx) if n == 'weapon' else (d, 0)) for n in self.rig['layers']}

    def key_cell(self, anim, frame):
        """從既有 AI 動畫表取一格當關鍵姿勢(真像素 + 共用色盤 + 對位),回傳 cell。"""
        spec = self.rig["anims"][anim]; us, _ = MA.sheet_frames(spec)
        c, *_ = MA.place(unfake.apply_palette(us[frame], self.pal))
        return outline_fix(np.asarray(c).copy(), self.rig.get("outlineTarget", .62))


def outline_fix(c, target=.62):
    """剪影外圈暗色比例 < target 時,把外圈最暗的非深色像素改成色盤最深色(只改色、不增減像素)直到達標。"""
    from scipy import ndimage
    m = c[..., 3] > 0; edge = m & ~ndimage.binary_erosion(m); lum = c[..., :3].astype(int).sum(2)
    dark = edge & (lum < 300)
    if not edge.any() or dark.sum() / edge.sum() >= target: return c
    cand = np.argwhere(edge & ~dark); cand = cand[np.argsort(lum[edge & ~dark] if False else [lum[y, x] for y, x in cand])]
    solid = c[m][np.argmin(lum[m])][:3]
    need = int(np.ceil(target * edge.sum())) - int(dark.sum())
    for y, x in cand[:need]: c[y, x, :3] = solid
    return c


def despeck(c, n=8):
    """去掉位移 / 傾斜產生的孤立小碎片(< n 像素的獨立連通塊)。"""
    from scipy import ndimage
    lab, k = ndimage.label(c[..., 3] > 0, structure=np.ones((3, 3)))
    for i in range(1, k + 1):
        m = lab == i
        if m.sum() < n: c[m] = 0
    return c


def clamp_cell(c, m=2):
    """邊緣離格邊 < m px 時整格平移(只動該格,最多幾 px)。"""
    xs = np.nonzero((c[..., 3] > 0).any(0))[0]
    if not len(xs): return c
    if xs.min() < m: c = shift_cell(c, m - xs.min(), 0)
    elif LCELL - 1 - xs.max() < m: c = shift_cell(c, -(m - (LCELL - 1 - xs.max())), 0)
    return c


def cell_top(c):
    ys = np.nonzero((c[..., 3] > 0).any(1))[0]; return int(ys.min()) if len(ys) else GROUND


def shift_cell(c, dx, dy): return MI.shift(c, dy, dx)


def main(char_dir: Path, only=None):
    R = Rig(char_dir); rig = R.rig; cfg = rig.get("rigged", {})
    rig_for_write = {**rig}
    todo = only or ["walk", "hurt", "attack", "death"]
    for anim in todo:
        spec = {**rig["anims"].get(anim, {}), "sheets": [{"rigged": True}]}
        spec.setdefault("frameTime", {"walk": .1, "hurt": .1, "attack": .075, "death": .12}[anim])
        if anim == "walk":
            wc = cfg.get("walk", {})
            if wc.get("mode") == "hop":   # 史萊姆:沒有腳,走路 = 蹲 → 跳起(整體上移 ≤3,bible 魔物腳底 ±3)→ 落地壓扁
                fr = [R.compose(d, dy=-h) for d, h in zip([2, 1, 0, 0, 0, 0, 1, 2], [0, 1, 2, 3, 3, 2, 1, 0])]
            else:
                fr = R.walk(wc.get("stride"), wc.get("swing", 0))
            cells = [R.to_cell(a) for a in fr]
            spec.update(loop=True, cycle=cfg.get("walk", {}).get("cycle"))
        elif anim == "hurt":
            cells = [R.to_cell(a) for a in R.hurt(cfg.get('hurt'))]; spec.update(loop=False)
        elif anim == "attack":
            cells = attack(R, cfg["attack"]); spec.update(loop=False, release=5, impact=6)
        else:
            cells = death(R, cfg["death"]); spec.update(loop=False)
        cells = [clamp_cell(despeck(np.asarray(c).copy(), cfg.get("despeck", {}).get(anim, 8))) for c in cells]
        if rig.get("keyBridge"): cells = [MI.bridge(c, rig["keyBridge"]) for c in cells]
        tops = [cell_top(c) for c in cells]
        MA.write(char_dir, rig_for_write, anim, [np.asarray(c) for c in cells], tops, spec, 5.0, [False] * len(cells))
        print(f"  {anim}: rigged {len(cells)} frames")


def attack(R: Rig, cfg):
    """1 Ready(待機) 2 Prep(待機位移) 3 Wind-up(關鍵) 4 Begin(關鍵位移) 5 Max(關鍵,release) 6 Impact(關鍵位移) 7 Recovery(關鍵) 8 Return(待機位移)"""
    K = {n: R.key_cell(a, f) for n, (a, f) in cfg["keys"].items()}
    if cfg.get("stripFlash"):   # 特效(白色閃光)不畫在本體上
        from scipy import ndimage
        for c in K.values():
            # 只拿掉閃光:白色塊外圍 2 px 幾乎沒有本體色(只有描邊/透明)。身體上的高光、眼白旁邊就是本體色,不動
            lum = c[..., :3].astype(int).sum(2); op = c[..., 3] > 0
            e0 = op & ~ndimage.binary_erosion(op); r0 = float((lum[e0] < 300).mean())   # 拿閃光前的描邊比例
            wh = (lum > 690) & op; colored = op & (lum >= 200) & ~wh
            lab_w, nw = ndimage.label(wh, structure=np.ones((3, 3))); fl = np.zeros_like(wh)
            for i in range(1, nw + 1):
                m = lab_w == i; ring = ndimage.binary_dilation(m, iterations=2) & ~m
                if colored[ring].mean() < .15: fl |= m
            c[fl] = 0
            # 閃光的深色描邊線:閃光附近、且上下左右沒有任何非深色本體像素的深色像素
            op = c[..., 3] > 0; dark = op & (c[..., :3].astype(int).sum(2) < 200); body = op & ~dark
            near_body = ndimage.binary_dilation(body, structure=[[0, 1, 0], [1, 1, 1], [0, 1, 0]])
            c[ndimage.binary_dilation(fl, iterations=3) & dark & ~near_body] = 0
            c[:] = outline_fix(c, r0)   # 拿掉閃光後露出的新邊補回原本的描邊比例
    for n, dx in cfg.get("dx", {}).items(): K[n] = shift_cell(K[n], dx, 0)
    ready = R.to_cell(R.compose(0)); prep = R.to_cell(R.compose(1, R.wl(1, -3, 0), lean_=-2, dx=-1))
    ret = R.to_cell(R.compose(0, R.wl(0, 1, 0)))
    return [ready, prep, K["wind"], shift_cell(K["wind"], cfg.get("beginDx", 2), 0), K["max"], shift_cell(K["max"], 1, 0), K["rec"], ret]


def death(R: Rig, cfg):
    """1 Hit 2 Stagger 3 Fall 4 Fall 5 Ground 6 Collapse 7 Final 8 Hold(尾格不動)"""
    if cfg.get("proc"): return death_proc(R, cfg.get("wk", 1.0), cfg.get("lk", 1.0), cfg.get("dk", 1.0), cfg.get("fall", "rot"))
    K = {n: R.key_cell(a, f) for n, (a, f) in cfg["keys"].items()}
    hit = R.to_cell(R.compose(1, R.wl(1, 0, -3), lean_=-5, dx=-1))
    return [hit, K["hit"], K["fall1"], K["fall2"], K["ground"], K["collapse"], K["final"], K["final"]]


def death_proc(R: Rig, wk=1.0, lk=1.0, dk=1.0, fall="rot"):
    """程式化倒下(全為整數位移 / 90° 旋轉 / 上下翻,無縮放):受擊 → 踉蹌 → 後仰 ×2(上半身整列傾斜)→ 倒地(腳貼 ground)→ 落定 → 定格。
    fall:rot = 向後倒(旋轉 90°,人形);rotcw = 向前趴倒(背武器的角色);flip = 翻肚四腳朝天(四足);sink = 沉進地面(史萊姆,地線以下裁掉)。"""
    c = R.to_cell
    w = lambda v: int(round(v * wk)); L = lambda v: int(round(v * lk)); D = lambda v: int(round(v * dk))
    hit = c(R.compose(1, R.wl(1, 0, w(-3)), lean_=L(-5), dx=D(-1)))
    stag = c(R.compose(2, R.wl(2, 0, w(-4)), lean_=L(-9), dx=D(-2)))
    if fall == "sink":
        base = c(R.compose(2)); h = int(np.ptp(np.nonzero((base[..., 3] > 0).any(1))[0])) + 1
        out = [hit, stag]
        for f in (.15, .3, .45, .55, .55, .55):
            s = shift_cell(base, 0, int(round(h * f))); s[GROUND:] = 0
            m = s[GROUND - 1, :, 3] > 0; s[GROUND - 1, m, :3] = R.pal[np.argmin(R.pal[:, :3].astype(int).sum(1))][:3]   # 切口補描邊(地面線)
            out.append(s)
        return out
    fall1 = c(R.compose(2, R.wl(2, 1 if wk else 2, w(-5)), lean_=L(-13), dx=D(-3)))
    fall2 = c(R.compose(2, R.wl(2, 2, w(-6)), lean_=L(-17), dx=D(-4)))
    rot = {"flip": np.flipud, "rotcw": lambda a: np.rot90(a, -1)}.get(fall, lambda a: np.rot90(a, 1))(R.compose(0, R.wl(0, 0, 0))).copy()   # rotcw = 向前趴倒(背上的武器朝上,不會把身體撐離地)
    al = rot[..., 3] > 0; ys = np.nonzero(al.any(1))[0]; xs = np.nonzero(al.any(0))[0]
    cell = np.zeros((LCELL, LCELL, 4), np.uint8); crop = rot[ys.min():ys.max() + 1, xs.min():xs.max() + 1]; h, w = crop.shape[:2]
    x0 = AXIS - w // 2 - 2; y0 = GROUND - h
    cell[y0:y0 + h, x0:x0 + w] = crop
    return [hit, stag, fall1, fall2, cell, shift_cell(cell, -1, 0), cell, cell]


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2:] or None)
