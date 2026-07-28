## Context

이 기록은 PROD-344에서 승인된 Session canonical 계약, PROD-473 Issue Gate와 구현 자식 PROD-474/475의 범위, 그리고 current-session logout delta specs와 구현 제약을 반영한다. OpenSpec 작성 중 새로운 제품 행동이나 upstream 변경 필요 사항은 발견되지 않았다.

## Decision Records

### 현재 Session만 폐기하고 terminal 상태와 다른 Session을 보존한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/session.md`, `docs/domain/objects/account.md`; Linear: `PROD-344`, `PROD-473`, `PROD-474`
- Status: Active
- Context / Problem: 로그아웃 요청이 임의 Session을 대상으로 확장되거나 경쟁 요청이 terminal 상태를 되돌리면 current-session 계약과 다른 기기 격리가 깨진다.
- Decision Outcome: Active 또는 Suspended Account에서 인증 경계가 `Session.Self`로 식별한 현재 Active Session만 Revoked로 전이한다. 클라이언트 Session ID 입력은 허용하지 않고, Revoked/Expired terminal winner와 같은 Account의 다른 Session을 보존한다. Suspended Account의 다른 보호 행동은 계속 거부한다.
- Alternatives Considered: Session ID를 받아 원격 Session까지 폐기하는 방식은 Session 목록·원격 로그아웃이라는 제외 범위를 추가하므로 채택하지 않았다. 모든 Account Session을 폐기하는 방식은 다른 Session 격리 계약을 위반한다.
- Consequences: core와 transport test는 대상 Session, terminal 경쟁, 동일 Account의 다른 Session과 폐기 뒤 credential 거부를 함께 검증해야 한다.
- Confirmation / Follow-up: PROD-474의 core/API/BFF 검증에서 조건부 전이와 Session 격리를 증명한다.

### current-session logout action이 폐기 인증 경계와 조건부 revoke를 함께 소유한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: 이 OpenSpec의 implementation design; informed by `docs/domain/objects/session.md`, `docs/domain/objects/account.md`; Linear: `PROD-344`, `PROD-473`, `PROD-474`
- Status: Active
- Context / Problem: 일반 API context는 Active Account만 인정하지만 Suspended Account는 재활성화될 수 있어 Active Session을 남기면 사용자가 로그아웃한 credential이 나중에 재사용될 수 있다. 반대로 일반 인증 경계를 먼저 적용하면 terminal/missing credential에서는 검증된 Session identity를 만들 수 없어, 이미 인증 불가능한 확정 결과를 DB·네트워크 오류 같은 결과 불명 실패와 구분할 수 없다. 이 판정을 GraphQL과 BFF에 복제하면 두 transport의 logout 결과가 달라질 수 있다.
- Decision Outcome: transport-neutral current-session logout action이 raw Session credential 조회, 결과 분류와 조건부 revoke를 함께 소유한다. 이 action에서만 Suspended Account의 Active Session을 식별해 Revoked로 전이하고, 일반 `Account.Active` 보호 행동은 계속 거부한다. Deleted Account 또는 Revoked/Expired Session은 공유 action에서 이미 인증 불가능한 확정 결과로 분류하되 조건부 Session revoke 단계에는 진입하지 않는다.
- Alternatives Considered: GraphQL과 BFF가 각각 credential을 조회·분류한 뒤 검증된 Session identity만 core에 전달하는 방식은 terminal/missing credential에서 identity를 만들 수 없고 판정이 중복되므로 채택하지 않았다. Suspended Account credential을 폐기하지 않고 local credential만 제거하는 방식은 재활성화 뒤 재사용 위험 때문에 채택하지 않았다. 일반 login context를 Suspended까지 확장하는 방식은 다른 보호 행동의 권한을 넓히므로 채택하지 않았다.
- Consequences: GraphQL과 BFF는 transport별 credential 추출만 소유하고 같은 application action을 호출해야 한다. 이 예외는 current-session logout에만 적용하며, 기존 보호 query/mutation의 Active Account 회귀 검증이 필요하다.
- Confirmation / Follow-up: Active/Suspended/Deleted Account와 Active/Revoked/Expired Session 조합을 entry integration test로 검증한다.

### GraphQL mutation은 대상 입력 없이 완료 여부만 반환한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-474`
- Status: Active
- Context / Problem: Native client에는 current-session revoke 진입점이 필요하지만, revoked Session Node를 payload로 반환하면 Node auth scope와 충돌하고 임의 대상 input은 금지되어 있다.
- Decision Outcome: 공개 GraphQL field는 `revokeCurrentSession`으로 하고 Session ID input을 정의하지 않는다. `RevokeCurrentSessionPayload`는 확정된 logout 결과를 나타내는 non-null `completed` Boolean만 반환하며, 폐기와 이미 인증 불가능한 결과는 `true`, 결과 불명 실패는 GraphQL error로 표현한다.
- Alternatives Considered: revoked Session Node 또는 Session ID를 반환하는 방식은 client cache에 필요하지 않고 폐기된 Node 조회 권한과 충돌한다. `REVOKED | ALREADY_UNAUTHENTICATED` enum은 caller가 구분할 필요가 없는 내부 상태를 공개하므로 채택하지 않았다. payload 없는 scalar mutation은 repository의 mutation payload 규칙과 어긋나므로 채택하지 않았다.
- Consequences: schema와 Relay artifact가 additive하게 바뀌며, client는 success payload와 GraphQL/network failure만 구분한다.
- Confirmation / Follow-up: schema snapshot, API integration test와 Relay compile로 input 부재와 payload shape를 확인한다.

