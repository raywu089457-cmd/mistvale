# 第四階段：角色圖集（獵人六職業）— 2026-09-30

## 做了什麼

用概念圖生成的六職業角色圖集（berserker/ranger/paladin/sorcerer/darkknight/priest）
接進遊戲的 `heroSprite()`（遊戲唯一的角色取圖入口：獵人、死亡姿勢、縮圖、立繪全走它）。

## 推到正式專案的檔案

```
mistvale/
├── src\pixel-world.js      ← heroSprite 圖集優先 + 程序繪製 fallback
├── src\pixel-ui.js         ← +3 行：pixel-assets-ready 時清 portraitCache
├── build.mjs               ← +8 行：內嵌 hero 圖集
└── assets\  (新增 4 個)
    ├── hero@1x.png + manifest   （離線縮到 28x34，執行時 1:1 貼上）
    └── hero@2x.png + manifest
```

備份：`../mistvale-backup-20260930-214000`（含建置產物）

## 修掉的三個隱藏 bug（都是「沒報錯但沒生效」型）

1. **立繪快取不失效**：`pixel-ui.js` 的 `portraitCache` 在圖集載入前就把程序繪製的立繪
   烤成 dataURL 永久快取，UI 立繪永遠是舊圖。實測證據：新版立繪跟舊版**逐像素相同**。
   修法：監聽 `pixel-assets-ready` 清快取重畫。
2. **spriteCache 在載入前就快取**：圖集載入前建的角色 sprite 會被快取住永遠不換。
   修法：圖集 onload 時 `spriteCache.clear()`（spriteCache 只存角色圖，清空安全）。
3. **快取 key 不分 LOD**：key 沒帶 LOD，放大後快取裡還是 1x 的圖，2x 永遠用不到。
   修法：key 加 `hf.sc`。

另外：圖格 41x57 是在瀏覽器裡用最近鄰縮到 24x34 → 糊掉（跟建築當年同問題）。
改為離線 LANCZOS 先縮好（`resample_hero.py`），執行時 1:1 貼上，不再有執行時縮圖。

## 實測數字（probe.py）

```
errors : []
角色   : ready=True, lods=[(1,6),(2,6)], use={calls:63, atlas:7, proc:0}
```

- `atlas=7, proc=0`：圖集載入後所有角色 sprite 都走圖集，零個程序繪製。
- 視覺驗證：獵人詳情面板大立繪 + 左側名冊 3 個立繪（`real-hero-verify.png`），
  跟舊版逐像素比對確認換圖成功。
- `npm test` 全 PASS。

## 注意事項

- 遊戲職業 id 就是圖集 key（berserker/ranger/paladin/sorcerer/darkknight/priest，
  見 `pixel-data.js`）。`data.js` 裡的 knight/ranger/mage 是舊版資料，不用理。
- 獵人預設「出征中」不在村裡，村內實際行走圖沒截到；但 `heroSprite` 是唯一入口，
  立繪與村內走的是同一條路（已由計數器證明全走圖集）。
- @2x 目前的角色畫布固定 28x35，放大時換 @2x 只是來源取樣更細，畫布大小沒變。

## 2026-09-30 21:30 左右正式專案被別的管道改過

`overworld.js`(21:30)、`pixel-style.css`(21:32，+41 行主題樣式 :root 變數等)。
不是這個 session 改的。推版時已確認三個覆蓋檔只含角色差異、沒蓋掉那些改動，
建置產物已含雙方改動，測試 PASS。
