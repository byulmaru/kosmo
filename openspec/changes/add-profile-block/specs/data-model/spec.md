## ADDED Requirements

### Requirement: Additive Profile Block relation storage

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `openspec/specs/data-model/spec.md`의 기존 Profile·관계 저장 계약, `PROD-821`. 시스템은 기존 Profile 저장 모델을 변경하지 않는 additive 관계 저장으로 Profile Block의 Owner Profile, Target Profile과 생성 시각을 보존해야 한다(MUST). 기존 Profile·Follow·Reaction·Notification·Post row를 backfill하거나 변경하지 않아야 하며(MUST NOT), Owner/Target foreign key와 동일한 Owner/Target 조합의 unique 불변식을 DB에서 강제해야 한다(MUST). Owner와 Target이 같은 조합은 저장해서는 안 되며(MUST NOT), Profile Block은 별도 lifecycle state, expiry 또는 기존 객체의 상태를 복제하는 column을 추가해서는 안 된다(MUST NOT).

#### Scenario: Local·Remote Profile pair를 같은 관계 모델에 저장한다

- **WHEN** Local Owner가 Local 또는 Remote Target을 차단한다
- **THEN** 시스템은 두 Profile identity와 생성 시각을 Profile Block 관계 row에 저장한다
- **AND** 관계의 Owner/Target 방향을 보존한다
- **AND** Local·Remote 조합에 별도 저장 모델이나 원격 ActivityPub identity column을 요구하지 않는다

#### Scenario: 동일 pair와 자기 자신 관계의 저장 불변식을 지킨다

- **WHEN** 동일한 Owner/Target pair를 다시 저장하거나 Owner와 Target이 같은 입력을 저장하려 한다
- **THEN** DB unique·check 불변식은 duplicate 또는 self-block row를 거부한다
- **AND** 기존 Profile Block row와 Profile row를 변경하지 않는다

### Requirement: Profile Block cleanup transaction boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Profile Block 생성 transaction은 Block row와 canonical이 정한 Follow Request·Follow Relationship·Target Reaction 및 Follow 직접 원인 Notification 정리를 같은 commit/rollback 경계에서 처리해야 한다(MUST). Repost Post, Bookmark와 다른 Notification row를 이 경계에서 삭제하거나 Read State를 변경해서는 안 된다(MUST NOT).

#### Scenario: 성공한 transaction에 Block과 필수 정리가 함께 commit된다

- **WHEN** Profile Block 생성과 관계 정리 대상이 모두 유효하다
- **THEN** 시스템은 Block row와 모든 필수 정리 결과를 같은 transaction에서 commit한다
- **AND** transaction 완료 시 양방향 Follow 관계·요청과 Target의 Owner Post Reaction이 남지 않는다
- **AND** Follow 객체 직접 원인 Notification만 함께 제거된다

#### Scenario: transaction 실패가 기존 관계와 저장 상태를 보존한다

- **WHEN** Block row 또는 필수 정리 statement 중 하나가 실패한다
- **THEN** 시스템은 Block row와 같은 transaction의 정리 변경을 모두 rollback한다
- **AND** 성공 전의 Follow·Reaction·Notification 저장 상태를 부분 결과 없이 보존한다
