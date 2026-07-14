## Context

이 기록은 PROD-318·PROD-338, `session-auth`·`native-webview-client`·`universal-expo-client` delta spec과 `design.md`를 반영한다. 목표는 웹 BFF 계약을 보존하면서 Expo native OIDC와 GraphQL transport를 공개 API origin으로 옮기는 것이다.

## Decision Records

### 세션 생성 use case는 core services가 소유한다

- Decision Date: 2026-07-14
- Status: Superseded
- Context / Problem: session 생성 transaction은 API와 BFF가 공유하는 server business logic이며 OIDC discovery, code exchange 또는 인증 정책 자체를 소유하지 않는다. `core/auth`에 두면 파일명이 실제 책임보다 넓고, PR #231이 도입하는 shared business-logic 경계와도 어긋난다.
- Decision Outcome: `@kosmo/core/services`의 `createOidcSession`이 verified `{ displayName, oidcSubject }`를 받아 core `db`로 account/session transaction을 수행한다. API와 BFF는 OIDC identity 검증 뒤 service를 직접 호출한다.
- Alternatives Considered: `@kosmo/core/auth`는 인증 프로토콜을 소유하지 않아 제외했다. `@kosmo/core/db`는 application use case를 infrastructure namespace에 두므로 제외했다. 호출자가 `db`를 주입하는 방식은 현재 production database implementation이 하나뿐이고 PR #231의 service pattern과 달라 제외했다.
- Consequences: core services가 공유 server business logic의 일관된 진입점이 된다. API/BFF의 간접 재수출과 `db` 인자가 사라지며, 향후 PR #231과 합쳐질 때 services index export만 병합하면 된다.
- Confirmation / Follow-up: API/web typecheck와 OIDC E2E로 두 호출 경로가 같은 service를 사용하고 upstream token을 저장하지 않음을 확인한다.

### core session service는 선택적으로 caller transaction에 합류한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: session 생성은 독립 호출에서는 자체 transaction이 필요하지만, 다른 service use case와 하나의 원자적 작업으로 조합될 때 새 transaction을 강제하면 composition을 막는다. 이 결정은 같은 날짜의 `세션 생성 use case는 core services가 소유한다`를 대체하되 services ownership은 유지한다.
- Decision Outcome: `@kosmo/core/services`의 `createOidcSession`은 verified `{ displayName, oidcSubject }`와 optional core transaction을 받는다. transaction이 있으면 합류하고, 없으면 shared `db`로 기존처럼 transaction을 시작한다.
- Alternatives Considered: 항상 shared `db`를 쓰는 방식은 가장 단순하지만 caller transaction과 원자적으로 조합할 수 없어 제외했다. generic database implementation 주입은 production implementation이 하나인 현재 필요보다 넓으므로 도입하지 않는다.
- Consequences: transport caller는 일반 로그인에서 DB 인자를 전달하지 않는다. transaction을 이미 소유한 core service만 명시적으로 전달할 수 있으며, DB infrastructure와 application use case의 namespace 경계는 유지된다.
- Confirmation / Follow-up: core와 API/web typecheck로 optional transaction type과 기존 호출의 호환성을 확인한다.

### OIDC account identity는 단일 issuer의 subject를 사용한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: OIDC `sub`는 issuer 내부에서 고유하고 account table은 `oidcSubject` 하나를 unique identity로 사용한다. 또한 session 생성에는 display name이 필요하다.
- Decision Outcome: Kosmo는 단일 configured OIDC issuer를 불변조건으로 두며 해당 issuer는 유효한 문자열 `name` claim을 항상 제공한다. 따라서 account는 `sub`만으로 식별하고 `name`을 display name으로 사용한다.
- Alternatives Considered: `(issuer, sub)` 복합 identity와 name fallback은 다중 issuer 또는 불완전한 claim을 지원하지만 현재 제품 불변조건에 필요하지 않아 제외한다.
- Consequences: 다중 issuer 지원이나 claim 계약 변경은 account identity migration과 display-name 정책을 포함한 별도 계약이 필요하다.
- Confirmation / Follow-up: OIDC library가 configured issuer를 검증하고 E2E fixture가 `sub`와 `name`을 제공하는지 확인한다.

### API GraphQL mutation이 public-client code + PKCE를 교환한다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: native bundle에는 client secret을 안전하게 보관할 수 없고, raw ID token을 API에 재전송하면 유효 시간 동안 session minting replay 표면이 생긴다.
- Decision Outcome: unauthenticated `exchangeNativeOidcSession(input)` mutation은 authorization code, PKCE verifier, exact redirect URI만 받는다. API는 public native client로 token endpoint와 교환하고 library validation 뒤 Kosmo session을 발급한다.
- Alternatives Considered: BFF confidential-client 교환은 native가 계속 BFF에 의존하므로 제외했다. raw ID/access token 교환은 replay와 issuer/audience 검증 경계를 넓히므로 제외했다.
- Consequences: API에 `openid-client` public-client configuration과 E2E public-client mock이 필요하다. client secret은 API와 app 모두 읽지 않는다.
- Confirmation / Follow-up: valid/invalid PKCE code, invalid signature, redirect mismatch와 raw token 입력을 API E2E로 검증한다.

