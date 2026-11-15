# Mistvale (暮影村): project rules for every coding agent

This repo is maintained by Claude and by other agents (DSH / dsh sessions, subagents). These rules apply to all of them.

**Language.** Agent-to-agent text (task notes, logs, code comments) is English. Reply to the user in plain, colloquial Traditional Chinese.

> 2026-11-12: the old task-card dispatch system (`tools/pi-dispatch.mjs`, `tools/pi-card.mjs`, `docs/pi-tasks/`, `docs/DISPATCH-PLAYBOOK.md`, `docs/WORK-SPLIT.md`, the classifier and the cost tools) was removed at the user's request. There are no task cards and no dispatch commands any more; work is planned and done directly in the session.

## Hard rules
1. **Verify**: after any change run `npm run verify:quick`; if UI or buttons changed, run `npm run verify`. Report the result honestly, including failures.
2. **Never push** unless the user said 推 or 交接. Pushing `main` deploys the live site.
3. **Stage only your own files.** Never `git add -A` or `git add .`; the repo holds many untracked files that belong to other agents.
4. **Asset spending**: l0veyou first (free, GPT Image 2). PixelLab only when the budget is explicitly agreed; check the balance first and log what you spend. If l0veyou says the daily quota is used up, stop and report. Never register or switch accounts.
5. **Secrets**: never print or write the contents of `~/.pixellab-token*` or API keys such as `XAI_API_KEY`.
6. **Do not touch** without the high-risk path (MODEL-ROUTING tier C, hand it to the Opus-tier reviewer):
   - `src/pixel-game.js`: hunter AI, combat, dungeon, offline, save/load
   - `src/pixel-world.js`: drawing and the animation state machine
7. **Stop after two failures** of the same check instead of rewriting blindly; report what failed.

## Commands
| What | Command |
| --- | --- |
| Build | `npm run build` (writes `../../outputs/暮影村.html` and `media/`) |
| Tests | `npm test` (11 suites) |
| Full verify | `npm run verify` (~5–8 min: build + tests + button crawl, desktop and phone) / `npm run verify:quick` (~2 min) |
| Screenshots | `node pipeline/scripts/ui-audit/shots-all.mjs desktop\|phone` → `output/ui-audit/shots/` |
| l0veyou image | `node pipeline/scripts/l0veyou/generate.mjs <prompt.txt> <out.png> "" 16:9`; the browser must be open first |

## Servers (PowerShell)
- Main repo: serves `http://100.79.149.0:5024/` and re-reads `outputs/暮影村.html` on every request, so a fresh build is live after a reload.
- A worktree branch (`PORT=5025`) serves its own `dist/暮影村.html` on `http://100.79.149.0:5025/` (used by `exp/pixel-ui` to preview the canvas UI).
- Find a running server with `Get-NetTCPConnection -LocalPort 5024` and stop it with `Stop-Process -Id <pid>`; start it with `Start-Process node -ArgumentList server.mjs -WorkingDirectory <repo> -WindowStyle Hidden`.

## Models

Model tiers and the high-risk list live in [docs/MODEL-ROUTING.md](docs/MODEL-ROUTING.md). High-risk logic goes to the Opus-tier reviewer (`game-logic-opus`), never to the default fast path. Do not switch provider or register accounts.

## Documentation map

File map: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Export reference: [docs/API-pi.md](docs/API-pi.md). Pixel UI design spec (branch `exp/pixel-ui`): [docs/pixel-ui/eht-style-spec.md](docs/pixel-ui/eht-style-spec.md), applied-state report: [docs/pixel-ui/EHT-APPLIED.md](docs/pixel-ui/EHT-APPLIED.md).
