# fixture plan-gate-steps: Gate: plan on a card that already has Steps

Status: todo
Accept: node --check tools/pi-dispatch.mjs
Gate: plan

## Goal
Give the selftest a gated card with its own Accept line: the run must stop after PLAN with nothing else (no precheck, no implement).

## Files you may change
- `tools/checks/fixtures/plan-gate-steps.md`

## Steps
1. Change nothing. This card exists only so `tools/checks/dispatch-selftest.mjs` can check where a gated run stops.
