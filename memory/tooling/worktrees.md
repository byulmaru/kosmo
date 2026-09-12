# Script Memory: Codex Worktrees

## Codex worktree setup

- `.codex/environments/environment.toml`의 setup script는 `mise trust`와 `pnpm install` 전에 원격 `refs/heads/main`을 `refs/remotes/origin/main`으로 fetch하고, 해당 ref의 commit OID를 확정한 뒤 로컬 `main` worktree 또는 `main` ref를 fast-forward로 최신화한다.
- 새 Codex worktree의 현재 HEAD가 fetch된 `origin/main` commit의 조상인 경우에는 현재 worktree도 해당 commit까지 fast-forward하거나 detached HEAD를 해당 commit으로 옮긴다.
- 로컬 `main`이 `origin/main`으로 fast-forward될 수 없는 상태라면 setup에서 자동 갱신을 거부하고 실패시킨다.

## CodeGraph in linked worktrees

- 이 저장소에서 CodeGraph가 초기화된 것으로 보는 기준은 현재 worktree에 `.codegraph/codegraph.db`가 있는 경우다. `.codegraph/`에 `.gitignore`만 있으면 초기화된 index가 아니다.
- linked worktree에서는 사용자 승인 없이 `codegraph init`을 실행하지 않는다.
- 현재 worktree에 local index가 없으면 `git worktree list --porcelain`으로 `main` checkout을 찾는다. 그 checkout에 `.codegraph/codegraph.db`가 있으면 절대 경로를 CodeGraph의 `projectPath`로 전달해 read-only structural baseline으로만 사용하며, machine-specific checkout 경로를 repository 파일에 기록하지 않는다.
- shared baseline을 사용하기 전 `codegraph status <main-checkout-path>`로 index freshness를 확인한다. freshness를 확인할 수 없거나 pending/stale이면 baseline 전체를 stale로 보고 current-worktree reads와 targeted searches를 사용한다.
- baseline에 의존하기 전 baseline과 current worktree의 차이, staged·unstaged·untracked 경로를 양쪽에서 수집한다. 해당 경로와 이를 가로지르는 관계의 CodeGraph 결과는 hint로만 보고 current worktree를 직접 확인한다.
- graph-shaping configuration이 다르거나 broad structural change이면 baseline이 branch-exact하지 않음을 밝히고 current worktree에 초기화할지 묻는다. 그 밖에는 worktree-local index를 기본 생성하지 않는다.
