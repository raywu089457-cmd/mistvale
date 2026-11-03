# fixture normal: a card with Files and Steps

Status: todo
Accept: node --check tools/pi-dispatch.mjs

## Goal
Give the selftest a normal card: the dispatcher must not add a plan stage for it.

## Files you may change
- `tools/checks/fixtures/normal.md`

## Steps
1. Change nothing. This card exists only so `tools/checks/dispatch-selftest.mjs` can check the stage list.
