## Context

이 decision log는 `PROD-970`의 Kosmo-only Account 탈퇴 계약과 갱신된 도메인 문서·Settings 디자인을
구현 세션에서 추적한 비권위적 historical session record다. 지속되는 계약의 권위는 갱신된 canonical 문서와
`PROD-970`에 있으며, 이 OpenSpec의 decision·spec·task는 제품 요구사항이나 완료 게이트를 새로 만들지 않는다.

## Decision Records

### Kosmo Account만 terminal Deleted로 전환한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Durable authority references: `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/design/settings.md`, `PROD-970`
- Status: Active
- Context / Problem: Byulmaru ID, Kosmo Account, Profile은 서로 다른 lifecycle을 소유하므로 Profile·Membership을 부수적으로 정리하면 안 된다.
- Decision Outcome: Account를 Deleted로 전환하는 탈퇴는 자기 Account가 Active이고 연결 Profile이 없거나 모두 storage `DISABLED`(domain `Deactivated`)일 때만 허용한다. 클라이언트는 이미 조회한 `me.profiles`로 사전 표시할 수 있지만 별도 eligibility API는 제공하지 않으며, 서버 mutation이 연결 Profile State를 원자적으로 재확인한다. 성공 시 기존 storage `AccountState.DISABLED`를 canonical Account State `Deleted`로 사용하고, 연결 Profile·Membership·Account 속성을 보존한다. Deleted Account는 공개 인증과 `deleteAccount` mutation을 허용하지 않는다. 이미 인증·승인된 Workflow 실행이 DB commit 후 결과 acknowledgement를 잃고 재시도되는 내부 경로에 한해서는 transaction Activity가 storage `DISABLED`를 멱등 성공으로 처리해 명세된 인증·기기 정리를 다시 적용할 수 있으며, Account를 Active로 되돌리지 않는다. 완료된 `BLOCKED` 실행은 Account가 Active인 동안 `ALLOW_DUPLICATE` 정책으로 새 실행을 시작해 현재 Profile 조건을 다시 판정하며, 이 정책은 Deleted Account의 공개 재탈퇴를 허용하지 않는다. eligibility 확인이나 Account 탈퇴는 Profile·Membership을 삭제·비활성화·연결 해제하지 않는다.
- Alternatives Considered: Active Profile 허용, Profile·Membership 삭제, 새 `DELETED` enum은 각각 계약·소유권·no-migration 원칙을 위반한다.
- Consequences: 탈퇴 전 Profile lifecycle 완료가 필요하고 Account는 비가역 terminal 상태가 되며 새 enum·migration은 없다.
- Confirmation / Follow-up: Profile 0개·전부 `DISABLED` 허용과 Active Profile 거부에서 DB row·Membership·Account 상태를 검증한다.

### 탈퇴 확정에는 정해진 관계 집합의 정리를 포함한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Durable authority references: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`, `PROD-970`
- Status: Active
- Context / Problem: current-session logout은 요청한 Session만 폐기하므로 Account 탈퇴의 전체 정리 결과를 보장하지 못한다.
- Decision Outcome: account-deletion Workflow의 transaction Activity가 Account storage `DISABLED` 전환과 같은 하나의 동기 DB transaction에서 모든 Active Session(현재 Session 포함)을 `REVOKED`로 전환한다. `ApplicationAuthorization.revokedAt`을 기록하고 `OAuthTokens`를 `REVOKED`와 `revokedAt`으로 전환하며, `OAuthAuthorizationCodes`와 `PushInstallation`은 물리적으로 삭제한다. GraphQL `deleteAccount` mutation resolver는 Workflow의 boolean 결과를 기다려 `completed`로 반환한다. 이번 탈퇴 정리 대상은 이 명시된 관계 집합으로 한정하며, 별도 Core account-deletion service는 추가하지 않는다.
- Alternatives Considered: 현재 Session만 revoke하거나 Profile/Membership cascade에 맡기는 방식은 전체 정리와 보존을 보장하지 못한다.
- Consequences: 일반 로그아웃과 Account 탈퇴는 별도 action·성공 의미를 가지며, 결과 불명 시 성공을 반환하지 않는다.
- Confirmation / Follow-up: 둘 이상의 Session과 authorization/token/code/push fixture로 상태·물리 삭제·Profile/Membership 보존 및 부분 성공 방지를 검증한다.

### Account 탈퇴는 향후 외부 효과를 수용할 Temporal Workflow 경계를 사용한다

