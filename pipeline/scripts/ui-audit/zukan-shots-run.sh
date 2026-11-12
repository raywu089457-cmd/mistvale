#!/bin/sh
# 用 hv-shots.mjs 對 5193 伺服器截圖: 手機 390x844 與桌機 1440x900
cd "$(dirname "$0")/../../.."
TARGET=http://127.0.0.1:5193/?preview=1 node pipeline/scripts/ui-audit/hv-shots.mjs output/ui-audit/zukan-cmp/ours "${1:-390x844,1440x900}" "${2:-hud,build,hunters,hunter,recruit,trade,craft,dungeon,arena,quests,inspector,inventory,worldmap,settings,help,boss,offline,confirm,toast,tooltip,welcome,advisor,selhunter,unitcard,dispatch,difficulty,region,codex}"
