# T47: remove CSS declarations that never win

Status: done
Accept: node pipeline/scripts/ui-audit/style-snapshot.mjs --devices all --dir output/ui-audit/style-baseline-k2

## Goal
`src/pixel-style.css` contains declarations that are always overridden by a later rule, so editing them changes nothing on screen (for example, the first rule that uses `#e9d6a8` is dead). Remove such dead declarations (any property, not only colours and font sizes) without changing any rendered style on the 10 snapshot sizes. Only `src/pixel-style.css` may change. In the result, report how many declarations and how many now-empty rules were removed, and which `@media` regions they came from.
