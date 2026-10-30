# T05: world-map region art + bestiary lines (snow, mountain, desert, birch)

> Task card for pi. Same job Claude already did for village/meadow/forest/taiga; copy that pattern.

## Goal
In the world map modal, the region cards for snow, mountain, desert and birch each show a wide illustration strip, plus one bestiary line per monster that lives there.

## Files you may change
- `output/l0veyou/prompts/region-{snow,mountain,desert,birch}.txt` (new)
- `output/l0veyou/region-{snow,mountain,desert,birch}-v1.png` (generated)
- `assets/ui/px-region-{snow,mountain,desert,birch}.*` (written by the prep script)
- `src/lore.js`: add entries inside `MONSTER_LORE` only

## Steps
1. **Check the l0veyou browser.** Run `node "C:/Users/ray/Desktop/Claude code/l0veyou-test/check.mjs"`; `hasLoginText` must be false.
   - If the port is not open, start the browser as in T03 step 1.
2. **Write 4 prompt files.** Each one is the text of `output/l0veyou/prompts/region-style.txt`, followed by one line `Region: ...` in English.
   - Base the scenery on that region's `description` in `src/overworld.js`.
   - Put one of its monsters small in the scene. The monsters are listed in `REGION_MONSTERS` in `src/lore.js`; their names are in `MONSTER_NAME`.
   - Look at `output/l0veyou/prompts/region-meadow.txt` for the expected length.
3. **Generate**, one at a time, all in the foreground:
   ```
   export REF="$PWD/assets/ui/px-banner-dungeon.png"
   for n in snow mountain desert birch; do node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/region-$n.txt output/l0veyou/region-$n-v1.png "" 16:9; done
   ```
   If the daily quota is used up or a run fails twice, stop and report.
4. **Crop.** Run `python -X utf8 pipeline/scripts/l0veyou/prep_regions.py snow mountain desert birch`; it must print 4 lines.
5. **Bestiary lines.** Add 12 entries to `MONSTER_LORE` in `src/lore.js`, one per monster of these 4 regions (`REGION_MONSTERS.snow/mountain/desert/birch`).
   - Format: `id:'句子',`, matching the existing entries.
   - Each line is Traditional Chinese, 6–26 characters (the test enforces this).
   - Each line says one vivid thing about how that monster behaves or fights, in the same tone as the existing 9 lines.
   - Write original lines only. Do not copy from existing games or books.
6. Run `npm run verify:quick` in the foreground. The first line must say 全部通過 ("all passed").
7. **Write `output/pi-results/T05.md` now**, before step 8.
8. Screenshots: `node pipeline/scripts/ui-audit/shot-worldmap.mjs snow`. It writes `output/ui-audit/shots/wm-desktop.png` and `wm-phone.png`. Do not judge how they look.

## Acceptance
- `verify-summary.md` first line says 全部通過 ("all passed").
- 4 files exist: `assets/ui/px-region-{snow,mountain,desert,birch}.webp`.
- `MONSTER_LORE` has 21 entries in total.

## Report (output/pi-results/T05.md)
- The 4 prompt `Region:` lines and the 12 bestiary lines (copy them in)
- The text of `verify-summary.md`
- Problems hit, or "none"

## Do not
- Change other files, commit, push, spend PixelLab credits, or send Telegram messages.
