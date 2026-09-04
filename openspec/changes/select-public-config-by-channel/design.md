## Context

현재 branch는 production Web·Android·iOS build와 API/Web runtime이 전용 Vault path에서 `EXPO_PUBLIC_*`를 읽도록 변경했지만 아직 Draft이며 운영 Apply는 되지 않았다. Web client는 same-origin BFF를 사용하고 Native client는 API origin과 OIDC client ID를 직접 필요로 한다. Web과 Native는 하나의 Kosmo confidential OIDC application을 사용하며, Native는 PKCE authorize/callback만 수행하고 API가 server-held client secret으로 code를 교환한다. OIDC issuer, shared client ID와 browser Sentry DSN은 공용이고 API/Web origin은 `dev`와 `prod`가 다르다. PostHog는 기존 제품 분석 계약대로 `prod`에서만 활성화한다.

## Goals / Non-Goals

**Goals:**

- 공개 설정의 source를 하나의 타입 검사 코드 표로 줄인다.
- Web에는 BFF가 채널만 전달하고 Native에는 build mode가 채널을 결정하게 한다.
- Web·Native 인증을 하나의 confidential OIDC application으로 정렬하고 Native bundle에서 secret을 제외한다.
- 잘못된 Web 채널은 다른 환경으로 fallback하지 않게 한다.
- 기존 client 공개 설정 Vault/GitHub 전달 코드를 삭제한다.

**Non-Goals:**

- preview/OTA/EAS 채널, generic runtime config API 또는 설정 framework 도입
- 서버 credential이나 build/release metadata를 공개 설정표로 이동
- API/Web BFF 서버의 기존 일반 runtime Secret 구조 변경
- Native 전용 OIDC application의 즉시 삭제. 이 change에서는 migration 동안 병행 유지하고, 별도 cleanup gate에서만 제거한다.

## Implementation Guidance

### Current Constraints

- Expo Web export는 `apps/app/public/index.html`을 entry HTML로 사용하고 BFF static route는 precompressed asset과 ETag를 보존한다.
- Web Sentry는 module import 시 초기화되므로 channel은 Expo bundle보다 먼저 존재해야 한다.
- Native SecureStore session envelope은 API origin, OIDC issuer와 Native client ID에 묶여 있다.
- Native OIDC code exchange는 Web과 같은 client ID를 사용하지만 client secret은 API server-side configuration에만 존재한다. Web callback과 Native callback의 exact redirect URI는 각각 유지한다.
- E2E는 loopback 동적 origin을 사용하므로 production 설정표 자체를 테스트 설정 registry로 확장하지 않아야 한다.

### Recommended Approach

- 한 client config module에 공용값과 완성된 `dev`/`prod` 객체를 선언하고 `satisfies Record<Channel, PublicConfig>`로 두 설정의 완전성을 검사한다. 깊은 병합은 사용하지 않는다.
- Web rollout의 기존 `ENVIRONMENT`를 BFF가 `/channel.js`에서 `dev`/`prod` allowlist로 검증한 뒤 `globalThis`에 기록하는 one-line script를 응답한다. 유효한 응답은 `Cache-Control: public, max-age=300`으로 5분 캐시하고, invalid/missing `ENVIRONMENT` 응답은 500과 `Cache-Control: no-store`로 처리한다.
- public HTML이 `/channel.js`를 Expo bundle보다 먼저 동기적으로 로드한다. static HTML이나 fingerprinted/gzip asset을 요청마다 치환하지 않는다.
- client config module은 Web에서 주입된 global channel을 검증하고 Native에서 development mode면 `dev`, release면 `prod`를 선택한다.
- origin, Native OIDC, browser Sentry/PostHog 소비자는 완성된 설정을 읽는다. PostHog는 `dev`에서 no-op하고 `prod`에서만 활성화하며, Sentry release는 기존 build metadata를 유지한다.
- Web BFF와 API는 동일한 confidential OIDC application client ID와 server-held client secret을 사용한다. Native는 shared client ID, state와 PKCE material만 authorize/callback에 사용하고 secret은 전송하지 않는다. API native exchange는 `kosmo://login/callback`을 exact redirect URI로 제출한다.
- sourcemap upload는 hardcoded browser DSN을 build 입력으로 요구하지 않고 auth token, org, project와 release만 검증한다.

