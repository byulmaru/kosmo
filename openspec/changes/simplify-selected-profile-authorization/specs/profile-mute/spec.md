## MODIFIED Requirements

### Requirement: 행동 자격과 Target 경계를 검증한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `openspec/specs/profile-mute/spec.md` (existing behavior being corrected), `PROD-814`, `PROD-824`, `PROD-962` — Profile Mute를 만드는 Owner는 Active Account가 선택한 Active·Normal Profile이어야 하며 Target Profile과 달라야 한다(MUST). Target에는 저장된 Local Profile과 Remote Profile을 모두 지정할 수 있어야 하지만, Target Profile과 Instance는 공통 `visibleProfileWhere`를 통과해야 한다(MUST). Core action은 검증된 Owner Profile identity를 받아 행동 고유 조건과 Target 가시성·존재 여부를 같은 transaction 안에서 확인해야 한다(MUST). HTTP나 GraphQL transport 상태에 의존해서는 안 된다(MUST NOT).

#### Scenario: Local Target을 Mute한다

- **WHEN** 자격을 갖춘 Owner가 자신과 다른 Local Profile을 Target으로 지정한다
- **THEN** 시스템은 영구 Profile Mute 관계를 생성한다

#### Scenario: Remote Target을 Mute한다

- **WHEN** 자격을 갖춘 Owner가 저장된 Remote Profile을 Target으로 지정한다
- **THEN** 시스템은 Local Target과 같은 Profile Mute 관계를 생성한다

#### Scenario: 비가시화된 Target은 Mute할 수 없다

- **WHEN** Target Profile이 DISABLED이거나 Target의 Instance가 SUSPENDED 상태이다
- **THEN** 시스템은 요청을 거부하고 Profile Mute 관계를 만들지 않는다

#### Scenario: 자기 자신은 Mute할 수 없다

- **WHEN** Owner와 Target이 같은 Profile이다
- **THEN** 시스템은 요청을 거부하고 Profile Mute 관계를 만들지 않는다

#### Scenario: 자격이 없는 Owner는 Mute할 수 없다

- **WHEN** Owner가 Active·Normal Profile 조건을 충족하지 않는다
- **THEN** 시스템은 요청을 거부하고 Profile Mute 관계를 만들지 않는다
