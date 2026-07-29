## ADDED Requirements

### Requirement: Selected Local Owner Profile representation update

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `PROD-490`, `PROD-492` — Profile edit 저장은 GraphQL usingProfile 경계를 통과한 selected Active/Normal Local Profile과 Owner Membership을 대상으로 displayName, bio, `followPolicy`와 avatar/header Media 관계를 변경해야 한다(MUST). 임의 Profile id, Member 또는 Admin role로 편집을 허용해서는 안 된다(MUST NOT).

#### Scenario: Update selected Local Profile as Owner

- **WHEN** Active Account의 selected Profile이 Active/Normal Local이고 Membership Role이 Owner이며 유효한
  displayName, bio, `followPolicy`와 Media 관계로 수정을 요청한다
- **THEN** 시스템은 selected Profile의 표현 값, `followPolicy`와 avatar/header 관계를 원자적으로 변경한다
- **AND** payload는 갱신된 Profile을 반환해 Relay normalized record를 동기화할 수 있게 한다

### Requirement: Profile edit Follow Approval Policy shares the representation save boundary

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492`, `PROD-531` — 현재 Settings 진입점이 제공되기 전 Profile edit의 Follow Approval Policy 변경은 `followPolicy` enum을 displayName·bio·avatar/header와 같은 저장 동작에 포함해야 하며(MUST). 정책 변경은 기존 Pending Follow Request의 상태나 존재를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Save the policy with the selected Profile representation

- **WHEN** Owner가 `followPolicy`를 `OPEN` 또는 `APPROVAL_REQUIRED`로 변경해 Profile edit draft를 저장한다
- **THEN** 시스템은 해당 enum과 displayName·bio·avatar/header 관계를 하나의 저장 경계에서 반영한다
- **AND** 정책만 별도 즉시 저장하거나 별도 mutation seam을 실행하지 않는다

#### Scenario: Preserve Pending Follow Requests after a policy change

- **WHEN** selected Local Profile Owner가 Follow Approval Policy를 변경해 저장한다
- **THEN** 기존 Pending Follow Request의 상태와 존재는 저장 전과 동일하게 유지된다
- **AND** 정책 변경은 이미 생성된 Follow Request를 승인·거절·삭제하지 않는다

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
