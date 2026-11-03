# T53: accept auto specific

Status: failed
Accept: node tools/checks/dispatch-accept-auto.test.mjs && npm run verify:quick

## Goal
In `tools/pi-dispatch.mjs`, `Accept: auto` can no longer pass with a check that proves nothing. Seen in T49: PLAN wrote `Accept: npm test` (a generic suite unrelated to the card), the dispatcher printed accept:PASS, and nothing had changed.

What must be true:
1. With `Accept: auto`, the plan's Accept command must run at least one checker under `tools/checks/`. If it runs only generic suites (`npm test`, `npm run verify`, `npm run verify:quick`, and similar), the plan goes back to PLAN once with the reason. If the second plan is still generic, the card ends as BLOCKED with accept:generic. Generic suites may still be chained after the checker as a regression guard.
2. PRECHECK runs for every `tools/checks/` checker the Accept command uses, new or old. If it already passes on the unchanged tree, PLAN gets one rewrite. If it still passes after that, the card ends with the new verdict ALREADY (goal already met), skips implement and review, prints the one-line result, and logs to cost-log.csv. With `--keep-going` off, ALREADY does not stop the following cards.
3. A `tools/checks/` file named in the plan's Accept command counts as in scope, even when the plan's Files list leaves it out (T49 got scope:OUT for its own checker).
4. Update the PLAN prompt text, plus the header comment and `docs/DISPATCH-PLAYBOOK.md`, so they state these rules in one or two lines each.
5. Add `tools/checks/dispatch-accept-auto.test.mjs`, a plain node script with no network and no pi calls, that unit-tests the generic-command detection, the checker extraction from an Accept string, and the scope rule. Exit 1 on failure. Export the pure helpers from pi-dispatch.mjs (or a small sibling module) so the test can import them without running the dispatcher.
