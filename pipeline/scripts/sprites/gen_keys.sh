#!/bin/bash
# gen_keys.sh name[:hmin:hmax]... — 生成關鍵姿勢表 A(待機+攻擊3)/B(待機+死亡3),各最多重生 6 次(chk_keys.py 驗收);同一時間只能一個 generate.mjs。
cd "$(dirname "$0")/../../.."
H=output/l0veyou/hv4; mkdir -p $H
for a in "$@"; do IFS=: read n lo hi <<< "$a"; lo=${lo:-70}; hi=${hi:-82}
  ref=$H/ref-${n#mon3-}.png
  for T in ${KEYS:-A}; do
    out=$H/$n-keys$T.png; [ -f $out ] && continue
    for try in 1 2 3 4 5 6; do
      REF=$ref node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts_keys/$n-keys$T.txt $out "" 16:9 2>&1 | tail -1
      [ -f $out ] || continue
      python pipeline/scripts/sprites/chk_keys.py $out $lo $hi 2>/dev/null && break
      mv $out $H/$n-keys$T-bad$try.png
    done
  done
done
echo DONE
