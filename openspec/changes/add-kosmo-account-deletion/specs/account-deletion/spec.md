## ADDED Requirements

> This delta spec is a non-authoritative historical session record. Durable behavior authority remains in the
> referenced canonical documents and `PROD-970`; the requirement keywords below restate that contract for session
> context only and do not create an independent product completion gate.

### Requirement: Kosmo Account 탈퇴 eligibility

**Durable authority references (session context):** `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/design/settings.md`, `PROD-970` — 인증된 사용자는 자기 Kosmo Account에 대해서만 탈퇴를 요청할 수 있어야 하며(MUST), Account를 Deleted로 전환하는 탈퇴는 Account State가 Active이고 연결된 Profile이 없거나 모든 연결 Profile의 storage state가 `DISABLED`(domain Profile Lifecycle State `Deactivated`)인 경우에만 허용해야 한다(MUST). Deleted(storage `DISABLED`) Account는 terminal 상태로 남아 공개 인증과 `deleteAccount` mutation을 허용해서는 안 된다(MUST NOT). 이미 인증·승인된 account-deletion Workflow 실행이 DB commit 후 결과 acknowledgement를 잃고 재시도되는 내부 경로에 한해서는 transaction Activity가 storage `DISABLED`를 멱등 성공으로 처리해 명세된 인증·기기 정리를 다시 적용할 수 있으며(MAY), Account를 Active로 되돌려서는 안 된다(MUST NOT). 완료된 `BLOCKED` 실행은 Account가 Active인 동안 `ALLOW_DUPLICATE` 정책으로 새 실행을 시작해 현재 Profile 조건을 다시 판정할 수 있으며(MAY), 이 정책은 Deleted Account의 공개 재탈퇴를 허용하지 않는다(MUST NOT). 새로운 Deleted 전환 조건을 만족하지 않으면 Account, Profile, Membership, Session, `ApplicationAuthorization`, `OAuthTokens`, `OAuthAuthorizationCodes` 또는 `PushInstallation`을 변경해서는 안 된다(MUST NOT). 탈퇴 eligibility 확인은 Profile이나 Membership을 삭제·비활성화·연결 해제해서는 안 된다(MUST NOT). 클라이언트는 이미 조회한 `me.profiles`로 활성 Profile 개수와 차단 이유를 사전 표시할 수 있지만(MAY), 이는 참고용이며 별도 eligibility API를 제공하지 않는다(MUST NOT). 실제 탈퇴 mutation은 검증된 Account ID를 account-deletion Workflow에 전달하고, Workflow의 transaction Activity가 하나의 동기 transaction에서 연결 Profile State를 다시 확인해야 한다(MUST).

#### Scenario: 연결된 Profile이 없는 Account의 탈퇴

- **WHEN** Active Account에 연결된 Profile이 없다
- **THEN** 시스템은 해당 Account의 탈퇴 eligibility를 허용한다
- **AND** 탈퇴 확인 전에 Profile 또는 Membership을 생성하거나 변경하지 않는다

#### Scenario: 모든 연결 Profile이 비활성화된 Account의 탈퇴

- **WHEN** Active Account에 연결된 모든 Profile의 storage state가 `DISABLED`이다
- **THEN** 시스템은 해당 Account의 탈퇴 eligibility를 허용한다
- **AND** 연결된 Profile과 Membership은 그대로 보존한다

#### Scenario: 활성 Profile이 남아 있는 Account의 탈퇴 거부

- **WHEN** 연결된 Profile 중 하나 이상이 `ACTIVE` 상태이다
- **THEN** 시스템은 탈퇴 eligibility를 거부한다
- **AND** Account, Profile, Membership, Session, `ApplicationAuthorization`, `OAuthTokens`, `OAuthAuthorizationCodes` 및 `PushInstallation`을 변경하지 않는다
- **AND** 호출 화면은 활성 Profile 개수와 탈퇴할 수 없는 이유를 표시할 수 있다

#### Scenario: Deleted Account의 공개 재탈퇴를 거부한다

