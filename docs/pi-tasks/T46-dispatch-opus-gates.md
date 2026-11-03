# T46: dispatcher: Opus plan gate and escalated Opus review

Status: done
Accept: node --check tools/pi-dispatch.mjs && node tools/checks/dispatch-selftest.mjs

## Goal
Keep Opus judgement where it matters without Opus reading code: Opus approves pi's plan on cards that ask for it, and reviews the diff only when a card is risky, when pi's own review keeps failing, or on a sample. The dispatcher never calls Claude itself; it stops or flags, prints the file paths for Claude to read, and records Opus's verdicts to measure how reliable pi's review is.

## Files you may change
- `tools/pi-dispatch.mjs`
- `tools/checks/dispatch-selftest.mjs`
- `tools/checks/fixtures/` (new fixture cards allowed)
- `docs/DISPATCH-PLAYBOOK.md` (sections 2 and 3 only, at most 12 lines added)

## Steps
1. Plan gate. A card header `Gate: plan`, or the flag `--approve-plan`, makes `dispatch(card)` stop after the PLAN stage (and its precheck) with verdict `PLAN-READY`. It sets `Status: plan-review` and prints one line `Txx PLAN-READY plan: output/pi-results/Txx.plan.md (N lines)`. This is not a failure for the queue: the queue goes on with the next card. Running `node tools/pi-dispatch.mjs Txx --approved [--note "..."]` later skips PLAN, reuses the existing plan file, passes `--note` to IMPLEMENT as Opus's direction, and runs the rest of the stages. `--approved` without a plan file means: print an error and exit 2.
2. Escalated Opus review. After REVIEW, set `opus: <reason>` on the card's result when any of these holds, otherwise `opus: -`:
   - `tier-c`: a changed file is `src/pixel-game.js` or `src/pixel-world.js`;
   - `review-failed`: attempts ran out while pi's review still reported a `high` issue;
   - `big-diff`: the diff has more than 300 changed lines;
   - `sample`: the card number is divisible by 5 (deterministic sampling).
   The card is still judged by accept, scope and review as now. The flag only adds the paths to read: print `Txx opus:<reason> diff: output/pi-results/Txx.diff (N lines) review: output/pi-results/Txx.review.md` as a second line under that card's one-line result.
3. Opus verdict ledger. `node tools/pi-dispatch.mjs --opus-verdict Txx ok|missed|fixed "note"` appends `date,card,reason,pi_review,opus_verdict,note` to `docs/pi-tasks/opus-review.csv` (create it with a header). It reads `reason` and `pi_review` from the latest `cost-log.csv` row for that card, then exits. `missed` = Opus found a real problem that pi's review called OK. After every dispatch run with at least one `opus:` flag, print one summary line from the ledger: `pi-review miss rate: M/N`.
4. `cost-log.csv`: add an `opus` column at the end (the reason or `-`), using the same header-rewrite method as the earlier columns.
5. Extend `--dry-run` and the selftest. Add fixtures: one with `Gate: plan` (expected stages end at plan, verdict PLAN-READY), and one that changes `src/pixel-world.js` in its Files (expected `opus:tier-c` once its files are known: assert the reason function on a given file list). Assert that `--opus-verdict` writes a correct row to a temporary ledger path (add `--ledger <path>` for tests). Keep the existing assertions.
6. Document `Gate: plan`, `--approve-plan`, `--approved`, the `opus:` reasons and `--opus-verdict` in the playbook. Do not run real cards.
