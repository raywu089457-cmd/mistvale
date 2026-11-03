# T44: k2 font range a

Status: done
Accept: node tools/checks/css-debt.mjs --track font --range A --max-fs 32 --max-dup 57 && node tools/checks/css-debt.mjs --track font --range B --max-fs 180 --max-dup 76 && node pipeline/scripts/ui-audit/style-snapshot.mjs --devices all --dir output/ui-audit/style-baseline-k2

## Goal
In `src/pixel-style.css`, range A only (from the start of the file up to the comment `/* @split font`), tokenize font sizes and remove redundant font-size declarations, without changing any rendered style. Never touch the first `:root{...}` block (token definitions) or anything after the `/* @split font` comment.

## Files you may change
- `src/pixel-style.css` only (helper scripts outside the repo are fine). Do not commit. Never pass `--save` to style-snapshot.

## Steps
1. Within range A, replace every `font-size:<N>px` whose value matches an existing size token with `font-size:var(<token>)`: 10px -> `--fs-tiny`, 11px -> `--fs-small`, 12px -> `--fs-body`, 13px -> `--fs-h3`, 15px -> `--fs-h2`, 18px -> `--fs-title`. Other px values stay as they are. (Check the token values in the first `:root` block first.)
2. Remove redundant font-size declarations in range A: when the same selector declares font-size in several places (base and/or several `@media` blocks), delete the ones that never win: overridden later by an equal-or-broader condition at equal specificity, or a repeat of the same value under a condition that already gets that value. Removing a declaration must not change any computed style. Cascade order matters: a later rule wins over an earlier one of equal specificity. `@media(max-width:760px),(max-height:520px)` and `@media(max-width:760px)` are different conditions; do not treat them as equivalent. Remove a rule block entirely only if it becomes empty.
3. Run `node tools/checks/css-debt.mjs --track font --range A --max-fs 32 --max-dup 57` while iterating (fast). Run the full acceptance command (it includes style-snapshot, about 3 minutes) only once at the end. If style-snapshot reports diffs, revert the offending removal.
