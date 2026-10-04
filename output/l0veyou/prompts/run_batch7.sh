#!/bin/bash
# 第七批:英雄受擊第二格/倒下過程/起身/眨眼、魔物四格走路循環(以現有圖當 REF)
cd "$(dirname "$0")/../../.."
gen(){ local name=$1 ref=$2; ls output/l0veyou/$name-v1.* >/dev/null 2>&1 && return
  REF=$ref node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/$name.txt output/l0veyou/$name-v1.png output/l0veyou/shots 16:9 2>&1 | grep -E "saved|Error|NO_" | tail -1; }
for c in berserker ranger paladin sorcerer darkknight priest; do gen hero-$c-iso-c output/l0veyou/ref-hero-$c.png; done
for m in slime wolf golem; do gen mon-$m-walk4 output/l0veyou/ref-mon-$m.png; done
gen mon-treant-walk4 output/l0veyou/ref-mon-boss.png
echo BATCH7_DONE