- **WHEN** storage state가 `DISABLED`(domain Deleted)인 Account의 동일 OIDC subject가 login 또는 공개 `deleteAccount` mutation을 시도한다
- **THEN** 인증 경계는 새 Session을 발급하지 않고 공개 `deleteAccount` mutation을 승인하지 않는다
- **AND** Account를 Active로 되돌리지 않는다

#### Scenario: 승인된 실행의 commit acknowledgement 유실을 재시도한다

- **WHEN** 이미 인증·승인된 account-deletion Workflow가 DB commit 후 결과 acknowledgement를 잃고 storage state `DISABLED`인 Account에서 재시도된다
- **THEN** transaction Activity는 `DISABLED`를 멱등 성공으로 처리할 수 있다
- **AND** 명세된 인증·기기 정리를 다시 적용하고 `completed: true`를 반환한다
- **AND** Account를 Active로 되돌리지 않는다

#### Scenario: 완료된 BLOCKED 실행을 재시도한다

- **WHEN** 이전 account-deletion Workflow가 `BLOCKED`(`completed: false`)로 완료되어 Account가 Active로 남아 있고 연결 Profile이 모두 `DISABLED`가 된 뒤 탈퇴를 재시도한다
- **THEN** account-deletion Workflow는 `ALLOW_DUPLICATE` 정책으로 새 실행을 시작한다
- **AND** 새 실행은 현재 Profile State를 다시 판정해 Account를 Deleted로 전환하고 결과를 반환한다

### Requirement: 원자적 Account terminal 전환과 인증·기기 정리

**Durable authority references (session context):** `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/session.md`, `PROD-970` — eligibility가 확정된 탈퇴는 하나의 원자적 결과로 처리해야 한다(MUST). 확정된 결과는 기존 storage `AccountState.DISABLED`를 canonical Account State `Deleted`로 전환하고(MUST), Profile·Membership·Account 속성을 보존해야 한다(MUST). 같은 결과 안에서 해당 Account의 모든 Active Session(현재 요청 Session 포함)을 `REVOKED`로 전환하고(MUST), `ApplicationAuthorization.revokedAt`을 설정하며(MUST), `OAuthTokens`를 `REVOKED` 상태와 `revokedAt`으로 전환하고(MUST), `OAuthAuthorizationCodes`와 `PushInstallation`을 물리적으로 삭제해야 한다(MUST). 일반적인 한 Session 로그아웃처럼 현재 Session만 폐기하는 동작으로 축소해서는 안 된다(MUST NOT). 현재 이 결과는 account-deletion Workflow의 transaction Activity가 수행하며, Workflow는 향후 외부 효과를 추가할 수 있는 실행 경계를 유지하되 현재 transaction Activity 외의 효과를 실행하지 않아야 한다(MUST NOT). 서버 탈퇴 mutation payload는 `completed`만 포함해야 하며(MUST), Workflow의 원자적 재확인에서 조건이 충족되지 않은 `BLOCKED` 결과는 `completed: false`로 반환해야 한다(MUST).

#### Scenario: 탈퇴 결과를 성공으로 확정한다

- **WHEN** 허용된 Account 탈퇴 요청의 모든 상태 전이와 관계 정리가 성공한다
- **THEN** Account storage state는 `DISABLED`가 되고 domain state는 Deleted가 된다
- **AND** 모든 Active Session은 `REVOKED`가 되며 현재 요청 Session도 포함된다
- **AND** `ApplicationAuthorization.revokedAt`과 `OAuthTokens.revokedAt`이 기록되고 OAuthTokens state는 `REVOKED`가 된다
- **AND** `OAuthAuthorizationCodes`와 `PushInstallation`은 물리적으로 존재하지 않는다
- **AND** 연결된 Profile·Membership과 Account 속성은 보존된다

#### Scenario: 일부 정리 실패에서 부분 탈퇴를 노출하지 않는다

- **WHEN** Account 전환 또는 Active Session·`ApplicationAuthorization`·`OAuthTokens`·`OAuthAuthorizationCodes`·`PushInstallation` 정리 중 하나가 확정되지 않는다
- **THEN** 시스템은 탈퇴 성공을 반환하지 않는다
- **AND** Account를 Deleted로 단독 전환했거나 Active Session·`ApplicationAuthorization`·`OAuthTokens`·`OAuthAuthorizationCodes`·`PushInstallation` 중 일부만 정리된 결과를 정상 완료로 노출하지 않는다
- **AND** 호출자는 안전한 오류와 재시도 가능한 실패를 받는다

