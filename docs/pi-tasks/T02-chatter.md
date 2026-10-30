# T02: more hero speech-bubble lines

> Task card for pi. Add lines only. Do not change how a line gets picked.

## Goal
Hero speech bubbles get more variety, so players see the same line less often. Add 3–5 new lines to every category.

## Files you may change
- `src/hero-chatter.js`, but only the contents of its string arrays.

## Steps
1. Read `src/hero-chatter.js`. The lines are in these arrays:
   - `NEED`: hurt, hungry, tired, sad
   - `STATUS`: fight, kite, depart, search, chase, home, eat, drink, rest, heal, trade, gear, idle, revive, dungeonGo, dungeon, arena, wander, pilot
   - `CLASS_FIGHT`: one array per class
   - `TRAIT`: one array per trait
   - `NIGHT`, `RICH`
2. Add 3–5 lines to each array, following these rules:
   - **Traditional Chinese** (these are player-facing), colloquial and short: **at most 12 characters per line**. A test enforces this.
   - Sound like a real person: personality, a little humour, grumbling, self-talk.
   - Fit the category. For example, `hungry` is about food; `CLASS_FIGHT.priest` is about healing or prayer.
   - Only `depart` may use `{region}`, which is replaced with the destination name.
   - No duplicates within an array. No characters, quotes or lyrics from existing works.
3. Only add strings inside the arrays. Do not change functions, array names, or existing lines.

## Acceptance
- The first line of the `npm run verify:quick` summary says 全部通過 ("all passed"). The test suite checks the 12-character limit.
- This command prints `dup 0`:
  `node -e "import('./src/hero-chatter.js').then(m=>{const L=m.CHATTER_LINES;const all=Object.values(L).flatMap(v=>Array.isArray(v)?v:Object.values(v).flat());console.log('lines',all.length,'dup',all.length-new Set(all).size)})"`
  The count was 141 lines before this card.

## Report (output/pi-results/T02.md)
- Lines added per category, and the new total
- The text of `verify-summary.md`

## Do not
- Change `pickHeroLine` or any other function, change any other file, commit, or push.
