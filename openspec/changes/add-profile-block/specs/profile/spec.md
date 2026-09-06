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
