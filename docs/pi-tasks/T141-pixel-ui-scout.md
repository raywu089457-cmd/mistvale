# T141: scout: map the DOM UI for an all-canvas pixelfx UI experiment

Status: done
Type: scout

## Goal
Read-only scout. Experiment (branch `exp/pixel-ui`): redraw the WHOLE game UI/UX of mistvale with pixelfx-style canvas drawing (pixel panels, buttons, bars, Ark Pixel 12 Chinese text) instead of DOM/CSS. The DOM version on `main` stays untouched. Also read (never edit) the pixelfx checkout `C:/Users/ray/Desktop/Claude code/pixelfx`: `src/core/text.js`, `src/core/glyphs-ark.js`, `src/core/fonts/`, the Painter in `src/core/`, `src/fx/ui/_lib.js`, and `gallery/ui-lab/` (`lab.js`, `pixel-text.js`). Answer with file and function/selector names (no line numbers):
1. Inventory of every UI surface in mistvale: HUD (top clock, resources, hero cards...), panels/modals (guild, quests, inventory, shop, settings...), log/toast/tooltip, menus, mobile layout. For each: which function in `src/pixel-ui.js` (or elsewhere) builds it, its main CSS block in `src/pixel-style.css`, how it updates (re-render vs patch), and what input it takes (click, hover, drag, scroll, text input).
2. Where the game canvas is created and its pixel scale / resize logic (`src/pixel-game.js`, `src/gl-renderer.js`, `src/landscape-layout.js`): could a second full-screen UI canvas sit on top at the same pixel grid? Is there already a per-frame hook to draw it?
3. What pixelfx gives us for this: Painter primitives, the text API (mixed CJK/latin, measure width/height, scale, outline/shadow), how glyphs are stored (subset? which characters? note `擊` is missing), and whether these modules can be copied into mistvale as plain ES modules with no build step. Which font/glyph files mistvale already ships (`Ark Pixel`?).
4. Hard parts for an all-canvas UI: scrolling lists, text wrapping, text input fields, hit-testing/click routing, accessibility, tests that read DOM (which `npm test` checks query DOM selectors of the UI and would break?).
5. Recommend a staged plan of 4–6 cards for the experiment, smallest useful first (e.g. vendor pixelfx text+painter → UI canvas layer + hit-testing → HUD → one panel → rest), keeping the DOM UI behind a toggle so both can be compared, and how each card could be accepted by a command.
Write a brief of at most 60 lines.
