from pathlib import Path
import re

# Bug A: render-concept.py 寫入時把模板字串的 $ 跳脫了，
# 讓 `rgb(\${186+v},...)` 變成字面文字 → CSS 顏色無效 → 廣場石板沒畫出來。
p = Path("src/pixel-world.js")
s = p.read_text(encoding="utf-8")
before = s.count("\\${")
s = s.replace("\\${", "${")
p.write_text(s, encoding="utf-8")
print(f"pixel-world.js: 修掉 {before} 個 \\${{ 跳脫")

# 同步修 render-concept.py，避免以後重跑又寫壞
q = Path("render-concept.py")
t = q.read_text(encoding="utf-8")
n2 = t.count("\\${")
t = t.replace("\\${", "${")
q.write_text(t, encoding="utf-8")
print(f"render-concept.py: 修掉 {n2} 個 \\${{ 跳脫")
