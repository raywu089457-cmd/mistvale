# T88: pixelfx bare body: complete body in 4 walk directions

Status: done
Accept: node tools/checks/pixelfx-barebody-4dir.mjs && node tools/checks/pixelfx-barebody.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

Gate: montage
Montage: output/pixelfx-character/barebody/compare-4dir.png

## Goal
T86 built the shared bare body on a vendored fork of pixelfx's rig (`pipeline/scripts/pixelfx/character/`: `core/` fork with material layers, `barebody.js`, `walk.js`, `export-actor.mjs`; checker `tools/checks/pixelfx-barebody.mjs`; output `output/pixelfx-character/barebody/`). It only walks to the right. Make the bare body walk in all four directions the game uses, with a complete body in every frame. NEVER edit `C:/Users/ray/pixelfx`; keep the existing right-facing sheet and its checker passing unchanged.

Directions (the game's hero sheet names, see `assets/heroes/archer.json` actions `walk`, `walkLeft`, `walkDown`, `walkUp`):
- right = the current T86 walk, pixel-identical.
- left = the right walk mirrored horizontally (pivot mirrored too).
- down = facing the camera (front view): the body turned toward the viewer using the rig's own yaw/turn (`STAND.yaw`, `q.turn` in `core/rig.js`), walking toward the camera: legs step in depth, arms swing in depth, both arms and both legs visible side by side, face with both eyes.
- up = facing away (back view): same, turned away, back of a bald head (no eyes), both arms and both legs visible.
Down/up must come from the 3D rig (turning the skeleton or the camera), not from redrawing pixels by hand. If the fork needs a yaw/camera option for that, add it to `core/` (geometry stays the same for yaw 0, so the right walk is unchanged).

Complete body, every frame of every direction: head, neck, torso, both upper arms, both forearms, both hands, both thighs, both shins, both feet are each drawn (each rig part has >= 2 pixels; in side views the far arm/leg may be partly covered but still >= 2 pixels); one closed #1d1410 outline around the figure; no holes inside the body; no stray pixel groups detached from the body (one 8-connected opaque component besides the foot shadow); palette = the T86 bare-body palette only.

Output to `output/pixelfx-character/barebody/` (not assets/vfx-sheets): `barebody-walk-4dir.png/.json` (one row per direction in the order down, up, right, left, 8 frames each, same cell/fps/pivot convention as T86), `walk-down.gif`, `walk-up.gif`, `walk-left.gif`, and `compare-4dir.png` = 4 rows (down, up, right, left) x frames 0, 2, 4, 6 at 6x with labels. Write `tools/checks/pixelfx-barebody-4dir.mjs` (it must fail before the work): row count 4, frame count 8, right row equals the T86 sheet pixel for pixel, left row equals the mirrored right row, every rig-part present per frame (use the fork's per-pixel part info), single connected body, closed outline, palette, down frames have 2 eye pixels and up frames 0. Update `output/pixelfx-character/index.html` so the bare-body card plays all four directions side by side (down, up, right, left); leave the archer card as it is.
