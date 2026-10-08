# BASE BODY SPEC — HUMANOID

所有人形英雄共用的骨架規則。比例照 SPRITE_VISUAL_BIBLE 第 6 節(**約 3 頭身 Q 版**:大頭、小身體、武器放大);
上線 sheet 的尺寸與對齊照第 9 節(128 格、站姿身高 64–90 px、腳底 y=118、軀幹中心 x=64);新管線母版照第 2 節(ground line y=92、軀幹軸 x=50)。

## 規則

- 同一角色所有格:頭大小、身體比例、手臂/腿長、腳底位置、軀幹軸不變。
- 裝備(盔甲、頭盔、披風)可以加厚輪廓,**不能改骨架**:肩線、腰線、腳底、頭的高度不變。
- 武器不算身高;握把位置用 anchor(WEAPON_SPEC)。
- 腳底一定貼 ground line,不准浮空或沉進地面。
- 怪物不套這副骨架,各自在 character_spec.md 寫 `BASE_BODY` 段落(比例照第 6 節:約 2 頭身,樹精約 2.5)。

## Anchor(每個角色 rig.json 都要有)

HEAD · BODY · LEFT_HAND · RIGHT_HAND · LEFT_FOOT · RIGHT_FOOT · WEAPON_GRIP · GROUND。
座標 = 關鍵姿勢的邏輯 px;每格的 anchor 由產生器依圖層位移換算後寫進 export json(母版座標)。
HEAD 要放在頭/頭盔本體中心(QA 04b 用它周圍 12×12 檢查頭部逐像素不變;羽飾、頭髮不要框進去)。
