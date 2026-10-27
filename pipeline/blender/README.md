# Blender → 8 方向 sprite（免錢的第四條生圖路線）

2026-10-27 評估 [Sprixen](https://sprixen.com) 後決定**不買**，改用它的核心思路自己跑：
「**3D rig → 正交渲 8 方向 → 壓成像素**」。AI 生 8 方向走路最常壞在
「每個方向像不同角色」與「武器換手」，3D 渲圖在數學上保證 8 個方向是同一副骨架、
同一把武器，而且格子／腳底／色盤完全自己控、成本 0。

## 怎麼跑

```bash
# 1) 渲圖（8 方向 × walk 8 格 + attack 8 格 = 128 張 256×256 透明 PNG）
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P pipeline/scripts/blender/render_8dir.py -- output/blender8

# 2) 壓成遊戲規格（去背、硬邊、縮到 art 高度、腳底對齊、median-cut 32 色）
python pipeline/scripts/blender/pixelize_renders.py output/blender8 --game-size 23 --cell 102 --out output/blender8/sheet-walk.png
```

- `render_8dir.py`：程式組低模人形（2.8 頭身）＋骨架，兩段動作（walk / attack，首尾都回 guard 才能串連），
  8 台正交相機（仰角 35°，跟遊戲 3/4 俯視一致），Workbench 引擎＋關閉反鋸齒＋透明背景。
  注意：Blender 的相對路徑是相對「磁碟根」，腳本會自己轉絕對路徑。
- `pixelize_renders.py`：把渲圖轉成跟 `assets/monsters3` 同一套規格（格 = cell、腳底 = cell−8、alpha 0/255、32 色），
  可以直接跟現有 sheet 並排比，或餵給 `build_monster_8dir.py --walk-src`。

## 目前的限制（實話）

程式組出來的模型是**方塊人**。動作品質（膝蓋真的會彎、8 方向一致、武器鎖在右手）比程式化位移好，
但**畫風跟手繪的 21 隻魔物不同**。要真的拿來用需要：
1. 每隻魔物做一個 low-poly 模型（美術工作，或從既有 3D 素材改），或
2. 接受「3D 渲圖風」當成新一代怪物，整批一起換。

現況：21 隻仍用 `build_monster_8dir.py` 的程式化走路（archetype：biped / quad / blob / sway），
Blender 這條線留著當之後要做真走路／攻擊的工具。
