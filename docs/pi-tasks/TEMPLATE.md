# Txx: task name (one line)

> Task card for pi. Do the steps in order and do not widen the scope. When finished, write the result to `output/pi-results/Txx.md` in English.

## Goal
What the finished state looks like, in one to three sentences.

## Files you may change
- List them. Do not touch anything else.

## Steps
1. Each step is a runnable command or an exact "old string → new string" edit.

## Acceptance (all must pass)
- The first line of the `npm run verify:quick` (or `npm run verify`) summary says 全部通過 ("all passed").
- Any checks specific to this card.

## Report (write to output/pi-results/Txx.md)
- What you did (short bullets)
- Files changed
- The text of `output/ui-audit/verify-summary.md`
- Problems hit, or "none"

## Do not
- Commit or push, unless this card is T04 and the user said 推.
- Change hunter AI, combat or save code in `src/pixel-game.js`, or drawing code in `src/pixel-world.js`.
- Keep going after the same check fails twice: stop, put the error summary in the result file, and hand back to Claude.
- Spend PixelLab credits, unless the card states a budget.
