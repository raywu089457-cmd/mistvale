# T13: verify the UI/UX changes and take screenshots (no edits)

Status: failed
Tier: pi
Context: `docs/ARCHITECTURE.md`. Read-only task. Claude changed `src/pixel-ui.js`, `src/pixel-index.html`, `src/pixel-style.css` and added six `assets/ui/px-banner-*` images (see `docs/UIUX-PLAN-2026-11-01.md`).

> Task card for pi. Do not edit any file. If something fails, report it; do not fix it.

## Goal
Prove the build, tests, button crawl and layout checker still pass, and produce screenshots of the changed screens.

## Files you may change
- `output/pi-results/T13.md` only (plus tool output folders under `output/`).

## Steps
1. Run `npm run verify` in the foreground (about 5–12 minutes). Wait for it.
2. Run `node pipeline/scripts/ui-audit/layout.mjs` for all devices (it writes `output/ui-audit/layout/summary.txt`). Count lines starting `FIX` and `READ` per device.
3. Run `node pipeline/scripts/ui-audit/shots-all.mjs desktop` and `node pipeline/scripts/ui-audit/shots-all.mjs phone`.
4. Confirm these files exist and are newer than step 1 started: `output/ui-audit/shots/{desktop,phone}-{build,hunters,difficulty,help,settings,dispatchHunters}.png`.

## Acceptance
- First line of `output/ui-audit/verify-summary.md` says 全部通過.
- Layout summary: FIX and READ counts per device (any non-zero count is a finding, list the first 5 lines).
- The 12 screenshot files exist.

## Report (output/pi-results/T13.md, at most 15 lines)
- Verdict on line 1: `DONE` (everything passed) / `FAILED` (list what failed)
- First line of verify-summary
- FIX/READ counts per device, first 5 FIX/READ lines if any
- Which of the 12 screenshots are missing, if any

## Do not
- Edit any file under `src/` or `assets/`, commit, push, or spend PixelLab credits.
- Retry a failing step more than once.
