# Script Memory

## pnpm workspace scripts

- `pnpm-workspace.yaml`은 package manager mismatch 처리를 `ignore`로 둬 pnpm이 sandbox 내부에서 `packageManager`에 명시된 pnpm 자체를 자동 fetch하지 않게 한다.
- sandbox 실패나 fallback 실행으로 workspace 안에 `.pnpm-store/`가 생길 수 있으므로 git, Prettier, ESLint ignore 대상으로 둔다.
- `pnpm --recursive --parallel --if-present <script>`는 루트 패키지의 `<script>`를 재귀 실행하지 않고, workspace 패키지들의 해당 script를 실행한다.
- 루트 `dev` 스크립트가 `infisical run -- pnpm --recursive --parallel --if-present dev`처럼 workspace script 실행을 감싸는 구조여도, 이것만으로 루트 `dev`가 자기 자신을 무한 재귀 호출한다고 판단하면 안 된다.
- 관련 리뷰를 작성하거나 수정할 때는 실제 재현 로그 없이 재귀 실행을 단정하지 않는다.
- 루트 script 래퍼 구조를 바꾸는 경우, 이 메모의 전제가 여전히 맞는지 확인하고 변경 사항을 업데이트한다.

## Codex worktree setup

- `.codex/environments/environment.toml`의 setup script는 `mise trust`와 `pnpm install` 전에 원격 `refs/heads/main`을 `refs/remotes/origin/main`으로 fetch하고, 해당 ref가 실제로 생겼는지 검증한 뒤 로컬 `main` worktree 또는 `main` ref를 fast-forward로 최신화한다.
- 새 Codex worktree의 현재 HEAD가 `origin/main`의 조상인 경우에는 현재 worktree도 `origin/main`까지 fast-forward하거나 detached HEAD를 `origin/main`으로 옮긴다.
- 로컬 `main`이 `origin/main`으로 fast-forward될 수 없는 상태라면 setup에서 자동 갱신을 거부하고 실패시킨다.
