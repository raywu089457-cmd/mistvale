"""把遊戲實景的色調／構圖往概念圖（title.png）對齊。

依 `mistvale_compare.py` 的色彩統計，主要落差是：
  1. 道路太灰（#aaa996）→ 概念圖是暖米 (#d8c0a8 附近)
  2. 廣場太小、色太淡 (186,182,161) → 概念圖是暖米 (208,176,160)
  3. 雕像太小
  4. 地表色太冷綠（已在 overworld.js 改 BIOME_PALETTE）

改完請重新 npm run build。
"""
from pathlib import Path

P = Path(__file__).parent
world = P / "src/pixel-world.js"
s = world.read_text(encoding="utf-8")
before = s

# ── 1. 道路：暖一點、寬一點 ───────────────────────────────────────────────
# 舊: diamond(gc,x,z,.52,.52, stone?'#aaa996' : snow?'#b8c5bf' : '#b6a275')
s = s.replace(
    "diamond(gc,x,z,.52,.52,roadStyle(x,z,roads)==='stone'?'#aaa996':biome==='snow'?'#b8c5bf':'#b6a275')",
    "diamond(gc,x,z,.60,.60,roadStyle(x,z,roads)==='stone'?'#d8c0a8':biome==='snow'?'#b8c5bf':'#c9a877')",
)
# 石板的亮面也調暖
s = s.replace("rand()>.5?'#c9c3a6':'#939a85');pixel(gc,p.x+dx,p.y+dy,5,1,'#dbd1b0');",
              "rand()>.5?'#e4d0b2':'#b0a184');pixel(gc,p.x+dx,p.y+dy,5,1,'#f0e2c6');")

# ── 2. 廣場：放大、調暖 ───────────────────────────────────────────────────
s = s.replace(
    "for(let z=-3.5;z<8;z+=.5)for(let x=-14;x<-2;x+=.5){if(((x+8)/5.7)**2+((z-2)/5.2)**2>1)continue;const p=worldPos(x,z),v=Math.floor(rand()*24);diamond(gc,x,z,.28,.28,`rgb(${186+v},${182+v},${161+v})`);pixel(gc,p.x-3,p.y+2,5,1,'#929c8a');}",
    "for(let z=-5;z<10;z+=.5)for(let x=-17;x<1;x+=.5){if(((x+8)/7.2)**2+((z-2)/6.6)**2>1)continue;const p=worldPos(x,z),v=Math.floor(rand()*22);diamond(gc,x,z,.30,.30,`rgb(${214+v},${186+v},${156+v})`);pixel(gc,p.x-3,p.y+2,5,1,'#a68d67');}",
)

# ── 3. 雕像放大 ───────────────────────────────────────────────────────────
s = s.replace(
    "drawSprite(sp,p,54,54*sp.height/sp.width,6);return;}",
    "drawSprite(sp,p,74,74*sp.height/sp.width,8);return;}",
)

world.write_text(s, encoding="utf-8")

# 逐項驗證
checks = [
    ("道路色 #d8c0a8", "#d8c0a8"),
    ("道路寬 .60,.60", "diamond(gc,x,z,.60,.60"),
    ("廣場範圍 -5<z<10", "for(let z=-5;z<10"),
    ("廣場暖色 214+v", "rgb(${214+v}"),
    ("雕像 74", "drawSprite(sp,p,74,74"),
]
print(f"pixel-world.js: 改動 {len(before)} -> {len(s)} bytes")
for name, needle in checks:
    print(f"  {'OK ' if needle in s else 'FAIL'} {name}")
