# T70: 派工 --parallel 改成每張卡各自 git worktree

Status: failed
Accept: auto

## Goal
Make `node tools/pi-dispatch.mjs Txx Tyy --parallel` run each card at the same time in its own git worktree, so cards that touch different files no longer queue behind each other. Today `--parallel` only allows cards that don't build or edit src/, and they share one checkout.

Required behaviour:
- **Setup:** each card gets a worktree under `output/pi-worktrees/<id>` made from HEAD. The main checkout's uncommitted changes (tracked diffs plus untracked files under src/, assets/, tools/, pipeline/) are copied in, so the card starts from the same state the user sees.
- **Junctions:** node_modules is a junction or symlink to the main checkout's. Never delete through it: remove the junction before removing the worktree.
- **Ports:** builds, tests and the acceptance command run inside the worktree. Each card's server and ports are its own (server.mjs already reads PORT/HOST from env).
- **Bringing changes back:** when a card passes, its changes are applied back to the main checkout with a 3-way `git apply` or merge. If two cards changed the same file and the patch doesn't apply cleanly, the second card is marked `CONFLICT`, its patch is kept in `output/pi-results/<id>.patch`, and the main checkout is left untouched.
- **Ledgers:** the scope check, diff, review, cost log and result files work per card as they do now, with each card's changes measured inside its own worktree.
- **Cleanup:** remove the worktree after the card ends, pass or fail, but keep it when the result is `CONFLICT` or `--keep-worktree` is passed.
- **No `--parallel`:** behaviour stays exactly as today.

Accept: extend `tools/checks/dispatch-selftest.mjs` (or add a checker next to it), using a fake agent and no real dsh calls. Two parallel fake cards edit different files: both apply back. Two fake cards edit the same lines: the second ends up CONFLICT with a .patch file and the main file unchanged. Also check that node_modules in the main checkout still exists after cleanup. The check must fail on today's code.
