# Dispatch playbook (parent agent → pi child): how and when

Child agent: since 2026-11-05 `tools/pi-dispatch.mjs` runs DeepSeek Harness (dsh) by default. It uses `tools/dsh-overlay.yml` with the same model as pi, and the sandbox is off via `DSH_PERMISSION_MODE=danger-full-access`. COST-LOG records why: it was the cheapest or tied, the fastest, and it never hung. Use `DISPATCH_AGENT=pi` only as a fallback when dsh is down. "pi" below means whichever child agent runs.

Written 2026-11-01 from three measured experiments. Any agent working in this repo should follow it. The user-facing summary of the split is in `docs/WORK-SPLIT.md` (Chinese); model tiers are in `docs/MODEL-ROUTING.md`. Raw numbers: `docs/pi-tasks/COST-LOG.md`.

## 1. Decide: dispatch or do it yourself

Dispatch to pi when ALL of these hold:
1. The card can be written from rules alone. You do not need to read code to write it (you point at files; pi reads them).
2. The work reads many files, or waits on long commands (`npm run verify` is 5–12 min).
3. A script can check the result (coverage, line numbers, test suites, a diff). You verify by running the check, not by reading the output.

Do it yourself when any of these hold:
- Writing a precise card needs you to understand the code anyway (experiment 1: the card cost as much as the work). If the code is not tier C, send a scout card first (section 2) instead of reading it yourself.
- A short script answers the question (experiment 2: a 40-line script beat reading).
- It touches `src/pixel-game.js` or `src/pixel-world.js` logic, needs visual judgement, or is a design decision (tier C in MODEL-ROUTING).

Measured results (Claude weighted tokens = uncached ×1, cache write ×1.25, cache read ×0.1, output ×5):

| Experiment | Task | Claude if it dispatches | Claude does it | pi cost | Verdict |
|---|---|---|---|---|---|
| 1 | balance-sim script (T07) | ~116k | ~107k | US$0.034, 16 min | do it yourself |
| 2 | dead-code audit (T08) | ~43k | ~57k | US$0.027, 5 min | dispatch, slightly |
| 3 | API reference, 24 files (T09) | ~31k | ≥265k (4-file sample 122k) | US$0.042, 14 min | dispatch, clearly |

Earlier tests (see the `dispatch-to-pi` memory) found dispatch can cost MORE when each Claude action re-reads a long conversation. Fewer Claude actions per task is the lever; start a fresh session for dispatch-heavy work.

## 2. Task card = a local issue

Create cards with `node tools/pi-card.mjs <slug> --accept "<cmd>" <<'EOF' ... EOF` (auto-numbers, writes the header; see `docs/pi-tasks/TEMPLATE.md`). A card holds only:
- Header: `Status:` (owned by the dispatcher; `reusable` for cards run again and again, e.g. T01/T04), `Accept:` (one shell command; the dispatcher runs it itself after pi and it decides pass/fail; required except for scout cards), optional `Type: scout`. Checker scripts live in `tools/checks/`, not `output/`.
- `## Goal` (1–3 sentences), `## Files you may change`, `## Steps` (commands or exact "old → new" edits). `## Notes` only for card-specific extras.
- Shared rules are NOT written in cards: scope, foreground only, report format (line 1 `DONE|BLOCKED|FAILED | files: … | verify: …`, ≤10 lines), stop after two failures, no commit/push, no PixelLab without budget, C-tier code off limits. They live in the `tools/pi-dispatch.mjs` prompt and `AGENTS.md`.
- Name functions, selectors and keys, never line numbers. Finding line numbers means reading code (the cost dispatch is meant to save), and they drift.
- Nobody edits a card after dispatch; add context with `--note`. Agent-to-agent text is English; replies to the user are Traditional Chinese.
- **Goal-only card** (`--goal-only`): the body holds only `## Goal` (plus `## Notes`); `Files` and `Steps` are not required, and `--accept auto` writes `Accept: auto`. The dispatcher's PLAN stage (a pi session that reads the code) writes `output/pi-results/<id>.plan.md` with `## Files you may change` and `## Steps`, and its first line becomes the accept command: a checker under `tools/checks/` (existing or written by the plan) with generic suites allowed only after it. Use it when writing Files/Steps would mean reading code you are not supposed to read; `--dry-run` prints that prompt before anything runs.
- **Plan gate** (`Gate: plan` in the header, or `--approve-plan` on the command): the run stops after PLAN and its precheck with `Status: plan-review` and one line `Txx PLAN-READY plan: output/pi-results/Txx.plan.md (N lines)`; that is not a failure, the queue moves on. Opus reads the plan, then `node tools/pi-dispatch.mjs Txx --approved [--note "direction"]` skips PLAN, reuses the same plan file and runs the rest with the note as Opus's direction (`--approved` with no plan file prints an error and exits 2).

