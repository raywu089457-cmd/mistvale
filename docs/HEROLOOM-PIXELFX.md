# HeroLoom 像素特效（pixelfx VFX）重製說明

> 對象：`assets/vfx-sheets/<id>.png` + `<id>.json`（24 張）、`pipeline/scripts/pixelfx/`、`tools/checks/pixelfx-style.mjs`。
> 分支：`experiment/heroloom`（worktree `heroloom-iso`）。最後更新：2026-11-15。

## 1. 一句話摘要

把 24 張舊 pixelfx 特效表全部就地重生一遍：造型、影格數、frameSize、pivot、fps、loop 都照舊（`src/pixel-world.js` 的 `drawVfxSheet()` 完全不用改），只重上色、加墨線、柔化核心，讓特效跟新的 HeroLoom 角色（64×56 格、約 30 px 高、暖色故事書像素風）同一套語言。24/24 通過新檢查器；檔案沒有變大（cinder-cyclone-iso 3.94 MB → 2.99 MB）。

## 2. 風格規則（`pipeline/scripts/pixelfx/heroloom-style.mjs`）

調色盤直接從 `assets/heroloom/character.json` 的角色 ramp 取樣，不是憑感覺調的：

- **墨線**：`#150d1b`（HeroLoom 全身共用描邊色）。
- **Ramp**：每個材質 6 階色階（皮膚、棕髮、藍/紅/綠/紫/黑/白布、黃、皮、黑皮）。VFX 只用其中 11 組 ramp 的聯集，**亮度上限 0.90**，所以 `#ffffff`、`#fafaf4`、`#fcecd0` 這些眼白/最亮膚色不會出現在特效裡——舊表的純白雷射核從此消失。
- **版本差異**：舊表大量使用 `#f8f8f8 / #f87028 / #d83020 / #f8e068`（冷白＋霓虹橘紅）；新表落在 `#e8e0c0 / #f0c8a0 / #b86830 / #b86848 / #904028` 這類暖奶油／餘燼色階。
- **火焰 ramp**：另外推導 7 階 `['#2a1218','#4a1a1c','#7c2a22','#b04a2a','#d97a3a','#f0b060','#f8dca0']`，中段保留橘、核心是奶油而不是純白。
- **墨線規則**（依「效果在遊戲尺度讀不讀得出來」分級）：用 8 鄰居 chamfer 距離找 alpha 邊緣，再用 5×5 最大值濾波估局部厚度 `t`。
  - `t>=4`（厚實形狀的最外圈）→ 實心 `#150d1b`。
  - `t>=2` → 往墨色混 51%（保留色相的柔邊）。
  - 第二圈 → 混 16%；內圈再亮一階（painterly 內光）。
  - `t<2` 的 1–2 px 細線／火花**不動**：在 k≈0.13 的遊戲尺度下把 1 px 星光壓黑會變成髒點，也吃掉打擊亮度。
- **禁止**：純黑 `#000000`（舊表邊緣會出現）、純白 `#ffffff`、洋紅/螢光綠外溢。三者在檢查器都是 FAIL 條件。

材質族群（`SHEET_FAMILY`；每張表用哪一族決定色階聯集）：

| 族群 | 表 |
| --- | --- |
| fire | cinder-cyclone, cinder-cyclone-iso, fireball, fireball-blast, flare, spell-charge |
| holy | crit-hit, haste, hit-spark, holy-hit, parry, feather-burst |
| heal | priest-heal |
| nature | gale-arrow, leaf-storm, root-snare, thorn-row, thorns |
| blood | berserk-hit, crit-spray |
| shadow | dark-cleave |
| physical | double-slash |
| wood | arrow, bird |

> 密度說明（老實講）：**frameSize 沒有變**，因為 `frameSize × k` 就是螢幕上的世界尺寸，改了就等於要動 `src/*.js`（本任務禁止）。「2× 細節」是靠像素處理達成的：6 階色階取代 2–3 階漸層、深淺兩圈描邊、內光亮階、柔化核心——同樣格子裡可讀的層次變多，而不是把圖放大。VFX 的 1 格約等於角色美術的 0.6 格，所以 VFX 2 px 墨線 ≈ 角色 1.2 px 描邊。

