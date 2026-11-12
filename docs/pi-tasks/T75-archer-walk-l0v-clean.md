# T75: 弓手 pixelfx 走路:腿和手臂部件不要碎、去掉洋紅邊

Status: failed
Accept: auto

## Goal
Follow-up to T74 (`moves/archer-walk-l0v`, `pipeline/scripts/pixelfx/vendor/moves/archer-walk-l0v.js`, `archer-walk-l0v-paint.mjs`, `cut-archer-parts.py`). Claude looked at the 8 frames at 6x (`output/pixelfx-archer-walk-l0v/frames-6x.png`): frame 0 matches the l0veyou image and frame 1 is clean, but frames 2-7 break up:
1. Legs fragment: the rotated thigh/shin/boot parts lose pixels and the boots dissolve into brown noise (frames 3-5 worst). Do not rotate leg parts by arbitrary angles. Move each leg with whole-pixel offsets; where a pose needs a bend, use at most a few pre-cut pixel variants per leg segment (e.g. straight / bent-forward / bent-back, cut or hand-shifted from the source pixels) and pick per frame. Every leg must stay one solid shape with its dark outline closed, boots intact.
2. The near arm + bow smears over the torso: from frame 2 on, the green tunic and belt turn into mixed brown/green noise. Keep the arm as one intact part drawn on its own layer over the torso with a small swing (1-3 px offsets, whole pixels); never blend or partially overwrite the torso.
3. Dark magenta fringe pixels from the l0veyou source remain at the cloak and boot edges: map them to the outline colour in the parts atlas.
- Keep: frame 0 identical to the source, 8-frame loop, the existing checker passing. Extend `tools/checks/archer-walk-l0v.mjs` so it catches this: per frame, every part's pixel count stays within 90% of its source part (no lost pixels), each leg is one 4-connected component, and no pixel is magenta-ish (r>120, g<60, b>100).
- Regenerate `assets/vfx-sheets/archer-walk-l0v.{png,json}`, `output/pixelfx-archer-walk-l0v/compare.png`, `walk.gif`, and `frames-6x.png` (8 frames side by side at 6x, cropped to the union bbox).
- Not wired into the game: no change to src/. Do not edit pixelfx's own `src/core/` files.