### Scout → implement (when writing the card would need code reading)
Experiment 1 lost because Claude read the code to write the card. Instead: card A with `Type: scout` (pi changes nothing and returns a ≤40-line brief: function names, current behaviour, constraints, open questions) → Claude reads only the brief, decides, writes card B → dispatch B. Use it for any change in unfamiliar code that is not tier C.

## 3. Commands

| What | Command |
|---|---|
| New card | `node tools/pi-card.mjs <slug> --accept "<cmd>|auto" [--scout] [--goal-only] [--reusable] [--title "..."] < body` |
| Dispatch a queue | `node tools/pi-dispatch.mjs T30 T31 T32 [--timeout 40] [--note "..."] [--attempts 3] [--no-review] [--dry-run] [--full] [--keep-going] [--no-retry] [--force] [--parallel] [--approve-plan] [--approved]` |
| Opus verdict on one card | `node tools/pi-dispatch.mjs --opus-verdict Txx ok|missed|fixed "note"` → one row in `docs/pi-tasks/opus-review.csv` |
| Classify a batch (≥4 items; for fewer, judge by CLAUDE.md) | `node tools/classify.mjs "item" ...` (rules in `docs/pi-tasks/ROUTING-RULES.md`) |
| Per-card ledger (auto) | `docs/pi-tasks/cost-log.csv` — date, card, attempts, verdict, accept, minutes, pi USD, start, end, scope, review, precheck, stages, opus |
| Claude cost of this (or any) session | `node tools/session-cost.mjs [--session <id>] [--from ISO] [--to ISO] --label <name> --log` → `docs/pi-tasks/claude-cost.csv` (finds the transcript and subagents itself) |
| pi cost of one session | `node tools/pi-cost.mjs T09` |
| Claude cost of a time window | `node tools/claude-usage.mjs <transcript.jsonl> <fromISO> <toISO> [label]` |
| Doc covers every export? / line numbers right? | `node tools/check-api-doc.mjs docs/API-pi.md` / `node tools/check-api-lines.mjs docs/API-pi.md` |
| Dead exports and files | `node tools/dead-code-opus.mjs` (report only) |
| Dungeon balance table | `node tools/dungeon-balance.mjs [level ...]` |

What the dispatcher does per card, as separate pi sessions: **PLAN** (goal-only cards: writes `<id>.plan.md` with Files, Steps and, for `Accept: auto`, the accept command) → **PRECHECK** (`Accept: auto`: runs that accept command on the unchanged tree, for every `tools/checks/` checker it uses, new or old; if it already passes, PLAN gets one rewrite, and if it still passes the card ends as `ALREADY` — goal already met, no implement, no review) → **implement** → **accept** (the script runs it; the verdict is not pi's word) → **REVIEW** (a fresh pi critic gets the goal, the plan and `output/pi-results/<id>.diff` and writes `<id>.review.md`: line 1 `OK`/`ISSUES`, ≤10 `high`/`low` lines; any `high` goes back to implement). `--no-review` skips the review, scout cards never get one, and a failed attempt retries automatically with the failure summary as a note, up to 3 attempts (`--attempts N`). A failed card stops the rest of the queue unless `--keep-going`; `ALREADY` never stops the queue and is logged like any other verdict. The accept command for `Accept: auto` must run at least one checker under `tools/checks/`: a plan whose line is only generic suites (`npm test`, `npm run verify`, `npm run verify:quick`, `npm run build`) goes back to PLAN once, and a second generic plan ends the card as `BLOCKED accept:generic` without implementing anything. Files under `tools/checks/` named in the accept line count as in scope even when the plan's Files list leaves them out, and every checker the line runs gets PRECHECK, new or old.

Default output is one line per card: `Txx VERDICT accept:.. scope:.. review:OK|ISSUES|skip precheck:..|n/a Nx Mm $x`, where VERDICT can be `DONE`, `BLOCKED` (a `DONE`-less result, or `accept:generic` when two plans in a row accepted on generic suites only), `FAILED`, `ALREADY` (the precheck still passed after the plan rewrite, so the goal was already met and nothing was implemented), `PLAN-READY` (a `Gate: plan` card waiting for Opus), `SKIPPED` or `LOCKED`. The result body (capped at 1200 characters; `--full`: 4000; scout briefs 3000) prints only for cards that are not ok or with `--full`, and with several cards the one-line table comes last. `--dry-run` prints the stage list and every stage prompt without running pi or the accept command.

Opus review is escalated, not routine: after REVIEW a card gets `opus: <reason>` and, under its one-line result, `Txx opus:<reason> diff: <file> (N lines) review: <file>` when a changed file is `src/pixel-game.js`/`src/pixel-world.js` (`tier-c`), when pi's review still reports `high` after the attempts run out (`review-failed`), when the diff is over 300 changed lines (`big-diff`), or when the card number divides by 5 (`sample`). The dispatcher never calls Claude: it only names the files to read. `--opus-verdict Txx ok|missed|fixed "note"` records what Opus said (`reason` and `pi_review` come from the latest cost-log row; `missed` = a real problem pi's review called OK), and a run with at least one `opus:` flag ends with `pi-review miss rate: M/N` from that ledger. `cost-log.csv` carries the reason in its last column.

