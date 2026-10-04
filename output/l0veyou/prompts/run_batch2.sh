#!/bin/bash
# 依序生第二批(每張開新對話)。魔物 slime/wolf/golem 帶第一批的待機圖當 REF,讓外型一致。
cd "$(dirname "$0")/../../.."
gen(){ local name=$1 ratio=$2 ref=$3; [ -f output/l0veyou/$name-v1.png ] && { echo "skip $name"; return; }
  if [ -n "$ref" ]; then REF=$ref node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/$name.txt output/l0veyou/$name-v1.png output/l0veyou/shots $ratio 2>&1 | tail -2
  else node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/$name.txt output/l0veyou/$name-v1.png output/l0veyou/shots $ratio 2>&1 | tail -2; fi; }
for n in bld-iso-game-b bld-iso-game-c bld-iso-game-d; do gen $n 16:9; done
gen mon-slime-iso-v2 16:9 output/l0veyou/ref-iso-slime.png
gen mon-wolf-iso-v2 16:9 output/l0veyou/ref-iso-wolf.png
gen mon-golem-iso-v2 16:9 output/l0veyou/ref-iso-golem.png
gen mon-treant-iso-v2 16:9
for n in terrain-iso-v2 props-iso-v2 nature-iso-v2; do gen $n 16:9; done
echo BATCH2_DONE