### Web logout은 전용 same-origin POST route로 처리한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-474`
- Status: Active
- Context / Problem: HttpOnly cookie는 browser code가 제거할 수 없고, 범용 `/graphql` streaming proxy가 특정 mutation 결과를 해석하면 proxy와 logout 정책이 결합된다. cookie credential을 사용하는 state-changing endpoint에는 CSRF 경계도 필요하다.
- Decision Outcome: Web BFF에 `POST /logout`을 추가하고 Origin이 구성된 public origin과 정확히 일치할 때만 처리한다. 확정 결과는 cache 불가 `204 No Content`와 동일 scope의 expired `kosmo_session` cookie로 반환한다. Origin 누락/불일치는 forbidden, 다른 method는 `Allow: POST`의 405, 결과 불명 실패는 cookie를 유지하는 non-2xx로 처리한다.
- Alternatives Considered: `/graphql` proxy에서 mutation response를 해석하는 방식은 범용 proxy를 결합시키므로 채택하지 않았다. GET logout은 state-changing cookie action과 CSRF 위험 때문에 채택하지 않았다. browser code가 cookie를 지우는 방식은 HttpOnly 계약상 불가능하다.
- Consequences: login/logout cookie 옵션을 일치시켜야 하고 reverse proxy 환경의 public origin 및 local HTTP를 검증해야 한다.
- Confirmation / Follow-up: BFF test에서 POST, Origin, 204, no-store, cookie scope, 403/405와 failure cookie 보존을 확인한다.

### 서버 결과 확정 뒤 credential과 Relay Environment를 정리한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-475`
- Status: Active
- Context / Problem: local credential이나 일부 Relay record를 먼저 제거하면 결과 불명 실패를 재시도할 수 없고 이전 viewer cache가 guest 또는 다음 Session에 노출될 수 있다.
- Decision Outcome: Web BFF 또는 Native mutation이 폐기/이미 인증 불가능함을 확정한 뒤에만 runtime credential을 정리한다. Native는 기존 SecureStore 경계를 사용하고 Web은 BFF response에 의존한다. 모든 runtime은 viewer 종속 Relay Environment/Store를 새 guest 환경으로 교체한 뒤 `/`로 replace 이동한다.
- Alternatives Considered: server 요청 전 local-only logout은 결과 확정 계약을 위반한다. 기존 Relay Store에서 알려진 record만 삭제하는 방식은 누락 record와 in-flight response를 격리하지 못하므로 채택하지 않았다.
- Consequences: logout action은 server call, credential cleanup, Environment reset과 navigation의 순서를 소유해야 한다. 실패 시 현재 token, Environment와 route를 유지한다.
- Confirmation / Follow-up: PROD-475의 Web/Native test에서 성공 순서, failure retention, 다른 Session 로그인 뒤 cache 격리와 replace navigation을 확인한다.

### 기존 logout control은 별도 확인 dialog 없이 직접 실행한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: Linear: `PROD-473`, `PROD-475`
- Status: Active
- Context / Problem: full/compact/drawer에 이미 logout control이 존재하며, 이번 변경은 메뉴 구조를 바꾸지 않고 실제 action·진행·실패 의미를 연결해야 한다.
- Decision Outcome: 기존 control을 활성화하면 추가 confirmation step 없이 공용 logout action을 실행한다. 진행 중에는 모든 surface의 중복 실행을 막고 busy/disabled 상태를 보조 기술에 전달한다. 결과 불명 실패에서는 generic 안내와 같은 control의 재시도를 제공한다.
- Alternatives Considered: confirmation dialog는 실수 방지를 돕지만, 재로그인이 가능한 current-session action에 추가 modal 상태와 접근성 경계를 만들고 현재 승인 범위에서 요구되지 않아 기본 경로로 채택하지 않았다. 각 surface가 독립 pending 상태를 가지는 방식은 중복 요청을 허용하므로 채택하지 않았다.
- Consequences: 공용 action 상태가 shell surface들보다 상위에서 공유되어야 하고, 오류 원문이나 credential material을 UI에 노출하지 않아야 한다.
- Confirmation / Follow-up: full/compact/drawer interaction 및 pending/error accessibility test로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 이 change의 초기 design에서 GraphQL과 BFF가 각각 raw credential을 조회·분류한 뒤 검증된 Session identity만 core에 전달하도록 한 transport/core 분리 결정은 위의 transport-neutral current-session logout action 소유 결정으로 대체했다. terminal/missing credential에서는 identity를 만들 수 없고, 결과 분류가 transport마다 중복되어 동작이 달라질 수 있기 때문이다.