- Decision Date: 2026-09-17
- Decision Class: Implementation Choice
- Durable authority references: `docs/domain/objects/account.md`, `PROD-970`
- Status: Active
- Context / Problem: 현재 탈퇴는 하나의 DB transaction으로 끝나지만, 향후 외부 효과가 추가될 수 있으므로 GraphQL resolver에 직접 실행을 결합하면 실행 경계를 바꾸기 어렵다.
- Decision Outcome: GraphQL `deleteAccount` mutation은 검증된 Account ID를 stable input으로 `accountDeletionWorkflow`에 전달하고 `runWorkflow`의 `execute` 결과를 동기적으로 기다린다. Workflow ID는 Account ID를 포함하고, 실행 중인 동일 탈퇴는 `USE_EXISTING`으로 기다리며, 완료된 `BLOCKED` 실행의 재시도는 Account가 Active인 동안 `ALLOW_DUPLICATE` 정책으로 새 실행을 시작한다. 이 정책은 Deleted Account의 공개 재탈퇴를 허용하지 않는다. 현재 Workflow는 transaction Activity 하나만 실행하며 외부 효과나 speculative side effect를 추가하지 않는다. Account eligibility·상태 전이·관계 정리는 이 Activity의 하나의 DB transaction이 소유하고, 이미 인증·승인된 Workflow 실행이 DB commit 후 결과 acknowledgement를 잃고 재시도되는 내부 경로에서만 storage `DISABLED`를 멱등 성공으로 처리해 정리를 다시 적용하고 `true`를 반환할 수 있으며 Account를 Active로 되돌리지 않는다.
- Alternatives Considered: resolver 직접 transaction은 향후 외부 효과의 durable 실행 경계를 제공하지 못하고, 별도 Core service는 현재 공유 caller가 없어 추가 경계만 만든다. `start`만 호출하는 비동기 mutation은 현재 동기 `completed` 계약과 결과 불명 오류 경계를 바꾼다.
- Consequences: 현재 GraphQL payload와 성공·차단 의미는 유지하면서 향후 Workflow에 외부 효과 Activity를 추가할 수 있다. Workflow 실행이 실패하거나 결과가 불명확하면 mutation 성공으로 추측하지 않는다.
- Confirmation / Follow-up: API integration에서 인증된 Account ID 전달과 Workflow true/false 결과 대기를 검증하고, Worker integration에서 transaction Activity의 eligibility·cleanup·atomicity를 검증한다.

### Settings 탈퇴는 항상 노출되는 in-app 확인 lifecycle을 사용한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Durable authority references: `docs/design/settings.md`, `docs/design/profile-lifecycle.md`, `docs/domain/objects/account.md`, `docs/domain/objects/profile.md`, `PROD-970`
- Status: Active
- Context / Problem: iOS 심사와 Web·Native 공통 경험에는 Settings 접근성이 필요하지만 Profile action·외부 Byulmaru ID 설정과 섞으면 소유 경계가 흐려진다.
- Decision Outcome: Settings root/master 마지막에 `코스모 탈퇴`를 항상 표시하고 `/settings/account-deletion` detail을 연다. 클라이언트는 이미 조회한 `me.profiles`로 조건 미충족 시 Active Profile 개수와 이유를 사전 표시하되, 서버 mutation의 원자적 재확인을 전제로 한다. 조건 충족 시 irreversibility 안내와 acknowledgement checkbox를 제공하고, checkbox 전 확정 action을 비활성화한다. 재인증·유예기간·이유 입력·이유 설문은 요구하지 않는다. pending 중 중복·dismiss·navigation을 막고, 결과 불명 error에서는 확인 내용과 checkbox를 유지해 재시도하며, server 확정 뒤에만 success와 login 이동을 표시한다.
- Alternatives Considered: 조건부 행, Profile 관리 action, 이메일·외부 Settings 위임은 항상 노출·소유 경계·in-app-only 계약과 다르다.
- Consequences: 세 플랫폼은 기존 Settings shell·header·back·confirmation 문법을 공유하고 Profile/Membership mutation을 호출하지 않는다. public route는 안내 문서다.
- Confirmation / Follow-up: Web·Android·iOS에서 root row, blocker, checkbox, pending, error/retry, success/login, 접근성과 public route를 검증한다.

### Deleted Account의 동일 OIDC subject 재가입은 임시 차단한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Durable authority references: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`, `PROD-970`
- Status: Active
- Context / Problem: 탈퇴 후에도 Kosmo Account의 OIDC subject·표시 이름을 보존하므로 기존 login upsert가 새 Session을 발급하지 않아야 한다.
- Decision Outcome: Deleted Account에 연결된 동일 Byulmaru ID OIDC subject의 Kosmo login을 후속 정책이 정해질 때까지 차단하고, 새 Account·Session을 만들지 않는다. 이 차단은 임시 조치로 명시하며, Byulmaru ID provider 자체의 상태는 변경하지 않는다. Native 전용 login 오류 타입이나 문구는 계약에 포함하지 않는다.
- Alternatives Considered: 즉시 재가입 허용이나 OIDC provider Account 삭제·영구 정책 고정은 현재 계약과 Byulmaru ID 소유권을 벗어난다.
- Consequences: login 경계는 Deleted Account를 인증 불가로 취급하며, 후속 정책 승인 시 별도 변경한다.
- Confirmation / Follow-up: 공통 Session 생성 경계에서 동일 subject가 새 Account·Session을 만들지 못하는지 확인한다.

## Remaining Decisions

없음.

## Superseded Decisions

없음.
