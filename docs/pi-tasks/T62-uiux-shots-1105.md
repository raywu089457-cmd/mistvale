# T62: UI/UX 全畫面截圖拼圖(2026-11-05)

Status: done
Type: scout

## Goal
Take fresh screenshots of every UI screen with the current code (including uncommitted changes) and build two labeled montages that Claude can judge in one look each:
- `output/ui-audit/uiux-1105/montage-desktop.png`: desktop 1440x900.
- `output/ui-audit/uiux-1105/montage-phone.png`: phone 390x844.

Cover the same screens as `output/ui-audit/shots/` (hud, build, selectBuilding, hunters, hunter, recruit, dispatchHunters, quests, trade, craft, inventory, dungeon, arena, boss, worldmap, difficulty, help, settings), plus any modal or panel added since then. Reuse the existing screenshot tooling (verify.mjs, the T54/T27 shot scripts) instead of writing a new one if it already works. Label every tile with the screen name. Keep each montage at or under 3000 px on its long side so text stays readable when the montage is viewed at full size.

Also write `output/ui-audit/uiux-1105/notes.md`, at most 25 lines:
- the current layout-checker and small-text results (FIX/READ counts per device);
- any screen that failed to open;
- which screens changed visibly since the 10-30 shots.

Do not change any file under src/.
