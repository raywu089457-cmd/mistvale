# FOLDER STRUCTURE

```
sprites/
├── SPRITE_PRODUCTION_PIPELINE.md  通用製作方法(不含畫風/尺寸)
├── SPRITE_VISUAL_BIBLE.md   暮影村專案參數 + 畫風
├── BASE_BODY_SPEC.md        骨架比例 + anchor
├── ANIMATION_SPEC.md        每個動畫的格數/layout/時間/結構
├── EQUIPMENT_SPEC.md
├── WEAPON_SPEC.md
├── SPRITE_QA_CHECKLIST.md
├── FOLDER_STRUCTURE.md
├── NAMING_CONVENTION.md
├── CHANGELOG.md             所有角色的版本紀錄
├── characters/
│   └── <ID>/                     例:HERO_ARCHER_001
│       ├── character_spec.md      ID/職業/體型/武器/色盤/動畫清單
│       ├── sprite_checklist.md    PHASE 01–14 逐項勾選
│       ├── rig.json               關鍵姿勢來源、圖層遮罩、anchor、動作曲線(產生器的唯一輸入)
│       ├── SPRITE_QA_REPORT.md
│       ├── visual_reference/      核可的關鍵姿勢
│       ├── concept/               設計提示詞、設計稿
│       ├── layers/                關鍵姿勢各圖層(Layer 01–10)
│       ├── idle/  walk/  attack/  skill/  hurt/  death/   每個動畫的母版 sheet + frames/
│       ├── weapon/  equipment/    這個角色專屬的武器/裝備
│       ├── qa/                    sprite_qa.py 的輸出(json、剪影、縮圖)
│       └── export/                遊戲匯入:母版 sheet + json(anchor、色盤、時間),game/ 是 1x
├── equipment/{helmets,armor,gloves,boots,capes,shields,accessories}/
└── weapons/{sword,axe,spear,bow,staff,dagger,shield}/
```

工具:`pipeline/scripts/sprites/`(流程見 Visual Bible 4.1):make_prompts_keys / gen_keys / chk_keys、make_prompts_dir / gen_dir / chk_dir、
new_rig / set_keysheet_rig / mon_rig、unfake、make_idle、make_rigged、make_anim、make_dir、sprite_qa、sprite_qa_dyn、export_game。
角色資料夾另有 `idleDown/ walkDown/ idleUp/ walkUp/`(正面/背面)。魔物 ID:`MONSTER_<TYPE>_001`。
原始 AI 生圖放 `output/l0veyou/`(原封保存),來源記在 rig.json `source`。
上線 sheet 在 `assets/heroes/`、`assets/monsters3/`、`assets/villagers@*`(格式見 Visual Bible 第 9 節)。
