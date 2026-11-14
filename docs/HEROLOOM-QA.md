# HEROLOOM QA — independent verification (task-3)

Verifier: `qa` (independent of the integration work). Date: 2026-11-14, 22:18–23:5x (Asia/Taipei).
Branch `experiment/heroloom`, HEAD `31bb69f` (working tree has ~650 dirty entries from other
slices; this task wrote **only** `docs/HEROLOOM-QA.md`, `pipeline/scripts/ui-audit/heroloom-shots.mjs`
and `output/heroloom-qa/**`).

Everything below was run against the **fresh** artifact built at 23:11:47
(`outputs/暮影村.html`, 2,967,953 bytes) served by `http://100.79.149.0:5024/`, which re-reads the
file per request. A stale mid-integration artifact (22:37) did hang at the loading overlay 67% once;
that was a stale-build artifact and is documented under "Residual observations", not a code failure.

## Verdict

**PASS for the heroloom integration against the task brief**, with one pre-existing, unrelated test
failure and a list of minor visual/UX residuals (below).

| Check | Command | Exit | Result |
| --- | --- | --- | --- |
| Asset pack | `node tools/checks/heroloom-assets.mjs` | 0 | **74 PASS** — 74 files · 46 part sheets (512×448) · 23 icons (32×32) · 8 actions · 22 layers · 12 slots · 8 anchor sets · 4 looks. (Brief said 66 PASS; the script actually prints 74, all green.) |
| Engine unit tests | `node test-heroloom.mjs` | 0 | `test-heroloom: 22 passed` |
| Whole test chain | `npm test` | **1** | Fails **only** at `test-paperdoll.mjs:1585` — pre-existing, another agent's DV2 effect art (see below). `test-pixel-game`, `test-overworld`, `test-landscape`, `test-village-nav` all PASS before it; `test-heroloom` is skipped by `&&`, verified separately. |
| Build | `node build.mjs` | 0 | `Built …/outputs/暮影村.html (2.83 MB) · media 274 files / 32.6 MB · inline 200 files · 316 paths`; `outputs/media/heroloom` = 73 files / 205.4 KB; `maker.html` not shipped (0 matches). |
| Verify quick | `npm run verify:quick` | **1** | 6 failures: the pre-existing `npm test` one above + 5 UI/button-layout checks (`fix-a-runhud`, `fix-a-cancelmove`, `fix-a-unitcard`, `fix-c`, `fix-d`). None executes the doll renderer; `FIX-D` is a browser crash. Details and attribution in §Verify:quick. |

### Pre-existing `npm test` failure (NOT ours, not fixed by this task)

```
> node test-pixel-game.mjs && node test-overworld.mjs && node test-landscape.mjs && node test-village-nav.mjs && node test-paperdoll.mjs && node test-heroloom.mjs
… all suites before test-paperdoll PASS …
FAIL Phase 6 G3/G4: effect types 2/3/4 wired where DV2 uses them (drawn only when the art ships); cry face (…hurt fallback at 1x)
AssertionError [ERR_ASSERTION]: punch effect <-> its src art
false !== true
    at test-paperdoll.mjs:1585:52
Node.js v24.13.1
```

