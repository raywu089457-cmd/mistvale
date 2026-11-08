# T94: cinder cyclone: switch to the iso rewrite

Status: done
Accept: node tools/checks/vfx-slower.mjs && node tools/checks/cinder-full-speed.mjs && npm run verify:quick

## Goal
The sorcerer's first skill 「火龍捲」 (fx `cinder`) must draw the new 2:1 iso rewrite `assets/vfx-sheets/cinder-cyclone-iso.{png,json}` (240x400, pivot [120,346], 157 frames @ 30fps, 17 columns — already exported, not yet wired) instead of `cinder-cyclone`. Keep the old sheet files in place; only the drawing and the effect duration change.

## Notes
- The iso sheet is authored at 1 art px = 1 hero art px, so the draw scale k starts from `heroArt('sorcerer')*scale` (`heroArt=id=>HERO_H/(heroSheets[id]?.meta.heroHeight||72)`). Judge it against the hero's height in the montage; you may tune within +-15% and must state the value you used in the result file.
- Timing: 157 frames @ 30fps = 5.2333 s. The `fx:'cinder'` effect currently lives 4.2 s, so extend it until the whole sheet has played (about 6.0 s) and move the 1.0x `VFX_SPEED_BY_SHEET` exception to the new id.
- Two checkers hardcode the old sheet: `tools/checks/vfx-slower.mjs` (the cinder 1.0x exception, removalTarget 4.2, ending = last frame, frame-report expecting floor(speed*fps)) and `tools/checks/cinder-full-speed.mjs` (reads cinder-cyclone.json, intercepts images by /vfx-sheets[\\/]cinder-cyclone\.png$/, LIFETIME, frame 0 at hit, plays to the last frame). Update both to the new sheet.
- Need one in-game montage for scale and placement: the same scene at about 0.4 s / 1.5 s / 3 s / 5 s after the hit, with one hero standing beside it for scale. Write it to `output/cinder-iso/montage.png`. `pipeline/scripts/ui-audit/mage-attack-montage.mjs` shows how to drive the game for a montage.
- Accept: `node tools/checks/vfx-slower.mjs && node tools/checks/cinder-full-speed.mjs && npm run verify:quick`
