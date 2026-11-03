# T24: Monster palette variants (build-time recolor) + spec

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Idea from TMW: one sheet + palette ramps -> many variants (`output/tmw-anim-study.md` "Recolor and variants"). Build-time recolor, not runtime. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T24.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
A script that makes recoloured monster variant sheets from existing sheets by palette-ramp mapping, a spec section describing the `dye` data, and a demo set of variants for review. The game does NOT load the variants yet.

## Files you may change
- `pipeline/scripts/recolor_monster.py` (create)
- `sprites/dye/monster-dyes.json` (create)
- `sprites/EQUIPMENT_SPEC.md` (append one section only) and `sprites/CHANGELOG.md`
- `output/monster-dye/` (outputs)

## Steps
1. `ls assets/monsters3` (skip `_prev*` folders) and pick the current monster sheets (png + json). Read one json for layout.
2. Write `recolor_monster.py` (Python, Pillow): inputs sheet png, dye json, variant name. Method: opaque pixels to HSV; pixels whose hue is in a channel's hue range are remapped by luminance onto that channel's ramp (hex stops dark->light); alpha kept exactly; very dark outline pixels untouched. Output png + copy of json under `output/monster-dye/<monster>-<variant>.*`.
3. `monster-dyes.json`: per monster 2 variants (`elite`, `frost`) with 1-2 channels each; choose hue ranges by printing a hue histogram of each sheet first.
4. Generate all variants, plus `output/monster-dye/contact.png`: grid of frame 0 of original + variants per monster.
5. Append to EQUIPMENT_SPEC.md `## 染色通道 (Dye channels)` describing the json format and the script. CHANGELOG line.

## Acceptance
- Every variant png has the same size and identical alpha channel as its source (script self-check prints OK per file).
- `output/monster-dye/contact.png` exists. `npm test` passes. No file under `src/` or `assets/` changed.

## Report (write to output/pi-results/T24.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- Variant count and contact sheet path
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
