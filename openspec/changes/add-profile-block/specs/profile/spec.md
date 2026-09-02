## ADDED Requirements

### Requirement: Profile Block direct Profile and search visibility

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/policies/post-list.md`, `PROD-822`, `PROD-813`. Profile 조회·검색과 Profile의 followers/following 후보는 Profile Block 관계를 공통 조회 정책으로 적용해야 한다(MUST). Owner → Target Block이 있으면 Owner와 Target 어느 쪽의 요청에서도 상대 Profile을 직접 조회하거나 상대 Profile을 Follow 후보로 반환해서는 안 된다(MUST NOT). Owner가 관리하는 차단 목록은 일반 Profile 공개 조회와 구분된 Owner 전용 관계 조회로 제공해야 한다(MUST).

#### Scenario: Block된 상대 Profile을 직접 조회할 수 없다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대 Profile Node, route 또는 exact/partial search를 조회한다
- **THEN** 시스템은 상대 Profile을 공개 조회 결과로 반환하지 않는다
- **AND** Profile Block을 검사하지 않는 별도 Profile loader나 검색 경로를 사용하지 않는다

#### Scenario: Block된 상대 Profile을 Follow 후보에서 제외한다

- **WHEN** Block 관계의 한쪽 Profile이 followers/following 목록 또는 새 Follow 후보를 요청한다
- **THEN** 시스템은 상대 Profile을 후보와 결과에서 제외한다
- **AND** pending Follow Request나 과거 Follow Relationship을 현재 후보로 재구성하지 않는다

#### Scenario: Owner의 관리 목록은 relation-scoped identity만 사용한다

- **WHEN** Owner가 자신이 만든 Profile Block 관리 목록을 조회한다
- **THEN** 시스템은 Owner가 소유한 Block relation과 관리에 필요한 Target 식별 정보를 반환한다
- **AND** Target의 일반 Profile 공개 조회 정책을 우회하는 최신 상세·Post·Media·관계 데이터를 반환하지 않는다

### Requirement: Profile Block and active selected-profile authorization

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-821`, `PROD-822`. Account 요청으로 Profile Block을 생성·해제하거나 관리할 때 시스템은 기존 selected Profile authorization 경계를 사용해야 한다(MUST). 요청 Account가 Active이고 selected Profile에 유효한 membership을 가지며 selected Profile이 Active/Normal Local Owner일 때만 Owner action을 허용해야 하고(MUST), 다른 Profile ID를 입력해 selected Profile 경계를 우회해서는 안 된다(MUST NOT).

#### Scenario: selected Profile이 허용된 Owner action을 수행한다

- **WHEN** Active Account가 Active/Normal Local selected Profile의 membership으로 다른 Profile을 차단하거나 자신의 Block을 해제한다
- **THEN** 시스템은 selected Profile을 Owner actor로 사용해 Profile Block action을 수행한다
- **AND** action 결과와 relation 조회는 selected Profile의 owner scope를 따른다

#### Scenario: selected Profile 경계를 우회한 Profile Block을 거부한다

- **WHEN** 요청이 다른 Profile ID를 actor로 지정하거나 selected Profile이 없거나 membership이 없는 상태에서 Profile Block을 실행한다
- **THEN** 시스템은 대상 조회와 저장 전에 기존 authorization 오류로 거부한다
- **AND** 요청 Account가 접근할 수 없는 Owner의 Profile Block을 생성·해제·조회하지 않는다
