## ADDED Requirements

### Requirement: Additive Profile Block relation storage

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`. 시스템은 기존 Profile 저장 모델을 변경하지 않는 additive 관계 저장으로 Local 또는 Remote Owner의 Profile Block Owner Profile, Target Profile과 생성 시각을 보존해야 한다(MUST). 기존 Profile·Follow·Reaction·Notification·Post row를 backfill하거나 변경하지 않아야 하며(MUST NOT), Owner/Target foreign key와 동일한 Owner/Target 조합의 unique 불변식을 DB에서 강제해야 한다(MUST). Owner와 Target이 같은 조합은 저장해서는 안 되며(MUST NOT), Profile Block은 별도 lifecycle state, expiry 또는 기존 객체의 상태를 복제하는 column을 추가해서는 안 된다(MUST NOT).

#### Scenario: Local·Remote Owner와 Target을 같은 관계 모델에 저장한다

- **WHEN** Local 또는 Remote Owner가 서로 다른 Local 또는 Remote Target을 차단한다
- **THEN** 시스템은 두 Profile identity와 생성 시각을 Profile Block 관계 row에 저장한다
- **AND** 관계의 Owner/Target 방향을 보존한다
- **AND** Local·Remote 조합에 별도 저장 모델이나 원격 ActivityPub identity column을 요구하지 않는다

#### Scenario: 동일 pair와 자기 자신 관계의 저장 불변식을 지킨다

- **WHEN** 동일한 Owner/Target pair를 다시 저장하거나 Owner와 Target이 같은 입력을 저장하려 한다
- **THEN** DB unique·check 불변식은 duplicate 또는 self-block row를 거부한다
- **AND** 기존 Profile Block row와 Profile row를 변경하지 않는다
