# T37: souls remnant anim

Status: done
Type: scout
Accept: node -e "const s=require('fs').readFileSync('docs/research/SOULS-REMNANT-ANIM.md','utf8');if(s.length<1500)process.exit(1)"

## Goal
分析 Steam 遊戲 Soul's Remnant 的角色動作與裝備動畫設計,寫成中文研究報告 docs/research/SOULS-REMNANT-ANIM.md,供暮影村美術/動畫規格參考。只讀遊戲檔,不修改、不執行遊戲。

## Files
- 讀(唯讀): "C:\Program Files (x86)/Steam/steamapps/common/Soul's Remnant/"(路徑含撇號與空格,務必加引號)
- 寫: docs/research/SOULS-REMNANT-ANIM.md(唯一輸出)
- 對照(只讀): sprites/ANIMATION_SPEC.md、sprites/EQUIPMENT_SPEC.md、sprites/WEAPON_SPEC.md

## Steps
1. 盤點安裝目錄:判斷引擎(看 exe、data 資料夾、.pck/.assets/.win/www 等)、檔案類型統計、總大小。
2. 找角色/裝備/武器素材:sprite sheet、atlas、動畫定義(json/xml/.anim/.tres/.plist)。若已打包無法直接讀,記錄打包格式,只用明文設定檔與檔名推論;不要安裝或下載解包工具。
3. 角色動作:動作種類(idle/walk/run/attack/hurt/death/skill…)、每動作幀數、方向數(4/8/鏡像)、單幀尺寸、fps 或幀時長。
4. 裝備動畫:分層疊圖(paper-doll,同步幀)還是預烘焙;武器與手部對位方式(錨點/offset 表);換裝是否改剪影;攻擊特效是否獨立圖層。
5. 每項結論標註證據(路徑、檔名樣本、尺寸);實證與推論分開標示。
6. 最後一節「對暮影村的借鑑」:對照 sprites/ 三份 SPEC,列 3–6 條可採用做法與差異。
7. 不要把遊戲素材複製進專案,報告只放文字與少量檔名。
