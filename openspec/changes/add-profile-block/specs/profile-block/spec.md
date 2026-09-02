## ADDED Requirements

### Requirement: Profile Block lifecycle and owner-only relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`. 시스템은 Local 또는 Remote Owner Profile과 Target Profile 사이의 방향성 있는 Profile Block을 저장하고 생성·해제할 수 있어야 한다(MUST). Profile Block은 별도 상태나 만료를 갖지 않으며 관계의 존재가 적용 중인 차단을 뜻해야 한다(MUST). 도메인 capability는 ingress별 Account·Membership 상태나 Owner의 Local·Remote 유형을 일반 생성 조건으로 요구해서는 안 된다(MUST NOT). 생성은 Owner와 Target이 서로 다르고 같은 조합의 관계가 없는 경우에만 허용해야 하며(MUST), 해제는 `ProfileBlock.Owner`에 한정해야 하고(MUST), 관계 조회는 Owner에게만 허용해야 한다(MUST).

#### Scenario: Local·Remote Owner가 Local 또는 Remote Target을 차단한다

- **WHEN** ingress admission을 통과한 Local 또는 Remote Owner가 자신과 다른 Local 또는 Remote Target에 아직 없는 Profile Block을 생성한다
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

### Requirement: Profile Block durable cleanup orchestration

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Block policy/admission을 통과한 Profile Block 생성은 내구성 있는 Temporal cleanup orchestration을 시작해야 하며(MUST), 이 orchestration은 양방향 Follow Request·Follow Relationship에 기존 removal transition/effect-plan 계약을 재사용하고 pending Follow Request와 Target이 Owner의 Post에 남긴 Reaction 및 제거된 Follow 객체의 직접 원인 Notification을 내구성 있게 정리해야 한다(MUST). 필수 cleanup이 완료되기 전에는 Block action을 성공으로 확정해서는 안 되며(MUST NOT), Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 보존해야 하고(MUST), Block 해제는 제거된 관계·Reaction을 복구해서는 안 된다(MUST NOT).

#### Scenario: durable orchestration 완료 뒤에만 Block 성공을 확정한다

- **WHEN** Owner가 Block을 확정하고 양방향 Follow Request·Follow Relationship, Target Reaction 또는 직접 원인 Notification 정리가 필요하다
- **THEN** 시스템은 Block policy/admission을 적용한 뒤 durable orchestration으로 필요한 정리를 실행한다
- **AND** 두 방향 Follow 관계·요청, Target이 Owner Post에 남긴 Reaction과 직접 원인 Notification이 required cleanup 완료 상태가 된다
- **AND** required cleanup 완료 전에는 Block action 성공 응답이나 성공 상태를 확정하지 않는다
- **AND** Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 유지한다

#### Scenario: orchestration 재시작과 일시 오류가 부분 성공을 만들지 않는다

- **WHEN** durable cleanup orchestration이 일시 오류나 worker 재시작으로 중단된다
- **THEN** 시스템은 기존 removal transition/effect-plan 계약에 따라 정리되지 않은 항목을 deterministic하게 재개한다
- **AND** 이미 처리한 항목을 중복 적용해 보존 대상 Repost·Bookmark·Notification을 변경하지 않는다
- **AND** required cleanup이 끝나기 전에는 Block action을 성공으로 확정하지 않는다

#### Scenario: 차단 해제는 정리된 관계를 복구하지 않는다

- **WHEN** Owner가 적용 중인 Profile Block을 해제한다
- **THEN** 시스템은 Profile Block 관계만 제거한다
- **AND** 차단 생성 때 제거된 Follow Request, Follow Relationship과 Reaction을 자동으로 재생성하지 않는다

### Requirement: Profile Block symmetric policy invariant

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`. 시스템은 저장된 Owner → Target Profile Block을 임의의 viewer·target pair 양쪽에 적용되는 공통 blocked predicate로 정규화해야 한다(MUST). 이 predicate가 true인 동안 모든 policy consumer는 차단 상태를 유지해야 하며(MUST), Profile Block 관계가 사라져도 차단 생성 중 제거된 관계·Reaction과 이미 생성된 로컬 상호작용을 자동으로 복구해서는 안 된다(MUST NOT).

#### Scenario: Block 방향과 무관하게 공통 predicate를 적용한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대를 대상으로 하나의 policy consumer를 실행한다
- **THEN** 시스템은 어느 요청 방향에서도 같은 pair를 blocked로 판정한다
- **AND** consumer가 Owner 방향만 검사해 반대 방향의 정책 결정을 우회하지 않는다

#### Scenario: 차단 해제 뒤 삭제된 상태를 복구하지 않는다

- **WHEN** Owner가 Profile Block을 해제한 뒤 양쪽 Profile이 새 요청을 실행한다
- **THEN** 시스템은 새 요청 시점의 현재 Block predicate와 다른 정책을 평가한다
- **AND** 차단 생성 때 제거된 Follow·Reaction이나 기존 상호작용을 자동으로 재생성하지 않는다

### Requirement: Profile Block GraphQL actor and policy boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-823`. 현재 GraphQL ingress는 검증된 Session의 selected Local Profile을 actor로 사용해 Profile Block 생성·해제와 Owner 차단 목록 조회를 제공해야 한다(MUST). GraphQL resolver·loader·Node 조회·connection은 중앙 application policy를 재사용해야 하며(MUST), 요청별 DB actor GUC·operation 전용 database session·client 전용 차단 필터로 권한이나 가시성을 대체해서는 안 된다(MUST NOT). 차단 목록은 selected Local Profile이 Owner인 관계만 반환해야 하며(MUST), Target Profile의 일반 조회 가능성을 우회해 관계 관리에 필요한 최소 식별 정보만 제공해야 한다(MUST). 이 GraphQL ingress 계약을 remote ActivityPub ingress에 적용하는 것은 이 change의 범위가 아니다(MUST NOT).

#### Scenario: selected Local Profile 없이 GraphQL Block operation을 실행하지 않는다

- **WHEN** 유효한 Session 또는 selected Local Profile이 없는 클라이언트가 Profile Block 생성·해제 또는 목록 GraphQL operation을 호출한다
- **THEN** 시스템은 대상 Profile 조회와 mutation을 수행하기 전에 기존 GraphQL 인증·권한 오류로 거부한다
- **AND** 다른 Profile의 Block 관계나 Target 식별 정보를 응답으로 노출하지 않는다

#### Scenario: selected Profile별 Owner 목록을 격리한다

- **WHEN** 한 Session에서 Owner A와 Owner B를 사용할 수 있고 selected Profile을 A에서 B로 전환해 각자의 차단 목록을 조회한다
- **THEN** 각 응답은 해당 시점의 selected Local Profile이 Owner인 Profile Block만 반환한다
- **AND** Owner A의 관계가 Owner B의 목록·mutation·Node 조회 결과에 섞이지 않는다

#### Scenario: GraphQL 직접 조회와 목록이 같은 Block policy를 사용한다

- **WHEN** GraphQL client가 Profile Node, Post connection, Media relation, Follow 후보 또는 Profile Block 목록을 같은 Block 관계에 대해 요청한다
- **THEN** 시스템은 요청 surface와 무관하게 동일한 양방향 Profile Block policy를 적용한다
- **AND** client가 숨겨진 결과를 후처리해 상대 Profile 또는 Post를 복원할 수 있는 payload를 반환하지 않는다
