"""audit_density.py — 像素密度一致性(mixel)。同一畫面上「一個美術像素」在螢幕上要差不多大。
1. 美術像素格距 g:每張生圖原表(output/l0veyou/*)的亮度梯度剖面做 FFT,取 1.8–40px 內最強週期。
   合成驗證:最近鄰放大 3/5/8 倍 + 雜訊 → 量到 2.98/4.98/7.98。
2. 遊戲畫面大小:k = 遊戲畫它的邏輯尺寸 ÷ 它在原表上的 px(2x 圖集 = 原表解析度)。
3. 螢幕上的美術像素 = g·k(邏輯單位;乘上縮放倍率就是螢幕 px)。各類別中位數跟英雄比,0.67–1.5 算一致。
用法:python pipeline/scripts/check/audit_density.py   (exit 1 = 有類別不一致)"""
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[3]; A = ROOT / "assets"; SRC = ROOT / "output/l0veyou"
sys.path.insert(0, str(ROOT / "pipeline/scripts/xilurus"))
import assemble as asm
_gcache = {}
def sheet_grid(name):
    if name in _gcache: return _gcache[name]
    p = SRC / name
    if not p.exists(): p = next(q for q in [p.with_suffix(".jpg"), p.with_suffix(".png")] if q.exists())
    a = np.asarray(Image.open(p).convert("RGBA")).astype(float); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = ~(((r > 200) & (b > 200) & (g < 80)) | ((g > 200) & (r < 80) & (b < 80)))
    L = a[..., :3].mean(2); out = []
    for ax in (1, 0):
        gr = np.abs(np.diff(L, axis=ax)); m = (al[:, 1:] & al[:, :-1]) if ax == 1 else (al[1:] & al[:-1])
        prof = (gr * m).sum(axis=0 if ax == 1 else 1); prof = prof - prof.mean()
        F = np.abs(np.fft.rfft(prof)); fr = np.fft.rfftfreq(len(prof)); ok = (fr > 1 / 40) & (fr < 1 / 1.8)
        out.append(1 / fr[np.argmax(F * ok)])
    _gcache[name] = float(np.mean(out)); return _gcache[name]
def cells(name):
    m = json.loads((A / f"{name}.manifest.json").read_text(encoding="utf-8")); return m["cells"]
src = (ROOT / "src/pixel-world.js").read_text(encoding="utf-8")
i = src.index("const PROP_ATLAS="); PROP = {k: (float(w), float(h)) for k, w, h in re.findall(r"(\w+):\['\w+',([\d.]+),([\d.]+),[\d.]+\]", src[i:i + 4000])}
CW = {k: float(v) for k, v in re.findall(r"(\w+):(\d+)", re.search(r"conceptBuildingWidth=id=>\(\{([^}]*)\}", src).group(1))}
ES = {"slime": 28, "wolf": 31, "golem": 33, "treant": 50}
TREE = {"pine", "oak", "birch", "snowpine", "autumnOak"}
origin = {}   # cell id → 原表檔名
for sheet, prefix, grid, ids, mirror in asm.SHEETS:
    for k in ids:
        if k != "-": origin.setdefault(k, sheet)
rows = []
def block(a):
    """圖本身是不是整數倍最近鄰放大(像素化過的):是 → 回傳倍數 N(1 美術像素 = N 圖集 px);否則 None。"""
    for N in (8, 4, 2):
        h, w = a.shape[0] // N * N, a.shape[1] // N * N
        if h < N or w < N: continue
        b = a[:h, :w]; d = b[::N, ::N].repeat(N, 0).repeat(N, 1)
        if (np.abs(b.astype(int) - d.astype(int)).max(-1) <= 2).mean() > .985: return N
    return None
def add(cat, k, sheet, w, h, lw=None, lh=None, img=None):
    kk = min(lw / w if lw else 1e9, lh / h if lh else 1e9)
    N = block(img) if img is not None else None
    g = N if N else GEN_GRID   # 像素化過:格距 = N(精確);沒有:用生圖格距(各表 FFT 實測 3.97–4.31,建築表被茅草紋干擾量不準,統一用 4)
    rows.append((cat, k, g, kk, g * kk))
