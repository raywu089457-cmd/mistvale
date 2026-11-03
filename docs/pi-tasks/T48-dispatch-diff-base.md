# T48: dispatcher: review diff must be this card's change only

Status: done
Accept: node --check tools/pi-dispatch.mjs && node tools/checks/dispatch-selftest.mjs

## Goal
`output/pi-results/<id>.diff` (used by the REVIEW stage and by the `big-diff` Opus flag) is currently `git diff` against HEAD, so it includes every uncommitted change made before the card (T47: 1373 lines shown, 475 real). Make it the diff of this card's run only.

## Files you may change
- `tools/pi-dispatch.mjs`
- `tools/checks/dispatch-selftest.mjs`
- `tools/checks/fixtures/`

## Steps
1. In `dispatch(card)`, where `before = new Set(snapshot())` is taken, also keep the file contents of every file in that snapshot list in memory (map path → content). These are the files that are dirty or untracked before the run.
2. When writing `<id>.diff`, for each changed file: the "before" text is the stored content if present, else `git show HEAD:<path>` (file was clean), else empty (new file). Write before/after to temp files and use `git diff --no-index` (or an equivalent unified diff) so the result is a normal unified diff with the repo path in the headers. Count changed lines (`+`/`-` lines, not headers) from this diff for `big-diff`.
3. Add a selftest that builds a temp dir with a "before" text and an "after" text and asserts the line count only covers the change (expose the diff/count helper so it can be tested without running pi).
