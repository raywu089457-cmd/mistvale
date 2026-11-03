# T09: API reference for every src/ module (docs only)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map). Source files are in `src/`; read each one you document.

> Task card for pi. Write documentation only. Do not edit any source file.

## Goal
`docs/API-pi.md`: a reference that lets a future agent find what an export does without opening the source file.

## Files you may change
- `docs/API-pi.md` (new)
- `output/pi-results/T09.md` (the report)

## Steps
1. Cover every `.js` file in `src/` (skip `*.bak`). Order: the "pixel-*" game files first, then map/nav files, then the old-version files.
2. One `##` section per file with a one-line purpose (at most 20 words), then one bullet per export:
   `` - `name(args)` (line N): what it does, at most 15 words ``
   For constants, give the shape instead of args (`` `BUILDINGS` ??array of building defs {id,name,x,z,w,d,cost,...} ``).
3. For `src/pixel-game.js` also list the methods of the object that `createGame` returns (the public game API, e.g. `startDungeon`, `setDungeonAuto`), same bullet format. That object is the most used surface; do not skip it.
4. Describe behaviour you read in the code. Do not guess. If you cannot tell what something does, write `unclear` and move on.
5. Write in English. Keep the whole file under 450 lines.
6. Check coverage: `node tools/check-api-doc.mjs docs/API-pi.md`. It prints the missing exports; fix them and re-run until `missing 0`.

## Acceptance
- `node tools/check-api-doc.mjs docs/API-pi.md` exits 0 (`missing 0`).
- Every `(line N)` you wrote points at a line where that name is defined (spot-check 10 yourself and list them in the report).
- `git status` shows no changed tracked source files from you.

## Report (output/pi-results/T09.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Exports documented, number marked `unclear`, file length in lines
- The 10 line-number spot-checks
- Problems hit, or "none"

## Do not
- Edit any source file, commit, or push.
- Keep going after the same error appears twice: stop and report.
