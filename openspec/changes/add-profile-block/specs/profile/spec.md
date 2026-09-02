## ADDED Requirements

### Requirement: Profile Block direct Profile and search visibility

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/policies/post-list.md`, `PROD-822`. Profile 조회·검색과 Profile의 followers/following 후보는 Profile Block 관계를 공통 조회 정책으로 적용해야 한다(MUST). Owner → Target Block이 있으면 Owner와 Target 어느 쪽의 요청에서도 상대 Profile을 직접 조회하거나 상대 Profile을 Follow 후보로 반환해서는 안 되며(MUST NOT), 상대를 향한 새 Follow 입력도 거부해야 한다(MUST NOT). Owner가 관리하는 차단 목록은 일반 Profile 공개 조회와 구분된 Owner 전용 관계 조회로 제공해야 한다(MUST).

#### Scenario: Block된 상대 Profile을 직접 조회할 수 없다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대 Profile Node, route 또는 exact/partial search를 조회한다
- **THEN** 시스템은 상대 Profile을 공개 조회 결과로 반환하지 않는다
- **AND** Profile Block을 검사하지 않는 별도 Profile loader나 검색 경로를 사용하지 않는다

#### Scenario: Block된 상대 Profile을 Follow 후보에서 제외한다

- **WHEN** Block 관계의 한쪽 Profile이 followers/following 목록 또는 새 Follow 후보를 요청한다
- **THEN** 시스템은 상대 Profile을 후보와 결과에서 제외한다
- **AND** pending Follow Request나 과거 Follow Relationship을 현재 후보로 재구성하지 않는다

#### Scenario: 차단된 상대를 향한 새 Follow 입력을 거부한다

- **WHEN** Block 관계의 한쪽 Profile이 상대 Profile을 새로 Follow하려고 한다
- **THEN** 시스템은 공통 Profile Block policy에 따라 입력을 거부한다
- **AND** 새 Follow Request나 Follow Relationship을 저장하지 않는다

#### Scenario: Owner의 관리 목록은 relation-scoped identity만 사용한다

- **WHEN** Owner가 자신이 만든 Profile Block 관리 목록을 조회한다
- **THEN** 시스템은 Owner가 소유한 Block relation과 관리에 필요한 Target 식별 정보를 반환한다
- **AND** Target의 일반 Profile 공개 조회 정책을 우회하는 최신 상세·Post·Media·관계 데이터를 반환하지 않는다
