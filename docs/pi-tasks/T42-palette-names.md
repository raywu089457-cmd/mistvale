# T42: name the 66 UI colour tokens

Status: failed
Accept: node tools/checks/css-palette.mjs --check docs/research/ui-palette.json

## Goal
Every entry in `docs/research/ui-palette.json` gets a semantic CSS custom-property name instead of the placeholder `--c-NN`, so the CSS can later use `var(--name)`.

## Files you may change
- `docs/research/ui-palette.json` (only the `name` field of each token)

## Steps
1. Read `docs/research/ui-palette.json`. Each token has `value` (hex), `members`, `uses` and `selectors` (where it is used).
2. Look at the existing tokens in the `:root` block at the top of `src/pixel-style.css` (read only that block) and follow their naming style; do not reuse any of those names.
3. For each token write a name of the form `--<role>-<variant>`: role from where it is used (e.g. `wood`, `parchment`, `ink`, `gold`, `danger`, `ok`, `shadow`, `panel`, `text`), variant from lightness or use (`dark`, `mid`, `light`, `muted`, `edge`, `hi`). Names must be lowercase kebab-case and unique. Pure black/white may be `--black` / `--white`.
4. Change nothing else in the file (not `value`, `members`, `uses`, `A`, `B`, `selectors`, order or formatting of other fields). Edit the JSON with a small node script that only rewrites `name`.
5. Run `node tools/checks/css-palette.mjs --check docs/research/ui-palette.json` until it prints 0 problems.
6. In the result file list 5 example renames and any names you were unsure about.
