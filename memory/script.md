# Script Memory

## pnpm workspace scripts

- `pnpm-workspace.yaml`은 package manager mismatch 처리를 `ignore`로 둬 pnpm이 sandbox 내부에서 `packageManager`에 명시된 pnpm 자체를 자동 fetch하지 않게 한다.
- sandbox 실패나 fallback 실행으로 workspace 안에 `.pnpm-store/`가 생길 수 있으므로 git, Prettier, ESLint ignore 대상으로 둔다.
- `pnpm --recursive --parallel --if-present <script>`는 루트 패키지의 `<script>`를 재귀 실행하지 않고, workspace 패키지들의 해당 script를 실행한다.
- 루트 `dev` 스크립트가 `node scripts/vault-run.mjs -- pnpm --recursive --parallel --if-present dev`처럼 workspace script 실행을 감싸는 구조여도, 이것만으로 루트 `dev`가 자기 자신을 무한 재귀 호출한다고 판단하면 안 된다.
- `scripts/vault-run.mjs`는 Vault CLI의 현재 인증 상태를 사용해 기본 `secret/kubernetes/kosmo/local` 값을 env로 주입하고, 토큰 조회가 실패하면 `vault login -method=oidc`를 실행한다. 다른 path가 필요하면 wrapper CLI 옵션 `--env <name>` 또는 `--secret-path <path>`를 `-- <command>` 앞에 둔다.
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

## Expo, Relay, Web BFF

- `apps/app`의 `prepare`, `dev`, `check`, `build`는 필요한 Relay generated artifact보다 먼저 `relay-compiler`를 실행한다. `__generated__`는 commit하지 않으므로 clean checkout과 CI에서도 compiler 선행을 생략하지 않는다.
- universal client 검증은 `pnpm --filter @kosmo/app relay`, `check`, `export:web`을 분리해 실패 경계를 확인한다. `export:web`은 이전 환경의 `EXPO_PUBLIC_*` inline 값을 Metro cache에서 재사용하지 않도록 `expo export --clear`를 사용한다. Expo web export 산출물은 `apps/app/dist`이며 UI source를 소유하지 않는 `apps/web` Hono BFF가 이를 제공한다.
- BFF 검증은 federation-first 전역 전달과 공식 미처리 callback, federation 표현의 404 보존, `/health`, browser 로그인/callback, cookie/Bearer GraphQL proxy, WebFinger/ActivityPub 응답, SPA deep-link fallback을 포함한다. Native session exchange는 API GraphQL mutation의 별도 API E2E로 검증한다. Expo export 성공만으로 server origin 계약이 검증됐다고 보지 않는다.
- native project는 Expo managed/CNG 산출물이다. package/bundle ID나 config plugin을 검증할 때는 app config와 clean `expo prebuild` 결과를 확인하고, 생성된 Gradle/Xcode source를 수동 source of truth로 편집하지 않는다.
- Android/iOS 실행 검증은 기존 원칙대로 사용자가 보는 install/launch/deep-link 결과까지 확인한다. web 전용 검증으로 native build 가능성을 대신하지 않는다.
- `EXPO_PUBLIC_*` 값은 client bundle에 공개되어도 되는 설정에만 사용한다. OIDC client secret, session token, database/federation 설정은 Hono BFF 또는 server runtime에 남긴다.
- `apps/app/app.config.ts`는 `PUBLIC_ORIGIN`, `PUBLIC_API_ORIGIN`, `PUBLIC_OIDC_ISSUER`, `PUBLIC_OIDC_NATIVE_CLIENT_ID`를 대응하는 `EXPO_PUBLIC_*`로 이식하되 명시적 `EXPO_PUBLIC_*` override를 우선한다. web confidential client ID와 secret은 Expo bundle에 이식하지 않는다. 이 mapping은 공개 설정만 다룬다.
- `apps/web` BFF의 browser OIDC는 `PUBLIC_OIDC_ISSUER`를 `openid-client`로 discovery해 confidential client configuration/JWKS cache를 재사용한다. API의 native GraphQL session exchange mutation은 별도의 public native client ID와 `None()` client authentication으로 discovery하며 secret을 읽지 않는다. 두 경로 모두 `enableNonRepudiationChecks`로 ID token signature와 claims를 검증하고, insecure issuer는 local loopback E2E에서만 허용한다. Native code exchange는 API GraphQL만 소유한다.

## Codex worktree setup

- `.codex/environments/environment.toml`의 setup script는 `mise trust`와 `pnpm install` 전에 원격 `refs/heads/main`을 `refs/remotes/origin/main`으로 fetch하고, 해당 ref의 commit OID를 확정한 뒤 로컬 `main` worktree 또는 `main` ref를 fast-forward로 최신화한다.
- 새 Codex worktree의 현재 HEAD가 fetch된 `origin/main` commit의 조상인 경우에는 현재 worktree도 해당 commit까지 fast-forward하거나 detached HEAD를 해당 commit으로 옮긴다.
- 로컬 `main`이 `origin/main`으로 fast-forward될 수 없는 상태라면 setup에서 자동 갱신을 거부하고 실패시킨다.

## Dev database migrations

- dev 배포는 `Deploy Dev`가 `kosmo-dev` 애플리케이션을 full sync하고, dev 전용 Argo CD `PreSync` Job이 같은 `latest` 런타임 이미지의 `migrate` entrypoint를 실행한 뒤 기존 API/web Rollout을 restart한다. sync나 migration이 실패하면 restart하지 않는다.
- migration runner는 Drizzle history와 PostgreSQL advisory lock을 사용한다. `Deploy Dev` 실행도 취소하지 않고 직렬화하므로 동일 DB에 migration을 동시에 적용하지 않는다.
- dev migration은 기존 dev DB와 credential을 그대로 사용하고 데이터를 reset하지 않는다. dev downtime은 허용한다.
- 로컬에서는 `pnpm --filter @kosmo/core db:migrate`로 같은 runner를 실행한다. 런타임 이미지에는 `drizzle/` migration 파일이 포함된다.
- production의 immutable image, expand/contract, backup/rollback/approval gate와 배포 smoke는 PROD-269 후속 범위이며 dev 계약을 그대로 production에 적용하지 않는다.
