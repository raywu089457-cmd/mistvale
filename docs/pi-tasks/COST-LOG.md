# Cost log: Claude (parent) vs pi (child)

How to measure
- Per card (automatic since 2026-11-02): `tools/pi-dispatch.mjs` appends one row per card to `docs/pi-tasks/cost-log.csv` (attempts, verdict, accept, minutes, pi USD). This file keeps only experiments.
- Claude side: `node tools/session-cost.mjs --label <name> --log` (since 2026-11-03; finds the transcript itself, writes `claude-cost.csv`), or by hand `node tools/claude-usage.mjs <transcript.jsonl> <fromISO> <toISO> [label]`. `weighted` = input-equivalent tokens (uncached input ×1, cache write ×1.25, cache read ×0.1, output ×5). Only token counts, no dollars (plan is a subscription).
- pi side: `node tools/pi-cost.mjs Txx` (reads `output/pi-sessions/`, includes real USD from the provider).
- Transcript: `~/.claude/projects/C--Users-ray-Documents-Codex-2026-09-29-new-chat-work-mistvale/<session-id>.jsonl` (experiments 1–4 ran in the old `C--Users-ray-Desktop-Claude-code` folder).

## Session 2026-10-31 21:42 → 2026-11-01 00:18 UTC (Claude, this conversation)

| Phase | Calls | Uncached in | Cache write | Cache read | Output | Weighted |
|---|---|---|---|---|---|---|
| 1 Token-efficiency analysis | 2 | 4 | 25,298 | 93,002 | 1,322 | 47,537 |
| 2 Slim MEMORY.md + 2× ARCHITECTURE.md | 8 | 18 | 19,904 | 542,970 | 6,920 | 113,795 |
| 3 Issue-based dispatch answer | 1 | 4 | 45,831 | 34,049 | 1,202 | 66,708 |
| 4 Card template + pi-dispatch.mjs edits | 11 | 24 | 11,760 | 963,374 | 4,706 | 134,591 |
| 5 T07 planning, card, dispatch | 7 | 16 | 19,034 | 690,202 | 4,646 | 116,059 |
| **Total** | **33** | 74 | 126,609 | 2,773,118 | 21,223 | **541,762** |

Caveat: the transcript dedupes by message id, so `calls` can undercount; treat the totals as a lower-bound estimate. Cache read dominates raw volume but counts only ×0.1, so the weighted column is what matters.

## T07 (dungeon balance tool), child = pi / deepseek-v4.1-flash

pi final: 30 calls, 98,474 uncached input, 2,224,640 cache read, 20,250 output (12,319 reasoning), **US$0.0336**, 15 min 48 s wall clock. pi also ran `npm test` (11 suites) and `npm run verify:quick`, both passed.

## Same task done by Claude directly (Opus role, no dispatch)
Window 00:30:50 → 00:31:43 UTC: 6 calls, 14 uncached, 9,230 cache write, 747,181 cache read, 4,074 output → **106,640 weighted**. Script `tools/dungeon-balance-opus.mjs` (25 lines), first run worked, 6 s run time, no `npm test` run (no src change).

## Comparison, same task (balance tool)

| | Dispatch to pi | Claude does it |
|---|---|---|
| Claude weighted tokens | ~116,059 (read context, write card, dispatch) + small result read | ~106,640 |
| Extra cost | US$0.0336 (pi) | none |
| Wall clock | 15 min 48 s | about 1 min |
| Script size | 127 lines | 25 lines |
| Best floors (Lv5/15/30/50/75/100) | 11/12/14/16/20/21 | 11/12/14/16/20/21 (identical) |
| gold/min at Lv100 | 786 | 777 (about 1% apart) |
| Regression checks run | npm test + verify:quick | none |
| Matches 10-30 hand table (±3 floors)? | yes for floors; gold/min 1.3–1.6× higher, flagged by pi | same finding |

## Reading
- For this task dispatch did NOT save Claude quota. To write a card precise enough for pi, Claude had to read the same dungeon code it would have read to do the job, so the card cost about as much as the work. Dispatch added US$0.03 and ~15 min of waiting.
- Bias toward Claude: when Claude did it directly it already had that code in context from writing the card. A cold start would cost more, so the real gap is smaller than the table suggests.
- Where dispatch should pay off: long, mechanical, low-judgement work whose card is cheap to write (templates, repeated verify runs of 5–12 min, asset pipelines, doc updates) and anything that would otherwise burn Claude context on logs.
- Quality was equal here. pi added extra assurance (ran the test suites) and honestly flagged the gold/min mismatch instead of tuning it.
- Both tools agree the 10-30 hand table's gold/min is not reproduced (1.3–1.6× higher) and that runs end after 20–28 sim minutes (party falls), so the hand table used a different method (probably restarts after a defeat). Worth knowing before tuning numbers.

## Reading
- Raw pi usage is about the same size as one Claude phase in tokens, but it is billed per token at DeepSeek Flash prices (cents), while the parent's cost is quota.
- The parent's cost per dispatched card is dominated by writing the card and reading the context, not by the dispatch itself; this is what the issue-style card reduces (parent sends one id, reads ≤15 lines back).

