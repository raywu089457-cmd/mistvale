# EQUIPMENT SPEC

資料夾:`sprites/equipment/{helmets,armor,gloves,boots,capes,shields,accessories}/`

## 每件裝備必須

- 遵守 BASE_BODY_SPEC 的骨架(肩線、腰線、腳底、頭高不變);只加厚輪廓,不改比例。
- 同一個視角(側面朝右)、同一個像素密度(邏輯格 ×4)、同一套描邊規則。
- 色盤:裝備用到的顏色必須在角色 16 色內;換色版只在「色相獨佔」的材質組換(見 build_hero.py `SWAP` 的做法)。
- 以**圖層**存在:對應 Layer 03 Armor / 04 Helmet / 05 Gloves / 06 Boots / 07 Cape / 09 Shield。

## 每件裝備的資料(`equipment_<type>_<name>_<nnn>_<ver>.json`)

| 欄位 | 說明 |
|---|---|
| id | `EQUIPMENT_HELMET_KNIGHT_001` |
| layer | 03–09 |
| fitsBody | 適用的 base body(`HUMANOID`) |
| anchor | 掛在哪個 anchor(HEAD / BODY / LEFT_HAND…)與偏移 |
| perAnimation | 每個動畫/每格相對 anchor 的位移(或 `follow: BODY`) |
| palette | 用到的色號 |

## 現況

尚未拆出獨立裝備檔:上線角色的盔甲/頭盔/盾都畫在 sheet 裡。真正可替換的裝備需要「同一底身 + 分件生成」(AI 逐格對不齊,必須走關鍵姿勢 + anchor 疊圖)。

## 染色通道 (Dye channels)

一張 sheet + 一條色階 = 很多變種（借 TMW 的作法，見 `docs/TMW-STUDY-SYNTHESIS.md`）。
**建置期換色**：管線先產出變種 sheet，執行期不換色；`src/` 目前不載入這些檔。

- 設定檔：`sprites/dye/monster-dyes.json`
- 腳本：`pipeline/scripts/recolor_monster.py`（Python + Pillow）
- 產出：`output/monster-dye/<monster>-<variant>.png` 與同名 `.json`（原 json 加一個 `dye` 區塊，其餘欄位照抄）、`output/monster-dye/contact.png`（每隻魔物取第 0 格：原圖 / elite / frost）

### JSON 格式

```json
{
  "rules": { "alphaMin": 8, "outlineLuma": 0.14, "satMin": 0.10, "lumaPad": 0.0 },
  "monsters": {
    "boar": {
      "hueCensus": "0-30 (79%)",
      "variants": {
        "frost": { "channels": [
          { "name": "hide", "hue": [338, 46],
            "ramp": ["#081420","#10283c","#1b4560","#2c6c8d","#55a3bf","#9ad7e8","#edfbff"] }
        ] }
      }
    }
  }
}
```

| 欄位 | 說明 |
|---|---|
| `monsters.<key>` | 對應 `assets/monsters3/<key>.png` 與 `.json` |
| `variants.<name>.channels` | 這個變種要換的通道，1–2 個為主；先比對到的通道優先 |
| `channels[].name` | 通道名（`hide` / `leaves` / `cap`…），只寫進產出 json 的 `dye` 區塊 |
| `channels[].hue` | 色相窗，單位度；`[lo, hi]`，`lo > hi` 表示跨 0（例如 `[338, 46]`）。`[0, 360]` = 全色相，給整片去飽和的魔物（雪兔、雪人） |
| `channels[].ramp` | 色階，hex，**由暗到亮**（2 段以上，建議 6–7 段）；匹配像素的明度會重新取樣到這條 ramp |
| `channels[].satMin` | 選填，覆寫 `rules.satMin`（灰白魔物用 0.0，才會整隻上色） |
| `channels[].outlineLuma` | 選填，覆寫 `rules.outlineLuma` |
| `monsters.<key>.hueCensus` | 備註用：這張 sheet 的色相普查結果（`--histogram` 印出來的），說明 hue 窗怎麼挑的 |

`rules`：`alphaMin` 視為透明的 alpha 門檻、`outlineLuma` 低於此明度視為描邊不動（預設 0.14）、
`satMin` 低於此飽和度不動（骨頭 / 牙 / 眼白，預設 0.10）、`lumaPad` 收斂明度對應（預設 0，不動）。

### 換色規則（`recolor_monster.py`）

1. **alpha 一個 byte 都不動**，`a < alphaMin` 的像素連 RGB 也不碰。
2. 明度 < `outlineLuma` 的近黑描邊 / 陰影不動；飽和度 < `satMin` 的灰白不動（骨頭、牙、眼白）。
3. 色相落在通道窗口內的像素 → 取明度，映射到該通道 ramp；明度以**整張 sheet** 正規化，所以每一格與 ramp 的關係一致（第 0 格不會比第 40 格亮）。
4. 腳本每產出一個檔就自我檢查並印一行：`OK <monster>-<variant>.png size=… alpha=identical`；尺寸或 alpha 不同就印 `FAIL` 並以非 0 結束。

### 現況

22 隻魔物 × 2 變種（`elite` 深紅 / 金、`frost` 冰藍 / 淡紫），共 44 個變種；`--all` 全部重生（約 3.5 分鐘）。
色相窗是先用 `--histogram` 印出每張 sheet 的色相分佈才挑的。兩個已知的取捨：
已經結冰的魔物（`icebeetle` / `snowman` / `yeti` / `snowhare`）的 `frost` 與原圖很接近，屬預期；
`wolfman` 的灰盔甲幾乎沒有飽和度，靠最後一個全色相通道（`hue [0,360]`, `satMin 0.03`）上色。

```bash
python pipeline/scripts/recolor_monster.py assets/monsters3/boar.png sprites/dye/monster-dyes.json elite
python pipeline/scripts/recolor_monster.py --all
python pipeline/scripts/recolor_monster.py --histogram        # 色相普查，挑窗口用
```

尚未接入執行期：`src/pixel-world.js` / `src/pixel-game.js` 不讀 `output/monster-dye/`，也不讀 json 的 `dye` 區塊。
要讓遊戲載入變種是另一張卡（會動到渲染與資料），不在本規格範圍。
