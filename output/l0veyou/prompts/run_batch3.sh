#!/bin/bash
# 第三批:依序生圖(已存在就跳過)。地貌/道具/特效/圖示用 16:9,英雄 5x2 用 16:9,標題 16:9,材質 1:1。
cd "$(dirname "$0")/../../.."
gen(){ local name=$1 ratio=$2; ls output/l0veyou/$name-v1.* >/dev/null 2>&1 && { echo "skip $name"; return; }
  node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/$name.txt output/l0veyou/$name-v1.png output/l0veyou/shots $ratio 2>&1 | tail -1; }
for n in misc-iso-v1 wild-iso-v1 farm-iso-v1 yard-iso-v1 vfx-iso-v1 icons-iso-a icons-iso-b \
         hero-berserker-iso hero-ranger-iso hero-paladin-iso hero-sorcerer-iso hero-darkknight-iso hero-priest-iso title-iso; do gen $n 16:9; done
for n in tex-grass tex-meadow tex-forest tex-taiga tex-snow tex-mountain tex-desert tex-water tex-ice tex-dirt tex-stone tex-soil; do gen $n 1:1; done
echo BATCH3_DONE
