#!/bin/bash
# 四個斜角方向:右下(dr,3/4 正面)、右上(ur,3/4 背面);左下/左上 = 鏡像。
# 每個角色:dr-idle(以側面設計圖當參考)→ ur-idle(以新 dr-idle 第 1 格當參考)→ 其他動作各以同方向 idle 第 1 格當參考。
cd "$(dirname "$0")/../../.."
G="python pipeline/scripts/imagegen/cheaprouter.py"; L=output/l0veyou
mkref(){ python - "$1" "$2" <<'PY'
import sys
from PIL import Image
src,out=sys.argv[1:];im=Image.open(src).convert('RGB');w,h=im.size;c=im.crop((0,0,w//4,h));bg=im.getpixel((4,4))
W=max(c.size)+40;o=Image.new('RGB',(W,W),bg);o.paste(c,((W-c.width)//2,(W-c.height)//2));o.save(out)
PY
}
for n in "$@"; do r0=$L/ref-$n.png; [ -f $r0 ] || r0=$L/ref-mon3-$n.png
  [ -f $L/d4-$n-idle-dr-v1.png ] || $G $L/prompts/d4-$n-idle-dr.txt $L/d4-$n-idle-dr-v1.png --ref $r0
  mkref $L/d4-$n-idle-dr-v1.png $L/ref-d4-$n-dr.png
  [ -f $L/d4-$n-idle-ur-v1.png ] || $G $L/prompts/d4-$n-idle-ur.txt $L/d4-$n-idle-ur-v1.png --ref $L/ref-d4-$n-dr.png
  mkref $L/d4-$n-idle-ur-v1.png $L/ref-d4-$n-ur.png
  for f in $L/prompts/d4-$n-*-dr.txt $L/prompts/d4-$n-*-ur.txt; do b=$(basename $f .txt); d=${b##*-}
    [ -f $L/$b-v1.png ] || $G $f $L/$b-v1.png --ref $L/ref-d4-$n-$d.png; done
  echo "DONE $n"; done; echo D4_DONE
