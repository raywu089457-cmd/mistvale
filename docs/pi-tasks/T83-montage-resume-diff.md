# T83: montage resume keeps attempt-1 files in diff/review/scope

Status: done
Accept: node tools/pi-dispatch.mjs --gate-selftest && node tools/checks/dispatch-selftest.mjs

## Goal
Two defects in the T82 montage gate of `tools/pi-dispatch.mjs`:
1. On a resumed run (`--approved` on a `montage-review` card) and on `--montage-ok`, `changedList()` only lists files changed since THIS run's snapshot. Files changed by the gated attempt 1 are missing, so with `--montage-ok` the REVIEW stage gets an empty diff (it reviews nothing), and on `--approved` resume the diff, scope check and tier-c/big-diff checks miss every file that attempt 1 changed and the resume did not touch again.
2. The montage auto-gate fires on dispatcher/tooling cards just because their Goal says "montage" or "拼圖".

## Files you may change
- tools/pi-dispatch.mjs
- tools/checks/dispatch-selftest.mjs
- tools/checks/fixtures/montage.md

## Steps
1. In `runCard`, when a montage state is loaded (resume or montage-ok), keep `state.changed` and make `changedList()` return the union of `state.changed` and the files changed in this run (deduplicated, card excluded). Every user of `changedList()` (REVIEW diff, out-of-scope break, finalize `changed`) then sees attempt-1 files; `baseContents` already holds their pre-run text from `state.base`. Drop the separate `stateChanged` special case if the union makes it redundant.
2. In `PLAN_GATE_RULES` montage rule: remove `montage` and `拼圖` from what makes a Goal "visual" for this rule (keep the other words in `GATE_VISUAL_GOAL`), and do not fire when the card's Files list is non-empty and every file is under `tools/` or `docs/`.
3. `montageSelftest`: (b) make the resumed implement write a different file `src/b.js` (add it to the fixture's Files) and NOT touch `src/a.js`; assert the resulting `T815.diff` names both `src/a.js` and `src/b.js`. (c) assert that the `T815.diff` written for REVIEW after `--montage-ok` is non-empty and names `src/a.js`, and that the fake reviewer's prompt pointed at that diff. Restore the fixture status between steps as now.
4. `gateSelftest`: add checks that a card with Goal "Add the montage gate to the dispatcher" and Files `['tools/pi-dispatch.mjs']` gets no `montage` hit, and that Goal "Make the archer look like the reference" with Files `['tools/checks/archer.mjs', 'pipeline/scripts/pixelfx/x.mjs']` still gets `montage`.
5. Run the Accept command; both new assertions must fail on the T82 code before your fix (check once with `git stash`-free reasoning: run the selftest after step 3 and before step 1 to see it fail).
