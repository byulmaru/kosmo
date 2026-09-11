## ADDED Requirements

### Requirement: Profile identity lookup uses the existing Profile policy

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0021-hashtag-related-profile-navigation.md`, `docs/domain/policies/post-list.md`, `PROD-822`. GraphQL `node(id:)`와 `profileByHandle` 직접 조회는 Profile Block과 무관하게 기존 lifecycle·membership·공개 Profile 조회 정책과 기본 Profile 정보 범위를 유지해야 한다(MUST). Profile 자체가 기존 lifecycle 정책으로 조회 불가하면 기존 null/unavailable 결과를 유지하고 Block 전용 identity payload를 만들지 않아야 한다(MUST NOT). 유효한 Account에 selected Profile이 있으면 그 Profile을 `searchProfiles`의 viewer로 사용해야 하며(MUST), 기존 공개 조회 조건을 통과한 후보 중 viewer와 양방향 Active Block 관계인 Profile을 pagination·cursor·limit 전에 제외해야 한다(MUST). selected Profile이 없으면 기존 Account 인증과 공개 후보 결과를 유지하고 Profile Block predicate나 selected Local Profile을 새로 요구해서는 안 된다(MUST NOT). 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용해서는 안 된다(MUST NOT). Profile의 followers/following 후보와 새 Follow 입력은 양방향 Profile Block 관계를 적용해야 하며(MUST), 상대 Profile을 Follow 후보로 반환하거나 새 Follow Request·Relationship을 저장해서는 안 된다(MUST NOT). Owner가 관리하는 차단 목록은 일반 Profile 공개 조회와 구분된 Owner 전용 관계 조회로 제공해야 한다(MUST).

#### Scenario: Block된 상대 Profile의 직접 기본 정보를 기존 정책으로 조회한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 GraphQL `node(id:)` 또는 `profileByHandle`로 상대 Profile을 직접 조회한다
- **THEN** 시스템은 Block 관계를 이유로 기본 Profile 정보를 숨기지 않고 기존 lifecycle·membership·공개 Profile 조회 정책을 적용한다
- **AND** Post·Media·Follow와 상호작용에는 각 surface의 방향별 또는 양방향 Profile Block 정책을 별도로 적용한다

#### Scenario: selected Profile 기준으로 Block된 상대 Profile을 searchProfiles 후보에서 제외한다

- **WHEN** 유효한 Account에 selected Profile이 있고 그 viewer와 Profile 사이에 어느 방향으로든 Active Profile Block이 존재하며 viewer가 GraphQL `searchProfiles`에 exact-match 또는 partial-match 검색을 요청한다
- **THEN** 시스템은 기존 공개 조회 조건을 통과한 후보에서도 해당 Profile을 제외한다
- **AND** 시스템은 Account의 selected Profile을 viewer로 사용한다
- **AND** Block 후보 제외를 pagination·cursor·limit 전에 적용해 후속 후보와 pageInfo를 유지한다
- **AND** GraphQL `node(id:)`·`profileByHandle`의 직접 기본 Profile 조회 정책을 변경하지 않는다

#### Scenario: selected Profile이 없으면 기존 searchProfiles 공개 결과를 유지한다

- **WHEN** 유효한 Account에 selected Profile이 없고 Account가 GraphQL `searchProfiles`에 exact-match 또는 partial-match 검색을 요청한다
- **THEN** 시스템은 기존 Account 인증과 공개 후보 결과를 유지한다
- **AND** Profile Block predicate를 적용하거나 selected Local Profile을 새로 요구하지 않는다
- **AND** 임의 입력 actor나 이전 selected Profile·client cache를 viewer로 재사용하지 않는다

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

### Requirement: Profile Block local Follow admission and residual relation visibility

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `PROD-822`, `PROD-821` concurrency 정정 댓글 `5ceda55c-f3b6-4109-987c-27c12c413ce2`. Active Block이 이미 적용된 상태에서 새로 시작한 로컬 Follow와 Follow Request 승인은 관계를 생성하기 전에 공통 양방향 정책으로 거부해야 한다(MUST). 잔존 pending 요청이나 기존 Follow를 발견했다는 이유로 성공 또는 새 관계 생성을 허용해서는 안 된다(MUST NOT). cleanup과 겹쳐 이미 진행 중이던 transition의 이후 commit을 완전히 직렬화할 의무는 없지만, 남은 관계를 Active Block 동안 비활성·비노출로 해석해야 한다(MUST).

#### Scenario: Block 확정 뒤 남은 pending 요청을 승인하지 않는다

- **WHEN** Active Block이 적용된 두 Profile 사이에 pending Follow Request가 남아 있고 이후 로컬 승인 요청이 시작된다
- **THEN** 공통 정책은 Follow Relationship 생성을 거부한다
- **AND** 요청이 이미 존재한다는 이유만으로 차단 정책을 생략하지 않는다

#### Scenario: 잔존 관계를 Node·목록·viewer 상태의 유효한 Follow로 반환하지 않는다

- **WHEN** Active Block 동안 남은 Follow Request 또는 Follow Relationship이 Node·followers/following·요청 목록·viewer 관계 상태의 후보가 된다
- **THEN** 시스템은 해당 관계를 비노출 또는 비활성 결과로 처리한다
- **AND** 제삼자가 조회해도 차단된 두 Profile 사이의 잔존 관계를 유효한 Follow로 재구성하지 않는다
- **AND** 후보 제외를 목록의 pagination 이후 처리로 미루지 않는다

#### Scenario: 차단과 무관한 제삼자의 기존 조회 권한을 유지한다

- **WHEN** A와 B만 Block 관계이고 두 Profile과 차단 관계가 없는 C가 A 또는 B를 조회한다
- **THEN** 시스템은 C와 조회 대상 사이의 정책 및 기존 공개 조회 조건을 적용한다
- **AND** A와 B 사이의 Block만을 이유로 A 또는 B의 모든 공개 Profile을 C에게서 숨기지 않는다
