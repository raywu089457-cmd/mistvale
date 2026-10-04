#!/bin/bash
# 第四批:英雄/魔物更多狀態(帶第一批的圖當 REF)。
cd "$(dirname "$0")/../../.."
gen(){ local name=$1 ref=$2; ls output/l0veyou/$name-v1.* >/dev/null 2>&1 && { echo "skip $name"; return; }
  REF=$ref node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/$name.txt output/l0veyou/$name-v1.png output/l0veyou/shots 16:9 2>&1 | grep -E "saved|ref|Error|NO_" | tail -2; }
for c in berserker ranger paladin sorcerer darkknight priest; do gen hero-$c-iso-b output/l0veyou/ref-hero-$c.png; done
for m in slime wolf golem; do gen mon-$m-iso-b output/l0veyou/ref-mon-$m.png; done
gen mon-treant-iso-b output/l0veyou/ref-mon-boss.png
echo BATCH4_DONE