Cause (confirmed by file mtimes, matches the Lead's note): `assets/paperdoll-dv2/src/effect_punch.png`
(20:45) and `effect_gunfire.png` (20:46) postdate `assets/paperdoll-dv2/paperdoll.json` (20:12), which
does not register `effects.punch` / `effects.gunfire`; `test-paperdoll.mjs` itself was modified at 22:33
by the concurrent DV2/cq-rig-timeline work. Full log: `output/heroloom-qa/npm-test.log`.
Per instructions this task left the DV2 pack and `test-paperdoll.mjs` untouched.

## Runtime evidence

Screenshot/probe script: `pipeline/scripts/ui-audit/heroloom-shots.mjs`.

```
node pipeline/scripts/ui-audit/heroloom-shots.mjs --tag=post        # full: game + doll=0 + phone + lab + probes
node pipeline/scripts/ui-audit/heroloom-shots.mjs --only=lab --no-doll0 --no-probe --tag=lab
```

Tagged run (fresh 23:11 build): 180 s, exit 0, `ok:true`.
Summary JSON: `output/heroloom-qa/summary-post.json` (lab: `summary-lab.json`).

**Page health:** 0 console errors · 0 pageerrors · 0 HTTP ≥400 · 0 failed requests, on every page
(`?preview=1`, `?preview=1&doll=0`, `?loom=1`, phone). Only warnings: AudioContext autoplay (pre-existing)
and a Canvas2D `willReadFrequently` hint caused by the QA script's own `getImageData` readback.

### In-game (desktop 1440×900)

* 7 hunters / 7 classes: `berserker, paladin, sorcerer, archer, assassin, priest, traveler`.
  **All 7 draw a heroloom doll** (`__mistvaleFacing().doll.act` present for every hunter), including
  `traveler` — which under the old DV2 pack fell back to sheets. (The brief's "8 classes" is stale: the
  game has 7 `CLASSES`; the heroloom *pack/lab* has 9 looks — `darkknight` and `warrior` are lab-only.)
* Forced poses (set `h.atkAt` / `h.skillAt`, then read the published doll action):
  * attack → `attack` (berserker, paladin, sorcerer, priest, traveler), `shoot` (archer), `thrust` (assassin)
  * skill → `cast` (sorcerer, priest), `shoot` (archer), `thrust` (assassin), `attack` (melee)
  i.e. the weapon-dependent row mapping works in the real render path.
* Boot/timing on this machine: boot 20.6 s (2.8 MB bundle + assets), doll `ready` **1,435 ms** after the
  world is interactive, first doll frame drawn **1,365 ms**. Cost at first appearance = fetch
  `character.json` + 46 part PNGs (205 KB total) + prewarm 9 idle cells; the draw path does not bake.
* Hunter roster portraits: 10 `<img data-portrait>` (7 cards + reuse), all `84×96` data URLs,
  2,178–2,686 chars, 2,620–4,270 opaque px → **none blank**, no card overlap.
  Screenshots: `post-game-desktop.png`, `post-game-heroes.png`, `post-game-heroes-crop.png`,
  `post-game-heroes-attack.png`, `post-game-heroes-skill.png`, `post-game-desktop-hunters.png`.

### Phone (480×900 @2x → 960×1800)

* 7 classes, all doll-drawn; doll `ready` 1,547 ms; boot 19.0 s. The default phone framing is the
  zoomed-out world view (villages heroes are tiny — pre-existing framing, not a heroloom regression);
  a staged close-up proves the dolls render on phone: `post-game-phone.png`, `post-game-phone-heroes.png`.

### `?doll=0` fallback

* `__mistvaleDoll()` → `{on:false}`, 7 hunters drawn, **0** with `.doll` → old hero-sheet renderer.
  Staged crop `post-game-doll0-heroes-crop.png` is visually the old sheet art (compare with the heroloom
  crop above). `PIXEL_ASSETS.heroloomBase` is still defined (harmless: the pack is only fetched when the
  doll is on). `PIXEL_ASSETS.paperdollClassesBase` is now `null` — intentional in this branch (only the
  heroloom base is published); the sheet fallback does not need the DV2 class pack.

### Engine probe (`__mistvaleDoll()` / `__mistvaleLoom`, via `page.evaluate`)

* Status: `{on:true, all:9, classes:[9 looks], ready:true, failed:null, failedCount:0, images:46,
  source:'heroloom', base:'media/heroloom/'}`.
* `covers()` true for **9/9** looks (incl. `traveler`, and lab-only `darkknight`, `warrior`).
* `compose(hero,{action,tick:1,dir})` over 9 classes × 6 actions (idle/walk/attack/skill/hurt/victory) ×
  4 dirs: **216/216 OK, 0 failures**. Crop widths 19–36 px (transparent columns trimmed), `heroHeight` 30,
  `footX`/`footY` always set → anchor contract intact, no null cells.
* Compose counters: 702 composes / 6,758.6 ms in the cold probe (~9.6 ms each, cell construction);
  hot path afterwards: hits 1,036 / misses 179, `cells` at 420 cap, `tinted` 57.
* `bakeRecipe()` (lab export / prewarm path, 512×448): 9 looks in **973 ms** total — archer 90.9,
  sorcerer 138.1, priest 111.9, paladin 18.7, berserker 128, assassin 163.5, traveler 0.6,
  darkknight 319.5, warrior 1.5 ms; `lastBakeMs` 1.4. `frameTable` matches the pack: idle row0 4f/200 ms,
  walk row1 6f/90, attack row2 6f/70, hurt row3 3f/100, jump row4 5f/90, cast row5 5f/110,
  thrust row6 5f/70, shoot row7 5f/100.

### Lab `?loom=1`

* Desktop **and** phone: panel mounts (`#heroloom-lab`), **8 action chips**
  (idle walk attack hurt jump cast thrust shoot), **9 class thumbs**
  (archer, sorcerer, priest, paladin, berserker, assassin, 旅人, darkknight, warrior), 4 direction buttons,
  3 selects, 7 checkboxes, 10 canvases (big stage + 9 thumbs), DV2 lab absent.
* Clicking each action chip changes `canvas.hl-big` (8/8 changed, 8 distinct hashes, fully painted);
  clicking each class thumb redraws the stage — `distinctThumbHashes = 9` (no two classes share art).
  Perf line renders ("bake … · cached 12 sheets · hits … · compose … · tinted … · cell 64×56·8cols · ready").
* Note: `globalThis.__heroloomLab` is **not exposed** (undefined), so the lab is verified through the DOM
  only; if the team wants scripted lab checks later, a small hook would help.
  Screenshots: `lab-lab-desktop.png`, `lab-lab-phone.png`.

## Verify:quick

`npm run verify:quick` ran 23:19 → 00:20 (≈61 min in this loaded environment; every check boots its own temp
server + headless Chrome, and a **second** verify run from another agent was writing the same
`output/ui-audit/*.txt` files concurrently). `output/ui-audit/verify-summary.md` is **stale** (mtime
2026-11-14 05:54, mojibake) and is not this run's verdict; the verdict below is the run's own stdout.

```
verify 2026-11-14 16:20(quick): 6 項失敗
PASS  build 2.83 MB (2s)
FAIL  npm test 11 項 PASS — AssertionError [ERR_ASSERTION]: punch effect <-> its src art (283s)   ← pre-existing, see above
PASS  獵人自主狩獵 出村 7/7 位、獵人擊倒 250 隻、流浪英雄擊倒 179 隻、倒下 1 次;村莊＋錢包 6300 → 10162 (114s)
PASS  村莊名牌 12 個情境 PASS (89s)
PASS  首領面板 8 項 ok (63s)
FAIL  出征 HUD — desktop: 撤退鈕點不到 locator.click: Timeout 2500ms exceeded. (125s)
FAIL  移動建築取消 — phone: 取消鈕中心點被別的元素蓋住 (115s)
FAIL  獵人小卡 — phone: 關閉鈕中心點被別的元素蓋住 (129s)
PASS  toast 位置 四種視窗×面板開/關 toast 不蓋按鈕中心、不在畫面中央、pointer-events:none;選滿 3 人有提示 (228s)
PASS  標題畫面 新玩家標題只有「開始遊戲」、歡迎對話框等標題關掉、回訪玩家保留繼續/重新開始、keydown capture 成對 (49s)
PASS  版面(手動操控/離線戰報/放置列/任務欄) 手動操控清單、離線戰報收下鈕、任務欄與難度色帶/日期標籤、放置列版面 (134s)
PASS  風格缺口(FIX-B) 175 項 ok (217s)
FAIL  FIX-C 面板 toast／資源條／切換建築 — D phone: #hv-left top 116/#left-panel top 168,預期 116/172 (201s)
PASS  toast 卡片 訊息是深色卡片（左側語意色條＋圖示）、五種種類與文字推斷都正確、滑入動畫、同時最多 4 則、3 秒自 (60s)
PASS  出征小隊 HUD 地下城與競技場進行中、面板關掉時主畫面有小隊 HUD（樓層／波數／階段、三人生命條與數字、競技場對手 (73s)
FAIL  FIX-D 橫向建築抽屜／面板 toast 蓋標題列／手動操控／對比 — Node.js v24.13.1 (336s)
PASS  Z1 外殼與頁籤列 18 項 ok (423s)
PASS  Z2A 獵人卡／名冊／新獵人暗帶／tooltip 65 項 ok (203s)
PASS  Z2D HUD／toast／引導／標題／橫向版面 85 項 ok (577s)
PASS  Z2B 建築詳情／建設／交易／倉庫／製作／委託／確認框／賣完導引 272 項 ok (230s)
詳細輸出:output/ui-audit/        EXIT=1
```

Failure evidence (`output/ui-audit/`):

* `fix-a-runhud.txt` — desktop/tablet/phone/land: `撤退鈕點不到 locator.click: Timeout 2500ms exceeded`,
  then "點撤退後地下城仍在進行".
* `fix-a-cancelmove.txt` — `phone: 取消鈕中心點被別的元素蓋住` + tap timeout + placement prompt still visible.
* `fix-a-unitcard.txt` — `phone: 關閉鈕中心點被別的元素蓋住`; `小卡蓋住縮放鈕 .square, .square, .square,
  #reopen-left.square`; tap timeout; land tap timeout.
* `fix-c.txt` — `D phone: #hv-left top 116/#left-panel top 168,預期 116/172` (4 px offset).
* `fix-d.txt` — hard crash, not an assertion:
  `page.evaluate: Target page, context or browser has been closed at Module.boot
  (tools/checks/fix-a-lib.mjs:36:112) at async file:///…/tools/checks/fix-d.mjs:186:89`.

Attribution (honest): these five are DOM/button-layout checks and do **not** exercise the doll renderer or any
heroloom code path; FIX-D died because the headless browser was closed mid-run (at that moment this machine had
~97 Chrome processes from concurrent agent work), i.e. infrastructure/resource contention. The remaining four are
UI overlap/tap problems in `pixel-ui` panels — observers should note that ~650 files are dirty in this tree from
other in-flight slices, so they are most plausibly concurrent-work regressions or environment contention rather
than heroloom fallout — **but this is not proven**, and they must be re-run on a clean tree/build before merge.
Full verify (`npm run verify`) was **not** run because `verify:quick` did not pass (AGENTS.md rule; the task also
said full verify only if quick passes). The heroloom-specific evidence above was unaffected: all doll pages
loaded clean with 0 console/page errors during the same period.

## Residual observations (ranked, none blocking)

1. **Lab layout on narrow screens (visual/UX, dev-only).** The panel is a fixed ~880 px wide widget;
   at 480 px viewport the right column (action chips `att`/`thr`, gear labels, info text) is clipped —
   see `lab-lab-phone.png`. `?loom=1` is a dev tool, not the shipped UI; if phone use matters, stack the
   columns or cap the width to `100vw`.
2. **Phone default framing** shows the zoomed-out world map, so in-game heroes are tiny there. This is the
   pre-existing phone framing (not caused by heroloom); dolls verified on phone at zoom 5.2.
3. **Pack weight when the doll is off.** `media/heroloom` (73 files / 205 KB) ships even with `?doll=0`;
   `PIXEL_ASSETS.heroloomBase` is still published. Only a build-size consideration, no runtime cost.
4. **`paperdollClassesBase` is now `null`** (was `media/paperdoll-classes/`). Looks intentional for this
   branch; the `?doll=0` sheet fallback still renders, but worth a conscious sign-off.
5. **Compose crop widths vary per frame (19–36 px)** because the crop trims transparent columns; the
   renderer compensates with `footX/footY`. No floating feet observed in any close-up.
6. **Stale-build boot hang (environment, not code).** On the 22:37:54 mid-integration artifact the page
   sat at the loading overlay 67% (phase 預熱角色素材) for 60 s+ with all 113 image requests complete and no
   errors; the 23:11:47 rebuild booted to 100% and hidden every time (desktop/phone/doll=0/loom). Always
   test a fresh build; the served page re-reads `outputs/暮影村.html` per request.
7. **`__heroloomLab` hook missing** (see Lab section) — optional automation nicety.

## Evidence paths

* Script: `pipeline/scripts/ui-audit/heroloom-shots.mjs` (`--tag=`, `--only=game,lab`, `--no-doll0`, `--no-probe`, `--allow-errors`; `TARGET=` env override; stdout = JSON summary, progress on stderr; exit 1 on real console/page errors).
* Summaries: `output/heroloom-qa/summary-post.json`, `output/heroloom-qa/summary-lab.json`.
* Logs: `output/heroloom-qa/npm-test.log`, `output/heroloom-qa/run-post2.log`, `output/heroloom-qa/run-lab.log`, `output/heroloom-qa/verify-quick.log`, plus verify child logs in `output/ui-audit/`.
* Screenshots (all `output/heroloom-qa/`): `post-game-desktop.png`, `post-game-heroes.png`,
  `post-game-heroes-crop.png`, `post-game-heroes-attack.png`, `post-game-heroes-skill.png`,
  `post-game-desktop-hunters.png`, `post-game-doll0.png`, `post-game-doll0-heroes-crop.png`,
  `post-game-phone.png`, `post-game-phone-heroes.png`, `lab-lab-desktop.png`, `lab-lab-phone.png`.
  Pre-integration baseline (old DV2 doll): `pre-*.png`, `summary-pre.json`.
