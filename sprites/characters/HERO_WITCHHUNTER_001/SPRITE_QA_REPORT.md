# HERO_WITCHHUNTER_001 — SPRITE QA REPORT

自動 QA(`sprite_qa.py` idle、`sprite_qa_dyn.py` 動態、`make_dir.py` 正/背面):

| 動作 | 結果 | 備註 |
|---|---|---|
| idle | PASS | 22 項 |
| walk | PASS | 15 項 |
| attack | PASS | 14 項 |
| hurt | PASS | 15 項 |
| death | PASS | 13 項 |
| idleDown | PASS | make_dir 8 項 |
| walkDown | PASS | make_dir 8 項 |
| idleUp | PASS | make_dir 8 項 |
| walkUp | PASS | make_dir 8 項 |

人工檢查(2026-10-08,Claude(放大圖目視);看遊戲 sheet 全部動作列,2× 放大):

| 項目 | 結果 | 說明 |
|---|---|---|
| 13/14 多/少肢體 | PASS | 每格兩手兩腳;正面左靴被右腿遮住一部分,但不缺 |
| 15–17 重複武器/浮空裝備/破剪影 | PASS | 連弩每格只有一把;羽飾、皮包、弩在四方向都連在身上 |
| H 手部/武器連接 | PASS | 側面攻擊 8 格握把都連著手;背面弩在左手側、正面弩在右手側,四方向一致 |
| V VFX 不遮角色 | PASS | 動作表內沒有烘入特效,箭矢由遊戲特效繪製 |
| 四方向腳底貼地 | FAIL | 背面已修(兩腳縫對齊軸線、高的左腳拉長貼回地線,四方向 walk 落腳格都到地線)。正面左靴仍比右靴高 2 px(來源圖),walk 抬右腳時右靴左側 3 px 會被留在左組;需要新的正面關鍵表或另做分腳設計才能修 |

修正紀錄:idle 06/07 失敗:木製連弩的弩身飽和度 60–90,金屬偵測(飽和<30)量不到(回傳 None)→ rig 加 weaponSatMax 90、weaponMetalMin 100→40(只這隻角色);量到的弩身 8 格偏移 (0,−2)、尺寸 15×10 完全一致。walkUp 地線失敗:背面弩在左側,bbox 置中把身體與兩腳推到軸線右側,左腳落在右半邊 → make_dir 新增 dirFeetGapAxis(兩腳之間的縫對到軸線,背面 dx=−6),來源圖左腳高 2 px 另以 plant_feet 拉長該側腿段貼回地線。

