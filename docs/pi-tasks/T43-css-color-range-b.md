# T43: css color range b

Status: done
Accept: node tools/checks/css-debt.mjs --track color --range B --max-hex 227 && node tools/checks/css-debt.mjs --track color --range A --max-hex 389 && node pipeline/scripts/ui-audit/style-snapshot.mjs --tol-de 2

## Goal
In src/pixel-style.css, range B only (from the comment line `/* @split color` to end of file): replace every hex colour that is a member of a token in docs/research/ui-palette.json (tokens[].members) with `var(<that token's name>)`.

## Files you may change
- src/pixel-style.css (range B only). Nothing else in the repo. A helper script outside the repo (e.g. in your temp dir) is fine.

## Steps
1. Read docs/research/ui-palette.json. For each token, note its name (use it as written, e.g. `--xxx`, wrap as `var(--xxx)`) and members list. Normalise members to lowercase 6-digit hex (expand 3-digit).
2. Write a small node script that, only on the text from `/* @split color` to end of file, matches 3- or 6-digit hex colours (regex like `#[0-9a-fA-F]{3}(?![0-9a-fA-F])` / `#[0-9a-fA-F]{6}(?![0-9a-fA-F])`; NEVER touch 4- or 8-digit hex), lowercases, expands 3-digit to 6, and if it is a token member replaces it with `var(<token name>)`. Hex not in any token stays unchanged.
3. Do not touch range A (everything before the `/* @split color` comment), including the first `:root{...}` block defining the tokens. Do not edit any other repo file.
4. NEVER run style-snapshot with `--save`; the baseline in output/ui-audit/style-baseline/ must not be re-saved.
5. Run the Accept command and fix until it passes.
