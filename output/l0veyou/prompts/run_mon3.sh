#!/bin/bash
# 新規格魔物:idle(以舊魔物圖當 REF)→ 其他動作以新 idle 第 1 格當 REF
cd "$(dirname "$0")/../../.."
G="python pipeline/scripts/imagegen/cheaprouter.py"
for m in "$@"; do r=$m; [ $m = treant ] && r=boss
  [ -f output/l0veyou/mon3-$m-idle-v1.png ] || $G output/l0veyou/prompts/mon3-$m-idle.txt output/l0veyou/mon3-$m-idle-v1.png --ref output/l0veyou/ref-mon-$r.png
  python - "$m" <<'PY'
import sys
from PIL import Image
m=sys.argv[1];im=Image.open(f'output/l0veyou/mon3-{m}-idle-v1.png').convert('RGB');w,h=im.size;c=im.crop((0,0,w//4,h))
W=max(c.size)+40;o=Image.new('RGB',(W,W),(255,0,255));o.paste(c,((W-c.width)//2,(W-c.height)//2));o.save(f'output/l0veyou/ref-mon3-{m}.png')
PY
  for a in walk attack hurt death; do [ -f output/l0veyou/mon3-$m-$a-v1.png ] || $G output/l0veyou/prompts/mon3-$m-$a.txt output/l0veyou/mon3-$m-$a-v1.png --ref output/l0veyou/ref-mon3-$m.png; done
  echo "DONE $m"
done
