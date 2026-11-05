# Cost log: Claude (parent) vs the dispatch child agent — conclusions

Raw experiment tables, test clones and experiment-only checkers were removed on 2026-11-05 once the setup was settled.
Before that date the full numbers are in git history (`git log -- docs/pi-tasks/COST-LOG.md`).

How to measure
- Per card: `tools/pi-dispatch.mjs` appends one row per card to `docs/pi-tasks/cost-log.csv` (attempts, verdict, accept, minutes, USD). Per stage: `output/pi-results/agent-tokens.csv`.
- dsh reports no provider cost, so the dispatcher prices its tokens at the provider's rates: input $0.15, output $0.60, cache read $0.003 per 1M.
- Claude side: `node tools/session-cost.mjs --label <name> --log` → `claude-cost.csv`. Weighted = uncached input ×1 + cache write ×1.25 + cache read ×0.1 + output ×5. Tokens only; the plan is a subscription.

## When to dispatch (experiments 1–6, 2026-10-31 → 11-04)

| # | Task | Result |
|---|---|---|
| 1 | T07 balance tool (card needed code reading) | Dispatch did **not** save Claude tokens: writing the card cost as much as doing it. It also added ~15 min of waiting. |
| 2 | T08 dead-code audit (rules-only card) | Dispatch saved ~26% of Claude tokens. Same primary result. |
| 3 | T09 API reference of all src/ (large, rules-only) | Dispatch saved ≥ ~88%. Two small checkers verified it without Claude reading the output. |
| 4 | UI/UX project (visual) | Visual judgement stays with Claude. A 13-min flaky verifier doesn't fit a 40-min timeout: dispatch only deterministic checks. |
| 5 | CSS tokens: K1 colours (scriptable) / K2 font dedupe (cascade judgement) | K1: direct won 4.4× (four cache-miss wakes ≈ 335k). K2: dispatch won −17% and gave a deeper result. |
| 6 | Six-goal UI/UX batch, T54–T59 | Dispatch used 16% of direct Claude tokens (301k vs 1,905k), about 6× the wall time. Quality comparable, different blind spots. |

Rules that came out of it (also in CLAUDE.md and DISPATCH-PLAYBOOK):
- Dispatch when the card can be written from rules alone and an objective command can judge the result. Do it directly when a short script answers the question.
- Multi-card batches are where dispatch pays most.
- Waiting is the hidden cost. Dispatch from the top-level session in the background and wake once on the completion notice. Each wake after the cache TTL rewrites the whole context.
- Don't make the child run the full `npm run verify` when the card has its own `Accept:`.

## Which child agent (experiments 7–10, 2026-11-04 → 11-05)

Every arm used the same model and gateway (opencode-go / deepseek-v4.1-flash, reasoning high), the same base and the same checkers, each in its own clone.

| # | Setup | pi | opencode | dsh |
|---|---|---|---|---|
| 7 | 3 tasks, bare harness | baseline | ~52% of pi's tokens | — |
| 8 | 3 cards, full pipeline (plan → implement → accept → review) | baseline | −7%; one 40-min hang | — |
| 9 | 4 a11y cards (large) | $0.672 · 159 min · 3/4* | $0.544 · 98 min · 4/4 | sandboxed $0.586 · 2/4; **full access $0.444 · 66 min · 4/4** |
| 10 | 5 save-slot cards (stateful) | $0.371 · 95 min · 5/5 | $0.367 · 69 min · 5/5 | **$0.363 · 59 min · 5/5** |

\* pi's T65 was blocked by a dispatcher bug, not by pi: staged files were missing from the diff. Fixed (`git diff HEAD`).

Decision (2026-11-05): **dsh is the child agent**. It runs with `tools/dsh-overlay.yml` and `DSH_PERMISSION_MODE=danger-full-access`. Across both large batches it was the cheapest or tied and the fastest, never hung, and needed no extra tries.
- The sandbox must be off. On Windows, dsh's workspace-write sandbox blocks child processes (git, esbuild, Playwright fail with EPERM), and headless mode cannot ask for approval.
- pi stays as a fallback only (`DISPATCH_AGENT=pi`). opencode support was removed.

Other lessons:
- The review stage is worth its cost. In experiments 9–10 it caught real defects that every behavioural checker missed: a lost selected-state cue in high contrast, a ~1.2:1 focus ring, transparent HP bars, a double offline payout from an old export, a corrupt slot blocking migration.
- A checker only makes a task as hard as the paths it rules out. In experiment 10 all three agents switched save slots with `location.reload()`, which made the "offline on switch" card free.
