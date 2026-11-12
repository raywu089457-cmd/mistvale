# T85: scout: pixelfx stock character template for a shared bare body + equipment layers

Status: failed
Type: scout
Accept: n/a

## Goal
Read-only scout of the pixelfx checkout `C:/Users/ray/pixelfx` (never edit it) and of `pipeline/scripts/pixelfx/export-sheet.mjs`. We will build ONE bare-body character on pixelfx's stock character template (shared by every class), then equipment sets drawn as layers that follow the same skeleton; first set = archer default gear, shown as a walk animation. Answer, with file and function names (no line numbers):
1. The stock character template: where the rest sprite lives (`STAND` in `src/core/rig.js`, 24x38 grid?), its exact grid size, the colour/legend of each cell, and which cells belong to which body part (head, torso, near/far arm, near/far leg, hands, feet). Are there several stock characters (the green archer, the purple mage, others)? Are they separate rest grids or palette/overlay variants of one grid? Where are they defined?
2. How `posed(pose)` / `posedParts` / `skeleton` turn rest cells into posed pixels: what `src`, `ink`, `color` mean, how hidden (back) limbs and draw order are handled, and how a second grid in the same rest space could be posed with the same skeleton (is there an API for an overlay/layer grid, or would we call `posed` per layer and composite?).
3. Weapons: how `WEAPONS` attach a weapon to a hand (bow especially), draw order front/back, and whether a bow + string already exist.
4. The stock walk move: which file, its frame count and fps, and the exact command to export it as a sheet with `export-sheet.mjs --actor` (does the `--actor` mode still work after the archer-specific repaint block was removed?).
5. Recommend a file layout for: `barebody` rest grid (skin + plain underwear, no gear), equipment slot grids (head, body, legs, feet, back/cloak, weapon) in the same rest space, a composer that stacks body + equipment per posed frame, and an exporter that writes `assets/vfx-sheets/<name>.png/json` plus a montage. Note any blocker (for example a gear pixel outside the body silhouette that the skeleton cannot pose).
Write a brief of at most 40 lines.
