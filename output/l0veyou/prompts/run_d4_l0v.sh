#!/bin/bash
# run_d4.sh 的 l0veyou 版:同樣的 prompt/參考圖,用已登入的 l0veyou 瀏覽器(CDP 9447)GPT Image 2、16:9;背景不是純洋紅/綠就重生(最多 3 次)。
cd "$(dirname "$0")/../../.."
L=output/l0veyou; export MODEL="${MODEL:-GPT Image 2}"
gen(){ for t in 1 2 3; do REF=$3 timeout 400 node pipeline/scripts/l0veyou/generate.mjs $1 $2 "" 16:9 >/dev/null 2>&1
  if [ -f $2 ] && python -c "import sys;sys.path.insert(0,'pipeline/scripts/imagegen');import cheaprouter as c;ok,w=c.background_ok(open('$2','rb').read());print(w);sys.exit(0 if ok else 1)"; then echo "saved $2"; return; fi
  rm -f $2; echo "retry $t $2"; done; echo "failed $2"; }
mkref(){ python - "$1" "$2" <<'PY'
import sys
from PIL import Image
src,out=sys.argv[1:];im=Image.open(src).convert('RGB');w,h=im.size;c=im.crop((0,0,w//4,h));bg=im.getpixel((4,4))
W=max(c.size)+40;o=Image.new('RGB',(W,W),bg);o.paste(c,((W-c.width)//2,(W-c.height)//2));o.save(out)
PY
}
for n in archer berserker ranger paladin sorcerer slime wolf golem treant; do
  r0=$L/ref-$n.png; [ -f $r0 ] || r0=$L/ref-mon3-$n.png
  [ -f $L/d4-$n-idle-dr-v1.png ] || gen $L/prompts/d4-$n-idle-dr.txt $L/d4-$n-idle-dr-v1.png $r0
  [ -f $L/ref-d4-$n-dr.png ] || mkref $L/d4-$n-idle-dr-v1.png $L/ref-d4-$n-dr.png
  [ -f $L/d4-$n-idle-ur-v1.png ] || gen $L/prompts/d4-$n-idle-ur.txt $L/d4-$n-idle-ur-v1.png $L/ref-d4-$n-dr.png
  [ -f $L/ref-d4-$n-ur.png ] || mkref $L/d4-$n-idle-ur-v1.png $L/ref-d4-$n-ur.png
  for f in $L/prompts/d4-$n-*.txt; do b=$(basename $f .txt); d=${b##*-}; [ -f $L/$b-v1.png ] || gen $f $L/$b-v1.png $L/ref-d4-$n-$d.png; done
done; echo L0V_DONE
