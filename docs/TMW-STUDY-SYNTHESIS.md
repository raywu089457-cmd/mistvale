# TMW 研究統整：哪些值得搬進暮影村（2026-11-02）

資料來源：pi 研究報告 `output/tmw-anim-study.md`（T17）、`output/tmw-ui-study.md`（T18）、實測 `output/text-size-census.md`（T19）。
以下是 Claude 對照我們現況後的判斷，不是照抄報告。TMW 美術與字型授權不同，只借結構，不搬素材。

## 一、先講結論

| 方向 | 判斷 | 理由 |
|---|---|---|
| TMW 的「裝備分層 + include 共用動作表」 | **現在不做** | 我們的英雄是每職業一張烘好的 sheet，10/31 已刻意移除配件（`4d40754`：「同職業完全一致」）。分層要重做整條美術管線，收益只有「換裝看得到」。 |
| TMW 的「色盤染色（一張圖 → 124 件物品）」 | **做，用在魔物** | 魔物 4 種 × 5 動作，換色就能做出區域變種 / 菁英怪，不用再生圖。這是報告裡投報率最高的一項。 |
| 每格不同延遲（per-frame delay） | **已經有了** | `pixel-world.js` 的 `strikeDur / release / impact / ownTiming` 就是同一件事（出手快、命中格長、收招慢）。報告第 10 條只需補文件。 |
| 武器 / 職業用名字選攻擊動作 | **補規格，小** | `WEAPON_SPEC.md` 加 `attackAction` 欄位，之後新職業不用逐格填 Attack Position。 |
| UI：語意化色彩 / 字級 token | **做，分批** | 我們 735 個不同色碼、0 個字級 token；TMW 51 個名字管全部顏色，換主題只換色盤。 |
| UI：圖示只用整數倍尺寸 | **做** | 32×32 原圖被縮成 17/19/21/22/27/29px，非整數縮放是像素糊掉的主因。 |
| UI：DejaVu 字型、黑字白底、20px 標題列 | **不借** | 沒有中文字形；我們是深色木質面板；觸控需要大標題列。 |

## 二、動畫：要做的三件事（依序）

1. **`sprites/ANIMATION_SPEC.md` 補兩段文件（S）**
   - 格號表：每個動作 → 第幾格，其他規格引用它，不再各自抄數字（TMW `model/neutral.xml` 的作法）。
   - 寫明「出招節奏由 sheet JSON 的 `strikeDur/release/impact` 決定，執行期的 `HIT_STOP` 不再拉長」——把已有的機制寫成規格，避免兩套計時打架。
2. **魔物色盤變種（M）**
   - 規格：`EQUIPMENT_SPEC.md` 之外，在魔物規格加 `dye` 區塊：通道（例如主體 / 眼睛）+ 色階。
   - 實作：建置期換色（pipeline 腳本產出變種 sheet）比執行期換色簡單，也不碰戰鬥程式。這部分是美術管線腳本 → Sonnet high；不需要 Opus。
   - 用途：區域變種、菁英怪、Boss 換色，對應地城難度。
3. **`WEAPON_SPEC.md` 加 `attackAction`（S）**：武器 / 職業宣告用哪個攻擊動作名稱。

**留待以後（等決定恢復可見裝備時才做）**：圖層共用格號、逐格位移表、頭盔遮頭髮的 `replace` 規則。這三條報告寫得很好，但前提是有分層，現在沒有。

## 三、UI / 字型：要做的事（低風險 → 高風險）

**第 1 批：不動任何像素（可派 pi，驗收用 verify）**
- `:root` 加字級 token：`--fs-tiny/small/body/h3/h2/title`、`--lh-body/tight`（T16 第 1 步一直沒落地）。
- 狀態條顏色 token：`--bar-hp / mp / exp / …`，現有顏色不變，只是改成引用。
- `--ui-panel` 九宮格切片統一（現在 15 跟 16 混用；按鈕 12 跟 10 混用）。
- 定義 `.rarity` 一直在讀但從沒定義的 `--rarity` 顏色。

**第 2 批：小幅放大（要看截圖）**
- 桌機仍是 10px 的內文：`.region-card p`、`.visitor-card p`、`.visitor-card .trait`、`.stock-item>span`、`.trade-footer span`、`.setting-note` → 11px。
- 狀態條數字加 1px 黑色描邊（TMW 作法），任何底色都讀得到。

**第 3 批：要人眼判斷**
- 圖示尺寸收斂到 16 / 24 / 32（2/3 倍可接受）。
- 內文 8 種相近米色 → 3 個 token（`--text / --text-dim / --text-mute`）。
- 舊訊息用「顏色變暗」取代 `opacity`。

**手機最小字級**：見第四節實測結果再決定。

## 四、手機字級實測（T19）——推翻 T18 的 P1 第 4 項

真瀏覽器量測（`output/text-size-census.md`，完整 verify 全過）：
- **手機三種尺寸 × 10 個畫面：小於 11px 的文字 = 0**，最小就是 11px。T18 說的「97 個選擇器 10px」是靜態推算，實際都被 ~1062 行的「phone pass A」區塊蓋成 11px，或元素在手機上根本不顯示。
- **桌機 1440×900（村莊 + 設定）：只有 9 個元素是 10px**——底列 8 個快捷鍵 `kbd` + 首領按鈕的「召喚首領」。
- 量測沒涵蓋世界地圖、訪客等彈窗，所以第三節第 2 批的 `.region-card p`、`.visitor-card p` 是否仍為 10px，要在那幾個畫面補量再改。

結論調整：
1. **手機字級不用改**，T18 第 4 項取消。
2. 桌機要修的只有「召喚首領」10px → 11px（`kbd` 是快捷鍵提示，10px 可接受）。
3. 真正的問題不是字太小，而是 **CSS 結構**：同一個字級在 base、手機區塊、桌機區塊、修補區塊各宣告一次，靠「誰在後面」決定。這正是 TMW「token 集中管理」要解決的事，所以第三節第 1 批（加 token）優先度提高，之後新規則一律用 token，再逐步把修補區塊收回 base。

## 五、建議執行順序

| 順序 | 內容 | 誰做 | 驗收 |
|---|---|---|---|
| 1 | UI 第 1 批（token，不動像素）+「召喚首領」改 11px | 派 pi | `npm run verify` + small-text 三手機仍 0 |
| 2 | `ANIMATION_SPEC.md` 格號表 + 計時說明；`WEAPON_SPEC.md` 加 `attackAction` | Claude（規格文件是美術權威，要人看） | 你過目 |
| 3 | 世界地圖 / 訪客畫面補量字級，再做 UI 第 2 批 | 派 pi 量 → Claude 改 | 截圖 + layout 0 FIX |
| 4 | 魔物色盤變種（規格 + 建置腳本） | Sonnet high | 生成變種 sheet + audit 腳本 |
| 5 | UI 第 3 批（圖示整數倍、文字色 token） | Claude + 你看截圖 | 截圖比對 |
| 暫緩 | 英雄裝備分層 | 等你決定要不要恢復可見裝備 | — |

**2026-11-02 執行結果**：1–5 全部完成（卡片 T20–T27，各卡 verify 全過、手機 <11px = 0、layout 0 FIX）。圖示實際是 `[data-icon]` 背景框（T25 的 canvas 尺寸是死碼，T27 改正）；280 個可見圖示框現在全是 16/24/32px，>36px 的大徽章保留。分層 demo：`node output/layer-demo/serve.mjs 5377`。魔物變種：`output/monster-dye/contact.png`（22 種 × elite/frost，遊戲尚未載入）。
