# T71: 弓手走路 pixelfx 版本

Status: failed
Accept: auto

## Goal
Make a pixelfx version of the archer's walk cycle, posed after the archer walk the game currently draws (the HERO_ARCHER_001 side walk: `sprites/characters/HERO_ARCHER_001/walk/`, 8 frames; confirm which sheet `drawSheetHero` really uses for the archer).

- New looping pixelfx move `moves/archer-walk`, vendored at `pipeline/scripts/pixelfx/vendor/moves/archer-walk.js` like the other project-written effects (pixelfx's own relative imports stay valid), drawn with pixelfx's actor/rig (`src/core/poses.js`, `rig.js`, `actor.js` in the pixelfx checkout C:/Users/ray/pixelfx): bow carried in the far hand (`weapon: "bow"`), facing right, `loop: true`.
- Match the reference: the same number of frames and the same contact/passing/up/down beats, stride length, arm swing, body bob and the way the bow is held, read off the 8 reference frames. No arrow, no attack.
- `export-sheet.mjs` gets an `--actor` flag that renders the actor (today it always passes `actor: false`); without the flag the output is unchanged. Export the walk with it to `assets/vfx-sheets/archer-walk.{png,json}`.
- Do NOT wire it into the game: no change to src/. This is a preview for Claude to judge.
- Montage `output/pixelfx-archer-walk/compare.png`: top row the 8 reference frames, bottom row the 8 pixelfx frames, same scale, on one neutral background, frame numbers labelled. Also `walk.gif` of the pixelfx loop.
- A checker under tools/checks/ asserts: the json exists, is a loop, has exactly the reference frame count, every frame has actor pixels, and feet stay on one ground line (bob only, no drift); it must fail before the work.
