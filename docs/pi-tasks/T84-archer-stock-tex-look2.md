# T84: archer stock tex look 2 (face, boots, bow tips)

Status: failed
Accept: node tools/checks/archer-walk-stock-tex.mjs && node tools/checks/archer-walk-sheet.mjs

Gate: montage
Montage: output/pixelfx-archer-walk-stock-tex/compare.png

## Goal
Follow-up to T81 (same files: `pipeline/scripts/pixelfx/archer-stock-skin.mjs`, `archer-stock-export.mjs`, `vendor/moves/archer-walk-stock-tex.js`, `tools/checks/archer-walk-stock-tex.mjs`, `pipeline/scripts/pixelfx/archer-walk-stock-tex-montage.py`). Keep the stock pixelfx rig (`vendor/rig-stock.js` shim), every T80/T81 check, and what T81 got right (bow colours, string colour, light boots).

THE REFERENCE is the l0veyou ORIGINAL `output/l0veyou/archer-idle-pixelfx-v2.png` (block-sampled exact version `archer-idle-pixelfx-v2-1x.png`, 33x52). Claude compared T81's compare.png with it; fix only these:
1. Head has no face: it reads as a pale cone. Make it a rounded head: hair #f9cd99/#e4b78d over the top and back down to the jaw with a short fringe; the front ~45% below the fringe is skin #f6c894 (shade #e4b78d) with a 1 px eye #1d1410 one pixel in from the front edge at mid-head height. Outline #1d1410 around the head. No pointed top: the head's top row is at least 3 px wide.
2. Boots too tall (about 56% of the leg). Boots must cover 40-50% of each leg's height (sole row included); the rest is trousers #623d2f.
3. Bow upper limb too short and straight. The upper limb runs forward from the grip then curves up to a tip at chest height (within 2 px of the chest row) and the last 2 px hook forward (+x), like the original. Lower limb mirrors it behind/below the grip.
4. The bowstring stops one pixel short of each tip. Its end pixels must touch (8-connected) the outline/wood pixel at each tip.

## Files you may change
- pipeline/scripts/pixelfx/archer-stock-skin.mjs
- pipeline/scripts/pixelfx/archer-stock-export.mjs
- pipeline/scripts/pixelfx/archer-walk-stock-tex-montage.py
- pipeline/scripts/pixelfx/vendor/moves/archer-walk-stock-tex.js
- tools/checks/archer-walk-stock-tex.mjs
- assets/vfx-sheets/archer-walk-stock-tex.png
- assets/vfx-sheets/archer-walk-stock-tex.json
- output/pixelfx-archer-walk-stock-tex/

## Steps
1. Add checker assertions (they must fail on the current T81 output before you change the skin): head top row >= 3 px wide; >= 4 skin pixels and 1 eye pixel on the front half of the head; boot pixels (#ae6f40, its shade and the sole) span 40-50% of each leg's height in every frame; upper bow tip within 2 px of the chest row and its last 2 px step +x; each bowstring end 8-connected to a tip pixel. Run the checker once and confirm it fails.
2. Fix the skin/bow drawing for items 1-4 above.
3. Regenerate the sheet and every file in `output/pixelfx-archer-walk-stock-tex/`; `compare.png` keeps its layout: the original (`-1x`) | idle | walk frame 2 | walk frame 6, same pixel scale.
4. Run the Accept command. No change to src/ or pixelfx's own `src/core/`.
