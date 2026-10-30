# T03: illustrated banners for the Craft and Warehouse modals

> Task card for pi. Images come from l0veyou (free). The code edits are the exact replacements given below.

## Goal
The tops of the 「製作與庫存」 (craft) and 「村莊倉庫」 (warehouse) modals get illustrated banners in the same style as the trade and quests banners: dark on the left, the scene on the right.

## Files you may change
- `output/l0veyou/prompts/banner-craft.txt` and `banner-inventory.txt` (new)
- `output/l0veyou/banner-craft-v1.png` and `banner-inventory-v1.png` (the raw generated images)
- `pipeline/scripts/l0veyou/prep_banners.py`, the `CROPS` line only
- `assets/ui/px-banner-craft.*` and `assets/ui/px-banner-inventory.*` (written by the script)
- `src/pixel-ui.js`, only the two replacements below
- `src/pixel-style.css`, only by appending the block below at the end of the file

## Steps
1. **Open the l0veyou browser** (skip if it is already running). Start it in the background with a long timeout:
   `"C:/Users/ray/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe" --remote-debugging-port=9447 --user-data-dir="C:/Users/ray/Documents/Codex/2026-09-29/new-chat/work/.l0veyou-profile-copy" --disable-gpu https://l0veyou.com/chat`
   - Login check: `node "C:/Users/ray/Desktop/Claude code/l0veyou-test/check.mjs"`. `hasLoginText` must be false.
   - If it is true, stop and ask the user to log in by hand in that window.
2. **Write the prompt files.** Copy the **first paragraph** (the style text) of `output/l0veyou/prompts/banner-trade.txt` unchanged as the start of both new files. Then add the matching scene as the second paragraph:
   - `banner-craft.txt`: `Scene: a cozy village workshop interior, a blacksmith anvil with glowing hot metal, a stone forge with orange fire, hanging hammers and tongs, a workbench with bread loaves, berry juice jugs, folded blankets and rolled bandages, warm firelight, no people.`
   - `banner-inventory.txt`: `Scene: a village storehouse interior with wooden beams, neatly stacked crates and barrels, piles of logs, sacks of flour, bundles of herbs hanging from the ceiling, iron ore in a cart, a lantern on a post, soft warm light, no people.`
3. **Generate the images**, one at a time and never two at once:
   ```
   export REF="C:/Users/ray/Documents/Codex/2026-09-29/new-chat/work/mistvale/assets/ui/px-banner-dungeon.png"
   node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/banner-craft.txt output/l0veyou/banner-craft-v1.png "" 16:9
   node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/banner-inventory.txt output/l0veyou/banner-inventory-v1.png "" 16:9
   ```
   - If the page shows 「今日免費額度已用完」 (daily quota used up) or the script exits with a non-zero code, stop and report. Retry at most once. Do not switch to PixelLab.
4. **Crop.** In `prep_banners.py`, append `, 'craft': (152, 712), 'inventory': (152, 712)` right after `'quests': (120, 680)` in the `CROPS = {...}` line. Then run `python -X utf8 pipeline/scripts/l0veyou/prep_banners.py`; it must print 6 lines.
5. **Code replacements** in `src/pixel-ui.js`. Each old string must match exactly once.
   - Old: `if(type==='craft')return \`<p class="modal-intro">把材料轉成獵人需要的生活物資與裝備。服務會由獵人付費，回到村莊金庫。</p>`
     New: `if(type==='craft')return \`<div class="encounter-banner craft"><i>${iconHTML('anvil')}</i><div><h3>製作與庫存</h3><p>把材料轉成獵人需要的生活物資與裝備。服務會由獵人付費，回到村莊金庫。</p></div></div>`
   - Old: `if(type==='inventory')return \`<p class="modal-intro">村莊倉庫保存建材、生活物資與鐵匠鋪製作的裝備。</p>`
     New: `if(type==='inventory')return \`<div class="encounter-banner inventory"><i>${iconHTML('chest')}</i><div><h3>村莊倉庫</h3><p>村莊倉庫保存建材、生活物資與鐵匠鋪製作的裝備。</p></div></div>`
6. **CSS.** Append this block at the end of `src/pixel-style.css`:
   ```css
   /* 2026-10-30 T03: craft and warehouse banners (l0veyou, same set as trade) */
   .encounter-banner.craft,.encounter-banner.inventory{position:relative;min-height:118px;align-items:flex-end;padding:16px 20px;background-size:cover;background-position:center 45%;image-rendering:pixelated;border:3px solid #1d120a;box-shadow:inset 0 0 0 1px #c9a45e99,0 3px 10px #0007}
   .encounter-banner.craft{background-image:linear-gradient(90deg,#1a0f07f2 0,#1a0f07c8 42%,#1a0f0722 78%,#1a0f0700),var(--ui-px-banner-craft,none)}
   .encounter-banner.inventory{background-image:linear-gradient(90deg,#1a0f07f2 0,#1a0f07c8 42%,#1a0f0722 78%,#1a0f0700),var(--ui-px-banner-inventory,none)}
   .encounter-banner.craft>i,.encounter-banner.inventory>i{display:none}
   .encounter-banner.craft h3,.encounter-banner.inventory h3{text-shadow:0 2px #000}
   .encounter-banner.craft p,.encounter-banner.inventory p{max-width:58%;text-shadow:0 1px #000;color:#f0dfb8}
   @media(max-width:760px),(max-height:520px){.encounter-banner.craft p,.encounter-banner.inventory p{max-width:none}.encounter-banner.craft,.encounter-banner.inventory{min-height:96px}}
   ```
7. Run `npm run verify`.
8. **Screenshots.**
   - Run `node pipeline/scripts/ui-audit/shots-all.mjs desktop` and `node pipeline/scripts/ui-audit/shots-all.mjs phone`.
   - With send-to-telegram, send these four files from `output/ui-audit/shots/` to the user and ask whether the banners look good: `desktop-craft.png`, `desktop-inventory.png`, `phone-craft.png`, `phone-inventory.png`.
   - Do not judge the looks yourself.

## Acceptance
- The first line of `verify-summary.md` says 全部通過 ("all passed").
- `assets/ui/px-banner-craft.webp` and `px-banner-inventory.webp` exist and are each 10–60 KB.

## Report (output/pi-results/T03.md)
- Generation time and file size of each image
- The text of `verify-summary.md`
- Whether the screenshots were sent to Telegram

## Do not
- Spend PixelLab credits, commit, or push.
- Change the crop numbers yourself if the user says the subject is cut off or the banner looks bad. Hand that back to Claude.
