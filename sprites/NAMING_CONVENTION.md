# NAMING CONVENTION

全部小寫、底線分隔、一定帶版本 `vNN`。禁止 final / final2 / new / new_final / test 這類名字。

| 類型 | 格式 | 例 |
|---|---|---|
| 角色 ID | `HERO_<CLASS>_<NNN>` / `MONSTER_<TYPE>_<NNN>` / `NPC_<ROLE>_<NNN>` | HERO_ARCHER_001 · MONSTER_GOBLIN_001 |
| 角色資料夾 | `characters/<ID>/` | characters/HERO_ARCHER_001/ |
| 動畫 sheet | `<id>_<animation>_<ver>.png` | hero_archer_001_idle_v01.png |
| 動畫單格 | `<id>_<animation>_<ver>_f<NN>.png` | hero_archer_001_idle_v01_f03.png |
| 動畫 metadata | 同 sheet 檔名 `.json` | hero_archer_001_idle_v01.json |
| 遊戲 1x | `<id>_<animation>_<ver>_1x.png` | hero_archer_001_idle_v01_1x.png |
| 圖層 | `<id>_layer<NN>_<name>_<ver>.png` | hero_archer_001_layer08_weapon_v01.png |
| 關鍵姿勢 | `<id>_key_<ver>.png` | hero_archer_001_key_v01.png |
| 武器 | `weapon_<type>_<NNN>_<ver>.png` | weapon_sword_001_v01.png |
| 裝備 | `equipment_<type>_<set>_<NNN>_<ver>.png` | equipment_helmet_archer_001_v01.png |
| 提示詞 | `<id>_<what>_prompt_<ver>.txt` | hero_archer_001_design_prompt_v01.txt |
| QA | `qa/<animation>_qa.json` | qa/idle_qa.json |

## 版本

- `v01`, `v02`, …:每次修改**升版號、不覆蓋**舊版(舊版檔案留著)。
- 每次升版寫進 `sprites/CHANGELOG.md`(修了什麼、為什麼)。
- `rig.json` 的 `version` = 產生出來的檔案版本。
