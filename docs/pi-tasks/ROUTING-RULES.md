# Routing rules (input to the classifier)

Classify each work item into exactly one tier. Pick the cheapest tier that can do the item reliably.

## pi (DeepSeek v4.1 Flash via pi; cheapest)
- Scripted or mechanical work whose result is judged by a command, not by looking at it:
  - `npm run verify`, `npm run verify:quick`, `npm test`, build, screenshots
- Running existing pipelines:
  - l0veyou image generation with a given prompt file, then an existing `prep_*.py` crop script
  - PixelLab only when a budget is stated
- Appending content in an existing format:
  - dialogue lines, quest or help text, item descriptions
- Changing numbers the user already specified (prices, stats) in `src/pixel-data.js`
- Docs and changelogs from `git diff`; git commit/push when the user said 推 or 交接
- Environment chores: restart the game server, open the l0veyou browser, clean output folders
- Code edits only when the exact old string → new string is written in the task card

## sonnet (Claude Sonnet)
- UI layout, CSS, and modal template implementation in `src/pixel-ui.js` / `src/pixel-style.css`
- Wiring new assets into the game
- Small features touching 2–4 files
- Fixes inside one file that the tests or the button crawler will catch

## opus (Claude Opus)
- Hunter AI, combat timing, dungeon, offline progress, save/load and migrations
- Balance changes with knock-on effects, and cross-file design or refactors
- Anything that needs visual judgement ("does this look good?") or a design decision
- Hard-to-reproduce bugs
- Writing task cards for pi

## Output
Reply only with a JSON array:
`[{"i": <item number>, "tier": "pi"|"sonnet"|"opus", "why": "<= 10 words"}]`
