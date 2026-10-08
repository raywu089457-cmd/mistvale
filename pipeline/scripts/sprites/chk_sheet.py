"""chk_sheet.py <sheet.png> <cols> <rows> <idle_native_h> [partner_sheet]
AI 每張表畫的像素大小不一致(同角色 idle 86 高、walk 46 高)→ 生完先量:最高那格的原生高(unfake 後)要在 idle 高度 0.85–1.2;
有 partner(同動作的 a 表)時,改成要求格距(pitch)跟 partner 差 ≤15%(b 表可能全是倒地姿勢,量高度沒意義)。exit 0 = 合格,1 = 重生。"""
import sys
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/scripts/heroes")); sys.path.insert(0, str(Path(__file__).parent))
import build_hero as B, unfake
def measure(sheet, cols, rows):
    fr = [f for f in B.cut(sheet, (cols, rows)) if f]
    ps, hs = [], []
    for f in fr:
        im = f[0]; g = unfake.detect_grid(np.asarray(im.convert("RGBA"))); p = (g[0][0] + g[1][0]) / 2; ps.append(p / 2 if p > 8 else p)
    hint = float(np.median(ps))
    for f in fr: hs.append(unfake.unfake(f[0], hint)[0].height)
    return len(fr), hint, max(hs)
if __name__ == "__main__":
    sheet, cols, rows, ih = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
    n, p, h = measure(sheet, cols, rows)
    if len(sys.argv) > 5:
        _, p0, _ = measure(sys.argv[5], cols, rows); ok = abs(p / p0 - 1) <= .15; print(f"{Path(sheet).name}: frames {n} pitch {p:.2f} vs partner {p0:.2f} -> {'OK' if ok else 'BAD'}")
    else:
        ok = n == cols * rows and .85 <= h / ih <= 1.2; print(f"{Path(sheet).name}: frames {n} maxH {h} / idle {ih:.0f} = {h / ih:.2f} -> {'OK' if ok else 'BAD'}")
    sys.exit(0 if ok else 1)
