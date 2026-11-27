#!/bin/bash
# usage: runchecks.sh <outdir> <target> check1 check2 ...   (從 repo 根目錄執行)
OUT=$1; T=$2; shift 2
mkdir -p "$OUT"
for c in "$@"; do
  s=$(date +%s)
  TARGET="$T" timeout 1500 node tools/checks/$c.mjs > "$OUT/$c.txt" 2>&1
  echo "$c exit=$? $(( $(date +%s)-s ))s" >> "$OUT/_summary.txt"
done
echo ALLDONE >> "$OUT/_summary.txt"