## Experiment 2: dead-code audit of src/ (T08, read-heavy, short card)

| | Dispatch to pi | Claude does it |
|---|---|---|
| Claude weighted tokens | 42,532 (write card, dispatch; window 00:42-00:53) | 57,150 (write a 40-line script, run it; window 00:58-00:58) |
| Extra cost | US$0.0267 (27 calls, 78,346 uncached in, 1,567,744 cache read, 17,143 out) | none |
| Wall clock | 5 min 2 s | under 1 min |
| Unused exports found | 8 | 8 (identical list) |
| Internal-only exports | 8 | 9 (adds `BLOCK_PLAN`; pi missed it) |
| Unreferenced files | concept-props.js, main.js | same |

Reading
- Here dispatch saved about 15k weighted Claude tokens (about 26%) at the price of US$0.027, 5 minutes of waiting and one missed item in a secondary list. The primary list (what is safe to delete) matched exactly.
- Why it was cheaper this time: the card needed no code reading (rules only), unlike experiment 1.
- Caveats: Claude had already seen pi's summary counts before doing its own run, and writing a script was cheaper than reading files by hand, so "Claude does it" is a best case. The measurement windows are short, so read the gap as an order of magnitude, not exact.

## Rule of thumb from both experiments
Dispatch when the card can be written from rules alone (no code reading by Claude) and the work reads many files or waits on long commands. Do it directly when writing the card requires understanding the code, or when a short script answers the question.

## Experiment 3: API reference for all of src/ (T09, large, rules-only card)

Scope: pi documented all 24 files / 124 exports / 6,469 lines. Claude documented a 4-file sample (village-grid, village-nav, landscape-layout, overworld: 57 exports, 377 lines) without reading pi's output.

| | Dispatch to pi (all 24 files) | Claude (4-file sample only) |
|---|---|---|
| Claude weighted tokens | 30,992 (write card + coverage checker, dispatch) | 122,077 |
| Extra cost | US$0.0419 (33 calls, 142,830 uncached in, 3,124,992 cache read, 18,501 out) | none |
| Wall clock | 14 min 1 s | under 1 min of tool time |
| Coverage of exports | 124/124 (checker) | 57/57 on its 4 files (checker) |
| `(line N)` references correct | 174/174 | 55/55 |
| Quality on the 4 shared files | equal; slightly richer shapes (PALISADE, REGIONS), but `createVillageNav` returns' methods not described | adds `path`, `nearestOpen`, `pathLength` details; shorter on some shapes |
| `unclear` markers | 0 | 0 |

Extrapolation of "Claude does all 24 files" (rough, two bounds)
- By exports: 122,077 × 124/57 ≈ 265,000 weighted tokens.
- By lines: 122,077 × 6,469/377 ≈ 2,100,000, but too high, since the sample is dense one-liner code.
- Realistic: at least about 265,000, more likely several hundred thousand, plus the context-window pressure of reading 6.5k lines.
- Dispatch path: 30,992 + the pi cost of US$0.042 + 14 min of waiting. Saving at least about 230,000 weighted tokens (roughly 88% or more).

Reading
- This is the case the rule of thumb predicts: the card needs no code reading, the work reads everything, and a script (coverage and line-number checkers) verifies the result without Claude reading it. Both checkers were written once (about 25 lines each) and are reusable.
- Verification was cheap and objective, which is what made trusting pi safe: Claude never read pi's whole document, only ran two checkers and compared four sections.
- Caveat: description accuracy was spot-checked on 4 of 24 files only; the checkers cannot prove the sentences are right.

## Experiment 4: UI/UX optimization project (visual task, 2026-11-01)

Deliverables: 6 new modal banners (l0veyou, free), wired into 6 modals; phone hunters roster compacted; build cards show cost for unbuilt buildings; small text raised; tooltip on the warehouse `+` button.

| Part | Who | Cost |
|---|---|---|
| Plan: UX review of screenshots, findings F1–F6, plan doc, T10 card | Claude | see windows below |
| T10: 6 images (generate + crop + contact sheet) | pi | US$0.0203, 27 calls, 10 min 17 s; 6/6 images, one crop defect (3 images were 1360x768) |
| Crop fix, wiring (JS+CSS), F2/F4/F5/F6, tuning after layout checker | Claude | see windows below |
| T13: full verify + screenshots | pi | US$0.0148, 15 calls, **timed out at 40 min, no result**: the button crawl hit 30 s screenshot/click timeouts and pi re-ran `npm run verify` three times (about 14 min each) |
| Re-verification (verify:quick, layout checker, shots, crawl recheck, baseline crawl) | Claude | included below |

Findings
- The button crawl is flaky on this machine: with my changes 13 click-failed of 542; with the ORIGINAL code (git HEAD) 19 of 542. So these failures are not caused by the UI/UX changes. Do not spend more than one re-run on it.
- A dispatch whose verifier is 13-minute-flaky is a bad fit for a 40-minute timeout: pi burned the whole budget retrying. Next time: dispatch only the deterministic checks (`verify:quick`, layout checker, shots), and run the crawl once on its own.
- The layout checker caught a real regression in my own change (6 banner paragraphs at 10px on phones); fixed by a 12px floor. It paid for itself.
- Visual judgement stayed with Claude (picture review, crop decision, layout tuning), as planned.