## 3. 這次改了哪些檔案

- `pipeline/scripts/pixelfx/heroloom-style.mjs`（新）－調色盤、族群對應、`styleFrames()`。
- `pipeline/scripts/pixelfx/export-heroloom.mjs`（新）－24 張表的重建 driver（`--all` / `--only id,id` / `--dry`）。
- `assets/vfx-sheets/*.png|json`（24 組，就地覆寫）－幾何契約完全不變（見 `output/heroloom-ext/pixelfx/export-report.json`）。
- `tools/checks/pixelfx-style.mjs`（新）－零依賴檢查器。
- 證據：`output/heroloom-ext/pixelfx/`（`before/` 原檔備份、`montage-*.png` 前後對照、`shots/` 遊戲內截圖、`export-report.json`）。

## 4. 如何重建（單張或全部）

pixelfx 有兩個 checkout，**不要混淆**：

| checkout | 用途 |
| --- | --- |
| `C:/Users/ray/pixelfx` | 上游（`PIXELFX_DIR`）：23 張一般特效 |
| `C:/Users/ray/Desktop/Claude code/pixelfx` | 含 `*-iso` 特效（`src/fx/**/*-iso.js`）：只有 `cinder-cyclone-iso` 用 |

```powershell
cd <worktree>
# 全部 24 張（約 50 秒）
node pipeline/scripts/pixelfx/export-heroloom.mjs --all

# 單張／幾張
node pipeline/scripts/pixelfx/export-heroloom.mjs --only fireball,cinder-cyclone-iso

# 只算不寫檔
node pipeline/scripts/pixelfx/export-heroloom.mjs --only hit-spark --dry

node build.mjs          # 重建 dist/暮影村.html（把 png+json inline 進 PIXEL_ASSETS.vfxSheets）
```

- `cinder-cyclone-iso` 是特例：Desktop checkout 的特效原檔後來改成 272×320 / pivot 136,258，但本分支出貨的是 240×400 / pivot 120,346，所以 driver 會先把 `fx.meta.size=[240,400]; fx.meta.origin=[120,346]` 釘住再 render（`output/heroloom-ext/pixelfx/probe-cinder-iso.mjs` 可重現）。
- driver 不把 `vendor/*.js` 複製進 checkout（那是 worktree 外的路徑）；本分支的 5 個 vendor 覆寫檔與 checkout 內容相同，所以沒有影響。
- 重建後跑檢查器與視覺對照：
  ```powershell
  node tools/checks/pixelfx-style.mjs --verbose
  node output/heroloom-ext/pixelfx/montage.mjs fireball --scale 2 --cols 9 --out output/heroloom-ext/pixelfx/montage-fireball.png
  node output/heroloom-ext/pixelfx/shots.mjs --base http://127.0.0.1:5026/   # 需要 server.mjs 在跑
  ```

## 5. 檢查器：`tools/checks/pixelfx-style.mjs`

零依賴（`node:fs`/`node:path`；PNG 解碼用 repo 自己的 `pipeline/scripts/pixelfx/character/png-io.mjs`）。PASS/FAIL，任何 FAIL 就 exit 1。

每張表驗：PNG 解得開、`meta.pixelfx` 六個欄位齊、fps 一致、**canvas == columns×frameW x rows×frameH**、json frames 長度／格線位置／每格 `frameSize` 一致、duration 對 `1000/fps`、pivot 在格內、每格 alpha bbox 在自己的格子裡、`meta.image`/`meta.size` 對得上、frameTags 存在。

風格量化門檻（寫在檔案開頭，可調）：

