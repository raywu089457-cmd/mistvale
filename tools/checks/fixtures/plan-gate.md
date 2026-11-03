# fixture plan-gate: a card whose plan Opus must approve

Status: todo
Accept: auto
Gate: plan

## Goal
Give the selftest a `Gate: plan` card: the dispatcher must stop after PLAN (and its precheck), set `Status: plan-review`, print `Txx PLAN-READY plan: <file> (N lines)`, and keep the queue going.

## Files you may change
- `tools/checks/fixtures/plan-gate.md`