#### Scenario: 일반 로그아웃과 Account 탈퇴를 구분한다

- **WHEN** 사용자가 Account 탈퇴가 아닌 일반적인 전체 로그아웃 또는 현재 Session 로그아웃을 요청한다
- **THEN** 해당 로그아웃 계약은 Account 탈퇴의 Profile eligibility나 Account terminal 전환을 실행하지 않는다
- **AND** Account 탈퇴 요청은 현재 Session 외의 Active Session까지 함께 폐기한다

### Requirement: Settings의 Kosmo 탈퇴 확인 lifecycle

**Durable authority references (session context):** `docs/design/settings.md`, `docs/design/profile-lifecycle.md`, `docs/domain/objects/account.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/session.md`, `PROD-970` — 인증된 Web·Android·iOS Settings는 `/settings/account-deletion` 내부 detail에서 같은 Account 탈퇴 eligibility, 확인, pending, error 및 success 계약을 제공해야 한다(MUST). Settings root/master는 `코스모 탈퇴` 행을 항상 노출해야 하며(MUST), 이 행은 Byulmaru ID의 외부 `계정 설정`과 분리되어야 한다(MUST). 클라이언트는 이미 조회한 `me.profiles`로 활성 Profile 개수와 이유를 사전 표시할 수 있지만(MAY), 이 precheck는 참고용이며 서버 mutation의 원자적 재확인을 대체하지 않는다(MUST NOT). eligibility가 충족되지 않으면 활성 Profile 개수와 이유를 표시해야 하며(MUST), Profile 목록·Profile action·Profile 관리 화면으로의 보조 진입점을 추가해서는 안 된다(MUST NOT). eligibility가 충족되면 되돌릴 수 없는 탈퇴 안내와 acknowledgement checkbox를 표시하고(MUST), checkbox를 선택하기 전 확정 action을 비활성화해야 하며(MUST). 재인증, 유예기간, 탈퇴 이유 입력 또는 이유 설문을 요구해서는 안 된다(MUST NOT).

#### Scenario: 탈퇴 행을 항상 표시한다

- **WHEN** 인증 사용자가 Web, Android 또는 iOS에서 Settings root/master를 연다
- **THEN** 시스템은 연결된 Profile 상태와 무관하게 마지막 행으로 `코스모 탈퇴`를 표시한다
- **AND** 해당 행을 선택하면 `/settings/account-deletion` detail을 연다
- **AND** Byulmaru ID 외부 `계정 설정` 행을 변경하거나 대체하지 않는다

#### Scenario: eligibility 실패 이유를 표시한다

- **WHEN** `/settings/account-deletion` detail에 하나 이상의 Active Profile이 연결되어 있다
- **THEN** 시스템은 활성 Profile 개수와 탈퇴할 수 없는 이유를 표시한다
- **AND** Profile을 선택·삭제·비활성화하거나 Membership을 변경하는 action을 제공하지 않는다

#### Scenario: checkbox 확인으로 탈퇴를 활성화한다

- **WHEN** Account 탈퇴 eligibility가 충족되고 acknowledgement checkbox가 선택되지 않았다
- **THEN** 시스템은 되돌릴 수 없는 탈퇴 안내와 checkbox를 표시한다
- **AND** 확정 action은 disabled 상태다
- **AND** 재인증, 유예기간, 이유 입력을 요구하지 않는다

#### Scenario: pending 중 중복 조작을 막는다

- **WHEN** 사용자가 acknowledgement를 선택하고 탈퇴 확정 action을 실행한다
- **THEN** 시스템은 server 결과가 확정될 때까지 pending 상태를 표시한다
- **AND** 두 번째 탈퇴 요청, checkbox 변경, dismiss 또는 navigation으로 진행 중 요청을 우회할 수 없다

#### Scenario: 결과 불명 실패에서 확인 내용을 유지한다