### Allowed Alternatives

스펙의 선행 로드와 fail-closed 동작을 보존한다면 same-origin JSON을 먼저 fetch하는 bootstrap도 가능하지만, 현재 entry 전체를 비동기화하므로 기본안으로 사용하지 않는다.

### Known Traps

- channel script 실패를 `prod` 또는 `dev`로 기본 처리하면 잘못된 API/OIDC/analytics 환경을 선택한다.
- BFF가 index HTML이나 gzip된 JS를 요청마다 치환하면 ETag와 precompressed asset 일관성이 깨진다.
- 테스트의 동적 loopback origin을 production 채널 설정에 추가하면 세 번째 runtime config 체계가 된다.
- Native code exchange에서 public-client 방식으로 client secret을 생략하거나 Native bundle에 secret을 넣으면 shared confidential application 계약을 깨뜨린다.
- provider에서 Native 전용 application을 shared application cutover 전에 제거하면 기존 release binary의 rollback 경로가 사라진다.

## Risks / Trade-offs

- [Native 공개 endpoint 변경에는 새 release binary가 필요함] → 현재 Native 설정과 SecureStore session binding을 binary 계약으로 유지하고 실제 release workflow에서 검증한다.
- [공개 관측성 키가 repository에 보임] → 해당 값은 이미 client bundle에서 공개되는 식별자만 포함하고 credential은 계속 Vault에 둔다.
- [Web BFF channel misconfiguration이 startup을 중단함] → Helm의 `dev`/`prod` 값에서 직접 설정하고 server test로 두 값과 invalid 값을 검증한다.
- [공유 confidential application 전환 중 Web과 Native의 인증 설정이 어긋날 수 있음] → 두 server path가 같은 client ID/secret을 사용하고, exact Web·Native redirect URI 및 PKCE exchange를 통합 검증한다.
- [Native 전용 application을 함께 유지하는 과도기 설정이 남을 수 있음] → migration 동안 병행 유지하되, 실제 Web·Native 로그인 성공·rollback과 이전 client 사용 중단 증거가 확보된 뒤 별도 cleanup gate에서 제거한다.

## Migration Plan

1. 현재 Draft의 전용 Vault fetch, VSO, runtime `envFrom` 변경을 제거하고 shared confidential application의 client ID/secret을 Web BFF와 API server-side configuration에 준비한다.
2. channel 설정표와 Web BFF channel script, Native shared-client PKCE 선택을 함께 배포 가능한 Kosmo PR로 검증한다. Web redirect는 현재 origin의 `/login/callback`, Native redirect는 `kosmo://login/callback`을 그대로 유지한다.
3. Kubernetes PR #96은 Apply하지 않고 닫는다.
4. Web browser login/callback과 Native authorize/callback 및 API code exchange가 같은 client ID와 server-held secret을 사용하고, Native bundle에 secret이 없으며 SecureStore session binding이 유지되는지 실제 배포 경계에서 확인한다.
5. migration 기간에는 Native 전용 OIDC application과 기존 release binary의 rollback 경로를 병행 유지한다. shared application cutover와 rollback 증거가 확보되기 전에는 제거하지 않는다.
6. Web dev/prod와 Native Release bundle을 실제 배포 경계에서 확인한 뒤 더 이상 쓰지 않는 GitHub 공개 Variables를 제거한다.

### Rollback

shared confidential application 전환이 실패하면 Web BFF/API의 이전 server-side client configuration과 Native 전용 application을 사용하도록 Kosmo 변경을 되돌린다. Native 전용 application은 이전 release binary와 rollback이 검증되고 별도 cleanup gate가 승인될 때까지 유지한다. Rollback은 client secret을 Native bundle에 넣거나 Web BFF를 Native code exchange 경로로 전환해서는 안 된다.

## Open Questions

없음.
