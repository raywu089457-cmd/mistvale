# Mistvale (暮影村): project rules for pi

Claude and pi both maintain this repo, and other agents also edit it. How the work is split is in [docs/WORK-SPLIT.md](docs/WORK-SPLIT.md), which is written in Chinese for the user. The short version is below.

**Language.** Agent-to-agent text is English: task cards, result files, logs, commit notes for agents. Reply to the user in plain, colloquial Traditional Chinese.

## What you (pi) do
- Run task cards `docs/pi-tasks/Txx-*.md`. Claude usually dispatches them with `tools/pi-dispatch.mjs`, in non-interactive mode, so never ask questions. If the card says stop, write the reason into the result file and exit.
- Typical work:
  - verification runs
  - l0veyou asset generation
  - appending text or changing numbers to a given spec
  - docs
  - commit and push, only when the user said 推 or 交接
- A request without a card that is game logic, needs visual judgement, or is a large UI-template rewrite: say "this should go to Claude" and why.

## Hard rules
1. **Verify**: after any change run `npm run verify:quick`. If UI or buttons changed, run `npm run verify` instead. Report the text of `output/ui-audit/verify-summary.md`.
2. **Foreground only**: in non-interactive (-p) runs, run every command in the foreground and wait, even `npm run verify` (~12 min); background jobs are lost when your turn ends. Write the result file before optional slow steps (Telegram).
3. **Stop after two failures** of the same check. No big rewrites; hand back to Claude.
4. **Never push** unless the user said 推 or 交接, and then follow T04. Pushing main deploys the live site.
5. **Stage only your own files.** Never `git add -A` or `git add .`; the repo holds many untracked files that belong to other agents.
6. **Asset spending**: l0veyou first (free, GPT Image 2). PixelLab only when the card states a budget; check the balance first and log what you spend. If l0veyou says the daily quota is used up, stop and report. Never register or switch accounts.
7. **Secrets**: never print or write the contents of `~/.pixellab-token*` or API keys such as `XAI_API_KEY`.
8. **Do not touch**:
   - `src/pixel-game.js`: hunter AI, combat, dungeon, offline, save/load
   - `src/pixel-world.js`: drawing and the animation state machine

   These are Claude's (MODEL-ROUTING tier C).

## Commands
| What | Command |
| --- | --- |
| Build | `npm run build` (writes `../../outputs/暮影村.html` and `media/`) |
| Tests | `npm test` (11 suites) |
| Full verify | `npm run verify` (~5–8 min: build + tests + button crawl, desktop and phone) / `npm run verify:quick` (~2 min) |
| Screenshots | `node pipeline/scripts/ui-audit/shots-all.mjs desktop\|phone` → `output/ui-audit/shots/` |
| l0veyou image | `node pipeline/scripts/l0veyou/generate.mjs <prompt.txt> <out.png> "" 16:9`; the browser must be open first (see T03) |

Restart the game server (PowerShell):
- Find the old process with `Get-NetTCPConnection -LocalPort 5024` and stop it with `Stop-Process -Id <pid>`.
- Start it again with `Start-Process node -ArgumentList server.mjs -WorkingDirectory <repo> -WindowStyle Hidden`.

It serves http://100.79.149.0:5024/ and re-reads `outputs/暮影村.html` on every request, so a fresh build is live after a reload.
