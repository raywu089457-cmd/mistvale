#!/bin/bash
# 獵魔村風格重生成:idle(無 REF)→ 裁第 1 格當 REF → 其餘動作 + dir down/up(皆 16:9)。用法: run_hv.sh treant wolf ...
cd "$(dirname "$0")/../../.."
H=output/l0veyou/hv2; P=output/l0veyou/prompts_hv
gen(){ [ -f $2-v1.png ] || [ -f $2-v1.jpg ] || { for t in 1 2 3; do REF=$3 node pipeline/scripts/l0veyou/generate.mjs $1 $2-v1 "" 16:9 && break; sleep 20; done; }; }
for n in "$@"; do
  case $n in berserker|paladin|archer|ranger|sorcerer|priest|darkknight) pre=""; acts="walk attack hurt death skill victory";; *) pre="mon3-"; acts="walk attack hurt death";; esac
  gen $P/$pre$n-idle.txt $H/$pre$n-idle $H/styleref/$n.png
  f=$H/$pre$n-idle-v1.png; [ -f $f ] || f=$H/$pre$n-idle-v1.jpg
  python - "$f" "$H/ref-$n.png" <<'PY'
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB');w,h=im.size;c=im.crop((0,0,w//4,h))
W=max(c.size)+40;o=Image.new('RGB',(W,W),(0,255,0) if 'sorcerer' in sys.argv[2] else (255,0,255));o.paste(c,((W-c.width)//2,(W-c.height)//2));o.save(sys.argv[2])
PY
  for a in $acts; do gen $P/$pre$n-$a.txt $H/$pre$n-$a $H/ref-$n.png; done
  for d in down up; do gen $P/dir-$n-$d.txt $H/dir-$n-$d $H/ref-$n.png; done
  echo "DONE $n"
done
# extra: villagers (call with: run_hv.sh --villagers)
