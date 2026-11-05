# T63: 產生 UI/UX 全畫面拼圖(2026-11-05)

Status: done
Accept: node -e "const {statSync}=require('fs');for(const f of ['montage-desktop.png','montage-phone.png','notes.md']){const s=statSync('output/ui-audit/uiux-1105/'+f);if(Date.now()-s.mtimeMs>6*3600e3||s.size<1000)throw new Error('stale or empty '+f)}console.log('ok')"

## Goal
Produce two labeled montages of every UI screen with the current code (including uncommitted changes) so Claude can judge each device in one look. Write them to `output/ui-audit/uiux-1105/`. Do not change any file under src/.

Settled decisions (from scout T62):
- Start the game server first. Shoot with `pipeline/scripts/ui-audit/shots-all.mjs`, desktop 1440x900 and phone 390x844. Seed resources the way layout.mjs does (gold 99999, materials 9999, gems 999) so trade, craft and recruit aren't empty. Also shoot the region (regionInfo), density (densityFor) and offline modals. A small edit to shots-all.mjs, or a helper next to it under pipeline/scripts/ui-audit/, is fine.
- Crop every modal tile to `#modal` plus a 16 px margin. Keep hud and worldmap as full-screen tiles.
- Montage: write a reusable `pipeline/scripts/ui-audit/montage.mjs` (or a .py file using PIL). It writes `montage-desktop.png` and `montage-phone.png`, each at most 3000 px on its long side, with the screen name printed above each tile. Choose the grid and scale so modal text is at least ~10 px tall.
- Run `layout.mjs desktop-1440x900,iphone-402x712,android-360x640` and `small-text.mjs iphone-402x712`. Use 402x712 as the stand-in for 390x844.
- Write `notes.md`, at most 25 lines:
  - FIX/READ counts per device;
  - every RULE line from small-text;
  - any screen that failed to open or whose crop missed;
  - the montage file names.
