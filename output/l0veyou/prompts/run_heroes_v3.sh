#!/bin/bash
# 新規格英雄量產(cheaprouter gpt-image-2,CHEAPROUTER_KEY 環境變數)。用法:bash run_heroes_v3.sh berserker ranger ...
cd "$(dirname "$0")/../../.."
G="python pipeline/scripts/imagegen/cheaprouter.py"
for h in "$@"; do
  [ -f output/l0veyou/$h-idle-v1.png ] || $G output/l0veyou/prompts/$h-idle.txt output/l0veyou/$h-idle-v1.png --ref output/l0veyou/ref-hero-$h.png
  python - "$h" <<'PY'
import sys
from PIL import Image
h=sys.argv[1];im=Image.open(f'output/l0veyou/{h}-idle-v1.png').convert('RGB');w,hh=im.size;c=im.crop((0,0,w//4,hh))
bg=im.getpixel((5,5));W=max(c.size)+40;o=Image.new('RGB',(W,W),bg);o.paste(c,((W-c.width)//2,(W-c.height)//2));o.save(f'output/l0veyou/ref-{h}.png')
PY
  for a in walk attack skill hurt death victory; do
    [ -f output/l0veyou/$h-$a-v1.png ] || $G output/l0veyou/prompts/$h-$a.txt output/l0veyou/$h-$a-v1.png --ref output/l0veyou/ref-$h.png
  done
  [ -f output/l0veyou/$h-fx-v1.png ] || $G output/l0veyou/prompts/$h-fx.txt output/l0veyou/$h-fx-v1.png
  echo "DONE $h"
done
