# T15: typography pass — font tokens + 10px desktop floor

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Read only the files listed below; do not explore the repo. Phones already have no text under 11px (layout checker READ = 0); this card fixes desktop sizes and unifies font stacks.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T15.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
`src/pixel-style.css` uses two font tokens (`--font-ui`, `--font-num`) instead of hard-coded families, and no `font-size`/`font` declaration is below 10px. Layout stays clean on all three audit devices.

## Files you may change
- `src/pixel-style.css`
- `tools/typo-pass.mjs` (new)
- `output/pi-results/T15.md`

## Steps
1. In `src/pixel-style.css` line 1 (`:root{...}`), exact edit (matches once):
   old: `font-family:'Microsoft JhengHei','PingFang TC',sans-serif;font-size:12px}`
   new: `--font-ui:'Microsoft JhengHei','PingFang TC','Noto Sans TC',sans-serif;--font-num:Consolas,Menlo,'Roboto Mono','Microsoft JhengHei','PingFang TC',monospace;font-family:var(--font-ui);font-size:12px}`
2. Create `tools/typo-pass.mjs` (node, no dependencies) that reads `src/pixel-style.css`, applies these rewrites, writes the file back, and prints the count of each:
   a. Inside every `font:` shorthand value and every `font-family:` value (value = text up to the next `;` or `}`), if the family list starts with `Consolas`, replace from `Consolas` to the end of the value with `var(--font-num)`. Example: `font:700 30px/1 Consolas,'Microsoft JhengHei',sans-serif` → `font:700 30px/1 var(--font-num)`; `font-family:Consolas,'Microsoft JhengHei',sans-serif` → `font-family:var(--font-num)`. Do NOT touch the `--font-num:` token definition from step 1.
   b. Inside every `font-size:` value and every `font:` shorthand value, change a size of `7px`, `8px` or `9px` (a whole token: preceded by `:` or a space, followed by `/`, space, `;`, `}` or `!`) to `10px`. Line heights after `/` are not sizes; leave them.
   c. Leave everything else byte-for-byte unchanged. The script must be idempotent (second run prints all zeros).
3. Run `node tools/typo-pass.mjs`, then run it again and confirm all counts are 0.
4. Self-checks (paste only the numbers into the report):
   - `grep -c "Consolas" src/pixel-style.css` → must be `1` (the token only).
   - `grep -oE "font(-size)?:[^;}]*" src/pixel-style.css | grep -cE "(^|[: ])[1-9]px"` → must be `0`.
5. `npm test` must pass.
6. `npm run verify:quick`; first line of `output/ui-audit/verify-summary.md` must say 全部通過.
7. `node pipeline/scripts/ui-audit/layout.mjs` (all three devices). Copy the three `== device: N FIX items` lines into the report. If any device has FIX > 0, list the FIX lines (max 6) and STOP — do not try to fix layout; Claude will.
8. `node pipeline/scripts/ui-audit/shots-all.mjs desktop` and `node pipeline/scripts/ui-audit/shots-all.mjs phone` so Claude can review.

## Acceptance (all must pass)
- Step 3 second run prints all zeros; step 4 numbers are `1` and `0`.
- `npm test` passes; verify-summary first line says 全部通過.
- `layout.mjs`: 0 FIX items on iphone-402x712, android-360x640, desktop-1440x900.

## Report (write to output/pi-results/T15.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files changed (names only)
- Counts printed by the first `typo-pass` run (families replaced, sizes raised)
- Step 4 numbers; the three layout `== ...` lines; first line of verify-summary
- Problems hit, or "none"

## Do not
- Change any file other than the three listed, commit, or push.
- Change sizes ≥10px, colors, spacing, or any media-query logic.
- Run `npm run verify` (full) or the button crawl — they are slow and flaky.
- Keep going after the same check fails twice: stop, put the error summary in the result file, and hand back to Claude.
- Spend PixelLab credits.