GEN_GRID = 4.0
def crop(atlas, k):
    m = json.loads((A / f"{atlas}.manifest.json").read_text(encoding="utf-8")); c = m["cells"][k]
    return np.asarray(Image.open(A / m["image"]).convert("RGBA"))[c["y"]:c["y"] + c["h"], c["x"]:c["x"] + c["w"]]
c2 = {}
for atlas in ["details", "props", "cold", "woods", "flora", "yard", "town", "town2", "vfx"]:
    for k, c in cells(f"{atlas}@2x").items(): c2[k] = (atlas, c)
PROP.update(asm.EXTRA_BOX)
for k, (atlas, c) in c2.items():
    if k not in origin: continue
    img = crop(f"{atlas}@2x", k)
    if k in TREE: add("tree", k, origin[k], c["w"], c["h"], 50 * .85, 72 * .85, img)
    elif k.startswith("fx") or k == "arrowFx": add("vfx", k, origin[k], c["w"], c["h"], *PROP[k], img=img)
    elif k in PROP: add("prop", k, origin[k], c["w"], c["h"], *PROP[k], img=img)
# 英雄 / 魔物:assets/heroes、assets/monsters3 待機第 1 格(sheet 已是 1:1 真像素,格距 = 1);英雄畫 21 邏輯單位高、魔物畫 size
def idle0(d, n):
    m = json.loads((A / d / f"{n}.json").read_text(encoding="utf-8")); a = m["actions"]["idle"]; c = a["cell"]
    f = np.asarray(Image.open(A / d / f"{n}.png").convert("RGBA"))[a["y"]:a["y"] + c, 0:c]
    ys, xs = np.nonzero(f[..., 3] > 0); return m, f[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
for cls in asm.CLASSES + ["archer"]:
    m, f = idle0("heroes", cls); rows.append(("hero", cls, 1.0, 21 / m["heroHeight"], 21 / m["heroHeight"]))
for n, sz in ES.items():
    m, f = idle0("monsters3", n); rows.append(("monster", n, 1.0, sz / max(f.shape[:2]), sz / max(f.shape[:2])))
# 建築:assets/xilurus/<id>.png = 原表解析度;畫寬 conceptBuildingWidth × 街區縮放約 0.75
for f in sorted((A / "xilurus").glob("*.png")):
    if f.stem.startswith("tex-"): continue
    im = Image.open(f); add("building", f.stem, "-", im.width, im.height, lw=CW.get(f.stem, 106) * .75, img=np.asarray(im.convert("RGBA")))
# 地面:材質 1 圖集像素 = TERRAIN_TEX_SCALE 邏輯單位(pixel-world.js);材質本身若是放大過的再乘倍數
TS = float(re.search(r"const TERRAIN_TEX_SCALE=([\d.]+)", src).group(1))
for f in sorted((A / "xilurus").glob("tex-*.png")):
    a = np.asarray(Image.open(f).convert("RGBA")); N = block(a) or 1; rows.append(("ground", f.stem, N, TS, N * TS))
cats = {}
for c, k, g, kk, s in rows: cats.setdefault(c, []).append(s)
ref = float(np.median(cats["hero"])); bad = []
print(f"{'category':9} {'n':>3} {'grid(src px)':>12} {'art px (logical)':>17}  vs hero")
for c, v in cats.items():
    gs = [g for cc, k, g, kk, s in rows if cc == c]; m = float(np.median(v)); r = m / ref
    flag = "" if .67 <= r <= 1.5 else "  <-- MIXEL"; bad += [c] if flag else []
    print(f"{c:9} {len(v):>3} {np.median(gs):12.2f} {m:17.3f}  {r:.2f}{flag}")
(ROOT / "output/audit").mkdir(exist_ok=True)
(ROOT / "output/audit/density.json").write_text(json.dumps([dict(zip(["cat", "id", "grid", "k", "screen"], map(lambda x: round(x, 4) if isinstance(x, float) else x, r))) for r in rows], ensure_ascii=False, indent=0), encoding="utf-8")
sys.exit(1 if bad else 0)
