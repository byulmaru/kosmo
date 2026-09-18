## ADDED Requirements

### Requirement: Profile Block lifecycle and owner-only relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `PROD-821`, `PROD-822`. 시스템은 Local 또는 Remote Owner Profile과 Target Profile 사이의 방향성 있는 Profile Block을 저장하고 생성·해제할 수 있어야 한다(MUST). Profile Block은 별도 상태나 만료를 갖지 않으며 관계의 존재가 적용 중인 차단을 뜻해야 한다(MUST). 도메인 capability는 ingress별 Account·Membership 상태나 Owner의 Local·Remote 유형을 일반 생성 조건으로 요구해서는 안 된다(MUST NOT). Owner와 Target이 서로 달라야 하며, 같은 조합의 관계가 없으면 새 관계를 만들고 이미 있으면 기존 관계를 성공 결과로 반환해야 한다(MUST). 해제는 `ProfileBlock.Owner`에 한정한 정확한 관계 ID만 대상으로 해야 하고(MUST), 관계 조회는 Owner에게만 허용해야 한다(MUST).

#### Scenario: Local·Remote Owner가 Local 또는 Remote Target을 차단한다

- **WHEN** ingress admission을 통과한 Local 또는 Remote Owner가 자신과 다른 Local 또는 Remote Target에 아직 없는 Profile Block을 생성한다
- **THEN** 시스템은 Owner → Target 방향의 Profile Block과 생성 시각을 저장한다
- **AND** 같은 Owner/Target 조합에 적용 중인 별도 상태·만료 행을 만들지 않는다
- **AND** Profile Block 관계는 Owner가 자신의 차단 목록에서 조회할 수 있다

#### Scenario: 동일한 Owner/Target 조합의 중복 저장을 막는다

- **WHEN** 같은 Owner/Target 조합에 이미 Profile Block이 있는 상태에서 다시 저장을 시도한다
- **THEN** 시스템은 기존 Profile Block 관계를 성공 결과로 반환하고 두 번째 Profile Block 행을 저장하지 않는다
- **AND** 기존 관계의 방향과 생성 시각을 바꾸지 않는다
- **AND** 이번 요청은 현재 Follow Request·Follow Relationship 또는 Notification을 새로 정리하지 않는다

#### Scenario: 권한 없는 Profile Block 해제를 거부한다

- **WHEN** Target Profile 또는 다른 Profile이 Owner의 Profile Block을 해제하려고 한다
- **THEN** 시스템은 `ProfileBlock.Owner` 권한을 통과시키지 않는다
- **AND** Profile Block 관계를 변경하지 않는다

### Requirement: Profile Block transaction cleanup and success relation

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Block policy/admission을 통과해 새 Profile Block 관계를 저장하는 경우에만 현재 양방향 Follow Request·Follow Relationship과 제거된 Follow 객체의 직접 원인 Notification을 같은 transaction에서 정리하고 commit해야 한다(MUST). commit된 Profile Block 관계가 Block action의 성공 결과이며(MUST), commit 뒤 effect의 성공·실패는 관계 성공을 바꾸지 않아야 한다(MUST NOT). 같은 Owner/Target 관계가 이미 있으면 기존 관계를 성공 결과로 관찰하고 새 cleanup을 실행하지 않아야 한다(MUST). 이미 관계가 존재한 뒤 동시성이나 후속 경로로 뒤늦게 관찰되는 Follow·Request·Notification은 Active Block 정책으로 처리해야 하며(MUST), duplicate Block이나 Unblock의 보상 cleanup으로 확장해서는 안 된다(MUST NOT). 기존 Reaction·Repost Post·Bookmark와 비직접 원인 기존 Notification 및 Read State는 이번 action에서 변경하지 않아야 한다(MUST). Unblock은 Owner가 지정한 정확한 Profile Block ID 관계만 제거해야 하며(MUST), Follow Request·Follow Relationship·Notification을 추가로 정리하거나 차단 생성 때 제거된 관계를 복구해서는 안 된다(MUST NOT).

#### Scenario: Block transaction이 현재 관계를 정리하고 성공 관계를 commit한다

- **WHEN** Owner가 새 Profile Block 관계를 만들도록 Block을 확정하고 양방향 Follow Request·Follow Relationship 또는 직접 원인 Notification 정리가 필요하다
- **THEN** 시스템은 Block policy/admission을 적용한 하나의 transaction에서 현재 두 방향 Follow 관계·요청과 직접 원인 Notification을 제거하고 Profile Block 관계를 commit한다
- **AND** commit된 Profile Block 관계를 Block action의 성공 결과로 반환한다
- **AND** 기존 Reaction·Repost Post·Bookmark와 직접 원인이 아닌 기존 Notification 및 Read State는 이번 action에서 유지한다

#### Scenario: Block transaction 실패는 관계 성공을 만들지 않는다

- **WHEN** Profile Block 관계 또는 같은 transaction의 현재 관계 정리가 실패한다
- **THEN** 시스템은 Profile Block 관계와 해당 transaction의 관계 정리를 commit하지 않고 Block action을 성공으로 반환하지 않는다
- **AND** 기존 Reaction·Repost Post·Bookmark와 비직접 원인 Notification·Read State는 변경하지 않는다

#### Scenario: 이미 존재하는 Profile Block을 duplicate가 관찰한다

- **WHEN** 같은 Owner/Target Profile Block 관계가 이미 commit된 상태에서 다시 Block action이 실행된다
- **THEN** 시스템은 기존 Profile Block 관계를 성공 결과로 반환한다
- **AND** 시스템은 현재 Follow Request·Follow Relationship·Notification을 새로 삭제하거나 새 cleanup을 소유하지 않는다

