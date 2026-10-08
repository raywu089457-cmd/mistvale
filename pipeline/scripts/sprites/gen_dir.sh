#!/bin/bash
# gen_dir.sh name... — 生成正面/背面關鍵表 hv4/<name>-dir.png(chk_dir.py 驗收,最多重生 4 次);同一時間只能一個 generate.mjs。
cd "$(dirname "$0")/../../.."
H=output/l0veyou/hv4
for n in "$@"; do
  out=$H/$n-dir.png; [ -f $out ] && continue
  for try in 1 2 3 4; do
    REF=$H/ref-$n.png node pipeline/scripts/l0veyou/generate.mjs output/l0veyou/prompts_keys/$n-dir.txt $out "" 16:9 2>&1 | tail -1
    [ -f $out ] || continue
    if [ "$n" = sorcerer ]; then export NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12; else unset NO_SHADOW NO_HOLES HUE_TOL; fi
    python pipeline/scripts/sprites/chk_dir.py $out && break
    mv $out $H/$n-dir-bad$try.png
  done
done
echo DONE
