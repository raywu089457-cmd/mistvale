# T45: dispatcher v2: goal-only cards, pi plans, pi reviews, compact output

Status: failed
Accept: node --check tools/pi-dispatch.mjs && node --check tools/pi-card.mjs && node tools/checks/dispatch-selftest.mjs

## Goal
pi tokens are free; Claude tokens are not. Change the dispatcher so Claude only writes a goal plus an acceptance command, and pi does the planning, the work and an independent review, while Claude reads one short line per card. Quality must not drop: every stage that used to rely on Claude now has a pi stage or a script check.

## Files you may change
- `tools/pi-dispatch.mjs`
- `tools/pi-card.mjs`
- `tools/checks/dispatch-selftest.mjs` (new)
- `tools/checks/fixtures/` (new; fixture cards for the selftest)
- `docs/DISPATCH-PLAYBOOK.md` (sections 2 and 3 only: describe the new options)

## Steps
1. `tools/pi-card.mjs`: allow a goal-only card. With `--goal-only`, the body needs only `## Goal` (optional `## Notes`); `## Files you may change` and `## Steps` are not required. `--accept auto` is allowed: it writes `Accept: auto`. Keep every existing check for normal cards.
2. `tools/pi-dispatch.mjs`, in `dispatch(card)`, add stages; each stage is a separate `runPi` call with its own prompt and session name (`<id>-plan`, `<id>-review-aN`):
   a. PLAN (only when the card has no `## Steps`): pi reads the code (grep, docs/ARCHITECTURE.md, docs/API-pi.md) and writes `output/pi-results/<id>.plan.md` with `## Files you may change` and `## Steps` in the same style as a normal card (names, not line numbers). When the card says `Accept: auto`, the plan's first line is `Accept: <one shell command>`. The command must use existing checks (`npm test`, `npm run verify:quick`, `node tools/checks/*.mjs`, `node pipeline/scripts/ui-audit/style-snapshot.mjs ...`) or a new checker that the plan stage itself writes under `tools/checks/`. The implement stage then gets "card + plan" in its prompt. `allowedFiles` reads the plan's Files section when the card has none.
   b. PRECHECK (only for `Accept: auto` with a checker the plan stage wrote): run the accept command on the unchanged tree. If it already passes, the checker proves nothing; send it back to PLAN once with that note. Record the precheck result.
   c. IMPLEMENT: the existing stage.
   d. ACCEPT: the existing `runAccept`.
   e. REVIEW (not for scout cards; skip with `--no-review`): after accept PASS and scope ok, the dispatcher writes `git diff` of the changed files to `output/pi-results/<id>.diff`. A fresh pi session with a critic prompt gets the card goal, the plan and the diff path. It writes `output/pi-results/<id>.review.md`: line 1 `OK` or `ISSUES`, then at most 10 lines, each tagged `high` or `low`. If any `high` issue: go back to IMPLEMENT with the review text as the note. This counts as an attempt.
   f. Raise the default attempt limit from 2 to 3 (`--attempts N` overrides). BLOCKED still stops at once.
3. Output for Claude (the part that costs Claude tokens): by default print exactly one line per card: `Txx VERDICT accept:.. scope:.. review:OK|ISSUES|skip precheck:..|n/a Nx Mm $x`. Print the result body (capped as now) only for cards that are not ok, or with `--full`. Scout cards keep their brief as now. With several cards, keep the final table.
4. `cost-log.csv`: add columns `review,precheck,stages` at the end, in the same way the `start,end,scope` columns were added (rewrite only the header line).
5. Add `--dry-run`: resolve cards, parse headers, Files (card or plan), Accept, and print the stage list and each stage's prompt, without running pi or the accept command. `tools/checks/dispatch-selftest.mjs` runs `--dry-run` on fixture cards in `tools/checks/fixtures/` (one normal, one goal-only with `Accept: auto`, one scout) and asserts the expected stages (`plan` only for goal-only, `review` not for scout) and the one-line output format. It exits 1 on any failure. `resolveCard` must accept those fixture paths.
6. In `docs/DISPATCH-PLAYBOOK.md` sections 2 and 3, document `--goal-only`, `Accept: auto`, the stages, `--no-review`, `--attempts`, `--dry-run` and the new output. At most 15 lines added.
7. Do not run the new stages on real cards. The selftest and `node --check` are the checks. Do not touch any other card.
