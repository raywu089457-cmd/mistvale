# T18: study The Mana World UI/UX + typography and propose improvements for mistvale (read-only report)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Read only the files listed below; do not explore the repo. Read-only research card: write one report file, change nothing else. Earlier typography work: cards T15, T16 and `docs/UIUX-PLAN-2026-11-01.md`.

> Task card for pi. Do the steps in order and do not widen the scope. Run every command in the foreground. When finished, write the result to `output/pi-results/T18.md` in English.
> The dispatcher is the only one that edits `Status:`. Never edit this card; all output goes to the result file.

## Goal
A report `output/tmw-ui-study.md` that describes how The Mana World's client (Mana) builds its UI skin and text, compares it with mistvale's current UI, and proposes concrete, prioritized changes for mistvale (CSS token / file level).

## Source (read-only)
- Mana client GUI theme, copied into this repo: `output/tmw-ref/gui/` (start with `theme.xml`; it maps widgets to 9-slice PNGs, colors, fonts) and `output/tmw-ref/fonts/` (font files).
- TMW data: `C:\Users\ray\open-mmo\tmw\tmwa-client-data\` — `equipmentwindow.xml`, `emotes.xml`, `graphics/guiicons/`, `graphics/images/` (weapon-type icons, login wallpapers), `deadmessages.xml`.
- Check PNG sizes with a node/python one-liner; 9-slice border sizes come from theme.xml.

## mistvale files to compare (read only)
`src/pixel-style.css` (grep `--font`, `font-size`, `font-family`, `:root`), `src/pixel-index.html` (font links), `docs/UIUX-PLAN-2026-11-01.md`, `docs/pi-tasks/T15-typography-pass.md`, `docs/pi-tasks/T16-typography-layout.md`. Do not read `src/pixel-game.js` or `src/pixel-world.js`.

## Files you may change
- `output/tmw-ui-study.md` (create)
- `output/pi-results/T18.md` (create)

## Steps
1. Read `theme.xml` fully; list every font (file, size, role), every color token, every skinned widget and its 9-slice border sizes.
2. List the font files; note pixel vs vector, and CJK coverage (mistvale UI is Traditional Chinese; DejaVu has no CJK glyphs).
3. From TMW data: equipment window slot layout, icon sizes, text color conventions (damage numbers, chat, names) where visible.
4. Grep mistvale's CSS: current font stacks, size scale, color tokens.
5. Write `output/tmw-ui-study.md` with exactly these `##` sections: `Theme system`, `Typography`, `Color tokens`, `Windows and widgets`, `Icons and equipment window`, `Text feedback`, `mistvale today`, `What to borrow`, `What not to borrow`, `Proposed changes`. `Proposed changes` = 6–12 numbered items, each with: target file + selector/token, before → after value, priority P1/P2/P3, and whether a human visual check is needed. Respect the existing floor: no desktop text under 10px, no phone text under 11px.

## Acceptance (all must pass)
- `node -e "const t=require('fs').readFileSync('output/tmw-ui-study.md','utf8');const s=['Theme system','Typography','Color tokens','Windows and widgets','Icons and equipment window','Text feedback','mistvale today','What to borrow','What not to borrow','Proposed changes'];const m=s.filter(x=>!t.includes('## '+x));if(m.length){console.error('missing',m);process.exit(1)}console.log('ok')"`
- You changed nothing under `src/` or `assets/`.

## Report (write to output/pi-results/T18.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Files created
- Top 3 P1 proposed changes, one line each
- Problems hit, or "none"

## Do not
- Edit any `src/` file — proposals only; Claude decides what to apply.
- Copy TMW/Mana art or fonts into `assets/` (license differs).
- Commit or push.
- Keep going after the same check fails twice: stop and report.