### 앱은 API GraphQL mutation만 사용하고 BFF native REST route를 제거한다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: 웹과 앱이 가능한 한 같은 GraphQL transport surface를 쓰면 client contract를 단순화할 수 있다. BFF의 web confidential-client code exchange를 API로 옮기면 web client secret과 cookie boundary가 불필요하게 넓어지지만, BFF native REST endpoint는 모바일 앱 배포 전에만 사용된 임시 경로라 호환성 소유자가 없다.
- Decision Outcome: native 앱은 API origin의 `/graphql`에서 `exchangeNativeOidcSession` mutation만 호출한다. mutation input은 authorization code, PKCE verifier, exact redirect URI만 가진다. BFF의 `/login/native/session` REST route와 전용 validation/test를 제거하고, 웹은 기존 confidential-client BFF code exchange와 cookie 경계를 계속 사용한다.
- Alternatives Considered: API REST `/login/native/session`은 native auth만 별도 HTTP surface로 남기므로 제외했다. 웹 code exchange를 API mutation으로 통합하는 안은 confidential client secret과 browser cookie security boundary를 넓히므로 제외했다. BFF route 유지는 배포된 consumer 없이 중복 인증 surface만 남기므로 제외했다.
- Consequences: native session exchange surface는 API GraphQL 하나다. API direct exchange는 HTTP status 대신 GraphQL error contract를 사용하며 code/verifier input limit으로 표면을 제한한다. 미배포 BFF 경로를 위한 migration이나 rollback 호환성은 제공하지 않는다.
- Confirmation / Follow-up: app unit test와 actual-device 검증에서 새 native request host가 API origin의 `/graphql`이고 mutation input이 raw OIDC token을 받지 않는지 확인한다.

### native OIDC configuration과 SecureStore는 API environment에 결속한다

- Decision Date: 2026-07-13
- Status: Accepted
- Context / Problem: web confidential client ID를 native public client에 재사용하면 credential model이 섞이고, malformed 또는 다른 native configuration의 envelope을 현재 API origin으로 보내면 bearer token이 잘못 전달될 수 있다.
- Decision Outcome: native는 `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`와 `EXPO_PUBLIC_API_ORIGIN`을 사용한다. SecureStore envelope은 API origin, native OIDC issuer, native client ID, Kosmo session token을 함께 저장하고 하나라도 다르면 삭제한다.
- Alternatives Considered: 기존 `EXPO_PUBLIC_OIDC_CLIENT_ID`/web origin 재사용은 confidential/public client 경계를 깨므로 제외했다. API origin만 저장하는 안은 identity configuration 변경 시 재로그인을 강제하지 못해 제외했다.
- Consequences: malformed 또는 origin/issuer/client mismatch storage는 삭제된다. `EXPO_PUBLIC_*` 값은 native build 전에 주입돼야 한다.
- Confirmation / Follow-up: app codec/network tests에서 malformed와 origin/issuer/client mismatch 삭제를 검증한다.

### 검증된 identity의 session writer는 core auth에 공유하고 upstream token은 저장하지 않는다

- Decision Date: 2026-07-13
- Status: Superseded
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
- Confirmation / Follow-up: release 전 edge enforcement의 multi-replica behavior와 web login non-regression을 별도 후속 PROD-319에서 검증한다.

## Remaining Decisions

- PROD-287은 `EXPO_PUBLIC_API_ORIGIN`, `EXPO_PUBLIC_OIDC_ISSUER`, `EXPO_PUBLIC_OIDC_NATIVE_CLIENT_ID`가 build-time에 주입된 실제 Android/iPhone login과 GraphQL smoke를 소유한다.
- PROD-342는 custom scheme을 claimed HTTPS redirect로 이전하는 후속 계약을 소유한다.
- PROD-343은 이메일 조회 등 OIDC API 호출이 실제 요구사항이 될 때 필요한 upstream token scope, refresh와 revoke 정책, 암호화 저장 위치를 결정한다. 현재 session writer는 upstream token을 저장하지 않는다.
- PROD-344는 Kosmo bearer session의 만료·로그아웃·원격 폐기 정책을 소유한다.

## Superseded Decisions

- 2026-07-13 `검증된 identity의 session writer는 core auth에 공유하고 upstream token은 저장하지 않는다`의 배치 결정은 2026-07-14 `세션 생성 use case는 core services가 소유한다`가 대체한다. upstream token 비보관 결정은 유지한다.
- 2026-07-14 `세션 생성 use case는 core services가 소유한다`는 같은 날짜의 `core session service는 선택적으로 caller transaction에 합류한다`가 대체한다. core services ownership은 유지하고 transaction composition 결정만 변경한다.
