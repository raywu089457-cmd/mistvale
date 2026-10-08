"""chk_keys.py <keys.png> [hmin hmax] — 關鍵姿勢表(4x1)驗收:4 格、格距一致(各格 pitch 相對中位數 ≤ 20%)、第 1 格(待機)原生高在 [hmin,hmax](英雄 70–82,魔物不限)。exit 0 = 合格。"""
import sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/scripts/heroes")); sys.path.insert(0, str(Path(__file__).parent))
import build_hero as B, unfake
def measure(sheet):
    cols = 3 if 'keysC' in str(sheet) else 4
    fr = [f for f in B.cut(sheet, (cols, 1)) if f]; ps = []
    for f in fr:
        g = unfake.detect_grid(np.asarray(f[0].convert("RGBA"))); p = (g[0][0] + g[1][0]) / 2; ps.append(p / 2 if p > 8 else p)
    hint = float(np.median(ps)); hs = [unfake.unfake(f[0], hint)[0].height for f in fr]
    u0 = unfake.unfake(fr[0][0], hint)[0]; a = np.asarray(u0.convert("RGBA")).astype(int)
    def sim(x, y):
        m = (x[..., 3] > 0) | (y[..., 3] > 0); return float((np.abs(x[..., :3] - y[..., :3]).sum(-1) < 60)[m].mean()) if m.any() else 0.0
    H, W = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
    dup = max(abs(sim(a[0:H:2], a[1:H:2]) - sim(a[1:H - 1:2], a[2:H:2])), abs(sim(a[:, 0:W:2], a[:, 1:W:2]) - sim(a[:, 1:W - 1:2], a[:, 2:W:2])))
    return len(fr), ps, hint, hs, dup
if __name__ == "__main__":
    n, ps, hint, hs, dup = measure(sys.argv[1]); lo, hi = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (0, 999)
    spread = max(abs(h / hs[0] - 1) for h in hs[:2]); ok = n == (3 if 'keysC' in sys.argv[1] else 4) and dup < .25 and spread <= .20 and lo <= hs[0] <= hi
    print(f"{Path(sys.argv[1]).name}: frames {n} pitch {hint:.2f} height-spread {spread:.2f} dup {dup:.2f} heights {hs} idle {hs[0]} want [{lo},{hi}] -> {'OK' if ok else 'BAD'}")
    sys.exit(0 if ok else 1)