Run it in the background, once per batch, and read only that output. Wake once, on the completion notice: never wait with a foreground command that times out and is re-run, and never check in between. A wait longer than the prompt-cache lifetime (5 min in subagents) rewrites the whole context on every wake; experiment 5 (T43) paid ~335k weighted for four such wakes on a task that cost 99k done directly. Do not dispatch from a subagent. One queue at a time (two builds at once delete each other's `outputs/media`); `--parallel` only for cards that neither build nor edit `src/`.

## 4. Verify before you trust

1. `accept PASS` in the dispatcher line is the evidence; you do not re-run the acceptance command yourself.
2. `scope ok` in the dispatcher line: the dispatcher compares changed files with the card's "Files you may change" (`scope OUT` fails the card and lists the stray files; `n/a` = list not parsable, check by eye).
3. Spot-check a sample where checkers cannot judge (descriptions, wording, visuals): e.g. 4 of 24 files in experiment 3.
4. After the automatic retry fails, take it over (or write a scout card) instead of re-dispatching again.
Checkers prove coverage and line numbers, not that a sentence is true; sample the descriptions.

## 4b. Keeping the parent cheap

Each Claude call re-reads the whole context (measured ~84k tokens per call in the 10-31 session), so the number of calls is the main cost.
- One batch = write the cards in one or two calls, one dispatch command, one read of the table. Do not poll.
- Prefer a fresh session (or /clear) per batch; long conversations make every call dearer.
- Orchestration (cards, dispatch, reading tables) runs fine on Sonnet at medium effort; thinking tokens weigh ×5. Keep Opus for tier C via `game-logic-opus`.
- Do not open the long docs to orient: CLAUDE.md has the decision rules; grep `docs/API-pi.md` for a name instead of reading it.
- Verifiers that are slow and flaky (the button crawl) do not belong in `Accept:`; use `npm run verify:quick` plus deterministic checks, and run the crawl once on its own (experiment 4: T13 burned 40 minutes retrying it).

## 5. Gotchas learned

- `pi -p` needs stdin closed, and must be started with node on the pi `cli.js` (the dispatcher does both). Cards must say "run every command in the foreground".
- A card that only says what to do, not how to read the code, makes pi explore; give it the `Context:` line and the file list.
- The 10-30 dungeon balance table in `HANDOFF-2026-10-30.md` is not reproducible: both tools get gold/min about 1.3–1.6× higher, and runs end after 20–28 simulated minutes when the party falls. Find out how the hand table was made before tuning dungeon numbers.
- Findings produced by dispatch (example): 8 exports unused plus `src/main.js` and `src/concept-props.js` unreferenced (T08). Nothing was deleted; confirm with the user before removing the old-version files.

## 6. Keeping docs fresh

`docs/API-pi.md` line numbers drift when `src/` changes. After a big edit re-run card T09, then the two checkers. `docs/ARCHITECTURE.md` changes only when a file is added, removed or changes role.
