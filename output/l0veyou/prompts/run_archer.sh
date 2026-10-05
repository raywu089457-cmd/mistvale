#!/bin/bash
# 弓箭手試點:cheaprouter gpt-image-2(CHEAPROUTER_KEY 環境變數),每張以設計表第 1 格(ref-archer.png)當參考;特效表不帶參考。
cd "$(dirname "$0")/../../.."
for a in walk attack skill death victory; do
  [ -f output/l0veyou/archer-$a-v1.png ] || python pipeline/scripts/imagegen/cheaprouter.py output/l0veyou/prompts/archer-$a.txt output/l0veyou/archer-$a-v1.png --ref output/l0veyou/ref-archer.png
done
[ -f output/l0veyou/archer-fx-v1.png ] || python pipeline/scripts/imagegen/cheaprouter.py output/l0veyou/prompts/archer-fx.txt output/l0veyou/archer-fx-v1.png
echo ARCHER_DONE
