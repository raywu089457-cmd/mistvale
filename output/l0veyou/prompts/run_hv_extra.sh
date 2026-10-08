#!/bin/bash
cd "$(dirname "$0")/../../.."
until grep -q "DONE treant" output/l0veyou/hv2/run.log; do sleep 15; done
bash output/l0veyou/prompts/run_hv.sh archer ranger sorcerer priest darkknight
H=output/l0veyou/hv2
for t in 1 2 3; do [ -f $H/villagers-v1.png ] || REF=$H/styleref/archer.png node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts_hv/villagers.txt $H/villagers-v1 "" 16:9 || sleep 20; done
echo "DONE villagers"
