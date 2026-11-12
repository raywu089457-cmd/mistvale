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
- It touches `src/pixel-game.js` or `src/pixel-world.js` logic, or is a design decision (tier C in MODEL-ROUTING).
- Visual judgement stays with Claude, but only the judging itself. The material it judges and the implementation afterwards still go to the child (section 1b).

Measured results (Claude weighted tokens = uncached ×1, cache write ×1.25, cache read ×0.1, output ×5):

| Experiment | Task | Claude if it dispatches | Claude does it | pi cost | Verdict |
|---|---|---|---|---|---|
| 1 | balance-sim script (T07) | ~116k | ~107k | US$0.034, 16 min | do it yourself |
| 2 | dead-code audit (T08) | ~43k | ~57k | US$0.027, 5 min | dispatch, slightly |
| 3 | API reference, 24 files (T09) | ~31k | ≥265k (4-file sample 122k) | US$0.042, 14 min | dispatch, clearly |

Earlier tests (see the `dispatch-to-pi` memory) found dispatch can cost MORE when each Claude action re-reads a long conversation. Fewer Claude actions per task is the lever; start a fresh session for dispatch-heavy work.

### 1b. Split by game-dev task type (standing rule since 2026-11-05)

The child agent reads and writes all the code. Claude spends tokens only on decisions, and only on condensed input: one contact sheet or screenshot montage, `Txx.plan.md`, or the diff behind an `opus:` flag. Claude never reads raw code. A child card costs about US$0.02. Claude's cost is the context it reads and the number of times it wakes up.

| Task type | Who | How |
|---|---|---|
| Visual judgement: picking effects or art; scale, position, colour; how the UI looks | Claude | Reads one montage the child produced, then writes a settings table |
| Implementing from a spec: export sheets, wire a settings table into code, data or number tables, copy, docs | child | `--goal-only` card carrying the settings table; `Accept:` is `verify:quick` or a dedicated checker |
| Recon and material: where code lives, candidate contact sheets, in-game screenshot montages | child | `Type: scout` card; Claude reads only the summary or the single image |
| Features with an objective check: UI behaviour, saves, a11y, numeric rules | child | plan → implement → accept → review (exp 9–10: 4/4 and 5/5) |
| High-risk logic: hunter AI, combat timing, save structure and migration, animation state machine, cross-file refactors | `game-logic-opus` | Unchanged (CLAUDE.md). "Child implements, Opus reviews the plan and diff" is not adopted; the user must approve it first |
| One-off answered by a few lines of script | Claude directly | Dispatch overhead and wakes cost more (exp 5 K1: direct was 4.4× cheaper) |
| Visual bugs: jitter, facing, offset | split | Child writes the repro and screenshot script; Claude judges the montage; child fixes |
| Asset generation (l0veyou first, PixelLab only after a failed review) | split | Child runs the scripts; Claude picks from one combined montage |

The visual-asset loop, using the 2026-11-05 VFX batch as the example. That batch was done entirely by Claude: it read about 15 images plus code. This loop should more than halve that, at the cost of one or two 10–20 min waits.
1. Child (scout): render the candidate effects' contact sheets into one montage per class.
2. Claude: read the montages, then write the settings table (sheet, hit-frame time, offset, scale, fade).
3. Child: export, wire the code, update `pipeline/ASSETS.md`, and save an in-game screenshot montage. `Accept: npm run verify:quick`.
4. Claude: read that one montage. If something is off, change the numbers and send one more card.

Cost rules:
- Batch the cards, dispatch once, and wake once to read the summary. Never poll.
- The `Accept:` command must be able to fail. Rule out shortcuts, or the task becomes free for the child (exp 10 learned this from `location.reload()`).
- Claude reads at most one montage per decision. Separate images cost several times more.
- Ask for an in-game montage only when a visual call is actually needed (look, size, position, colour). Browser montages start a server and Chrome and take dozens of shots, adding 5–15 min per attempt. Logic, timing and order changes are proven by the checker alone (2026-11-06).
- Time rules (2026-11-06): a stage is killed only when it prints nothing for 10 min (`--idle`, a hang) or hits the 60-min hard cap (`--timeout`); the flat 20-min kill cut T68/T70 mid-work. A failed `Accept` hands the retry the FAIL/Error/assert lines plus the last 5 lines, not just the tail. Under `--parallel` each worktree gets its own `server.mjs` on PORT 5100+i and `TARGET` points browser checkers at it; a failed card's work is kept as `output/pi-results/<id>.patch`. The child runs only the card's `tools/checks/` checker while it works, and the dispatcher runs the full `Accept` (including `verify:quick`) once. Findings that are only `low` let the card pass, and Claude reads them with the diff. Cards that touch different files run in parallel, each card in its own worktree (automatic since 2026-11-07, see section 3).
- Redo rules (2026-11-07, from 34 cards: 47% redid twice or more and took 67% of the spend; 7 still ended `review:ISSUES` after round 3): at most **2 attempts** by default (`--attempts N` overrides). A review `high` sends the card back, and that counts as an attempt. If every `high` in a round matches a `high` from the round before (keyword match), the dispatcher stops at once. The card keeps `review:ISSUES` and goes to Opus as `opus:repeat-issue`: the premise is probably wrong, and another child round would not see that either.

