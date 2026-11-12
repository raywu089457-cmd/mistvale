# T77: archer walk proc

Status: cancelled (superseded by T78: user wants 100% identical)
Accept: node tools/checks/archer-walk-proc.mjs && node tools/checks/archer-walk-sheet.mjs

## Goal
Make the Mistvale archer ENTIRELY procedurally with pixelfx (its rig draws the body; no pixels pasted from any image), looking like the new l0veyou reference `output/l0veyou/archer-idle-pixelfx-v2-1x.png` (33x52, bg = #1d1410 at alpha 0; a 39px-tall downscale is `archer-idle-pixelfx-v2-39px.png`). Build on the T73 approach (`pipeline/scripts/pixelfx/vendor/moves/archer-walk.js` + `archer-walk-skin.mjs`, which repaints pixelfx's rendered rig) but as a NEW move `moves/archer-walk-proc` + its own skin, leaving `archer-walk` and `archer-walk-l0v` untouched.
- Look, taken from the v2 reference: sample its palette into constants (pale blond hair 2-3 tones, light skin, cream cloak 3 tones, dark brown leather, olive accents on the tunic, brown belt/trousers/boots, bow wood) and use its dark outline #1d1410 instead of pixelfx's ink. Cream hooded cloak over the shoulders hanging down the back to about calf height, swinging per frame; blond hair covering the crown and ear with a few spikes; olive tunic accent; longbow held LOW in the near hand, angled forward and down, as in the reference. No arrow, no quiver if it does not appear in the reference.
- Do not read the l0veyou PNG at render time and do not use the T74 parts atlas; only hard-coded palette constants and procedural geometry.
- Frames: 1 idle frame (calm stand, profile facing right) + 8-frame walk loop at 8 fps with a clear stride: at the two contact frames the feet must be at least 6 px apart horizontally.
- Outputs: `assets/vfx-sheets/archer-walk-proc.{png,json}` (idle + walk), `output/pixelfx-archer-walk-proc/compare.png` (at 6x: v2-39px reference | procedural idle | v2 native reference), `frames-6x.png` (8 walk frames, union bbox), `walk.gif`, and `strip.png` (8 walk frames 1x in one row, equal cells; print the cell w/h).
- New checker `tools/checks/archer-walk-proc.mjs`, which must fail if: the sheet lacks 1 idle + 8 walk frames; any opaque pixel's colour is farther than RGB distance 40 from every colour in the v2 reference's opaque palette; the outline colour #1d1410 is absent from a frame; the cream cloak has fewer than 20 px in any frame; contact-frame feet are < 6 px apart; two consecutive walk frames are identical; or the move/skin source reads a .png or the parts atlas.
- No change to src/. Do not edit pixelfx's own `src/core/`.
