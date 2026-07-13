## Context

이 기록은 PROD-318, `session-auth`·`native-webview-client`·`universal-expo-client` delta spec과 `design.md`를 반영한다. 목표는 웹 BFF 계약을 보존하면서 Expo native OIDC와 GraphQL transport를 공개 API origin으로 옮기는 것이다.

## Decision Records

### API GraphQL mutation이 public-client code + PKCE를 교환한다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: native bundle에는 client secret을 안전하게 보관할 수 없고, raw ID token을 API에 재전송하면 유효 시간 동안 session minting replay 표면이 생긴다.
- Decision Outcome: unauthenticated `exchangeNativeOidcSession(input)` mutation은 authorization code, PKCE verifier, exact redirect URI만 받는다. API는 public native client로 token endpoint와 교환하고 library validation 뒤 Kosmo session을 발급한다.
- Alternatives Considered: BFF confidential-client 교환은 native가 계속 BFF에 의존하므로 제외했다. raw ID/access token 교환은 replay와 issuer/audience 검증 경계를 넓히므로 제외했다.
- Consequences: API에 `openid-client` public-client configuration과 E2E public-client mock이 필요하다. client secret은 API와 app 모두 읽지 않는다.
- Confirmation / Follow-up: valid/invalid PKCE code, invalid signature, redirect mismatch와 raw token 입력을 API E2E로 검증한다.

### 앱은 API GraphQL mutation을 사용하고 BFF legacy REST route를 남긴다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: 웹과 앱이 가능한 한 같은 GraphQL transport surface를 쓰면 client contract를 단순화할 수 있다. 다만 BFF의 web confidential-client code exchange를 API로 옮기면 web client secret과 cookie boundary가 불필요하게 넓어진다. 이미 배포된 native bundle의 BFF REST route를 즉시 끊으면 rollback도 어렵다.
- Decision Outcome: 새 native bundle은 API origin의 `/graphql`에서 `exchangeNativeOidcSession` mutation을 호출한다. mutation input은 authorization code, PKCE verifier, exact redirect URI만 가진다. BFF의 `/login/native/session` REST route는 기존 배포 bundle의 transition/rollback 호환을 위해 유지하고, 웹은 기존 confidential-client BFF code exchange와 cookie 경계를 계속 사용한다.
- Alternatives Considered: API REST `/login/native/session`은 native auth만 별도 HTTP surface로 남기므로 제외했다. 웹 code exchange를 API mutation으로 통합하는 안은 confidential client secret과 browser cookie security boundary를 넓히므로 제외했다. BFF route 즉시 삭제는 이미 배포된 native bundle의 로그인 실패를 만들 수 있어 제외했다.
- Consequences: API direct exchange는 HTTP status 대신 GraphQL error contract를 사용한다. GraphQL endpoint 전체에 mutation 전용 body limit을 추가하지 않고 code/verifier input limit으로 표면을 제한한다. BFF route retirement는 adoption/rollback window 뒤 별도 작업이다.
- Confirmation / Follow-up: app unit test와 actual-device 검증에서 새 native request host가 API origin의 `/graphql`이고 mutation input이 raw OIDC token을 받지 않는지 확인한다.

### native OIDC configuration과 SecureStore는 API environment에 결속한다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: web confidential client ID를 native public client에 재사용하면 credential model이 섞이고, 이전 web-origin envelope을 새 API origin으로 보내면 환경 전환 때 bearer token이 잘못 전달될 수 있다.
- Decision Outcome: native는 `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`와 `EXPO_PUBLIC_API_ORIGIN`을 사용한다. SecureStore envelope은 API origin, native OIDC issuer, native client ID, Kosmo session token을 함께 저장하고 하나라도 다르면 삭제한다.
- Alternatives Considered: 기존 `EXPO_PUBLIC_OIDC_CLIENT_ID`/web origin 재사용은 confidential/public client 경계를 깨므로 제외했다. API origin만 저장하는 안은 identity configuration 변경 시 재로그인을 강제하지 못해 제외했다.
- Consequences: legacy plain/web-origin storage는 one-time re-login을 유발한다. `EXPO_PUBLIC_*` 값은 native build 전에 주입돼야 한다.
- Confirmation / Follow-up: app codec/network tests에서 legacy와 origin/issuer/client mismatch 삭제를 검증한다.

### 검증된 identity의 session writer는 core auth에 공유하고 upstream token은 저장하지 않는다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: web과 API는 동일한 account upsert/session transaction이 필요하지만 OIDC transport/client configuration은 서로 다르다. 현재 writer가 미사용 upstream access token을 session row에 저장한다.
- Decision Outcome: `@kosmo/core/auth`에는 verified `{ displayName, oidcSubject }`로 session을 만드는 writer만 둔다. `@kosmo/core/db`는 DB infrastructure만 제공한다. BFF/API는 각자의 OIDC code exchange를 유지하고, shared writer는 `oidcSessionKey`를 쓰지 않는다.
- Alternatives Considered: `openid-client` 전체를 core로 옮기는 안은 Expo가 소비하는 package에 server transport dependency를 섞으므로 제외했다. API/BFF에 transaction을 복제하는 안은 security behavior drift를 만들므로 제외했다.
- Consequences: 새 session은 upstream credential을 저장하지 않는다. 기존 값 cleanup과 column contract는 PROD-320에서 구버전 writer drain 뒤 수행한다.
- Confirmation / Follow-up: DB assertion으로 새 native 및 web login session에 upstream token이 저장되지 않음을 확인한다.

### rate limit은 신뢰 가능한 edge enforcement가 출시 조건이다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: API는 blue/green replica, restart, trusted client IP 미구성 상태여서 in-memory Hono limiter가 유효한 보안 경계가 될 수 없다.
- Decision Outcome: mutation에는 strict input validation·no-store를 넣고, reliable rate limit은 gateway/WAF 또는 shared-store로 PROD-319에서 제공한다. PROD-319 완료 전에는 public native client rollout을 하지 않는다.
- Alternatives Considered: process-local per-IP limiter는 replica/rollout/proxy에서 우회되므로 제외했다.
- Consequences: 이 change의 code validation과 public rollout은 분리된다. PROD-319은 enforcement owner, threshold, trusted identifier, 429 behavior를 소유한다.
- Confirmation / Follow-up: release 전 edge enforcement의 multi-replica behavior와 web login non-regression을 PROD-319에서 검증한다.

## Remaining Decisions

- native distribution pipeline의 public environment injection 자동화는 현재 범위 밖이다. 첫 native distribution은 `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_OIDC_ISSUER`, `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`가 build-time에 주입됐음을 release checklist로 확인한다.
- BFF legacy native endpoint의 제거 기준은 app adoption과 rollback window를 확인한 뒤 별도 issue에서 정한다.

## Superseded Decisions

- 없음.
