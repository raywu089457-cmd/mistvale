# T01: routine verification (after anyone changes code)

> Task card for pi. Change no files; only run the checks and report.

## Goal
Confirm the game builds, every test passes and every button responds, then hand the summary to the user and to Claude.

## Files you may change
- None. This card only writes `output/ui-audit/` and `output/pi-results/T01.md`, and both are git-ignored.

## Steps
1. Check that the game server is up: `curl -s -o /dev/null -w "%{http_code}" http://100.79.149.0:5024/` must print 200. If it does not, restart the server as described in the root `AGENTS.md` and try again.
2. Run `npm run verify` (about 5–8 min). For a quick check use `npm run verify:quick` instead (about 2 min, no button crawl).
3. Read `output/ui-audit/verify-summary.md`.

## Acceptance
- The first line of the summary says 全部通過 ("all passed").
- If anything says FAIL, **do not fix it**; report it as is.
  - Button-crawl failures are listed in the summary itself.
  - For a test failure, add the last 30 lines of `output/ui-audit/test.log`.

## Report (output/pi-results/T01.md)
- The text of `verify-summary.md`
- On failure: the last 30 lines of the matching log

## Do not
- Change code or assets, commit, or push.
