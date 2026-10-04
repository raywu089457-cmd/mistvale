#!/bin/bash
# 第六批:建築單張高細節重繪(以目前建築圖當 REF),像素密度跟英雄一致。
cd "$(dirname "$0")/../../.."
for k in hall trading restaurant inn tavern clinic forge academy training sanctuary house bounty enhancement dungeon monument; do
  ls output/l0veyou/bldhd-$k-v1.* >/dev/null 2>&1 && continue
  REF=output/l0veyou/ref-bld-$k.png node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/bldhd-$k.txt output/l0veyou/bldhd-$k-v1.png output/l0veyou/shots 1:1 2>&1 | grep -E "saved|Error|NO_" | tail -1
done; echo BATCH6_DONE
