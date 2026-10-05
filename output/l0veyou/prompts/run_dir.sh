#!/bin/bash
# 正面(down)/正背面(up)待機 4 + 走路 6;英雄以 ref-<職業>.png、魔物以 ref-mon3-<名>.png 當參考
cd "$(dirname "$0")/../../.."
for n in "$@"; do r=output/l0veyou/ref-$n.png; [ -f $r ] || r=output/l0veyou/ref-mon3-$n.png
  for d in down up; do [ -f output/l0veyou/dir-$n-$d-v1.png ] || python pipeline/scripts/imagegen/cheaprouter.py output/l0veyou/prompts/dir-$n-$d.txt output/l0veyou/dir-$n-$d-v1.png --ref $r; done; done; echo DIR_DONE
