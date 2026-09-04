## 1. PROD-891 Client 공개 설정 선택

**Authority / Provenance**

- [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

**Deliverable**

Web·Android·iOS client가 공용값과 `dev`/`prod`별 값으로 완성된 공개 설정을 선택한다.

**Guardrails**

- Web은 same-origin BFF를 유지한다.
- Native session은 선택된 API origin, OIDC issuer와 Native client ID에 계속 결합한다.
- credential과 release metadata를 공개 설정에 포함하지 않는다.

**Verification**

- 두 채널의 완전성, 공용값, dev PostHog no-op, invalid Web channel과 Native development/release 선택을 단위 검증한다.
- Relay compile, TypeScript와 app unit test를 통과시킨다.

- [x] 1.1 공용값과 `dev`/`prod`별 값으로 완성되는 공개 client 설정을 구현한다.
- [x] 1.2 origin, Native OIDC/session, browser Sentry/PostHog 소비를 선택된 설정으로 전환한다.
- [x] 1.3 공개 설정 선택의 최소 단위 검증을 추가하고 기존 환경변수 기반 검증을 정리한다.

## 2. PROD-891 Web channel 전달

**Authority / Provenance**

- [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

**Deliverable**

Web BFF가 현재 배포의 유효한 channel 하나를 Expo bundle보다 먼저 전달하며, 성공 응답은 5분 public cache를 사용하고 invalid/missing 환경 응답은 cache하지 않는다.

**Guardrails**

- channel 누락과 `dev`/`prod` 외 값은 fail closed한다.
- fingerprinted 또는 precompressed static asset을 요청마다 치환하지 않는다.

**Verification**

- dev/prod/invalid channel 응답, content type과 성공 5분 public cache·오류 `no-store` 정책을 Web server test에서 확인한다.
- Expo Web export와 Web test를 통과시킨다.

- [x] 2.1 배포 환경에서 Web BFF에 channel을 명시적으로 전달한다.
- [x] 2.2 BFF가 검증된 same-origin channel script를 성공 시 5분 cache하고 오류 시 `no-store`로 제공하며 public HTML이 이를 먼저 로드하게 한다.
- [x] 2.3 Web server test로 유효·잘못된 channel 경계를 검증한다.

## 3. PROD-891 기존 공개 설정 전달 제거와 문서 정렬

**Authority / Provenance**

- [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

**Deliverable**

client build와 runtime이 Expo 공개 설정 전용 GitHub/Vault/VSO 전달 경로를 더 이상 필요로 하지 않고 운영 문서가 새 경계를 설명한다.

**Guardrails**

- server credential, signing material과 release/build metadata의 기존 보안 경계를 유지한다.
- 실제 Web·Native 배포 증거 없이 production 적용 완료를 주장하지 않는다.

**Verification**

- workflow 정적 검증, Helm dev/prod render, 문서 format과 repository CI를 통과시킨다.
- 최종 diff에서 client 공개 설정을 읽는 `EXPO_PUBLIC_*` 경로와 전용 `expo-public` Vault/VSO 참조가 제거됐는지 확인한다.

- [x] 3.1 Web·Android·iOS workflow와 Docker build에서 공개 설정값 주입을 제거하고 release metadata만 유지한다.
- [x] 3.2 전용 `expo-public` VaultStaticSecret과 runtime `envFrom` 참조를 제거한다.
- [x] 3.3 app/운영 문서를 channel 설정, server secret과 실제 배포 gate에 맞게 갱신한다.
- [x] 3.4 관련 정적 검증과 전체 CI를 통과시키고 Draft PR 상태를 갱신한다.
- [x] 3.5 Kubernetes PR #96을 Apply하지 않고 닫아 불필요한 ACL 변경을 폐기한다.

## 4. PROD-891 shared confidential OIDC application migration

**Authority / Provenance**

- [PROD-891](https://linear.app/byulmaru/issue/PROD-891/webnative-공개-설정을-배포-채널로-선택한다)

**Deliverable**

Web과 Native가 하나의 Kosmo confidential OIDC application을 사용하고, Native는 PKCE authorize/callback만 수행하며 API가 server-held secret으로 code를 교환한다.

**Guardrails**

- Web redirect URI는 현재 origin의 `/login/callback`, Native redirect URI는 `kosmo://login/callback`으로 유지한다.
- Native bundle과 Native request에는 client secret을 포함하지 않는다.
- Native 전용 OIDC application은 migration/rollback 검증 전까지 병행 유지하며 이 change에서 삭제하지 않는다.

**Verification**

- Web browser login/callback과 Native authorize/callback/API exchange가 같은 client ID와 server-held secret을 사용하는지 확인한다.
- shared client audience, PKCE, exact redirect URI, SecureStore session binding과 secret 비노출을 Web/API/native 테스트 및 실제 배포 gate에서 검증한다.

- [x] 4.1 Web BFF와 API의 OIDC server-side configuration을 shared confidential application client ID/secret으로 정렬하고 Native bundle에서 secret이 제외되는지 검증한다.
- [x] 4.2 Native AuthSession을 shared client ID와 PKCE authorize/callback으로 정렬하고 exact `kosmo://login/callback`을 유지한다.
- [x] 4.3 API `exchangeNativeOidcSession`을 shared client ID와 server-held client secret을 사용하는 code exchange로 정렬하고 audience·signature·claims 검증을 유지한다.
- [ ] 4.4 Web·Native 로그인, rollback 경계, SecureStore binding과 이전 Native 전용 application 병행 유지 조건을 실제 배포 gate에서 검증한다.
