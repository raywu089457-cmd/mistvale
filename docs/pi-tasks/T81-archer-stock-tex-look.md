# T81: archer stock tex look

Status: failed
Accept: node tools/checks/archer-walk-stock-tex.mjs && node tools/checks/archer-walk-sheet.mjs

## Goal
Follow-up to T80 (`pipeline/scripts/pixelfx/archer-stock-skin.mjs`, `archer-stock-export.mjs`, `vendor/moves/archer-walk-stock-tex.js`, `tools/checks/archer-walk-stock-tex.mjs`). Keep the stock pixelfx rig (`vendor/rig-stock.js` shim) and every T80 check.

THE REFERENCE is the l0veyou ORIGINAL `output/l0veyou/archer-idle-pixelfx-v2.png` (1024x1024, magenta bg, pixel blocks ~14.75 px; its exact block-sampled version is `archer-idle-pixelfx-v2-1x.png`, 33x52). Do not use the 39px downscale as reference. Claude judged T80 against this original: no face, body far too dark (a black skirt), bow a short upward stick. Apply this look table, scaled from the original's 52 px height to the stock rig's ~38 px. THE BOW IS THE PRIORITY: it must read clearly as a bow, and it must have a bowstring.

Bow (top priority), shaped like the original's:
- Gripped by the near hand at hip height, drawn in front of the body. In the original the visible upper limb leaves the hand running forward almost horizontally, then curves upward to a tip at about chest height, the tip hooking slightly forward (recurve). Draw that upper limb (about 12-14 px long at rig scale) and a matching lower limb mirrored about the grip, going back/down behind the hand (it may be partly hidden by the legs). Chord axis tip-to-tip 25-45 degrees above horizontal, upper tip forward (+x) of the hand. Same shape and angle in every frame (follows the hand's position only).
- Wood 1-2 px thick like the original: #b17143 lit, #7d4b33 shade, outline #1d1410; dark grip #4b2b26 under the hand.
- Bowstring: a straight 1 px line #e4b78d from tip to tip on the archer's side of the bow, one continuous line, never overlapping the wood, visible in every frame (hand/body may cover at most 3 of its pixels).

Head (as in the original): short pale-blond hair #f9cd99 (shade #e4b78d) covering the top and back of the head down to the jaw, with a fringe over the forehead; the front ~45% below the fringe is a face: skin #f6c894, shade #e4b78d, a 1 px dark eye #1d1410 one pixel in from the front edge at mid-head height. Hair spikes at most 3 px, never over the face.

Body (as in the original, warm and fairly light):
- Tunic: brown #7d4b33 with lit #b07043 and shade #623d2f; olive-green #657138 patches on the chest and front of the belly (as in the original), at most 20% of the torso; belt #4b2b26.
- Near hand visible as a skin-coloured pixel cluster at the grip.
- Upper legs: short dark grey-brown trousers #623d2f. Lower legs: KNEE-HIGH boots in light warm brown #ae6f40 / shade #7d4b33 with a #311d20 sole row, covering about the bottom 45% of each leg. Two legs must read as two legs (outline between them), not one block.
- Shading steps at most one tone darker than a material's base; no body pixel except outline/seams/sole darker than #4b2b26.
- Cream cloak (#fee9d0 / #fde1bf / #e4b78d) hanging from the shoulders down the back to about knee height, staying on the back half, never covering the front of the legs.

Checker additions (must be able to fail): every frame has >= 4 skin pixels and 1 eye pixel on the front half of the head; bow tip-to-tip 22-30 px, chord axis 25-45 degrees, upper tip ahead of the hand; bowstring = an 8-connected 1 px line of #e4b78d linking both tips with >= 80% of its expected length visible and no wood pixel on it; boot colour #ae6f40 present on both legs in every frame; <= 20% of non-outline torso+leg pixels darker than #4b2b26.
- `compare.png` must show, at the same pixel scale: the original (block-sampled `-1x`) | idle | walk frame 2 | walk frame 6. Regenerate the sheet and all `output/pixelfx-archer-walk-stock-tex/` files. No change to src/ or pixelfx's `src/core/`.
