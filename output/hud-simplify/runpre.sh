#!/bin/bash
# usage: runpre.sh <outdir> <target>   (從 repo 根目錄執行) 跑 pre-existing 失敗清單 + 額外檢查
OUT=$1; T=$2
mkdir -p "$OUT"
for c in touch-targets stock-panel panel-mobile scroll-hint; do
  TARGET="$T" timeout 900 node tools/checks/$c.mjs > "$OUT/$c.txt" 2>&1; echo "$c exit=$?" >> "$OUT/_summary.txt"
done
for c in pilot-hud help-nav touch-gestures; do
  TARGET="$T" timeout 900 node output/hud-simplify/copies/$c.mjs > "$OUT/$c.txt" 2>&1; echo "$c exit=$?" >> "$OUT/_summary.txt"
done
echo ALLDONE >> "$OUT/_summary.txt"