- **WHEN** 탈퇴 결과를 확정하지 못하는 오류가 발생한다
- **THEN** 시스템은 Account Deleted 또는 성공 화면을 표시하지 않는다
- **AND** 안전한 오류와 `다시 시도`를 제공하며 탈퇴 안내와 acknowledgement 상태를 유지한다

### Requirement: 탈퇴 성공 후 credential 정리와 재가입 차단

**Durable authority references (session context):** `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`, `PROD-970` — 클라이언트는 server가 Account Deleted와 필수 인증·기기 정리를 확정한 뒤에만(MUST) caller-owned credential과 viewer 종속 상태를 정리하고 login route로 이동해야 한다(MUST). 성공 확정 전에는 인증된 viewer 상태를 지워 성공을 추측해서는 안 된다(MUST NOT). Deleted Account에 연결된 동일 Byulmaru ID OIDC subject의 Kosmo 재로그인은 후속 정책이 정해질 때까지 일시적으로 차단해야 하며(MUST), 이 임시 차단은 Byulmaru ID 자체의 상태 전이나 영구 재가입 정책을 추가하지 않아야 한다(MUST NOT).

#### Scenario: 성공 확정 뒤 login으로 이동한다

- **WHEN** server가 Account storage `DISABLED`와 모든 필수 정리를 성공으로 확정한다
- **THEN** Web·Android·iOS client는 credential과 viewer 종속 상태를 정리한다
- **AND** 사용자를 login route로 이동시킨다
- **AND** 이전 authenticated viewer 상태를 다시 표시하지 않는다

#### Scenario: 성공 확정 전 상태를 유지한다

- **WHEN** client가 network 오류 또는 결과 불명 server 오류를 받는다
- **THEN** client는 기존 credential과 viewer 상태를 유지한다
- **AND** login route로 이동하거나 Account Deleted를 표시하지 않는다
- **AND** 사용자는 같은 확인 내용으로 탈퇴를 재시도할 수 있다

#### Scenario: 동일 OIDC subject의 임시 재로그인을 차단한다

- **WHEN** Deleted Account에 연결된 동일 Byulmaru ID OIDC subject로 Kosmo login을 시도한다
- **THEN** Kosmo는 새 Account나 Session을 생성하지 않고 로그인을 차단한다

#### Scenario: Byulmaru ID 외부 상태를 변경하지 않는다

- **WHEN** Kosmo Account 탈퇴가 확정된다
- **THEN** 시스템은 Byulmaru ID Account 또는 OIDC provider의 상태를 변경하지 않는다
- **AND** Kosmo 내부 Account의 terminal 상태와 재로그인 차단만 적용한다

### Requirement: 공개 Account deletion 안내는 in-app-only 경로를 설명한다

**Durable authority references (session context):** `docs/design/settings.md`, `docs/domain/objects/account.md`, `PROD-970` — 공개 `/account-deletion` 문서는 Kosmo Account 탈퇴가 인증된 앱의 Settings에서만 가능하다는 경로를 안내해야 하며(MUST), 공개 문서 자체에서 이메일 또는 외부 수동 삭제 요청을 탈퇴 경로로 제공해서는 안 된다(MUST NOT). 안내 문서는 실제 `/settings/account-deletion` action과 혼동되지 않도록 public guidance로 유지해야 한다(MUST).

#### Scenario: 공개 안내에서 앱 내 경로를 설명한다

- **WHEN** 비로그인 사용자가 public `/account-deletion`을 연다
- **THEN** 문서는 인증 후 Settings의 `코스모 탈퇴`에서 진행하는 in-app-only 경로를 안내한다
- **AND** public 문서는 Account 삭제 action을 직접 실행하지 않는다

#### Scenario: 공개 안내에서 이메일 삭제 요청을 제공하지 않는다

- **WHEN** 사용자가 public `/account-deletion`의 탈퇴 방법을 확인한다
- **THEN** 문서는 이메일 제출 form 또는 이메일 삭제 요청 절차를 제공하지 않는다
- **AND** 사용자는 앱 안에서 진행해야 한다는 설명을 확인할 수 있다
