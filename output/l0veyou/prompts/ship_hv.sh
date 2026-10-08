#!/bin/bash
# ship_hv.sh <name> : hv2 sheets -> output/l0veyou (old to _old_style3), then build + audit
cd "$(dirname "$0")/../../.."
n=$1; L=output/l0veyou; H=$L/hv2; mkdir -p $L/_old_style3
case $n in slime|wolf|golem|treant) pre="mon3-"; acts="idle walk attack hurt death";; *) pre=""; acts="idle walk attack hurt death skill victory";; esac
for a in $acts; do f=$(ls $H/$pre$n-$a-v1.* 2>/dev/null|head -1); [ -n "$f" ] || { echo "missing $a"; continue; }
  for o in $L/$pre$n-$a-v1.*; do [ -f "$o" ] && cp "$o" $L/_old_style3/ && rm -f "$o"; done; cp "$f" $L/$pre$n-$a-v1.${f##*.}; done
for d in down up; do f=$(ls $H/dir-$n-$d-v1.* 2>/dev/null|head -1); [ -n "$f" ] || { echo "missing dir $d"; continue; }
  for o in $L/dir-$n-$d-v1.*; do [ -f "$o" ] && cp "$o" $L/_old_style3/ && rm -f "$o"; done; cp "$f" $L/dir-$n-$d-v1.${f##*.}; done
if [ $n = sorcerer ]; then export NO_SHADOW=1 NO_HOLES=1 HUE_TOL=12; fi
case $n in slime|wolf|golem|treant) python pipeline/scripts/heroes/build_hero.py monster $n | tail -5; python pipeline/scripts/check/audit_hero_sheet.py monster:$n | tail -3;;
 *) python pipeline/scripts/heroes/build_hero.py $n | tail -5; python pipeline/scripts/check/audit_hero_sheet.py $n | tail -3;; esac
