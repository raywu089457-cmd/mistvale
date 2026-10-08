# MONSTER_WOLF_001 — SPRITE QA REPORT

自動 QA(`sprite_qa.py` idle、`sprite_qa_dyn.py` 動態、`make_dir.py` 正/背面):

| 動作 | 結果 | 備註 |
|---|---|---|
| idle | PASS | 21 項 |
| walk | PASS | 14 項 |
| attack | PASS | 14 項 |
| hurt | PASS | 14 項 |
| death | PASS | 13 項 |
| idleDown | PASS | make_dir 8 項 |
| walkDown | PASS | make_dir 8 項 |
| idleUp | PASS | make_dir 8 項 |
| walkUp | PASS | make_dir 8 項 |

人工檢查(2026-10-07,Claude(放大圖目視);看遊戲 sheet 全部動作列,2× 放大):

| 項目 | 結果 | 說明 |
|---|---|---|
| 13/14 多/少肢體 | PASS | 每格手腳數正確 |
| 15–17 重複武器/浮空裝備/破剪影 | PASS | 無 |
| H 手部/武器連接 | PASS | 無武器;四方向的裝備左右一致(背面 = 正面鏡像關係) |
| V VFX 不遮角色 | PASS | 攻擊閃光已拿掉,殘留特效不蓋本體 |

