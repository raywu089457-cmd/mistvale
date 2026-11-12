# T76: archer walk l0v v2

Status: failed
Accept: node tools/checks/archer-walk-l0v.mjs && node tools/checks/archer-walk-l0v-clean.mjs

## Goal
Rebuild the pixelfx archer walk (T74/T75 pipeline: `pipeline/scripts/pixelfx/cut-archer-parts.py`, `vendor/moves/archer-walk-l0v.js`, `archer-walk-l0v-paint.mjs`, atlas `vendor/moves/archer-walk-parts.{png,json}`) from the NEW l0veyou idle `output/l0veyou/archer-idle-pixelfx-v2-1x.png` (33x52, background colour #1d1410 = treat as transparent) instead of the v1 source `output/pixellab-anim-test/archer-pixelfx-walk/east-source.png`.
- Make the cut script take the source path as an argument (default: the v2 file). Re-segment the parts for v2's geometry (head, torso+cloak, near/far arm+bow, thigh/shin/boot per leg); do not reuse v1's hard-coded boxes if they no longer fit.
- Keep every T75 rule: frame 0 identical to the source, whole-pixel offsets only, each leg one solid 4-connected shape, arm+bow on its own layer, no magenta-ish pixels, 8-frame loop.
- Extend `tools/checks/archer-walk-l0v-clean.mjs` (or `archer-walk-l0v.mjs`) so it fails unless frame 0 of the sheet equals the v2 source pixel-for-pixel (opaque pixels).
- Before overwriting, copy the current v1 sheet to `assets/vfx-sheets/archer-walk-l0v-v1.{png,json}`. Then regenerate `assets/vfx-sheets/archer-walk-l0v.{png,json}`, `output/pixelfx-archer-walk-l0v/compare.png`, `walk.gif`, `frames-6x.png` (8 frames at 6x, union bbox), and a 1-row strip `output/pixelfx-archer-walk-l0v/strip-v2.png` (8 frames, 1x, same cell size).
- No change to src/. Do not edit pixelfx's own `src/core/`.
