#!/bin/bash
cd "$(dirname "$0")/../../.."
for n in grass meadow forest taiga snow mountain desert water ice dirt stone soil; do
  ls output/l0veyou/tex2-$n-v1.* >/dev/null 2>&1 && continue
  node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts/tex2-$n.txt output/l0veyou/tex2-$n-v1.png output/l0veyou/shots 1:1 2>&1 | grep -E "saved|Error|NO_" | tail -1
done; echo BATCH5_DONE