## 2. Task card = a local issue

Create cards with `node tools/pi-card.mjs <slug> --accept "<cmd>" <<'EOF' ... EOF` (auto-numbers, writes the header; see `docs/pi-tasks/TEMPLATE.md`). A card holds only:
- Header: `Status:` (owned by the dispatcher; `reusable` for cards run again and again, e.g. T01/T04), `Accept:` (one shell command; the dispatcher runs it itself after pi and it decides pass/fail; required except for scout cards), optional `Type: scout`. Checker scripts live in `tools/checks/`, not `output/`.
- `## Goal` (1–3 sentences), `## Files you may change`, `## Steps` (commands or exact "old → new" edits). `## Notes` only for card-specific extras.
- Shared rules are NOT written in cards: scope, foreground only, report format (line 1 `DONE|BLOCKED|FAILED | files: … | verify: …`, ≤10 lines), stop after two failures, no commit/push, no PixelLab without budget, C-tier code off limits. They live in the `tools/pi-dispatch.mjs` prompt and `AGENTS.md`.
- Name functions, selectors and keys, never line numbers. Finding line numbers means reading code (the cost dispatch is meant to save), and they drift.
- Nobody edits a card after dispatch; add context with `--note`. Agent-to-agent text is English; replies to the user are Traditional Chinese.
- **Goal-only card** (`--goal-only`): the body holds only `## Goal` (plus `## Notes`); `Files` and `Steps` are not required, and `--accept auto` writes `Accept: auto`. The dispatcher's PLAN stage (a pi session that reads the code) writes `output/pi-results/<id>.plan.md` with `## Files you may change` and `## Steps`, and its first line becomes the accept command: a checker under `tools/checks/` (existing or written by the plan) with generic suites allowed only after it. Use it when writing Files/Steps would mean reading code you are not supposed to read; `--dry-run` prints that prompt before anything runs.
- **Plan gate** (`Gate: plan` in the header, or `--approve-plan` on the command): the run stops after PLAN and its precheck with `Status: plan-review` and one line `Txx PLAN-READY plan: output/pi-results/Txx.plan.md (N lines)`; that is not a failure, the queue moves on. Opus reads the plan, then `node tools/pi-dispatch.mjs Txx --approved [--note "direction"]` skips PLAN, reuses the same plan file and runs the rest with the note as Opus's direction (`--approved` with no plan file prints an error and exits 2).
- **Automatic plan gate** (2026-11-07): `PLAN_GATE_RULES` at the top of `tools/pi-dispatch.mjs` gates a card as if it said `Gate: plan`. They come from the defects Opus found that pi's review missed. `diagnosis`: the Goal states a bug cause (因為/原因是/root cause/because…) together with a bug or fix word. `shared-value`: the Goal or Files name a shared constant (`ALL_CAPS_NAME`, 共用/常數), a coordinate space, the save structure, or a speed/duration, or a shared data file such as `src/pixel-data.js`. The card text is checked before PLAN, so a card with Steps also gets a PLAN stage. A goal-only card is checked again after PLAN, against the plan's Files and accept line. The run stops at `PLAN-READY` and prints `Txx gate:auto(<rules>)`. `--approved` works as before, and `--no-auto-gate` turns the rules off for one run. Every plan ends with `## Facts this card depends on`: which sheet the game loads, which coordinate space, every user of a changed value, the save fields, the observed bug cause, each with grep evidence or `UNVERIFIED`. Opus checks those lines rather than the code. When a diff changes a shared constant, speed or duration, the review must grep every user and list it.
- **Montage gate** (`Gate: montage` in the header, `--montage-gate`, or automatic for every visual card — a `sprites/`/`assets/`/`pixelfx` file or a Goal about looks — whether or not Accept has a checker; `--no-auto-gate` turns the automatic half off): the run goes plan → implement attempt 1 → one Accept run (recorded, never retried) → STOP, before REVIEW. Status becomes `montage-review` and the only line is `Txx MONTAGE-READY montage: <path> accept:PASS|FAIL`. The path comes from a `Montage:` header, else the first `compare.png`/`montage`/`frames-6x.png` path in the plan or card text; a missing file, or one older than the run start, is `FAILED note: no montage`. Opus reads that one image and either sends fixes with `node tools/pi-dispatch.mjs Txx --approved --note "<value table>"` (continues the same implement session, attempt counting carries on, then the normal accept → review → retry flow) or accepts the result with `--montage-ok` (skips the second implement and goes straight to REVIEW/finalize). A `montage-gate` stage row is recorded in agent-tokens and in the cost-log `stages`. A failed or empty PLAN never prints `PLAN-READY`: it is `BLOCKED note: quota` (log contains `QUOTA`/`429`, and the whole queue stops — later cards hit the same limit) or `FAILED note: no plan`.

