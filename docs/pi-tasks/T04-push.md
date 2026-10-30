# T04: commit and push to Pages (only when the user said 推 or 交接)

> Task card for pi. Pushing main updates the live site (GitHub Pages). Do it only after the user explicitly said 推 or 交接.

## Goal
Commit the files listed in the handoff doc to main, push, and confirm that the Pages deploy succeeded.

## Files you may change
- None. Git operations only.

## Steps
1. Run `git fetch origin main`, then `git log --oneline HEAD..origin/main`. If this prints anything, someone else pushed in the meantime: stop and report. Do not merge or rebase yourself.
2. Run `npm run verify:quick`. The first line must say 全部通過 ("all passed"); if it does not, stop and report.
3. Open the newest handoff doc (`docs/HANDOFF-*.md` with the latest date) and find the section 「提交時只 stage 這些」 ("stage only these").
   - `git add` **only the files listed there**.
   - Never use `git add -A` or `git add .`; untracked folders such as `output/blender8/` and `output/l0veyou/mon8/` belong to another agent.
4. Check `git diff --cached --stat` shows only the expected files, then commit.
   - The commit message is in Traditional Chinese, because the user reads the history: one summary line, a blank line, then bullets that follow the handoff doc's sections.
   - Do not mention any model name in it.
5. Run `git push -u origin main`. On network errors retry up to 4 times, waiting 2, 4, 8 and 16 seconds.
6. Confirm the deploy:
   - Find the run with `gh run list --limit 1`.
   - Wait for it with `gh run watch <id> --exit-status`.
   - Check that `gh run view <id> --json conclusion` says success.

## Acceptance
- `gh run view` reports conclusion `success`.
- `git status --short | grep -v '^??'` prints nothing.

## Report (output/pi-results/T04.md, plus a short reply to the user in Traditional Chinese)
- Commit hash and its first line
- Deploy result and the live URL https://raywu089457-cmd.github.io/mistvale/
- A reminder that a phone may show the old version once; one reload fixes it

## Do not
- Force-push, rewrite history, or stage files that are not on the handoff list.
