# T35: Integrate pixelfx level-up pillar into the level effect

Status: done
Accept: npm test && npm run verify:quick

Context: the spec is `output/pixelfx-preview/levelup-integration.md`. Read it first and follow its "Suggested integration" steps 1–6 and its "Acceptance" section exactly. The asset is ready in `output/pixelfx-preview/ui/level-up-pure/`.

## Goal
The `level` effect plays the 24-frame pixelfx pillar sheet (1.5 s, 15 fps) at the hunter's feet, with no `LEVEL UP!` text and no grey dummy. The existing `fxStar` path stays as the fallback while the image loads. Other effects are unchanged.

## Files you may change
- `assets/ui/fx-levelup.png`, `assets/ui/fx-levelup.json` (copied from `output/pixelfx-preview/ui/level-up-pure/level-up-1.5s-15fps.*`)
- `src/pixel-world.js` (only `drawEffect`, plus a new `drawLevelUpFx` / `levelFxReady` near `drawAtlasEffect`, and the image load next to the vfx atlas loaders)
- `src/asset-loading.js` (only if `trackImage` needs a new entry there)
- `THIRD-PARTY-LICENSES.txt`, `pipeline/ASSETS.md` (licence NOTICE line and row)
- `output/pixelfx-preview/levelup-shots/` (new screenshots)

## Steps
1. Do spec steps 1–6. Read the frame rects from the JSON, not computed from the grid, if they differ. Pivot `[88,114]`, world width 36, `globalAlpha = fade`, drawImage only (no putImageData).
2. Screenshot check: start `node server.mjs`. Open the game at 1280x800 and use the cheat / developer menu → 全員 +10 級. Capture 3 frames about 0.2 s, 0.7 s and 1.2 s after the trigger, cropped around one hunter, into `output/pixelfx-preview/levelup-shots/levelup-{1,2,3}.png`. Stop the server. Confirm in the result that there is no English text and no grey figure.
3. Also run `check_facing`, `check_anim` only if you touched hero animation code (you should not need to).

## Do not
- Change the 1.5 s fade, gameplay, XP or level logic, or any other effect type.