### Scout → implement (when writing the card would need code reading)
Experiment 1 lost because Claude read the code to write the card. Instead: card A with `Type: scout` (pi changes nothing and returns a ≤40-line brief: function names, current behaviour, constraints, open questions) → Claude reads only the brief, decides, writes card B → dispatch B. Use it for any change in unfamiliar code that is not tier C.

## 3. Commands

| What | Command |
|---|---|
| New card | `node tools/pi-card.mjs <slug> --accept "<cmd>|auto" [--scout] [--goal-only] [--reusable] [--title "..."] < body` |
| Dispatch a queue | `node tools/pi-dispatch.mjs T30 T31 T32 [--timeout 60] [--idle 10] [--note "..."] [--attempts 2] [--no-review] [--dry-run] [--full] [--keep-going] [--no-retry] [--force] [--parallel\|--serial] [--approve-plan] [--approved] [--montage-gate] [--montage-ok] [--no-auto-gate]` |
| Opus verdict on one card | `node tools/pi-dispatch.mjs --opus-verdict Txx ok|missed|fixed|skip "note" [--found-at plan|accept|review|opus]` → one row in `docs/pi-tasks/opus-review.csv` plus `opus_verdict`/`found_at` filled in the card's latest cost-log row (`found_at` defaults to `opus` for missed/fixed; `skip` closes a flag unread and is left out of the miss rate) |
| Flagged cards still without a verdict | `node tools/pi-dispatch.mjs --opus-open` (read-only; every real dispatch also ends with this list) |
| Dispatcher self-tests (no dsh, no repo data) | `node tools/pi-dispatch.mjs --gate-selftest`, `node tools/pi-dispatch.mjs --montage-selftest`, `node tools/checks/dispatch-selftest.mjs`, `node tools/checks/dispatch-parallel.mjs` |
| Classify a batch (≥4 items; for fewer, judge by CLAUDE.md) | `node tools/classify.mjs "item" ...` (rules in `docs/pi-tasks/ROUTING-RULES.md`) |
| Per-card ledger (auto) | `docs/pi-tasks/cost-log.csv` — date, card, attempts, verdict, accept, minutes, pi USD, start, end, scope, review, precheck, stages, opus, opus_verdict, found_at (new columns only ever go at the end; older rows have fewer cells and are read by header name) |
| Claude cost of this (or any) session | `node tools/session-cost.mjs [--session <id>] [--from ISO] [--to ISO] --label <name> --log` → `docs/pi-tasks/claude-cost.csv` (finds the transcript and subagents itself) |
| pi cost of one session | `node tools/pi-cost.mjs T09` |
| Claude cost of a time window | `node tools/claude-usage.mjs <transcript.jsonl> <fromISO> <toISO> [label]` |
| Doc covers every export? / line numbers right? | `node tools/check-api-doc.mjs docs/API-pi.md` / `node tools/check-api-lines.mjs docs/API-pi.md` |
| Dead exports and files | `node tools/dead-code-opus.mjs` (report only) |
| Dungeon balance table | `node tools/dungeon-balance.mjs [level ...]` |

What the dispatcher does per card, as separate pi sessions: **PLAN** (goal-only cards: writes `<id>.plan.md` with Files, Steps and, for `Accept: auto`, the accept command) → **PRECHECK** (`Accept: auto`: runs that accept command on the unchanged tree, for every `tools/checks/` checker it uses, new or old; if it already passes, PLAN gets one rewrite, and if it still passes the card ends as `ALREADY` — goal already met, no implement, no review) → **implement** → **accept** (the script runs it; the verdict is not pi's word) → **REVIEW** (a fresh pi critic gets the goal, the plan and `output/pi-results/<id>.diff` and writes `<id>.review.md`: line 1 `OK`/`ISSUES`, ≤10 `high`/`low` lines; any `high` goes back to implement). `--no-review` skips the review, scout cards never get one, and a failed attempt retries automatically with the failure summary as a note, up to 2 attempts (`--attempts N`; a review that repeats last round's `high` items stops the card early as `opus:repeat-issue`). A failed card stops the rest of the queue unless `--keep-going`; `ALREADY` never stops the queue and is logged like any other verdict. The accept command for `Accept: auto` must run at least one checker under `tools/checks/`: a plan whose line is only generic suites (`npm test`, `npm run verify`, `npm run verify:quick`, `npm run build`) goes back to PLAN once, and a second generic plan ends the card as `BLOCKED accept:generic` without implementing anything. Files under `tools/checks/` named in the accept line count as in scope even when the plan's Files list leaves them out, and every checker the line runs gets PRECHECK, new or old.

