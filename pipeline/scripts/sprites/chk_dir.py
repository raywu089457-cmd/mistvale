"""chk_dir.py <name-dir.png> — 正面/背面關鍵表驗收:剛好 2 格、兩格高度差 ≤ 12%、寬高比合理(不是側面躺平)。exit 0 = 合格。"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline/scripts/heroes"))
import build_hero as B
fr = [f for f in B.cut(Path(sys.argv[1]), (2, 1)) if f]
hs = [f[0].height for f in fr]; ws = [f[0].width for f in fr]
ok = len(fr) == 2 and abs(hs[1] / hs[0] - 1) <= .12 and all(w < 2.2 * h for w, h in zip(ws, hs))
print(f"{Path(sys.argv[1]).name}: frames {len(fr)} heights {hs} widths {ws} -> {'OK' if ok else 'BAD'}")
sys.exit(0 if ok else 1)
