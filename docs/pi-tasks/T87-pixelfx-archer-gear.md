# T87: archer default gear set on the shared pixelfx bare body

Status: done
Accept: node tools/checks/pixelfx-archer-gear.mjs && node tools/checks/pixelfx-barebody.mjs && git -C C:/Users/ray/pixelfx diff --quiet -- src/core

Gate: montage
Montage: output/pixelfx-character/archer/compare.png

## Goal
T86 built the bare body every class will wear gear on: `pipeline/scripts/pixelfx/character/` (vendored core fork in `core/` with material layers via `setMaterial` and an empty gear pass via `setGearPass` that draws into the same z-buffer after the body, before weapons; `barebody.js`; `walk.js`; `export-actor.mjs`), checked by `tools/checks/pixelfx-barebody.mjs`. Now build the archer's default gear set as one file `pipeline/scripts/pixelfx/character/gear/archer.js` that stacks on the bare body (the bare body files stay as they are, and the bare-body sheet must still pass its checker), and export the archer walk. Identity reference: the game's archer `output/l0veyou/ref-archer.png` (pale blond hair, cream hooded cloak, dark brown leather tunic with some olive green, belt, brown trousers, brown boots, wooden bow). NEVER edit `C:/Users/ray/pixelfx`.

Look table (exact values; ink/outline stays #1d1410; "rows" = rest-space rows 0-37 from `src`):
- Hair (material layer, head): top and back of the head down to the jaw with a short fringe; the face front stays skin with the eye. Hair must contrast with skin: lit #fbe3a0, base #f0c870, shade #c99a48.
- Tunic (material, rows 10-17 and upper arms): base #7d4b33, lit #b07043, shade #623d2f; olive #657138 patches on the chest/belly front, at most 20% of tunic pixels.
- Belt (rows 18-19): #4b2b26, one buckle pixel #b2876d on the front.
- Trousers (rows 20 to boot top): base #623d2f, lit #7d4b33, shade #4b2b26.
- Boots (knee-high, the bottom 45% of each leg, about rows 29-37): base #ae6f40, lit #c98a55, shade #7d4b33, bottom row sole #311d20.
- Near forearm bracer: #7d4b33 with lit #b07043.
- Hooded cloak (gear pass geometry, attached to the chest/neck bones): cream base #fde1bf, lit #fee9d0, shade #e4b78d, with ink outline. The hood lies down on the shoulders behind the neck (a collar 2-3 px tall), the cloak hangs from the shoulders down the back to about knee height, 5-7 px wide, staying behind the torso (z behind the body, so the near arm and torso draw in front of it); its hem trails 1-2 px behind the body when walking.
- Quiver (gear pass geometry, on the back above the cloak in z): a tube #7d4b33/#623d2f diagonal from the right shoulder blade down to the hip, with 2-3 fletching pixels #fee9d0 sticking out above the shoulder.
- Bow: pixelfx's stock `WEAPONS.bow` held like the stock archer walk move holds it, recoloured: wood lit #b17143, base #7d4b33, string #e4b78d, grip #4b2b26.
- No grey, no #f53cd1 anywhere.

## Files you may change
- pipeline/scripts/pixelfx/character/gear/
- pipeline/scripts/pixelfx/character/export-actor.mjs
- pipeline/scripts/pixelfx/character/walk.js
- tools/checks/pixelfx-archer-gear.mjs
- output/pixelfx-character/archer/

## Steps
1. Write `tools/checks/pixelfx-archer-gear.mjs` first; it must fail now. It checks `output/pixelfx-character/archer/archer-walk.png/.json`: same frame count, cell, fps and pivot as the bare-body sheet; every opaque colour is in the table above, the bare-body palette or the baked foot shadow; per frame: hair base or lit present on the head and the eye still visible, tunic and olive both present with olive <= 20% of tunic pixels, belt present, boot base on both legs, sole present, >= 12 cloak pixels on the back side of the torso, quiver tube and >= 2 fletching pixels, bow wood and >= 6 string pixels; the opaque mask contains the bare-body mask of the same frame (gear only adds pixels or covers body pixels).
2. Add `gear/archer.js` exporting the material layers (top first, falling back to the bare body) and the gear-pass draw function; extend `export-actor.mjs` with a `--gear archer` option, using the vendored core's `setMaterial`/`setGearPass`, rather than copying the exporter.
3. Export to `output/pixelfx-character/archer/` (NOT assets/vfx-sheets): archer-walk.png/.json, walk.gif, frames-6x.png and `compare.png` = bare body idle | archer idle | walk frames 0, 2, 4, 6, all at 6x with labels.
4. Run the Accept command.