| 項目 | 門檻 | 理由 |
| --- | --- | --- |
| `PALETTE_DIST` | 40（加權 RGB） | 每個實心色都必須落在該族群 HeroLoom ramp 附近 |
| `MAX_LUMA` | 0.93 | 不允許純白核／比奶油更亮 |
| 純黑／純白 | 0 | 舊表冷白＋黑邊的直接指標 |
| 洋紅／螢光綠 | 0 | 「alien spill」偵測（高飽和、亮度 >0.45 的洋紅 285–345°，或酸綠 95–165°） |
| 實心色數 | 4–512 | 太低＝糊成一片；太高＝雜訊。階梯＋墨線混合會讓正常表面落在 100–350 |
| 可見格 | ≥40% 且 ≥1 格 | 首尾空影格是合法的 lead-in/lead-out，但不能整張空 |
| 墨線覆蓋 | **只量不擋** | 細線／光暈特效刻意不上墨線（見 §2）；量到的數字印在 `--verbose`，厚實邊目標 ≥55% |

`frameSize` 不是 16 倍數**不算失敗**：那是既有出貨契約（arrow 112×32、fireball 136×56、priest-heal 80×104…），改了會位移所有特效的世界尺寸。檢查器只在 `--verbose` 註記「legacy cell size」。

目前結果：

```
pixelfx-style: 24 sheets
24/24 sheets PASS, 0 FAIL     (exit 0)
```

實測色盤統計（`--verbose`）：所有實心色到 ramp 的最大距離 < 40（多數為 0，因為 `styleFrames()` 就是吸到 ramp 上）；每張表 0 個純黑、0 純白、0 洋紅外溢。

## 6. 前後對照與遊戲內截圖

前後對照（上＝舊表、下＝新表，皆由 `montage.mjs` 產生，原檔從 `output/heroloom-ext/pixelfx/before/` 讀）：

- `montage-arrow.png`、`montage-fireball.png`、`montage-fireball-blast.png`、`montage-holy-hit.png`
- `montage-leaf-storm.png`、`montage-thorns.png`、`montage-crit-hit.png`、`montage-dark-cleave.png`
- `montage-hit-spark-s4.png`、`montage-priest-heal-s3.png`、`montage-spell-charge-s3.png`、`montage-cinder-iso.png`

遊戲內截圖（1440×900／402×712，經真實 UI 進入手動操控模式讓鏡頭跟隨角色；有 VFX 命中、技能、治療、反擊與 `?loom=1` 實驗室）：

- `output/heroloom-ext/pixelfx/shots/`（`shots/report.json` 記錄每張的場景、影格、繪製到的特效、console 錯誤、失敗請求）
- contact sheet：`shots/contact-desktop-a.png`、`contact-desktop-b.png`、`contact-desktop-c.png`（桌機）、`contact-phone-loom.png`（手機＋`?loom=1` 實驗室）

## 7. 已知限制／後續（需要 Lead 決定，不在本任務範圍）

1. **frameSize / k 沒動**：VFX 的世界尺寸維持出貨值（例如箭矢仍以 k=0.19 畫成 21 px 寬）。若要更「大顆」的特效，得改 `src/pixel-world.js` 的 `ARROW_VFX_K / FIRE_K / SPARK_K` 等常數——本任務禁止改 src，交給 Lead 決定。
2. **iso 全家只有 cinder-cyclone-iso 在 24 張清單裡**；`output/vfx-iso/` 的其他 `*-iso` 表（blade-hit-iso、heal-aoe-iso…）不是 `assets/vfx-sheets/` 的成員，這次沒重繪。若也要 HeroLoom 化，可擴充 `export-heroloom.mjs` 的 RECIPES。
3. **細線特效（hit-spark、parry、priest-heal、spell-charge）墨線覆蓋低是設計選擇**：它們本來就是發光／細線，加墨線會變髒。若美術方向改成「全部加粗描邊」，改 `heroloom-style.mjs` 的 `t` 門檻（例如 `t>=2` 就叫實心墨）再 `--all` 重出，代價是光暈會變硬。
4. **透明度**：`styleFrames()` 只處理 alpha 邊緣，不動 alpha 本身；半透明光暈的柔邊保留。若之後要做「厚描邊版」，建議先看 `montage-priest-heal-s3.png` 這種光暈表的對照再決定。
5. **build 不歸本任務**：`dist/暮影村.html` 的最終重建由 Lead 統一執行（本分支中途已建過一次驗證，最終版以 Lead 的 build 為準）。
