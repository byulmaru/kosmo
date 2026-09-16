## Context

이 decision log는 `PROD-970`의 Kosmo-only Account 탈퇴 계약과 갱신된 도메인 문서·Settings 디자인을 반영한다.
규범적 결과와 실패 경계는 `specs/account-deletion/spec.md`, Settings 변경은 `specs/settings-page-shell/spec.md`에 둔다.

## Decision Records

### Kosmo Account만 terminal Deleted로 전환한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/design/settings.md`, `PROD-970`
- Status: Active
- Context / Problem: Byulmaru ID, Kosmo Account, Profile은 서로 다른 lifecycle을 소유하므로 Profile·Membership을 부수적으로 정리하면 안 된다.
- Decision Outcome: 자기 Account가 Active이고 연결 Profile이 없거나 모두 storage `DISABLED`(domain `Deactivated`)일 때만 탈퇴를 허용한다. 클라이언트는 이미 조회한 `me.profiles`로 사전 표시할 수 있지만 별도 eligibility API는 제공하지 않으며, 서버 mutation이 연결 Profile State를 원자적으로 재확인한다. 성공 시 기존 storage `AccountState.DISABLED`를 canonical Account State `Deleted`로 사용하고, 연결 Profile·Membership·Account 속성을 보존한다. eligibility 확인이나 Account 탈퇴는 Profile·Membership을 삭제·비활성화·연결 해제하지 않는다.
- Alternatives Considered: Active Profile 허용, Profile·Membership 삭제, 새 `DELETED` enum은 각각 계약·소유권·no-migration 원칙을 위반한다.
- Consequences: 탈퇴 전 Profile lifecycle 완료가 필요하고 Account는 비가역 terminal 상태가 되며 새 enum·migration은 없다.
- Confirmation / Follow-up: Profile 0개·전부 `DISABLED` 허용과 Active Profile 거부에서 DB row·Membership·Account 상태를 검증한다.

### 탈퇴 확정에는 정해진 관계 집합의 정리를 포함한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`, `PROD-970`
- Status: Active
- Context / Problem: current-session logout은 요청한 Session만 폐기하므로 Account 탈퇴의 전체 정리 결과를 보장하지 못한다.
- Decision Outcome: Account storage `DISABLED` 전환과 같은 원자적 결과에서 모든 Active Session(현재 Session 포함)을 `REVOKED`로 전환한다. `ApplicationAuthorization.revokedAt`을 기록하고 `OAuthTokens`를 `REVOKED`와 `revokedAt`으로 전환하며, `OAuthAuthorizationCodes`와 `PushInstallation`은 물리적으로 삭제한다. 이번 탈퇴 정리 대상은 이 명시된 관계 집합으로 한정한다.
- Alternatives Considered: 현재 Session만 revoke하거나 Profile/Membership cascade에 맡기는 방식은 전체 정리와 보존을 보장하지 못한다.
- Consequences: 일반 로그아웃과 Account 탈퇴는 별도 action·성공 의미를 가지며, 결과 불명 시 성공을 반환하지 않는다.
- Confirmation / Follow-up: 둘 이상의 Session과 authorization/token/code/push fixture로 상태·물리 삭제·Profile/Membership 보존 및 부분 성공 방지를 검증한다.

### Settings 탈퇴는 항상 노출되는 in-app 확인 lifecycle을 사용한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/settings.md`, `docs/design/profile-lifecycle.md`, `docs/domain/objects/account.md`, `docs/domain/objects/profile.md`, `PROD-970`
- Status: Active
- Context / Problem: iOS 심사와 Web·Native 공통 경험에는 Settings 접근성이 필요하지만 Profile action·외부 Byulmaru ID 설정과 섞으면 소유 경계가 흐려진다.
- Decision Outcome: Settings root/master 마지막에 `코스모 탈퇴`를 항상 표시하고 `/settings/account-deletion` detail을 연다. 클라이언트는 이미 조회한 `me.profiles`로 조건 미충족 시 Active Profile 개수와 이유를 사전 표시하되, 서버 mutation의 원자적 재확인을 전제로 한다. 조건 충족 시 irreversibility 안내와 acknowledgement checkbox를 제공하고, checkbox 전 확정 action을 비활성화한다. 재인증·유예기간·이유 입력·이유 설문은 요구하지 않는다. pending 중 중복·dismiss·navigation을 막고, 결과 불명 error에서는 확인 내용과 checkbox를 유지해 재시도하며, server 확정 뒤에만 success와 login 이동을 표시한다.
- Alternatives Considered: 조건부 행, Profile 관리 action, 이메일·외부 Settings 위임은 항상 노출·소유 경계·in-app-only 계약과 다르다.
- Consequences: 세 플랫폼은 기존 Settings shell·header·back·confirmation 문법을 공유하고 Profile/Membership mutation을 호출하지 않는다. public route는 안내 문서다.
- Confirmation / Follow-up: Web·Android·iOS에서 root row, blocker, checkbox, pending, error/retry, success/login, 접근성과 public route를 검증한다.

### Deleted Account의 동일 OIDC subject 재가입은 임시 차단한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`, `PROD-970`
- Status: Active
- Context / Problem: 탈퇴 후에도 Kosmo Account의 OIDC subject·표시 이름을 보존하므로 기존 login upsert가 새 Session을 발급하지 않아야 한다.
- Decision Outcome: Deleted Account에 연결된 동일 Byulmaru ID OIDC subject의 Kosmo login을 후속 정책이 정해질 때까지 차단하고, 새 Account·Session을 만들지 않는다. 안전한 안내와 `hello@byulmaru.co` 지원 경로를 제공하되, 이 차단은 임시 조치로 명시한다. Byulmaru ID provider 자체의 상태는 변경하지 않는다.
- Alternatives Considered: 즉시 재가입 허용이나 OIDC provider Account 삭제·영구 정책 고정은 현재 계약과 Byulmaru ID 소유권을 벗어난다.
- Consequences: login 경계는 Deleted Account를 인증 불가로 취급하며, 후속 정책 승인 시 별도 변경한다.
- Confirmation / Follow-up: 동일 subject의 Web callback과 Native exchange에서 Account/Session 미생성과 안전한 안내를 확인한다.

## Remaining Decisions

없음.

## Superseded Decisions

없음.
