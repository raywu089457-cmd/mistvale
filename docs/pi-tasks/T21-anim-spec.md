# T21: Animation/weapon spec additions (docs only)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map) and `docs/TMW-STUDY-SYNTHESIS.md` (why). Source: `output/tmw-anim-study.md` Recommendations 1, 6, 7, 8, 10. These spec files are the art authority, so edit only by ADDING clearly marked sections; never rewrite existing rules. Read only the files listed; do not explore the repo.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T21.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
Add to the sprite specs: one frame-index table, the timing contract, attachment-layer rule, and a weapon `attackAction` field.

## Files you may change
- `sprites/ANIMATION_SPEC.md`, `sprites/WEAPON_SPEC.md`, `sprites/CHANGELOG.md`

## Steps
1. Read `sprites/ANIMATION_SPEC.md`, `sprites/WEAPON_SPEC.md`, and one real sheet meta `assets/heroes/paladin.json` (keys only: action names, `frames`, `frameTime`, `strikeDur`, `release`, `impact`, `ownTiming`, `head`).
2. Append to ANIMATION_SPEC.md `## 格號表 (Frame index map)`: action -> row / frame indices / frame count as the current sheets actually are (from the JSON, not invented). State that other specs must reference this table instead of repeating numbers.
3. Append `## 出招計時合約 (Strike timing contract)`: per-frame timing is authored in the sheet JSON (`strikeDur`/`release`/`impact`/`ownTiming`); runtime `HIT_STOP` (grep its value in `src/pixel-world.js`, read only) is the only runtime stretch; nothing else may rescale authored timing.
4. Append `## 附屬層可重用單格 (Attachment layers)`: hair/cape-like layers may repeat one pose with +-1px offsets instead of unique frames (TMW hairstyle01: 75/150 ms).
5. In WEAPON_SPEC.md append `## attackAction`: field naming which body attack action a weapon/class uses, mapped to current mistvale action names found in step 1.
6. Add a dated line to `sprites/CHANGELOG.md`. New text in Traditional Chinese with English terms in brackets, like the existing files.

## Acceptance (all must pass)
- `git diff --stat -- sprites` shows only these 3 files; `git diff -- sprites | grep "^-[^-]"` prints nothing (additions only).
- `npm test` passes.

## Report (write to output/pi-results/T21.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- First line of `output/ui-audit/verify-summary.md` if you ran verify
- Problems hit, or "none"

## Do not
- Commit or push.
- Touch hunter AI, combat, save code in `src/pixel-game.js`, or drawing logic in `src/pixel-world.js`.
- Spend PixelLab credits.
- Keep going after the same check fails twice: stop, write the error summary, hand back.
