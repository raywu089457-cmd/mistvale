# T74: 弓手走路:l0veyou 圖拆部件套到 pixelfx 骨架

Status: failed
Accept: auto

## Goal
Make the archer walk with pixelfx's own rig, wearing the look of the l0veyou image `output/l0veyou/archer-idle-pixelfx-v1-1x.png` (32x50, side view facing right; magenta fringe already removed in `output/pixellab-anim-test/archer-pixelfx-walk/east-source.png`, 64x64 canvas). The user wants the animation done in pixelfx, not by PixelLab.

How: cut the l0veyou sprite into parts and let pixelfx's skeleton move them (the way pixelfx's actor already draws fixed part sprites on its bones, see `drawActor`/`stockActor` in C:/Users/ray/pixelfx `src/core/actor.js` and `rig.js`; T72/T73's `pipeline/scripts/pixelfx/archer-walk-skin.mjs` shows how the project repaints the rig after `renderAct`).
- Parts taken from the image as pixel sprites: head+hair, torso, cloak, the near arm with the bow, far arm, thighs/shins/boots (split at hip and knee). Store the cut parts and their pivots as a small vendored asset next to the move (e.g. `pipeline/scripts/pixelfx/vendor/moves/archer-walk-parts.png` + json).
- A new looping move `moves/archer-walk-l0v` (vendored under `pipeline/scripts/pixelfx/vendor/moves/`) that reuses the 8 walk poses of `moves/archer-walk` (T73) and places each part on its bone every frame: legs follow the hip/knee/foot of the rig, arms swing, body bobs, the cloak trails and sways a pixel or two, the bow stays low in the near hand. Pixel-exact: no smoothing or anti-aliasing; rotate a part only in steps that keep crisp pixels (prefer re-placing over rotating, or nearest-neighbour), keep the dark outline closed.
- Frame 0 at rest must look like the l0veyou image (same silhouette and colours).
- Export with `export-sheet.mjs --actor` to `assets/vfx-sheets/archer-walk-l0v.{png,json}` (do not overwrite `archer-walk`).
- `output/pixelfx-archer-walk-l0v/compare.png`: top row the l0veyou source image once, then the 8 new frames, same scale (4x), numbered; plus `walk.gif` (125 ms per frame).
- A checker under tools/checks/ asserts: 8-frame loop, planted foot on one ground line (from boot pixels, not the shadow), every frame's palette stays within the source image's colours (no grey rig pixels left), no semi-transparent pixels, and the legs really alternate (the two feet swap front/back between frames 0 and 4). It must fail before the work.
- Not wired into the game: no change to src/. Do not edit pixelfx's own `src/core/` files.
