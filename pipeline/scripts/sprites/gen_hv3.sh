#!/bin/bash
# gen_hv3.sh name... : 依序生成 prompts_hv3 的各張表並用 chk_sheet.py 驗尺寸(不合格重生,最多 5 次);同一時間只能一個 generate.mjs。
# idle 高度取自 sprites/characters/<ID>/export/*_idle_v01.json(先跑 make_idle.py);沒有就跳過檢查。
cd "$(dirname "$0")/../../.."
H=output/l0veyou/hv3; P=output/l0veyou/prompts_hv3
for n in "$@"; do
  ref=$H/ref-${n#mon3-}.png; [ -f "$ref" ] || cp output/l0veyou/hv2/ref-${n#mon3-}.png $ref
  U=$(echo ${n#mon3-} | tr a-z A-Z); ij=$(ls sprites/characters/*_${U}_001/export/*_idle_v01.json 2>/dev/null | head -1)
  ih=""; [ -n "$ij" ] && ih=$(python -c "import json;print(json.load(open('$ij'))['characterHeight']//4)")
  for f in $P/$n-*.txt; do k=$(basename $f .txt); k=${k#$n-}; out=$H/$n-$k-v1.png
    [ -f $out ] && continue
    cols=4; rows=$(grep -o "in a 4x[12] grid" $f | head -1 | sed 's/.*4x\([12]\).*/\1/')
    for try in 1 2 3 4 5; do
      REF=$ref node pipeline/scripts/l0veyou/generate.mjs $f $out "" 16:9 2>&1 | tail -1
      [ -f $out ] || continue
      [ -z "$ih" ] && break
      if [[ $k == *-b ]]; then python pipeline/scripts/sprites/chk_sheet.py $out $cols $rows $ih $H/$n-${k%-b}-a-v1.png 2>/dev/null; else python pipeline/scripts/sprites/chk_sheet.py $out $cols $rows $ih 2>/dev/null; fi && break
      mv $out $H/$n-$k-bad$try.png
    done
  done
done
echo DONE
