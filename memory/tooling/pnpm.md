# Script Memory: pnpm And Test Databases

## pnpm workspace scripts

- `pnpm-workspace.yaml`은 package manager mismatch 처리를 `ignore`로 둬 pnpm이 sandbox 내부에서 `packageManager`에 명시된 pnpm 자체를 자동 fetch하지 않게 한다.
- sandbox 실패나 fallback 실행으로 workspace 안에 `.pnpm-store/`가 생길 수 있으므로 git, Prettier, ESLint ignore 대상으로 둔다.
- `pnpm --recursive --parallel --if-present <script>`는 루트 패키지의 `<script>`를 재귀 실행하지 않고, workspace 패키지들의 해당 script를 실행한다.
- 루트 `dev` 스크립트가 `node scripts/vault-run.mjs -- pnpm --recursive --parallel --if-present dev`처럼 workspace script 실행을 감싸는 구조여도, 이것만으로 루트 `dev`가 자기 자신을 무한 재귀 호출한다고 판단하면 안 된다.
- `scripts/vault-run.mjs`는 Vault CLI의 현재 인증 상태를 사용해 기본 `secret/kubernetes/kosmo/local` 값을 env로 주입하고, 토큰 조회가 실패하면 `vault login -method=oidc`를 실행한다. 다른 path가 필요하면 wrapper CLI 옵션 `--env <name>` 또는 `--secret-path <path>`를 `-- <command>` 앞에 둔다.
- 관련 리뷰를 작성하거나 수정할 때는 실제 재현 로그 없이 재귀 실행을 단정하지 않는다.
- 루트 script 래퍼 구조를 바꾸는 경우, 이 메모의 전제가 여전히 맞는지 확인하고 변경 사항을 업데이트한다.

## Non-interactive pnpm execution

- `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`가 발생하면 같은 명령을 그대로 반복하지 않는다.
- 이미 설치된 workspace 도구를 실행하려는 경우에는 repository script 또는 `./node_modules/.bin/<tool>`을 우선 사용한다.
- dependency 동기화가 실제로 필요한 경우에만 `CI=true pnpm install`을 한 번 실행한 뒤 원래 검증 명령을 다시 실행한다.

## Disposable test database

- 공용 `kosmo_test` schema가 현재 코드보다 뒤처져 DB-backed 테스트가 실패하면 `pnpm db:test:reset && pnpm db:test:push`로 초기화한 뒤 다시 검증한다.
- 병렬 작업이나 테스트 간 격리가 필요하면 `node scripts/test-db.mjs run -- <command>`로 고유 test database를 할당한다.
- test database의 schema 불일치를 구현 결함으로 판단하기 전에 위 초기화 또는 격리 절차로 재현 여부를 확인한다.
- workspace package의 기본 `test`는 CI에서 해당 package의 전체 테스트를 실행한다. API integration처럼 DB가 필요한 suite는 package 단위 aggregate script 하나가 격리 DB를 준비해 전체 suite를 실행하며, 개별 테스트 파일 선택용 root script를 추가하지 않는다.
- 특정 API integration 파일만 디버깅할 때는 package manifest에 파일별 alias를 늘리지 말고 준비된 test DB에서 Node test runner에 파일 경로를 직접 전달한다.
