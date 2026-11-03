# T10: six more modal banners with l0veyou (images only, no code wiring)

Status: done
Tier: pi
Context: `docs/ARCHITECTURE.md`. Pattern to copy: card `docs/pi-tasks/T03-banners.md` steps 1–4 (browser, prompt files, generate, crop). Do not do T03 steps 5–8 (code, CSS, verify, Telegram).

> Task card for pi. Images only. Claude reviews the pictures before anything is wired into the game.

## Goal
Six new banner images in the same style as the existing set: build, hunters, difficulty, help, settings, dispatch.

## Files you may change
- `output/l0veyou/prompts/banner-{build,hunters,difficulty,help,settings,dispatch}.txt` (new)
- `output/l0veyou/banner-{build,hunters,difficulty,help,settings,dispatch}-v1.png` (generated)
- `pipeline/scripts/l0veyou/prep_banners.py`, the `CROPS = {...}` line only
- `assets/ui/px-banner-{...}.png` and `.webp` (written by the script)
- `output/ui-audit/banner-contact-T10.png` (new, the contact sheet)

## Steps
1. Open the l0veyou browser as in T03 step 1 (skip if already running) and run the login check; `hasLoginText` must be false, otherwise stop and report.
2. Write six prompt files. Each = the first paragraph (style text) of `output/l0veyou/prompts/banner-trade.txt`, unchanged, then one `Scene:` line:
   - build: `Scene: a village construction site at golden hour, wooden scaffolding around a half-built timber cottage, stacked planks and a rolled blueprint on a trestle table, hammers and a saw, warm light, empty foreground on the left for text.`
   - hunters: `Scene: a hunters' guild hall interior, weapon racks with swords bows and staffs, heraldic banners on a timber wall, a long table with maps and mugs, torchlight, empty foreground on the left for text.`
   - difficulty: `Scene: the dark mouth of a monster den in a rocky cliff, five stone braziers in a row burning from a small flame to a huge red fire, skulls and bones, glowing eyes in the dark, empty foreground on the left for text.`
   - help: `Scene: an old open book on a wooden lectern with a quill and ink bottle, a lit candle, rolled scrolls and a small world map pinned behind, a calm library corner, empty foreground on the left for text.`
   - settings: `Scene: a craftsman's bench with brass gears, a lantern, a small wrench and a half-assembled clockwork box, tools hanging on a pegboard, warm light, empty foreground on the left for text.`
   - dispatch: `Scene: the village gate at dawn, an open wooden gate in a palisade, a dirt road leading out to green hills, a signpost, backpacks and a rolled bedroll waiting by the gate, empty foreground on the left for text.`
   - Every scene must be pixel-art, no text or letters inside the image, no real brands or characters.
3. Generate one at a time, never two at once (same command and `REF` as T03 step 3, once per file, 16:9). If the daily quota message appears or the script exits non-zero: stop, report which files exist, do not retry more than once, do not switch to PixelLab.
4. In `prep_banners.py` append to the `CROPS` dict (default crop for all six): `, 'build': (152, 712), 'hunters': (152, 712), 'difficulty': (152, 712), 'help': (152, 712), 'settings': (152, 712), 'dispatch': (152, 712)`. Run `python -X utf8 pipeline/scripts/l0veyou/prep_banners.py`; it must print one line per entry, and the six new ones must appear.
5. Make one contact sheet: the six new `assets/ui/px-banner-*.png` stacked vertically with their names, saved to `output/ui-audit/banner-contact-T10.png` (PIL is available).

## Acceptance
- `assets/ui/px-banner-{build,hunters,difficulty,help,settings,dispatch}.webp` exist and are each 10–60 KB.
- The contact sheet exists.
- `git status` shows no changed files under `src/`.

## Report (output/pi-results/T10.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- Per image: generation time and webp size in KB; which, if any, were not generated
- Problems hit, or "none"

## Do not
- Edit `src/`, judge how the pictures look, change crop numbers, spend PixelLab credits, commit, or push.