## Experiment 5: CSS colour tokens, matched halves (2026-11-03, track K1)

Plan: `docs/UIUX-DISPATCH-AB-2026-11-03.md`. 66 tokens (ΔE ≤ 2 merges), each half 181–182 replacements. Both arms ran as fresh Sonnet subagents with the same brief and the same acceptance (`style-snapshot --tol-de 2` 0 diffs + `css-debt` caps); measured from each subagent's own transcript with `claude-usage.mjs`. Both passed; Claude re-ran the checks independently afterwards (0 diffs, 896 colour moves all within ΔE 2).

| | K1-A Claude direct | K1-B dispatch to pi (T43) |
|---|---|---|
| Claude calls | 3 | 11 |
| Claude weighted | **99,420** | **433,992** |
| of which cache write | 64,540 | 298,706 |
| pi cost | none | US$0.031 (38 calls) |
| Wall clock | 77 s | 37 min 17 s |
| Snapshot runs | 1 | pi: accept + its own full `npm run verify` |
| Result | 182 replaced, accept pass | 181 replaced, accept PASS, scope ok |

Why dispatch lost (per-call trace): the subagent waited on the dispatcher four times about 10 minutes apart. Each wake found the prompt cache expired (cache read 0) and rewrote the whole ~67k context: about 4 × 67k × 1.25 ≈ 335k of the 434k. Card writing and reading the result cost about the same as the direct arm (~100k). So the extra cost is the waiting, not the card.

Why pi took 37 minutes: the shared prompt's report line asks for `verify: <first line of verify-summary.md>`, which makes pi run the full `npm run verify` (button crawl, 12+ min, and one known flaky craft click) even when the card has its own `Accept:`.

Reading
- Scriptable mechanical work: do it yourself. A short script did the whole half in 3 calls (as in experiment 2). This is the case the playbook already says not to dispatch; the experiment confirms it, with a 4.4× penalty.
- Any dispatch from a context with a 5-minute cache TTL (subagents) must wake once, not every 10 minutes. The top-level session has a 1-hour TTL, so a single background dispatch with one completion notice would avoid the cache misses.
- Tracks K2 (font-size dedupe, cascade-sensitive) and K3 (icon sizes, visual) are not run yet; K2 is the one that tests the case where dispatch should win.

## Experiment 5, track K2: font-size tokens + remove redundant declarations (crossover: A dispatched, B direct)

Fixes applied first (from K1): the shared pi prompt no longer asks for `npm run verify` when the card has `Accept:`; the dispatcher ran in the top-level session's background (1-hour cache) and the card-writing subagent was resumed exactly once with the result. Acceptance: `css-debt --track font` caps + strict `style-snapshot --devices all` (10 sizes, one inside every @media region, 25,996 elements). Claude re-ran all checks afterwards: 0 diffs; the K1 colour check still 0 diffs (ΔE 2).

| | K2-A dispatch to pi (T44) | K2-B Claude direct |
|---|---|---|
| Claude calls | 3 (write card, end; 1 resume to read result) | 9 |
| Claude weighted | **175,024** | **210,450** |
| of which cache write | 129,829 (two cold starts: start + one resume after 11 min) | 55,573 |
| output tokens | 1,380 | 15,289 |
| pi cost | US$0.028, 10 min 29 s, 1 attempt, scope ok | none |
| Wall clock | ~11 min | 5 min 26 s |
| px font-sizes | 196 → 32 | 180 → 18 |
| duplicated font-size selectors | **67 → 36 (−31)** | 76 → 63 (−13) |
| declarations removed | 35 | 41 (incl. selector-group splits) |

Not counted for the dispatch arm: two calls in the long parent session (start the dispatcher, forward the result). In a normal top-level session that writes its own card, those replace the resume, and the second cold start (~80k) disappears, so a realistic figure is about 95–100k.

Reading
- Cascade-sensitive work with a strict script judge: dispatch won on Claude tokens (−17% as measured, about −55% for a single top-level session) and on depth of result (pi removed more than twice as many duplicates; it replayed the cascade at 126 sizes on its own).
- T44 took 10.5 min against T43's 37 min for the same file size: removing the unrequested `npm run verify` was most of the difference.
- Waiting is the dominant hidden cost. Each wake after more than 5 minutes in a subagent is one full cache rewrite (~65k × 1.25). Dispatch from the top-level session (1-hour cache) and wake once.

## Experiment 5 summary (K1 + K2)

| Track | Direct | Dispatch | Winner |
|---|---|---|---|
| K1 colour tokens (scriptable) | 99k | 434k (4 cache-miss wakes) | direct, by 4.4× |
| K2 font dedupe (cascade judgement) | 210k | 175k (one resume) | dispatch, and a deeper result |

Phase 0 (dispatch fixes, snapshot/debt/palette tools, T42 naming, baselines) cost ~1.2M weighted in the long parent session; most of that was cache reads of a long context. K3 (icon integer sizes, visual) not run: it needs the user to review screenshots.
