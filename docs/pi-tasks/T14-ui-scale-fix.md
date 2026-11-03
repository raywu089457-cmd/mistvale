# T14: UI-scale follow-up fixes (exact edits, then verify)

Status: failed
Tier: pi
Context: `docs/ARCHITECTURE.md`. Claude added a UI-size slider to the settings modal (2026-11-01); three follow-up defects remain. Make ONLY the edits below, then verify.

> Task card for pi. Each old string must match exactly once. If one does not match, stop and report which.

## Goal
1. On phones, UI scale above 120% overflows: the bottom bar is cut off and the modal can't be scrolled. Cap the slider at 120% on coarse-pointer/small viewports and let modal content scroll.
2. `measureHud()` measures the HUD while it is zoomed, so `--hud-top`/`--hud-bottom` come out 1.4x too big. Measure unscaled values.
3. Re-run the UI-scale test in desktop and phone modes.

## Files you may change
- `src/pixel-ui.js`, `src/pixel-style.css` (edits below only)
- `pipeline/scripts/ui-audit/uiscale-test.mjs` (add the phone run)
- `output/pi-results/T14.md`

## Steps
1. In `src/pixel-ui.js`, the slider markup line containing `data-uiscale` has:
   old: `min="80" max="140" step="5"`
   new: `min="80" max="${matchMedia('(pointer:coarse)').matches?'120':'140'}" step="5"`
2. In `src/pixel-ui.js`, in `function measureHud(){`, the line begins
   old: ` const st=document.documentElement.style;st.setProperty('--hud-top',Math.max(0,Math.round(top.getBoundingClientRect().bottom))+'px';`
   new: ` const k=Number(document.documentElement.style.getPropertyValue('--ui-scale'))||1,st=document.documentElement.style;st.setProperty('--hud-top',Math.max(0,Math.round(top.getBoundingClientRect().bottom/k))+'px';`
   and on the same line the second call:
   old: `st.setProperty('--hud-bottom',Math.max(0,Math.round(innerHeight-bot.getBoundingClientRect().top))+'px';`
   new: `st.setProperty('--hud-bottom',Math.max(0,Math.round(innerHeight/k-bot.getBoundingClientRect().top/k))+'px';`
   (If these exact strings differ, read the `measureHud` line and make the equivalent change: divide the measured pixel values by `--ui-scale`; report what you changed.)
3. In `src/pixel-style.css`, append:
   ```css
   /* 2026-11-01 T14: zoomed modals must scroll instead of clipping */
   #modal-backdrop>*{min-height:0}
   #modal{overflow-y:auto;overscroll-behavior:contain}
   @media(max-width:760px),(max-height:520px){:root{--ui-scale:min(var(--ui-scale),1.2)}}
   ```
4. In `pipeline/scripts/ui-audit/uiscale-test.mjs`, wrap the existing body so it runs twice: once desktop (`{viewport:{width:1440,height:900}}`) and once phone (`{viewport:{width:402,height:712},deviceScaleFactor:2,isMobile:true,hasTouch:true}`). On phone the maximum is 120: expect 120% to grow the bar and 80% to shrink it, and skip the "value saved" 140% check. Keep the output folder per mode.
5. Run `node pipeline/scripts/ui-audit/uiscale-test.mjs`; all checks must pass in both modes.
6. Run `npm run verify:quick`; first line must say 全部通過.
7. Run `node pipeline/scripts/ui-audit/shots-all.mjs desktop` and `... phone` so Claude can look at the results.

## Acceptance
- `uiscale-test.mjs` prints `all passed` for both modes.
- `verify:quick` says 全部通過.
- On phone at 120%, `#bottom-bar` bottom is <= viewport height and `#modal` bottom <= `#bottom-bar` top (the test checks this; add it if missing).

## Report (output/pi-results/T14.md, at most 15 lines)
- Verdict on line 1: `DONE` / `BLOCKED` / `FAILED`
- The test output for both modes, one line each
- First line of verify-summary
- Problems hit, or "none"

## Do not
- Change `src/pixel-world.js`, commit, push, or spend PixelLab credits.
- Retry a failing check more than once.
