# T72: 弓手走路 pixelfx:換成弓手配色並對照遊戲實際走路圖

Status: in-progress
Accept: auto

## Goal
Follow-up to T71 (`moves/archer-walk`, `pipeline/scripts/pixelfx/vendor/moves/archer-walk.js`). Its review and Claude's look at the montage found:
the reference was the wrong sheet, the pixelfx actor is still pixelfx's grey stand-in mannequin, and the checker's ground line measures the shadow.

- Reference = what the game draws: `drawSheetHero` uses `heroSheets['archer']` = `assets/heroes/archer.png` + `archer.json`, `actions.walk` row (8 cells). Re-pose the 8 walk keyframes after that row (contact / passing / up / down beats, stride, arm swing, bob, how the bow is carried).
- Make the actor read as the Mistvale archer, not a grey mannequin: brown spiky hair, skin face, orange scarf, green tunic, brown belt/trousers/boots, quiver on the back, longbow in hand. Sample the colours from `assets/heroes/archer.png`. Do it through the actor/palette object pixelfx already accepts (`stockActor`/`drawActor` in the pixelfx checkout C:/Users/ray/pixelfx `src/core/actor.js`), or a vendored helper next to the move; do not edit pixelfx's own `src/core/` files.
- Keep pixelfx's look (its pixel rig, outline and shading ramps); only colours, proportions within what the rig allows, and the props change.
- `export-sheet.mjs --actor`: pass `actor:true` to `renderFrames` whenever the flag is set (today it is ignored for an effect without `act`).
- Re-export `assets/vfx-sheets/archer-walk.{png,json}`; regenerate `output/pixelfx-archer-walk/compare.png` (top: the 8 `assets/heroes/archer.png` walk cells, bottom: the 8 new frames, same scale, numbered) and `walk.gif`.
- Fix `tools/checks/archer-walk-sheet.mjs`: the ground line must come from the planted foot's contact pixels, excluding the contact shadow and the bow, so a foot lifting off fails. Also assert the frames are no longer the grey palette (e.g. a minimum share of green tunic and orange scarf pixels sampled from the reference).
- Still not wired into the game: no change to src/.
