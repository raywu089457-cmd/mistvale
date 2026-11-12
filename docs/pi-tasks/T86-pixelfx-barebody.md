# T86: pixelfx shared bare body on the stock rig (vendored core, material layers)

Status: done
Accept: node tools/checks/pixelfx-barebody.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

Gate: montage
Montage: output/pixelfx-character/barebody/compare.png

## Goal
One bare-body character on pixelfx's stock rig, shared later by every class; equipment comes in a later card as layers on top of it. Facts from scout T85 (`output/pi-results/T85.md`): pixelfx has no rest-sprite grid; `src/core/rig.js` draws a 3D skeleton through a z-buffer, `posed(pose)` returns per-pixel `src` (index in the 24x38 rest space W0xH0, -1 for weapon pixels), SHELL/CORE tones come from module-level DUMMY_PAL and `drawBody` has no hook. NEVER edit `C:/Users/ray/pixelfx` (the Accept checks `src/core` stays unchanged).

Build:
- A vendored fork of the pixelfx core files needed (rig.js, act.js and whatever they import) under `pipeline/scripts/pixelfx/character/core/`, changed only to (a) take a material function instead of DUMMY_PAL tones and (b) expose a gear pass hook for later (no gear drawn now). Keep the original geometry, skeleton, poses, z-buffer, ink and seams logic untouched.
- Materials as an ordered list of layers. Each layer maps (rest-space x, y from `src`, part: near/far limb, torso, head, weapon) to a colour or null; the first non-null from the top wins. The bare body is the bottom layer.
- Bare body look (exact values): outline/ink #1d1410; skin lit #f6c894, base #e4b78d, shade #c88f5f (far limbs keep pixelfx's one-step dim via a darker skin #9a6440 where it dims); seams #9a6440 instead of grey; plain shorts over the hip band and upper thigh (rest rows 18-23) in #5b4b3e with shade #463a30; a plain chest wrap over rest rows 11-14 in the same shorts colours; bald head (all skin), one 1 px #1d1410 eye on the face front at head mid-height; no chest mark (#f53cd1 gone), no weapon. No DUMMY_PAL grey anywhere.
- The walk: pixelfx's stock walk poses (use a generic stock walk move if one exists in `src/fx/moves/`, otherwise the poses of `src/fx/moves/archer-walk.js` without its bow and without its dead `skin`/`cloak` fields). Same frame count, fps, cell size and pivot as `export-sheet.mjs --actor` gives for that move.

## Files you may change
- pipeline/scripts/pixelfx/character/
- tools/checks/pixelfx-barebody.mjs
- output/pixelfx-character/barebody/

## Steps
1. Write `tools/checks/pixelfx-barebody.mjs` first; it must fail now (no sheet yet). It checks `output/pixelfx-character/barebody/barebody-walk.png/.json`: 8 frames (or the move's count); every frame's alpha mask equals the stock grey render of the same move/frame without the weapon (render it in the checker through the stock pixelfx checkout at `C:/Users/ray/pixelfx`, read-only); every opaque colour is in the palette above or the baked foot shadow; no #f53cd1, no DUMMY_PAL tone; every frame has >= 1 interior #1d1410 head pixel (the eye) and shorts pixels on both legs' hip band.
2. Vendor the core fork and add the material layers + empty gear hook.
3. Write `pipeline/scripts/pixelfx/character/export-actor.mjs` (body + gear list + move → sheet png/json, walk.gif, frames-6x.png) and `compare.png` = stock grey dummy idle | bare body idle | walk frames 0, 2, 4, 6, all at the same 6x scale with labels. Output only to `output/pixelfx-character/barebody/` (NOT assets/vfx-sheets: build.mjs inlines that folder into the game).
4. Run the Accept command.