Default output is one line per card: `Txx VERDICT accept:.. scope:.. review:OK|ISSUES|skip precheck:..|n/a Nx Mm $x`, where VERDICT can be `DONE`, `BLOCKED` (a `DONE`-less result, or `accept:generic` when two plans in a row accepted on generic suites only), `FAILED`, `ALREADY` (the precheck still passed after the plan rewrite, so the goal was already met and nothing was implemented), `PLAN-READY` (a `Gate: plan` card waiting for Opus), `SKIPPED` or `LOCKED`. The result body (capped at 1200 characters; `--full`: 4000; scout briefs 3000) prints only for cards that are not ok or with `--full`, and with several cards the one-line table comes last. `--dry-run` prints the stage list and every stage prompt without running pi or the accept command.

Opus review is escalated, not routine. After REVIEW a card gets `opus: <reason>`, and under its one-line result `Txx opus:<reason> diff: <file> (N lines) review: <file> [why: file:function,…]`. The reasons, first match wins:
- `repeat-issue`: the review repeated last round's `high` items.
- `tier-c`: a hunk of the card's own diff lands inside a `TIER_C_CODE` function or holds one of its words. These are the hunter AI, combat timing, save/load, and direction/animation-state functions of `src/pixel-game.js` and `src/pixel-world.js`, listed at the top of the dispatcher. Touching the file alone no longer counts.
- `review-failed`: pi's review still reports `high` after the attempts run out.
- `big-diff`: the card's own diff is over `BIG_DIFF_LINES` = 300 changed lines, not counting `tools/checks/`, tests, fixtures, or generated files such as `docs/API-pi.md`.
- `sample`: the card number divides by 5.

Only the card's own change is measured. In a worktree it is the worktree's diff. In the shared checkout, a changed file that is outside the card's scope and that the agent's tool log never wrote or named is treated as someone else's concurrent edit. It still fails the scope check, marked `代理沒寫過`, but it raises no `tier-c` or `big-diff`. A concurrent edit to a file inside the card's own scope cannot be separated there; use the worktree mode for that. `--dry-run` can only predict `tier-c` from the Files list (`opus-note:`).

The dispatcher never calls Claude: it only names the files to read. `--opus-verdict Txx ok|missed|fixed|skip "note" [--found-at stage]` records what Opus said. `reason` and `pi_review` come from the latest cost-log row, and `missed` = a real problem pi's review called OK. The same call fills that row's `opus_verdict` and `found_at`. A run with at least one `opus:` flag ends with `pi-review miss rate: M/N` from that ledger. Every real run ends with `opus 未判定: Txx …` (flagged rows that have neither a verdict cell nor a later ledger row) and one reminder line to log the Claude side with `node tools/session-cost.mjs --label <name> --log`. The dispatcher never runs that command itself.

Run it in the background, once per batch, and read only that output. Wake once, on the completion notice: never wait with a foreground command that times out and is re-run, and never check in between. A wait longer than the prompt-cache lifetime (5 min in subagents) rewrites the whole context on every wake; experiment 5 (T43) paid ~335k weighted for four such wakes on a task that cost 99k done directly. Do not dispatch from a subagent. One queue at a time in the shared checkout (two builds there delete each other's `outputs/media`).

Parallel worktrees (2026-11-07) need no flag. The dispatcher picks parallel by itself when a batch of two or more cards meets all of these:
- every card has a readable Files list (a scout card counts as an empty list);
- no two lists can overlap (a bare file name with no directory counts as overlapping everything);
- no card, accept line or accept checker mentions `output/` or `outputs/`.

It then prints `[pi-dispatch] 自動並行:…`, and each card builds in its own `output/pi-worktrees/<id>/dist`. Otherwise the batch runs serially as before. `--serial` forces serial and `--parallel` forces parallel; `--dry-run` prints `mode: parallel|serial (reason)`. In parallel all cards run at once, so a failure does not stop the others. Known limit of the worktree mode: a worktree gets HEAD, the tracked diffs, and untracked files under `src/`, `assets/`, `tools/` and `pipeline/` only. Untracked material under `output/`, `docs/` or `sprites/` is missing there, which is why `output/` keeps a batch serial.

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
