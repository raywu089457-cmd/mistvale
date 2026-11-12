# fixture montage: a visual card that stops for one Opus look at its montage

Status: todo
Accept: node --check src/a.js
Gate: montage
Montage: output/fixture-montage/compare.png

## Goal
Give the selftest a visual card: the dispatcher must stop after attempt 1 and one accept run, set `Status: montage-review`, and print `Txx MONTAGE-READY montage: <path> accept:PASS|FAIL` instead of running REVIEW.

## Files you may change
- src/a.js
- src/b.js

## Steps
1. Change nothing. This card exists only so `tools/checks/dispatch-selftest.mjs` and `--montage-selftest` can check where a montage-gated run stops.
