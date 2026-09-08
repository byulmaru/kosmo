## ADDED Requirements

### Requirement: Profile identity lookup uses the existing Profile policy

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-822`. Profile Node, handle route와 일반 Profile 검색은 기존 Profile 조회 정책에 따라 조회 가능한 기본 Profile 정보를 제공해야 한다(MUST). Profile Lifecycle·Suspension·Instance Domain Block·Account 및 Membership에 따른 기존 조회 조건은 각 surface에서 계속 적용해야 한다(MUST).

#### Scenario: Block 관계가 있어도 기존 조건을 충족한 Profile을 조회한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대 Profile Node, handle route 또는 일반 Profile 검색을 조회한다
- **THEN** 시스템은 기존 Profile 조회 정책을 충족하는 경우 상대 Profile의 기본 정보를 반환한다
- **AND** Profile Node·handle route·일반 Profile 검색은 동일한 기존 Profile 조회 조건을 사용한다

### Requirement: Profile Block preserves the bilateral Follow boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `PROD-822`. Profile Block 관계가 있는 두 Profile 사이의 Follow 후보와 새 Follow 입력은 양방향 관계 정책을 적용해야 한다(MUST). 차단 관계가 있는 상대 Profile은 followers/following 후보에서 제외하고, 상대를 향한 새 Follow 입력은 Profile Block 정책으로 거부해야 한다(MUST).

#### Scenario: Block 관계의 상대 Profile을 Follow 후보에서 제외한다

- **WHEN** Block 관계의 한쪽 Profile이 followers/following 목록 또는 새 Follow 후보를 요청한다
- **THEN** 시스템은 상대 Profile을 후보 결과에서 제외한다
- **AND** pending Follow Request와 과거 Follow Relationship은 현재 후보를 구성하는 근거로 사용하지 않는다

#### Scenario: 차단된 상대를 향한 새 Follow 입력을 거부한다

- **WHEN** Block 관계의 한쪽 Profile이 상대 Profile을 새로 Follow하려고 한다
- **THEN** 시스템은 Profile Block 정책에 따라 입력을 거부한다
- **AND** 해당 입력의 결과로 새 Follow Request 또는 Follow Relationship을 저장하지 않는다