#### Scenario: 이미 존재하는 Block 뒤의 겹침은 Active Block 정책으로 처리한다

- **WHEN** Profile Block 관계가 이미 존재한 뒤 동시성이나 후속 경로로 Follow Request·Follow Relationship·Notification이 뒤늦게 관찰된다
- **THEN** 시스템은 해당 관계와 항목에 Active Block 표면 정책을 적용한다
- **AND** duplicate Block 관찰이나 Unblock이 이를 보상 cleanup으로 삭제하지 않는다

#### Scenario: commit 뒤 effect 실패는 Block 성공을 바꾸지 않는다

- **WHEN** Profile Block transaction이 commit된 뒤 별도 effect가 실패하거나 재시도된다
- **THEN** 시스템은 이미 commit된 Profile Block 관계를 성공 상태로 유지한다
- **AND** effect의 실패·재시도 결과를 Block relation success/failure로 다시 판정하지 않는다

#### Scenario: 차단 해제는 정확한 Profile Block ID 관계만 제거한다

- **WHEN** Owner가 적용 중인 Profile Block의 정확한 ID를 입력해 해제한다
- **THEN** 시스템은 Owner가 지정한 정확한 Profile Block ID 관계만 제거한다
- **AND** 시스템은 Follow Request·Follow Relationship·Notification을 추가로 정리하거나 차단 생성 때 제거된 Follow Request와 Follow Relationship을 자동으로 재생성하지 않는다

### Requirement: Profile Block applies the policy for each surface

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/objects/notification.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`. Profile Block은 저장 방향과 요청 surface를 함께 평가해야 한다(MUST). Profile Node·handle route·일반 Profile 검색은 기존 Profile 조회 정책을 적용하고, Post·Media 직접 조회는 viewer 방향에 따른 콘텐츠 정책을 적용하며, Home·Local·Hashtag Post List·Post 검색·Follow 후보·상호작용·Notification은 양쪽 Profile에 대한 보호 정책을 적용해야 한다(MUST). 각 surface는 기존 Visibility·Eligibility와 자체 lifecycle·권한 조건을 함께 적용해야 한다(MUST).

#### Scenario: Profile Block이 surface별 정책을 적용한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 Profile identity, 직접 콘텐츠, 탐색 목록, Follow 후보, interaction 또는 Notification을 요청한다
- **THEN** 시스템은 Profile identity에 기존 Profile 조회 정책을 적용한다
- **AND** 직접 Post·Media 조회에는 viewer 방향의 Profile Block 콘텐츠 정책을 적용한다
- **AND** 탐색 목록·Follow 후보·interaction·Notification에는 양방향 Profile Block 보호 정책을 적용한다

#### Scenario: 차단 해제 뒤 새 요청을 현재 정책으로 평가한다

- **WHEN** Owner가 Profile Block을 해제한 뒤 양쪽 Profile이 새 요청을 실행한다
- **THEN** 시스템은 새 요청 시점의 현재 Profile Block 관계와 각 surface의 기존 조회·상호작용 정책을 함께 평가한다
- **AND** 차단 생성 때 제거된 Follow Request와 Follow Relationship은 자동 복구하지 않는다

### Requirement: Profile Block GraphQL actor and policy boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-822`, `PROD-823`. 현재 GraphQL ingress는 검증된 Session의 selected Local Profile을 actor로 사용해 Profile Block 생성·해제와 Owner 차단 목록 조회를 제공해야 한다(MUST). GraphQL resolver·loader·Node 조회·connection은 중앙 application policy를 재사용해야 하며(MUST), 차단 목록은 selected Local Profile이 Owner인 관계만 반환해야 한다(MUST). Target Profile의 기본 정보는 기존 Profile 조회 정책으로 제공하고, Post·Media와 각 목록·상호작용·Notification은 해당 surface의 Profile Block 정책을 적용해야 한다(MUST). 이 GraphQL ingress 계약을 remote ActivityPub ingress에 적용하는 것은 이 change의 범위가 아니다(MUST NOT).

#### Scenario: selected Local Profile 없이 GraphQL Block operation을 실행하지 않는다

- **WHEN** 유효한 Session 또는 selected Local Profile이 없는 클라이언트가 Profile Block 생성·해제 또는 목록 GraphQL operation을 호출한다
- **THEN** 시스템은 대상 Profile 조회와 mutation을 수행하기 전에 기존 GraphQL 인증·권한 오류로 거부한다
- **AND** 다른 Profile의 Block 관계나 Target 식별 정보를 응답으로 노출하지 않는다

#### Scenario: selected Profile별 Owner 목록을 격리한다

- **WHEN** 한 Session에서 Owner A와 Owner B를 사용할 수 있고 selected Profile을 A에서 B로 전환해 각자의 차단 목록을 조회한다
- **THEN** 각 응답은 해당 시점의 selected Local Profile이 Owner인 Profile Block만 반환한다
- **AND** Owner A의 관계가 Owner B의 목록·mutation·Node 조회 결과에 섞이지 않는다

#### Scenario: GraphQL 각 surface가 해당 Profile Block 정책을 사용한다

- **WHEN** GraphQL client가 Profile Node, Post connection, Media relation, Follow 후보 또는 Profile Block 목록을 같은 Block 관계에 대해 요청한다
- **THEN** Profile Node는 기존 Profile 조회 정책을, Post·Media는 viewer 방향의 콘텐츠 정책을, Follow 후보는 양방향 보호 정책을 적용한다
- **AND** Profile Block 목록은 selected Local Profile이 Owner인 관계만 반환한다
