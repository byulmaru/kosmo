## ADDED Requirements

### Requirement: Selected Local Owner Profile representation update

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `PROD-490`, `PROD-492` — Profile edit 저장은 GraphQL usingProfile 경계를 통과한 selected Active/Normal Local Profile과 Owner Membership을 대상으로 displayName, bio와 avatar/header Media 관계를 변경해야 한다(MUST). 임의 Profile id, Member 또는 Admin role로 편집을 허용해서는 안 된다(MUST NOT).

#### Scenario: Update selected Local Profile as Owner

- **WHEN** Active Account의 selected Profile이 Active/Normal Local이고 Membership Role이 Owner이며 유효한
  displayName, bio와 Media 관계로 수정을 요청한다
- **THEN** 시스템은 selected Profile의 표현 값과 avatar/header 관계를 원자적으로 변경한다
- **AND** payload는 갱신된 Profile을 반환해 Relay normalized record를 동기화할 수 있게 한다

#### Scenario: Reject a non-owner or arbitrary target

- **WHEN** 요청이 selected Profile이 아닌 id를 대상으로 하거나 selected Membership이 Member·없음·Admin이다
- **THEN** 시스템은 Profile 수정을 거부한다
- **AND** displayName, bio와 Media 관계를 변경하지 않는다

#### Scenario: Reject ineligible selected Profile

- **WHEN** selected Profile이 Remote이거나 Active/Normal 조건을 통과하지 않는다
- **THEN** 시스템은 Profile 수정을 거부한다
- **AND** client용 Owner capability는 편집 가능 상태를 반환하지 않는다

### Requirement: Profile edit text and Media relationship validation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492` — displayName은 1~40자, bio는 500자 이하여야 하며(MUST), avatar/header는 대상 Profile이 소유한 Ready Local Media만 연결해야 한다(MUST). 관계 교체·제거는 Media 자체를 삭제해서는 안 된다(MUST NOT).

#### Scenario: Reject invalid text without partial update

- **WHEN** displayName이 비어 있거나 40자를 초과하거나 bio가 500자를 초과한다
- **THEN** 시스템은 field validation 오류로 전체 수정을 거부한다
- **AND** 기존 text와 Media 관계를 유지한다

#### Scenario: Replace or remove Ready Local Media relationships

- **WHEN** Owner가 대상 Profile의 Ready Local Media를 avatar/header로 선택하거나 기존 관계를 제거한다
- **THEN** 시스템은 Profile representation 관계만 교체하거나 제거한다
- **AND** 이전 Media와 새 Media row/blob을 삭제하지 않는다

#### Scenario: Reject invalid Media relationship atomically

- **WHEN** 선택한 Media가 다른 Profile 소유, Remote, Ready가 아니거나 존재하지 않는다
- **THEN** 시스템은 전체 수정을 거부한다
- **AND** displayName, bio와 기존 avatar/header 관계를 모두 유지한다
