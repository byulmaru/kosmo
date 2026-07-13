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

- BFF의 web confidential-client login, cookie, GraphQL proxy 또는 기존 native endpoint를 제거하지 않는다.
- raw ID token/access token을 Kosmo session으로 교환하지 않는다.
- in-process rate limit, session lifecycle 전면 개편, 기존 upstream token cleanup, native distribution automation을 추가하지 않는다.

## Implementation Approach

### API public-client exchange

- `apps/api` GraphQL schema에 unauthenticated `exchangeNativeOidcSession(input)` mutation을 추가한다. input은 authorization code, PKCE verifier, redirect URI만 가지며 payload는 Kosmo session token만 반환한다. 앱은 공개 API origin의 `/graphql`에서 이 mutation을 호출한다.
- GraphQL endpoint 전체에 이 mutation만을 위한 16 KiB body limit을 추가하지 않는다. 대신 code는 최대 2048자, PKCE verifier는 허용 형식, redirect URI는 `kosmo://login/callback` exact match로 resolver input을 엄격히 제한하고, 응답에는 `Cache-Control: no-store`와 `Pragma: no-cache`를 설정한다.
- API는 `openid-client`의 public-client configuration을 `PUBLIC_OIDC_ISSUER`와 `PUBLIC_OIDC_NATIVE_CLIENT_ID`로 discovery하고 cache한다. client authentication은 `None()`이며 client secret을 읽지 않는다. `authorizationCodeGrant`에 callback URL, `idTokenExpected: true`, `pkceCodeVerifier`를 제공해 JWKS signature와 issuer/audience/time validation을 library에 맡긴다.
- 예상된 OIDC/입력 실패는 token·code·verifier를 echo하지 않는 generic GraphQL error로 바꾸고, 예상 밖 오류도 request body나 upstream error를 기록하지 않는 masked error로 처리한다.
- reliable rate limit은 API process에 추가하지 않는다. gateway/WAF 또는 shared-store enforcement는 PROD-319의 release gate다.

### Shared session writer

- `@kosmo/core/db`에 verified `{ displayName, oidcSubject }`만 입력으로 받는 server-side session writer를 둔다. 이 writer는 account upsert, active profile 선택, session token 생성만 수행한다.
- BFF와 API는 각자 OIDC client configuration/code exchange를 유지하고 동일 writer를 호출한다. core package에 `openid-client` 또는 OIDC transport를 넣지 않는다.
- writer는 `oidcSessionKey`를 쓰지 않는다. nullable column과 기존 값은 migration 없이 유지하며 PROD-320의 transition/cleanup 대상이다.

### Expo direct transport

- `apps/app/app.config.ts`는 public `EXPO_PUBLIC_API_ORIGIN`과 `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`를 각각 `PUBLIC_API_ORIGIN`, `PUBLIC_OIDC_NATIVE_CLIENT_ID`에서 alias한다. source에는 user-provided client ID를 hard-code하지 않는다.
- native login은 `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`로 AuthSession PKCE S256 request를 만들고, validated API origin의 `/graphql`에 `exchangeNativeOidcSession` mutation input으로 code/verifier를 보낸다.
- Relay network는 browser와 React Native를 runtime-safe 방식으로 구분한다. browser는 current-origin BFF와 `credentials: 'include'`를 유지하고, native는 API origin에 Bearer header로 요청하며 browser cookie credential에 의존하지 않는다.
- SecureStore envelope은 API origin, native issuer, native client ID와 token을 함께 저장한다. 기존 web-origin/plain envelope과 불일치 envelope은 삭제해 재로그인한다.

### Validation

- app unit tests는 browser/native URL, credential, Bearer header와 session envelope mismatch를 검증한다.
- existing Playwright OIDC mock은 confidential web client와 public native client를 구분해 PKCE/no-secret flow를 제공한다. API GraphQL mutation에 대해 valid exchange, invalid verifier/redirect, invalid signature, code length limit, no-store/no-cookie를 검증한다.
- web login/BFF GraphQL regression과 Relay compile/typecheck/web export를 함께 실행한다. 실제 native build는 API origin과 native client ID가 build-time environment에 주입된 상태에서 실기기로 확인한다.

## Risks / Trade-offs

- [custom `kosmo://` redirect interception] → PKCE S256과 state 검증으로 code theft를 완화한다. claimed HTTPS redirect migration은 별도 product/platform 결정이다.
- [IdP가 검증 실패 전 code를 소모] → PROD-317이 해결되기 전 public-client rollout을 하지 않는다.
- [분산 환경에서 in-memory rate limit 우회] → 임시 Hono limiter를 만들지 않고 PROD-319의 gateway/WAF/shared-store enforcement를 release gate로 둔다.
- [기존 앱 rollback] → BFF native endpoint를 유지한다. 새 app만 API path를 사용하므로 이전 bundle은 기존 흐름을 계속 사용한다.
- [기존 session row의 upstream token] → 새 writer에서 즉시 중단하고, 값 정리·column contract는 PROD-320에서 구버전 writer drain 뒤 처리한다.
- [Expo public env의 build-time 주입] → 이 change는 alias와 문서를 제공한다. 배포 automation은 범위 밖이며, first native distribution은 환경값 주입을 release checklist로 검증한다.

## Migration Plan

1. PROD-317과 PROD-319를 완료해 code consumption과 edge rate limiting의 공개 출시 gate를 충족한다.
2. API public-client GraphQL mutation과 upstream-token-free shared writer를 배포한다. 이 단계는 기존 BFF native REST endpoint를 유지하므로 이전 bundle과 호환된다.
3. API origin/native client environment를 포함한 Expo bundle을 빌드·배포하고, 실제 기기에서 login과 authenticated GraphQL direct request를 확인한다.
4. 문제 발생 시 새 app bundle의 rollout을 중단하거나 이전 bundle로 되돌린다. BFF legacy endpoint가 남아 있으므로 이전 native login은 계속 동작한다.
5. adoption/rollback window 뒤 BFF native endpoint retirement와 기존 upstream token cleanup을 별도 issue로 평가한다.

## Open Questions

- 없음. native release build에서 public environment를 주입하는 운영 절차는 automation 범위 밖이므로, 첫 distribution의 release checklist에서 검증한다.
