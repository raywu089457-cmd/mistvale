# T73: 弓手走路 pixelfx:改成遊戲實際弓手的外觀與側身姿勢

Status: done
Accept: auto

## Goal
Follow-up to T72 (`pipeline/scripts/pixelfx/vendor/moves/archer-walk.js`, `pipeline/scripts/pixelfx/archer-walk-skin.mjs`). Claude judged `output/pixelfx-archer-walk/compare.png`: T72 coloured the archer after HERO_ARCHER_001 (green tunic, orange scarf), but the game draws `assets/heroes/archer.png`, which looks different. Match the game's archer, not HERO_ARCHER_001, in both look and pose.

Look (sample every colour from the `actions.walk` row of `assets/heroes/archer.png`; drop all HERO_ARCHER_001 colours):
- pale blond / light hair, light skin;
- a beige-cream hooded cloak hanging from the shoulders and trailing behind him, swinging with the walk;
- dark brown leather tunic, trousers and boots; no green, no orange scarf;
- the longbow held low in the near hand, roughly level with the hip and angled forward-down, as in the reference. Not upright in front of the body.

Pose: he walks in profile to the right, chest leaning forward a little, with a clear stride (legs visibly apart at contact), arms swinging, and the cloak trailing. Not three-quarters towards the viewer and not upright: use the rig's `turn`/`yaw`/`lean` so the silhouette reads like the reference cells. Keep the 8 beats timed after the reference row, and keep pixelfx's pixel look (rig, outline, shading).

- `tools/checks/archer-walk-palette.mjs`: sample its reference colours from `assets/heroes/archer.png` (cloak beige, hair light, leather dark brown) instead of HERO_ARCHER_001, and fail if green tunic or orange scarf pixels remain.
- Keep `tools/checks/archer-walk-sheet.mjs` (8-frame loop, planted-foot ground line) passing.
- Re-export `assets/vfx-sheets/archer-walk.{png,json}`; regenerate `output/pixelfx-archer-walk/compare.png` (top: the 8 reference cells, bottom: the 8 new frames, same scale, numbered) and `walk.gif`.
- Still not wired into the game: no change to src/. Do not edit pixelfx's own `src/core/` files.
