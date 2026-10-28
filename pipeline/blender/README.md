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

---

# 紙偶：立體骨架 ＋ 貼上 2D 素材 ＋ 正交(2D)鏡頭

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P pipeline/scripts/blender/paper_doll_8dir.py     -- output/l0veyou/mon8/kobold output/paperdoll/kobold --neck=0.42 --hip=0.66
```

做什麼：把**已經有的手繪 8 方向待機圖**切成四塊（頭 / 身含手臂 / 左腿 / 右腿），
貼在 3D 骨架的骨頭上（每個部位剛性綁一根骨），骨頭在 3D 空間轉（螢幕平面內 = 繞 Y 軸），
再用**正交相機**拍回來 → 得到「真骨架帶動、但保留原畫」的平面動畫。素材風格 100% 不變、成本 0。

- 切法不需要美術標註：頸線 = 內容高度 38%（`--neck`）、髖線 62%（`--hip`），腿在中線左右切開。
- 8 個方向共用同一副骨架／同一份幾何，只換貼圖（`image.filepath` + reload）→ 每個方向都是同一個角色。
- 走路 = 兩腿繞 Y 軸前後擺（±22°）＋髖部上下顛；攻擊 = 軀幹後仰蓄力 → 前傾出手 → 回正。
- 材質：Image Texture(Closest) → Emission，Alpha → Mix(Transparent) —— 少了這個透明混合，
  透明像素會被畫成黑色方塊（第一版就踩到）。EEVEE、taa=1、filter=0.01 → 硬邊像素。

已知限制：
1. **長袍角色（牧師）看不到腿** —— 袍子是一整塊，腿擺動被蓋住；這類角色用程式化的身體起伏反而正確。
2. 髖部接縫在擺動大時會露出一點縫（剛性切塊）。要更好就把腿塊往上多留 2–3 px 並讓身體塊後畫（或做羽化權重）。
3. 目前產出是 `output/paperdoll/`，還沒接進遊戲；接法是 `pixelize_renders.py` 壓成格子 → `build_monster_8dir.py --walk-src`。

---

## ❌ 2026-10-27 結論：紙偶走路**不採用**

接進 5 隻（kobold/wolfman/moss/snowman/mummy）實際看過後，使用者判定效果不好 → 全部退回程式化走路。
原因（實測）：
1. 切塊在蓬毛／岩石／花冠這種「一整團」的剪影上會露缺口（雖然加重疊補得掉，但形狀已經被切斷）
2. 腿很短的魔物（狼人靴子、雪人底球）擺動半徑太小，看起來像整隻在抖，不像走路
3. 只有腿細長、四肢分明的（地精、木乃伊）勉強成立 —— 這樣只有 2 隻能用，不值得維護兩套管線

程式碼與說明留在這裡當紀錄；**遊戲目前 21 隻全部用 `build_monster_8dir.py` 的程式化走路**
（archetype：biped / quad / blob / sway）。要重啟這條線的話，前提是先有 low-poly 模型（第 1 節的路線），
而不是拿平面圖切塊。

---

## ❌ 2026-10-27 低模 3D 路線：管線通，但**模型不行**

`render_kobold.py` 用基本幾何體照 sprite 造型拼一隻地精（大頭＋尖耳＋礦工帽＋蠟燭＋圍裙＋小鎬），
顏色直接取 sprite 代表色，走同一套 walk/attack → 8 方向正交渲圖 → `pixelize_renders.py` 壓成格子規格。
**結果**：壓到 79 px 後看起來是「一堆方塊」，跟手繪 sprite 差很多（`output/kobold3d/_compare_vs_sprite.png`）。

兩個實測結論：
1. **管線沒問題**（骨架、8 方向一致、武器不換手、格子規格都對），壞在「用程式拼方塊」取代真正的建模。
2. 迭代三次（比例、顏色 gamma、零件互相重疊補縫）都救不回來 —— 低模要好看需要真正的建模
   （subdiv 雕刻＋retopo，一隻幾小時），或改買/套 low-poly 素材包（風格會變成 3D 渲圖風）。

**建議**：走路要更好，優先序是
① 維持現況（手繪 sprite + 程式化走路，已上線）
② PixelLab v3 文字動畫（`output/l0veyou/mon8_walk/WALK-PROMPT.txt`，約 16 次生成／隻）
③ 真的找人/自己建模再走 3D 渲圖
