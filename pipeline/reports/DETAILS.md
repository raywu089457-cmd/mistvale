
---

# 第二階段:地圖細節圖集(LUNA MAX)

## 產出

用 `gpt-5.6-luna` + `model_reasoning_effort=max` 生成,1 張 = 12 個物件,耗時 1 分 32 秒。

**A/B 兩版,選了 B:**

| | A 有烤死的草地 | B 只有物件 |
|---|---|---|
| 雪地/沙漠/針葉林 | ❌ 綠色草地穿幫 | ✅ |
| 格式 | RGB 洋紅底 | **真透明 RGBA** |
| 等角斜率 | 1.90~2.06(教科書級) | 不適用(刻意沒有地面) |
| @1x 大小 | — | **474 KB** |

A 版 9 格有地基的物件裡 8 格斜率 1.90~2.06 —— 等角 2:1 的理論值就是 2.0,
只有橡樹底盤是圓的(0.18/0.40)。**LUNA MAX 一次就達到這個水準**;
之前掛 CheapRouter 的模型是 0.01~3.85 亂跳。

## 已整合(8 種型別)

| 圖集 key | 遊戲型別 | 世界外框(沿用原尺寸) |
|---|---|---|
| pine / oak / birch / snowpine | `tree`(依 `variant % 4`) | 50x72 x size |
| boulders | `rock` | 13x10 |
| outcrop / cave / ruin | `outcrop` / `cave` / `ruins` | 38x17 / 38x38 / 38x28 |
| signpost | `signpost` | 17x21 |
| well | `well` | 90x91 |
| lamppost | `lamp` | 8x24 |

繪製方式:manifest 的精確 rect → **contain** 進世界外框(等比,不拉伸)。
atlas 畫成功就跳過程序繪製,失敗自動退回舊路徑。

## 退回程序繪製(1 種)

**圍欄不能用。** 遊戲是「單柱 + 橫桿」反覆排列成連續柵欄,
但圖集給的是「兩柱一段」的完整護欄板 —— 排起來會變一段一段的鋸齒。
要用的話得另外生一張「單柱 + 左右短橫桿」的可拼接單位。

**教訓:生成前要先問「這個物件在遊戲裡是獨立擺放,還是重複排列成線?」**
重複排列的單位必須是可拼接的片段,不能是完整的成品。

## 驗證

| 檢查 | 結果 |
|---|---|
| console 錯誤 | **0** |
| 細節圖集 ready | true |
| 細節繪製次數 | **170**(全部走 atlas,退回程序繪製後) |
| 建築圖集 | 1x=40, 2x=0 |

截圖:
- `detail-final-ab.png` — 水井 + 燈柱的前後對照(改善最明顯)
- `fence-zoom.png` — 圍欄為何退回(兩柱一段 vs 單柱排列)
- `detail-A-vs-B.png` — 有地面 vs 無地面
- `detail-view-b.png` — 最終採用的圖集

## 檔案

```
proj/assets/details@1x.png / .manifest.json     474 KB
proj/assets/details@2x.png / .manifest.json     1.6 MB
proj/src/pixel-world.js.pre-detail.bak          改前備份
build.mjs                                        多 8 行(detail 圖集注入)
```

建置產物:`14.70 MB → 17.46 MB`(+2.76 MB,主要是 @2x 的 base64)

## 貴在哪裡

@2x 佔了大部分體積,但只有放大到 2.2 倍以上才會用到。
若不需要放大細節,把 `build.mjs` 的 `detailsAtlas2x` / `detailsManifest2x` 兩行拿掉
就能省下約 2.2 MB。
