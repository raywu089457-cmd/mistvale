#!/bin/bash
# 背面 3/4(往右上走)待機 4 + 走路 6,以正面設計表第 1 格當 REF
cd "$(dirname "$0")/../../.."
for h in "$@"; do [ -f output/l0veyou/$h-back-v1.png ] || python pipeline/scripts/imagegen/cheaprouter.py output/l0veyou/prompts/$h-back.txt output/l0veyou/$h-back-v1.png --ref output/l0veyou/ref-$h.png; done; echo BACK_DONE
