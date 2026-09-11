# Script Memory: Validation

## Script And Tooling Review

- 실행 스크립트는 명령이 성공하는지만 보지 말고 사용자가 기대하는 visible workflow까지 확인한다.
- iOS/Android 실행 스크립트는 실제 기기/시뮬레이터 선택 목록, 앱 창 foreground, install/launch 결과처럼 사용자가 보는 동작을 검증한다.
- tool output JSON field나 runtime API를 근거로 필터를 바꿀 때는 현재 target tool 버전의 실제 출력에 해당 field가 있는지 확인한다.
- Node/Web/OS별 API 지원 여부를 확인하지 않고 polyfill이나 대체 구현으로 바꾸지 않는다.
- CI runner를 바꾸는 PR은 실제 target runner에서 workflow가 실행되는지 확인한다.
- security scanner나 CI step에 `continue-on-error`를 쓰는 경우, 후속 step에서 실패 여부를 명시적으로 판정해 workflow가 조용히 성공하지 않게 한다.
- dependency, tooling, CI 명령이 바뀌면 변경 이유와 platform 제약을 리뷰에서 확인한다.

## Expo, Relay, Web BFF

- `apps/api`의 `lint:schema`는 runtime GraphQL schema를 사전식으로 정렬한 결과와 committed
  `schema.graphql`이 완전히 같은지 검사한다. `apps/api`의 aggregate `test`가 이를 먼저 실행하므로 schema를
  변경하면 generated SDL도 같은 변경에서 정렬해야 CI를 통과한다.
- `apps/app`의 `prepare`, `dev`, `check`, `build`는 필요한 Relay generated artifact보다 먼저 `relay-compiler`를 실행한다. `__generated__`는 commit하지 않으므로 clean checkout과 CI에서도 compiler 선행을 생략하지 않는다.
- universal client 검증은 `pnpm --filter @kosmo/app relay`, `check`, `export:web`을 분리해 실패 경계를 확인한다. `export:web`은 이전 환경의 `EXPO_PUBLIC_*` inline 값을 Metro cache에서 재사용하지 않도록 `expo export --clear`를 사용한다. Expo web export 산출물은 `apps/app/dist`이며 UI source를 소유하지 않는 `apps/web` Hono BFF가 이를 제공한다.
- BFF 검증은 federation-first 전역 전달과 공식 미처리 callback, federation 표현의 404 보존, `/health`, browser 로그인/callback, cookie/Bearer GraphQL proxy, WebFinger/ActivityPub 응답, SPA deep-link fallback을 포함한다. Native session exchange는 API GraphQL mutation의 별도 API E2E로 검증한다. Expo export 성공만으로 server origin 계약이 검증됐다고 보지 않는다.
- native project는 Expo managed/CNG 산출물이다. package/bundle ID나 config plugin을 검증할 때는 app config와 clean `expo prebuild` 결과를 확인하고, 생성된 Gradle/Xcode source를 수동 source of truth로 편집하지 않는다.
- Android/iOS 실행 검증은 기존 원칙대로 사용자가 보는 install/launch/deep-link 결과까지 확인한다. web 전용 검증으로 native build 가능성을 대신하지 않는다.
- `EXPO_PUBLIC_*` 값은 client bundle에 공개되어도 되는 설정에만 사용한다. OIDC client secret, session token, database/federation 설정은 Hono BFF 또는 server runtime에 남긴다.
- `apps/app/app.config.ts`는 channel 공개 설정의 Web/Native 공용 OIDC issuer와 client ID를 사용하며, 공개 설정값을 별도 `EXPO_PUBLIC_*` 주입 경로로 이식하지 않는다. Web과 Native는 하나의 Kosmo confidential OIDC application client ID를 공유하고, client secret은 Expo bundle에 이식하지 않는다. Native는 PKCE authorize/callback만 수행하고 API가 server-held client secret으로 code를 교환한다. Web callback은 현재 origin의 `/login/callback`, Native callback은 `kosmo://login/callback` exact redirect URI를 유지한다.
- `apps/web` BFF의 browser OIDC는 shared Kosmo confidential application의 `PUBLIC_OIDC_ISSUER`와 client ID/secret을 `openid-client`로 discovery해 confidential client configuration/JWKS cache를 재사용한다. API의 native GraphQL session exchange mutation은 Web과 같은 shared client ID와 server-held client secret으로 authorization code와 PKCE verifier를 교환하며, secret을 Native client에서 받지 않는다. 두 경로 모두 `enableNonRepudiationChecks`로 ID token signature와 claims를 검증하고, insecure issuer는 local loopback E2E에서만 허용한다. Native code exchange는 API GraphQL만 소유한다. Native 전용 OIDC application은 shared migration과 rollback 검증 전까지 병행 유지하고, 별도 cleanup gate 전에는 제거하지 않는다.
