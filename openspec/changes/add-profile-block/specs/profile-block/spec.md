## ADDED Requirements

### Requirement: Profile Block lifecycle and owner-only relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`. 시스템은 Owner Profile과 Target Profile 사이의 방향성 있는 Profile Block을 저장하고 생성·해제할 수 있어야 한다(MUST). Profile Block은 별도 상태나 만료를 갖지 않으며 관계의 존재가 적용 중인 차단을 뜻해야 한다(MUST). 생성은 `Account.Active`와 `Profile.Member` 권한, Active/Normal Local Owner, 서로 다른 Target과 같은 조합의 부재를 모두 요구해야 하며(MUST), 해제는 `Account.Active`와 `ProfileBlock.Owner` 권한을 요구해야 한다(MUST). 관계 조회는 Owner에게만 허용해야 한다(MUST).

#### Scenario: Local Owner가 Local 또는 Remote Target을 차단한다

- **WHEN** Active Account의 Member인 Active/Normal Local Owner가 자신과 다른 Local 또는 Remote Target에 아직 없는 Profile Block을 생성한다
- **THEN** 시스템은 Owner → Target 방향의 Profile Block과 생성 시각을 저장한다
- **AND** 같은 Owner/Target 조합에 적용 중인 별도 상태·만료 행을 만들지 않는다
- **AND** Profile Block 관계는 Owner가 자신의 차단 목록에서 조회할 수 있다

#### Scenario: 동일한 Owner/Target 조합의 중복 저장을 막는다

- **WHEN** 같은 Owner/Target 조합에 이미 Profile Block이 있는 상태에서 다시 저장을 시도한다
- **THEN** 시스템은 두 번째 Profile Block 행을 저장하지 않는다
- **AND** 기존 관계의 방향과 생성 시각을 바꾸지 않는다

#### Scenario: 권한 없는 Profile Block 해제를 거부한다

- **WHEN** Target Profile 또는 다른 Profile이 Owner의 Profile Block을 해제하려고 한다
- **THEN** 시스템은 `ProfileBlock.Owner` 권한을 통과시키지 않는다
- **AND** Profile Block 관계를 변경하지 않는다

### Requirement: Profile Block 생성의 원자적 관계 정리

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Profile Block 생성은 Block 행과 양방향 Follow Request·Follow Relationship, Target이 Owner의 Post에 남긴 Reaction 및 제거된 Follow 객체를 직접 원인으로 하는 Notification을 하나의 로컬 원자적 transaction에서 함께 정리해야 한다(MUST). Repost Post, Bookmark와 다른 기존 Notification은 이 생성 action에서 삭제하거나 Read State를 바꾸지 않아야 한다(MUST NOT). 정리 실패 시 Block과 정리 대상 변경은 부분적으로 남아서는 안 된다(MUST NOT). 해제는 제거된 관계나 Reaction을 자동으로 복구하지 않아야 한다(MUST NOT).

#### Scenario: 차단 생성이 관계·Reaction·직접 원인 Notification을 함께 정리한다

- **WHEN** Owner와 Target 사이에 양방향 Follow Request 또는 Follow Relationship이 있고 Target이 Owner의 Post에 Reaction을 남긴 상태에서 Owner가 Profile Block을 생성한다
- **THEN** 시스템은 Profile Block을 저장하는 같은 transaction에서 두 방향의 Follow Request와 Follow Relationship을 제거한다
- **AND** Target이 Owner의 Post에 남긴 Reaction을 제거한다
- **AND** 제거된 Follow 객체를 직접 원인으로 하는 Notification을 제거한다
- **AND** Repost Post, Bookmark와 Follow 객체가 직접 원인이 아닌 기존 Notification은 보존한다

#### Scenario: 정리 중 실패하면 부분 차단을 남기지 않는다

- **WHEN** Profile Block 생성 transaction의 Block 저장 또는 필수 관계·Reaction·직접 원인 Notification 정리 중 오류가 발생한다
- **THEN** 시스템은 transaction 전체를 rollback한다
- **AND** 부분 Profile Block, 부분 Follow/Reaction 정리 또는 부분 Notification 정리 결과를 남기지 않는다

#### Scenario: 차단 해제는 제거된 관계를 복구하지 않는다

- **WHEN** Owner가 적용 중인 Profile Block을 해제한다
- **THEN** 시스템은 Profile Block만 제거한다
- **AND** 차단 생성 때 제거된 Follow Request, Follow Relationship과 Reaction을 자동으로 재생성하지 않는다

