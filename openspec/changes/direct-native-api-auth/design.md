## Context

현재 Expo native login과 Relay network는 web origin의 BFF를 호출한다. BFF는 confidential OIDC client로 code를 교환하고, API는 이미 Kosmo session Bearer token을 받아 GraphQL context를 만들 수 있다.

새 native OIDC application은 public client `01KXCS695QV8DQM8KJJNWFQ94Z`와 `kosmo://login/callback` redirect URI를 사용한다. PKCE가 code를 이 public client에 결속하므로 앱에 client secret을 둘 필요가 없다.

API와 BFF는 모두 검증된 OIDC identity로 계정과 Kosmo session을 만드는 같은 DB transaction이 필요하다. 현재 BFF writer는 사용하지 않는 upstream access token을 `Sessions.oidcSessionKey`에 저장한다. 새 writer는 upstream token을 받거나 저장하지 않는다. 기존 값 정리는 PROD-320이 소유한다.

## Goals / Non-Goals

**Goals:**

- API origin의 unauthenticated `exchangeNativeOidcSession` GraphQL mutation이 public-client authorization code + PKCE verifier를 Kosmo session token으로 교환한다.
- 새 Android/iOS bundle은 login과 GraphQL 모두 API origin으로 직접 요청하고, web bundle은 BFF/cookie 경계를 유지한다.
- native session token은 API origin과 native OIDC issuer/client 설정이 일치할 때만 SecureStore에서 복원한다.
- OIDC code, verifier, access token, ID token을 새 session row·SecureStore·response 외 로그에 남기지 않는다.

**Non-Goals:**

- BFF의 web confidential-client login, cookie 또는 GraphQL proxy를 제거하지 않는다.
- raw ID token/access token을 Kosmo session으로 교환하지 않는다.
- in-process rate limit, session lifecycle 전면 개편, 기존 upstream token cleanup, native distribution automation을 추가하지 않는다.

## Implementation Approach

### API public-client exchange

- `apps/api` GraphQL schema에 unauthenticated `exchangeNativeOidcSession(input)` mutation을 추가한다. input은 authorization code, PKCE verifier, redirect URI만 가지며 payload는 Kosmo session token만 반환한다. 앱은 공개 API origin의 `/graphql`에서 이 mutation을 호출한다.
- GraphQL endpoint 전체에 이 mutation만을 위한 16 KiB body limit을 추가하지 않는다. 대신 code는 최대 2048자, PKCE verifier는 허용 형식, redirect URI는 `kosmo://login/callback` exact match로 resolver input을 엄격히 제한하고, 응답에는 `Cache-Control: no-store`와 `Pragma: no-cache`를 설정한다.
- API는 `openid-client`의 public-client configuration을 `PUBLIC_OIDC_ISSUER`와 `PUBLIC_OIDC_NATIVE_CLIENT_ID`로 discovery하고 cache한다. client authentication은 `None()`이며 client secret을 읽지 않는다. `authorizationCodeGrant`에 callback URL, `idTokenExpected: true`, `pkceCodeVerifier`를 제공해 JWKS signature와 issuer/audience/time validation을 library에 맡긴다.
- mutation input의 shape와 format은 GraphQL schema와 Pothos validation plugin으로 검증한다. 예상된 OIDC code exchange 실패는 upstream 오류 세부 정보와 token material을 노출하지 않는 generic GraphQL error로 바꾸고, 예상 밖 오류는 기존 production masking을 따른다. GraphQL validation/coercion 오류는 기존 표준 동작을 유지한다.
- reliable rate limit은 API process에 추가하지 않는다. gateway/WAF 또는 shared-store enforcement는 별도 후속 PROD-319가 public native rollout 전에 제공한다.

### Shared session service

- `@kosmo/core/services`에 verified `{ displayName, oidcSubject }`만 입력으로 받는 `createOidcSession` use case를 둔다. service는 `getDatabaseConnection(tx)`로 optional core transaction 또는 shared `db`를 선택하고, 해당 connection에서 transaction 경계를 열어 account upsert, active profile 선택, session token 생성을 원자적으로 수행한다. caller transaction이 있으면 savepoint로 합류하고 없으면 shared `db`에서 transaction을 시작한다. `@kosmo/core/db`는 DB client, schema, relation, DB 전용 utility만 제공한다.
- Kosmo는 단일 configured OIDC issuer를 불변조건으로 두므로 account identity는 issuer 내부에서 고유한 `sub`로 식별한다. 해당 issuer는 유효한 문자열 `name` claim을 항상 제공한다.
- BFF와 API는 각자 OIDC client configuration/code exchange를 유지하고 동일 service를 직접 호출한다. core package에 `openid-client` 또는 OIDC transport를 넣지 않는다.
- service는 `oidcSessionKey`를 쓰지 않는다. nullable column과 기존 값은 migration 없이 유지하며 PROD-320의 transition/cleanup 대상이다.

