# fixture opus-tierc: a card that touches tier C code

Status: todo
Accept: node --check tools/pi-dispatch.mjs

## Goal
Give the selftest a card whose Files include tier C code, so the Opus escalation must say `tier-c` from the file list alone.

## Files you may change
- `src/pixel-world.js`

## Steps
1. Change nothing. This card exists only so `tools/checks/dispatch-selftest.mjs` can assert the opus reason.