### Requirement: Profile Block symmetric policy invariant

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-813`. 시스템은 임의의 viewer·target Profile pair에 대해 저장된 Owner → Target Profile Block을 양쪽 방향에 적용되는 공통 blocked predicate로 정규화해야 한다(MUST). Profile·Post·Media·Follow 후보·Post List·검색·Notification과 새 로컬 상호작용의 각 정책 소비자는 이 predicate를 사용해 차단 여부를 결정해야 한다(MUST). predicate가 true인 양쪽 Profile 사이의 Follow·Reply·Reaction·Repost 같은 새 로컬 상호작용은 허용해서는 안 되며(MUST NOT), Block 관계가 사라져도 차단 생성 중 제거된 관계·Reaction과 이미 생성된 로컬 상호작용을 자동으로 복구해서는 안 된다(MUST NOT).

#### Scenario: Block 방향과 무관하게 공통 predicate를 적용한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대를 대상으로 하나의 Block 정책 소비를 실행한다
- **THEN** 시스템은 어느 요청 방향에서도 같은 pair를 blocked로 판정한다
- **AND** consumer가 Owner 방향만 검사해 반대 방향의 정책 결정을 우회하지 않는다

#### Scenario: 차단 중 새 로컬 상호작용을 공통 predicate로 거부한다

- **WHEN** Block 관계의 Owner 또는 Target이 상대 Profile을 대상으로 새 Follow, Reply, Reaction 또는 Repost를 실행한다
- **THEN** 시스템은 공통 blocked predicate에 따라 해당 상호작용을 허용하지 않는다
- **AND** 차단 정책을 우회한 새 관계·Post·Reaction 저장 결과를 남기지 않는다

#### Scenario: 차단 해제는 삭제된 상태를 복구하지 않는다

- **WHEN** Owner가 Profile Block을 해제한 뒤 양쪽 Profile이 새 요청을 실행한다
- **THEN** 시스템은 새 요청 시점의 현재 Block predicate와 다른 정책을 평가한다
- **AND** 차단 생성 때 제거된 Follow·Reaction이나 기존 상호작용을 자동으로 재생성하지 않는다

### Requirement: Profile Block GraphQL actor and policy boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-823`. GraphQL은 검증된 Session의 Active Account와 selected Profile을 actor로 사용해 Profile Block 생성·해제와 Owner 차단 목록 조회를 제공해야 한다(MUST). GraphQL resolver·loader·Node 조회·connection은 중앙 application policy를 재사용해야 하며(MUST), 요청별 DB actor GUC·operation 전용 database session·client 전용 차단 필터로 권한이나 가시성을 대체해서는 안 된다(MUST NOT). 차단 목록은 selected Profile이 Owner인 관계만 반환해야 하며(MUST), Target Profile의 일반 조회 가능성을 우회해 관계 관리에 필요한 최소 식별 정보만 제공해야 한다(MUST).

#### Scenario: 인증과 selected Profile 없이 Block mutation을 실행하지 않는다

- **WHEN** 유효한 Session, Active Account 또는 selected Profile Membership이 없는 클라이언트가 Profile Block 생성·해제 또는 목록 GraphQL operation을 호출한다
- **THEN** 시스템은 대상 Profile 조회와 mutation을 수행하기 전에 기존 GraphQL 인증·권한 오류로 거부한다
- **AND** 다른 Profile의 Block 관계나 Target 식별 정보를 응답으로 노출하지 않는다

#### Scenario: selected Profile별 Owner 목록을 격리한다

- **WHEN** Active Account가 Owner A와 Owner B를 모두 사용할 수 있고 selected Profile을 A에서 B로 전환해 각자의 차단 목록을 조회한다
- **THEN** 각 응답은 해당 시점의 selected Profile이 Owner인 Profile Block만 반환한다
- **AND** Owner A의 관계가 Owner B의 목록·mutation·Node 조회 결과에 섞이지 않는다

#### Scenario: GraphQL 직접 조회와 목록이 같은 Block policy를 사용한다

- **WHEN** GraphQL client가 Profile Node, Post connection, Media relation, Follow 후보 또는 Profile Block 목록을 같은 Block 관계에 대해 요청한다
- **THEN** 시스템은 요청 surface와 무관하게 동일한 양방향 Profile Block policy를 적용한다
- **AND** client가 숨겨진 결과를 후처리해 상대 Profile 또는 Post를 복원할 수 있는 payload를 반환하지 않는다
