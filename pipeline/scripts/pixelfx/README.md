# pixelfx-derived arrow (arrowFx)

The `arrowFx` cell in `assets/vfx@1x.png` / `@2x.png` is drawn in code, not AI-generated.
It adapts the string-sprite broadhead, fletching and shaft from
[patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) `projectiles/arrow` (MIT, Patch +
Hugo Duprez) to Mistvale's 64x64 atlas cell. The arrow is authored horizontally, scaled
1.8x, rotated 45 degrees to match `pixel-world.js`'s `ang + PI/4`, and centred with no
border clipping.

## Run

```sh
python pipeline/scripts/pixelfx/make_arrow.py     # output/pixelfx-arrow/{arrow-64,arrow-128,compare,compare-size}.png
python pipeline/scripts/pixelfx/apply_arrow.py    # replace the arrowFx cell in both vfx atlases
python pipeline/scripts/build/to_webp.py          # build.mjs prefers .webp, so refresh it
npm run verify:quick
```

`apply_arrow.py` backs up the old cells to `output/pixelfx-arrow/old-arrow-{64,128}.png`.
The manifest cell rect and anchor are unchanged, so no manifest edit is needed.

## Why not the 112x32 pixelfx frame

The gallery effect is drawn for a 320x180 game; its arrow is 36 px long. Mistvale draws
`arrowFx` at about 19 screen px (38 at DPR 2), so the 112x32 frame would be tiny and
illegible. This version keeps the pixelfx silhouette and palette ramps but fills the
64x64 cell the way the previous arrowFx did.
