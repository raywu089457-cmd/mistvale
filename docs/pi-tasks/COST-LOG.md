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

## Experiment 6 — six-goal UI/UX batch, dispatch vs direct (2026-11-04)

Same six goal-only goals (focus-visible, modal consistency, WCAG AA contrast, reduced motion, phone min 12px font, empty states), each with its own new browser checker.

| | Claude weighted | Claude calls | wall | pi USD | own checkers |
|---|---|---|---|---|---|
| A dispatch T54–T59 (Opus parent, 1 card write + 1 dispatch + read) | **301k** | 14 | 210 min | $0.91 | 6/6 PASS |
| B direct (Sonnet subagent, worktree on 8896fbc) | **1,905k** | 91 (119 tool uses) | 36 min | – | 6/6 PASS |

Dispatch = 16% of direct (−84%). Direct cost is mostly cache reads (12.8M) of a growing context over 91 calls; dispatch's is fixed prompt overhead.

Cross-check (each side's checkers run on the other's result): neither side fully passes the other's.
- pi ahead: reduced motion (B missed a 180ms WAAPI `el.animate()` in pixel-ui.js and called the goal ALREADY), phone font (B left 7–8.5px text: `::before` markers and `--ui-scale` 0.85 zoom), modals (B lets confirm dialogs close on backdrop; HUD not inert).
- B ahead: contrast (B samples pixels incl. gradients: 76 offenders in A vs pi's 26-surface model: 4 in B), empty states (B: 34 missing next-step hints on phone storage etc.), top bar grows 88→98px in A at 390px.
- Some pi checks are implementation-specific (`listHTML`, `.inert`), so they over-fail B. Caveat: B started two commits older (before bae2e7c), so a share of the gaps is base drift.

Verdict: dispatch wins clearly on Claude tokens for a multi-card batch; quality is comparable with different blind spots, and cost is ~6× wall time. pi review was skipped on T54–T56 because a concurrent session's tier-C edits tripped the scope check (false positive).

## Experiment 7 — harness A/B: pi vs opencode (2026-11-04)

Same model (`opencode-go/deepseek-v4.1-flash`), same base `bae2e7c`, same prompt, same checker, each run in its own `git clone --shared`.
Tool: `tools/harness-ab.mjs`; raw rows in `harness-ab.csv` (`v1-*` rows are invalid early attempts). Weighted = input + cache_read×0.1 + output×5.
opencode reports $0 (subscription); its $ below is priced at pi's observed rate for the same model.

| task | arm | min | calls | input | cache_read | output | reasoning | weighted | est $ | accept |
|---|---|---|---|---|---|---|---|---|---|---|
| reduced-motion | pi | 5.3 | 24 | 67k | 1.28M | 7.7k | 5.0k | 233k | 0.015 | PASS |
| reduced-motion | opencode | 0.7 | 8 | 37k | 0.25M | 0.9k | 0.9k | 67k | 0.004 | PASS |
| modal-close | pi | 40.0 (timeout) | 47 | 104k | 3.87M | 18.8k | 11.0k | 585k | 0.038 | PASS |
| modal-close | opencode | 6.0 | 30 | 67k | 1.51M | 5.9k | 7.3k | 247k | 0.016 | PASS |
| empty-states | pi | 39.1 | 79 | 128k | 7.36M | 43.6k | 27.0k | 1,082k | 0.071 | PASS |
| empty-states | opencode | 8.2 | 60 | 111k | 5.21M | 7.9k | 17.9k | 672k | 0.044 | PASS |
| **total** | pi | 84.4 | 150 | 300k | 12.5M | 70k | 43k | 1,901k | 0.125 | 3/3 |
| **total** | opencode | 14.9 | 98 | 216k | 6.96M | 15k | 26k | 986k | 0.065 | 3/3 |

Findings
- opencode: **52% of pi's weighted tokens, 18% of the wall time, 65% of the calls**, same pass rate. Gap is biggest on small tasks (reduced-motion 29%) and shrinks on big ones (empty-states 62%).
- pi's extra cost is mostly output (4.8× opencode) and re-reading history (cache_read 1.8×): it writes probe/screenshot scripts under `.pi/`, backs files up, re-runs the build, and verifies more.
- Quality: both diffs are close in shape. pi was more defensive. On modal-close it added a click-fallback opener for Safari/iOS focus. On empty-states it used `<p>` to avoid the phone `.notice-feed div:first-child{display:none}` rule, which opencode handled with dedicated CSS instead. Neither touched `pixel-game.js`/`pixel-world.js`.
- Isolation verified: all tool calls ran inside each clone. The "T59" in pi's comments comes from the checker header.
- n=1 per cell; times include API latency at different hours. Treat as direction, not a precise ratio.

## Experiment 8 — full dispatch pipeline: pi vs opencode (2026-11-04)

Same 3 goals as Experiment 7, now as goal-only cards (T60 reduced-motion, T61 modal-close, T62 empty-states) through
`tools/pi-dispatch.mjs`: PLAN → implement → accept → REVIEW, with a redo when review raises a `high`. `DISPATCH_AGENT=opencode`
runs every stage on opencode. Same model, same base `bae2e7c`, one `git clone --shared` per agent, both run in parallel.
Per-stage tokens: `output/pi-results/agent-tokens.csv` in each clone. Weighted = input + cache_read×0.1 + output×5; opencode $ priced at pi's rate ($0.08 / 1M weighted).

| card | pi min | pi weighted | pi tries | opencode min | opencode weighted | opencode tries |
|---|---|---|---|---|---|---|
| T60 reduced-motion | 7.7 | 444k | 1 | 5.4 | 339k | 1 |
| T61 modal-close | 35.5 | 816k | 1 | 6.0 | 317k | 1 |
| T62 empty-states | 44.9 | 1,963k | 2 | 64.6 | 2,340k | 3 |
| **total** | **88.1** | **3,223k ≈ $0.256** | | **76.0** | **2,996k ≈ $0.238** | |

By stage — pi: plan 564k / impl 1,505k / review 1,154k. opencode: plan 394k / impl 1,653k / review 949k.
All 6 cards: accept PASS, scope ok, final review OK, except pi T62, whose final review is ISSUES with low-severity items only.

Findings
- **In the full pipeline opencode saves only ~7% tokens (bare harness: 48%)**, and wall time is about the same.
  Per card it is cheaper on T60 (−24%) and T61 (−61%). It is more expensive on T62 (+19%): review sent it back twice (3 tries vs pi's 2), and its second implement alone re-read 6.7M cached tokens.
- Why the gap closes: opencode does less self-checking, so the reviewer finds more and the redo loop spends what was saved.
  pi pays up front (output 176k vs 65k), opencode pays in redos (calls 265 vs 222, input 951k vs 669k).
- Both reviewers independently flagged the same pre-existing issue in T60 (`.res-float{display:none}` hides the resource delta for reduced-motion players). Review quality looks comparable.
- Stability: in Experiment 8 run 1, opencode's T61 implement hung for the full 40-min timeout and passed on the automatic retry. pi did not hang.
- Caveats: n=1 per card. The run was interrupted by an app restart, so pi's T61/T62 and opencode's T62 were rerun ~2.5 h later (partial rows set aside, not counted).
  The browser half of `ui-empty-states.mjs` hits the shared `:5024` server (main checkout's build), so only its static half proves the clone's change. Both agents noticed and checked their own build on another port.

Verdict: on this workload, switching the dispatch pipeline to opencode is not worth the integration and stability risk. Keep pi as the default.
`DISPATCH_AGENT=opencode` stays available for small one-shot cards (T60/T61 type), where it was clearly cheaper.

## Experiment 9 — large 4-card a11y batch: pi vs opencode vs DeepSeek Harness (2026-11-05)

Task: a 無障礙 section in the settings modal, as 4 dependent goal-only cards. T63 is the section and persistence; T64 high contrast; T65 a reduced-motion override; T66 full numbers on the top bar.
Each card is accepted by the behavioural checker `tools/checks/a11y-settings.mjs`. It builds the clone, serves it on its own port and drives Playwright on desktop and a 375px phone.
Built-in trap: `game.setSetting` → `normalizeSettings` drops unknown keys, and pixel-game.js is off limits, so the settings must be persisted UI-side. The cards don't say so.

All arms used the same model (opencode-go / deepseek-v4.1-flash, reasoning high) from the same base `bae2e7c`, each in its own clone, through the full pipeline (plan → implement → accept → review → redo).
$ is real USD at pi's prices (input 0.15 / output 0.60 / cache read 0.003 per M); opencode output includes reasoning.
dsh = `@deepseek-ai/dsh` 0.2.1-rc.5, headless profile plus an overlay that points it at the same gateway.
"dsh-full" is the same run with `DSH_PERMISSION_MODE=danger-full-access` (sandbox off, approval never).

| card | pi | opencode | dsh (sandbox) | dsh-full |
|---|---|---|---|---|
| T63 section | $0.163 · 35m · 2x | $0.081 · 12m · 1x | $0.146 · 21m · 1x | $0.064 · 10m · 1x |
| T64 contrast | $0.269 · 52m · 3x | $0.160 · 28m · 3x (review ISSUES) | $0.284 · 48m · 3x BLOCKED | $0.157 · 22m · 2x |
| T65 motion | $0.092 · 40m · 2x BLOCKED* | $0.057 · 9m · 1x | $0.075 · 20m · 1x | $0.072 · 10m · 1x |
| T66 numbers | $0.148 · 31m · 2x | $0.246 · 50m · 2x | $0.080 · 14m · 1x BLOCKED | $0.152 · 24m · 2x |
| **total** | **$0.672 · 159m** | **$0.544 · 98m** | **$0.586 · 103m** | **$0.444 · 66m** |
| tool calls | 501 | 365 | 653 | 531 |
| pipeline DONE | 3/4 | 4/4 | 2/4 | **4/4, all reviews OK** |

The full `a11y-settings.mjs --part all` cross-check afterwards PASSES on all four clones, including the cards marked BLOCKED: their code was finished, only the bookkeeping blocked.
All four avoided the trap: each persists under its own validated localStorage key (`mistvale-a11y[-v1]`) and mirrors the value to `<html data-*>`.

Findings
- **dsh with full access was the cheapest (−34% vs pi), the fastest, and the only arm with a clean sheet.** Run sandboxed it was the worst arm.
  The workspace-write sandbox blocks child-process pipes on Windows (git, esbuild and Playwright all fail with EPERM). The escalation to danger-full-access needs an approval channel that headless mode lacks, so it burned its T64 tries working around that and BLOCKED twice.
  When used for dispatch, dsh must run with `DSH_PERMISSION_MODE=danger-full-access`.
- **opencode was again cheaper than pi (−19%)** and passed acceptance on every card. But its final T64 review still found two highs: the selected option marker was wiped out in high contrast, and the focus ring dropped to ~1.2:1.
- \*pi T65 BLOCKED is a **dispatcher bug, not pi**. The implementer `git add`-ed its files, and `snapshot()` in `tools/pi-dispatch.mjs` only lists `git diff --name-only` (unstaged). The diff came out empty, and the reviewer rightly refused to approve blind. Fix: also list staged changes (`git diff HEAD --name-only`).
- Review again caught what the checker can't: the selected-state cue, the focus ring, HP bars turning transparent, the `+` button losing its only glyph under 370px. All of these were in arms that had already passed the checker.
- Caveats: n=1 per card. pi, opencode and dsh ran in parallel. dsh-full started 2h40m later and mostly ran alone, so its wall time is flattered; its $ isn't, since token use doesn't depend on load.

Verdict: on this large batch, rank by $ and outcome: dsh-full > opencode > pi > dsh (sandbox). pi stays the default until the snapshot bug is fixed and dsh-full repeats this on a second batch (n=1 so far).
`DISPATCH_AGENT=dsh` + `DSH_PERMISSION_MODE=danger-full-access` is the strongest candidate to switch to.

## Experiment 10 — harder 5-card batch: save slots, pi vs opencode vs dsh-full (2026-11-05)

Task: 存檔管理 (save management) as 5 dependent goal-only cards:
- T67: 3 slots, plus migration of the legacy save
- T68: switch slots / new game
- T69: export/import
- T70: delete with confirmation
- T71: offline earnings on switch

Accept: the behavioural checker `tools/checks/save-slots.mjs`. It seeds real saves serialised by the game itself, then drives reloads, the 5 s autosave, downloads, file uploads and Escape in Playwright.
Traps written into the goals:
- don't lose existing players' saves
- autosave must follow the active slot
- the old game must not overwrite an imported save
- Escape must cancel the confirmation, not close the modal
- no double offline payout

Setup as in Experiment 9 (same model and gateway, base `bae2e7c`, one clone per arm, run in parallel). The dispatcher is the fixed one (`git diff HEAD`). dsh runs with `DSH_PERMISSION_MODE=danger-full-access`.

| card | pi | opencode | dsh-full |
|---|---|---|---|
| T67 slots + migration | $0.089 · 21m · 1x | $0.109 · 17m · 2x | $0.073 · 14m · 1x |
| T68 switch | $0.079 · 14m · 1x | $0.048 · 7m · 1x | $0.067 · 10m · 1x |
| T69 export/import | $0.074 · 11m · 1x | $0.067 · 11m · 1x | $0.079 · 11m · 1x |
| T70 delete | $0.092 · 37m · 1x | $0.071 · 10m · 2x | $0.077 · 10m · 1x |
| T71 offline on switch | $0.037 · 12m · 1x | $0.072 · 23m · 2x | $0.066 · 14m · 1x |
| **total** | **$0.371 · 95m** | **$0.367 · 69m** | **$0.363 · 59m** |
| tool calls / tries | 318 / 5 | 349 / 8 | 458 / 5 |

All 15 cards: DONE, accept PASS, scope ok, final review OK. The full `save-slots.mjs --part all` passes on all three clones afterwards. pi had no BLOCKED card this time; the staged-file fix held.

Findings
- **The arms converged: within 2% on $.** dsh-full is again the fastest (59m vs 69m vs 95m). pi's wall time came mostly from T70 (37m for one try).
- **The task was less hard than designed.** All three arms independently switch slots by saving, setting the active key and calling `location.reload()`, which reuses the boot path.
  That is good engineering, and it made T71 nearly free: offline earnings come from the boot path. opencode's reviewer noticed that `--part e` already passed after T68 (empty T71 diff).
  To force a really hard path, a goal must forbid the reload (in-place `createGame` swap + `runOffline`), or the checker must assert that no navigation happens.
- Review keeps finding real edge cases the checker can't see:
  - importing an hours-old export into the active slot grants offline earnings (opencode T69)
  - a file without `version: 2` passes the spec's validation, but `restore()` silently discards it, so you get a fresh village (dsh T69; a spec gap in my card)
  - a corrupt slot key shows as empty and blocks migration (pi T67)
  - slot rows are a snapshot that never refreshes while autosave runs (pi T67)
- Checker gaps the reviewers pointed out: the densest phone row (a filled inactive slot with 4 buttons) is never laid out; paused saves are never seeded; the size of the offline payout is not checked.

Verdict after Experiments 9 + 10: dsh-full is the cheapest or tied (−34%, −2%) and the fastest both times, with no hangs or BLOCKED cards. opencode is in the middle; pi is the slowest.
Strongest candidate for the default: `DISPATCH_AGENT=dsh` + `DSH_PERMISSION_MODE=danger-full-access`. It has the same unsandboxed trust level as pi today.
