# T06: phone layout + readable text, half B (9 modal screens)

> Task card for pi. Claude does the other half (screens 01–09 and 19) at the same time in a separate step; do not touch those.

## Goal
On phones, the modal screens below have no layout faults and no text smaller than 11px. Desktop looks exactly as before.

Your screens (name prefix → modal type):

| Prefix | Modal type |
| --- | --- |
| 10-dungeon | dungeon |
| 11-arena | arena |
| 12-quests | quests |
| 13-inventory | inventory |
| 14-difficulty | difficulty |
| 15-help | help |
| 16-boss | boss |
| 17-dispatch | dispatch |
| 18-worldmap | worldmap |

## The checker
`node pipeline/scripts/ui-audit/layout.mjs [devices]` opens every screen on each device and writes `output/ui-audit/layout/summary.txt` (also printed) plus screenshots in `output/ui-audit/layout/<device>/<screen>.png`.
- Lines starting `FIX` (layout fault) or `READ` (text under 11px) must reach 0 for your screens. `info` lines are optional.
- `SCREENS=10,11,12,13,14,15,16,17,18` limits the run to your screens.
- `INJECT=some.css` layers a CSS file on top of the served game, so you can try a fix without rebuilding. Once it works, paste it into the real CSS and rebuild.
- Phone devices: `iphone-402x712,android-360x640,iphoneSE-375x548,iphone-land-812x360,android-land-915x356,iphoneSE-land-667x325`. Desktop: `desktop-1440x900,desktop-1280x720`.
- The game must be rebuilt (`npm run build`) before the checker sees changes in `src/`. The server re-reads the build on every request.
- Baseline before you start: `output/ui-audit/layout/summary-base.txt`.

Known faults in your screens (from the baseline):
- 18-worldmap: the 「前往…」 travel buttons are squeezed into a vertical column of single characters (51px wide) on phones.
- 17-dispatch: region subtitles such as 「白樺林 · 藥草與花海」 are cut off on phones.
- About 75 READ items across your 9 screens (mostly body text, list labels and buttons at 10px).

## Files you may change
- `src/pixel-style.css`: append ONE block at the very end, starting with the comment `/* 2026-10-30 T06 phone pass B (pi) */`. The file uses CRLF line endings; keep them.
- Nothing else in `src/`. If a fault cannot be fixed with CSS, list it in the report instead.

## Rules for the CSS
1. Every rule goes inside a phone media query: `@media (max-width:760px),(max-height:520px){ ... }`, or the narrower portrait `(max-width:760px) and (min-height:521px)` / landscape `(max-height:520px)` ones. Desktop must not change.
2. Scope every selector to your modals with `#modal[data-type=dungeon]`, `#modal[data-type=worldmap]` and so on (set by `openModal` in `src/pixel-ui.js`). Shared classes like `.pixel-button`, `.modal-intro` or `.party-pick` also appear in Claude's screens, so never style them unscoped.
3. Text: body text, labels and buttons at least 11px; keep headings bigger than body text. Never make text smaller than it is now.
4. Do not hide content to pass the check: no `display:none`, `visibility:hidden`, `overflow:hidden`, `text-overflow` or font-size 0 on text that is currently shown.
5. Buttons must not get smaller. Long labels should wrap onto two lines or the row should rearrange (for example, the travel button moves under the description); single-character columns are never acceptable.

## Steps
1. Read the baseline lines for your screens in `output/ui-audit/layout/summary-base.txt`, and look at the related templates in `src/pixel-ui.js` and existing rules in `src/pixel-style.css` (`grep -n` the class names).
2. Write your CSS into a scratch file `output/pi-results/T06.css`. Test it with `INJECT=output/pi-results/T06.css SCREENS=10,11,12,13,14,15,16,17,18 node pipeline/scripts/ui-audit/layout.mjs <phone devices>`. Repeat until your screens show no FIX or READ lines.
3. Append the block to the end of `src/pixel-style.css`, run `npm run build`, then run the checker on all 8 devices with no SCREENS filter and no INJECT.
   - Your screens: 0 FIX and 0 READ on the 6 phones.
   - Desktop: 0 FIX on both desktop devices.
   - Screens 01–09 and 19 must not get new FIX lines compared with the baseline (READ lines there are Claude's job).
4. Run `npm run verify:quick` in the foreground. The first line of `output/ui-audit/verify-summary.md` must say 全部通過 ("all passed").
5. Write `output/pi-results/T06.md`.

If the same check fails twice in a row after a real attempt, stop and report what is left.

## Acceptance
- Checker on all 8 devices: your 9 screens have no FIX or READ lines on phones; desktop 0 FIX.
- `verify-summary.md` first line says 全部通過.
- Only `src/pixel-style.css` changed in `src/`, by one appended block.

## Report (output/pi-results/T06.md)
- The `== device: N FIX items` lines from the final checker run, and any FIX/READ lines still left in your screens
- Rule count and line count of your CSS block
- The first 5 lines of `verify-summary.md`
- Problems hit, or "none"

## Do not
- Change other files, commit, push, spend PixelLab credits, or send Telegram messages.
