## ADDED Requirements

### Requirement: Selected Local Owner Profile representation update

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `PROD-490`, `PROD-492` — Profile edit 저장은 GraphQL usingProfile 경계를 통과한 selected Active/Normal Local Profile과 Owner Membership을 대상으로 displayName, bio, `followPolicy`와 avatar/header Media 관계를 변경해야 한다(MUST). 임의 Profile id, Member 또는 Admin role로 편집을 허용해서는 안 된다(MUST NOT).

#### Scenario: Update selected Local Profile as Owner

- **WHEN** Active Account의 selected Profile이 Active/Normal Local이고 Membership Role이 Owner이며 유효한
  displayName, bio, `followPolicy`와 Media 관계로 수정을 요청한다
- **THEN** 시스템은 selected Profile의 표현 값, `followPolicy`와 avatar/header 관계를 원자적으로 변경한다
- **AND** payload는 갱신된 Profile을 반환해 Relay normalized record를 동기화할 수 있게 한다

#### Scenario: Validate authorization when the update starts

- **WHEN** 저장 action을 시작할 때 selected Profile·Owner Membership·Account·Local Profile eligibility 중 하나가
  유효하지 않다
- **THEN** 시스템은 현재 상태를 server-authoritative하게 확인해 수정을 거부한다
- **AND** displayName, bio, `followPolicy`와 avatar/header 관계를 모두 저장 전 상태로 유지한다

#### Scenario: Apply a later eligibility change to subsequent updates

- **WHEN** 저장 action이 eligibility 확인을 통과한 뒤 commit 전에 Profile lifecycle/suspension, Owner Membership
  또는 Account active 상태가 바뀐다
- **THEN** 이미 승인된 실행 중 요청은 별도 lock 없이 완료될 수 있다
- **AND** 상태 변경 뒤 시작한 요청은 현재 eligibility로 거부한다

### Requirement: Guest-safe selected Profile edit capability

**Authority / Provenance:** `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-492` — nullable top-level `selectedProfileForEdit` query는 selected Active/Normal Local Profile의 Owner에게만 Profile을 반환해야 한다(MUST). guest, session 또는 selected Profile 부재와 편집 부적격 Account에는 GraphQL authorization error 대신 `null`을 반환해야 하며(MUST), public role이나 `canEdit` scalar를 노출해서는 안 된다(MUST NOT).

#### Scenario: Return the selected editable Profile

- **WHEN** Active Account의 selected Profile이 Active/Normal Local이고 Account가 Owner다
- **THEN** `selectedProfileForEdit`은 해당 Profile을 반환한다

#### Scenario: Keep public Profile queries usable without edit authority

- **WHEN** guest, selected Profile이 없는 session, Member·무관 Account 또는 Remote/inactive/suspended selected Profile이 공개 Profile과 `selectedProfileForEdit`을 함께 조회한다
- **THEN** 공개 Profile은 기존 조회 정책에 따라 응답한다
- **AND** `selectedProfileForEdit`은 authorization error 없이 `null`이다

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

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492` — 새로 입력하거나 변경한 displayName은 Unicode code point 기준 1~40, bio는 앞뒤 공백을 제거한 뒤 500자 이하여야 한다(MUST). 기존 displayName이 40 code point를 초과하면 원문을 변경하지 않고 다른 field만 수정하는 요청은 legacy 호환을 위해 허용해야 한다(MUST). avatar/header는 대상 Profile이 소유한 Ready Local Media만 연결해야 한다(MUST). 관계 교체·제거는 Media 자체를 삭제해서는 안 된다(MUST NOT).

#### Scenario: Reject invalid text without partial update

- **WHEN** displayName이 비어 있거나 새로 입력·변경한 displayName이 Unicode code point 40을 초과하거나 앞뒤 공백을 제거한 bio가 500자를 초과한다
- **THEN** 시스템은 field validation 오류로 전체 수정을 거부한다
- **AND** 기존 text와 Media 관계를 유지한다

#### Scenario: Preserve an unchanged legacy displayName while updating another field

- **WHEN** 대상 Profile의 기존 displayName이 40 code point를 초과하고 Owner가 displayName 원문은 그대로 둔 채 다른 Profile field를 변경한다
- **THEN** 시스템은 해당 legacy displayName만을 이유로 전체 수정을 거부하지 않는다
- **AND** displayName 원문을 한 글자라도 변경하면 새로 입력·변경한 값에 Unicode code point 기준 1~40 validation을 적용한다
- **AND** 서버는 client가 unchanged displayName을 생략하는 것에 의존하지 않고 저장 원문과 요청 원문을 비교한다

#### Scenario: Replace or remove Ready Local Media relationships

- **WHEN** Owner가 대상 Profile의 Ready Local Media를 avatar/header로 선택하거나 기존 관계를 제거한다
- **THEN** 시스템은 Profile representation 관계만 교체하거나 제거한다
- **AND** 이전 Media와 새 Media row/blob을 삭제하지 않는다

#### Scenario: Distinguish omitted, replacement and removal input

- **WHEN** avatar/header update field를 생략하거나 concrete Media global ID 또는 `null`로 보낸다
- **THEN** 시스템은 각 field를 각각 관계 유지, 해당 Media로 교체, 해당 kind 관계 제거로 해석한다
- **AND** 한 field의 input 의미가 다른 field 관계를 변경하지 않는다

#### Scenario: Reject invalid Media relationship atomically

- **WHEN** 선택한 Media가 다른 Profile 소유, Remote, Ready가 아니거나 존재하지 않는다
- **THEN** 시스템은 전체 수정을 거부한다
- **AND** displayName, bio와 기존 avatar/header 관계를 모두 유지한다
- **AND** 요청한 avatar와 header를 모두 검증하기 전에 어떤 text·policy·관계 write도 확정하지 않는다

### Requirement: Viewer-authorized Profile avatar and header projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`, `PROD-492`, `PROD-581` — Profile의 avatar/header 관계는 해당 Profile 조회 정책을 통과한 viewer에게 연결된 Ready Media identity와 저장된 URL을 제공해야 한다(MUST). 이 범위에서 media type GraphQL field를 추가하거나 일반 Media Node의 owner-only 조회 정책을 공개로 넓혀서는 안 되며(MUST NOT), update payload와 Profile query는 Relay가 동일 Media record를 정규화할 수 있는 identity를 제공해야 한다(MUST).

#### Scenario: Display linked images on a public Profile

- **WHEN** guest 또는 다른 Account가 조회 정책을 통과하는 Profile을 조회하고 Ready avatar/header 관계가 있다
- **THEN** Profile은 각 관계의 Media identity와 표시 URL metadata를 반환한다
- **AND** ProfileHero는 fallback 대신 해당 avatar/header를 표시할 수 있다

#### Scenario: Do not widen standalone Media visibility

- **WHEN** viewer가 Profile 관계가 아닌 일반 Media Node lookup으로 연결되지 않은 Ready Local Media를 조회한다
- **THEN** 기존 owner-only Media 조회 정책을 유지한다