### Expo direct transport

- `apps/app/app.config.ts`는 public `EXPO_PUBLIC_API_ORIGIN`과 `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`를 각각 `PUBLIC_API_ORIGIN`, `PUBLIC_OIDC_NATIVE_CLIENT_ID`에서 alias한다. source에는 user-provided client ID를 hard-code하지 않는다.
- native login은 `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`로 AuthSession PKCE S256 request를 만들고, validated API origin의 `/graphql`에 `exchangeNativeOidcSession` mutation input으로 code/verifier를 보낸다.
- Relay network는 browser와 React Native를 runtime-safe 방식으로 구분한다. browser는 current-origin BFF와 `credentials: 'include'`를 유지하고, native는 API origin에 Bearer header로 요청하며 browser cookie credential에 의존하지 않는다.
- SecureStore envelope은 API origin, native issuer, native client ID와 token을 함께 저장한다. malformed 또는 현재 설정과 불일치하는 envelope은 삭제한다.

### Validation

- app unit tests는 browser/native URL, credential, Bearer header와 session envelope mismatch를 검증한다.
- existing Playwright OIDC mock은 confidential web client와 public native client를 구분해 PKCE/no-secret flow를 제공한다. API GraphQL mutation의 성공, signature failure, 대표 input rejection, no-store/no-cookie를 E2E로 검증한다. GraphQL schema와 Pothos validation plugin 자체 동작을 중복 검증하는 schema unit test는 추가하지 않는다.
- web login/BFF GraphQL regression과 Relay compile/typecheck/web export를 함께 실행한다. 실제 native build는 API origin과 native client ID가 build-time environment에 주입된 상태에서 실기기로 확인한다.

## Risks / Trade-offs

- [custom `kosmo://` redirect interception] → PKCE S256과 state 검증으로 code theft를 완화한다. claimed HTTPS redirect migration은 PROD-342가 소유한다.
- [IdP가 검증 실패 전 code를 소모] → PROD-317이 해결되기 전 public-client rollout을 하지 않는다.
- [분산 환경에서 in-memory rate limit 우회] → 임시 Hono limiter를 만들지 않고 PROD-319의 gateway/WAF/shared-store enforcement를 release gate로 둔다.
- [미배포 BFF native surface] → 배포된 모바일 앱이 없으므로 `/login/native/session`과 그 전용 검증·테스트를 제거하고 native exchange surface를 API GraphQL 하나로 제한한다.
- [기존 session row의 upstream token] → 새 writer에서 즉시 중단하고, 값 정리·column contract는 PROD-320에서 구버전 writer drain 뒤 처리한다.
- [향후 OIDC API 호출에 upstream token이 필요할 가능성] → 현재 사용 사례가 없으므로 session row에 token 저장을 재도입하지 않는다. 이메일 조회 등 실제 사용 사례가 확정되면 필요한 scope, refresh와 폐기, 암호화 저장 경계를 별도 계약에서 결정한다.
- [Expo public env의 build-time 주입] → 이 change는 alias와 문서를 제공한다. 배포 automation과 실제 Android/iPhone login·GraphQL smoke는 PROD-287이 소유한다.
- [Kosmo bearer session의 장기 유효성] → 이 change는 기존 session lifecycle을 재사용한다. 만료·로그아웃·원격 폐기 정책은 PROD-344가 소유한다.

## Migration Plan

1. API public-client GraphQL mutation과 upstream-token-free shared writer를 배포하고, 미배포 BFF native REST endpoint를 제거한다.
2. PROD-338의 API origin/native client environment를 포함한 Expo bundle을 준비한다.
3. public native rollout 전에 PROD-317과 PROD-319를 완료해 code consumption과 edge rate limiting gate를 충족한다.
4. PROD-287에서 public environment가 주입된 Expo bundle을 빌드·배포하고, 실제 기기에서 login과 authenticated GraphQL direct request를 확인한다.
5. 첫 native distribution 전에 문제가 발견되면 app rollout을 중단하고 API GraphQL 계약을 수정한다. 배포된 구버전 bundle이 없으므로 BFF native endpoint 복구는 rollback 경로가 아니다.
6. 기존 upstream token cleanup은 PROD-320에서 별도로 진행한다.

## Open Questions

- 현재 change 범위에는 없음. public environment와 실기기 검증은 PROD-287, claimed HTTPS redirect는 PROD-342, upstream token 사용 경계는 PROD-343, Kosmo session lifecycle은 PROD-344가 각각 소유한다.
