# Script Memory: Codex Worktrees

## Codex worktree setup

- `.codex/environments/environment.toml`의 setup script는 `mise trust`와 `pnpm install` 전에 원격 `refs/heads/main`을 `refs/remotes/origin/main`으로 fetch하고, 해당 ref의 commit OID를 확정한 뒤 로컬 `main` worktree 또는 `main` ref를 fast-forward로 최신화한다.
- 새 Codex worktree의 현재 HEAD가 fetch된 `origin/main` commit의 조상인 경우에는 현재 worktree도 해당 commit까지 fast-forward하거나 detached HEAD를 해당 commit으로 옮긴다.
- 로컬 `main`이 `origin/main`으로 fast-forward될 수 없는 상태라면 setup에서 자동 갱신을 거부하고 실패시킨다.
