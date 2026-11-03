# T08: dead-code audit of src/ (report only)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md` (file map; the "old version" files are in scope too). Read-only task.

> Task card for pi. Do not change any file except the two output files below.

## Goal
List everything in `src/` that nothing uses: exported names never imported anywhere, and whole files never imported.

## Files you may change
- `output/dead-code-T08.md` (new, the findings, at most 60 lines)
- `output/pi-results/T08.md` (the report)

## Steps
1. For every `.js` file in `src/`, list its `export`ed names.
2. A name is **unused** if it is not imported or referenced in any other file of: `src/`, `build.mjs`, `test-*.mjs`, `verify-gameplay.mjs`, `tools/`, `pipeline/`, `server.mjs`. Using it only inside its own file does not count as used elsewhere (list those as "internal only").
3. A file is **unreferenced** if no other file imports it, and no HTML file in `src/` loads it.
4. Write `output/dead-code-T08.md` with three tables: unused exports (`file | name`), internal-only exports, unreferenced files. Ignore the `*.bak` file.
5. Re-check 5 of your unused exports with a second search to make sure none is used via a dynamic import or a string.

## Acceptance
- `git status` shows no changed tracked files caused by you.
- Every item in the unused list has zero hits outside its own file.

## Report (output/pi-results/T08.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Counts: unused exports, internal-only, unreferenced files
- The 5 items you re-checked
- Problems hit, or "none"

## Do not
- Edit, delete or move any source file, commit, or push.
