# Script Memory

## pnpm workspace scripts

- `pnpm-workspace.yaml`은 package manager mismatch 처리를 `ignore`로 둬 pnpm이 sandbox 내부에서 `packageManager`에 명시된 pnpm 자체를 자동 fetch하지 않게 한다.
- sandbox 실패나 fallback 실행으로 workspace 안에 `.pnpm-store/`가 생길 수 있으므로 git, Prettier, ESLint ignore 대상으로 둔다.
- `pnpm --recursive --parallel --if-present <script>`는 루트 패키지의 `<script>`를 재귀 실행하지 않고, workspace 패키지들의 해당 script를 실행한다.
- 루트 `dev` 스크립트가 `infisical run -- pnpm --recursive --parallel --if-present dev`처럼 workspace script 실행을 감싸는 구조여도, 이것만으로 루트 `dev`가 자기 자신을 무한 재귀 호출한다고 판단하면 안 된다.
- 관련 리뷰를 작성하거나 수정할 때는 실제 재현 로그 없이 재귀 실행을 단정하지 않는다.
- 루트 script 래퍼 구조를 바꾸는 경우, 이 메모의 전제가 여전히 맞는지 확인하고 변경 사항을 업데이트한다.

## Script And Tooling Review

- 실행 스크립트는 명령이 성공하는지만 보지 말고 사용자가 기대하는 visible workflow까지 확인한다.
- iOS/Android 실행 스크립트는 실제 기기/시뮬레이터 선택 목록, 앱 창 foreground, install/launch 결과처럼 사용자가 보는 동작을 검증한다.
- tool output JSON field나 runtime API를 근거로 필터를 바꿀 때는 현재 target tool 버전의 실제 출력에 해당 field가 있는지 확인한다.
- Node/Web/OS별 API 지원 여부를 확인하지 않고 polyfill이나 대체 구현으로 바꾸지 않는다.
- CI runner를 바꾸는 PR은 실제 target runner에서 workflow가 실행되는지 확인한다.
- security scanner나 CI step에 `continue-on-error`를 쓰는 경우, 후속 step에서 실패 여부를 명시적으로 판정해 workflow가 조용히 성공하지 않게 한다.
- dependency, tooling, CI 명령이 바뀌면 변경 이유와 platform 제약을 리뷰에서 확인한다.

## Codex worktree setup

- `.codex/environments/environment.toml`의 setup script는 `mise trust`와 `pnpm install` 전에 원격 `refs/heads/main`을 `refs/remotes/origin/main`으로 fetch하고, 해당 ref의 commit OID를 확정한 뒤 로컬 `main` worktree 또는 `main` ref를 fast-forward로 최신화한다.
- 새 Codex worktree의 현재 HEAD가 fetch된 `origin/main` commit의 조상인 경우에는 현재 worktree도 해당 commit까지 fast-forward하거나 detached HEAD를 해당 commit으로 옮긴다.
- 로컬 `main`이 `origin/main`으로 fast-forward될 수 없는 상태라면 setup에서 자동 갱신을 거부하고 실패시킨다.
